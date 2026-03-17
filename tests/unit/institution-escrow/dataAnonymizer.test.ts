/**
 * Unit Tests for DataAnonymizer
 *
 * Tests reversible tokenization for AI analysis:
 * - tokenize: deterministic token generation, dedup
 * - anonymizeObject: nested field replacement
 * - anonymizeText: free-text value replacement
 * - deanonymizeText: token-to-original restoration
 * - deanonymizeResult: full AI result de-anonymization
 * - ESCROW_SENSITIVE_FIELDS / CLIENT_SENSITIVE_FIELDS: field maps
 */

import { expect } from 'chai';

process.env.NODE_ENV = 'test';

import {
  DataAnonymizer,
  ESCROW_SENSITIVE_FIELDS,
  CLIENT_SENSITIVE_FIELDS,
} from '../../../src/utils/data-anonymizer';

describe('DataAnonymizer', () => {
  let anonymizer: DataAnonymizer;

  beforeEach(() => {
    anonymizer = new DataAnonymizer();
  });

  // ─── tokenize ───────────────────────────────────────────────

  describe('tokenize', () => {
    it('should generate a token with the correct category prefix', () => {
      const token = anonymizer.tokenize('Acme Corp', 'COMPANY');
      expect(token).to.equal('[COMPANY_1]');
    });

    it('should return the same token for the same value', () => {
      const token1 = anonymizer.tokenize('Acme Corp', 'COMPANY');
      const token2 = anonymizer.tokenize('Acme Corp', 'COMPANY');
      expect(token1).to.equal(token2);
    });

    it('should increment counter for different values in same category', () => {
      const token1 = anonymizer.tokenize('Acme Corp', 'COMPANY');
      const token2 = anonymizer.tokenize('Beta Ltd', 'COMPANY');
      expect(token1).to.equal('[COMPANY_1]');
      expect(token2).to.equal('[COMPANY_2]');
    });

    it('should use separate counters per category', () => {
      const company = anonymizer.tokenize('Acme Corp', 'COMPANY');
      const wallet = anonymizer.tokenize('7CKr8FDn...', 'WALLET');
      const email = anonymizer.tokenize('john@acme.com', 'EMAIL');
      expect(company).to.equal('[COMPANY_1]');
      expect(wallet).to.equal('[WALLET_1]');
      expect(email).to.equal('[EMAIL_1]');
    });

    it('should return empty/whitespace values unchanged', () => {
      expect(anonymizer.tokenize('', 'COMPANY')).to.equal('');
      expect(anonymizer.tokenize('   ', 'COMPANY')).to.equal('   ');
    });

    it('should track token count', () => {
      anonymizer.tokenize('Acme Corp', 'COMPANY');
      anonymizer.tokenize('john@acme.com', 'EMAIL');
      anonymizer.tokenize('Acme Corp', 'COMPANY'); // duplicate
      expect(anonymizer.tokenCount).to.equal(2);
    });
  });

  // ─── anonymizeObject ───────────────────────────────────────

  describe('anonymizeObject', () => {
    it('should replace sensitive fields with tokens', () => {
      const data = {
        companyName: 'Acme Corporation',
        legalName: 'Acme Corporation Ltd',
        country: 'SG',
        tier: 'STANDARD',
      };

      const result = anonymizer.anonymizeObject(data, {
        companyName: 'COMPANY',
        legalName: 'COMPANY',
      });

      expect(result.companyName).to.equal('[COMPANY_1]');
      expect(result.legalName).to.equal('[COMPANY_2]');
      expect(result.country).to.equal('SG'); // not in sensitive fields
      expect(result.tier).to.equal('STANDARD'); // not in sensitive fields
    });

    it('should handle nested fields', () => {
      const data = {
        client: {
          companyName: 'Beta Ltd',
          country: 'US',
        },
        payerWallet: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u',
      };

      const result = anonymizer.anonymizeObject(data, {
        'client.companyName': 'COMPANY',
        'payerWallet': 'WALLET',
      });

      expect((result.client as any).companyName).to.equal('[COMPANY_1]');
      expect(result.payerWallet).to.equal('[WALLET_1]');
      expect((result.client as any).country).to.equal('US');
    });

    it('should not modify the original object', () => {
      const data = { companyName: 'Acme Corp' };
      anonymizer.anonymizeObject(data, { companyName: 'COMPANY' });
      expect(data.companyName).to.equal('Acme Corp');
    });

    it('should skip null/undefined fields', () => {
      const data = { companyName: null, legalName: undefined, tier: 'STANDARD' };
      const result = anonymizer.anonymizeObject(data as any, {
        companyName: 'COMPANY',
        legalName: 'COMPANY',
      });
      expect(result.companyName).to.be.null;
      expect(result.legalName).to.be.undefined;
    });

    it('should deduplicate same values across different fields', () => {
      const data = {
        companyName: 'Same Corp',
        legalName: 'Same Corp',
      };

      const result = anonymizer.anonymizeObject(data, {
        companyName: 'COMPANY',
        legalName: 'COMPANY',
      });

      // Same value should get same token
      expect(result.companyName).to.equal('[COMPANY_1]');
      expect(result.legalName).to.equal('[COMPANY_1]');
      expect(anonymizer.tokenCount).to.equal(1);
    });
  });

  // ─── anonymizeText ─────────────────────────────────────────

  describe('anonymizeText', () => {
    it('should replace known values in free text', () => {
      // First build the token map via anonymizeObject
      anonymizer.anonymizeObject(
        { companyName: 'Acme Corporation' },
        { companyName: 'COMPANY' },
      );

      const text = 'The invoice from Acme Corporation shows $5000.';
      const result = anonymizer.anonymizeText(text);

      expect(result).to.equal('The invoice from [COMPANY_1] shows $5000.');
    });

    it('should replace multiple known values', () => {
      anonymizer.tokenize('Acme Corp', 'COMPANY');
      anonymizer.tokenize('john@acme.com', 'EMAIL');

      const text = 'Contact john@acme.com at Acme Corp for details.';
      const result = anonymizer.anonymizeText(text);

      expect(result).to.not.include('Acme Corp');
      expect(result).to.not.include('john@acme.com');
      expect(result).to.include('[COMPANY_1]');
      expect(result).to.include('[EMAIL_1]');
    });

    it('should skip very short values (< 3 chars)', () => {
      anonymizer.tokenize('SG', 'ADDRESS');

      const text = 'Country: SG, Region: APAC';
      const result = anonymizer.anonymizeText(text);

      // 'SG' is only 2 chars, should not be replaced
      expect(result).to.include('SG');
    });
  });

  // ─── deanonymizeText ───────────────────────────────────────

  describe('deanonymizeText', () => {
    it('should restore tokens to original values', () => {
      anonymizer.tokenize('Acme Corporation', 'COMPANY');

      const tokenized = 'The company [COMPANY_1] passed compliance checks.';
      const result = anonymizer.deanonymizeText(tokenized);

      expect(result).to.equal('The company Acme Corporation passed compliance checks.');
    });

    it('should restore multiple tokens', () => {
      anonymizer.tokenize('Beta Ltd', 'COMPANY');
      anonymizer.tokenize('7CKr8FDn...wallet', 'WALLET');

      const tokenized = '[COMPANY_1] sent funds from [WALLET_1].';
      const result = anonymizer.deanonymizeText(tokenized);

      expect(result).to.equal('Beta Ltd sent funds from 7CKr8FDn...wallet.');
    });

    it('should handle null/empty text', () => {
      expect(anonymizer.deanonymizeText('')).to.equal('');
      expect(anonymizer.deanonymizeText(null as any)).to.equal(null);
    });

    it('should return text unchanged when no tokens present', () => {
      anonymizer.tokenize('Acme Corp', 'COMPANY');
      const text = 'No tokens in this text.';
      expect(anonymizer.deanonymizeText(text)).to.equal(text);
    });
  });

  // ─── deanonymizeResult ─────────────────────────────────────

  describe('deanonymizeResult', () => {
    it('should de-anonymize all string fields in a result object', () => {
      anonymizer.tokenize('Acme Corporation', 'COMPANY');
      anonymizer.tokenize('SG-CH', 'REFERENCE');

      const tokenizedResult = {
        riskScore: 15,
        recommendation: 'APPROVE',
        summary: '[COMPANY_1] has a clean compliance record for corridor [REFERENCE_1].',
        details: 'Low risk for [COMPANY_1].',
        extractedFields: {
          company_name: '[COMPANY_1]',
          corridor: '[REFERENCE_1]',
          amount: 1000,
        },
        factors: [
          { name: 'company_risk', weight: 0.3, value: 10 },
        ],
      };

      const result = anonymizer.deanonymizeResult(tokenizedResult);

      expect(result.summary).to.include('Acme Corporation');
      expect(result.summary).to.not.include('[COMPANY_1]');
      expect(result.details).to.include('Acme Corporation');
      expect(result.extractedFields.company_name).to.equal('Acme Corporation');
      expect(result.extractedFields.corridor).to.equal('SG-CH');
      expect(result.extractedFields.amount).to.equal(1000); // non-string unchanged
      expect(result.riskScore).to.equal(15); // numeric unchanged
    });

    it('should not modify the original result', () => {
      anonymizer.tokenize('Test Corp', 'COMPANY');
      const original = { summary: '[COMPANY_1] analysis', riskScore: 20 };
      anonymizer.deanonymizeResult(original);
      expect(original.summary).to.equal('[COMPANY_1] analysis');
    });

    it('should handle arrays in factors', () => {
      anonymizer.tokenize('Acme Corp', 'COMPANY');

      const result = anonymizer.deanonymizeResult({
        factors: [
          { name: '[COMPANY_1]_risk', weight: 0.5, value: 20 },
        ],
      });

      expect(result.factors[0].name).to.equal('Acme Corp_risk');
    });
  });

  // ─── getTokenMap ───────────────────────────────────────────

  describe('getTokenMap', () => {
    it('should return all token-to-original mappings', () => {
      anonymizer.tokenize('Acme Corp', 'COMPANY');
      anonymizer.tokenize('john@test.com', 'EMAIL');

      const map = anonymizer.getTokenMap();

      expect(map['[COMPANY_1]']).to.equal('Acme Corp');
      expect(map['[EMAIL_1]']).to.equal('john@test.com');
      expect(Object.keys(map)).to.have.length(2);
    });
  });

  // ─── Field map constants ───────────────────────────────────

  describe('ESCROW_SENSITIVE_FIELDS', () => {
    it('should include client company fields', () => {
      expect(ESCROW_SENSITIVE_FIELDS['client.companyName']).to.equal('COMPANY');
      expect(ESCROW_SENSITIVE_FIELDS['client.legalName']).to.equal('COMPANY');
    });

    it('should include wallet fields', () => {
      expect(ESCROW_SENSITIVE_FIELDS['payerWallet']).to.equal('WALLET');
      expect(ESCROW_SENSITIVE_FIELDS['recipientWallet']).to.equal('WALLET');
    });
  });

  describe('CLIENT_SENSITIVE_FIELDS', () => {
    it('should include PII fields', () => {
      expect(CLIENT_SENSITIVE_FIELDS['contactFirstName']).to.equal('PERSON');
      expect(CLIENT_SENSITIVE_FIELDS['contactEmail']).to.equal('EMAIL');
      expect(CLIENT_SENSITIVE_FIELDS['contactPhone']).to.equal('PHONE');
      expect(CLIENT_SENSITIVE_FIELDS['addressLine1']).to.equal('ADDRESS');
    });

    it('should include financial identifiers', () => {
      expect(CLIENT_SENSITIVE_FIELDS['taxId']).to.equal('ACCOUNT');
      expect(CLIENT_SENSITIVE_FIELDS['registrationNumber']).to.equal('ACCOUNT');
      expect(CLIENT_SENSITIVE_FIELDS['lei']).to.equal('ACCOUNT');
    });
  });
});
