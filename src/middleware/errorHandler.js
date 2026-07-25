/**
 * Single place where every error becomes the response shape clients rely on:
 *   { error: { code, message, requestId } }
 * Unknown/unexpected errors are logged with full detail but never leak
 * internals to the client — they get a generic INTERNAL_ERROR.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isAppError = !!err.isAppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';
  const message = isAppError ? err.message : 'An unexpected error occurred';

  if (!isAppError && req.log) {
    req.log.error({ err }, 'unhandled error');
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: req.id,
    },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${req.method} ${req.path}`,
      requestId: req.id,
    },
  });
}

module.exports = { errorHandler, notFoundHandler };
