const crypto = require("crypto");
const { getUsersCollection } = require("../services/dbservices");
const { logEvent } = require("../services/loggerService");
const { notifyUserRegistered } = require("../services/notificationService");

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

async function registerUser(req, res, next) {
    try {
        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!name || !email || !password) {
            res.status(400).json({
                ok: false,
                error: "name, email, and password are required.",
            });
            return;
        }

        if (!isValidEmail(email)) {
            res.status(400).json({
                ok: false,
                error: "A valid email address is required.",
            });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({
                ok: false,
                error: "Password must be at least 6 characters long.",
            });
            return;
        }

        const collection = await getUsersCollection();
        const existingUser = await collection.findOne({ email });

        if (existingUser) {
            res.status(409).json({
                ok: false,
                error: "A user with this email already exists.",
            });
            return;
        }

        const userDocument = {
            name,
            email,
            passwordHash: hashPassword(password),
            ip: req.requestContext.ip,
            userAgent: req.requestContext.userAgent,
            createdAt: new Date(),
        };

        const result = await collection.insertOne(userDocument);

        await logEvent({
            type: "user_registered",
            details: {
                userId: result.insertedId,
                email,
                ip: req.requestContext.ip,
            },
        });

        await notifyUserRegistered({
            userId: String(result.insertedId),
            name,
            email,
            context: req.requestContext,
        });

        res.status(201).json({
            ok: true,
            message: "User registered successfully.",
            user: {
                id: result.insertedId,
                name,
                email,
            },
        });
    } catch (error) {
        if (error && error.code === 11000) {
            res.status(409).json({
                ok: false,
                error: "A user with this email already exists.",
            });
            return;
        }

        next(error);
    }
}

module.exports = {
    registerUser,
};
