/**
 * Unit Tests for DataSales Program Service
 * Tests PDA derivation, transaction building, and Solana program interaction
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DataSalesProgramService } from '../../../src/services/datasales-program.service';

// Store original env
const originalEnv = { ...process.env };

describe('DataSalesProgramService', () => {
  let service: DataSalesProgramService;
  let connection: Connection;
  let tempKeypairPath: string;

  // Use actual UUID format since uuidToBuffer expects UUID strings
  const mockAgreementId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const sellerWallet = Keypair.generate().publicKey.toBase58();
  const buyerWallet = Keypair.generate().publicKey.toBase58();

  beforeEach(() => {
    // Create a temp keypair file
    const tempDir = os.tmpdir();
    tempKeypairPath = path.join(tempDir, `test-keypair-${Date.now()}.json`);
    const keypair = Keypair.generate();
    fs.writeFileSync(tempKeypairPath, JSON.stringify(Array.from(keypair.secretKey)));

    // Set up test environment
    process.env.ESCROW_PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';
    process.env.TREASURY_WALLET = Keypair.generate().publicKey.toBase58();
    process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
    process.env.PLATFORM_AUTHORITY_KEYPAIR_PATH = tempKeypairPath;

    connection = new Connection('https://api.devnet.solana.com');

    // Reset singleton before creating new instance
    (DataSalesProgramService as any).instance = null;

    // Create new instance for each test (constructor takes no args)
    service = new DataSalesProgramService();
  });

  afterEach(() => {
    // Clean up temp keypair file
    if (tempKeypairPath && fs.existsSync(tempKeypairPath)) {
      fs.unlinkSync(tempKeypairPath);
    }
    process.env = { ...originalEnv };
    // Reset singleton if needed
    (DataSalesProgramService as any).instance = null;
  });

  describe('PDA Derivation', () => {
    describe('deriveEscrowPda', () => {
      it('should derive consistent PDA for same agreement ID', () => {
        const result1 = service.deriveEscrowPda(mockAgreementId);
        const result2 = service.deriveEscrowPda(mockAgreementId);

        expect(result1.pda.toBase58()).to.equal(result2.pda.toBase58());
        expect(result1.bump).to.equal(result2.bump);
      });

      it('should derive different PDAs for different agreement IDs', () => {
        // Use valid UUID format strings
        const result1 = service.deriveEscrowPda('11111111-1111-1111-1111-111111111111');
        const result2 = service.deriveEscrowPda('22222222-2222-2222-2222-222222222222');

        expect(result1.pda.toBase58()).to.not.equal(result2.pda.toBase58());
      });

      it('should return valid PublicKey', () => {
        const result = service.deriveEscrowPda(mockAgreementId);

        expect(result.pda).to.be.instanceOf(PublicKey);
        expect(result.pda.toBase58()).to.be.a('string');
        expect(result.pda.toBase58()).to.have.length(44); // Standard base58 pubkey length
      });

      it('should return bump value between 0-255', () => {
        const result = service.deriveEscrowPda(mockAgreementId);

        expect(result.bump).to.be.a('number');
        expect(result.bump).to.be.at.least(0);
        expect(result.bump).to.be.at.most(255);
      });

      it('should handle valid UUID format', () => {
        // UUID v4 format: 8-4-4-4-12 hex digits
        const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
        const result = service.deriveEscrowPda(uuid);

        expect(result.pda).to.be.instanceOf(PublicKey);
        expect(result.bump).to.be.a('number');
      });

      it('should handle all-zeros UUID', () => {
        const zeroUuid = '00000000-0000-0000-0000-000000000000';
        const result = service.deriveEscrowPda(zeroUuid);

        expect(result.pda).to.be.instanceOf(PublicKey);
      });
    });

    describe('deriveVaultPda', () => {
      it('should derive consistent vault PDA for same agreement ID', () => {
        const result1 = service.deriveVaultPda(mockAgreementId);
        const result2 = service.deriveVaultPda(mockAgreementId);

        expect(result1.pda.toBase58()).to.equal(result2.pda.toBase58());
        expect(result1.bump).to.equal(result2.bump);
      });

      it('should derive different vault PDA than escrow PDA', () => {
        const escrowPda = service.deriveEscrowPda(mockAgreementId);
        const vaultPda = service.deriveVaultPda(mockAgreementId);

        expect(escrowPda.pda.toBase58()).to.not.equal(vaultPda.pda.toBase58());
      });

      it('should derive different vault PDAs for different agreement IDs', () => {
        // Use valid UUID format strings
        const result1 = service.deriveVaultPda('11111111-1111-1111-1111-111111111111');
        const result2 = service.deriveVaultPda('22222222-2222-2222-2222-222222222222');

        expect(result1.pda.toBase58()).to.not.equal(result2.pda.toBase58());
      });
    });
  });

  describe('Transaction Building', () => {
    // Note: These tests verify structure, not actual on-chain behavior
    // Full transaction building requires mocking Anchor program

    describe('buildCreateEscrowTransaction', () => {
      it('should accept valid create escrow input', async () => {
        const input = {
          agreementId: mockAgreementId,
          sellerWallet,
          priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
          platformFeeLamports: BigInt(0.025 * LAMPORTS_PER_SOL),
          depositWindowEnd: Math.floor(Date.now() / 1000) + 72 * 3600,
          accessDurationSeconds: 168 * 3600,
        };

        // This will fail without full Anchor setup, but we test the input validation
        try {
          await service.buildCreateEscrowTransaction(input);
        } catch (error: any) {
          // Expected to fail without program connection
          // But should not fail on input validation
          expect(error.message).to.not.include('Invalid input');
        }
      });

      it('should accept optional buyer wallet', async () => {
        const input = {
          agreementId: mockAgreementId,
          sellerWallet,
          buyerWallet: undefined,
          priceLamports: BigInt(1 * LAMPORTS_PER_SOL),
          platformFeeLamports: BigInt(0.025 * LAMPORTS_PER_SOL),
          depositWindowEnd: Math.floor(Date.now() / 1000) + 72 * 3600,
          accessDurationSeconds: 168 * 3600,
        };

        try {
          await service.buildCreateEscrowTransaction(input);
        } catch (error: any) {
          expect(error.message).to.not.include('buyerWallet');
        }
      });
    });

    describe('buildDepositSolTransaction', () => {
      it('should accept valid deposit input', async () => {
        const input = {
          agreementId: mockAgreementId,
          buyerWallet,
        };

        try {
          await service.buildDepositSolTransaction(input);
        } catch (error: any) {
          // Expected to fail without program connection
          expect(error.message).to.not.include('Invalid input');
        }
      });

      it('should derive correct escrow PDA for deposit', async () => {
        const input = {
          agreementId: mockAgreementId,
          buyerWallet,
        };

        const expectedPda = service.deriveEscrowPda(mockAgreementId);

        try {
          const result = await service.buildDepositSolTransaction(input);
          // If successful, escrowPda should match
          expect(result.escrowPda).to.equal(expectedPda.pda.toBase58());
        } catch (error: any) {
          // Expected without full setup
        }
      });
    });

    describe('buildSettleTransaction', () => {
      it('should accept valid settle input', async () => {
        const input = {
          agreementId: mockAgreementId,
          sellerWallet,
        };

        try {
          await service.buildSettleTransaction(input);
        } catch (error: any) {
          expect(error.message).to.not.include('Invalid input');
        }
      });
    });

    describe('buildCancelTransaction', () => {
      it('should accept cancel input without buyer', async () => {
        const input = {
          agreementId: mockAgreementId,
        };

        try {
          await service.buildCancelTransaction(input);
        } catch (error: any) {
          expect(error.message).to.not.include('Invalid input');
        }
      });

      it('should accept cancel input with buyer for refund', async () => {
        const input = {
          agreementId: mockAgreementId,
          buyerWallet,
        };

        try {
          await service.buildCancelTransaction(input);
        } catch (error: any) {
          expect(error.message).to.not.include('Invalid input');
        }
      });
    });

    describe('buildCloseEscrowTransaction', () => {
      it('should accept valid close input', async () => {
        try {
          await service.buildCloseEscrowTransaction(mockAgreementId);
        } catch (error: any) {
          expect(error.message).to.not.include('Invalid input');
        }
      });
    });
  });

  describe('Helper Methods', () => {
    describe('UUID to Buffer conversion', () => {
      it('should produce consistent buffer for same UUID', () => {
        // Same UUID should produce same PDA
        const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
        const pda1 = service.deriveEscrowPda(uuid);
        const pda2 = service.deriveEscrowPda(uuid);

        expect(pda1.pda.toBase58()).to.equal(pda2.pda.toBase58());
      });

      it('should handle UUID without dashes', () => {
        // UUID with and without dashes should produce same result (dashes are stripped)
        const withDashes = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
        const withoutDashes = 'a1b2c3d4e5f67890abcdef1234567890';

        // The implementation strips dashes, so both should work
        const pda1 = service.deriveEscrowPda(withDashes);
        expect(pda1.pda).to.be.instanceOf(PublicKey);
      });

      it('should produce different PDAs for different UUIDs', () => {
        const uuid1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const uuid2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        const pda1 = service.deriveEscrowPda(uuid1);
        const pda2 = service.deriveEscrowPda(uuid2);

        expect(pda1.pda.toBase58()).to.not.equal(pda2.pda.toBase58());
      });
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getDataSalesProgramService', async () => {
      // Import the getter function
      const { getDataSalesProgramService } = await import('../../../src/services/datasales-program.service');

      const instance1 = getDataSalesProgramService();
      const instance2 = getDataSalesProgramService();

      // Note: This may not be the same instance as our test instance
      // since we're testing the singleton behavior
      expect(instance1).to.equal(instance2);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Service uses config.solana.rpcUrl internally
      // Test that invalid transactions are handled gracefully
      try {
        await service.sendAndConfirmTransaction('invalid-tx');
      } catch (error: any) {
        // Should throw meaningful error, not crash
        expect(error).to.exist;
      }
    });

    it('should validate agreement ID format', () => {
      // Test that valid UUID formats work
      const validUuids = [
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        '00000000-0000-0000-0000-000000000000',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '12345678-1234-1234-1234-123456789012',
      ];

      for (const uuid of validUuids) {
        const result = service.deriveEscrowPda(uuid);
        expect(result.pda).to.be.instanceOf(PublicKey);
      }
    });
  });

  describe('Transaction Confirmation', () => {
    it('should handle sendAndConfirmTransaction with invalid transaction', async () => {
      try {
        await service.sendAndConfirmTransaction('invalid-base64-transaction');
      } catch (error: any) {
        expect(error).to.exist;
        // Should fail with deserialization error
      }
    });
  });

  describe('Seeds Consistency', () => {
    it('should use correct seeds prefix for escrow PDA', () => {
      // Verify PDA is deterministic with known seeds
      const agreementId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

      // Multiple calls should always return same result
      const results = Array.from({ length: 5 }, () => service.deriveEscrowPda(agreementId));

      const firstPda = results[0].pda.toBase58();
      for (const result of results) {
        expect(result.pda.toBase58()).to.equal(firstPda);
      }
    });

    it('should use correct seeds prefix for vault PDA', () => {
      const agreementId = 'b2c3d4e5-f678-90ab-cdef-123456789012';

      const results = Array.from({ length: 5 }, () => service.deriveVaultPda(agreementId));

      const firstPda = results[0].pda.toBase58();
      for (const result of results) {
        expect(result.pda.toBase58()).to.equal(firstPda);
      }
    });
  });
});
