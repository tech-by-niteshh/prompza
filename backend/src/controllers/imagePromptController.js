const { Readable } = require("stream");
const { ObjectId } = require("mongodb");
const { getImagePromptBucket, getImagePromptCollection } = require("../services/dbservices");

const dataUrlPattern = /^data:image\/(png|jpe?g|webp|gif);base64,([a-z0-9+/=\s]+)$/i;
const mimeTypeByExtension = {
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
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

function normalizeImagePromptPayload(body = {}) {
    return {
        title: String(body.title || "").trim(),
        category: String(body.category || "Image Generation").trim(),
        imagePrompt: String(body.imagePrompt || body.goal || "").trim(),
        keywords: normalizeKeywords(body.keywords),
        imageData: String(body.imageData || body.imageUrl || "").trim(),
    };
}

function serializeImagePrompt(prompt = {}) {
    const id = String(prompt._id || "");

    return {
        _id: id,
        title: prompt.title || "",
        category: prompt.category || "Image Generation",
        imagePrompt: prompt.imagePrompt || "",
        keywords: Array.isArray(prompt.keywords) ? prompt.keywords : [],
        imageId: prompt.imageId ? String(prompt.imageId) : "",
        imageUrl: id ? `/api/image-prompts/${encodeURIComponent(id)}/image` : "",
        createdAt: prompt.createdAt,
    };
}

function validateImagePayload(payload) {
    if (!payload.title) {
        return "Image prompt title is required.";
    }

    if (!payload.imagePrompt) {
        return "Image prompt text is required.";
    }

    if (!payload.imageData) {
        return "Image file is required.";
    }

    if (!dataUrlPattern.test(payload.imageData)) {
        return "Image upload format is invalid.";
    }

    return null;
}

function parseImageDataUrl(value) {
    const match = String(value || "").trim().match(dataUrlPattern);

    if (!match) {
        throw new Error("Image upload format is invalid.");
    }

    const extension = match[1].toLowerCase().replace("jpeg", "jpg");
    const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    const contentType = mimeTypeByExtension[extension] || "image/jpeg";

    if (!buffer.length) {
        throw new Error("Uploaded image is empty.");
    }

    if (buffer.length > 8 * 1024 * 1024) {
        throw new Error("Uploaded image must be 8MB or smaller.");
    }

    return {
        buffer,
        contentType,
        extension,
    };
}

function uploadBufferToGridFs(bucket, buffer, filename, metadata) {
    return new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: metadata.contentType,
            metadata,
        });

        uploadStream.on("error", reject);
        uploadStream.on("finish", () => resolve(uploadStream.id));
        Readable.from(buffer).pipe(uploadStream);
    });
}

async function createImagePrompt(req, res) {
    try {
        const payload = normalizeImagePromptPayload(req.body);
        const validationError = validateImagePayload(payload);

        if (validationError) {
            res.status(400).json({ ok: false, error: validationError });
            return;
        }

        const image = parseImageDataUrl(payload.imageData);
        const bucket = await getImagePromptBucket();
        const imageId = await uploadBufferToGridFs(
            bucket,
            image.buffer,
            `${Date.now()}-${payload.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "image-prompt"}.${image.extension}`,
            {
                contentType: image.contentType,
                title: payload.title,
                category: payload.category,
            }
        );

        const promptDocument = {
            title: payload.title,
            category: payload.category,
            imagePrompt: payload.imagePrompt,
            keywords: payload.keywords,
            imageId,
            imageContentType: image.contentType,
            createdAt: new Date(),
        };

        const collection = await getImagePromptCollection();
        const result = await collection.insertOne(promptDocument);

        res.status(201).json({
            ok: true,
            message: "Image prompt saved successfully.",
            prompt: serializeImagePrompt({
                _id: result.insertedId,
                ...promptDocument,
            }),
        });
    } catch (error) {
        console.error("Failed to create image prompt:", error);
        res.status(500).json({ ok: false, error: "Failed to save image prompt." });
    }
}

async function listImagePrompts(_req, res) {
    try {
        const collection = await getImagePromptCollection();
        const prompts = await collection
            .find({})
            .sort({ createdAt: -1, _id: -1 })
            .limit(50)
            .toArray();

        res.json({ ok: true, prompts: prompts.map(serializeImagePrompt) });
    } catch (error) {
        console.error("Failed to fetch image prompts:", error);
        res.status(500).json({ ok: false, error: "Failed to fetch image prompts." });
    }
}

async function searchImagePrompts(req, res) {
    try {
        const query = String(req.query.q || "").trim();

        if (!query) {
            res.json({ ok: true, query: "", prompts: [] });
            return;
        }

        const keywords = query
            .split(/\s+/)
            .map((keyword) => keyword.trim().toLowerCase())
            .filter(Boolean);

        const collection = await getImagePromptCollection();
        const prompts = await collection
            .find({
                $or: [
                    { title: { $regex: query, $options: "i" } },
                    { category: { $regex: query, $options: "i" } },
                    { imagePrompt: { $regex: query, $options: "i" } },
                    { keywords: { $elemMatch: { $regex: query, $options: "i" } } },
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
                const imagePrompt = String(prompt.imagePrompt || "").toLowerCase();
                let score = 0;

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

                    if (imagePrompt.includes(keyword)) {
                        score += 8;
                    }
                }

                return {
                    ...serializeImagePrompt(prompt),
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
            prompts: rankedPrompts.map((prompt) => {
                const { score, ...serializedPrompt } = prompt;
                return serializedPrompt;
            }),
        });
    } catch (error) {
        console.error("Failed to search image prompts:", error);
        res.status(500).json({ ok: false, error: "Failed to search image prompts." });
    }
}

async function streamImagePromptImage(req, res) {
    try {
        const collection = await getImagePromptCollection();
        const prompt = await collection.findOne({ _id: new ObjectId(req.params.id) });

        if (!prompt || !prompt.imageId) {
            res.status(404).json({ ok: false, error: "Image prompt not found." });
            return;
        }

        const bucket = await getImagePromptBucket();
        const files = await bucket.find({ _id: prompt.imageId }).limit(1).toArray();
        const file = files[0];

        if (!file) {
            res.status(404).json({ ok: false, error: "Image file not found." });
            return;
        }

        res.setHeader("Content-Type", file.contentType || prompt.imageContentType || "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        bucket.openDownloadStream(prompt.imageId).pipe(res);
    } catch (error) {
        console.error("Failed to stream image prompt image:", error);
        res.status(500).json({ ok: false, error: "Failed to load image." });
    }
}

module.exports = {
    createImagePrompt,
    listImagePrompts,
    searchImagePrompts,
    streamImagePromptImage,
};
