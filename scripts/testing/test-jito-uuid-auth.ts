#!/usr/bin/env ts-node
/**
 * Test Jito UUID Authentication
 *
 * Tests that the Jito UUID is accepted for higher rate limits.
 *
 * Usage:
 *   JITO_AUTH_UUID=f1e233d0-6831-4831-9ea6-4123e029f4f2 npx ts-node scripts/testing/test-jito-uuid-auth.ts
 */

const JITO_AUTH_UUID = process.env.JITO_AUTH_UUID;
const JITO_BUNDLE_ENDPOINT = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';

// Test bundle ID (invalid, just to test auth)
const TEST_BUNDLE_ID = '00000000-0000-0000-0000-000000000000';

async function testWithoutAuth() {
  console.log('\n📋 TEST 1: Without UUID Auth');
  console.log('─'.repeat(50));

  const response = await fetch(JITO_BUNDLE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBundleStatuses',
      params: [[TEST_BUNDLE_ID]],
    }),
  });

  console.log(`   Status: ${response.status}`);
  console.log(`   Headers: ${response.headers.get('x-ratelimit-remaining') || 'N/A'}`);
  const result = await response.json();
  console.log(`   Response: ${JSON.stringify(result).slice(0, 100)}...`);
  return response.status;
}

async function testWithAuth() {
  if (!JITO_AUTH_UUID) {
    console.log('\n⚠️  JITO_AUTH_UUID not set, skipping auth test');
    return null;
  }

  console.log('\n📋 TEST 2: With UUID Auth');
  console.log('─'.repeat(50));
  console.log(`   UUID: ${JITO_AUTH_UUID.slice(0, 8)}...`);

  const response = await fetch(JITO_BUNDLE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jito-auth': JITO_AUTH_UUID,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBundleStatuses',
      params: [[TEST_BUNDLE_ID]],
    }),
  });

  console.log(`   Status: ${response.status}`);
  console.log(`   Headers: ${response.headers.get('x-ratelimit-remaining') || 'N/A'}`);
  const result = await response.json();
  console.log(`   Response: ${JSON.stringify(result).slice(0, 100)}...`);
  return response.status;
}

async function testRateLimitBurst() {
  if (!JITO_AUTH_UUID) {
    console.log('\n⚠️  JITO_AUTH_UUID not set, skipping burst test');
    return;
  }

  console.log('\n📋 TEST 3: Rate Limit Burst Test (5 rapid requests)');
  console.log('─'.repeat(50));

  const results: number[] = [];

  // Send 5 requests rapidly (should work with 5 rps limit)
  for (let i = 0; i < 5; i++) {
    const response = await fetch(JITO_BUNDLE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-jito-auth': JITO_AUTH_UUID,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: i + 1,
        method: 'getBundleStatuses',
        params: [[TEST_BUNDLE_ID]],
      }),
    });
    results.push(response.status);
  }

  const successCount = results.filter(s => s === 200).length;
  const rateLimitCount = results.filter(s => s === 429).length;

  console.log(`   Results: ${results.join(', ')}`);
  console.log(`   Success: ${successCount}/5`);
  console.log(`   Rate Limited: ${rateLimitCount}/5`);

  if (successCount === 5) {
    console.log('   ✅ All requests succeeded - UUID auth working!');
  } else if (rateLimitCount > 0) {
    console.log('   ⚠️  Some requests rate limited');
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Jito UUID Authentication Test                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (!JITO_AUTH_UUID) {
    console.log('\n❌ JITO_AUTH_UUID environment variable not set!');
    console.log('\nUsage:');
    console.log('  $env:JITO_AUTH_UUID="f1e233d0-6831-4831-9ea6-4123e029f4f2"');
    console.log('  npx ts-node scripts/testing/test-jito-uuid-auth.ts');
    process.exit(1);
  }

  await testWithoutAuth();
  await testWithAuth();
  await testRateLimitBurst();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ UUID authentication test complete!');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
