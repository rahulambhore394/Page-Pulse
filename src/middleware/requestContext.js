const { v4: uuidv4 } = require('uuid');
const pinoHttp = require('pino-http');
const { logger } = require('../lib/logger');

/**
 * Attaches a request ID (respecting an inbound X-Request-Id if the caller
 * supplied one, e.g. from an upstream gateway) and a child logger scoped
 * to that ID, so every log line for a request can be correlated.
 */
const requestId = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id = incoming && typeof incoming === 'string' ? incoming : uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
};

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});

module.exports = { requestId, httpLogger };
