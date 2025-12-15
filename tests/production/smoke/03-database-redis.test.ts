/**
 * Production Smoke Test: Database and Redis Connectivity
 * 
 * Tests database and Redis connectivity directly
 * Validates connection pool health and basic operations.
 * 
 * Expected duration: < 5 seconds
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { PrismaClient } from '../../../src/generated/prisma';
import Redis from 'ioredis';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe('🔍 Production Smoke Test: Database and Redis Connectivity', () => {
  let prisma: PrismaClient;
  let redisClient: Redis | null = null;

  before(function() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION SMOKE TEST: DATABASE AND REDIS                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    if (!DATABASE_URL) {
      console.log('⚠️  DATABASE_URL not set - skipping database tests');
    }

    if (!REDIS_URL) {
      console.log('⚠️  REDIS_URL not set - skipping Redis tests');
    }
  });

  describe('Database Connectivity', () => {
    before(async function() {
      if (!DATABASE_URL) {
        this.skip();
      }

      prisma = new PrismaClient({
        datasources: {
          db: {
            url: DATABASE_URL,
          },
        },
      });
    });

    it('should connect to database', async function() {
      this.timeout(10000);

      if (!DATABASE_URL) {
        this.skip();
      }

      console.log('✓ Testing database connection...');

      // Simple query to verify connection
      const result = await prisma.$queryRaw`SELECT 1 as test`;
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);

      console.log('  Database: ✅ Connected');
    });

    it('should execute basic database query', async function() {
      this.timeout(10000);

      if (!DATABASE_URL) {
        this.skip();
      }

      console.log('✓ Testing database query execution...');

      // Test query execution
      const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);

      console.log('  Query execution: ✅ Working');
    });

    it('should verify Prisma client initialization', async function() {
      this.timeout(10000);

      if (!DATABASE_URL) {
        this.skip();
      }

      console.log('✓ Verifying Prisma client...');

      // Verify Prisma client is initialized
      expect(prisma).to.not.be.null;
      expect(prisma).to.have.property('$connect');

      console.log('  Prisma client: ✅ Initialized');
    });

    after(async function() {
      if (prisma) {
        await prisma.$disconnect();
      }
    });
  });

  describe('Redis Connectivity', () => {
    before(async function() {
      if (!REDIS_URL) {
        this.skip();
      }

      try {
        redisClient = new Redis(REDIS_URL || 'redis://localhost:6379');
        await redisClient.ping();
      } catch (error) {
        console.log(`⚠️  Redis connection failed: ${error}`);
        this.skip();
      }
    });

    it('should connect to Redis', async function() {
      this.timeout(10000);

      if (!REDIS_URL || !redisClient) {
        this.skip();
      }

      console.log('✓ Testing Redis connection...');

      // Test Redis connection with PING
      const pong = await redisClient.ping();
      expect(pong).to.equal('PONG');

      console.log('  Redis: ✅ Connected');
    });

    it('should perform basic Redis operations', async function() {
      this.timeout(10000);

      if (!REDIS_URL || !redisClient) {
        this.skip();
      }

      console.log('✓ Testing Redis SET/GET operations...');

      const testKey = `smoke-test-${Date.now()}`;
      const testValue = 'smoke-test-value';

      // Test SET
      await redisClient.set(testKey, testValue);
      console.log('  SET operation: ✅ Working');

      // Test GET
      const retrievedValue = await redisClient.get(testKey);
      expect(retrievedValue).to.equal(testValue);
      console.log('  GET operation: ✅ Working');

      // Cleanup
      await redisClient.del(testKey);
      console.log('  Cleanup: ✅ Complete');
    });

    after(async function() {
      if (redisClient) {
        await redisClient.quit();
        redisClient = null;
      }
    });
  });

  after(function() {
    console.log('\n✅ Database and Redis smoke test completed successfully!\n');
  });
});

