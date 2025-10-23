/**
 * Prisma Mock Helper for Unit Tests
 * 
 * Provides utilities for mocking Prisma client in unit tests
 */

import { PrismaClient } from '../../src/generated/prisma';
import { setMockPrismaClient, clearMockPrismaClient } from '../../src/config/database';

/**
 * Create a mock Prisma client with stubbed methods
 * 
 * @example
 * ```typescript
 * const mockPrisma = createMockPrismaClient({
 *   agreement: {
 *     findUnique: sinon.stub().resolves({ id: '1', ... }),
 *     update: sinon.stub().resolves({ id: '1', ... }),
 *   }
 * });
 * 
 * setupPrismaMock(mockPrisma);
 * ```
 */
export function createMockPrismaClient(stubs: Partial<PrismaClient> = {}): Partial<PrismaClient> {
  return {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $transaction: async (fn: any) => fn,
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    ...stubs,
  } as any;
}

/**
 * Setup Prisma mock for the current test
 * Call this in beforeEach() or at the start of your test
 */
export function setupPrismaMock(mockClient: Partial<PrismaClient>): void {
  setMockPrismaClient(mockClient as PrismaClient);
}

/**
 * Clear Prisma mock after test
 * Call this in afterEach() or at the end of your test
 */
export function teardownPrismaMock(): void {
  clearMockPrismaClient();
}

/**
 * Convenience function to setup and return a mock Prisma client
 * 
 * @example
 * ```typescript
 * describe('My Service', () => {
 *   let mockPrisma: Partial<PrismaClient>;
 * 
 *   beforeEach(() => {
 *     mockPrisma = mockPrismaForTest({
 *       agreement: {
 *         findUnique: sinon.stub().resolves({ ... }),
 *       }
 *     });
 *   });
 * 
 *   afterEach(() => {
 *     teardownPrismaMock();
 *   });
 * });
 * ```
 */
export function mockPrismaForTest(stubs: Partial<PrismaClient> = {}): Partial<PrismaClient> {
  const mockClient = createMockPrismaClient(stubs);
  setupPrismaMock(mockClient);
  return mockClient;
}

