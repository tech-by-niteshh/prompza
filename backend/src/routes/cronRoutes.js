const express = require("express");
const { runDailyTrendingReport } = require("../controllers/cronController");

const router = express.Router();

router.get("/api/cron/nightly-trending", runDailyTrendingReport);

module.exports = router;
