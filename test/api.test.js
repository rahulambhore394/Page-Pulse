const request = require('supertest');
const dns = require('dns');
const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');
const { createApp } = require('../src/app');

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Example Domain</title>
  <meta name="description" content="An example page for testing" />
  <meta name="viewport" content="width=device-width" />
</head>
<body>
  <h1>Example Domain</h1>
  <h2>Section</h2>
  <img src="/a.png" alt="a" />
  <img src="/b.png" />
  <a href="/internal">internal</a>
  <a href="https://external.test/page">external</a>
  <p>Some body text for word counting purposes here.</p>
</body>
</html>`;

// We target real, publicly-resolvable domains (example.com) so the
// service's own DNS-based SSRF validation passes, then use undici's
// MockAgent to intercept the actual HTTP call — no real network traffic
// leaves the process, and behavior (errors, delays) is fully controlled.
describe('POST /api/audit', () => {
  let app;
  let mockAgent;
  let originalDispatcher;
  let dnsLookupSpy;

  beforeEach(() => {
    // Stub dns.lookup so no real DNS packets leave the process.
    // Works on all platforms without jest module-mock hoisting.
    dnsLookupSpy = jest
      .spyOn(dns.promises, 'lookup')
      .mockResolvedValue({ address: '93.184.216.34', family: 4 });

    ({ app } = createApp({ timeoutMs: 2000, maxConcurrent: 5, cacheTtlSeconds: 60, rateLimitMax: 100 }));
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    dnsLookupSpy.mockRestore();
    setGlobalDispatcher(originalDispatcher);
    await mockAgent.close();
  });

  test('rejects a missing url', async () => {
    const res = await request(app).post('/api/audit').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_URL');
    expect(res.body.error.requestId).toBeDefined();
  });

  test('rejects a malformed url', async () => {
    const res = await request(app).post('/api/audit').send({ url: 'not a url' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_URL');
  });

  test('rejects a disallowed protocol', async () => {
    const res = await request(app).post('/api/audit').send({ url: 'ftp://example.com/file' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DISALLOWED_PROTOCOL');
  });

  test('rejects a private/loopback target (SSRF guard)', async () => {
    const res = await request(app).post('/api/audit').send({ url: 'http://localhost:9999' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRIVATE_ADDRESS_BLOCKED');
  });

  test('audits a reachable HTML page and returns structured page data', async () => {
    mockAgent
      .get('https://example.com')
      .intercept({ path: '/page-a' })
      .reply(200, SAMPLE_HTML, { headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY' } });

    const res = await request(app).post('/api/audit').send({ url: 'https://example.com/page-a' });

    expect(res.status).toBe(200);
    expect(res.body.statusCode).toBe(200);
    expect(res.body.cache.hit).toBe(false);
    expect(res.body.page.title).toBe('Example Domain');
    expect(res.body.page.metaDescription).toBe('An example page for testing');
    expect(res.body.page.h1Count).toBe(1);
    expect(res.body.page.imagesMissingAlt).toBe(1);
    expect(res.body.page.internalLinkCount).toBe(1);
    expect(res.body.security.hasXFrameOptions).toBe(true);
    expect(typeof res.body.responseTimeMs).toBe('number');
  });

  test('serves repeat audits of the same URL from cache within the TTL window', async () => {
    // Interceptor set to fire once — if the service refetched instead of
    // using the cache, the second call would hit "no matching interceptor".
    mockAgent
      .get('https://example.com')
      .intercept({ path: '/page-b' })
      .reply(200, SAMPLE_HTML, { headers: { 'content-type': 'text/html' } })
      .times(1);

    const first = await request(app).post('/api/audit').send({ url: 'https://example.com/page-b' });
    expect(first.body.cache.hit).toBe(false);

    const second = await request(app).post('/api/audit').send({ url: 'https://example.com/page-b' });
    expect(second.status).toBe(200);
    expect(second.body.cache.hit).toBe(true);
  });

  test('maps an unreachable/erroring upstream to a structured 502', async () => {
    mockAgent
      .get('https://example.com')
      .intercept({ path: '/page-c' })
      .replyWithError(new Error('simulated connection reset'));

    const res = await request(app).post('/api/audit').send({ url: 'https://example.com/page-c' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_UNREACHABLE');
  });

  test('maps a slow upstream to a structured 504 timeout', async () => {
    mockAgent
      .get('https://example.com')
      .intercept({ path: '/page-d' })
      .reply(200, 'ok')
      .delay(5000);

    const { app: shortTimeoutApp } = createApp({ timeoutMs: 100, cacheTtlSeconds: 60, rateLimitMax: 100 });
    const res = await request(shortTimeoutApp).post('/api/audit').send({ url: 'https://example.com/page-d' });
    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('AUDIT_TIMEOUT');
  }, 10000);

  test('returns 429 once the per-client rate limit is exceeded', async () => {
    mockAgent
      .get('https://example.com')
      .intercept({ path: '/page-e' })
      .reply(200, SAMPLE_HTML, { headers: { 'content-type': 'text/html' } })
      .times(3);

    const { app: tightApp } = createApp({ cacheTtlSeconds: 0, rateLimitMax: 2, rateLimitWindowMs: 60000 });

    await request(tightApp).post('/api/audit').send({ url: 'https://example.com/page-e' });
    await request(tightApp).post('/api/audit').send({ url: 'https://example.com/page-e' });
    const third = await request(tightApp).post('/api/audit').send({ url: 'https://example.com/page-e' });

    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  test('every response carries a request id, generated or passed through', async () => {
    const res = await request(app)
      .post('/api/audit')
      .set('X-Request-Id', 'test-fixed-id')
      .send({});
    expect(res.headers['x-request-id']).toBe('test-fixed-id');
    expect(res.body.error.requestId).toBe('test-fixed-id');
  });
});

describe('GET /health', () => {
  test('reports ok status with cache and concurrency stats', async () => {
    const { app } = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('activeAudits');
  });
});

describe('unknown routes', () => {
  test('returns a structured 404', async () => {
    const { app } = createApp();
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
