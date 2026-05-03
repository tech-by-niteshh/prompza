const { getPromptCollection, getImagePromptCollection } = require("../services/dbservices");
const { logEvent } = require("../services/loggerService");

const ACTIVITY_BOT_TOKEN = process.env.ACTIVITY_BOT_TOKEN;

async function sendBotReply(chatId, text) {
    if (!ACTIVITY_BOT_TOKEN) {
        return;
    }

    try {
        await fetch(`https://api.telegram.org/bot${ACTIVITY_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: "HTML",
            }),
        });
    } catch (error) {
        console.error("Failed to send bot reply:", error.message);
    }
}

function truncate(text, maxLength) {
    if (!text) {
        return "";
    }

    return text.length > maxLength ? text.slice(0, maxLength) + "…" : text;
}

async function handleActivityBotWebhook(req, res) {
    try {
        const update = req.body;

        // Only handle text messages
        if (!update || !update.message || !update.message.text) {
            res.json({ ok: true });
            return;
        }

        const chatId = update.message.chat.id;
        const userText = update.message.text.trim();

        // Ignore bot commands like /start
        if (userText.startsWith("/")) {
            if (userText === "/start") {
                await sendBotReply(chatId, [
                    "👋 <b>Welcome to Prompza Search Bot!</b>",
                    "",
                    "Send me a <b>prompt title</b> and I'll find matching prompts with their IDs.",
                    "",
                    "💡 <b>Example:</b> Type <i>marketing email</i> to search for prompts with that title.",
                ].join("\n"));
            }

            res.json({ ok: true });
            return;
        }

        // Search for prompts by title (case-insensitive partial match)
        const promptCollection = await getPromptCollection();
        const imagePromptCollection = await getImagePromptCollection();

        const searchRegex = { $regex: userText, $options: "i" };

        const [textPrompts, imagePrompts] = await Promise.all([
            promptCollection
                .find({ title: searchRegex })
                .sort({ createdAt: -1 })
                .limit(10)
                .toArray(),
            imagePromptCollection
                .find({ title: searchRegex })
                .sort({ createdAt: -1 })
                .limit(10)
                .toArray(),
        ]);

        const allResults = [
            ...textPrompts.map((p) => ({ ...p, source: "text" })),
            ...imagePrompts.map((p) => ({ ...p, source: "image" })),
        ];

        if (allResults.length === 0) {
            await sendBotReply(chatId, [
                `🔍 <b>No prompts found</b> matching "<i>${userText}</i>"`,
                "",
                "Try a different title or keyword.",
            ].join("\n"));

            res.json({ ok: true });
            return;
        }

        const lines = [
            `🔍 Found <b>${allResults.length}</b> prompt(s) matching "<i>${userText}</i>"`,
            "",
        ];

        allResults.forEach((prompt, index) => {
            const id = String(prompt._id);
            const title = prompt.title || "Untitled";
            const category = prompt.category || "General";
            const type = prompt.source === "image" ? "🖼 Image" : "📝 Text";
            const likes = Number(prompt.likes || 0);
            const goal = truncate(prompt.goal || "", 120);

            lines.push(`━━━ ${index + 1}. ${type} ━━━`);
            lines.push(`📌 <b>Title:</b> ${title}`);
            lines.push(`🆔 <b>ID:</b> <code>${id}</code>`);
            lines.push(`📂 <b>Category:</b> ${category}`);
            lines.push(`❤️ <b>Likes:</b> ${likes}`);

            if (goal) {
                lines.push(`📝 <b>Prompt:</b> ${goal}`);
            }

            lines.push("");
        });

        lines.push("💡 <i>Copy the ID to use it in the admin dashboard for deletion.</i>");

        await sendBotReply(chatId, lines.join("\n"));

        await logEvent({
            type: "bot_prompt_search",
            details: {
                query: userText,
                resultsFound: allResults.length,
                chatId,
            },
        });

        res.json({ ok: true });
    } catch (error) {
        console.error("Activity bot webhook error:", error);
        res.status(200).json({ ok: true });
    }
}

module.exports = {
    handleActivityBotWebhook,
};
