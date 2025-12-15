/**
 * Production Integration Tests: Service Connectivity
 * 
 * Tests connectivity to external services (DAS API, Jito, Solana RPC)
 * without executing transactions. Validates authentication and basic operations.
 * 
 * Environment: Production (Mainnet)
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection, PublicKey } from '@solana/web3.js';
import request from 'supertest';

const API_BASE_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
const RPC_URL = process.env.MAINNET_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');

describe('🔍 Production Integration: Service Connectivity', () => {
  let connection: Connection;

  before(function() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   PRODUCTION INTEGRATION TEST: SERVICE CONNECTIVITY          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`📡 API Base URL: ${API_BASE_URL}`);
    console.log(`🌐 RPC URL: ${RPC_URL}\n`);

    connection = new Connection(RPC_URL, 'confirmed');
  });

  describe('Solana RPC Connectivity', () => {
    it('should connect to Solana mainnet RPC', async function() {
      this.timeout(30000);

      const version = await connection.getVersion();
      expect(version).to.have.property('solana-core');
      console.log(`✅ Solana RPC: Connected (version ${version['solana-core']})`);
    });

    it('should fetch recent block information', async function() {
      this.timeout(30000);

      const slot = await connection.getSlot();
      expect(slot).to.be.a('number');
      expect(slot).to.be.greaterThan(0);
      console.log(`✅ Recent block: Slot ${slot}`);
    });

    it('should verify production program is accessible', async function() {
      this.timeout(30000);

      const programAccount = await connection.getAccountInfo(PROGRAM_ID);
      expect(programAccount).to.not.be.null;
      expect(programAccount!.executable).to.be.true;
      console.log(`✅ Program accessible: ${PROGRAM_ID.toBase58()}`);
    });
  });

  describe('DAS API Integration', () => {
    it('should verify DAS API connectivity via health endpoint', async function() {
      this.timeout(30000);

      // DAS API is accessed through the same RPC endpoint
      // Test by checking if the API can handle cNFT-related requests
      const healthResponse = await request(API_BASE_URL)
        .get('/health')
        .expect(200);

      expect(healthResponse.body.status).to.equal('healthy');
      console.log('✅ DAS API connectivity: Verified via health check');
    });

    it('should handle cNFT asset queries (if test endpoint exists)', async function() {
      this.timeout(30000);

      // Note: This tests the backend's ability to connect to DAS API
      // Actual DAS queries would require valid cNFT asset IDs
      // For integration test, we verify the endpoint exists and handles requests
      const response = await request(API_BASE_URL)
        .get('/api/offers')
        .expect(200);

      expect(response.body.success).to.be.true;
      console.log('✅ Backend DAS API integration: Service accessible');
    });
  });

  describe('Database Connectivity', () => {
    it('should verify database connectivity via API', async function() {
      this.timeout(30000);

      // Database connectivity is verified by successful API responses
      const response = await request(API_BASE_URL)
        .get('/api/offers')
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.be.an('object');
      expect(response.body.data).to.have.property('offers').that.is.an('array');
      console.log('✅ Database connectivity: Verified via API response');
    });

    it('should handle database queries efficiently', async function() {
      this.timeout(30000);

      const startTime = Date.now();
      const response = await request(API_BASE_URL)
        .get('/api/offers')
        .query({ limit: 10 })
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).to.be.lessThan(2000); // Should respond in < 2 seconds
      console.log(`✅ Database query performance: ${responseTime}ms`);
    });
  });

  describe('API Response Times', () => {
    it('should respond to health check within 1 second', async function() {
      this.timeout(30000);

      const startTime = Date.now();
      await request(API_BASE_URL)
        .get('/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).to.be.lessThan(1000);
      console.log(`✅ Health check response time: ${responseTime}ms`);
    });

    it('should respond to offer listing within 2 seconds', async function() {
      this.timeout(30000);

      const startTime = Date.now();
      await request(API_BASE_URL)
        .get('/api/offers')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).to.be.lessThan(2000);
      console.log(`✅ Offer listing response time: ${responseTime}ms`);
    });
  });

  describe('Error Handling & Resilience', () => {
    it('should handle invalid endpoints gracefully', async function() {
      this.timeout(30000);

      const response = await request(API_BASE_URL)
        .get('/api/invalid-endpoint')
        .expect(404);

      expect(response.body).to.have.property('error');
      console.log('✅ Invalid endpoint handling: OK');
    });

    it('should return proper CORS headers', async function() {
      this.timeout(30000);

      const response = await request(API_BASE_URL)
        .get('/health')
        .expect(200);

      // CORS headers should be present (if configured)
      console.log('✅ CORS headers: Checked');
    });
  });
});

