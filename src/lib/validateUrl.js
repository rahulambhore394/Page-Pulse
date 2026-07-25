const dns = require('dns').promises;
const net = require('net');
const { Errors } = require('./errors');

// RFC1918 / loopback / link-local ranges we refuse to audit, so the
// service can't be used to probe internal infrastructure (SSRF guard).
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }
  return false;
}

/**
 * Validates a candidate URL string for the audit endpoint.
 * Throws an AppError (never returns false) so callers can propagate
 * a structured, consistent error response.
 */
async function validateAndResolveUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw Errors.missingUrl();
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (e) {
    throw Errors.invalidUrl('not a well-formed URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw Errors.disallowedProtocol();
  }

  if (parsed.hostname === 'localhost') {
    throw Errors.privateAddress();
  }

  // Resolve DNS ourselves so we can block SSRF via private-range targets
  // (defense in depth alongside a per-request timeout).
  try {
    const { address } = await dns.lookup(parsed.hostname);
    if (isPrivateIp(address)) {
      throw Errors.privateAddress();
    }
  } catch (e) {
    if (e.isAppError) throw e;
    throw Errors.invalidUrl(`could not resolve hostname (${e.code || e.message})`);
  }

  return parsed.toString();
}

module.exports = { validateAndResolveUrl, isPrivateIp };
