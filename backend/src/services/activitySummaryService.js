const { getPromptCollection } = require("./dbservices");
const { logEvent } = require("./loggerService");
const { notifyDailyTrendingReport } = require("./notificationService");
const { getSuspiciousCountSince } = require("./suspiciousDetectionService");

const TRENDING_LIMIT = 20;
let scheduledTimer = null;

const imagePromptCategories = [
    "Image Generation",
    "Character Design",
    "Product Mockup",
    "Poster Design",
    "Social Media Creative",
    "Architecture",
    "Fashion",
    "Photography",
];

const normalPromptFilter = {
    $and: [
        { category: { $nin: imagePromptCategories } },
        {
            $or: [
                { contentType: { $exists: false } },
                { contentType: { $ne: "image" } },
            ],
        },
        {
            $or: [
                { imageUrl: { $exists: false } },
                { imageUrl: "" },
                { imageUrl: null },
            ],
        },
    ],
};

async function getTopLikedPrompts(limit = TRENDING_LIMIT) {
    const collection = await getPromptCollection();
    const prompts = await collection
        .find(normalPromptFilter)
        .sort({ likes: -1, createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();

    return prompts.map((prompt) => ({
        _id: prompt._id,
        title: prompt.title || "Untitled Prompt",
        category: prompt.category || "General",
        likes: Number(prompt.likes || 0),
    }));
}

async function sendDailyTrendingReport() {
    try {
        const prompts = await getTopLikedPrompts(TRENDING_LIMIT);
        const generatedAt = new Date().toISOString();

        // Count suspicious activities from last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const suspiciousCount = await getSuspiciousCountSince(oneDayAgo);

        await notifyDailyTrendingReport({
            prompts,
            suspiciousCount,
            generatedAt,
        });

        await logEvent({
            type: "daily_trending_report_sent",
            details: {
                generatedAt,
                promptCount: prompts.length,
                suspiciousCount,
            },
        });
    } catch (error) {
        await logEvent({
            type: "daily_trending_report_failed",
            level: "error",
            details: {
                error: error.message,
            },
        });
    }
}

function getMillisecondsUntilNoon() {
    const now = new Date();
    const nextNoon = new Date(now);
    nextNoon.setHours(12, 0, 0, 0);

    // If it's already past noon today, schedule for tomorrow
    if (now >= nextNoon) {
        nextNoon.setDate(nextNoon.getDate() + 1);
    }

    return Math.max(nextNoon.getTime() - now.getTime(), 1000);
}

function scheduleDailyTrendingReport() {
    if (scheduledTimer) {
        clearTimeout(scheduledTimer);
    }

    const delay = getMillisecondsUntilNoon();
    const nextRunTime = new Date(Date.now() + delay);

    console.log(`📊 Trending report scheduled for: ${nextRunTime.toLocaleString()}`);

    scheduledTimer = setTimeout(async () => {
        await sendDailyTrendingReport();
        scheduleDailyTrendingReport();
    }, delay);
}

module.exports = {
    getTopLikedPrompts,
    sendDailyTrendingReport,
    scheduleDailyTrendingReport,
};
