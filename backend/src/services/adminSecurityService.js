const crypto = require("crypto");
const { getAdminLoginAttemptsCollection, getAdminSessionsCollection, getAdminSettingsCollection } = require("./dbservices");
const { logEvent } = require("./loggerService");
const { notifyAdminLogin, notifyAdminFailedLogin, notifySuspiciousLogin } = require("./notificationService");

const ADMIN_SESSION_TTL_HOURS = Math.max(Number(process.env.ADMIN_SESSION_TTL_HOURS) || 12, 1);
const ADMIN_SUSPICIOUS_LOGIN_THRESHOLD = Math.max(Number(process.env.ADMIN_SUSPICIOUS_LOGIN_THRESHOLD) || 5, 2);
const FAILED_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const memorySessions = new Map();
const memoryAttempts = [];

function constantTimeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPasswordHash(password, passwordHash) {
    if (!passwordHash || !String(passwordHash).includes(":")) {
        return false;
    }

    const [salt, storedHash] = String(passwordHash).split(":");
    const derivedHash = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return constantTimeEqual(derivedHash, storedHash);
}

async function getStoredAdminCredentials() {
    try {
        const collection = await getAdminSettingsCollection();
        return collection.findOne({ key: "credentials" });
    } catch (_error) {
        return null;
    }
}

async function verifyAdminCredentials({ username, password }) {
    const storedCredentials = await getStoredAdminCredentials();

    if (storedCredentials && storedCredentials.passwordHash) {
        return constantTimeEqual(username, storedCredentials.username || "")
            && verifyPasswordHash(password, storedCredentials.passwordHash);
    }

    return false;
}

function cleanupExpiredMemorySessions() {
    const now = Date.now();

    for (const [key, value] of memorySessions.entries()) {
        if (new Date(value.expiresAt).getTime() <= now) {
            memorySessions.delete(key);
        }
    }
}

function cleanupOldAttempts() {
    const threshold = Date.now() - FAILED_LOGIN_WINDOW_MS;

    while (memoryAttempts.length && new Date(memoryAttempts[0].createdAt).getTime() < threshold) {
        memoryAttempts.shift();
    }
}

async function recordLoginAttempt({ username, success, reason, context, source = "api" }) {
    const attempt = {
        username,
        success,
        reason,
        source,
        ip: context.ip,
        userAgent: context.userAgent,
        createdAt: new Date(),
    };

    memoryAttempts.push(attempt);
    cleanupOldAttempts();

    try {
        const collection = await getAdminLoginAttemptsCollection();
        await collection.insertOne(attempt);
    } catch (_error) {
        // Memory fallback remains available if MongoDB is unavailable.
    }

    await logEvent({
        type: success ? "admin_login_success" : "admin_login_failed",
        level: success ? "info" : "warn",
        details: {
            username,
            ip: context.ip,
            userAgent: context.userAgent,
            reason,
            source,
        },
    });

    return attempt;
}

async function countRecentFailedAttempts({ username, ip }) {
    const since = new Date(Date.now() - FAILED_LOGIN_WINDOW_MS);

    try {
        const collection = await getAdminLoginAttemptsCollection();
        return collection.countDocuments({
            success: false,
            createdAt: { $gte: since },
            $or: [
                { username },
                { ip },
            ],
        });
    } catch (_error) {
        cleanupOldAttempts();

        return memoryAttempts.filter((attempt) => {
            if (attempt.success) {
                return false;
            }

            const createdAt = new Date(attempt.createdAt).getTime();
            return createdAt >= since.getTime() && (attempt.username === username || attempt.ip === ip);
        }).length;
    }
}

async function createAdminSession({ username, context }) {
    cleanupExpiredMemorySessions();

    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000));
    const session = {
        tokenHash: hashToken(token),
        username,
        ip: context.ip,
        userAgent: context.userAgent,
        createdAt: now,
        expiresAt,
    };

    memorySessions.set(session.tokenHash, session);

    try {
        const collection = await getAdminSessionsCollection();
        await collection.updateOne(
            { tokenHash: session.tokenHash },
            { $set: session },
            { upsert: true }
        );
    } catch (_error) {
        // Memory fallback remains available if MongoDB is unavailable.
    }

    return {
        token,
        expiresAt,
    };
}

async function verifyAdminSession(token) {
    if (!token) {
        return null;
    }

    cleanupExpiredMemorySessions();
    const tokenHash = hashToken(token);
    const memorySession = memorySessions.get(tokenHash);

    if (memorySession && new Date(memorySession.expiresAt).getTime() > Date.now()) {
        return memorySession;
    }

    try {
        const collection = await getAdminSessionsCollection();
        const session = await collection.findOne({
            tokenHash,
            expiresAt: { $gt: new Date() },
        });

        if (session) {
            memorySessions.set(tokenHash, session);
        }

        return session;
    } catch (_error) {
        return null;
    }
}

async function authenticateAdminLogin({ username, password, context, source = "api" }) {
    const isValid = await verifyAdminCredentials({ username, password });

    if (!isValid) {
        await recordLoginAttempt({
            username,
            success: false,
            reason: "invalid_credentials",
            context,
            source,
        });

        const failedCount = await countRecentFailedAttempts({
            username,
            ip: context.ip,
        });

        await notifyAdminFailedLogin({
            username,
            failedCount,
            reason: "invalid_credentials",
            context,
            source,
        });

        if (failedCount >= ADMIN_SUSPICIOUS_LOGIN_THRESHOLD) {
            await notifySuspiciousLogin({
                username,
                failedCount,
                reason: "multiple_failed_logins",
                context,
            });
        }

        return {
            ok: false,
            statusCode: 401,
            error: "Invalid admin username or password.",
            failedCount,
        };
    }

    const failedCount = await countRecentFailedAttempts({
        username,
        ip: context.ip,
    });
    const session = await createAdminSession({ username, context });

    await recordLoginAttempt({
        username,
        success: true,
        reason: "authenticated",
        context,
        source,
    });

    await notifyAdminLogin({
        username,
        context,
        failedCount,
        suspicious: failedCount >= ADMIN_SUSPICIOUS_LOGIN_THRESHOLD,
        source,
    });

    return {
        ok: true,
        username,
        session,
        suspicious: failedCount >= ADMIN_SUSPICIOUS_LOGIN_THRESHOLD,
        failedCount,
    };
}

async function changeAdminPassword({ username, oldPassword, newPassword, context }) {
    if (!newPassword || String(newPassword).length < 6) {
        return {
            ok: false,
            statusCode: 400,
            error: "New password must be at least 6 characters long.",
        };
    }

    const isValid = await verifyAdminCredentials({
        username,
        password: oldPassword,
    });

    if (!isValid) {
        await recordLoginAttempt({
            username,
            success: false,
            reason: "invalid_old_password_for_change",
            context,
            source: "password_change",
        });

        await notifyAdminFailedLogin({
            username,
            failedCount: 1,
            reason: "invalid_old_password_for_change",
            context,
            source: "password_change",
        });

        return {
            ok: false,
            statusCode: 401,
            error: "Old password is incorrect.",
        };
    }

    try {
        const collection = await getAdminSettingsCollection();
        await collection.updateOne(
            { key: "credentials" },
            {
                $set: {
                    key: "credentials",
                    username,
                    passwordHash: hashPassword(newPassword),
                    updatedAt: new Date(),
                },
            },
            { upsert: true }
        );
    } catch (_error) {
        return {
            ok: false,
            statusCode: 500,
            error: "Failed to update admin password.",
        };
    }

    await logEvent({
        type: "admin_password_changed",
        details: {
            username,
            ip: context.ip,
            userAgent: context.userAgent,
        },
    });

    return {
        ok: true,
    };
}

module.exports = {
    authenticateAdminLogin,
    changeAdminPassword,
    getStoredAdminCredentials,
    verifyAdminCredentials,
    verifyAdminSession,
};
