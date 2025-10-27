/**
 * Idempotency Service Unit Tests
 *
 * Tests for idempotency key validation, storage, and duplicate detection
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { IdempotencyService } from '../../src/services/idempotency.service';
import { prisma } from '../../src/config/database';

describe('IdempotencyService', () => {
  let idempotencyService: IdempotencyService;

  beforeEach(async () => {
    idempotencyService = new IdempotencyService({
      expirationHours: 1,
      cleanupIntervalMinutes: 60,
    });
    await idempotencyService.start();
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.idempotencyKey.deleteMany({
      where: {
        endpoint: {
          contains: 'TEST',
        },
      },
    });
    await idempotencyService.stop();
  });

  describe('validateKeyFormat', () => {
    it('should accept valid idempotency keys', () => {
      expect(idempotencyService.validateKeyFormat('abcd1234-efgh-5678-ijkl-9012mnop3456')).to.equal(true);
      expect(idempotencyService.validateKeyFormat('test-key-123456789')).to.equal(true);
      expect(idempotencyService.validateKeyFormat('valid_key_with_underscores_1234567890')).to.equal(true);
    });

    it('should reject invalid idempotency keys', () => {
      expect(idempotencyService.validateKeyFormat('')).to.equal(false);
      expect(idempotencyService.validateKeyFormat('short')).to.equal(false);
      expect(idempotencyService.validateKeyFormat('key with spaces')).to.equal(false);
      expect(idempotencyService.validateKeyFormat('key@with!special#chars')).to.equal(false);
    });

    it('should reject keys that are too short', () => {
      expect(idempotencyService.validateKeyFormat('abc123')).to.equal(false);
    });
  });

  describe('generateRequestHash', () => {
    it('should generate consistent hashes for same request body', () => {
      const body = { field1: 'value1', field2: 'value2' };
      const hash1 = idempotencyService.generateRequestHash(body);
      const hash2 = idempotencyService.generateRequestHash(body);
      expect(hash1).to.equal(hash2);
    });

    it('should generate different hashes for different request bodies', () => {
      const body1 = { field1: 'value1', field2: 'value2' };
      const body2 = { field1: 'value1', field2: 'different' };
      const hash1 = idempotencyService.generateRequestHash(body1);
      const hash2 = idempotencyService.generateRequestHash(body2);
      expect(hash1).to.not.equal(hash2);
    });
  });

  describe('checkIdempotency', () => {
    it('should return not duplicate for new request', async () => {
      const result = await idempotencyService.checkIdempotency(
        'test-key-unique-1234567890',
        'TEST_ENDPOINT',
        { test: 'data' }
      );

      expect(result.isDuplicate).to.equal(false);
      expect(result.existingResponse).to.be.undefined;
    });

    it('should return duplicate for repeated request', async () => {
      const key = 'test-key-duplicate-1234567890';
      const endpoint = 'TEST_ENDPOINT';
      const body = { test: 'data' };

      // Store the first request
      await idempotencyService.storeIdempotency(
        key,
        endpoint,
        body,
        200,
        { success: true }
      );

      // Check if duplicate
      const result = await idempotencyService.checkIdempotency(key, endpoint, body);

      expect(result.isDuplicate).to.equal(true);
      expect(result.existingResponse).to.not.be.undefined;
      expect(result.existingResponse?.status).to.equal(200);
      expect(result.existingResponse?.body).to.deep.equal({ success: true });
    });

    it('should throw error if key used with different endpoint', async () => {
      const key = 'test-key-endpoint-mismatch';
      const body = { test: 'data' };

      // Store with one endpoint
      await idempotencyService.storeIdempotency(
        key,
        'TEST_ENDPOINT_1',
        body,
        200,
        { success: true }
      );

      // Try to use with different endpoint
      try {
        await idempotencyService.checkIdempotency(key, 'TEST_ENDPOINT_2', body);
        throw new Error('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.message).to.include('different endpoint');
      }
    });

    it('should throw error if key used with different request body', async () => {
      const key = 'test-key-body-mismatch-12345';
      const endpoint = 'TEST_ENDPOINT';

      // Store with one body
      await idempotencyService.storeIdempotency(
        key,
        endpoint,
        { test: 'data1' },
        200,
        { success: true }
      );

      // Try to use with different body
      try {
        await idempotencyService.checkIdempotency(key, endpoint, { test: 'data2' });
        throw new Error('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.message).to.include('different request body');
      }
    });
  });

  describe('storeIdempotency', () => {
    it('should store idempotency key successfully', async () => {
      const key = 'test-key-store-1234567890';
      const endpoint = 'TEST_ENDPOINT';
      const body = { test: 'data' };
      const responseStatus = 201;
      const responseBody = { success: true, id: '123' };

      await idempotencyService.storeIdempotency(
        key,
        endpoint,
        body,
        responseStatus,
        responseBody
      );

      // Verify stored
      const stored = await prisma.idempotencyKey.findUnique({
        where: { key },
      });

      expect(stored).to.not.be.null;
      expect(stored?.endpoint).to.equal(endpoint);
      expect(stored?.responseStatus).to.equal(responseStatus);
      expect(stored?.responseBody).to.deep.equal(responseBody);
    });
  });

  describe('deleteIdempotencyKey', () => {
    it('should delete idempotency key successfully', async () => {
      const key = 'test-key-delete-1234567890';

      // Store key
      await idempotencyService.storeIdempotency(
        key,
        'TEST_ENDPOINT',
        { test: 'data' },
        200,
        { success: true }
      );

      // Delete key
      await idempotencyService.deleteIdempotencyKey(key);

      // Verify deleted
      const deleted = await prisma.idempotencyKey.findUnique({
        where: { key },
      });

      expect(deleted).to.be.null;
    });

    it('should not throw error when deleting non-existent key', async () => {
      // Should complete without throwing
      await idempotencyService.deleteIdempotencyKey('non-existent-key-1234567890');
    });
  });

  describe('getStatus', () => {
    it('should return service status', () => {
      const status = idempotencyService.getStatus();

      expect(status).to.not.be.undefined;
      expect(status.isRunning).to.equal(true);
      expect(status.expirationHours).to.equal(1);
      expect(status.cleanupIntervalMinutes).to.equal(60);
    });
  });
});

