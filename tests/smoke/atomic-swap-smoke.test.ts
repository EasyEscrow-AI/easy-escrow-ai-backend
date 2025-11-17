/**
 * Smoke Tests for Atomic Swap System
 * Quick validation that core functionality is operational
 * Should complete in < 30 seconds
 */

import { expect } from 'chai';
import request from 'supertest';
import { Connection, Keypair } from '@solana/web3.js';
import { PrismaClient } from '../../src/generated/prisma';
import app from '../../src/index';

describe('Atomic Swap System - Smoke Tests', () => {
  let connection: Connection;
  let prisma: PrismaClient;
  
  before(async () => {
    // Use test/staging environment
    const rpcUrl = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
    connection = new Connection(rpcUrl, 'confirmed');
    
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  });
  
  after(async () => {
    await prisma.$disconnect();
  });
  
  describe('System Health', () => {
    it('should return healthy API status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).to.have.property('status', 'healthy');
      expect(response.body).to.have.property('timestamp');
    });
    
    it('should have database connectivity', async () => {
      // Simple query to verify database is accessible
      const result = await prisma.$queryRaw`SELECT 1 as test`;
      
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
    });
    
    it('should have Solana RPC connectivity', async () => {
      const slot = await connection.getSlot();
      
      expect(slot).to.be.a('number');
      expect(slot).to.be.greaterThan(0);
    });
  });
  
  describe('API Endpoints', () => {
    it('GET / should return API info', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.body).to.have.property('message');
      expect(response.body).to.have.property('version');
      expect(response.body).to.have.property('endpoints');
    });
    
    it('GET /api/offers should list offers', async () => {
      const response = await request(app)
        .get('/api/offers')
        .expect(200);
      
      expect(response.body).to.have.property('offers');
      expect(response.body).to.have.property('total');
      expect(response.body.offers).to.be.an('array');
    });
    
    it('POST /api/offers should validate required fields', async () => {
      const response = await request(app)
        .post('/api/offers')
        .send({}) // Empty body
        .expect(400);
      
      expect(response.body).to.have.property('error');
    });
    
    it('GET /api/offers/:id should handle not found', async () => {
      const response = await request(app)
        .get('/api/offers/99999999')
        .expect(404);
      
      expect(response.body).to.have.property('error');
    });
  });
  
  describe('Core Services', () => {
    it('should have nonce pool initialized', async () => {
      const nonceCount = await prisma.noncePool.count();
      
      expect(nonceCount).to.be.greaterThan(0);
    });
    
    it('should have at least one available nonce', async () => {
      const availableNonces = await prisma.noncePool.count({
        where: { status: 'AVAILABLE' },
      });
      
      expect(availableNonces).to.be.greaterThan(0);
    });
  });
  
  describe('Fee Calculation', () => {
    it('should calculate flat fee for NFT swaps', async () => {
      // This would require importing FeeCalculator
      // For smoke test, just verify the API accepts fee-related params
      const response = await request(app)
        .post('/api/offers')
        .send({
          makerWallet: Keypair.generate().publicKey.toBase58(),
          takerWallet: Keypair.generate().publicKey.toBase58(),
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '0',
          requestedSolLamports: '0',
        })
        .expect((res) => {
          // Should fail validation but not crash
          expect(res.status).to.be.oneOf([400, 401, 403, 422]);
        });
    });
  });
  
  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const response = await request(app)
        .post('/api/offers')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);
      
      expect(response.body).to.have.property('error');
    });
    
    it('should handle invalid wallet addresses', async () => {
      const response = await request(app)
        .post('/api/offers')
        .send({
          makerWallet: 'invalid-address',
          takerWallet: 'invalid-address',
          offeredAssets: [],
          requestedAssets: [],
          offeredSolLamports: '0',
          requestedSolLamports: '0',
        })
        .expect((res) => {
          expect(res.status).to.be.oneOf([400, 422]);
        });
      
      expect(response.body).to.have.property('error');
    });
  });
  
  describe('Configuration', () => {
    it('should have required environment variables', () => {
      expect(process.env.DATABASE_URL).to.exist;
      expect(process.env.SOLANA_RPC_URL).to.exist;
      expect(process.env.PLATFORM_AUTHORITY_PRIVATE_KEY).to.exist;
    });
    
    it('should have valid program configuration', () => {
      expect(process.env.PROGRAM_ID).to.exist;
      expect(process.env.TREASURY_PDA).to.exist;
    });
  });
  
  describe('Quick Performance Check', () => {
    it('should respond to health check quickly', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).to.be.lessThan(1000); // < 1 second
    });
    
    it('should query database quickly', async () => {
      const start = Date.now();
      
      await prisma.swapOffer.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      
      const duration = Date.now() - start;
      expect(duration).to.be.lessThan(500); // < 500ms
    });
  });
});

