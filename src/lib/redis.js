const redis = require('redis');
const { logger } = require('./logger');

let client = null;
let subscriber = null;

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

async function getRedisClient() {
  if (!client) {
    client = redis.createClient({
      url: redisUrl,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 500) },
    });

    client.on('error', (err) => logger.error({ err }, 'Redis client error'));
    client.on('connect', () => logger.info('Redis client connected'));
    client.on('ready', () => logger.info('Redis client ready'));

    await client.connect();
  }
  return client;
}

async function getSubscriber() {
  if (!subscriber) {
    subscriber = client.duplicate();
    await subscriber.connect();
  }
  return subscriber;
}

async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
}

module.exports = { getRedisClient, getSubscriber, closeRedis };
