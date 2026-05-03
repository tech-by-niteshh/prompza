const express = require("express");
const cors = require("cors");
const path = require("path");
const promptRoutes = require("./routes/promptRoutes");
const imagePromptRoutes = require("./routes/imagePromptRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const requestRoutes = require("./routes/requestRoutes");
const activityRoutes = require("./routes/activityRoutes");
const userRoutes = require("./routes/userRoutes");
const cronRoutes = require("./routes/cronRoutes");
const { captureRequestContext } = require("./middleware/requestContextMiddleware");
const { errorHandler } = require("./middleware/errorHandler");
const { trackAdminPanelAccess, requireAdminAuth, requireAdminApiAccess } = require("./middleware/authMiddleware");
const { createRateLimiter } = require("./middleware/rateLimiter");
const { handleActivityBotWebhook } = require("./controllers/telegramBotController");

const app = express();
const rootDir = path.resolve(__dirname, "..", "..");
const frontendDir = path.join(rootDir, "frontend");
const frontendPagesDir = path.join(frontendDir, "pages");

const pageMap = {
    "/": "index.html",
    "/index": "index.html",
    "/index.html": "index.html",
    "/image": "image.html",
    "/image.html": "image.html",
    "/about": "about.html",
    "/about.html": "about.html",
    "/privacy": "privacy.html",
    "/privacy.html": "privacy.html",
    "/contact": "contact.html",
    "/contact.html": "contact.html",
    "/compose": "compose.html",
    "/compose.html": "compose.html",
    "/dashboard": "dashboard.html",
    "/dashboard.html": "dashboard.html",
    "/trending": "trending.html",
    "/trending.html": "trending.html",
    "/post": "post.html",
    "/post.html": "post.html",
};

// ─── Rate Limiters ───────────────────────────────────────────
const contactRateLimiter = createRateLimiter({
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many contact submissions. Please try again in 15 minutes.",
});

const likeRateLimiter = createRateLimiter({
    maxRequests: 30,
    windowMs: 5 * 60 * 1000,
    message: "Too many like requests. Please slow down.",
});

// ─── Global Middleware ───────────────────────────────────────
app.set("trust proxy", true);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(captureRequestContext);

// ─── Admin Protected Routes ─────────────────────────────────
const protectedAdminPagePaths = [
    "/dashboard",
    "/dashboard.html",
    "/frontend/pages/dashboard.html",
];

app.use(protectedAdminPagePaths, trackAdminPanelAccess, requireAdminAuth);
app.use("/api/admin", trackAdminPanelAccess, requireAdminApiAccess, adminRoutes);
app.use(cronRoutes);
app.use(adminAuthRoutes);

// ─── Rate Limited Routes ────────────────────────────────────
app.use("/submit-request", contactRateLimiter);
app.use("/send-message", contactRateLimiter);

app.use(requestRoutes);
app.use(activityRoutes);
app.use(userRoutes);

// ─── Static Files (ONLY frontend directory, not entire project) ─
app.use("/frontend", express.static(frontendDir, {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
    etag: true,
    lastModified: true,
}));

app.use("/api/image-prompts", imagePromptRoutes);

// Apply rate limiting to like endpoint
app.post("/api/prompts/:id/like", likeRateLimiter);

app.use("/api/prompts", promptRoutes);

// ─── Health Check ────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        app: "prompza",
        env: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
    });
});

// ─── Page Routes ─────────────────────────────────────────────
Object.entries(pageMap).forEach(([route, fileName]) => {
    app.get(route, (_req, res) => {
        res.sendFile(path.join(frontendPagesDir, fileName));
    });
});

// ─── Telegram Bot Webhook (safe — only registers if token exists) ─
const activityBotToken = process.env.ACTIVITY_BOT_TOKEN;
if (activityBotToken) {
    app.post(`/webhook/activity-bot/${activityBotToken}`, handleActivityBotWebhook);
}

// ─── Error Handler ───────────────────────────────────────────
app.use(errorHandler);

// ─── 404 Fallback ────────────────────────────────────────────
app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
        res.status(404).json({ error: "Not found" });
        return;
    }

    res.status(404).sendFile(path.join(frontendPagesDir, "index.html"));
});

module.exports = app;
