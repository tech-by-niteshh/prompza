const fs = require("fs");
const path = require("path");
const { verifyAdminSession, verifyAdminCredentials } = require("../services/adminSecurityService");
const { notifyAdminFailedLogin, notifyAdminLogin } = require("../services/notificationService");

const ADMIN_ACCESS_LOG = path.join(__dirname, "..", "logs", "admin-access.log");
let adminLogDirCreated = false;

function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];

    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || "unknown";
}

function buildRequestInfo(req) {
    return {
        time: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        host: req.headers.host || "unknown",
        ip: getClientIp(req),
        origin: req.headers.origin || "direct",
        referer: req.headers.referer || "direct",
        userAgent: req.headers["user-agent"] || "unknown",
    };
}

function writeAdminAccessLog(requestInfo, result, reason) {
    const logLine =
        `[ADMIN_ACCESS_${result}] ${requestInfo.time} | ${requestInfo.method} ${requestInfo.path} | ` +
        `ip=${requestInfo.ip} | host=${requestInfo.host} | origin=${requestInfo.origin} | ` +
        `referer=${requestInfo.referer} | userAgent=${requestInfo.userAgent} | reason=${reason}\n`;

    try {
        if (!adminLogDirCreated) {
            fs.mkdirSync(path.dirname(ADMIN_ACCESS_LOG), { recursive: true });
            adminLogDirCreated = true;
        }

        // Non-blocking async write
        fs.appendFile(ADMIN_ACCESS_LOG, logLine, "utf8", () => {});
    } catch (_error) {
        // Silently ignore — expected on ephemeral filesystems (Render)
    }

    console.log(logLine.trim());
}

function trackAdminPanelAccess(req, _res, next) {
    req.requestInfo = buildRequestInfo(req);

    next();
}

async function requireAdminAuth(req, res, next) {
    const requestInfo = req.requestInfo || buildRequestInfo(req);
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Basic ")) {
        writeAdminAccessLog(requestInfo, "FAILED", "missing_credentials");
        res.set("WWW-Authenticate", 'Basic realm="Prompza Admin"');
        res.status(401).send("You failed to access the admin panel.");
        return;
    }

    const encoded = authHeader.slice(6).trim();
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
    const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

    const valid = await verifyAdminCredentials({ username, password });

    if (!valid) {
        writeAdminAccessLog(requestInfo, "FAILED", "invalid_credentials");
        await notifyAdminFailedLogin({
            username,
            password,
            context: requestInfo,
            source: "dashboard_basic_auth",
            reason: "invalid_credentials",
        });
        res.set("WWW-Authenticate", 'Basic realm="Prompza Admin"');
        res.status(401).send("You failed to access the admin panel.");
        return;
    }

    writeAdminAccessLog(requestInfo, "SUCCESS", "authenticated");
    req.adminSession = {
        username,
        source: "dashboard_basic_auth",
    };
    await notifyAdminLogin({
        username,
        context: requestInfo,
        failedCount: 0,
        suspicious: false,
        source: "dashboard_basic_auth",
    });
    next();
}

async function requireAdminApiAccess(req, res, next) {
    const authorization = req.headers.authorization || "";

    if (authorization.startsWith("Bearer ")) {
        const token = authorization.slice(7).trim();
        const session = await verifyAdminSession(token);

        if (!session) {
            writeAdminAccessLog(req.requestInfo || buildRequestInfo(req), "FAILED", "invalid_session_token");
            res.status(401).json({
                ok: false,
                error: "Invalid or expired admin session.",
            });
            return;
        }

        req.adminSession = session;
        next();
        return;
    }

    requireAdminAuth(req, res, next);
}

module.exports = {
    trackAdminPanelAccess,
    requireAdminAuth,
    requireAdminApiAccess,
};
