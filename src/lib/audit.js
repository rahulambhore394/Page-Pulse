const cheerio = require('cheerio');
const { fetch } = require('undici');
const { Errors } = require('./errors');

/**
 * Fetches a URL with a hard timeout and returns a structured audit result.
 * Never throws a raw fetch/network error — always maps to an AppError so
 * the HTTP layer can produce a consistent response shape.
 */
async function auditUrl(url, { timeoutMs, log } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'PagePulse-Audit/1.0 (+https://digitalheroesco.com)' },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw Errors.timeout(timeoutMs);
    }
    throw Errors.upstreamUnreachable(err.message);
  } finally {
    clearTimeout(timer);
  }

  const responseTimeMs = Date.now() - started;
  const contentType = response.headers.get('content-type') || '';
  const isHtml = contentType.includes('text/html');

  let html = '';
  if (isHtml) {
    try {
      html = await response.text();
    } catch (err) {
      throw Errors.upstreamUnreachable(`failed reading response body: ${err.message}`);
    }
  }

  const result = {
    url,
    finalUrl: response.url || url,
    statusCode: response.status,
    ok: response.ok,
    responseTimeMs,
    contentType,
    contentLengthBytes: Number(response.headers.get('content-length')) || (isHtml ? Buffer.byteLength(html) : null),
    isHttps: url.startsWith('https://'),
    security: {
      hasHsts: response.headers.has('strict-transport-security'),
      hasContentSecurityPolicy: response.headers.has('content-security-policy'),
      hasXFrameOptions: response.headers.has('x-frame-options'),
    },
    checkedAt: new Date().toISOString(),
  };

  if (isHtml) {
    const $ = cheerio.load(html);
    result.page = {
      title: $('title').first().text().trim() || null,
      metaDescription: $('meta[name="description"]').attr('content') || null,
      h1Count: $('h1').length,
      h2Count: $('h2').length,
      imageCount: $('img').length,
      imagesMissingAlt: $('img:not([alt])').length,
      hasViewportMeta: $('meta[name="viewport"]').length > 0,
      internalLinkCount: countInternalLinks($, url),
      wordCount: estimateWordCount($),
    };
  } else {
    result.page = null;
  }

  if (log) {
    log.info({ url, statusCode: result.statusCode, responseTimeMs }, 'audit completed');
  }

  return result;
}

function countInternalLinks($, baseUrl) {
  let host;
  try {
    host = new URL(baseUrl).host;
  } catch {
    return 0;
  }
  let count = 0;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.host === host) count++;
    } catch {
      // relative/invalid hrefs like "#" or "mailto:" — ignore
    }
  });
  return count;
}

function estimateWordCount($) {
  const text = $('body').text() || '';
  return text.trim().split(/\s+/).filter(Boolean).length;
}

module.exports = { auditUrl };
