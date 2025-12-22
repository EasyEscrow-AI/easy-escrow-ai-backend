/**
 * Unit Test: OfferManager.rebuildTransaction Type Coercion
 * 
 * Tests the defensive type coercion added to fix the critical bug where
 * offerId was passed as string "124" instead of number 124, causing
 * Prisma validation error and preventing fresh cNFT proofs from being fetched.
 * 
 * Bug Context:
 * - API returns offer.id as string (via id.toString())
 * - Route handler does parseInt but type isn't preserved in compiled JS
 * - This caused ALL cNFT swap retries to fail silently
 * 
 * Related PR: #325
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { OfferManager } from '../../src/services/offerManager';
import { PrismaClient } from '@prisma/client';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

describe('OfferManager.rebuildTransaction - Type Coercion', () => {
  let sandbox: sinon.SinonSandbox;
  let offerManager: OfferManager;
  let prismaMock: any;
  let connectionMock: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock Prisma client
    prismaMock = {
      swapOffer: {
        findUnique: sandbox.stub(),
        update: sandbox.stub(),
      },
    };

    // Mock Connection
    connectionMock = sandbox.createStubInstance(Connection);

    // Create OfferManager instance with minimal mocks
    const mockNoncePoolManager: any = {};
    const mockFeeCalculator: any = {};
    const mockAssetValidator: any = {};
    const mockTransactionBuilder: any = {
      buildSwapTransaction: sandbox.stub().resolves({
        serializedTransaction: 'mock-tx',
        nonceValue: 'mock-nonce',
      }),
      validateInputs: sandbox.stub(),
      getALTService: sandbox.stub().returns(null), // Required by OfferManager constructor
    };
    const mockPlatformAuthority = Keypair.generate();
    const mockTreasuryPDA = Keypair.generate().publicKey;
    const mockProgramId = Keypair.generate().publicKey;

    offerManager = new OfferManager(
      connectionMock as any,
      prismaMock as any,
      mockNoncePoolManager,
      mockFeeCalculator,
      mockAssetValidator,
      mockTransactionBuilder,
      mockPlatformAuthority,
      mockTreasuryPDA,
      mockProgramId
    );
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Type Coercion for offerId Parameter', () => {
    // Use valid Solana public keys for mocks
    const mockOffer = {
      id: 124,
      status: 'ACCEPTED',
      makerWallet: 'AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z',
      takerWallet: '5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4',
      offeredAssets: [{ type: 'cnft', identifier: '7BC3X263a9N3BepgLa69LpTY2ZjwQr5ZeCCqEC7Xs1YM' }],
      requestedAssets: [{ type: 'sol', identifier: '100000000' }],
      offeredSolLamports: '0',
      requestedSolLamports: '100000000',
      platformFeeLamports: '1000000',
      nonceAccount: 'CPDz3pC5AnK7es3oEcP52HLhByPSAWG6f9QGP6j4jjEA',
    };

    it('should accept number offerId (expected case)', async () => {
      prismaMock.swapOffer.findUnique.resolves(mockOffer);
      prismaMock.swapOffer.update.resolves(mockOffer);

      await offerManager.rebuildTransaction(124);

      // Verify Prisma was called with number type
      expect(prismaMock.swapOffer.findUnique.calledOnce).to.be.true;
      const callArgs = prismaMock.swapOffer.findUnique.firstCall.args[0];
      expect(callArgs.where.id).to.equal(124);
      expect(typeof callArgs.where.id).to.equal('number');
    });

    it('should accept string offerId and convert to number (bug fix case)', async () => {
      prismaMock.swapOffer.findUnique.resolves(mockOffer);
      prismaMock.swapOffer.update.resolves(mockOffer);

      // This is what was causing the bug - API returned "124" as string
      await offerManager.rebuildTransaction('124' as any);

      // Verify Prisma was called with number type (converted)
      expect(prismaMock.swapOffer.findUnique.calledOnce).to.be.true;
      const callArgs = prismaMock.swapOffer.findUnique.firstCall.args[0];
      expect(callArgs.where.id).to.equal(124);
      expect(typeof callArgs.where.id).to.equal('number');
    });

    it('should reject invalid string offerId (not a number)', async () => {
      try {
        await offerManager.rebuildTransaction('invalid' as any);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Invalid offer ID');
      }

      // Verify Prisma was never called
      expect(prismaMock.swapOffer.findUnique.called).to.be.false;
    });

    it('should reject null offerId', async () => {
      // null gets converted to 0 by parseInt, so Prisma is called but offer not found
      prismaMock.swapOffer.findUnique.resolves(null);

      try {
        await offerManager.rebuildTransaction(null as any);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // Null becomes 0, which is valid for Prisma but offer doesn't exist
        expect(error.message).to.include('Offer not found');
      }
    });

    it('should reject undefined offerId', async () => {
      try {
        await offerManager.rebuildTransaction(undefined as any);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Invalid offer ID');
      }

      // Verify Prisma was never called
      expect(prismaMock.swapOffer.findUnique.called).to.be.false;
    });

    it('should reject NaN offerId', async () => {
      try {
        await offerManager.rebuildTransaction(NaN as any);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Invalid offer ID');
      }

      // Verify Prisma was never called
      expect(prismaMock.swapOffer.findUnique.called).to.be.false;
    });

    it('should handle numeric string with whitespace', async () => {
      prismaMock.swapOffer.findUnique.resolves(mockOffer);
      prismaMock.swapOffer.update.resolves(mockOffer);

      await offerManager.rebuildTransaction('  124  ' as any);

      // Verify Prisma was called with trimmed, converted number
      expect(prismaMock.swapOffer.findUnique.calledOnce).to.be.true;
      const callArgs = prismaMock.swapOffer.findUnique.firstCall.args[0];
      expect(callArgs.where.id).to.equal(124);
      expect(typeof callArgs.where.id).to.equal('number');
    });

    it('should handle negative offerId (edge case)', async () => {
      prismaMock.swapOffer.findUnique.resolves(null); // Offer not found

      try {
        await offerManager.rebuildTransaction(-1);
        expect.fail('Should have thrown error for non-existent offer');
      } catch (error: any) {
        expect(error.message).to.include('Offer not found');
      }

      // Verify Prisma was called with negative number (valid type)
      expect(prismaMock.swapOffer.findUnique.calledOnce).to.be.true;
      const callArgs = prismaMock.swapOffer.findUnique.firstCall.args[0];
      expect(callArgs.where.id).to.equal(-1);
      expect(typeof callArgs.where.id).to.equal('number');
    });

    it('should handle zero offerId (edge case)', async () => {
      prismaMock.swapOffer.findUnique.resolves(null); // Offer not found

      try {
        await offerManager.rebuildTransaction(0);
        expect.fail('Should have thrown error for non-existent offer');
      } catch (error: any) {
        expect(error.message).to.include('Offer not found');
      }

      // Verify Prisma was called with zero (valid type)
      expect(prismaMock.swapOffer.findUnique.calledOnce).to.be.true;
      const callArgs = prismaMock.swapOffer.findUnique.firstCall.args[0];
      expect(callArgs.where.id).to.equal(0);
      expect(typeof callArgs.where.id).to.equal('number');
    });
  });

  describe('Integration with Real Bug Scenario', () => {
    it('should replicate the exact bug scenario from staging logs', async () => {
      // EXACT SCENARIO FROM STAGING LOGS:
      // API returned: { offer: { id: "124" } } (string)
      // Test client called: rebuildTransaction("124")
      // Prisma rejected: "Expected Int, provided String"

      const mockOffer = {
        id: 124,
        status: 'ACCEPTED',
        makerWallet: 'AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z',
        takerWallet: '5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4',
        offeredAssets: [
          {
            type: 'cnft',
            identifier: '7BC3X263a9N3BepgLa69LpTY2ZjwQr5ZeCCqEC7Xs1YM',
          },
        ],
        requestedAssets: [{ type: 'sol', identifier: '100000000' }],
        offeredSolLamports: '0',
        requestedSolLamports: '100000000',
        platformFeeLamports: '1000000',
        nonceAccount: 'CPDz3pC5AnK7es3oEcP52HLhByPSAWG6f9QGP6j4jjEA',
      };

      prismaMock.swapOffer.findUnique.resolves(mockOffer);
      prismaMock.swapOffer.update.resolves(mockOffer);

      // Call with string (exact bug scenario)
      const result = await offerManager.rebuildTransaction('124' as any);

      // Verify it worked (no Prisma error)
      expect(result).to.exist;
      // cNFT swaps may return requiresTwoPhase: true with empty serializedTransaction
      // when Jito is disabled or swap exceeds Jito limits
      if (result.requiresTwoPhase) {
        expect(result.serializedTransaction).to.equal('');
        expect(result.requiresTwoPhase).to.be.true;
      } else {
        expect(result.serializedTransaction).to.equal('mock-tx');
      }

      // Verify Prisma received number, not string
      const callArgs = prismaMock.swapOffer.findUnique.firstCall.args[0];
      expect(callArgs.where.id).to.equal(124);
      expect(typeof callArgs.where.id).to.equal('number');
    });
  });
});

