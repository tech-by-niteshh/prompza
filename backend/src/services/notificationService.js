const { formatNotificationMessage, sendTelegramMessage } = require("./telegramService");

function getContextFields(context = {}) {
    return {
        ipAddress: context.ip,
        deviceInfo: context.userAgent,
        timestamp: context.timestamp || context.time || new Date().toISOString(),
    };
}

// ─── ADMIN_ALERT_BOT ────────────────────────────────────────────────

async function notifyAdminLogin(payload) {
    return sendTelegramMessage("adminAlert", formatNotificationMessage("🔐 Admin Login Success", {
        username: payload.username,
        ...getContextFields(payload.context),
        suspicious: payload.suspicious ? "Yes" : "No",
        recentFailedAttempts: payload.failedCount,
        source: payload.source || "api",
    }));
}

async function notifySuspiciousLogin(payload) {
    return sendTelegramMessage("adminAlert", formatNotificationMessage("🚨 Suspicious Admin Login Attempts", {
        username: payload.username,
        ...getContextFields(payload.context),
        failedAttempts: payload.failedCount,
        reason: payload.reason,
    }));
}

async function notifyAdminFailedLogin(payload) {
    return sendTelegramMessage("adminAlert", formatNotificationMessage("❌ Failed Admin Login Attempt", {
        attemptedUsername: payload.username,
        attemptedPassword: payload.password,
        ipAddress: payload.context && payload.context.ip,
        deviceInfo: payload.context && payload.context.userAgent,
        timestamp: payload.context && (payload.context.timestamp || payload.context.time),
        source: payload.source || "admin_panel",
        reason: payload.reason || "invalid_credentials",
        recentFailedAttempts: payload.failedCount,
    }));
}

async function notifyUserRegistered(payload) {
    return sendTelegramMessage("adminAlert", formatNotificationMessage("👤 New User Registration", {
        name: payload.name,
        email: payload.email,
        userId: payload.userId,
        ...getContextFields(payload.context),
    }));
}

// ─── REQUEST_BOT ────────────────────────────────────────────────────

async function notifyContactRequest(payload) {
    const timestamp = new Date().toISOString();

    const message = [
        "📩 New Contact Request",
        "",
        `👤 Name: ${payload.name || "Anonymous"}`,
        `📧 Email: ${payload.email || "Not provided"}`,
        `📝 Message: ${payload.message || "No message"}`,
        `⏰ Time: ${timestamp}`,
    ].join("\n");

    return sendTelegramMessage("request", message);
}

async function notifyPromptRequest(payload) {
    const timestamp = new Date().toISOString();

    const message = [
        "📩 Prompt Request Submitted",
        "",
        `👤 Name: ${payload.name || "Anonymous"}`,
        `📧 Email: ${payload.email || "Not provided"}`,
        `📂 Type: ${payload.requestType || "General"}`,
        `📝 Message: ${payload.message || "No details"}`,
        `🌐 Source: ${payload.source || "website"}`,
        `⏰ Time: ${timestamp}`,
    ].join("\n");

    return sendTelegramMessage("request", message);
}

// ─── TRENDING_ANALYTICS_BOT ─────────────────────────────────────────

async function notifyDailyTrendingReport(payload) {
    const prompts = Array.isArray(payload.prompts) ? payload.prompts : [];
    const suspiciousCount = Number(payload.suspiciousCount || 0);
    const highestPost = prompts.length ? prompts[0] : null;
    const appUrl = process.env.PUBLIC_APP_URL || "";

    const promptLines = prompts.length
        ? prompts.map((prompt, index) => `  ${index + 1}. ${prompt.title} (${prompt.likes} likes)`).join("\n")
        : "  No liked prompts available.";

    const message = [
        "📊 Trending Report",
        "",
        `🔥 Top Posts Updated: ${prompts.length}`,
        `📈 Highest Likes Post: ${highestPost ? `${highestPost.title} (${highestPost.likes} likes)` : "None"}`,
        `⚠️ Suspicious Activities: ${suspiciousCount}`,
        `⏰ Time: ${payload.generatedAt || new Date().toISOString()}`,
        "",
        "── Top Posts ──",
        promptLines,
    ].join("\n");

    const replyMarkup = appUrl ? {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📊 View Trending", url: `${appUrl}/trending` },
                    { text: "🔧 Dashboard", url: `${appUrl}/dashboard` },
                ],
            ],
        },
    } : {};

    return sendTelegramMessage("trendingAnalytics", message, replyMarkup);
}

async function notifySuspiciousActivity(payload) {
    const message = [
        "⚠️ Suspicious Activity Detected",
        "",
        `Post ID: ${payload.postId || "N/A"}`,
        `Post Title: ${payload.postTitle || "Unknown"}`,
        `Reason: ${payload.reason || "Unknown reason"}`,
        `IP: ${payload.ip || "Unknown"}`,
        `⏰ Time: ${new Date().toISOString()}`,
    ].join("\n");

    return sendTelegramMessage("trendingAnalytics", message);
}

module.exports = {
    notifyAdminLogin,
    notifyAdminFailedLogin,
    notifySuspiciousLogin,
    notifyUserRegistered,
    notifyContactRequest,
    notifyPromptRequest,
    notifyDailyTrendingReport,
    notifySuspiciousActivity,
};
