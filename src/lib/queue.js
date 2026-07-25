const { getRedisClient } = require('./redis');
const { logger } = require('./logger');
const { v4: uuid } = require('uuid');

const QUEUE_KEY = 'audit-queue';
const IN_FLIGHT_KEY = 'audit-in-flight';
const PENDING_KEY = 'audit-pending';

async function enqueueAudit(url, jobId = uuid()) {
  const client = await getRedisClient();

  // Check if an audit for this URL is already in-flight (dedup)
  const inFlightKey = `${IN_FLIGHT_KEY}:${url}`;
  const existingJobId = await client.get(inFlightKey);
  if (existingJobId) {
    logger.debug({ url, existingJobId }, 'Audit already in-flight, returning existing job');
    return { jobId: existingJobId, duplicate: true };
  }

  // Mark as in-flight with a short TTL (5 minutes) so if the worker crashes,
  // another request can retry
  await client.setEx(inFlightKey, 300, jobId);

  // Add to queue
  const jobPayload = JSON.stringify({ url, jobId });
  await client.xAdd(QUEUE_KEY, '*', 'payload', jobPayload);

  // Track pending job
  await client.setEx(`${PENDING_KEY}:${jobId}`, 3600, JSON.stringify({ url, createdAt: Date.now() }));

  logger.debug({ jobId, url }, 'Audit enqueued');
  return { jobId, duplicate: false };
}

async function getJobStatus(jobId) {
  const client = await getRedisClient();

  // Check if job is still pending
  const pending = await client.get(`${PENDING_KEY}:${jobId}`);
  if (pending) {
    const { createdAt } = JSON.parse(pending);
    return { status: 'pending', jobId, age: Date.now() - createdAt };
  }

  // Check if result is in cache
  const result = await client.get(`audit-result:${jobId}`);
  if (result) {
    return { status: 'completed', jobId, result: JSON.parse(result) };
  }

  return { status: 'unknown', jobId };
}

async function dequeueAudit(count = 1) {
  const client = await getRedisClient();

  try {
    const messages = await client.xRead(
      {
        key: QUEUE_KEY,
        id: '0', // Read from the beginning (or use $ for new messages only)
      },
      { count }
    );

    if (!messages || messages.length === 0) {
      return [];
    }

    const [, jobs] = messages[0];
    return jobs.map(({ id, message }) => {
      const payload = JSON.parse(message.payload);
      return { id, ...payload };
    });
  } catch (err) {
    logger.error({ err }, 'Error dequeuing audit');
    return [];
  }
}

async function markJobCompleted(jobId, url, result) {
  const client = await getRedisClient();

  // Store result with a TTL of 1 hour
  await client.setEx(`audit-result:${jobId}`, 3600, JSON.stringify(result));

  // Remove from pending
  await client.del(`${PENDING_KEY}:${jobId}`);

  // Clear in-flight marker
  const inFlightKey = `${IN_FLIGHT_KEY}:${url}`;
  await client.del(inFlightKey);

  logger.debug({ jobId, url }, 'Job marked completed');
}

async function markJobFailed(jobId, url, error) {
  const client = await getRedisClient();

  // Store error result
  const result = {
    success: false,
    error: error.message,
    code: error.code,
    timestamp: new Date().toISOString(),
  };

  await client.setEx(`audit-result:${jobId}`, 3600, JSON.stringify(result));
  await client.del(`${PENDING_KEY}:${jobId}`);

  // Don't clear in-flight on failure yet — let it expire naturally to handle retries
  logger.warn({ jobId, url, error: error.message }, 'Job marked failed');
}

async function getQueueStats() {
  const client = await getRedisClient();

  try {
    const queueLen = await client.xLen(QUEUE_KEY);
    const info = await client.info('stats');
    return { queueLength: queueLen, info };
  } catch (err) {
    logger.error({ err }, 'Error getting queue stats');
    return { queueLength: 0, info: '' };
  }
}

module.exports = {
  enqueueAudit,
  getJobStatus,
  dequeueAudit,
  markJobCompleted,
  markJobFailed,
  getQueueStats,
};
