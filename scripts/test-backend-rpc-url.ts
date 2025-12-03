/**
 * Test Backend RPC URL
 * Makes a request to the backend and checks what RPC it's actually using
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

// Load staging environment
dotenv.config({ path: '.env.staging' });

const STAGING_API_URL = (process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai').replace(/["']/g, '');
const ATOMIC_SWAP_API_KEY = process.env.ATOMIC_SWAP_API_KEY;

async function testBackendRpcUrl() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST: Backend RPC URL Configuration                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`📡 Testing API: ${STAGING_API_URL}`);
  console.log(`🔑 API Key: ${ATOMIC_SWAP_API_KEY ? 'Set ✓' : 'Not set ✗'}\n`);

  try {
    // Make a request that will trigger backend to log its RPC URL
    console.log('🔍 Making request to force backend to log RPC URL...');
    
    const response = await axios.get(
      `${STAGING_API_URL}/api/health`,
      {
        headers: {
          ...(ATOMIC_SWAP_API_KEY ? { 'x-api-key': ATOMIC_SWAP_API_KEY } : {}),
        },
        timeout: 10000,
      }
    );

    console.log(`✅ Health check passed: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
    
    console.log('\n📋 Next steps:');
    console.log('   1. Check DigitalOcean logs for "[CnftService] Initialized with RPC:"');
    console.log('   2. Verify it shows the Helius endpoint');
    console.log('   3. If it shows QuickNode, redeploy the app');
    console.log('\n   Command to check logs:');
    console.log('   doctl apps logs <app-id> --component easyescrow-backend-staging --follow');
    
  } catch (error: any) {
    console.error(`❌ Request failed: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

testBackendRpcUrl().catch(console.error);

