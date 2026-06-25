import IORedis, { RedisOptions } from 'ioredis';
import dotenv from 'dotenv';
import { logger } from './logger';

dotenv.config();

let redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Strip potential quotes around the URL string (often parsed by dotenv if double-quoted in .env)
redisUrl = redisUrl.replace(/^["']|["']$/g, '').trim();

// Production startup safety check
if (redisUrl.startsWith('https://') || redisUrl.startsWith('http://')) {
  const errMsg = `Redis configuration violation: REDIS_URL starts with an HTTP protocol ('${redisUrl.split('://')[0]}://'). ` +
    `IORedis is a TCP client and does not support HTTP/REST endpoints. For Upstash Redis, please use the Redis Connection String ` +
    `format (starting with 'rediss://' for secure TLS, e.g. rediss://default:password@endpoint.upstash.io:6379) instead.`;
  logger.error('RedisManager', errMsg);
  throw new Error(errMsg);
}

logger.info('RedisManager', 'Initializing centralized connection handlers...', {
  host: redisUrl.includes('@') ? redisUrl.split('@')[1] : redisUrl,
  tls: redisUrl.startsWith('rediss://')
});

// Configure base options for resilient connections
const baseRedisOptions: RedisOptions = {
  maxRetriesPerRequest: null, // Required by BullMQ
  reconnectOnError: (err: Error) => {
    logger.warn('RedisManager', 'Reconnect on error check triggered', { error: err.message });
    return true; // Reconnect for any error
  },
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 100, 3000); // Backoff up to 3s
    logger.info('RedisManager', `Retrying connection (attempt #${times}) in ${delay}ms...`);
    return delay;
  }
};

// General-purpose client for caching (reads/writes)
export const redis = new IORedis(redisUrl, {
  ...baseRedisOptions,
  maxRetriesPerRequest: 20 // Enforce limit for standard operations to prevent hanging HTTP responses
});

// Client connection specifically shared by all BullMQ workers and queues (requires maxRetriesPerRequest = null)
export const redisConnection = new IORedis(redisUrl, {
  ...baseRedisOptions,
  maxRetriesPerRequest: null
});

// Register Event listeners for structured audit tracking
const registerEventLoggers = (client: IORedis, name: string) => {
  client.on('connect', () => {
    logger.info('RedisManager', `✨ [${name}] Socket connected successfully`);
  });

  client.on('ready', () => {
    logger.info('RedisManager', `🚀 [${name}] Client is fully initialized and ready`);
  });

  client.on('error', (err) => {
    logger.error('RedisManager', `❌ [${name}] Connection encountered an error`, { error: err.message });
  });

  client.on('reconnecting', () => {
    logger.warn('RedisManager', `🔌 [${name}] Client is attempting to reconnect...`);
  });

  client.on('end', () => {
    logger.info('RedisManager', `💤 [${name}] Connection pool closed`);
  });
};

registerEventLoggers(redis, 'CacheClient');
registerEventLoggers(redisConnection, 'QueueClient');

// Graceful shutdown hooks to prevent socket leaks
const handleGracefulShutdown = async (signal: string) => {
  logger.info('RedisManager', `Process received ${signal}. Closing connection pools gracefully...`);
  try {
    await Promise.all([
      redis.quit(),
      redisConnection.quit()
    ]);
    logger.info('RedisManager', 'All connection pools closed cleanly.');
  } catch (err: any) {
    logger.error('RedisManager', 'Failed to close connection pools gracefully', { error: err.message });
  }
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
