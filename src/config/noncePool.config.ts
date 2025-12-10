/**
 * Nonce Pool Configuration
 * 
 * Configuration settings for managing the durable nonce account pool
 * including pool sizing, replenishment thresholds, and operational parameters.
 */

export interface NoncePoolConfig {
  /** Minimum number of available nonce accounts to maintain in the pool */
  minPoolSize: number;
  
  /** Maximum number of nonce accounts the pool can hold */
  maxPoolSize: number;
  
  /** Threshold that triggers automatic pool replenishment (number of available accounts) */
  replenishmentThreshold: number;
  
  /** Number of nonce accounts to create during each replenishment operation */
  replenishmentBatchSize: number;
  
  /** Maximum time (ms) to wait for a nonce account when pool is exhausted */
  assignmentTimeoutMs: number;
  
  /** Maximum retry attempts for nonce account creation */
  maxCreationRetries: number;
  
  /** Delay (ms) between retry attempts for nonce account operations */
  retryDelayMs: number;
  
  /** Time-to-live (ms) for cached nonce values */
  nonceCacheTTL: number;
  
  /** Interval (ms) for running cleanup operations */
  cleanupIntervalMs: number;
  
  /** Age (ms) after which unused nonce accounts are considered expired */
  expirationThresholdMs: number;
  
  /** Maximum number of concurrent nonce account creation operations */
  maxConcurrentCreations: number;
  
  /** Enable/disable first-time user subsidy */
  enableSubsidy: boolean;
  
  /** Environment name for logging and monitoring */
  environment: 'local' | 'staging' | 'production';
}

/**
 * Default nonce pool configuration
 */
const DEFAULT_CONFIG: NoncePoolConfig = {
  minPoolSize: 10,
  maxPoolSize: 100,
  replenishmentThreshold: 20,
  replenishmentBatchSize: 5,
  assignmentTimeoutMs: 30000, // 30 seconds
  maxCreationRetries: 3,
  retryDelayMs: 1000, // 1 second
  nonceCacheTTL: 60000, // 1 minute
  cleanupIntervalMs: 3600000, // 1 hour
  expirationThresholdMs: 604800000, // 7 days
  maxConcurrentCreations: 5,
  enableSubsidy: true,
  environment: 'local',
};

/**
 * Load nonce pool configuration from environment variables with fallback to defaults
 */
export function loadNoncePoolConfig(): NoncePoolConfig {
  return {
    minPoolSize: parseInt(process.env.NONCE_POOL_MIN_SIZE || String(DEFAULT_CONFIG.minPoolSize)),
    maxPoolSize: parseInt(process.env.NONCE_POOL_MAX_SIZE || String(DEFAULT_CONFIG.maxPoolSize)),
    replenishmentThreshold: parseInt(
      process.env.NONCE_POOL_REPLENISHMENT_THRESHOLD || String(DEFAULT_CONFIG.replenishmentThreshold)
    ),
    replenishmentBatchSize: parseInt(
      process.env.NONCE_POOL_BATCH_SIZE || String(DEFAULT_CONFIG.replenishmentBatchSize)
    ),
    assignmentTimeoutMs: parseInt(
      process.env.NONCE_ASSIGNMENT_TIMEOUT_MS || String(DEFAULT_CONFIG.assignmentTimeoutMs)
    ),
    maxCreationRetries: parseInt(
      process.env.NONCE_MAX_CREATION_RETRIES || String(DEFAULT_CONFIG.maxCreationRetries)
    ),
    retryDelayMs: parseInt(process.env.NONCE_RETRY_DELAY_MS || String(DEFAULT_CONFIG.retryDelayMs)),
    nonceCacheTTL: parseInt(process.env.NONCE_CACHE_TTL_MS || String(DEFAULT_CONFIG.nonceCacheTTL)),
    cleanupIntervalMs: parseInt(
      process.env.NONCE_CLEANUP_INTERVAL_MS || String(DEFAULT_CONFIG.cleanupIntervalMs)
    ),
    expirationThresholdMs: parseInt(
      process.env.NONCE_EXPIRATION_THRESHOLD_MS || String(DEFAULT_CONFIG.expirationThresholdMs)
    ),
    maxConcurrentCreations: parseInt(
      process.env.NONCE_MAX_CONCURRENT_CREATIONS || String(DEFAULT_CONFIG.maxConcurrentCreations)
    ),
    enableSubsidy: process.env.NONCE_ENABLE_SUBSIDY !== 'false', // Default to true unless explicitly disabled
    environment: (process.env.NODE_ENV as 'local' | 'staging' | 'production') || 'local',
  };
}

/**
 * Validate nonce pool configuration
 * Throws error if configuration is invalid
 */
export function validateNoncePoolConfig(config: NoncePoolConfig): void {
  if (config.minPoolSize < 1) {
    throw new Error('NONCE_POOL_MIN_SIZE must be at least 1');
  }
  
  if (config.maxPoolSize < config.minPoolSize) {
    throw new Error('NONCE_POOL_MAX_SIZE must be greater than or equal to NONCE_POOL_MIN_SIZE');
  }
  
  if (config.replenishmentThreshold < config.minPoolSize) {
    throw new Error('NONCE_POOL_REPLENISHMENT_THRESHOLD must be greater than or equal to NONCE_POOL_MIN_SIZE');
  }
  
  if (config.replenishmentThreshold > config.maxPoolSize) {
    throw new Error('NONCE_POOL_REPLENISHMENT_THRESHOLD must be less than or equal to NONCE_POOL_MAX_SIZE');
  }
  
  if (config.replenishmentBatchSize < 1) {
    throw new Error('NONCE_POOL_BATCH_SIZE must be at least 1');
  }
  
  if (config.assignmentTimeoutMs < 1000) {
    throw new Error('NONCE_ASSIGNMENT_TIMEOUT_MS must be at least 1000ms (1 second)');
  }
  
  if (config.maxCreationRetries < 0) {
    throw new Error('NONCE_MAX_CREATION_RETRIES must be non-negative');
  }
  
  if (config.retryDelayMs < 0) {
    throw new Error('NONCE_RETRY_DELAY_MS must be non-negative');
  }
  
  if (config.nonceCacheTTL < 0) {
    throw new Error('NONCE_CACHE_TTL_MS must be non-negative');
  }
  
  if (config.cleanupIntervalMs < 60000) {
    throw new Error('NONCE_CLEANUP_INTERVAL_MS must be at least 60000ms (1 minute)');
  }
  
  if (config.expirationThresholdMs < 3600000) {
    throw new Error('NONCE_EXPIRATION_THRESHOLD_MS must be at least 3600000ms (1 hour)');
  }
  
  if (config.maxConcurrentCreations < 1) {
    throw new Error('NONCE_MAX_CONCURRENT_CREATIONS must be at least 1');
  }
}

/**
 * Get validated nonce pool configuration
 * Loads config from environment and validates it
 */
export function getNoncePoolConfig(): NoncePoolConfig {
  const config = loadNoncePoolConfig();
  validateNoncePoolConfig(config);
  return config;
}

/**
 * Configuration for local development (testing)
 */
export const LOCAL_CONFIG: NoncePoolConfig = {
  ...DEFAULT_CONFIG,
  minPoolSize: 5,
  maxPoolSize: 20,
  replenishmentThreshold: 10,
  replenishmentBatchSize: 3,
  assignmentTimeoutMs: 10000, // 10 seconds for faster local testing
  cleanupIntervalMs: 300000, // 5 minutes for more frequent testing
  environment: 'local',
};

/**
 * Configuration for staging environment
 */
export const STAGING_CONFIG: NoncePoolConfig = {
  ...DEFAULT_CONFIG,
  minPoolSize: 10,
  maxPoolSize: 50,
  replenishmentThreshold: 15,
  replenishmentBatchSize: 5,
  maxConcurrentCreations: 1, // Create one at a time to avoid RPC rate limiting and conflicts
  environment: 'staging',
};

/**
 * Configuration for production environment
 * 
 * Note: maxPoolSize limits how many unique users can have assigned nonces.
 * Each user keeps their nonce and reuses it for multiple offers.
 * Pool of 1000 = ~1000 unique users with active nonces at any time.
 */
export const PRODUCTION_CONFIG: NoncePoolConfig = {
  ...DEFAULT_CONFIG,
  minPoolSize: 50,           // Maintain at least 50 available nonces
  maxPoolSize: 1000,         // Support up to 1000 unique users with nonces
  replenishmentThreshold: 100, // Trigger replenishment when available < 100
  replenishmentBatchSize: 20,  // Create 20 at a time during replenishment
  assignmentTimeoutMs: 60000,  // 60 seconds for production
  cleanupIntervalMs: 7200000,  // 2 hours
  environment: 'production',
};

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(env: string = process.env.NODE_ENV || 'local'): NoncePoolConfig {
  switch (env.toLowerCase()) {
    case 'production':
    case 'prod':
      return PRODUCTION_CONFIG;
    case 'staging':
    case 'stage':
      return STAGING_CONFIG;
    case 'local':
    case 'development':
    case 'dev':
    default:
      return LOCAL_CONFIG;
  }
}

