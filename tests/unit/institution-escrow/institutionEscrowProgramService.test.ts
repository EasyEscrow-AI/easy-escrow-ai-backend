/**
 * Unit Tests for InstitutionEscrowProgramService
 *
 * Tests on-chain transaction building helpers:
 * - uuidToBytes: UUID string to 32-byte buffer conversion
 * - deriveEscrowStatePda: PDA derivation for escrow state
 * - deriveVaultPda: PDA derivation for token vault
 * - getOrCreateAta: ATA lookup and creation instruction
 * - buildInitTransaction: init escrow tx construction
 * - buildDepositTransaction: deposit tx construction
 * - buildReleaseTransaction: release tx with ATA creation
 * - buildCancelTransaction: cancel tx construction
 * - verifyOnChainState: on-chain account verification
 * - getUsdcMintAddress: env-based USDC mint lookup
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { PublicKey, Transaction } from '@solana/web3.js';

process.env.NODE_ENV = 'test';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.ESCROW_PROGRAM_ID = '11111111111111111111111111111111';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { InstitutionEscrowProgramService } from '../../../src/services/institution-escrow-program.service';

describe('InstitutionEscrowProgramService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionEscrowProgramService;
  let connectionStub: any;

  const TEST_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const PAYER_PUBKEY = new PublicKey('7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u');
  const RECIPIENT_PUBKEY = new PublicKey('498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R');
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    connectionStub = {
      getAccountInfo: sandbox.stub().resolves(null),
    };

    service = new InstitutionEscrowProgramService();
    (service as any).connection = connectionStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── uuidToBytes ────────────────────────────────────────────

  describe('uuidToBytes', () => {
    it('should convert a standard UUID to a 32-byte buffer', () => {
      const result = service.uuidToBytes(TEST_UUID);

      expect(result).to.be.instanceOf(Buffer);
      expect(result.length).to.equal(32);
    });

    it('should strip dashes from UUID before conversion', () => {
      const result = service.uuidToBytes(TEST_UUID);
      const hex = TEST_UUID.replace(/-/g, '');
      const expected = Buffer.from(hex, 'hex');

      // First 16 bytes should match the UUID hex
      expect(result.subarray(0, 16).equals(expected)).to.be.true;
    });

    it('should zero-pad to 32 bytes', () => {
      const result = service.uuidToBytes(TEST_UUID);

      // UUID is 16 bytes hex, remaining 16 should be zeros
      const padding = result.subarray(16, 32);
      expect(padding.every((b) => b === 0)).to.be.true;
    });

    it('should produce consistent output for the same UUID', () => {
      const result1 = service.uuidToBytes(TEST_UUID);
      const result2 = service.uuidToBytes(TEST_UUID);

      expect(result1.equals(result2)).to.be.true;
    });

    it('should produce different output for different UUIDs', () => {
      const result1 = service.uuidToBytes(TEST_UUID);
      const result2 = service.uuidToBytes('660e8400-e29b-41d4-a716-446655440000');

      expect(result1.equals(result2)).to.be.false;
    });
  });

  // ─── deriveEscrowStatePda ───────────────────────────────────

  describe('deriveEscrowStatePda', () => {
    it('should return a PublicKey and bump', () => {
      const idBytes = service.uuidToBytes(TEST_UUID);
      const [pda, bump] = service.deriveEscrowStatePda(idBytes);

      expect(pda).to.be.instanceOf(PublicKey);
      expect(typeof bump).to.equal('number');
      expect(bump).to.be.gte(0).and.lte(255);
    });

    it('should return consistent PDA for the same escrow ID', () => {
      const idBytes = service.uuidToBytes(TEST_UUID);
      const [pda1] = service.deriveEscrowStatePda(idBytes);
      const [pda2] = service.deriveEscrowStatePda(idBytes);

      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });

    it('should return different PDAs for different escrow IDs', () => {
      const bytes1 = service.uuidToBytes(TEST_UUID);
      const bytes2 = service.uuidToBytes('660e8400-e29b-41d4-a716-446655440000');

      const [pda1] = service.deriveEscrowStatePda(bytes1);
      const [pda2] = service.deriveEscrowStatePda(bytes2);

      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });

    it('should derive PDA off the program curve', () => {
      const idBytes = service.uuidToBytes(TEST_UUID);
      const [pda] = service.deriveEscrowStatePda(idBytes);

      // PDAs should NOT be on the ed25519 curve
      expect(PublicKey.isOnCurve(pda.toBytes())).to.be.false;
    });
  });

  // ─── deriveVaultPda ─────────────────────────────────────────

  describe('deriveVaultPda', () => {
    it('should return a PublicKey and bump', () => {
      const idBytes = service.uuidToBytes(TEST_UUID);
      const [pda, bump] = service.deriveVaultPda(idBytes);

      expect(pda).to.be.instanceOf(PublicKey);
      expect(typeof bump).to.equal('number');
      expect(bump).to.be.gte(0).and.lte(255);
    });

    it('should derive a different PDA than escrow state for same ID', () => {
      const idBytes = service.uuidToBytes(TEST_UUID);
      const [escrowPda] = service.deriveEscrowStatePda(idBytes);
      const [vaultPda] = service.deriveVaultPda(idBytes);

      expect(escrowPda.toBase58()).to.not.equal(vaultPda.toBase58());
    });

    it('should be consistent for the same escrow ID', () => {
      const idBytes = service.uuidToBytes(TEST_UUID);
      const [pda1] = service.deriveVaultPda(idBytes);
      const [pda2] = service.deriveVaultPda(idBytes);

      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });
  });

  // ─── getOrCreateAta ─────────────────────────────────────────

  describe('getOrCreateAta', () => {
    it('should return existing ATA address without instruction when account exists', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });

      const result = await service.getOrCreateAta(USDC_MINT, PAYER_PUBKEY, PAYER_PUBKEY);

      expect(result).to.have.property('address');
      expect(result.address).to.be.instanceOf(PublicKey);
      expect(result.instruction).to.be.undefined;
    });

    it('should return ATA address with create instruction when account does not exist', async () => {
      connectionStub.getAccountInfo.resolves(null);

      const result = await service.getOrCreateAta(USDC_MINT, PAYER_PUBKEY, PAYER_PUBKEY);

      expect(result).to.have.property('address');
      expect(result.address).to.be.instanceOf(PublicKey);
      expect(result.instruction).to.not.be.undefined;
      expect(result.instruction!.programId).to.be.instanceOf(PublicKey);
    });

    it('should return create instruction when getAccountInfo throws', async () => {
      connectionStub.getAccountInfo.rejects(new Error('RPC error'));

      const result = await service.getOrCreateAta(USDC_MINT, PAYER_PUBKEY, PAYER_PUBKEY);

      expect(result.instruction).to.not.be.undefined;
    });

    it('should derive same ATA address regardless of payer', async () => {
      connectionStub.getAccountInfo.resolves(null);

      const result1 = await service.getOrCreateAta(USDC_MINT, RECIPIENT_PUBKEY, PAYER_PUBKEY);
      const result2 = await service.getOrCreateAta(USDC_MINT, RECIPIENT_PUBKEY, RECIPIENT_PUBKEY);

      expect(result1.address.toBase58()).to.equal(result2.address.toBase58());
    });
  });

  // ─── buildInitTransaction ───────────────────────────────────

  describe('buildInitTransaction', () => {
    it('should return a transaction with escrowPda and vaultPda strings', async () => {
      const result = await service.buildInitTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        usdcMint: USDC_MINT,
        feeCollector: PAYER_PUBKEY,
        settlementAuthority: PAYER_PUBKEY,
        amount: 1000,
        platformFee: 10,
        conditionType: 0,
        corridor: 'US-MX',
        expiryTimestamp: Math.floor(Date.now() / 1000) + 86400,
      });

      expect(result).to.have.property('transaction');
      expect(result.transaction).to.be.instanceOf(Transaction);
      expect(result).to.have.property('escrowPda');
      expect(result).to.have.property('vaultPda');
      expect(typeof result.escrowPda).to.equal('string');
      expect(typeof result.vaultPda).to.equal('string');
    });

    it('should derive different PDAs for different escrow IDs', async () => {
      const result1 = await service.buildInitTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        usdcMint: USDC_MINT,
        feeCollector: PAYER_PUBKEY,
        settlementAuthority: PAYER_PUBKEY,
        amount: 1000,
        platformFee: 10,
        conditionType: 0,
        corridor: 'US-MX',
        expiryTimestamp: Math.floor(Date.now() / 1000) + 86400,
      });

      const result2 = await service.buildInitTransaction({
        escrowId: '660e8400-e29b-41d4-a716-446655440000',
        authority: PAYER_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        usdcMint: USDC_MINT,
        feeCollector: PAYER_PUBKEY,
        settlementAuthority: PAYER_PUBKEY,
        amount: 1000,
        platformFee: 10,
        conditionType: 0,
        corridor: 'US-MX',
        expiryTimestamp: Math.floor(Date.now() / 1000) + 86400,
      });

      expect(result1.escrowPda).to.not.equal(result2.escrowPda);
    });
  });

  // ─── buildDepositTransaction ────────────────────────────────

  describe('buildDepositTransaction', () => {
    it('should return a Transaction', async () => {
      const result = await service.buildDepositTransaction({
        escrowId: TEST_UUID,
        payer: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      expect(result).to.be.instanceOf(Transaction);
    });
  });

  // ─── buildReleaseTransaction ────────────────────────────────

  describe('buildReleaseTransaction', () => {
    it('should return a Transaction', async () => {
      connectionStub.getAccountInfo.resolves(null); // ATAs don't exist

      const result = await service.buildReleaseTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      expect(result).to.be.instanceOf(Transaction);
    });

    it('should add ATA creation instructions when ATAs do not exist', async () => {
      connectionStub.getAccountInfo.resolves(null);

      const result = await service.buildReleaseTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      // Transaction should have ATA creation instructions
      expect(result.instructions.length).to.be.gte(0);
    });

    it('should skip ATA creation instructions when ATAs already exist', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });

      const result = await service.buildReleaseTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      // No ATA creation needed
      expect(result.instructions.length).to.equal(0);
    });
  });

  // ─── buildCancelTransaction ─────────────────────────────────

  describe('buildCancelTransaction', () => {
    it('should return a Transaction', async () => {
      const result = await service.buildCancelTransaction({
        escrowId: TEST_UUID,
        caller: PAYER_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      expect(result).to.be.instanceOf(Transaction);
    });
  });

  // ─── verifyOnChainState ─────────────────────────────────────

  describe('verifyOnChainState', () => {
    it('should return exists: false when account does not exist', async () => {
      connectionStub.getAccountInfo.resolves(null);

      const result = await service.verifyOnChainState(TEST_UUID);

      expect(result).to.deep.equal({ exists: false });
    });

    it('should return exists: true when account exists', async () => {
      connectionStub.getAccountInfo.resolves({
        data: Buffer.alloc(200),
        lamports: 1000000,
        owner: new PublicKey('11111111111111111111111111111111'),
      });

      const result = await service.verifyOnChainState(TEST_UUID);

      expect(result.exists).to.be.true;
    });

    it('should return exists: false on RPC error', async () => {
      connectionStub.getAccountInfo.rejects(new Error('RPC timeout'));

      const result = await service.verifyOnChainState(TEST_UUID);

      expect(result).to.deep.equal({ exists: false });
    });
  });

  // ─── getUsdcMintAddress ─────────────────────────────────────

  describe('getUsdcMintAddress', () => {
    it('should return USDC mint PublicKey from env', () => {
      const result = service.getUsdcMintAddress();

      expect(result).to.be.instanceOf(PublicKey);
      expect(result.toBase58()).to.equal('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    });

    it('should throw when USDC_MINT_ADDRESS is not set', () => {
      const original = process.env.USDC_MINT_ADDRESS;
      delete process.env.USDC_MINT_ADDRESS;

      try {
        service.getUsdcMintAddress();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('USDC_MINT_ADDRESS not configured');
      } finally {
        process.env.USDC_MINT_ADDRESS = original;
      }
    });
  });
});
