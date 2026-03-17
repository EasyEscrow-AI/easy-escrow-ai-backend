/**
 * Unit Tests for Solana Validators
 *
 * Tests all validation helpers in src/models/validators/solana.validator.ts:
 * - isValidSolanaAddress: PublicKey format check
 * - isValidTransactionSignature: base58 signature format
 * - isValidUSDCAmount: BETA range ($1-$3000), type handling
 * - isValidFeeBps: basis points 0-10000
 * - isValidExpiry: future timestamp check
 * - isValidNFTMint: format-only alias
 * - ESCROW_LIMITS: constants verification
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';

import {
  isValidSolanaAddress,
  isValidTransactionSignature,
  isValidUSDCAmount,
  isValidFeeBps,
  isValidExpiry,
  isValidNFTMint,
  ESCROW_LIMITS,
} from '../../../src/models/validators/solana.validator';

describe('Solana Validators', () => {
  // ─── isValidSolanaAddress ───────────────────────────────────

  describe('isValidSolanaAddress', () => {
    it('should accept a valid Solana address', () => {
      expect(isValidSolanaAddress('7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u')).to.be.true;
    });

    it('should accept another valid address', () => {
      expect(isValidSolanaAddress('498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R')).to.be.true;
    });

    it('should accept system program address', () => {
      expect(isValidSolanaAddress('11111111111111111111111111111111')).to.be.true;
    });

    it('should accept USDC mint address', () => {
      expect(isValidSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).to.be.true;
    });

    it('should reject empty string', () => {
      expect(isValidSolanaAddress('')).to.be.false;
    });

    it('should reject obviously invalid addresses', () => {
      expect(isValidSolanaAddress('not-a-valid-wallet')).to.be.false;
    });

    it('should reject addresses with invalid base58 characters (0, O, I, l)', () => {
      // '0' is not valid in base58
      expect(isValidSolanaAddress('0CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u')).to.be.false;
    });

    it('should reject very short strings', () => {
      expect(isValidSolanaAddress('abc')).to.be.false;
    });
  });

  // ─── isValidTransactionSignature ────────────────────────────

  describe('isValidTransactionSignature', () => {
    it('should accept a valid 88-char base58 signature', () => {
      // Generate a plausible 88-char base58 string
      const sig = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';
      expect(isValidTransactionSignature(sig)).to.be.true;
    });

    it('should accept a valid 87-char base58 signature', () => {
      const sig = '4VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQx';
      expect(sig.length).to.equal(87);
      expect(isValidTransactionSignature(sig)).to.be.true;
    });

    it('should reject empty string', () => {
      expect(isValidTransactionSignature('')).to.be.false;
    });

    it('should reject short strings', () => {
      expect(isValidTransactionSignature('abc123')).to.be.false;
    });

    it('should reject strings with spaces', () => {
      expect(isValidTransactionSignature('5VERv8NMvzbJMEkV8 nrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU')).to.be.false;
    });

    it('should reject strings with invalid base58 chars (0, O, I, l)', () => {
      const sig = '0VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';
      expect(isValidTransactionSignature(sig)).to.be.false;
    });
  });

  // ─── ESCROW_LIMITS ──────────────────────────────────────────

  describe('ESCROW_LIMITS', () => {
    it('should have MIN_USDC of 1.0', () => {
      expect(ESCROW_LIMITS.MIN_USDC).to.equal(1.0);
    });

    it('should have MAX_USDC of 3000.0', () => {
      expect(ESCROW_LIMITS.MAX_USDC).to.equal(3000.0);
    });
  });

  // ─── isValidUSDCAmount ──────────────────────────────────────

  describe('isValidUSDCAmount', () => {
    // Valid amounts
    it('should accept minimum amount ($1.00)', () => {
      expect(isValidUSDCAmount(1.0)).to.be.true;
    });

    it('should accept maximum amount ($3000.00)', () => {
      expect(isValidUSDCAmount(3000.0)).to.be.true;
    });

    it('should accept amount in middle of range', () => {
      expect(isValidUSDCAmount(1500)).to.be.true;
    });

    it('should accept fractional amounts', () => {
      expect(isValidUSDCAmount(99.99)).to.be.true;
    });

    // Invalid amounts
    it('should reject zero', () => {
      expect(isValidUSDCAmount(0)).to.be.false;
    });

    it('should reject negative amounts', () => {
      expect(isValidUSDCAmount(-100)).to.be.false;
    });

    it('should reject amounts below minimum', () => {
      expect(isValidUSDCAmount(0.99)).to.be.false;
    });

    it('should reject amounts above maximum', () => {
      expect(isValidUSDCAmount(3000.01)).to.be.false;
    });

    it('should reject NaN', () => {
      expect(isValidUSDCAmount(NaN)).to.be.false;
    });

    // String type handling
    it('should accept valid string amounts', () => {
      expect(isValidUSDCAmount('100')).to.be.true;
    });

    it('should accept string amount at minimum', () => {
      expect(isValidUSDCAmount('1')).to.be.true;
    });

    it('should accept string amount at maximum', () => {
      expect(isValidUSDCAmount('3000')).to.be.true;
    });

    it('should reject invalid string amounts', () => {
      expect(isValidUSDCAmount('not-a-number')).to.be.false;
    });

    it('should reject empty string', () => {
      expect(isValidUSDCAmount('')).to.be.false;
    });

    // Decimal type handling (Prisma Decimal)
    it('should accept Prisma Decimal values', () => {
      const { Decimal } = require('@prisma/client/runtime/library');
      expect(isValidUSDCAmount(new Decimal(500))).to.be.true;
    });

    it('should reject Prisma Decimal below minimum', () => {
      const { Decimal } = require('@prisma/client/runtime/library');
      expect(isValidUSDCAmount(new Decimal(0.5))).to.be.false;
    });

    it('should reject Prisma Decimal above maximum', () => {
      const { Decimal } = require('@prisma/client/runtime/library');
      expect(isValidUSDCAmount(new Decimal(5000))).to.be.false;
    });
  });

  // ─── isValidFeeBps ──────────────────────────────────────────

  describe('isValidFeeBps', () => {
    it('should accept 0 bps (no fee)', () => {
      expect(isValidFeeBps(0)).to.be.true;
    });

    it('should accept 10000 bps (100%)', () => {
      expect(isValidFeeBps(10000)).to.be.true;
    });

    it('should accept typical fee (250 bps = 2.5%)', () => {
      expect(isValidFeeBps(250)).to.be.true;
    });

    it('should reject negative bps', () => {
      expect(isValidFeeBps(-1)).to.be.false;
    });

    it('should reject bps above 10000', () => {
      expect(isValidFeeBps(10001)).to.be.false;
    });

    it('should reject non-integer bps', () => {
      expect(isValidFeeBps(99.5)).to.be.false;
    });

    it('should reject NaN', () => {
      expect(isValidFeeBps(NaN)).to.be.false;
    });
  });

  // ─── isValidExpiry ──────────────────────────────────────────

  describe('isValidExpiry', () => {
    it('should accept a Date in the future', () => {
      const future = new Date(Date.now() + 3600 * 1000);
      expect(isValidExpiry(future)).to.be.true;
    });

    it('should reject a Date in the past', () => {
      const past = new Date(Date.now() - 3600 * 1000);
      expect(isValidExpiry(past)).to.be.false;
    });

    it('should accept a future ISO string', () => {
      const futureStr = new Date(Date.now() + 86400 * 1000).toISOString();
      expect(isValidExpiry(futureStr)).to.be.true;
    });

    it('should reject a past ISO string', () => {
      const pastStr = new Date(Date.now() - 86400 * 1000).toISOString();
      expect(isValidExpiry(pastStr)).to.be.false;
    });

    it('should reject current moment (not strictly future)', () => {
      // Date.now() should be rejected since it's not > now
      const now = new Date();
      expect(isValidExpiry(now)).to.be.false;
    });
  });

  // ─── isValidNFTMint ─────────────────────────────────────────

  describe('isValidNFTMint', () => {
    it('should accept a valid Solana address as NFT mint', () => {
      expect(isValidNFTMint('7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u')).to.be.true;
    });

    it('should reject an invalid address', () => {
      expect(isValidNFTMint('invalid-mint')).to.be.false;
    });

    it('should reject empty string', () => {
      expect(isValidNFTMint('')).to.be.false;
    });
  });
});
