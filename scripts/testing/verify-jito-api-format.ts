#!/usr/bin/env ts-node
/**
 * Jito API Format Verification Script
 * 
 * This script verifies the correct format for Jito Block Engine API calls
 * by testing both the test helper format and production code format.
 * 
 * Usage:
 *   ts-node scripts/testing/verify-jito-api-format.ts
 * 
 * This will:
 * 1. Test getBundleStatuses with both param formats
 * 2. Show the actual response structure
 * 3. Verify which format is correct
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment
dotenv.config({ path: path.join(__dirname, '../../.env.production'), override: true });

const JITO_BUNDLE_ENDPOINT = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';

// Test bundle IDs (using invalid IDs to see response format without actually checking status)
const TEST_BUNDLE_IDS = [
  '00000000-0000-0000-0000-000000000000', // Invalid UUID format
  'test-bundle-id-123', // Invalid format
];

async function testGetBundleStatusesFormat() {
  console.log('\n🧪 Testing getBundleStatuses API Format');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test Format 1: Single array (production code format)
  console.log('📋 TEST 1: Single Array Format (Production Code)');
  console.log('───────────────────────────────────────────────────────────\n');
  console.log('Request Format:');
  console.log(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getBundleStatuses',
    params: [TEST_BUNDLE_IDS], // Single array
  }, null, 2));
  console.log();

  try {
    const response1 = await fetch(JITO_BUNDLE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBundleStatuses',
        params: [TEST_BUNDLE_IDS],
      }),
    });

    const result1 = await response1.json() as {
      result?: any;
      error?: { message?: string; code?: number };
    };
    console.log('Response Status:', response1.status);
    console.log('Response Body:');
    console.log(JSON.stringify(result1, null, 2));
    console.log();

    if (result1.result) {
      console.log('✅ Response has result field');
      console.log('   Result type:', typeof result1.result);
      console.log('   Result structure:', Array.isArray(result1.result) ? 'Array' : 'Object');
      if (result1.result && typeof result1.result === 'object' && 'value' in result1.result) {
        console.log('   Result.value type:', typeof result1.result.value);
        console.log('   Result.value is array:', Array.isArray(result1.result.value));
      }
    } else if (result1.error) {
      console.log('⚠️  Response has error (expected with invalid bundle IDs)');
      console.log('   Error:', result1.error);
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
  }

  console.log('\n───────────────────────────────────────────────────────────\n');

  // Test Format 2: Nested array (test helper format)
  console.log('📋 TEST 2: Nested Array Format (Test Helper)');
  console.log('───────────────────────────────────────────────────────────\n');
  console.log('Request Format:');
  console.log(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getBundleStatuses',
    params: TEST_BUNDLE_IDS.map(id => [id]), // Nested array
  }, null, 2));
  console.log();

  try {
    const response2 = await fetch(JITO_BUNDLE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBundleStatuses',
        params: TEST_BUNDLE_IDS.map(id => [id]),
      }),
    });

    const result2 = await response2.json() as {
      result?: any;
      error?: { message?: string; code?: number };
    };
    console.log('Response Status:', response2.status);
    console.log('Response Body:');
    console.log(JSON.stringify(result2, null, 2));
    console.log();

    if (result2.result) {
      console.log('✅ Response has result field');
      console.log('   Result type:', typeof result2.result);
      console.log('   Result structure:', Array.isArray(result2.result) ? 'Array' : 'Object');
      if (result2.result && typeof result2.result === 'object' && 'value' in result2.result) {
        console.log('   Result.value type:', typeof result2.result.value);
        console.log('   Result.value is array:', Array.isArray(result2.result.value));
      }
    } else if (result2.error) {
      console.log('⚠️  Response has error (expected with invalid bundle IDs)');
      console.log('   Error:', result2.error);
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
  }

  console.log('\n───────────────────────────────────────────────────────────\n');

  // Test Format 3: Direct array (alternative)
  console.log('📋 TEST 3: Direct Array Format (Alternative)');
  console.log('───────────────────────────────────────────────────────────\n');
  console.log('Request Format:');
  console.log(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getBundleStatuses',
    params: TEST_BUNDLE_IDS, // Direct array
  }, null, 2));
  console.log();

  try {
    const response3 = await fetch(JITO_BUNDLE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBundleStatuses',
        params: TEST_BUNDLE_IDS,
      }),
    });

    const result3 = await response3.json() as {
      result?: any;
      error?: { message?: string; code?: number };
    };
    console.log('Response Status:', response3.status);
    console.log('Response Body:');
    console.log(JSON.stringify(result3, null, 2));
    console.log();

    if (result3.result) {
      console.log('✅ Response has result field');
      console.log('   Result type:', typeof result3.result);
      console.log('   Result structure:', Array.isArray(result3.result) ? 'Array' : 'Object');
      if (result3.result && typeof result3.result === 'object' && 'value' in result3.result) {
        console.log('   Result.value type:', typeof result3.result.value);
        console.log('   Result.value is array:', Array.isArray(result3.result.value));
      }
    } else if (result3.error) {
      console.log('⚠️  Response has error (expected with invalid bundle IDs)');
      console.log('   Error:', result3.error);
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
  }
}

async function testSendBundleResponseFormat() {
  console.log('\n🧪 Testing sendBundle Response Format');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Note: We cannot test sendBundle without valid transactions.');
  console.log('This test shows the expected response format based on:');
  console.log('1. Test helper format: result.result.bundleId');
  console.log('2. Production code format: result.result (string)');
  console.log();
  console.log('To verify sendBundle format, check actual production logs');
  console.log('or review successful bundle submissions in E2E tests.');
  console.log();
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Jito API Format Verification                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await testGetBundleStatusesFormat();
  await testSendBundleResponseFormat();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Format verification complete!');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('📝 Summary:');
  console.log('   - Check the response structures above');
  console.log('   - Compare with test helper format (nested)');
  console.log('   - Compare with production code format (flat)');
  console.log('   - Update code to match the format that works');
  console.log();
}

main().catch((error) => {
  console.error('\n❌ Verification failed:', error);
  process.exit(1);
});

