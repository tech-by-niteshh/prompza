require("./src/config/env");

const http = require("http");
const app = require("./src/app");
const { scheduleDailyTrendingReport } = require("./src/services/activitySummaryService");

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";

const server = http.createServer(app);

// ─── Uncaught Error Handlers (prevent silent crashes) ────────
process.on("uncaughtException", (error) => {
    console.error("UNCAUGHT EXCEPTION:", error.message);
    console.error(error.stack);
    // In production, try to shut down gracefully
    if (isProduction) {
        process.exit(1);
    }
});

process.on("unhandledRejection", (reason) => {
    console.error("UNHANDLED REJECTION:", reason);
});

// ─── Graceful Shutdown (Render sends SIGTERM before restart) ─
function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(() => {
        console.log("HTTP server closed.");
        process.exit(0);
    });

    // Force close after 10s if connections don't drain
    setTimeout(() => {
        console.warn("Forcing shutdown after timeout.");
        process.exit(1);
    }, 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ─── Schedule Cron (safe — won't crash if Telegram tokens missing) ─
scheduleDailyTrendingReport();

// ─── Start Server ────────────────────────────────────────────
server.listen(port, host, () => {
    console.log(`Prompza is running on http://${host}:${port}`);
    if (!isProduction) {
        console.log(`Open it locally at http://localhost:${port}`);
    }
});
