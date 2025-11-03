import { PrismaClient } from '../generated/prisma';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __mockPrismaClient: PrismaClient | undefined;
}

/**
 * Lazy-loaded Prisma Client instance
 * Only initializes when first accessed and skips in test environment
 */
let _prismaClient: PrismaClient | null = null;

/**
 * Separate Prisma Client instance for batch operations
 * Uses a larger connection pool to handle high-volume batch processing
 * without impacting user-facing API performance
 */
let _batchPrismaClient: PrismaClient | null = null;

/**
 * Get or create Prisma client (lazy initialization)
 * In test environment, uses mock client if available
 */
function getPrismaClient(): PrismaClient {
  // Use mock client in test environment if provided
  if (process.env.NODE_ENV === 'test') {
    if (global.__mockPrismaClient) {
      console.log('[Prisma] Using mock client in test environment');
      return global.__mockPrismaClient;
    }
    
    // In test mode without a mock, throw error to enforce proper mocking
    throw new Error(
      '[Prisma] No mock client provided in test environment. ' +
      'Tests must call mockPrismaForTest() before using Prisma. ' +
      'Import { mockPrismaForTest } from "../helpers/prisma-mock" in your test file.'
    );
  }

  // Create real client on first access (non-test environments)
  if (!_prismaClient) {
    console.log('[Prisma] Initializing Prisma client...');
    
    // Use DATABASE_URL_POOL for runtime connections if available (connection pooling)
    // Fall back to DATABASE_URL for direct connections (used by migrations)
    let databaseUrl = process.env.DATABASE_URL_POOL || process.env.DATABASE_URL;
    
    // Add connection pool parameters for scalability
    // Supports 10,000+ escrows/day with increased pool size
    const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT || '30', 10);
    const poolTimeout = parseInt(process.env.DB_POOL_TIMEOUT || '30', 10);
    const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT || '5', 10);
    
    // Append connection pool parameters to URL if not already present
    if (databaseUrl && !databaseUrl.includes('connection_limit')) {
      const separator = databaseUrl.includes('?') ? '&' : '?';
      databaseUrl += `${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}&connect_timeout=${connectionTimeout}`;
    }
    
    if (process.env.DATABASE_URL_POOL) {
      console.log(`[Prisma] Using connection pool (DATABASE_URL_POOL) with limit: ${connectionLimit}`);
    } else {
      console.log(`[Prisma] Using direct connection (DATABASE_URL) with limit: ${connectionLimit}`);
    }
    
    _prismaClient = global.prisma || new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      },
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error'] 
        : ['error'],
    });
    
    if (process.env.NODE_ENV !== 'production') {
      global.prisma = _prismaClient;
    }
  }
  
  return _prismaClient;
}

/**
 * Get or create Batch Prisma client (lazy initialization)
 * Uses a larger connection pool for batch operations
 * Isolates batch operations from user-facing API traffic
 */
function getBatchPrismaClient(): PrismaClient {
  // Use same client in test environment
  if (process.env.NODE_ENV === 'test') {
    return getPrismaClient();
  }

  // Create batch client on first access (non-test environments)
  if (!_batchPrismaClient) {
    console.log('[Prisma] Initializing Batch Prisma client...');
    
    let databaseUrl = process.env.DATABASE_URL_POOL || process.env.DATABASE_URL;
    
    // Use larger connection pool for batch operations
    // Default: 50 connections (vs 30 for main pool)
    const connectionLimit = parseInt(process.env.DB_BATCH_CONNECTION_LIMIT || '50', 10);
    const poolTimeout = parseInt(process.env.DB_BATCH_POOL_TIMEOUT || '60', 10); // Longer timeout for batch
    const connectionTimeout = parseInt(process.env.DB_BATCH_CONNECTION_TIMEOUT || '10', 10);
    
    // Append connection pool parameters to URL if not already present
    if (databaseUrl && !databaseUrl.includes('connection_limit')) {
      const separator = databaseUrl.includes('?') ? '&' : '?';
      databaseUrl += `${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}&connect_timeout=${connectionTimeout}`;
    }
    
    console.log(`[Prisma] Batch client using connection pool with limit: ${connectionLimit}`);
    
    _batchPrismaClient = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      },
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error'] 
        : ['error'],
    });
  }
  
  return _batchPrismaClient;
}

/**
 * Export Prisma client with Proxy for lazy loading
 * This allows existing code to work unchanged while enabling lazy initialization
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    const client = getPrismaClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

/**
 * Export Batch Prisma client with Proxy for lazy loading
 * Use this client for batch operations (expiry checks, refunds, etc.)
 * Isolates high-volume batch operations from user-facing API traffic
 */
export const batchPrisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    const client = getBatchPrismaClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

/**
 * Set mock Prisma client for testing
 * Call this in test setup to provide a mocked client
 */
export function setMockPrismaClient(mockClient: PrismaClient): void {
  global.__mockPrismaClient = mockClient;
  _prismaClient = null; // Reset cached client
}

/**
 * Clear mock Prisma client
 * Call this in test teardown
 */
export function clearMockPrismaClient(): void {
  global.__mockPrismaClient = undefined;
  _prismaClient = null;
}

/**
 * Connect to database
 */
export const connectDatabase = async (): Promise<void> => {
  try {
    const client = getPrismaClient();
    await client.$connect();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

/**
 * Disconnect from database
 */
export const disconnectDatabase = async (): Promise<void> => {
  try {
    const promises: Promise<void>[] = [];
    
    if (_prismaClient) {
      promises.push(_prismaClient.$disconnect());
    }
    
    if (_batchPrismaClient) {
      promises.push(_batchPrismaClient.$disconnect());
    }
    
    if (promises.length > 0) {
      await Promise.all(promises);
      console.log('✅ Database disconnected successfully (all clients)');
    }
  } catch (error) {
    console.error('❌ Database disconnection failed:', error);
  }
};

/**
 * Health check for database
 */
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

// Export getter functions for advanced use cases
export { getPrismaClient, getBatchPrismaClient };

export default prisma;

