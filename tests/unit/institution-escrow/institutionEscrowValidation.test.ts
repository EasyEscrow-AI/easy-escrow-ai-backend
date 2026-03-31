/**
 * Unit Tests for Institution Escrow Validation Middleware
 *
 * Tests express-validator chains in isolation using mock req/res:
 * - validateCreateInstitutionEscrow: wallet addresses, amount, corridor, conditionType
 * - validateRecordDeposit: UUID param, txSignature
 * - validateReleaseFunds: UUID param, optional notes
 * - validateCancelEscrow: UUID param, optional reason
 * - validateAiAnalysis: UUID param, fileId, optional context
 * - validateListEscrows: query params (status, corridor, limit, offset)
 * - validateAddToAllowlist: wallet, clientId
 * - validateConfigureCorridor: country codes, amounts, limits, riskLevel
 */

import { expect } from 'chai';
import { validationResult } from 'express-validator';

process.env.NODE_ENV = 'test';

import {
  validateCreateInstitutionEscrow,
  validateRecordDeposit,
  validateReleaseFunds,
  validateCancelEscrow,
  validateAiAnalysis,
  validateListEscrows,
  validateAddToAllowlist,
  validateConfigureCorridor,
} from '../../../src/middleware/institution-escrow-validation.middleware';

// Helper to run validators against mock request
async function runValidation(
  validators: any[],
  reqData: { body?: any; params?: any; query?: any },
) {
  const req: any = {
    body: reqData.body || {},
    params: reqData.params || {},
    query: reqData.query || {},
  };
  const res: any = {};

  for (const validator of validators) {
    await validator.run(req);
  }

  return validationResult(req);
}

function getErrorFields(result: any): string[] {
  return result.array().map((e: any) => e.path);
}

describe('Institution Escrow Validation Middleware', () => {
  const VALID_WALLET = '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u';
  const VALID_WALLET_2 = '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R';
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_TX_SIG = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';

  // ─── validateCreateInstitutionEscrow ────────────────────────

  describe('validateCreateInstitutionEscrow', () => {
    const validBody = {
      payerWallet: VALID_WALLET,
      recipientWallet: VALID_WALLET_2,
      amount: 5000,
      corridor: 'US-MX',
      conditionType: 'ADMIN_RELEASE',
      settlementMode: 'escrow',
      releaseMode: 'manual',
    };

    it('should pass with all valid fields', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, { body: validBody });
      expect(result.isEmpty()).to.be.true;
    });

    it('should pass with optional expiryHours', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, expiryHours: 48 },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should pass with optional settlementAuthority', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, settlementAuthority: VALID_WALLET },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with invalid payerWallet', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, payerWallet: 'invalid' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('payerWallet');
    });

    it('should fail with invalid recipientWallet', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, recipientWallet: 'invalid' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('recipientWallet');
    });

    it('should fail when payerWallet equals recipientWallet', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, recipientWallet: VALID_WALLET },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with amount below minimum', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, amount: 0 },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('amount');
    });

    it('should fail with amount above maximum', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, amount: 20000000 },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('amount');
    });

    it('should fail with invalid corridor format', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, corridor: 'USMX' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('corridor');
    });

    it('should fail with lowercase corridor', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, corridor: 'us-mx' },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with invalid conditionType', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, conditionType: 'INVALID' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('conditionType');
    });

    it('should accept all valid condition types', async () => {
      for (const ct of ['ADMIN_RELEASE', 'TIME_LOCK', 'COMPLIANCE_CHECK']) {
        const result = await runValidation(validateCreateInstitutionEscrow, {
          body: { ...validBody, conditionType: ct },
        });
        expect(result.isEmpty(), `conditionType ${ct} should be valid`).to.be.true;
      }
    });

    it('should fail with expiryHours below 1', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, expiryHours: 0 },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with expiryHours above 2160', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: { ...validBody, expiryHours: 2161 },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with missing required fields', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, { body: {} });
      expect(result.isEmpty()).to.be.false;
      const fields = getErrorFields(result);
      expect(fields).to.include('payerWallet');
      expect(fields).to.include('recipientWallet');
      expect(fields).to.include('amount');
      expect(fields).to.include('corridor');
      expect(fields).to.include('conditionType');
    });
  });

  // ─── validateRecordDeposit ──────────────────────────────────

  describe('validateRecordDeposit', () => {
    it('should pass with valid UUID and txSignature', async () => {
      const result = await runValidation(validateRecordDeposit, {
        params: { id: VALID_UUID },
        body: { txSignature: VALID_TX_SIG },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with invalid UUID', async () => {
      const result = await runValidation(validateRecordDeposit, {
        params: { id: 'not-a-uuid' },
        body: { txSignature: VALID_TX_SIG },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('id');
    });

    it('should fail with short txSignature', async () => {
      const result = await runValidation(validateRecordDeposit, {
        params: { id: VALID_UUID },
        body: { txSignature: 'tooshort' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('txSignature');
    });

    it('should fail with missing txSignature', async () => {
      const result = await runValidation(validateRecordDeposit, {
        params: { id: VALID_UUID },
        body: {},
      });
      expect(result.isEmpty()).to.be.false;
    });
  });

  // ─── validateReleaseFunds ───────────────────────────────────

  describe('validateReleaseFunds', () => {
    it('should pass with valid UUID and no notes', async () => {
      const result = await runValidation(validateReleaseFunds, {
        params: { id: VALID_UUID },
        body: {},
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should pass with valid UUID and optional notes', async () => {
      const result = await runValidation(validateReleaseFunds, {
        params: { id: VALID_UUID },
        body: { notes: 'Compliance verified' },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with invalid UUID', async () => {
      const result = await runValidation(validateReleaseFunds, {
        params: { id: 'bad' },
        body: {},
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail when notes exceed 500 characters', async () => {
      const result = await runValidation(validateReleaseFunds, {
        params: { id: VALID_UUID },
        body: { notes: 'x'.repeat(501) },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should accept notes exactly at 500 characters', async () => {
      const result = await runValidation(validateReleaseFunds, {
        params: { id: VALID_UUID },
        body: { notes: 'x'.repeat(500) },
      });
      expect(result.isEmpty()).to.be.true;
    });
  });

  // ─── validateCancelEscrow ───────────────────────────────────

  describe('validateCancelEscrow', () => {
    it('should pass with valid UUID and no reason', async () => {
      const result = await runValidation(validateCancelEscrow, {
        params: { id: VALID_UUID },
        body: {},
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should pass with valid UUID and optional reason', async () => {
      const result = await runValidation(validateCancelEscrow, {
        params: { id: VALID_UUID },
        body: { reason: 'Client requested cancellation' },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with invalid UUID', async () => {
      const result = await runValidation(validateCancelEscrow, {
        params: { id: 'bad' },
        body: {},
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail when reason exceeds 500 characters', async () => {
      const result = await runValidation(validateCancelEscrow, {
        params: { id: VALID_UUID },
        body: { reason: 'r'.repeat(501) },
      });
      expect(result.isEmpty()).to.be.false;
    });
  });

  // ─── validateAiAnalysis ─────────────────────────────────────

  describe('validateAiAnalysis', () => {
    it('should pass with valid escrow_id and fileId', async () => {
      const result = await runValidation(validateAiAnalysis, {
        params: { escrow_id: VALID_UUID },
        body: { fileId: VALID_UUID },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should pass with optional context object', async () => {
      const result = await runValidation(validateAiAnalysis, {
        params: { escrow_id: VALID_UUID },
        body: {
          fileId: VALID_UUID,
          context: { expectedAmount: 5000, poNumber: 'PO-001' },
        },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with invalid escrow_id', async () => {
      const result = await runValidation(validateAiAnalysis, {
        params: { escrow_id: 'bad' },
        body: { fileId: VALID_UUID },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('escrow_id');
    });

    it('should fail with invalid fileId', async () => {
      const result = await runValidation(validateAiAnalysis, {
        params: { escrow_id: VALID_UUID },
        body: { fileId: 'bad' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('fileId');
    });

    it('should fail with negative expectedAmount', async () => {
      const result = await runValidation(validateAiAnalysis, {
        params: { escrow_id: VALID_UUID },
        body: {
          fileId: VALID_UUID,
          context: { expectedAmount: -100 },
        },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail when poNumber exceeds 100 characters', async () => {
      const result = await runValidation(validateAiAnalysis, {
        params: { escrow_id: VALID_UUID },
        body: {
          fileId: VALID_UUID,
          context: { poNumber: 'x'.repeat(101) },
        },
      });
      expect(result.isEmpty()).to.be.false;
    });
  });

  // ─── validateListEscrows ────────────────────────────────────

  describe('validateListEscrows', () => {
    it('should pass with no query params', async () => {
      const result = await runValidation(validateListEscrows, { query: {} });
      expect(result.isEmpty()).to.be.true;
    });

    it('should pass with valid status filter', async () => {
      const result = await runValidation(validateListEscrows, {
        query: { status: 'FUNDED' },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should accept all valid status values', async () => {
      const validStatuses = [
        'CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'RELEASING',
        'RELEASED', 'CANCELLING', 'CANCELLED', 'EXPIRED', 'FAILED',
      ];
      for (const status of validStatuses) {
        const result = await runValidation(validateListEscrows, { query: { status } });
        expect(result.isEmpty(), `status ${status} should be valid`).to.be.true;
      }
    });

    it('should fail with invalid status', async () => {
      const result = await runValidation(validateListEscrows, {
        query: { status: 'INVALID' },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should pass with valid corridor', async () => {
      const result = await runValidation(validateListEscrows, {
        query: { corridor: 'US-MX' },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with invalid corridor format', async () => {
      const result = await runValidation(validateListEscrows, {
        query: { corridor: 'us_mx' },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should pass with valid limit and offset', async () => {
      const result = await runValidation(validateListEscrows, {
        query: { limit: '50', offset: '10' },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with limit above 100', async () => {
      const result = await runValidation(validateListEscrows, {
        query: { limit: '101' },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with limit below 1', async () => {
      const result = await runValidation(validateListEscrows, {
        query: { limit: '0' },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with negative offset', async () => {
      const result = await runValidation(validateListEscrows, {
        query: { offset: '-1' },
      });
      expect(result.isEmpty()).to.be.false;
    });
  });

  // ─── validateAddToAllowlist ─────────────────────────────────

  describe('validateAddToAllowlist', () => {
    it('should pass with valid wallet and clientId', async () => {
      const result = await runValidation(validateAddToAllowlist, {
        body: { wallet: VALID_WALLET, clientId: VALID_UUID },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with invalid wallet address', async () => {
      const result = await runValidation(validateAddToAllowlist, {
        body: { wallet: 'invalid', clientId: VALID_UUID },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('wallet');
    });

    it('should fail with invalid clientId', async () => {
      const result = await runValidation(validateAddToAllowlist, {
        body: { wallet: VALID_WALLET, clientId: 'not-uuid' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('clientId');
    });

    it('should fail with missing fields', async () => {
      const result = await runValidation(validateAddToAllowlist, { body: {} });
      expect(result.isEmpty()).to.be.false;
    });
  });

  // ─── validateConfigureCorridor ──────────────────────────────

  describe('validateConfigureCorridor', () => {
    const validCorridor = {
      sourceCountry: 'US',
      destCountry: 'MX',
      minAmount: 100,
      maxAmount: 1000000,
      dailyLimit: 5000000,
      monthlyLimit: 50000000,
      riskLevel: 'MEDIUM',
    };

    it('should pass with all valid fields', async () => {
      const result = await runValidation(validateConfigureCorridor, {
        body: validCorridor,
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should pass with optional requiredDocuments', async () => {
      const result = await runValidation(validateConfigureCorridor, {
        body: { ...validCorridor, requiredDocuments: ['INVOICE', 'CONTRACT'] },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with lowercase country code', async () => {
      const result = await runValidation(validateConfigureCorridor, {
        body: { ...validCorridor, sourceCountry: 'us' },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with 3-letter country code', async () => {
      const result = await runValidation(validateConfigureCorridor, {
        body: { ...validCorridor, sourceCountry: 'USA' },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with negative minAmount', async () => {
      const result = await runValidation(validateConfigureCorridor, {
        body: { ...validCorridor, minAmount: -1 },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with zero maxAmount', async () => {
      const result = await runValidation(validateConfigureCorridor, {
        body: { ...validCorridor, maxAmount: 0 },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should fail with invalid riskLevel', async () => {
      const result = await runValidation(validateConfigureCorridor, {
        body: { ...validCorridor, riskLevel: 'EXTREME' },
      });
      expect(result.isEmpty()).to.be.false;
    });

    it('should accept all valid risk levels', async () => {
      for (const level of ['LOW', 'MEDIUM', 'HIGH']) {
        const result = await runValidation(validateConfigureCorridor, {
          body: { ...validCorridor, riskLevel: level },
        });
        expect(result.isEmpty(), `riskLevel ${level} should be valid`).to.be.true;
      }
    });

    it('should fail with non-array requiredDocuments', async () => {
      const result = await runValidation(validateConfigureCorridor, {
        body: { ...validCorridor, requiredDocuments: 'INVOICE' },
      });
      expect(result.isEmpty()).to.be.false;
    });
  });

  // ─── validateSaveDraft ────────────────────────────────────────

  describe('validateSaveDraft', () => {
    it('should pass with only payerWallet', async () => {
      const result = await runValidation(validateSaveDraft, {
        body: { payerWallet: VALID_WALLET },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should pass with all optional fields', async () => {
      const result = await runValidation(validateSaveDraft, {
        body: {
          payerWallet: VALID_WALLET,
          recipientWallet: VALID_WALLET_2,
          amount: 5000,
          corridor: 'SG-CH',
          conditionType: 'ADMIN_RELEASE',
          settlementAuthority: VALID_WALLET,
        },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail without payerWallet', async () => {
      const result = await runValidation(validateSaveDraft, { body: {} });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('payerWallet');
    });

    it('should fail with invalid payerWallet', async () => {
      const result = await runValidation(validateSaveDraft, {
        body: { payerWallet: 'invalid' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('payerWallet');
    });

    it('should fail with invalid optional recipientWallet', async () => {
      const result = await runValidation(validateSaveDraft, {
        body: { payerWallet: VALID_WALLET, recipientWallet: 'bad' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('recipientWallet');
    });

    it('should fail with amount exceeding max', async () => {
      const result = await runValidation(validateSaveDraft, {
        body: { payerWallet: VALID_WALLET, amount: 20000000 },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('amount');
    });
  });

  // ─── validateUpdateDraft ──────────────────────────────────────

  describe('validateUpdateDraft', () => {
    it('should pass with valid UUID and optional fields', async () => {
      const result = await runValidation(validateUpdateDraft, {
        params: { id: VALID_UUID },
        body: { amount: 3000 },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with invalid UUID', async () => {
      const result = await runValidation(validateUpdateDraft, {
        params: { id: 'not-a-uuid' },
        body: { amount: 3000 },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('id');
    });

    it('should fail with invalid corridor format', async () => {
      const result = await runValidation(validateUpdateDraft, {
        params: { id: VALID_UUID },
        body: { corridor: 'invalid' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('corridor');
    });
  });

  // ─── validateSubmitDraft ──────────────────────────────────────

  describe('validateSubmitDraft', () => {
    it('should pass with valid UUID', async () => {
      const result = await runValidation(validateSubmitDraft, {
        params: { id: VALID_UUID },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should pass with optional expiryHours', async () => {
      const result = await runValidation(validateSubmitDraft, {
        params: { id: VALID_UUID },
        body: { expiryHours: 48 },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should fail with invalid UUID', async () => {
      const result = await runValidation(validateSubmitDraft, {
        params: { id: 'bad' },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('id');
    });

    it('should fail with expiryHours out of range', async () => {
      const result = await runValidation(validateSubmitDraft, {
        params: { id: VALID_UUID },
        body: { expiryHours: 5000 },
      });
      expect(result.isEmpty()).to.be.false;
      expect(getErrorFields(result)).to.include('expiryHours');
    });
  });

  // ─── CDP release condition ──────────────────────────────────

  describe('validateCreateInstitutionEscrow - CDP condition', () => {
    const validBody = {
      payerWallet: VALID_WALLET,
      recipientWallet: VALID_WALLET_2,
      amount: 5000,
      corridor: 'US-MX',
      conditionType: 'ADMIN_RELEASE',
      settlementMode: 'escrow',
      releaseMode: 'ai',
    };

    it('should accept cdp_policy_approval in releaseConditions', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: {
          ...validBody,
          releaseConditions: ['legal_compliance', 'cdp_policy_approval'],
        },
      });
      expect(result.isEmpty()).to.be.true;
    });

    it('should reject invalid condition names', async () => {
      const result = await runValidation(validateCreateInstitutionEscrow, {
        body: {
          ...validBody,
          releaseConditions: ['not_a_real_condition'],
        },
      });
      expect(result.isEmpty()).to.be.false;
    });
  });

  describe('validateSaveDraft - CDP condition', () => {
    it('should accept cdp_policy_approval in draft releaseConditions', async () => {
      const result = await runValidation(validateSaveDraft, {
        body: {
          payerWallet: VALID_WALLET,
          releaseConditions: ['cdp_policy_approval'],
        },
      });
      expect(result.isEmpty()).to.be.true;
    });
  });

  describe('validateUpdateDraft - CDP condition', () => {
    it('should accept cdp_policy_approval in draft update', async () => {
      const result = await runValidation(validateUpdateDraft, {
        params: { id: VALID_UUID },
        body: {
          releaseConditions: ['legal_compliance', 'cdp_policy_approval'],
        },
      });
      expect(result.isEmpty()).to.be.true;
    });
  });
});
