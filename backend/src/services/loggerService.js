const fs = require("fs");
const path = require("path");
const { getActivityLogsCollection } = require("./dbservices");

const applicationLogPath = path.join(__dirname, "..", "logs", "application.log");
let logsDirectoryCreated = false;

function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch (_error) {
        return JSON.stringify({ serializationError: true });
    }
}

async function persistLogToDatabase(entry) {
    try {
        const collection = await getActivityLogsCollection();
        await collection.insertOne(entry);
    } catch (_error) {
        // File logging remains the reliable fallback when MongoDB is unavailable.
    }
}

/**
 * Writes a log line to disk asynchronously (non-blocking).
 * In production (Render), the filesystem is ephemeral — this acts
 * as a local debug aid only. MongoDB is the persistent log store.
 */
function writeLogToFile(line) {
    try {
        if (!logsDirectoryCreated) {
            fs.mkdirSync(path.dirname(applicationLogPath), { recursive: true });
            logsDirectoryCreated = true;
        }

        fs.appendFile(applicationLogPath, line, "utf8", () => {});
    } catch (_error) {
        // Silently ignore file write failures (expected on ephemeral filesystems).
    }
}

async function logEvent({ type, level = "info", details = {} }) {
    const entry = {
        type,
        level,
        details,
        createdAt: new Date(),
    };

    const line = `[${entry.createdAt.toISOString()}] [${level.toUpperCase()}] ${type} ${safeStringify(details)}\n`;

    // Non-blocking file write (directory created once)
    writeLogToFile(line);

    // Primary persistent storage
    await persistLogToDatabase(entry);
    return entry;
}

module.exports = {
    logEvent,
};
