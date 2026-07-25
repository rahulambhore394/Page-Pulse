const express = require('express');
const path = require('path');
const { requestId, httpLogger } = require('./middleware/requestContext');
const { buildRateLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { ConcurrencyLimiter } = require('./lib/concurrencyLimiter');
const { createAuditCache } = require('./lib/cache');
const { validateAndResolveUrl } = require('./lib/validateUrl');
const { auditUrl } = require('./lib/audit');
const { Errors } = require('./lib/errors');

function createApp(config = {}) {
  const {
    timeoutMs = Number(process.env.AUDIT_TIMEOUT_MS) || 8000,
    maxConcurrent = Number(process.env.MAX_CONCURRENT_AUDITS) || 20,
    cacheTtlSeconds = Number(process.env.CACHE_TTL_SECONDS) || 300,
    rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 30,
  } = config;

  const app = express();
  const cache = createAuditCache(cacheTtlSeconds);
  const limiter = new ConcurrencyLimiter(maxConcurrent);

  app.use(requestId);
  app.use(httpLogger);
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      cache: cache.stats(),
      activeAudits: limiter.active,
      queuedAudits: limiter.pending,
    });
  });

  const auditRateLimiter = buildRateLimiter({ windowMs: rateLimitWindowMs, max: rateLimitMax });

  app.post('/api/audit', auditRateLimiter, async (req, res, next) => {
    try {
      const rawUrl = req.body && req.body.url;
      const url = await validateAndResolveUrl(rawUrl);

      const cached = cache.get(url);
      if (cached) {
        return res.json({ ...cached, cache: { hit: true } });
      }

      if (limiter.pending > maxConcurrent * 5) {
        // Queue is already many multiples deep — fail fast instead of
        // letting requests pile up indefinitely under sustained overload.
        throw Errors.tooManyConcurrent();
      }

      const result = await limiter.run(() => auditUrl(url, { timeoutMs, log: req.log }));
      cache.set(url, result);
      res.json({ ...result, cache: { hit: false } });
    } catch (err) {
      next(err);
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, cache, limiter };
}

module.exports = { createApp };
