/**
 * Unit Tests for Transaction Pool Validation Middleware
 *
 * Tests express-validator chains for transaction pool endpoints:
 * - Pool code regex (TP-XXX-XXX)
 * - UUID validation
 * - Corridor format (XX-XX)
 * - Settlement mode enum
 * - Expiry hours range
 * - Pagination limits
 * - Escrow ID format (UUID or EE-XXX-XXX)
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { validationResult } from 'express-validator';

process.env.NODE_ENV = 'test';

import {
  validateCreatePool,
  validateAddMember,
  validateRemoveMember,
  validateLockPool,
  validateSettlePool,
  validateRetryFailedMembers,
  validateCancelPool,
  validateGetPool,
  validateListPools,
  validateGetPoolAudit,
  validateDecryptReceipt,
} from '../../../src/middleware/transaction-pool-validation.middleware';

// Helper to create a mock Express request
function mockRequest(
  overrides: {
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    query?: Record<string, string>;
  } = {}
): any {
  return {
    body: overrides.body || {},
    params: overrides.params || {},
    query: overrides.query || {},
    headers: {},
  };
}

// Helper to create a mock Express response
function mockResponse(): any {
  const res: any = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  return res;
}

// Run a validation chain and return validation result
async function runValidation(
  validators: any[],
  req: any
): Promise<{ errors: any[]; isEmpty: boolean }> {
  for (const validator of validators) {
    await validator.run(req);
  }
  const result = validationResult(req);
  return {
    errors: result.array(),
    isEmpty: result.isEmpty(),
  };
}

describe('Transaction Pool Validation Middleware', function () {
  this.timeout(10000);

  // ─── Pool Code / UUID Regex ──────────────────────────────────

  describe('pool code and UUID validation', () => {
    it('should accept valid UUID as pool id', async () => {
      const req = mockRequest({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const { isEmpty } = await runValidation(validateGetPool, req);
      expect(isEmpty).to.be.true;
    });

    it('should accept valid pool code (TP-XXX-XXX)', async () => {
      const req = mockRequest({ params: { id: 'TP-A3K-9MN' } });
      const { isEmpty } = await runValidation(validateGetPool, req);
      expect(isEmpty).to.be.true;
    });

    it('should accept pool code with 4-char segments (TP-XXXX-XXXX)', async () => {
      const req = mockRequest({ params: { id: 'TP-A3K9-9MNB' } });
      const { isEmpty } = await runValidation(validateGetPool, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject invalid pool code format', async () => {
      const req = mockRequest({ params: { id: 'INVALID' } });
      const { isEmpty, errors } = await runValidation(validateGetPool, req);
      expect(isEmpty).to.be.false;
      expect(errors[0].msg).to.include('UUID or pool code');
    });

    it('should reject pool code with wrong prefix', async () => {
      const req = mockRequest({ params: { id: 'EE-A3K-9MN' } });
      const { isEmpty } = await runValidation(validateGetPool, req);
      expect(isEmpty).to.be.false;
    });

    it('should reject pool code with lowercase', async () => {
      const req = mockRequest({ params: { id: 'TP-a3k-9mn' } });
      const { isEmpty } = await runValidation(validateGetPool, req);
      expect(isEmpty).to.be.false;
    });
  });

  // ─── validateCreatePool ──────────────────────────────────────

  describe('validateCreatePool', () => {
    it('should accept empty body (all fields optional)', async () => {
      const req = mockRequest({ body: {} });
      const { isEmpty } = await runValidation(validateCreatePool, req);
      expect(isEmpty).to.be.true;
    });

    it('should accept valid corridor', async () => {
      const req = mockRequest({ body: { corridor: 'SG-CH' } });
      const { isEmpty } = await runValidation(validateCreatePool, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject invalid corridor format', async () => {
      const req = mockRequest({ body: { corridor: 'singapore-ch' } });
      const { isEmpty, errors } = await runValidation(validateCreatePool, req);
      expect(isEmpty).to.be.false;
      expect(errors[0].msg).to.include('XX-XX');
    });

    it('should accept valid settlement mode', async () => {
      const req = mockRequest({ body: { settlementMode: 'PARALLEL' } });
      const { isEmpty } = await runValidation(validateCreatePool, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject invalid settlement mode', async () => {
      const req = mockRequest({ body: { settlementMode: 'BATCH' } });
      const { isEmpty, errors } = await runValidation(validateCreatePool, req);
      expect(isEmpty).to.be.false;
      expect(errors[0].msg).to.include('SEQUENTIAL');
    });

    it('should accept valid expiry hours', async () => {
      const req = mockRequest({ body: { expiryHours: 48 } });
      const { isEmpty } = await runValidation(validateCreatePool, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject expiry hours below minimum', async () => {
      const req = mockRequest({ body: { expiryHours: 0 } });
      const { isEmpty, errors } = await runValidation(validateCreatePool, req);
      expect(isEmpty).to.be.false;
      expect(errors[0].msg).to.include('between 1 and 168');
    });

    it('should reject expiry hours above maximum', async () => {
      const req = mockRequest({ body: { expiryHours: 200 } });
      const { isEmpty, errors } = await runValidation(validateCreatePool, req);
      expect(isEmpty).to.be.false;
      expect(errors[0].msg).to.include('between 1 and 168');
    });
  });

  // ─── validateAddMember ────────────────────────────────────────

  describe('validateAddMember', () => {
    it('should accept UUID escrowId', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN' },
        body: { escrowId: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const { isEmpty } = await runValidation(validateAddMember, req);
      expect(isEmpty).to.be.true;
    });

    it('should accept escrow code (EE-XXX-XXX)', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN' },
        body: { escrowId: 'EE-7KMN-AB3D' },
      });
      const { isEmpty } = await runValidation(validateAddMember, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject invalid escrowId format', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN' },
        body: { escrowId: 'not-valid' },
      });
      const { isEmpty, errors } = await runValidation(validateAddMember, req);
      expect(isEmpty).to.be.false;
      expect(errors[0].msg).to.include('escrowId');
    });

    it('should reject missing escrowId', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN' },
        body: {},
      });
      const { isEmpty } = await runValidation(validateAddMember, req);
      expect(isEmpty).to.be.false;
    });
  });

  // ─── validateRemoveMember ─────────────────────────────────────

  describe('validateRemoveMember', () => {
    it('should accept valid pool id and member UUID', async () => {
      const req = mockRequest({
        params: {
          id: 'TP-A3K-9MN',
          memberId: '550e8400-e29b-41d4-a716-446655440000',
        },
      });
      const { isEmpty } = await runValidation(validateRemoveMember, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject non-UUID memberId', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN', memberId: 'not-a-uuid' },
      });
      const { isEmpty, errors } = await runValidation(validateRemoveMember, req);
      expect(isEmpty).to.be.false;
      expect(errors[0].msg).to.include('memberId');
    });
  });

  // ─── validateLockPool ─────────────────────────────────────────

  describe('validateLockPool', () => {
    it('should accept valid pool id', async () => {
      const req = mockRequest({ params: { id: 'TP-A3K-9MN' } });
      const { isEmpty } = await runValidation(validateLockPool, req);
      expect(isEmpty).to.be.true;
    });
  });

  // ─── validateSettlePool ───────────────────────────────────────

  describe('validateSettlePool', () => {
    it('should accept valid pool id with optional notes', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN' },
        body: { notes: 'Monthly batch' },
      });
      const { isEmpty } = await runValidation(validateSettlePool, req);
      expect(isEmpty).to.be.true;
    });

    it('should accept without notes', async () => {
      const req = mockRequest({ params: { id: 'TP-A3K-9MN' } });
      const { isEmpty } = await runValidation(validateSettlePool, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject notes exceeding 500 characters', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN' },
        body: { notes: 'x'.repeat(501) },
      });
      const { isEmpty, errors } = await runValidation(validateSettlePool, req);
      expect(isEmpty).to.be.false;
      expect(errors[0].msg).to.include('500 characters');
    });
  });

  // ─── validateRetryFailedMembers ───────────────────────────────

  describe('validateRetryFailedMembers', () => {
    it('should accept valid pool id', async () => {
      const req = mockRequest({ params: { id: 'TP-A3K-9MN' } });
      const { isEmpty } = await runValidation(validateRetryFailedMembers, req);
      expect(isEmpty).to.be.true;
    });
  });

  // ─── validateCancelPool ───────────────────────────────────────

  describe('validateCancelPool', () => {
    it('should accept valid pool id with optional reason', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN' },
        body: { reason: 'Client requested' },
      });
      const { isEmpty } = await runValidation(validateCancelPool, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject reason exceeding 500 characters', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN' },
        body: { reason: 'x'.repeat(501) },
      });
      const { isEmpty, errors } = await runValidation(validateCancelPool, req);
      expect(isEmpty).to.be.false;
      expect(errors[0].msg).to.include('500 characters');
    });
  });

  // ─── validateListPools ────────────────────────────────────────

  describe('validateListPools', () => {
    it('should accept all valid query params', async () => {
      const req = mockRequest({
        query: {
          status: 'OPEN',
          corridor: 'SG-CH',
          limit: '50',
          offset: '10',
        },
      });
      const { isEmpty } = await runValidation(validateListPools, req);
      expect(isEmpty).to.be.true;
    });

    it('should accept empty query', async () => {
      const req = mockRequest({ query: {} });
      const { isEmpty } = await runValidation(validateListPools, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject invalid status', async () => {
      const req = mockRequest({ query: { status: 'INVALID' } });
      const { isEmpty } = await runValidation(validateListPools, req);
      expect(isEmpty).to.be.false;
    });

    it('should accept all valid status values', async () => {
      const statuses = [
        'OPEN',
        'LOCKED',
        'SETTLING',
        'SETTLED',
        'PARTIAL_FAIL',
        'FAILED',
        'CANCELLED',
      ];
      for (const status of statuses) {
        const req = mockRequest({ query: { status } });
        const { isEmpty } = await runValidation(validateListPools, req);
        expect(isEmpty, `Status ${status} should be valid`).to.be.true;
      }
    });

    it('should reject limit above 100', async () => {
      const req = mockRequest({ query: { limit: '101' } });
      const { isEmpty } = await runValidation(validateListPools, req);
      expect(isEmpty).to.be.false;
    });

    it('should reject limit below 1', async () => {
      const req = mockRequest({ query: { limit: '0' } });
      const { isEmpty } = await runValidation(validateListPools, req);
      expect(isEmpty).to.be.false;
    });

    it('should reject negative offset', async () => {
      const req = mockRequest({ query: { offset: '-1' } });
      const { isEmpty } = await runValidation(validateListPools, req);
      expect(isEmpty).to.be.false;
    });
  });

  // ─── validateGetPoolAudit ─────────────────────────────────────

  describe('validateGetPoolAudit', () => {
    it('should accept valid pool id with pagination', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN' },
        query: { limit: '10', offset: '0' },
      });
      const { isEmpty } = await runValidation(validateGetPoolAudit, req);
      expect(isEmpty).to.be.true;
    });
  });

  // ─── validateDecryptReceipt ───────────────────────────────────

  describe('validateDecryptReceipt', () => {
    it('should accept pool code and escrow UUID', async () => {
      const req = mockRequest({
        params: {
          id: 'TP-A3K-9MN',
          escrowId: '550e8400-e29b-41d4-a716-446655440000',
        },
      });
      const { isEmpty } = await runValidation(validateDecryptReceipt, req);
      expect(isEmpty).to.be.true;
    });

    it('should accept pool UUID and escrow code', async () => {
      const req = mockRequest({
        params: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          escrowId: 'EE-7KMN-AB3D',
        },
      });
      const { isEmpty } = await runValidation(validateDecryptReceipt, req);
      expect(isEmpty).to.be.true;
    });

    it('should reject invalid escrow id', async () => {
      const req = mockRequest({
        params: { id: 'TP-A3K-9MN', escrowId: 'INVALID' },
      });
      const { isEmpty } = await runValidation(validateDecryptReceipt, req);
      expect(isEmpty).to.be.false;
    });
  });
});
