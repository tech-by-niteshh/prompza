const { GridFSBucket, MongoClient, ServerApiVersion } = require("mongodb");

let client;
let database;
const ensuredIndexes = new Set();

async function getDatabase() {
    if (database) {
        return database;
    }

    // Read at connect time, not module load time — ensures env vars are available
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || "prompza";

    if (!uri) {
        throw new Error("MONGODB_URI is not configured.");
    }

    if (!client) {
        client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
            // Connection pool settings for production
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });

        // Handle connection errors gracefully
        client.on("error", (error) => {
            console.error("MongoDB client error:", error.message);
        });
    }

    await client.connect();
    database = client.db(dbName);

    console.log(`MongoDB connected to database: ${dbName}`);
    return database;
}

async function getPromptCollection() {
    return getCollection("prompts");
}

async function getImagePromptCollection() {
    await ensureCollectionIndexes("image_prompts", [
        [{ createdAt: -1 }, {}],
        [{ category: 1 }, {}],
        [{ keywords: 1 }, {}],
    ]);
    return getCollection("image_prompts");
}

async function getImagePromptBucket() {
    const db = await getDatabase();
    return new GridFSBucket(db, { bucketName: "image_prompt_uploads" });
}

async function getCollection(name) {
    const db = await getDatabase();
    return db.collection(name);
}

async function ensureCollectionIndexes(name, definitions) {
    if (ensuredIndexes.has(name)) {
        return;
    }

    const collection = await getCollection(name);

    await Promise.all(definitions.map((definition) => {
        const [keys, options] = definition;
        return collection.createIndex(keys, options);
    }));

    ensuredIndexes.add(name);
}

async function getUsersCollection() {
    await ensureCollectionIndexes("users", [
        [{ email: 1 }, { unique: true }],
        [{ createdAt: -1 }, {}],
    ]);
    return getCollection("users");
}

async function getRequestsCollection() {
    await ensureCollectionIndexes("requests", [
        [{ createdAt: -1 }, {}],
        [{ email: 1 }, {}],
    ]);
    return getCollection("requests");
}

async function getMessagesCollection() {
    await ensureCollectionIndexes("messages", [
        [{ createdAt: -1 }, {}],
        [{ activityType: 1 }, {}],
    ]);
    return getCollection("messages");
}

async function getActivityLogsCollection() {
    await ensureCollectionIndexes("activity_logs", [
        [{ createdAt: -1 }, {}],
        [{ type: 1 }, {}],
    ]);
    return getCollection("activity_logs");
}

async function getAdminLoginAttemptsCollection() {
    await ensureCollectionIndexes("admin_login_attempts", [
        [{ createdAt: -1 }, {}],
        [{ ip: 1, username: 1 }, {}],
        [{ success: 1, createdAt: -1 }, {}],
    ]);
    return getCollection("admin_login_attempts");
}

async function getAdminSessionsCollection() {
    await ensureCollectionIndexes("admin_sessions", [
        [{ tokenHash: 1 }, { unique: true }],
        [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
    ]);
    return getCollection("admin_sessions");
}

async function getAdminSettingsCollection() {
    await ensureCollectionIndexes("admin_settings", [
        [{ key: 1 }, { unique: true }],
    ]);
    return getCollection("admin_settings");
}

module.exports = {
    getDatabase,
    getCollection,
    getPromptCollection,
    getImagePromptCollection,
    getImagePromptBucket,
    getUsersCollection,
    getRequestsCollection,
    getMessagesCollection,
    getActivityLogsCollection,
    getAdminLoginAttemptsCollection,
    getAdminSessionsCollection,
    getAdminSettingsCollection,
};
