const { getTopLikedPrompts, sendDailyTrendingReport } = require("../services/activitySummaryService");

function isAuthorizedCronRequest(req) {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        return process.env.NODE_ENV !== "production";
    }

    return req.headers.authorization === `Bearer ${cronSecret}`;
}

async function runDailyTrendingReport(req, res, next) {
    if (!isAuthorizedCronRequest(req)) {
        res.status(401).json({
            ok: false,
            error: "Unauthorized cron request.",
        });
        return;
    }

    try {
        await sendDailyTrendingReport();
        const prompts = await getTopLikedPrompts();

        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            promptCount: prompts.length,
            prompts,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    runDailyTrendingReport,
};
