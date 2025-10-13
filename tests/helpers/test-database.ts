import { PrismaClient } from '../../src/generated/prisma';
import { execSync } from 'child_process';

let prisma: PrismaClient;

/**
 * Safely derives a test database URL by ensuring the schema is set to 'test'
 * @param baseUrl - The base database URL to modify
 * @returns A URL with schema=test
 */
const deriveTestDatabaseUrl = (baseUrl: string): string => {
  try {
    const url = new URL(baseUrl);
    
    // Set or update the schema parameter to 'test'
    url.searchParams.set('schema', 'test');
    
    return url.toString();
  } catch (error) {
    throw new Error(`Invalid database URL format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Validates that the database URL is safe for testing
 * @param url - The database URL to validate
 * @throws Error if the URL appears to be a production database
 */
const validateTestDatabaseUrl = (url: string): void => {
  // Check that the URL contains schema=test
  if (!url.includes('schema=test')) {
    throw new Error(
      'UNSAFE: Test database URL must use schema=test to prevent data corruption. ' +
      'Current URL does not contain schema=test. ' +
      'Set TEST_DATABASE_URL environment variable with schema=test'
    );
  }
  
  // Additional safety check: ensure it's not explicitly using schema=public
  if (url.includes('schema=public')) {
    throw new Error(
      'UNSAFE: Test database URL contains schema=public. ' +
      'This would run tests against the production database. ' +
      'Set TEST_DATABASE_URL with schema=test'
    );
  }
};

/**
 * Setup test database
 * Creates a new PrismaClient instance for testing
 */
export const setupTestDatabase = async (): Promise<PrismaClient> => {
  // Prefer explicit TEST_DATABASE_URL, otherwise derive from DATABASE_URL
  let testDatabaseUrl: string;
  
  if (process.env.TEST_DATABASE_URL) {
    testDatabaseUrl = process.env.TEST_DATABASE_URL;
  } else if (process.env.DATABASE_URL) {
    console.warn('TEST_DATABASE_URL not set, deriving from DATABASE_URL with schema=test');
    testDatabaseUrl = deriveTestDatabaseUrl(process.env.DATABASE_URL);
  } else {
    throw new Error(
      'Neither TEST_DATABASE_URL nor DATABASE_URL is set. ' +
      'Please set TEST_DATABASE_URL for testing.'
    );
  }

  // Critical safety check
  validateTestDatabaseUrl(testDatabaseUrl);

  process.env.DATABASE_URL = testDatabaseUrl;

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: testDatabaseUrl,
      },
    },
  });

  await prisma.$connect();

  return prisma;
};

/**
 * Clean test database
 * Deletes all records from all tables
 */
export const cleanTestDatabase = async (): Promise<void> => {
  if (!prisma) {
    throw new Error('Test database not initialized. Call setupTestDatabase first.');
  }

  // Delete in order to respect foreign key constraints
  await prisma.deposit.deleteMany({});
  await prisma.agreement.deleteMany({});
};

/**
 * Tear down test database
 * Disconnects from database
 */
export const teardownTestDatabase = async (): Promise<void> => {
  if (prisma) {
    await prisma.$disconnect();
  }
};

/**
 * Reset test database
 * Runs migrations and seeds
 */
export const resetTestDatabase = async (): Promise<void> => {
  // Derive and validate test database URL
  let testDatabaseUrl: string;
  
  if (process.env.TEST_DATABASE_URL) {
    testDatabaseUrl = process.env.TEST_DATABASE_URL;
  } else if (process.env.DATABASE_URL) {
    console.warn('TEST_DATABASE_URL not set, deriving from DATABASE_URL with schema=test');
    testDatabaseUrl = deriveTestDatabaseUrl(process.env.DATABASE_URL);
  } else {
    throw new Error(
      'Neither TEST_DATABASE_URL nor DATABASE_URL is set. ' +
      'Please set TEST_DATABASE_URL for testing.'
    );
  }

  // Critical safety check before running destructive operations
  validateTestDatabaseUrl(testDatabaseUrl);

  try {
    execSync('npx prisma migrate reset --force --skip-seed', {
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Failed to reset test database:', error);
    throw error;
  }
};

/**
 * Get test database client
 */
export const getTestDatabaseClient = (): PrismaClient => {
  if (!prisma) {
    throw new Error('Test database not initialized. Call setupTestDatabase first.');
  }
  return prisma;
};

