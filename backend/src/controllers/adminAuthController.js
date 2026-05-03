const { authenticateAdminLogin } = require("../services/adminSecurityService");

async function loginAdmin(req, res, next) {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!username || !password) {
            res.status(400).json({
                ok: false,
                error: "Username and password are required.",
            });
            return;
        }

        const result = await authenticateAdminLogin({
            username,
            password,
            context: req.requestContext,
            source: "api",
        });

        if (!result.ok) {
            res.status(result.statusCode).json({
                ok: false,
                error: result.error,
                suspicious: result.failedCount >= 3,
                failedAttempts: result.failedCount,
            });
            return;
        }

        res.json({
            ok: true,
            message: "Admin login successful.",
            admin: {
                username: result.username,
            },
            token: result.session.token,
            expiresAt: result.session.expiresAt,
            suspicious: result.suspicious,
            recentFailedAttempts: result.failedCount,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    loginAdmin,
};
