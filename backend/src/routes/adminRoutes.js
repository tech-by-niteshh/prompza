const express = require("express");
const { getDashboardSummary, getPromptCategoryTotals, updateAdminPassword, deletePromptById } = require("../controllers/adminController");

const router = express.Router();

router.get("/summary", getDashboardSummary);
router.get("/categories", getPromptCategoryTotals);
router.post("/change-password", updateAdminPassword);
router.delete("/prompts/:id", deletePromptById);

module.exports = router;
