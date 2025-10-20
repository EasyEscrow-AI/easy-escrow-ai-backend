import Redis, { RedisOptions } from 'ioredis';

/**
 * Redis Configuration
 * 
 * Manages Redis connection with connection pooling, health checks, and retry logic
 * 
 * Note: Reads REDIS_URL directly from process.env to avoid circular dependency with config/index.ts
 */

// Read Redis URL directly to avoid circular dependency
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Redis connection options with resilient error handling
const redisOptions: RedisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  retryStrategy(times: number) {
    // Exponential backoff with max 30 seconds between retries
    const delay = Math.min(times * 1000, 30000);
    if (times > 10) {
      console.error(`Redis connection failed after ${times} attempts. Stopping retries temporarily.`);
      return null; // Stop retrying after 10 attempts
    }
    console.log(`Redis connection retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  reconnectOnError(err: Error) {
    // Reconnect on various error conditions
    const reconnectErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'];
    const shouldReconnect = reconnectErrors.some(errType => 
      err.message.includes(errType) || err.name.includes(errType)
    );
    if (shouldReconnect) {
      console.log(`Redis reconnecting due to error: ${err.message}`);
      return true;
    }
    return false;
  },
  // Keepalive to prevent connection drops
  keepAlive: 30000,
  // Prevent command timeout errors from flooding logs  
  commandTimeout: 5000,
  // Lazy connect to prevent startup failures
  lazyConnect: false,
};

// Redis options for Bull queues (without problematic options)
// Bull doesn't support enableReadyCheck or maxRetriesPerRequest for subscriber clients
// See: https://github.com/OptimalBits/bull/issues/1873
const bullRedisOptions: RedisOptions = {
  // Removed: maxRetriesPerRequest
  // Removed: enableReadyCheck
  enableOfflineQueue: true,
  connectTimeout: 10000,
  retryStrategy(times: number) {
    const delay = Math.min(times * 1000, 30000);
    if (times > 10) {
      console.error(`Redis connection failed after ${times} attempts. Stopping retries temporarily.`);
      return null;
    }
    console.log(`Redis connection retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  reconnectOnError(err: Error) {
    const reconnectErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'];
    const shouldReconnect = reconnectErrors.some(errType => 
      err.message.includes(errType) || err.name.includes(errType)
    );
    if (shouldReconnect) {
      console.log(`Redis reconnecting due to error: ${err.message}`);
      return true;
    }
    return false;
  },
  keepAlive: 30000,
  commandTimeout: 30000, // 30 second timeout for queue operations
  lazyConnect: false,
};

// Parse Redis URL or use individual config options
function getRedisConfig(useBullOptions: boolean = false): RedisOptions {
  const redisUrl = REDIS_URL;
  const baseOptions = useBullOptions ? bullRedisOptions : redisOptions;
  
  if (redisUrl && redisUrl.startsWith('redis://')) {
    // Parse URL for connection options
    return {
      ...baseOptions,
      // ioredis will parse the URL automatically
    };
  }
  
  // Fallback to individual config
  return {
    ...baseOptions,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  };
}

/**
 * Get Bull-compatible Redis configuration
 * Use this for Bull queue connections to avoid enableReadyCheck/maxRetriesPerRequest issues
 */
export function getBullRedisConfig(): RedisOptions {
  return getRedisConfig(true);
}

/**
 * Main Redis client instance for caching
 */
export const redisClient = REDIS_URL 
  ? new Redis(REDIS_URL, redisOptions)
  : new Redis(getRedisConfig());

/**
 * Separate Redis client for pub/sub (Bull job queues)
 */
export const redisPubSubClient = REDIS_URL
  ? new Redis(REDIS_URL, redisOptions)
  : new Redis(getRedisConfig());

// Track error count to prevent log flooding
let redisErrorCount = 0;
let lastErrorTime = Date.now();
const ERROR_LOG_THRESHOLD = 5; // Only log every 5th error
const ERROR_RESET_INTERVAL = 60000; // Reset error count every minute

// Event handlers for Redis client with rate-limited logging
redisClient.on('connect', () => {
  console.log('✅ Redis client connected');
  redisErrorCount = 0; // Reset error count on successful connection
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready');
  redisErrorCount = 0;
});

redisClient.on('error', (err: Error) => {
  const now = Date.now();
  // Reset error count if more than 1 minute has passed
  if (now - lastErrorTime > ERROR_RESET_INTERVAL) {
    redisErrorCount = 0;
  }
  
  redisErrorCount++;
  lastErrorTime = now;
  
  // Only log every Nth error to prevent flooding
  if (redisErrorCount % ERROR_LOG_THRESHOLD === 0) {
    console.error(`❌ Redis client error (${redisErrorCount} errors in last minute): ${err.message}`);
  }
});

redisClient.on('close', () => {
  console.log('⚠️  Redis client connection closed');
});

redisClient.on('reconnecting', (delay: number) => {
  console.log(`🔄 Redis client reconnecting in ${delay}ms...`);
});

// Event handlers for pub/sub client with rate-limited logging
let pubsubErrorCount = 0;
let lastPubsubErrorTime = Date.now();

redisPubSubClient.on('connect', () => {
  console.log('✅ Redis pub/sub client connected');
  pubsubErrorCount = 0;
});

redisPubSubClient.on('error', (err: Error) => {
  const now = Date.now();
  if (now - lastPubsubErrorTime > ERROR_RESET_INTERVAL) {
    pubsubErrorCount = 0;
  }
  
  pubsubErrorCount++;
  lastPubsubErrorTime = now;
  
  // Only log every Nth error
  if (pubsubErrorCount % ERROR_LOG_THRESHOLD === 0) {
    console.error(`❌ Redis pub/sub error (${pubsubErrorCount} errors): ${err.message}`);
  }
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
  if (process.env.NODE_ENV === 'production') {
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

