/**
 * Flush institution-related Redis caches after seeding.
 *
 * Clears stale cached data that references old client IDs, wallets, or balances.
 * Automatically called by `npm run seed:staging:refresh`.
 *
 * Usage: REDIS_URL=rediss://... npx ts-node scripts/flush-redis-cache.ts
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.log('⏭️  REDIS_URL not set — skipping cache flush');
  process.exit(0);
}

async function flush() {
  const redis = new Redis(REDIS_URL!, { lazyConnect: true, connectTimeout: 10000 });

  try {
    await redis.connect();
    console.log('🔄 Flushing institution Redis caches...\n');

    // 1. Allowlist SET (no TTL — must be explicitly cleared)
    const allowlistDel = await redis.del('institution:allowlist');
    console.log(`   institution:allowlist (SET)        → ${allowlistDel ? 'cleared' : 'already empty'}`);

    // 2. Allowlist metadata hashes (24h TTL, but stale after reseed)
    const metaKeys = await redis.keys('institution:allowlist:meta:*');
    if (metaKeys.length > 0) {
      await redis.del(...metaKeys);
    }
    console.log(`   institution:allowlist:meta:*       → ${metaKeys.length} keys cleared`);

    // 3. Account balance caches (5min TTL, but clear for immediate accuracy)
    const balanceKeys = await redis.keys('institution:account:balance:*');
    if (balanceKeys.length > 0) {
      await redis.del(...balanceKeys);
    }
    console.log(`   institution:account:balance:*      → ${balanceKeys.length} keys cleared`);

    // 4. Escrow pause state (5min TTL)
    const pauseDel = await redis.del('institution:escrow:system:paused');
    console.log(`   institution:escrow:system:paused   → ${pauseDel ? 'cleared' : 'already empty'}`);

    // 5. Generic cache keys that may reference institution data
    const cacheKeys = await redis.keys('cache:*');
    if (cacheKeys.length > 0) {
      await redis.del(...cacheKeys);
    }
    console.log(`   cache:*                            → ${cacheKeys.length} keys cleared`);

    // 6. Agreement cache keys
    const agreementKeys = await redis.keys('agreement:*');
    if (agreementKeys.length > 0) {
      await redis.del(...agreementKeys);
    }
    console.log(`   agreement:*                        → ${agreementKeys.length} keys cleared`);

    const total = allowlistDel + metaKeys.length + balanceKeys.length + pauseDel + cacheKeys.length + agreementKeys.length;
    console.log(`\n✅ Cache flush complete (${total} keys cleared)`);
  } catch (err: any) {
    console.error(`❌ Redis flush failed: ${err.message}`);
    console.log('   Seeds are still valid — caches will expire via TTL');
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

flush();
