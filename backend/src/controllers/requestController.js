const { getRequestsCollection } = require("../services/dbservices");
const { logEvent } = require("../services/loggerService");
const { notifyPromptRequest } = require("../services/notificationService");

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_REQUEST_TYPE_LENGTH = 100;

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeString(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

async function submitRequest(req, res, next) {
    try {
        const name = sanitizeString(req.body.name, MAX_NAME_LENGTH);
        const requestType = sanitizeString(req.body.requestType, MAX_REQUEST_TYPE_LENGTH);
        const email = sanitizeString(req.body.email, MAX_EMAIL_LENGTH).toLowerCase();
        const message = sanitizeString(req.body.message, MAX_MESSAGE_LENGTH);
        const source = sanitizeString(req.body.source || "website", 50);

        if (!requestType || !email || !message) {
            res.status(400).json({
                ok: false,
                error: "requestType, email, and message are required.",
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

        if (message.length < 5) {
            res.status(400).json({
                ok: false,
                error: "Message must be at least 5 characters long.",
            });
            return;
        }

        const payload = {
            name,
            requestType,
            email,
            message,
            source,
            ip: req.requestContext.ip,
            userAgent: req.requestContext.userAgent,
            createdAt: new Date(),
        };

        let requestId = null;

        try {
            const collection = await getRequestsCollection();
            const result = await collection.insertOne(payload);
            requestId = result.insertedId;
        } catch (_error) {
            // Continue so Telegram alerts still work even if MongoDB is unavailable.
        }

        await logEvent({
            type: "request_submitted",
            details: {
                name,
                requestType,
                email,
                source,
                ip: req.requestContext.ip,
            },
        });

        await notifyPromptRequest({
            name,
            requestType,
            email,
            message,
            source,
            context: req.requestContext,
        });

        res.status(201).json({
            ok: true,
            message: "Request submitted successfully.",
            requestId,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    submitRequest,
};
