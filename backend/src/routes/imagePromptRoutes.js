const express = require("express");
const { createImagePrompt, listImagePrompts, searchImagePrompts, streamImagePromptImage } = require("../controllers/imagePromptController");

const router = express.Router();

router.get("/", listImagePrompts);
router.get("/search", searchImagePrompts);
router.post("/", createImagePrompt);
router.get("/:id/image", streamImagePromptImage);

module.exports = router;
