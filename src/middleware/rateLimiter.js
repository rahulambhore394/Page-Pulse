const rateLimit = require('express-rate-limit');
const { Errors } = require('../lib/errors');

/**
 * Per-client rate limit. Keys on an API client identifier if provided
 * (X-Client-Id header) so authenticated integrations get their own bucket;
 * falls back to IP for anonymous callers.
 */
function buildRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-client-id'] || req.ip,
    handler: (req, res, next) => next(Errors.rateLimited()),
  });
}

module.exports = { buildRateLimiter };
