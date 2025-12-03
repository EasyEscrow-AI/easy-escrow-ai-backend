#!/usr/bin/env ts-node
/**
 * Staging Security Testing Script
 * 
 * Tests various security aspects of the staging environment
 */

import axios from 'axios';

const STAGING_API_URL = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const API_KEY = process.env.ATOMIC_SWAP_API_KEY || '';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

async function runSecurityTests() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   STAGING SECURITY TESTING                               ║');
  console.log('║   Testing Authorization, Rate Limiting, and Security     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Test 1: Health endpoint (should be public)
  await testHealthEndpoint();

  // Test 2: Unauthorized access to protected endpoint
  await testUnauthorizedAccess();

  // Test 3: Invalid API key
  await testInvalidApiKey();

  // Test 4: Valid API key (if provided)
  if (API_KEY) {
    await testValidApiKey();
  }

  // Test 5: CORS headers
  await testCorsHeaders();

  // Test 6: Rate limiting (if implemented)
  await testRateLimiting();

  // Print results
  printResults();
}

async function testHealthEndpoint() {
  try {
    const response = await axios.get(`${STAGING_API_URL}/health`);
    
    if (response.status === 200 && response.data.status === 'healthy') {
      results.push({
        name: 'Health Endpoint',
        passed: true,
        message: 'Health endpoint accessible without authentication',
        details: {
          database: response.data.database,
          redis: response.data.redis,
          noncePool: response.data.noncePool
        }
      });
    } else {
      results.push({
        name: 'Health Endpoint',
        passed: false,
        message: 'Health endpoint returned unexpected response',
        details: response.data
      });
    }
  } catch (error: any) {
    results.push({
      name: 'Health Endpoint',
      passed: false,
      message: `Health endpoint failed: ${error.message}`,
      details: error.response?.data
    });
  }
}

async function testUnauthorizedAccess() {
  try {
    // Attempt to create offer without API key
    const response = await axios.post(
      `${STAGING_API_URL}/api/offers/create`,
      {
        maker: 'test-maker',
        taker: 'test-taker'
      },
      {
        validateStatus: () => true // Don't throw on any status
      }
    );

    if (response.status === 401 || response.status === 403) {
      results.push({
        name: 'Unauthorized Access Prevention',
        passed: true,
        message: `Protected endpoint correctly rejected unauthorized request (${response.status})`,
        details: response.data
      });
    } else {
      results.push({
        name: 'Unauthorized Access Prevention',
        passed: false,
        message: `Protected endpoint did not reject unauthorized request (got ${response.status})`,
        details: response.data
      });
    }
  } catch (error: any) {
    // If it throws, check if it's the expected auth error
    if (error.response?.status === 401 || error.response?.status === 403) {
      results.push({
        name: 'Unauthorized Access Prevention',
        passed: true,
        message: 'Protected endpoint correctly rejected unauthorized request',
        details: error.response.data
      });
    } else {
      results.push({
        name: 'Unauthorized Access Prevention',
        passed: false,
        message: `Unexpected error: ${error.message}`,
        details: error.response?.data
      });
    }
  }
}

async function testInvalidApiKey() {
  try {
    const response = await axios.post(
      `${STAGING_API_URL}/api/offers/create`,
      {
        maker: 'test-maker',
        taker: 'test-taker'
      },
      {
        headers: {
          'x-api-key': 'invalid-key-12345'
        },
        validateStatus: () => true
      }
    );

    if (response.status === 401 || response.status === 403) {
      results.push({
        name: 'Invalid API Key Rejection',
        passed: true,
        message: 'Invalid API key correctly rejected',
        details: response.data
      });
    } else {
      results.push({
        name: 'Invalid API Key Rejection',
        passed: false,
        message: `Invalid API key not rejected (got ${response.status})`,
        details: response.data
      });
    }
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      results.push({
        name: 'Invalid API Key Rejection',
        passed: true,
        message: 'Invalid API key correctly rejected'
      });
    } else {
      results.push({
        name: 'Invalid API Key Rejection',
        passed: false,
        message: `Unexpected error: ${error.message}`
      });
    }
  }
}

async function testValidApiKey() {
  try {
    // Just test that the endpoint responds, not that it creates an offer
    // (we don't want to spam staging with test offers)
    const response = await axios.post(
      `${STAGING_API_URL}/api/offers/create`,
      {
        // Invalid data to trigger validation error, not auth error
        maker: 'invalid'
      },
      {
        headers: {
          'x-api-key': API_KEY
        },
        validateStatus: () => true
      }
    );

    // We expect a 400 (validation error), not 401/403 (auth error)
    if (response.status !== 401 && response.status !== 403) {
      results.push({
        name: 'Valid API Key Accepted',
        passed: true,
        message: `Valid API key accepted (got ${response.status}, not auth error)`,
        details: response.data
      });
    } else {
      results.push({
        name: 'Valid API Key Accepted',
        passed: false,
        message: `Valid API key rejected (got ${response.status})`,
        details: response.data
      });
    }
  } catch (error: any) {
    results.push({
      name: 'Valid API Key Accepted',
      passed: false,
      message: `Error testing valid API key: ${error.message}`
    });
  }
}

async function testCorsHeaders() {
  try {
    const response = await axios.options(`${STAGING_API_URL}/api/offers`, {
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST'
      }
    });

    const hasCors = response.headers['access-control-allow-origin'] !== undefined;
    
    results.push({
      name: 'CORS Headers',
      passed: hasCors,
      message: hasCors ? 'CORS headers present' : 'CORS headers missing',
      details: {
        'access-control-allow-origin': response.headers['access-control-allow-origin'],
        'access-control-allow-methods': response.headers['access-control-allow-methods']
      }
    });
  } catch (error: any) {
    results.push({
      name: 'CORS Headers',
      passed: false,
      message: `Error testing CORS: ${error.message}`
    });
  }
}

async function testRateLimiting() {
  try {
    // Send 10 rapid requests to health endpoint
    const promises = Array(10).fill(null).map(() => 
      axios.get(`${STAGING_API_URL}/health`, {
        validateStatus: () => true
      })
    );

    const responses = await Promise.all(promises);
    const tooManyRequests = responses.some(r => r.status === 429);

    if (tooManyRequests) {
      results.push({
        name: 'Rate Limiting',
        passed: true,
        message: 'Rate limiting is active (got 429 status)'
      });
    } else {
      results.push({
        name: 'Rate Limiting',
        passed: false,
        message: 'Rate limiting not detected (all requests succeeded)',
        details: 'Consider implementing rate limiting for production'
      });
    }
  } catch (error: any) {
    results.push({
      name: 'Rate Limiting',
      passed: false,
      message: `Error testing rate limiting: ${error.message}`
    });
  }
}

function printResults() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 TEST RESULTS:\n');

  let passed = 0;
  let failed = 0;

  results.forEach((result, index) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${index + 1}. ${icon} ${result.name}`);
    console.log(`   ${result.message}`);
    if (result.details) {
      console.log(`   Details:`, JSON.stringify(result.details, null, 2));
    }
    console.log('');

    if (result.passed) passed++;
    else failed++;
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📈 Summary: ${passed}/${results.length} tests passed`);
  
  if (failed === 0) {
    console.log('✅ ALL SECURITY TESTS PASSED!\n');
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Review findings above.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runSecurityTests().catch(error => {
  console.error('Fatal error running security tests:', error);
  process.exit(1);
});

