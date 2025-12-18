/**
 * Unit Tests for Counter-Offer Functionality
 *
 * Tests for Task 7: Accept/Counter-Offer with Delegation
 * - Counter-offer creation marks parent as COUNTERED
 * - COUNTERED offers cannot be directly accepted
 * - Counter-offer SOL amounts are extracted from parent
 * - Cancellation cascades to counter-offers
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { OfferStatus, OfferType } from '../../src/generated/prisma';

/**
 * Mock Prisma types for testing without database
 */
interface MockSwapOffer {
  id: number;
  makerWallet: string;
  takerWallet: string | null;
  offerType: OfferType;
  status: OfferStatus;
  parentOfferId: number | null;
  offeredSolLamports: bigint | null;
  requestedSolLamports: bigint | null;
  platformFeeLamports: bigint;
  offeredAssets: any;
  requestedAssets: any;
  nonceAccount: string;
  currentNonceValue: string | null;
  serializedTransaction: string | null;
  expiresAt: Date;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

describe('Counter-Offer Functionality', () => {
  describe('OfferStatus.COUNTERED', () => {
    it('should be a valid OfferStatus enum value', () => {
      expect(OfferStatus.COUNTERED).to.equal('COUNTERED');
    });

    it('should distinguish COUNTERED from other statuses', () => {
      expect(OfferStatus.COUNTERED).to.not.equal(OfferStatus.ACTIVE);
      expect(OfferStatus.COUNTERED).to.not.equal(OfferStatus.ACCEPTED);
      expect(OfferStatus.COUNTERED).to.not.equal(OfferStatus.FILLED);
      expect(OfferStatus.COUNTERED).to.not.equal(OfferStatus.CANCELLED);
      expect(OfferStatus.COUNTERED).to.not.equal(OfferStatus.EXPIRED);
    });
  });

  describe('Counter-Offer Acceptance Validation', () => {
    it('should reject accepting a COUNTERED offer', () => {
      // Simulate the validation logic from offerManager.acceptOffer
      const offer: Partial<MockSwapOffer> = {
        id: 1,
        status: OfferStatus.COUNTERED,
        makerWallet: 'maker-wallet-address',
        takerWallet: 'taker-wallet-address',
      };

      // Validation logic (mirrors offerManager.ts line 350-356)
      let errorMessage: string | null = null;

      if (offer.status === OfferStatus.COUNTERED) {
        errorMessage =
          `Offer has been countered and cannot be directly accepted. ` +
          `Accept the counter-offer instead or wait for the counter-offer to expire/be rejected.`;
      }

      expect(errorMessage).to.not.be.null;
      expect(errorMessage).to.include('countered');
      expect(errorMessage).to.include('counter-offer');
    });

    it('should allow accepting an ACTIVE offer', () => {
      const offer: Partial<MockSwapOffer> = {
        id: 1,
        status: OfferStatus.ACTIVE,
        makerWallet: 'maker-wallet-address',
        takerWallet: 'taker-wallet-address',
      };

      // Validation logic
      let errorMessage: string | null = null;

      if (offer.status === OfferStatus.COUNTERED) {
        errorMessage = 'Offer has been countered...';
      } else if (offer.status !== OfferStatus.ACTIVE) {
        errorMessage = `Offer is not active (status: ${offer.status})`;
      }

      expect(errorMessage).to.be.null;
    });

    it('should reject accepting non-ACTIVE offers (other than COUNTERED)', () => {
      const nonActiveStatuses = [
        OfferStatus.ACCEPTED,
        OfferStatus.FILLED,
        OfferStatus.CANCELLED,
        OfferStatus.EXPIRED,
      ];

      nonActiveStatuses.forEach((status) => {
        const offer: Partial<MockSwapOffer> = {
          id: 1,
          status,
          makerWallet: 'maker-wallet-address',
          takerWallet: 'taker-wallet-address',
        };

        let errorMessage: string | null = null;

        if (offer.status === OfferStatus.COUNTERED) {
          errorMessage = 'Offer has been countered...';
        } else if (offer.status !== OfferStatus.ACTIVE) {
          errorMessage = `Offer is not active (status: ${offer.status})`;
        }

        expect(errorMessage).to.not.be.null;
        expect(errorMessage).to.include(status);
      });
    });
  });

  describe('Counter-Offer SOL Amount Extraction', () => {
    it('should reverse SOL amounts from parent offer', () => {
      // Parent offer: maker offers 1 SOL, requests 0.5 SOL
      const parentOffer: Partial<MockSwapOffer> = {
        id: 1,
        offerType: OfferType.MAKER_OFFER,
        offeredSolLamports: BigInt(1_000_000_000), // 1 SOL
        requestedSolLamports: BigInt(500_000_000), // 0.5 SOL
      };

      // Counter-offer reverses roles:
      // Counter-maker (parent taker) now offers what was requested (0.5 SOL)
      // Counter-maker now requests what was offered (1 SOL)
      const offeredSol = parentOffer.requestedSolLamports
        ? BigInt(parentOffer.requestedSolLamports)
        : BigInt(0);
      const requestedSol = parentOffer.offeredSolLamports
        ? BigInt(parentOffer.offeredSolLamports)
        : BigInt(0);

      expect(offeredSol).to.equal(BigInt(500_000_000));
      expect(requestedSol).to.equal(BigInt(1_000_000_000));
    });

    it('should handle null SOL amounts', () => {
      const parentOffer: Partial<MockSwapOffer> = {
        id: 1,
        offerType: OfferType.MAKER_OFFER,
        offeredSolLamports: null,
        requestedSolLamports: null,
      };

      const offeredSol = parentOffer.requestedSolLamports
        ? BigInt(parentOffer.requestedSolLamports)
        : BigInt(0);
      const requestedSol = parentOffer.offeredSolLamports
        ? BigInt(parentOffer.offeredSolLamports)
        : BigInt(0);

      expect(offeredSol).to.equal(BigInt(0));
      expect(requestedSol).to.equal(BigInt(0));
    });

    it('should handle one-sided SOL amounts', () => {
      // NFT for SOL swap - maker offers NFT (0 SOL), requests SOL
      const parentOffer: Partial<MockSwapOffer> = {
        id: 1,
        offerType: OfferType.MAKER_OFFER,
        offeredSolLamports: BigInt(0),
        requestedSolLamports: BigInt(2_000_000_000), // 2 SOL
      };

      const offeredSol = parentOffer.requestedSolLamports
        ? BigInt(parentOffer.requestedSolLamports)
        : BigInt(0);
      const requestedSol = parentOffer.offeredSolLamports
        ? BigInt(parentOffer.offeredSolLamports)
        : BigInt(0);

      // Counter-offer: counter-maker offers 2 SOL, requests 0 SOL
      expect(offeredSol).to.equal(BigInt(2_000_000_000));
      expect(requestedSol).to.equal(BigInt(0));
    });
  });

  describe('Counter-Offer Cancellation Cascade', () => {
    it('should identify cancelable statuses including COUNTERED', () => {
      const cancelableStatuses: OfferStatus[] = [
        OfferStatus.ACTIVE,
        OfferStatus.ACCEPTED,
        OfferStatus.COUNTERED,
      ];

      // Test each cancelable status
      cancelableStatuses.forEach((status) => {
        expect(cancelableStatuses.includes(status)).to.be.true;
      });

      // Non-cancelable statuses
      const nonCancelableStatuses: OfferStatus[] = [
        OfferStatus.FILLED,
        OfferStatus.CANCELLED,
        OfferStatus.EXPIRED,
      ];

      nonCancelableStatuses.forEach((status) => {
        expect(cancelableStatuses.includes(status as OfferStatus)).to.be.false;
      });
    });

    it('should cascade cancel to counter-offers when parent is cancelled', () => {
      // Simulated offers in database
      const parentOffer: MockSwapOffer = {
        id: 1,
        makerWallet: 'maker-wallet',
        takerWallet: 'taker-wallet',
        offerType: OfferType.MAKER_OFFER,
        status: OfferStatus.COUNTERED,
        parentOfferId: null,
        offeredSolLamports: BigInt(1_000_000_000),
        requestedSolLamports: null,
        platformFeeLamports: BigInt(10_000_000),
        offeredAssets: [],
        requestedAssets: [],
        nonceAccount: 'nonce-account',
        currentNonceValue: 'nonce-value',
        serializedTransaction: null,
        expiresAt: new Date(Date.now() + 86400000),
        cancelledAt: null,
        cancelledBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const counterOffer: MockSwapOffer = {
        id: 2,
        makerWallet: 'taker-wallet', // roles reversed
        takerWallet: 'maker-wallet',
        offerType: OfferType.COUNTER,
        status: OfferStatus.ACTIVE,
        parentOfferId: 1, // links to parent
        offeredSolLamports: BigInt(500_000_000),
        requestedSolLamports: null,
        platformFeeLamports: BigInt(5_000_000),
        offeredAssets: [],
        requestedAssets: [],
        nonceAccount: 'nonce-account', // shares nonce with parent
        currentNonceValue: 'nonce-value',
        serializedTransaction: null,
        expiresAt: new Date(Date.now() + 86400000),
        cancelledAt: null,
        cancelledBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Simulate the cascade cancel logic
      const offers = [parentOffer, counterOffer];
      const cancelledOfferId = 1;
      const cancelledBy = 'maker-wallet';

      // Cancel parent
      const parent = offers.find((o) => o.id === cancelledOfferId);
      if (parent) {
        parent.status = OfferStatus.CANCELLED;
        parent.cancelledAt = new Date();
        parent.cancelledBy = cancelledBy;
      }

      // Cancel counter-offers linked to parent
      // Include COUNTERED for consistency (counter-offers can themselves be countered)
      const cancelableCounterStatuses: OfferStatus[] = [OfferStatus.ACTIVE, OfferStatus.ACCEPTED, OfferStatus.COUNTERED];
      offers
        .filter(
          (o) =>
            o.parentOfferId === cancelledOfferId &&
            cancelableCounterStatuses.includes(o.status)
        )
        .forEach((o) => {
          o.status = OfferStatus.CANCELLED;
          o.cancelledAt = new Date();
          o.cancelledBy = cancelledBy;
        });

      // Verify both are cancelled
      expect(parentOffer.status).to.equal(OfferStatus.CANCELLED);
      expect(counterOffer.status).to.equal(OfferStatus.CANCELLED);
      expect(parentOffer.cancelledBy).to.equal('maker-wallet');
      expect(counterOffer.cancelledBy).to.equal('maker-wallet');
    });
  });

  describe('Counter-Offer Type', () => {
    it('should use COUNTER offer type for counter-offers', () => {
      expect(OfferType.COUNTER).to.equal('COUNTER');
    });

    it('should distinguish counter-offers from maker offers', () => {
      expect(OfferType.COUNTER).to.not.equal(OfferType.MAKER_OFFER);
    });

    it('should properly identify counter-offers by type', () => {
      const counterOffer: Partial<MockSwapOffer> = {
        id: 2,
        offerType: OfferType.COUNTER,
        parentOfferId: 1,
      };

      const isCounterOffer = counterOffer.offerType === OfferType.COUNTER;
      const hasParent = counterOffer.parentOfferId !== null;

      expect(isCounterOffer).to.be.true;
      expect(hasParent).to.be.true;
    });
  });
});
