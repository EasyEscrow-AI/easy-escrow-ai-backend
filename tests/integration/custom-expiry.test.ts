/**
 * Integration Tests for Custom Expiry Feature
 * 
 * Tests custom expiry validation, format support, and extension functionality
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { PrismaClient } from '../../src/generated/prisma';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const prisma = new PrismaClient();

describe('Custom Expiry Integration Tests', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Agreement Creation with Custom Expiry', () => {
    test('should create agreement with preset expiry (12h)', async () => {
      const response = await request(API_URL)
        .post('/v1/agreements')
        .set('X-Idempotency-Key', `test-preset-${Date.now()}`)
        .send({
          nftMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          price: '1000000000',
          seller: '4qxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          buyer: '5rxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          expiry: '12h',
          feeBps: 250,
          honorRoyalties: true
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('agreementId');
      expect(response.body.data).toHaveProperty('expiry');
      
      // Verify expiry is approximately 12 hours from now
      const expiryDate = new Date(response.body.data.expiry);
      const now = new Date();
      const hoursDiff = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeGreaterThan(11.9);
      expect(hoursDiff).toBeLessThan(12.1);
    });

    test('should create agreement with duration in hours (6)', async () => {
      const response = await request(API_URL)
        .post('/v1/agreements')
        .set('X-Idempotency-Key', `test-duration-${Date.now()}`)
        .send({
          nftMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          price: '1000000000',
          seller: '4qxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          buyer: '5rxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          expiry: 6,
          feeBps: 250,
          honorRoyalties: true
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      
      // Verify expiry is approximately 6 hours from now
      const expiryDate = new Date(response.body.data.expiry);
      const now = new Date();
      const hoursDiff = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeGreaterThan(5.9);
      expect(hoursDiff).toBeLessThan(6.1);
    });

    test('should create agreement with absolute timestamp', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 18);

      const response = await request(API_URL)
        .post('/v1/agreements')
        .set('X-Idempotency-Key', `test-timestamp-${Date.now()}`)
        .send({
          nftMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          price: '1000000000',
          seller: '4qxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          buyer: '5rxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          expiry: futureDate.toISOString(),
          feeBps: 250,
          honorRoyalties: true
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      
      // Verify expiry matches our timestamp (within 1 minute buffer)
      const expiryDate = new Date(response.body.data.expiry);
      const timeDiff = Math.abs(expiryDate.getTime() - futureDate.getTime());
      expect(timeDiff).toBeLessThan(120000); // Within 2 minutes (includes 60s buffer)
    });

    test('should reject expiry less than 1 hour', async () => {
      const response = await request(API_URL)
        .post('/v1/agreements')
        .set('X-Idempotency-Key', `test-too-short-${Date.now()}`)
        .send({
          nftMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          price: '1000000000',
          seller: '4qxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          buyer: '5rxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          expiry: 0.5, // 30 minutes
          feeBps: 250,
          honorRoyalties: true
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('1 hour');
    });

    test('should reject expiry greater than 24 hours', async () => {
      const response = await request(API_URL)
        .post('/v1/agreements')
        .set('X-Idempotency-Key', `test-too-long-${Date.now()}`)
        .send({
          nftMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          price: '1000000000',
          seller: '4qxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          buyer: '5rxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          expiry: 48, // 48 hours
          feeBps: 250,
          honorRoyalties: true
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('24 hours');
    });
  });

  describe('Expiry Extension Endpoint', () => {
    let testAgreementId: string;

    beforeAll(async () => {
      // Create a test agreement
      const response = await request(API_URL)
        .post('/v1/agreements')
        .set('X-Idempotency-Key', `test-extension-setup-${Date.now()}`)
        .send({
          nftMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          price: '1000000000',
          seller: '4qxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          buyer: '5rxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9',
          expiry: '6h',
          feeBps: 250,
          honorRoyalties: true
        });

      testAgreementId = response.body.data.agreementId;
    });

    test('should extend expiry by preset duration (6h)', async () => {
      const response = await request(API_URL)
        .post(`/v1/agreements/${testAgreementId}/extend-expiry`)
        .send({
          extension: '6h'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('oldExpiry');
      expect(response.body.data).toHaveProperty('newExpiry');
      expect(response.body.data).toHaveProperty('extensionHours');
      expect(response.body.data.extensionHours).toBeCloseTo(6, 1);
    });

    test('should extend expiry by number of hours (3)', async () => {
      const response = await request(API_URL)
        .post(`/v1/agreements/${testAgreementId}/extend-expiry`)
        .send({
          extension: 3
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.extensionHours).toBeCloseTo(3, 1);
    });

    test('should reject extension exceeding 24-hour maximum', async () => {
      const farFuture = new Date();
      farFuture.setHours(farFuture.getHours() + 48);

      const response = await request(API_URL)
        .post(`/v1/agreements/${testAgreementId}/extend-expiry`)
        .send({
          extension: farFuture.toISOString()
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('24 hours');
    });

    test('should reject extension for non-existent agreement', async () => {
      const response = await request(API_URL)
        .post('/v1/agreements/nonexistent-id/extend-expiry')
        .send({
          extension: '6h'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });
  });

  describe('Database Index Performance', () => {
    test('should query expired agreements efficiently', async () => {
      const startTime = Date.now();
      
      // Query for expired agreements (uses composite index: status, expiry)
      const expiredAgreements = await prisma.agreement.findMany({
        where: {
          status: 'PENDING',
          expiry: {
            lte: new Date()
          }
        },
        take: 200
      });

      const queryTime = Date.now() - startTime;

      // Query should complete quickly with composite index
      expect(queryTime).toBeLessThan(100); // <100ms
      expect(Array.isArray(expiredAgreements)).toBe(true);
    });

    test('should query user-specific agreements efficiently', async () => {
      const startTime = Date.now();
      
      // Query for user's expiring agreements (uses composite index: expiry, seller, buyer)
      const userAgreements = await prisma.agreement.findMany({
        where: {
          expiry: {
            gte: new Date(),
            lte: new Date(Date.now() + 24 * 60 * 60 * 1000)
          },
          OR: [
            { seller: '4qxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9' },
            { buyer: '5rxZ9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9' }
          ]
        },
        take: 100
      });

      const queryTime = Date.now() - startTime;

      // Query should complete quickly with composite index
      expect(queryTime).toBeLessThan(100); // <100ms
      expect(Array.isArray(userAgreements)).toBe(true);
    });
  });
});

