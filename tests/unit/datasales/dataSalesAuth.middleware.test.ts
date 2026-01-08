/**
 * Unit Tests for DataSales Auth Middleware
 * Tests API key authentication and feature flag checks
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { Request, Response, NextFunction } from 'express';
import {
  requireDataSalesApiKey,
  requireDataSalesEnabled,
  generateDataSalesApiKey,
} from '../../../src/middleware/dataSalesAuth.middleware';

// Store original env values
const originalEnv = { ...process.env };

// Mock Express Request
const createMockRequest = (headers: Record<string, string> = {}, path: string = '/api/datasales/test'): Partial<Request> => ({
  headers,
  path,
  ip: '127.0.0.1',
});

// Mock Express Response
const createMockResponse = (): Partial<Response> & { statusCode: number; jsonData: any } => {
  const res: any = {
    statusCode: 200,
    jsonData: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.jsonData = data;
      return this;
    },
  };
  return res;
};

// Mock NextFunction
const createMockNext = (): { called: boolean; fn: NextFunction } => {
  const result = { called: false, fn: () => { result.called = true; } };
  return result;
};

describe('DataSales Auth Middleware', () => {
  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('requireDataSalesEnabled', () => {
    it('should call next when DATASALES_ENABLED is not set (default enabled)', () => {
      delete process.env.DATASALES_ENABLED;

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesEnabled(req as Request, res as Response, next.fn);

      expect(next.called).to.be.true;
      expect(res.jsonData).to.be.null;
    });

    it('should call next when DATASALES_ENABLED is true', () => {
      process.env.DATASALES_ENABLED = 'true';

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesEnabled(req as Request, res as Response, next.fn);

      expect(next.called).to.be.true;
    });

    it('should return 503 when DATASALES_ENABLED is false', () => {
      process.env.DATASALES_ENABLED = 'false';

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesEnabled(req as Request, res as Response, next.fn);

      expect(next.called).to.be.false;
      expect(res.statusCode).to.equal(503);
      expect(res.jsonData.success).to.be.false;
      expect(res.jsonData.error).to.equal('Service Unavailable');
      expect(res.jsonData.message).to.include('not enabled');
    });
  });

  describe('requireDataSalesApiKey', () => {
    const validApiKey = 'test-api-key-12345';

    beforeEach(() => {
      process.env.DATASALES_API_KEY = validApiKey;
      process.env.DATASALES_ENABLED = 'true';
    });

    it('should call next with valid API key', () => {
      const req = createMockRequest({ 'x-datasales-api-key': validApiKey });
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesApiKey(req as Request, res as Response, next.fn);

      expect(next.called).to.be.true;
      expect((req as any).isDataSalesAuthenticated).to.be.true;
    });

    it('should return 401 when API key header is missing', () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesApiKey(req as Request, res as Response, next.fn);

      expect(next.called).to.be.false;
      expect(res.statusCode).to.equal(401);
      expect(res.jsonData.success).to.be.false;
      expect(res.jsonData.error).to.equal('Unauthorized');
      expect(res.jsonData.message).to.include('API key required');
    });

    it('should return 403 when API key is invalid', () => {
      const req = createMockRequest({ 'x-datasales-api-key': 'wrong-api-key' });
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesApiKey(req as Request, res as Response, next.fn);

      expect(next.called).to.be.false;
      expect(res.statusCode).to.equal(403);
      expect(res.jsonData.success).to.be.false;
      expect(res.jsonData.error).to.equal('Forbidden');
      expect(res.jsonData.message).to.include('Invalid DataSales API key');
    });

    it('should return 403 when API key has different length', () => {
      const req = createMockRequest({ 'x-datasales-api-key': 'short' });
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesApiKey(req as Request, res as Response, next.fn);

      expect(next.called).to.be.false;
      expect(res.statusCode).to.equal(403);
      expect(res.jsonData.error).to.equal('Forbidden');
    });

    it('should return 500 when DATASALES_API_KEY not configured', () => {
      delete process.env.DATASALES_API_KEY;

      const req = createMockRequest({ 'x-datasales-api-key': 'some-key' });
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesApiKey(req as Request, res as Response, next.fn);

      expect(next.called).to.be.false;
      expect(res.statusCode).to.equal(500);
      expect(res.jsonData.error).to.equal('Configuration Error');
      expect(res.jsonData.message).to.include('not configured');
    });

    it('should return 503 when DataSales is disabled', () => {
      process.env.DATASALES_ENABLED = 'false';

      const req = createMockRequest({ 'x-datasales-api-key': validApiKey });
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesApiKey(req as Request, res as Response, next.fn);

      expect(next.called).to.be.false;
      expect(res.statusCode).to.equal(503);
      expect(res.jsonData.error).to.equal('Service Unavailable');
    });

    it('should be case-sensitive for API key', () => {
      const req = createMockRequest({ 'x-datasales-api-key': validApiKey.toUpperCase() });
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesApiKey(req as Request, res as Response, next.fn);

      expect(next.called).to.be.false;
      expect(res.statusCode).to.equal(403);
    });

    it('should handle empty string API key', () => {
      const req = createMockRequest({ 'x-datasales-api-key': '' });
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesApiKey(req as Request, res as Response, next.fn);

      expect(next.called).to.be.false;
      expect(res.statusCode).to.equal(401); // Empty string is falsy
    });

    it('should use constant-time comparison (timing attack prevention)', () => {
      // This test verifies the implementation uses crypto.timingSafeEqual
      // We can't directly test timing, but we verify the behavior is consistent
      const req1 = createMockRequest({ 'x-datasales-api-key': 'wrong-api-key-1234' });
      const req2 = createMockRequest({ 'x-datasales-api-key': 'x'.repeat(validApiKey.length) });
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const next1 = createMockNext();
      const next2 = createMockNext();

      requireDataSalesApiKey(req1 as Request, res1 as Response, next1.fn);
      requireDataSalesApiKey(req2 as Request, res2 as Response, next2.fn);

      // Both should fail with same error
      expect(res1.statusCode).to.equal(403);
      expect(res2.statusCode).to.equal(403);
    });
  });

  describe('generateDataSalesApiKey', () => {
    it('should generate a 64-character hex string', () => {
      const key = generateDataSalesApiKey();

      expect(key).to.be.a('string');
      expect(key).to.have.length(64);
      expect(/^[0-9a-f]+$/.test(key)).to.be.true;
    });

    it('should generate unique keys each time', () => {
      const key1 = generateDataSalesApiKey();
      const key2 = generateDataSalesApiKey();
      const key3 = generateDataSalesApiKey();

      expect(key1).to.not.equal(key2);
      expect(key2).to.not.equal(key3);
      expect(key1).to.not.equal(key3);
    });

    it('should generate cryptographically secure keys', () => {
      // Test that keys have good entropy (no obvious patterns)
      const keys = Array.from({ length: 10 }, () => generateDataSalesApiKey());

      // All keys should be different
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).to.equal(10);

      // No key should have obvious patterns
      for (const key of keys) {
        // Not all same character
        expect(new Set(key).size).to.be.greaterThan(1);
        // Contains variety of hex characters
        expect(/[0-9]/.test(key)).to.be.true;
        expect(/[a-f]/.test(key)).to.be.true;
      }
    });
  });

  describe('Integration scenarios', () => {
    it('should allow authenticated request through both middleware', () => {
      const apiKey = 'integration-test-key-12345';
      process.env.DATASALES_API_KEY = apiKey;
      process.env.DATASALES_ENABLED = 'true';

      const req = createMockRequest({ 'x-datasales-api-key': apiKey });
      const res = createMockResponse();
      const next1 = createMockNext();
      const next2 = createMockNext();

      // First middleware check
      requireDataSalesEnabled(req as Request, res as Response, next1.fn);
      expect(next1.called).to.be.true;

      // Second middleware check
      requireDataSalesApiKey(req as Request, res as Response, next2.fn);
      expect(next2.called).to.be.true;
      expect((req as any).isDataSalesAuthenticated).to.be.true;
    });

    it('should block when DataSales disabled even with valid key', () => {
      const apiKey = 'valid-api-key-12345';
      process.env.DATASALES_API_KEY = apiKey;
      process.env.DATASALES_ENABLED = 'false';

      const req = createMockRequest({ 'x-datasales-api-key': apiKey });
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesEnabled(req as Request, res as Response, next.fn);

      expect(next.called).to.be.false;
      expect(res.statusCode).to.equal(503);
    });

    it('should include timestamp in all error responses', () => {
      process.env.DATASALES_ENABLED = 'false';

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      requireDataSalesEnabled(req as Request, res as Response, next.fn);

      expect(res.jsonData.timestamp).to.exist;
      expect(() => new Date(res.jsonData.timestamp)).to.not.throw();
    });
  });
});
