/**
 * In-memory IP-based rate limiter.
 * Tracks request counts per IP within a sliding window.
 * Automatically cleans up expired entries every 60 seconds.
 */

function createRateLimiter({ maxRequests = 5, windowMs = 15 * 60 * 1000, message = "Too many requests. Please try again later." } = {}) {
    const ipRequests = new Map();

    // Periodically clean up expired entries to prevent memory leaks
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of ipRequests.entries()) {
            if (now - entry.windowStart > windowMs) {
                ipRequests.delete(ip);
            }
        }
    }, 60 * 1000);

    // Prevent the timer from keeping the process alive
    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    return function rateLimiter(req, res, next) {
        const ip = req.requestContext?.ip || req.ip || "unknown";
        const now = Date.now();

        let entry = ipRequests.get(ip);

        if (!entry || now - entry.windowStart > windowMs) {
            entry = { count: 0, windowStart: now };
            ipRequests.set(ip, entry);
        }

        entry.count += 1;

        // Set rate limit headers
        res.set("X-RateLimit-Limit", String(maxRequests));
        res.set("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
        res.set("X-RateLimit-Reset", String(Math.ceil((entry.windowStart + windowMs) / 1000)));

        if (entry.count > maxRequests) {
            const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
            res.set("Retry-After", String(retryAfter));

            res.status(429).json({
                ok: false,
                error: message,
                retryAfterSeconds: retryAfter,
            });
            return;
        }

        next();
    };
}

module.exports = {
    createRateLimiter,
};
