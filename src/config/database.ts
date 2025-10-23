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
    _prismaClient = global.prisma || new PrismaClient({
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
    if (_prismaClient) {
      await _prismaClient.$disconnect();
      console.log('✅ Database disconnected successfully');
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

// Export getter function for advanced use cases
export { getPrismaClient };

export default prisma;

