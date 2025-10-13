import { PrismaClient } from '../../src/generated/prisma';
import { execSync } from 'child_process';

let prisma: PrismaClient;

/**
 * Setup test database
 * Creates a new PrismaClient instance for testing
 */
export const setupTestDatabase = async (): Promise<PrismaClient> => {
  // Use test database URL if provided, otherwise use the default with a test schema
  const testDatabaseUrl = process.env.TEST_DATABASE_URL || 
    process.env.DATABASE_URL?.replace('schema=public', 'schema=test');

  if (!testDatabaseUrl) {
    throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set for testing');
  }

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
  try {
    execSync('npx prisma migrate reset --force --skip-seed', {
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL },
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

