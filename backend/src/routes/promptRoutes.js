const express = require("express");
const { createPrompt, listPrompts, listTrendingPrompts, searchPrompts, likePrompt, getPromptById } = require("../controllers/promptController");

const router = express.Router();

router.get("/", listPrompts);
router.get("/trending", listTrendingPrompts);
router.get("/search", searchPrompts);
router.post("/", createPrompt);
router.post("/:id/like", likePrompt);
router.get("/:id", getPromptById);

module.exports = router;
