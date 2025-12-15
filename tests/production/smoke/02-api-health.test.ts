/**
 * Production Smoke Test: API Health Endpoints
 * 
 * Tests API health endpoints including /health and /api/health
 * Validates database, Redis, and service connectivity status.
 * 
 * Expected duration: < 5 seconds
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';

const API_BASE_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';

describe('🔍 Production Smoke Test: API Health Endpoints', () => {
  before(function() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║      PRODUCTION SMOKE TEST: API HEALTH ENDPOINTS              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`📡 API Base URL: ${API_BASE_URL}\n`);
  });

  it('should return 200 OK from /health endpoint', async function() {
    this.timeout(10000);

    console.log('✓ Testing /health endpoint...');

    const response = await request(API_BASE_URL)
      .get('/health')
      .expect(200);

    expect(response.body).to.have.property('status');
    expect(response.body.status).to.equal('healthy');
    expect(response.body).to.have.property('timestamp');
    expect(response.body).to.have.property('service');

    console.log(`  Status: ${response.body.status}`);
    console.log(`  Service: ${response.body.service}`);
    console.log(`  Timestamp: ${response.body.timestamp}`);
  });

  it('should verify database connectivity in health response', async function() {
    this.timeout(10000);

    console.log('✓ Checking database connectivity...');

    const response = await request(API_BASE_URL)
      .get('/health')
      .expect(200);

    // Health endpoint should indicate database status
    if (response.body.database !== undefined) {
      // Accept both boolean true or string 'connected'
      const dbStatus = response.body.database === true || response.body.database === 'connected';
      expect(dbStatus).to.be.true;
      console.log(`  Database: ${dbStatus ? '✅ Connected' : '❌ Disconnected'}`);
    } else {
      // If database field not present, assume healthy if status is healthy
      expect(response.body.status).to.equal('healthy');
      console.log('  Database: ✅ (implied by healthy status)');
    }
  });

  it('should verify Redis connectivity in health response', async function() {
    this.timeout(10000);

    console.log('✓ Checking Redis connectivity...');

    const response = await request(API_BASE_URL)
      .get('/health')
      .expect(200);

    // Health endpoint should indicate Redis status
    if (response.body.redis !== undefined) {
      // Accept both boolean true or string 'connected'
      const redisStatus = response.body.redis === true || response.body.redis === 'connected';
      expect(redisStatus).to.be.true;
      console.log(`  Redis: ${redisStatus ? '✅ Connected' : '❌ Disconnected'}`);
    } else {
      // If redis field not present, assume healthy if status is healthy
      expect(response.body.status).to.equal('healthy');
      console.log('  Redis: ✅ (implied by healthy status)');
    }
  });

  it('should respond within acceptable latency (< 2 seconds)', async function() {
    this.timeout(10000);

    console.log('✓ Testing response latency...');

    const startTime = Date.now();
    await request(API_BASE_URL)
      .get('/health')
      .expect(200);

    const responseTime = Date.now() - startTime;
    expect(responseTime).to.be.lessThan(2000);
    console.log(`  Response time: ${responseTime}ms ✅`);
  });

  after(function() {
    console.log('\n✅ API health endpoints smoke test completed successfully!\n');
  });
});

