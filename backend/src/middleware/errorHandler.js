const { logEvent } = require("../services/loggerService");

function errorHandler(error, req, res, _next) {
    const statusCode = Number(error.statusCode || error.status || 500);
    const message = error.expose ? error.message : (statusCode >= 500 ? "Internal server error." : error.message);

    Promise.resolve(logEvent({
        type: "api_error",
        level: "error",
        details: {
            message: error.message,
            statusCode,
            path: req.originalUrl,
            method: req.method,
            ip: req.requestContext?.ip || req.ip || "unknown",
        },
    })).catch(() => {});

    res.status(statusCode).json({
        ok: false,
        error: message,
    });
}

module.exports = {
    errorHandler,
};
