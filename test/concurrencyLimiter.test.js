const { ConcurrencyLimiter } = require('../src/lib/concurrencyLimiter');

test('never runs more than `max` tasks at once', async () => {
  const limiter = new ConcurrencyLimiter(2);
  let active = 0;
  let maxObserved = 0;

  const task = () =>
    limiter.run(async () => {
      active++;
      maxObserved = Math.max(maxObserved, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
    });

  await Promise.all([task(), task(), task(), task(), task()]);
  expect(maxObserved).toBeLessThanOrEqual(2);
});

test('queued tasks eventually all complete', async () => {
  const limiter = new ConcurrencyLimiter(1);
  const order = [];
  await Promise.all([
    limiter.run(async () => order.push('a')),
    limiter.run(async () => order.push('b')),
    limiter.run(async () => order.push('c')),
  ]);
  expect(order.sort()).toEqual(['a', 'b', 'c']);
});
