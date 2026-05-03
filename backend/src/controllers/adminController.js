const { ObjectId } = require("mongodb");
const { getPromptCollection, getImagePromptCollection, getImagePromptBucket, getRequestsCollection, getMessagesCollection, getUsersCollection } = require("../services/dbservices");
const { changeAdminPassword, getStoredAdminCredentials } = require("../services/adminSecurityService");
const { logEvent } = require("../services/loggerService");

async function getDashboardSummary(_req, res) {
    try {
        const collection = await getPromptCollection();
        const requestsCollection = await getRequestsCollection();
        const messagesCollection = await getMessagesCollection();
        const usersCollection = await getUsersCollection();
        const [totalPrompts, totalRequests, totalMessages, totalUsers, latestPrompts] = await Promise.all([
            collection.countDocuments(),
            requestsCollection.countDocuments(),
            messagesCollection.countDocuments(),
            usersCollection.countDocuments(),
            collection
                .find({})
                .sort({ createdAt: -1, _id: -1 })
                .limit(8)
                .toArray(),
        ]);

        res.json({
            ok: true,
            summary: {
                totalPrompts,
                totalRequests,
                totalMessages,
                totalUsers,
                latestPrompts,
            },
        });
    } catch (error) {
        console.error("Failed to load admin summary:", error);
        res.status(500).json({ ok: false, error: "Failed to load admin summary." });
    }
}

async function getPromptCategoryTotals(_req, res) {
    try {
        const collection = await getPromptCollection();
        const totals = await collection.aggregate([
            {
                $group: {
                    _id: {
                        $ifNull: [
                            {
                                $cond: [
                                    { $eq: ["$category", ""] },
                                    "General",
                                    "$category",
                                ],
                            },
                            "General",
                        ],
                    },
                    totalPrompts: { $sum: 1 },
                },
            },
            { $sort: { totalPrompts: -1, _id: 1 } },
        ]).toArray();

        res.json({
            ok: true,
            categories: totals.map((item) => ({
                category: item._id || "General",
                totalPrompts: item.totalPrompts,
            })),
        });
    } catch (error) {
        console.error("Failed to load category totals:", error);
        res.status(500).json({ ok: false, error: "Failed to load category totals." });
    }
}

async function updateAdminPassword(req, res) {
    try {
        const storedCredentials = await getStoredAdminCredentials();
        const username = (req.adminSession && req.adminSession.username) || (storedCredentials && storedCredentials.username);
        const oldPassword = String(req.body.oldPassword || "");
        const newPassword = String(req.body.newPassword || "");

        if (!username) {
            res.status(400).json({
                ok: false,
                error: "Admin credentials are not configured in MongoDB.",
            });
            return;
        }

        if (!oldPassword || !newPassword) {
            res.status(400).json({
                ok: false,
                error: "oldPassword and newPassword are required.",
            });
            return;
        }

        const result = await changeAdminPassword({
            username,
            oldPassword,
            newPassword,
            context: req.requestContext,
        });

        if (!result.ok) {
            res.status(result.statusCode).json({
                ok: false,
                error: result.error,
            });
            return;
        }

        res.json({
            ok: true,
            message: "Admin password updated successfully.",
        });
    } catch (error) {
        console.error("Failed to update admin password:", error);
        res.status(500).json({ ok: false, error: "Failed to update admin password." });
    }
}

async function deletePromptById(req, res) {
    try {
        const { id } = req.params;

        if (!id || !ObjectId.isValid(id)) {
            res.status(400).json({ ok: false, error: "A valid prompt ID is required." });
            return;
        }

        const objectId = new ObjectId(id);
        const promptCollection = await getPromptCollection();

        // Try deleting from the text prompts collection first
        let result = await promptCollection.findOneAndDelete({ _id: objectId });

        if (result) {
            await logEvent({
                type: "prompt_deleted",
                details: {
                    promptId: id,
                    title: result.title || "Unknown",
                    source: "text_prompts",
                },
            });

            res.json({
                ok: true,
                message: `Prompt "${result.title || id}" deleted permanently.`,
                deletedFrom: "prompts",
            });
            return;
        }

        // Try deleting from the image prompts collection
        const imagePromptCollection = await getImagePromptCollection();
        result = await imagePromptCollection.findOneAndDelete({ _id: objectId });

        if (result) {
            // Also clean up any associated GridFS file
            if (result.imageFileId) {
                try {
                    const bucket = await getImagePromptBucket();
                    await bucket.delete(new ObjectId(result.imageFileId));
                } catch (gridFsError) {
                    console.error("Failed to delete GridFS image file:", gridFsError.message);
                }
            }

            await logEvent({
                type: "prompt_deleted",
                details: {
                    promptId: id,
                    title: result.title || "Unknown",
                    source: "image_prompts",
                },
            });

            res.json({
                ok: true,
                message: `Image prompt "${result.title || id}" deleted permanently.`,
                deletedFrom: "image_prompts",
            });
            return;
        }

        res.status(404).json({ ok: false, error: "No prompt found with the given ID." });
    } catch (error) {
        console.error("Failed to delete prompt:", error);
        res.status(500).json({ ok: false, error: "Failed to delete prompt." });
    }
}

module.exports = {
    getDashboardSummary,
    getPromptCategoryTotals,
    updateAdminPassword,
    deletePromptById,
};
