const { getMessagesCollection } = require("../services/dbservices");
const { logEvent } = require("../services/loggerService");
const { notifyContactRequest } = require("../services/notificationService");

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 2000;

function sanitizeString(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

async function sendMessage(req, res, next) {
    try {
        const activityType = sanitizeString(req.body.activityType || "user_message", 50);
        const name = sanitizeString(req.body.name, MAX_NAME_LENGTH);
        const email = sanitizeString(req.body.email, MAX_EMAIL_LENGTH).toLowerCase();
        const message = sanitizeString(req.body.message, MAX_MESSAGE_LENGTH);
        const source = sanitizeString(req.body.source || "website", 50);
        const metadata = req.body.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};

        if (!message) {
            res.status(400).json({
                ok: false,
                error: "message is required.",
            });
            return;
        }

        if (message.length < 3) {
            res.status(400).json({
                ok: false,
                error: "Message must be at least 3 characters long.",
            });
            return;
        }

        const payload = {
            activityType,
            name,
            email,
            message,
            source,
            metadata,
            ip: req.requestContext.ip,
            userAgent: req.requestContext.userAgent,
            createdAt: new Date(),
        };

        let messageId = null;

        try {
            const collection = await getMessagesCollection();
            const result = await collection.insertOne(payload);
            messageId = result.insertedId;
        } catch (_error) {
            // Continue with notification flow even when MongoDB is unavailable.
        }

        await logEvent({
            type: "activity_message_sent",
            details: {
                activityType,
                name,
                email,
                source,
                ip: req.requestContext.ip,
            },
        });

        await notifyContactRequest({
            name,
            email,
            message,
            source,
            context: req.requestContext,
        });

        res.status(201).json({
            ok: true,
            message: "Activity message sent successfully.",
            activityId: messageId,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    sendMessage,
};
