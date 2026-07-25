/**
 * Minimal semaphore. Caps how many audits run at once regardless of how
 * many requests arrive, so a burst can't exhaust outbound sockets / CPU.
 * Kept dependency-free on purpose — it's ~30 lines and easy to reason about.
 */
class ConcurrencyLimiter {
  constructor(maxConcurrent) {
    this.max = maxConcurrent;
    this.active = 0;
    this.queue = [];
  }

  get pending() {
    return this.queue.length;
  }

  async run(fn) {
    if (this.active >= this.max) {
      await new Promise((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

module.exports = { ConcurrencyLimiter };
