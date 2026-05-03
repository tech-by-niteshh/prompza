const { ObjectId } = require("mongodb");
const { getPromptCollection } = require("../services/dbservices");
const { recordLikeEvent, detectLikeSpike } = require("../services/suspiciousDetectionService");

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

function normalizeKeywords(value) {
    if (Array.isArray(value)) {
        return value
            .map((keyword) => String(keyword || "").trim().toLowerCase())
            .filter(Boolean);
    }

    return String(value || "")
        .split(",")
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean);
}

function normalizePromptPayload(body = {}) {
    const contentType = String(body.contentType || "text").trim().toLowerCase();
    const imageUrl = String(body.imageUrl || "").trim();
    const goal = String(body.goal || "").trim();

    return {
        title: String(body.title || "").trim(),
        category: String(body.category || "").trim(),
        goal,
        tone: String(body.tone || "").trim(),
        keywords: normalizeKeywords(body.keywords),
        contentType: contentType === "image" ? "image" : "text",
        imageUrl,
    };
}

function serializePrompt(prompt = {}) {
    return {
        ...prompt,
        likes: Number(prompt.likes || 0),
    };
}

function validatePrompt(payload) {
    if (payload.contentType === "image") {
        return "Use the image prompt upload endpoint for image prompts.";
    }

    if (!payload.title) {
        return "Prompt title is required.";
    }

    if (!payload.category) {
        return "Prompt category is required.";
    }

    if (!payload.goal) {
        return "Prompt goal is required.";
    }

    return null;
}

async function createPrompt(req, res) {
    try {
        const payload = normalizePromptPayload(req.body);
        const validationError = validatePrompt(payload);

        if (validationError) {
            res.status(400).json({ ok: false, error: validationError });
            return;
        }

        const collection = await getPromptCollection();
        const promptDocument = {
            ...payload,
            likes: 0,
            createdAt: new Date(),
        };

        const result = await collection.insertOne(promptDocument);

        res.status(201).json({
            ok: true,
            message: "Prompt saved successfully.",
            prompt: serializePrompt({
                _id: result.insertedId,
                ...promptDocument,
            }),
        });
    } catch (error) {
        console.error("Failed to create prompt:", error);
        res.status(500).json({ ok: false, error: "Failed to save prompt." });
    }
}

async function listPrompts(_req, res) {
    try {
        const collection = await getPromptCollection();
        const prompts = await collection
            .find(normalPromptFilter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(50)
            .toArray();

        res.json({ ok: true, prompts: prompts.map(serializePrompt) });
    } catch (error) {
        console.error("Failed to fetch prompts:", error);
        res.status(500).json({ ok: false, error: "Failed to fetch prompts." });
    }
}

async function listTrendingPrompts(req, res) {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 20);
        const collection = await getPromptCollection();
        const prompts = await collection
            .find(normalPromptFilter)
            .sort({ likes: -1, createdAt: -1, _id: -1 })
            .limit(limit)
            .toArray();

        res.json({
            ok: true,
            prompts: prompts.map(serializePrompt),
        });
    } catch (error) {
        console.error("Failed to fetch trending prompts:", error);
        res.status(500).json({ ok: false, error: "Failed to fetch trending prompts." });
    }
}

async function searchPrompts(req, res) {
    try {
        const query = String(req.query.q || "").trim();

        if (!query) {
            res.json({ ok: true, query: "", prompts: [] });
            return;
        }

        const keywords = query
            .split(/\s+/)
            .map((keyword) => keyword.trim())
            .map((keyword) => keyword.toLowerCase())
            .filter(Boolean);

        const collection = await getPromptCollection();
        const prompts = await collection
            .find({
                $and: [
                    normalPromptFilter,
                    {
                        $or: [
                            { title: { $regex: query, $options: "i" } },
                            { category: { $regex: query, $options: "i" } },
                            { goal: { $regex: query, $options: "i" } },
                            { tone: { $regex: query, $options: "i" } },
                            { keywords: { $elemMatch: { $regex: query, $options: "i" } } },
                        ],
                    },
                ],
            })
            .toArray();

        const rankedPrompts = prompts
            .map((prompt) => {
                const promptKeywords = Array.isArray(prompt.keywords)
                    ? prompt.keywords.map((keyword) => String(keyword).toLowerCase())
                    : [];
                const title = String(prompt.title || "").toLowerCase();
                const category = String(prompt.category || "").toLowerCase();
                const goal = String(prompt.goal || "").toLowerCase();
                const tone = String(prompt.tone || "").toLowerCase();

                let score = 0;

                if (promptKeywords.includes(query.toLowerCase())) {
                    score += 100;
                }

                for (const keyword of keywords) {
                    if (promptKeywords.includes(keyword)) {
                        score += 40;
                    }

                    if (title.includes(keyword)) {
                        score += 20;
                    }

                    if (category.includes(keyword)) {
                        score += 15;
                    }

                    if (tone.includes(keyword)) {
                        score += 10;
                    }

                    if (goal.includes(keyword)) {
                        score += 8;
                    }
                }

                return {
                    ...serializePrompt(prompt),
                    matchedKeywords: promptKeywords.filter((keyword) => keywords.includes(keyword) || keyword === query.toLowerCase()),
                    score,
                };
            })
            .sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }

                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            })
            .slice(0, 24);

        res.json({
            ok: true,
            query,
            keywords,
            prompts: rankedPrompts.map(serializePrompt),
        });
    } catch (error) {
        console.error("Failed to search prompts:", error);
        res.status(500).json({ ok: false, error: "Failed to search prompts." });
    }
}

async function likePrompt(req, res) {
    try {
        const { id } = req.params;
        const ip = req.requestContext?.ip || req.ip || "unknown";
        const userAgent = req.requestContext?.userAgent || req.headers["user-agent"] || "unknown";
        const collection = await getPromptCollection();
        const result = await collection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $inc: { likes: 1 } },
            {
                returnDocument: "after",
                includeResultMetadata: false,
            }
        );

        if (!result) {
            res.status(404).json({ ok: false, error: "Prompt not found." });
            return;
        }

        // Record like event and detect suspicious activity (non-blocking)
        recordLikeEvent(id, ip, userAgent).catch(() => {});
        detectLikeSpike(id, result.title || "Untitled", ip).catch(() => {});

        res.json({
            ok: true,
            message: "Prompt liked successfully.",
            prompt: serializePrompt(result),
        });
    } catch (error) {
        console.error("Failed to like prompt:", error);
        res.status(500).json({ ok: false, error: "Failed to like prompt." });
    }
}

async function getPromptById(req, res) {
    try {
        const { id } = req.params;
        const collection = await getPromptCollection();
        const prompt = await collection.findOne({ _id: new ObjectId(id) });

        if (!prompt) {
            res.status(404).json({ ok: false, error: "Prompt not found." });
            return;
        }

        res.json({ ok: true, prompt: serializePrompt(prompt) });
    } catch (error) {
        console.error("Failed to fetch prompt:", error);
        res.status(500).json({ ok: false, error: "Failed to fetch prompt." });
    }
}

module.exports = {
    createPrompt,
    listPrompts,
    listTrendingPrompts,
    searchPrompts,
    likePrompt,
    getPromptById,
};
