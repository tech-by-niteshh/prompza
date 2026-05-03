const fs = require("fs");
const path = require("path");

/**
 * Loads environment variables from the backend/.env file.
 *
 * On Render, environment variables are injected directly into process.env
 * by the platform — this function only applies locally where a .env file exists.
 *
 * Existing process.env values are NEVER overwritten, so Render's injected
 * variables always take priority.
 */

const envPath = path.join(__dirname, "..", "..", ".env");

function stripWrappingQuotes(value) {
    if (!value) {
        return value;
    }

    const first = value[0];
    const last = value[value.length - 1];

    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return value.slice(1, -1);
    }

    return value;
}

function loadEnvFile() {
    if (!fs.existsSync(envPath)) {
        // No .env file — expected in production (Render, etc.)
        return;
    }

    const file = fs.readFileSync(envPath, "utf8");
    const lines = file.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separatorIndex = trimmed.indexOf("=");

        if (separatorIndex <= 0) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1).trim());

        // Never overwrite existing env vars (Render-injected values take priority)
        if (!key || process.env[key] !== undefined) {
            continue;
        }

        process.env[key] = value;
    }
}

loadEnvFile();

// ─── Validate critical env vars at startup ────────────────────
const requiredVars = ["MONGODB_URI"];
const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(", ")}`);
    console.error("Set these in Render's Environment tab or in backend/.env for local dev.");
    process.exit(1);
}

module.exports = {
    loadEnvFile,
};
