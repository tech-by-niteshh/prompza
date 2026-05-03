const { logEvent } = require("./loggerService");

// Read env vars at call time (not module load time) for Render compatibility
function getBotConfig(botName) {
    const registry = {
        adminAlert: {
            token: process.env.ADMIN_ALERT_BOT_TOKEN,
            chatId: process.env.ADMIN_ALERT_CHAT_ID,
        },
        request: {
            token: process.env.REQUEST_BOT_TOKEN,
            chatId: process.env.REQUEST_BOT_CHAT_ID,
        },
        trendingAnalytics: {
            token: process.env.ACTIVITY_BOT_TOKEN,
            chatId: process.env.ACTIVITY_BOT_CHAT_ID,
        },
    };

    return registry[botName] || null;
}

function prettifyLabel(label) {
    return String(label)
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^./, (character) => character.toUpperCase());
}

function formatNotificationMessage(title, fields = {}) {
    const lines = [title];

    Object.entries(fields).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
            return;
        }

        if (typeof value === "object") {
            lines.push(`${prettifyLabel(key)}: ${JSON.stringify(value)}`);
            return;
        }

        lines.push(`${prettifyLabel(key)}: ${value}`);
    });

    return lines.join("\n");
}

async function sendTelegramMessage(botName, text, options = {}) {
    const config = getBotConfig(botName);

    if (!config || !config.token || !config.chatId) {
        await logEvent({
            type: "telegram_skipped",
            level: "warn",
            details: {
                botName,
                reason: "missing_bot_token_or_chat_id",
            },
        });

        return {
            ok: false,
            skipped: true,
            error: "Telegram bot token or chat id is missing.",
        };
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                chat_id: config.chatId,
                text,
                parse_mode: "HTML",
                ...options,
            }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.description || "Telegram API sendMessage failed.");
        }

        await logEvent({
            type: "telegram_sent",
            details: {
                botName,
            },
        });

        return {
            ok: true,
            data,
        };
    } catch (error) {
        await logEvent({
            type: "telegram_failed",
            level: "error",
            details: {
                botName,
                error: error.message,
            },
        });

        return {
            ok: false,
            error: error.message,
        };
    }
}

module.exports = {
    formatNotificationMessage,
    sendTelegramMessage,
};
