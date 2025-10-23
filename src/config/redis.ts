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
  maxRetriesPerRequest: 5,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 30000, // Increased to 30 seconds for cloud connections
  retryStrategy(times: number) {
    // Exponential backoff with max 30 seconds between retries
    const delay = Math.min(times * 1000, 30000);
    if (times > 15) {
      console.error(`Redis connection failed after ${times} attempts. Stopping retries temporarily.`);
      return null; // Stop retrying after 15 attempts
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
  // Increased timeout for cloud connections
  commandTimeout: 30000,
  // Lazy connect to prevent startup failures
  lazyConnect: false,
  // TLS configuration for Redis Cloud
  tls: REDIS_URL.includes('redis-cloud.com') || REDIS_URL.includes('redns.redis-cloud.com') ? {
    rejectUnauthorized: false, // Accept self-signed certificates for Redis Cloud
  } : undefined,
};

// Redis options for Bull queues (without problematic options)
// Bull doesn't support enableReadyCheck or maxRetriesPerRequest for subscriber clients
// See: https://github.com/OptimalBits/bull/issues/1873
const bullRedisOptions: RedisOptions = {
  // Removed: maxRetriesPerRequest
  // Removed: enableReadyCheck
  enableOfflineQueue: true,
  connectTimeout: 30000,
  retryStrategy(times: number) {
    const delay = Math.min(times * 1000, 30000);
    if (times > 15) {
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
  // TLS configuration for Redis Cloud
  tls: REDIS_URL.includes('redis-cloud.com') || REDIS_URL.includes('redns.redis-cloud.com') ? {
    rejectUnauthorized: false, // Accept self-signed certificates for Redis Cloud
  } : undefined,
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
 * Lazy-loaded Redis client instances
 * Only initialize when first accessed and skip in test environment
 */
let _redisClient: Redis | null = null;
let _redisPubSubClient: Redis | null = null;

/**
 * Get or create Redis client (lazy initialization)
 * Skips initialization in test environment unless explicitly forced
 */
function getRedisClient(): Redis {
  // Skip Redis in test environment
  if (process.env.NODE_ENV === 'test' && !process.env.FORCE_REDIS) {
    // Return a mock client that doesn't connect
    if (!_redisClient) {
      console.log('[Redis] Skipping initialization in test environment');
      _redisClient = new Redis({
        lazyConnect: true,
        enableOfflineQueue: false,
      });
    }
    return _redisClient;
  }

  // Create real client on first access
  if (!_redisClient) {
    console.log('[Redis] Initializing Redis client...');
    _redisClient = REDIS_URL 
      ? new Redis(REDIS_URL, redisOptions)
      : new Redis(getRedisConfig());
    
    // Attach event handlers
    setupRedisEventHandlers(_redisClient, 'Redis client');
  }
  
  return _redisClient;
}

/**
 * Get or create Redis pub/sub client (lazy initialization)
 */
function getRedisPubSubClient(): Redis {
  // Skip Redis in test environment
  if (process.env.NODE_ENV === 'test' && !process.env.FORCE_REDIS) {
    if (!_redisPubSubClient) {
      console.log('[Redis] Skipping pub/sub client initialization in test environment');
      _redisPubSubClient = new Redis({
        lazyConnect: true,
        enableOfflineQueue: false,
      });
    }
    return _redisPubSubClient;
  }

  // Create real client on first access
  if (!_redisPubSubClient) {
    console.log('[Redis] Initializing Redis pub/sub client...');
    _redisPubSubClient = REDIS_URL
      ? new Redis(REDIS_URL, redisOptions)
      : new Redis(getRedisConfig());
    
    // Attach event handlers
    setupRedisEventHandlers(_redisPubSubClient, 'Redis pub/sub');
  }
  
  return _redisPubSubClient;
}

/**
 * Export clients with getters for lazy loading
 */
export const redisClient = new Proxy({} as Redis, {
  get(target, prop) {
    const client = getRedisClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

export const redisPubSubClient = new Proxy({} as Redis, {
  get(target, prop) {
    const client = getRedisPubSubClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

// Track error count to prevent log flooding
const ERROR_LOG_THRESHOLD = 5; // Only log every 5th error
const ERROR_RESET_INTERVAL = 60000; // Reset error count every minute

/**
 * Setup event handlers for Redis client with rate-limited logging
 */
function setupRedisEventHandlers(client: Redis, clientName: string): void {
  let errorCount = 0;
  let lastErrorTime = Date.now();

  client.on('connect', () => {
    console.log(`✅ ${clientName} connected`);
    errorCount = 0; // Reset error count on successful connection
  });

  client.on('ready', () => {
    console.log(`✅ ${clientName} ready`);
    errorCount = 0;
  });

  client.on('error', (err: Error) => {
    const now = Date.now();
    // Reset error count if more than 1 minute has passed
    if (now - lastErrorTime > ERROR_RESET_INTERVAL) {
      errorCount = 0;
    }
    
    errorCount++;
    lastErrorTime = now;
    
    // Only log every Nth error to prevent flooding
    if (errorCount % ERROR_LOG_THRESHOLD === 0) {
      console.error(`❌ ${clientName} error (${errorCount} errors in last minute): ${err.message}`);
    }
  });

  client.on('close', () => {
    console.log(`⚠️  ${clientName} connection closed`);
  });

  client.on('reconnecting', (delay: number) => {
    console.log(`🔄 ${clientName} reconnecting in ${delay}ms...`);
  });
}

/**
 * Connect to Redis
 */
export const connectRedis = async (): Promise<void> => {
  try {
    const client = getRedisClient();
    await client.ping();
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
    if (_redisClient) {
      await _redisClient.quit();
    }
    if (_redisPubSubClient) {
      await _redisPubSubClient.quit();
    }
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
    const client = getRedisClient();
    const result = await client.ping();
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
    const client = getRedisClient();
    return await client.info();
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
    const client = getRedisClient();
    await client.flushdb();
    console.log('✅ Redis database flushed');
  } catch (error) {
    console.error('❌ Failed to flush Redis database:', error);
    throw error;
  }
};

// Export getter functions for advanced use cases
export { getRedisClient, getRedisPubSubClient };

export default redisClient;

