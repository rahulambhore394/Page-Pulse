/**
 * Structured application error. Every error that reaches the client
 * is shaped consistently: { error: { code, message, requestId } }.
 */
class AppError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isAppError = true;
  }
}

const Errors = {
  invalidUrl: (detail) =>
    new AppError('INVALID_URL', `Invalid URL: ${detail}`, 400),

  missingUrl: () =>
    new AppError('MISSING_URL', 'Request body must include a "url" field', 400),

  disallowedProtocol: () =>
    new AppError('DISALLOWED_PROTOCOL', 'Only http and https URLs are allowed', 400),

  privateAddress: () =>
    new AppError('PRIVATE_ADDRESS_BLOCKED', 'URLs resolving to private/loopback addresses are not allowed', 400),

  timeout: (ms) =>
    new AppError('AUDIT_TIMEOUT', `Audit did not complete within ${ms}ms`, 504),

  upstreamUnreachable: (detail) =>
    new AppError('UPSTREAM_UNREACHABLE', `Could not reach target URL: ${detail}`, 502),

  tooManyConcurrent: () =>
    new AppError('CONCURRENCY_LIMIT_EXCEEDED', 'Server is at capacity, please retry shortly', 503),

  rateLimited: () =>
    new AppError('RATE_LIMITED', 'Too many requests, slow down', 429),

  internal: (detail) =>
    new AppError('INTERNAL_ERROR', detail || 'Something went wrong', 500),
};

module.exports = { AppError, Errors };
