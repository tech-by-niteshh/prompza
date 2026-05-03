const { getCollection } = require("./dbservices");
const { logEvent } = require("./loggerService");
const { notifySuspiciousActivity } = require("./notificationService");

const LIKE_SPIKE_THRESHOLD = 10;
const LIKE_SPIKE_WINDOW_MINUTES = 5;
const RAPID_IP_THRESHOLD = 20;
const RAPID_IP_WINDOW_MINUTES = 10;

async function getLikeEventsCollection() {
    const collection = await getCollection("like_events");
    return collection;
}

async function getSuspiciousActivitiesCollection() {
    const collection = await getCollection("suspicious_activities");
    return collection;
}

async function recordLikeEvent(promptId, ip, userAgent) {
    try {
        const collection = await getLikeEventsCollection();
        await collection.insertOne({
            promptId: String(promptId),
            ip: ip || "unknown",
            userAgent: userAgent || "unknown",
            createdAt: new Date(),
        });
    } catch (_error) {
        // Non-blocking: analytics should not break the like flow.
    }
}

async function detectLikeSpike(promptId, promptTitle, ip) {
    const flags = [];

    try {
        const collection = await getLikeEventsCollection();
        const now = new Date();

        // Check 1: Same IP liking same post too many times in a short window
        const spikeWindow = new Date(now.getTime() - LIKE_SPIKE_WINDOW_MINUTES * 60 * 1000);
        const samePostCount = await collection.countDocuments({
            promptId: String(promptId),
            ip,
            createdAt: { $gte: spikeWindow },
        });

        if (samePostCount >= LIKE_SPIKE_THRESHOLD) {
            flags.push({
                type: "like_spike",
                reason: `${samePostCount} likes on same post from same IP in ${LIKE_SPIKE_WINDOW_MINUTES} minutes`,
                metadata: { likesInWindow: samePostCount, windowMinutes: LIKE_SPIKE_WINDOW_MINUTES },
            });
        }

        // Check 2: Same IP sending too many likes across all posts
        const rapidWindow = new Date(now.getTime() - RAPID_IP_WINDOW_MINUTES * 60 * 1000);
        const totalIpLikes = await collection.countDocuments({
            ip,
            createdAt: { $gte: rapidWindow },
        });

        if (totalIpLikes >= RAPID_IP_THRESHOLD) {
            flags.push({
                type: "rapid_ip",
                reason: `${totalIpLikes} total likes from same IP in ${RAPID_IP_WINDOW_MINUTES} minutes`,
                metadata: { likesInWindow: totalIpLikes, windowMinutes: RAPID_IP_WINDOW_MINUTES },
            });
        }
    } catch (_error) {
        // Non-blocking: detection failure should not affect normal operations.
    }

    // Save and alert for each flag
    for (const flag of flags) {
        try {
            const suspiciousCollection = await getSuspiciousActivitiesCollection();
            await suspiciousCollection.insertOne({
                type: flag.type,
                postId: String(promptId),
                postTitle: promptTitle || "Unknown",
                reason: flag.reason,
                ip: ip || "unknown",
                metadata: flag.metadata,
                resolved: false,
                createdAt: new Date(),
            });

            await notifySuspiciousActivity({
                postId: promptId,
                postTitle: promptTitle,
                reason: flag.reason,
                ip,
            });

            await logEvent({
                type: "suspicious_activity_detected",
                level: "warn",
                details: {
                    flagType: flag.type,
                    promptId,
                    ip,
                    reason: flag.reason,
                },
            });
        } catch (_error) {
            // Log failure should not break flow.
        }
    }

    return flags;
}

async function getSuspiciousCountSince(since) {
    try {
        const collection = await getSuspiciousActivitiesCollection();
        return await collection.countDocuments({
            createdAt: { $gte: since },
        });
    } catch (_error) {
        return 0;
    }
}

module.exports = {
    recordLikeEvent,
    detectLikeSpike,
    getSuspiciousCountSince,
};
