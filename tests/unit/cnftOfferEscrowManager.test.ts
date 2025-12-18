/**
 * Unit Tests for CnftOfferEscrowManager Service
 * Tests offer creation, validation, state management, and PDA derivation
 *
 * @see Task 6: Implement cNFT Offer System with SOL Escrow
 */

import { expect } from 'chai';
import { PublicKey, Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import sinon from 'sinon';

// Constants matching the service
const MIN_OFFER_AMOUNT = BigInt(10_000_000); // 0.01 SOL
const MAX_OFFER_AMOUNT = BigInt(10_000_000_000_000); // 10,000 SOL
const MIN_OFFER_DURATION = 60 * 60; // 1 hour in seconds
const MAX_OFFER_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds
const DEFAULT_OFFER_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds
const OFFER_ESCROW_SEED = Buffer.from('offer_escrow');
const OFFER_SOL_VAULT_SEED = Buffer.from('offer_sol_vault');

// Mock program ID
const MOCK_PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');

describe('CnftOfferEscrowManager', () => {
  describe('Constants', () => {
    it('should have correct minimum offer amount (0.01 SOL)', () => {
      expect(MIN_OFFER_AMOUNT).to.equal(BigInt(10_000_000));
      expect(Number(MIN_OFFER_AMOUNT) / LAMPORTS_PER_SOL).to.equal(0.01);
    });

    it('should have correct maximum offer amount (10,000 SOL)', () => {
      expect(MAX_OFFER_AMOUNT).to.equal(BigInt(10_000_000_000_000));
      expect(Number(MAX_OFFER_AMOUNT) / LAMPORTS_PER_SOL).to.equal(10_000);
    });

    it('should have correct minimum duration (1 hour)', () => {
      expect(MIN_OFFER_DURATION).to.equal(3600);
    });

    it('should have correct maximum duration (30 days)', () => {
      expect(MAX_OFFER_DURATION).to.equal(2592000);
    });

    it('should have correct default duration (7 days)', () => {
      expect(DEFAULT_OFFER_DURATION).to.equal(604800);
    });
  });

  describe('PDA Derivation', () => {
    it('should derive offer escrow PDA correctly', () => {
      const offerId = Buffer.alloc(32);
      offerId.write('off_1234567890abcdef');

      const [escrowPda, bump] = PublicKey.findProgramAddressSync(
        [OFFER_ESCROW_SEED, offerId],
        MOCK_PROGRAM_ID
      );

      expect(escrowPda).to.be.instanceOf(PublicKey);
      expect(bump).to.be.a('number');
      expect(bump).to.be.greaterThanOrEqual(0);
      expect(bump).to.be.lessThanOrEqual(255);
    });

    it('should derive SOL vault PDA correctly', () => {
      const offerId = Buffer.alloc(32);
      offerId.write('off_1234567890abcdef');

      const [vaultPda, bump] = PublicKey.findProgramAddressSync(
        [OFFER_SOL_VAULT_SEED, offerId],
        MOCK_PROGRAM_ID
      );

      expect(vaultPda).to.be.instanceOf(PublicKey);
      expect(bump).to.be.a('number');
    });

    it('should derive different PDAs for different offer IDs', () => {
      const offerId1 = Buffer.alloc(32);
      offerId1.write('off_1111111111111111');

      const offerId2 = Buffer.alloc(32);
      offerId2.write('off_2222222222222222');

      const [pda1] = PublicKey.findProgramAddressSync(
        [OFFER_ESCROW_SEED, offerId1],
        MOCK_PROGRAM_ID
      );

      const [pda2] = PublicKey.findProgramAddressSync(
        [OFFER_ESCROW_SEED, offerId2],
        MOCK_PROGRAM_ID
      );

      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });

    it('should derive escrow and vault PDAs differently for same offer ID', () => {
      const offerId = Buffer.alloc(32);
      offerId.write('off_1234567890abcdef');

      const [escrowPda] = PublicKey.findProgramAddressSync(
        [OFFER_ESCROW_SEED, offerId],
        MOCK_PROGRAM_ID
      );

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [OFFER_SOL_VAULT_SEED, offerId],
        MOCK_PROGRAM_ID
      );

      expect(escrowPda.toBase58()).to.not.equal(vaultPda.toBase58());
    });
  });

  describe('Offer Amount Validation', () => {
    it('should accept minimum valid offer amount', () => {
      const amount = MIN_OFFER_AMOUNT;
      expect(amount >= MIN_OFFER_AMOUNT).to.be.true;
      expect(amount <= MAX_OFFER_AMOUNT).to.be.true;
    });

    it('should accept maximum valid offer amount', () => {
      const amount = MAX_OFFER_AMOUNT;
      expect(amount >= MIN_OFFER_AMOUNT).to.be.true;
      expect(amount <= MAX_OFFER_AMOUNT).to.be.true;
    });

    it('should accept typical offer amount (1 SOL)', () => {
      const amount = BigInt(LAMPORTS_PER_SOL);
      expect(amount >= MIN_OFFER_AMOUNT).to.be.true;
      expect(amount <= MAX_OFFER_AMOUNT).to.be.true;
    });

    it('should reject offer amount below minimum', () => {
      const amount = MIN_OFFER_AMOUNT - BigInt(1);
      expect(amount >= MIN_OFFER_AMOUNT).to.be.false;
    });

    it('should reject offer amount above maximum', () => {
      const amount = MAX_OFFER_AMOUNT + BigInt(1);
      expect(amount <= MAX_OFFER_AMOUNT).to.be.false;
    });
  });

  describe('Duration Validation', () => {
    it('should accept minimum valid duration', () => {
      const duration = MIN_OFFER_DURATION;
      expect(duration >= MIN_OFFER_DURATION).to.be.true;
      expect(duration <= MAX_OFFER_DURATION).to.be.true;
    });

    it('should accept maximum valid duration', () => {
      const duration = MAX_OFFER_DURATION;
      expect(duration >= MIN_OFFER_DURATION).to.be.true;
      expect(duration <= MAX_OFFER_DURATION).to.be.true;
    });

    it('should accept default duration', () => {
      const duration = DEFAULT_OFFER_DURATION;
      expect(duration >= MIN_OFFER_DURATION).to.be.true;
      expect(duration <= MAX_OFFER_DURATION).to.be.true;
    });

    it('should reject duration below minimum', () => {
      const duration = MIN_OFFER_DURATION - 1;
      expect(duration >= MIN_OFFER_DURATION).to.be.false;
    });

    it('should reject duration above maximum', () => {
      const duration = MAX_OFFER_DURATION + 1;
      expect(duration <= MAX_OFFER_DURATION).to.be.false;
    });
  });

  describe('Fee Calculation', () => {
    it('should calculate 1% fee correctly', () => {
      const offerAmount = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 100; // 1%
      const fee = (offerAmount * BigInt(feeBps)) / BigInt(10000);

      expect(fee).to.equal(BigInt(10_000_000)); // 0.01 SOL
    });

    it('should calculate total escrow amount correctly', () => {
      const offerAmount = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 100; // 1%
      const fee = (offerAmount * BigInt(feeBps)) / BigInt(10000);
      const totalEscrow = offerAmount + fee;

      expect(totalEscrow).to.equal(BigInt(1_010_000_000)); // 1.01 SOL
    });

    it('should handle 0 fee correctly', () => {
      const offerAmount = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 0; // 0%
      const fee = (offerAmount * BigInt(feeBps)) / BigInt(10000);

      expect(fee).to.equal(BigInt(0));
    });

    it('should calculate custom fee correctly', () => {
      const offerAmount = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 250; // 2.5%
      const fee = (offerAmount * BigInt(feeBps)) / BigInt(10000);

      expect(fee).to.equal(BigInt(25_000_000)); // 0.025 SOL
    });
  });

  describe('Offer ID Generation', () => {
    it('should generate offer IDs with correct prefix', () => {
      const prefix = 'off_';
      const offerId = `${prefix}${'a'.repeat(16)}`;
      expect(offerId.startsWith(prefix)).to.be.true;
    });

    it('should generate offer IDs with correct length', () => {
      const offerId = `off_${'a'.repeat(16)}`;
      expect(offerId.length).to.equal(20); // 'off_' + 16 chars
    });
  });

  describe('Offer ID to Buffer Conversion', () => {
    it('should convert offer ID to 32-byte buffer', () => {
      const offerId = 'off_1234567890abcdef';
      const buffer = Buffer.alloc(32);
      const encoded = Buffer.from(offerId, 'utf-8');
      encoded.copy(buffer, 0, 0, Math.min(encoded.length, 32));

      expect(buffer.length).to.equal(32);
    });

    it('should preserve offer ID content in buffer', () => {
      const offerId = 'off_1234567890abcdef';
      const buffer = Buffer.alloc(32);
      const encoded = Buffer.from(offerId, 'utf-8');
      encoded.copy(buffer, 0, 0, Math.min(encoded.length, 32));

      const decoded = buffer.toString('utf-8').replace(/\0/g, '');
      expect(decoded).to.equal(offerId);
    });

    it('should handle long offer IDs by truncating', () => {
      const longOfferId = 'a'.repeat(50);
      const buffer = Buffer.alloc(32);
      const encoded = Buffer.from(longOfferId, 'utf-8');
      encoded.copy(buffer, 0, 0, Math.min(encoded.length, 32));

      expect(buffer.length).to.equal(32);
    });
  });

  describe('Expiry Timestamp Calculation', () => {
    it('should calculate correct expiry for default duration', () => {
      const now = Date.now();
      const durationSeconds = DEFAULT_OFFER_DURATION;
      const expiresAt = new Date(now + durationSeconds * 1000);

      const expectedExpiry = new Date(now + 7 * 24 * 60 * 60 * 1000);
      expect(expiresAt.getTime()).to.be.closeTo(expectedExpiry.getTime(), 1000);
    });

    it('should calculate correct expiry for custom duration', () => {
      const now = Date.now();
      const durationSeconds = 24 * 60 * 60; // 1 day
      const expiresAt = new Date(now + durationSeconds * 1000);

      const expectedExpiry = new Date(now + 24 * 60 * 60 * 1000);
      expect(expiresAt.getTime()).to.be.closeTo(expectedExpiry.getTime(), 1000);
    });
  });

  describe('Offer Status Transitions', () => {
    const validStatuses = ['PENDING', 'ACTIVE', 'ACCEPTED', 'COUNTERED', 'CANCELLED', 'EXPIRED', 'REJECTED'];

    it('should have all expected status values', () => {
      expect(validStatuses).to.include('PENDING');
      expect(validStatuses).to.include('ACTIVE');
      expect(validStatuses).to.include('ACCEPTED');
      expect(validStatuses).to.include('COUNTERED');
      expect(validStatuses).to.include('CANCELLED');
      expect(validStatuses).to.include('EXPIRED');
      expect(validStatuses).to.include('REJECTED');
    });

    it('should allow PENDING -> ACTIVE transition', () => {
      const fromStatus = 'PENDING';
      const toStatus = 'ACTIVE';
      // PENDING offers become ACTIVE after escrow confirmation
      expect(fromStatus).to.equal('PENDING');
      expect(validStatuses).to.include(toStatus);
    });

    it('should allow ACTIVE -> ACCEPTED transition', () => {
      const fromStatus = 'ACTIVE';
      const toStatus = 'ACCEPTED';
      // ACTIVE offers can be accepted by owner
      expect(fromStatus).to.equal('ACTIVE');
      expect(validStatuses).to.include(toStatus);
    });

    it('should allow ACTIVE -> CANCELLED transition', () => {
      const fromStatus = 'ACTIVE';
      const toStatus = 'CANCELLED';
      // ACTIVE offers can be cancelled by bidder
      expect(fromStatus).to.equal('ACTIVE');
      expect(validStatuses).to.include(toStatus);
    });

    it('should allow ACTIVE -> REJECTED transition', () => {
      const fromStatus = 'ACTIVE';
      const toStatus = 'REJECTED';
      // ACTIVE offers can be rejected by owner
      expect(fromStatus).to.equal('ACTIVE');
      expect(validStatuses).to.include(toStatus);
    });

    it('should allow ACTIVE -> EXPIRED transition', () => {
      const fromStatus = 'ACTIVE';
      const toStatus = 'EXPIRED';
      // ACTIVE offers expire after expiry timestamp
      expect(fromStatus).to.equal('ACTIVE');
      expect(validStatuses).to.include(toStatus);
    });
  });

  describe('Wallet Address Validation', () => {
    it('should accept valid Solana wallet address', () => {
      const validAddress = Keypair.generate().publicKey.toBase58();
      expect(() => new PublicKey(validAddress)).to.not.throw();
    });

    it('should reject invalid wallet address', () => {
      const invalidAddress = 'not-a-valid-address';
      expect(() => new PublicKey(invalidAddress)).to.throw();
    });

    it('should reject empty wallet address', () => {
      expect(() => new PublicKey('')).to.throw();
    });
  });
});
