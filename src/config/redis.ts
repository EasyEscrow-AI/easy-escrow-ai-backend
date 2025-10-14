import Redis, { RedisOptions } from 'ioredis';
import { config } from './index';

/**
 * Redis Configuration
 * 
 * Manages Redis connection with connection pooling, health checks, and retry logic
 */

// Redis connection options
const redisOptions: RedisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    console.log(`Redis connection retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  reconnectOnError(err: Error) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
    return false;
  },
};

// Parse Redis URL or use individual config options
function getRedisConfig(): RedisOptions {
  const redisUrl = config.redis.url;
  
  if (redisUrl && redisUrl.startsWith('redis://')) {
    // Parse URL for connection options
    return {
      ...redisOptions,
      // ioredis will parse the URL automatically
    };
  }
  
  // Fallback to individual config
  return {
    ...redisOptions,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  };
}

/**
 * Main Redis client instance for caching
 */
export const redisClient = config.redis.url 
  ? new Redis(config.redis.url, redisOptions)
  : new Redis(getRedisConfig());

/**
 * Separate Redis client for pub/sub (Bull job queues)
 */
export const redisPubSubClient = config.redis.url
  ? new Redis(config.redis.url, redisOptions)
  : new Redis(getRedisConfig());

// Event handlers for Redis client
redisClient.on('connect', () => {
  console.log('✅ Redis client connected');
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready');
});

redisClient.on('error', (err: Error) => {
  console.error('❌ Redis client error:', err.message);
});

redisClient.on('close', () => {
  console.log('⚠️  Redis client connection closed');
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Redis client reconnecting...');
});

// Event handlers for pub/sub client
redisPubSubClient.on('connect', () => {
  console.log('✅ Redis pub/sub client connected');
});

redisPubSubClient.on('error', (err: Error) => {
  console.error('❌ Redis pub/sub client error:', err.message);
});

/**
 * Connect to Redis
 */
export const connectRedis = async (): Promise<void> => {
  try {
    await redisClient.ping();
    console.log('✅ Redis connection successful');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    throw error;
  }
};

/**
 * Disconnect from Redis
 */
export const disconnectRedis = async (): Promise<void> => {
  try {
    await redisClient.quit();
    await redisPubSubClient.quit();
    console.log('✅ Redis disconnected successfully');
  } catch (error) {
    console.error('❌ Redis disconnection failed:', error);
  }
};

/**
 * Health check for Redis
 */
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
};

/**
 * Get Redis client info
 */
export const getRedisInfo = async (): Promise<string> => {
  try {
    return await redisClient.info();
  } catch (error) {
    console.error('Failed to get Redis info:', error);
    throw error;
  }
};

/**
 * Flush Redis database (use with caution!)
 */
export const flushRedis = async (): Promise<void> => {
  if (config.nodeEnv === 'production') {
    throw new Error('Cannot flush Redis in production environment');
  }
  
  try {
    await redisClient.flushdb();
    console.log('✅ Redis database flushed');
  } catch (error) {
    console.error('❌ Failed to flush Redis database:', error);
    throw error;
  }
};

export default redisClient;

