const NodeCache = require('node-cache');

/**
 * Repeat audits of the same URL within CACHE_TTL_SECONDS are served from
 * cache instead of refetching the target site. TTL is configurable via
 * env var so ops can tune it without a code change.
 */
function createAuditCache(ttlSeconds) {
  const cache = new NodeCache({
    stdTTL: ttlSeconds,
    checkperiod: Math.max(30, Math.floor(ttlSeconds / 4)),
    useClones: false,
  });

  return {
    get(url) {
      return cache.get(url);
    },
    set(url, value) {
      cache.set(url, value);
    },
    stats() {
      return cache.getStats();
    },
    flush() {
      cache.flushAll();
    },
  };
}

module.exports = { createAuditCache };
