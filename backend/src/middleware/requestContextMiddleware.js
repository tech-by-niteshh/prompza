function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];

    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }

    const realIp = req.headers["x-real-ip"];

    if (typeof realIp === "string" && realIp.trim()) {
        return realIp.trim();
    }

    return req.ip || req.socket?.remoteAddress || "unknown";
}

function buildRequestContext(req) {
    return {
        timestamp: new Date().toISOString(),
        ip: getClientIp(req),
        method: req.method,
        path: req.originalUrl || req.url,
        host: req.headers.host || "unknown",
        origin: req.headers.origin || "direct",
        referer: req.headers.referer || "direct",
        userAgent: req.headers["user-agent"] || "unknown",
    };
}

function captureRequestContext(req, _res, next) {
    req.requestContext = buildRequestContext(req);
    next();
}

module.exports = {
    getClientIp,
    buildRequestContext,
    captureRequestContext,
};
