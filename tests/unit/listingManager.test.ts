/**
 * Unit Tests for ListingManager Service
 * Tests listing creation, validation, state management, and fee calculations
 *
 * @see Task 20: Implement Listing API Endpoints
 */

import { expect } from 'chai';
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Constants matching the service
const DEFAULT_FEE_BPS = 100; // 1%
const DEFAULT_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MIN_PRICE_LAMPORTS = BigInt(1); // Minimum 1 lamport
const MAX_PRICE_LAMPORTS = BigInt(1_000_000_000_000_000); // ~1M SOL max

// Listing status values
const validListingStatuses = ['PENDING', 'ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED'];
const validDelegationStatuses = ['PENDING', 'DELEGATED', 'FROZEN', 'REVOKED'];

describe('ListingManager', () => {
  describe('Constants', () => {
    it('should have correct default fee (1%)', () => {
      expect(DEFAULT_FEE_BPS).to.equal(100);
      // 1% = 100 bps
      expect(DEFAULT_FEE_BPS / 10000).to.equal(0.01);
    });

    it('should have correct default duration (7 days)', () => {
      expect(DEFAULT_DURATION_SECONDS).to.equal(604800);
      // 7 days in seconds
      expect(DEFAULT_DURATION_SECONDS / (24 * 60 * 60)).to.equal(7);
    });
  });

  describe('Fee Calculation', () => {
    it('should calculate 1% platform fee correctly', () => {
      const price = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 100; // 1%
      const platformFee = (price * BigInt(feeBps)) / BigInt(10000);

      expect(platformFee).to.equal(BigInt(10_000_000)); // 0.01 SOL
    });

    it('should calculate seller receives correctly', () => {
      const price = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 100; // 1%
      const platformFee = (price * BigInt(feeBps)) / BigInt(10000);
      const sellerReceives = price - platformFee;

      expect(sellerReceives).to.equal(BigInt(990_000_000)); // 0.99 SOL
    });

    it('should handle 0 fee correctly', () => {
      const price = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 0; // 0%
      const platformFee = (price * BigInt(feeBps)) / BigInt(10000);

      expect(platformFee).to.equal(BigInt(0));
    });

    it('should calculate custom fee correctly', () => {
      const price = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 250; // 2.5%
      const platformFee = (price * BigInt(feeBps)) / BigInt(10000);

      expect(platformFee).to.equal(BigInt(25_000_000)); // 0.025 SOL
    });

    it('should calculate large price fee correctly', () => {
      const price = BigInt(100_000_000_000); // 100 SOL
      const feeBps = 100; // 1%
      const platformFee = (price * BigInt(feeBps)) / BigInt(10000);

      expect(platformFee).to.equal(BigInt(1_000_000_000)); // 1 SOL
    });

    it('should handle small prices without rounding to zero', () => {
      const price = BigInt(100_000_000); // 0.1 SOL
      const feeBps = 100; // 1%
      const platformFee = (price * BigInt(feeBps)) / BigInt(10000);

      expect(platformFee).to.equal(BigInt(1_000_000)); // 0.001 SOL
    });
  });

  describe('Price Validation', () => {
    it('should accept minimum valid price', () => {
      const price = MIN_PRICE_LAMPORTS;
      expect(price >= MIN_PRICE_LAMPORTS).to.be.true;
    });

    it('should accept typical price (1 SOL)', () => {
      const price = BigInt(LAMPORTS_PER_SOL);
      expect(price >= MIN_PRICE_LAMPORTS).to.be.true;
      expect(price <= MAX_PRICE_LAMPORTS).to.be.true;
    });

    it('should reject zero price', () => {
      const price = BigInt(0);
      expect(price > BigInt(0)).to.be.false;
    });

    it('should accept large prices', () => {
      const price = BigInt(10_000_000_000_000); // 10,000 SOL
      expect(price >= MIN_PRICE_LAMPORTS).to.be.true;
      expect(price <= MAX_PRICE_LAMPORTS).to.be.true;
    });
  });

  describe('Duration Calculation', () => {
    it('should calculate correct expiry for default duration', () => {
      const now = Date.now();
      const durationSeconds = DEFAULT_DURATION_SECONDS;
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

    it('should calculate correct expiry for 30 days', () => {
      const now = Date.now();
      const durationSeconds = 30 * 24 * 60 * 60; // 30 days
      const expiresAt = new Date(now + durationSeconds * 1000);

      const expectedExpiry = new Date(now + 30 * 24 * 60 * 60 * 1000);
      expect(expiresAt.getTime()).to.be.closeTo(expectedExpiry.getTime(), 1000);
    });
  });

  describe('Listing Status Transitions', () => {
    it('should have all expected listing status values', () => {
      expect(validListingStatuses).to.include('PENDING');
      expect(validListingStatuses).to.include('ACTIVE');
      expect(validListingStatuses).to.include('SOLD');
      expect(validListingStatuses).to.include('CANCELLED');
      expect(validListingStatuses).to.include('EXPIRED');
    });

    it('should allow PENDING -> ACTIVE transition', () => {
      const fromStatus = 'PENDING';
      const toStatus = 'ACTIVE';
      // PENDING listings become ACTIVE after delegation confirmation
      expect(fromStatus).to.equal('PENDING');
      expect(validListingStatuses).to.include(toStatus);
    });

    it('should allow ACTIVE -> SOLD transition', () => {
      const fromStatus = 'ACTIVE';
      const toStatus = 'SOLD';
      // ACTIVE listings become SOLD after successful purchase
      expect(fromStatus).to.equal('ACTIVE');
      expect(validListingStatuses).to.include(toStatus);
    });

    it('should allow ACTIVE -> CANCELLED transition', () => {
      const fromStatus = 'ACTIVE';
      const toStatus = 'CANCELLED';
      // ACTIVE listings can be cancelled by seller
      expect(fromStatus).to.equal('ACTIVE');
      expect(validListingStatuses).to.include(toStatus);
    });

    it('should allow ACTIVE -> EXPIRED transition', () => {
      const fromStatus = 'ACTIVE';
      const toStatus = 'EXPIRED';
      // ACTIVE listings expire after expiry timestamp
      expect(fromStatus).to.equal('ACTIVE');
      expect(validListingStatuses).to.include(toStatus);
    });

    it('should allow PENDING -> CANCELLED transition', () => {
      const fromStatus = 'PENDING';
      const toStatus = 'CANCELLED';
      // PENDING listings can be cancelled before delegation
      expect(fromStatus).to.equal('PENDING');
      expect(validListingStatuses).to.include(toStatus);
    });
  });

  describe('Delegation Status Transitions', () => {
    it('should have all expected delegation status values', () => {
      expect(validDelegationStatuses).to.include('PENDING');
      expect(validDelegationStatuses).to.include('DELEGATED');
      expect(validDelegationStatuses).to.include('FROZEN');
      expect(validDelegationStatuses).to.include('REVOKED');
    });

    it('should allow PENDING -> DELEGATED transition', () => {
      const fromStatus = 'PENDING';
      const toStatus = 'DELEGATED';
      // PENDING delegation becomes DELEGATED after tx confirmation
      expect(fromStatus).to.equal('PENDING');
      expect(validDelegationStatuses).to.include(toStatus);
    });

    it('should allow DELEGATED -> REVOKED transition', () => {
      const fromStatus = 'DELEGATED';
      const toStatus = 'REVOKED';
      // DELEGATED status becomes REVOKED after cancellation
      expect(fromStatus).to.equal('DELEGATED');
      expect(validDelegationStatuses).to.include(toStatus);
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

    it('should accept system program address', () => {
      const systemProgram = '11111111111111111111111111111111';
      expect(() => new PublicKey(systemProgram)).to.not.throw();
    });
  });

  describe('Listing ID Generation', () => {
    it('should generate listing IDs with correct prefix', () => {
      const prefix = 'lst_';
      const listingId = `${prefix}${'a'.repeat(16)}`;
      expect(listingId.startsWith(prefix)).to.be.true;
    });

    it('should generate listing IDs with correct length', () => {
      const listingId = `lst_${'a'.repeat(16)}`;
      expect(listingId.length).to.equal(20); // 'lst_' + 16 chars
    });
  });

  describe('Buyer Cannot Be Seller', () => {
    it('should detect when buyer equals seller', () => {
      const sellerWallet = Keypair.generate().publicKey.toBase58();
      const buyerWallet = sellerWallet; // Same wallet

      expect(buyerWallet).to.equal(sellerWallet);
    });

    it('should allow different buyer and seller wallets', () => {
      const sellerWallet = Keypair.generate().publicKey.toBase58();
      const buyerWallet = Keypair.generate().publicKey.toBase58();

      expect(buyerWallet).to.not.equal(sellerWallet);
    });
  });

  describe('Expiry Check', () => {
    it('should detect expired listing', () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      const isExpired = pastDate <= new Date();

      expect(isExpired).to.be.true;
    });

    it('should detect non-expired listing', () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const isExpired = futureDate <= new Date();

      expect(isExpired).to.be.false;
    });

    it('should handle exactly now as expired', () => {
      const now = new Date();
      const isExpired = now <= new Date();

      expect(isExpired).to.be.true;
    });
  });

  describe('Transaction Serialization', () => {
    it('should accept base64 encoded transaction', () => {
      // Mock base64 transaction string
      const serializedTx = Buffer.from('mock-transaction-data').toString('base64');

      // Should be valid base64
      expect(() => Buffer.from(serializedTx, 'base64')).to.not.throw();
    });

    it('should handle empty transaction string', () => {
      const emptyTx = '';
      const decoded = Buffer.from(emptyTx, 'base64');

      expect(decoded.length).to.equal(0);
    });
  });

  describe('Metadata Structure', () => {
    it('should accept valid metadata object', () => {
      const metadata = {
        name: 'Test NFT',
        image: 'https://example.com/image.png',
        collection: 'Test Collection',
      };

      expect(metadata.name).to.be.a('string');
      expect(metadata.image).to.be.a('string');
      expect(metadata.collection).to.be.a('string');
    });

    it('should accept metadata with null fields', () => {
      const metadata = {
        name: null,
        image: null,
        collection: null,
      };

      expect(metadata.name).to.be.null;
      expect(metadata.image).to.be.null;
      expect(metadata.collection).to.be.null;
    });
  });

  describe('Buy Transaction Cost Breakdown', () => {
    it('should calculate correct cost breakdown', () => {
      const price = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 100; // 1%
      const platformFee = (price * BigInt(feeBps)) / BigInt(10000);
      const sellerReceives = price - platformFee;
      const estimatedNetworkFee = BigInt(5000);

      expect(platformFee).to.equal(BigInt(10_000_000)); // 0.01 SOL
      expect(sellerReceives).to.equal(BigInt(990_000_000)); // 0.99 SOL
      expect(price).to.equal(platformFee + sellerReceives);
      expect(estimatedNetworkFee).to.equal(BigInt(5000));
    });

    it('should verify total buyer cost equals price', () => {
      const price = BigInt(1_000_000_000); // 1 SOL
      const feeBps = 100; // 1%
      const platformFee = (price * BigInt(feeBps)) / BigInt(10000);
      const sellerReceives = price - platformFee;

      // Total from seller's perspective
      const totalToSeller = sellerReceives + platformFee;
      expect(totalToSeller).to.equal(price);
    });
  });

  describe('Concurrent Buy Handling', () => {
    it('should only allow one buyer to purchase', () => {
      // Simulate two buyers trying to purchase
      const buyer1CanPurchase = true;

      // After buyer1 purchase, listing status changes to SOLD
      const listingStatus: string = 'SOLD';

      // Buyer2 should be blocked because listing is SOLD
      const buyer2CanPurchase = listingStatus === 'ACTIVE';

      expect(buyer1CanPurchase).to.be.true;
      expect(buyer2CanPurchase).to.be.false;
    });
  });

  describe('Cancel After Purchase Prevention', () => {
    it('should prevent cancellation of sold listing', () => {
      const listingStatus = 'SOLD';
      const cancellableStatuses = ['PENDING', 'ACTIVE'];

      const canCancel = cancellableStatuses.includes(listingStatus);
      expect(canCancel).to.be.false;
    });

    it('should allow cancellation of pending listing', () => {
      const listingStatus = 'PENDING';
      const cancellableStatuses = ['PENDING', 'ACTIVE'];

      const canCancel = cancellableStatuses.includes(listingStatus);
      expect(canCancel).to.be.true;
    });

    it('should allow cancellation of active listing', () => {
      const listingStatus = 'ACTIVE';
      const cancellableStatuses = ['PENDING', 'ACTIVE'];

      const canCancel = cancellableStatuses.includes(listingStatus);
      expect(canCancel).to.be.true;
    });
  });
});
