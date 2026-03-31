/**
 * Unit Tests for InstitutionEscrowProgramService
 *
 * Tests on-chain transaction building helpers:
 * - uuidToBytes: UUID string to 32-byte buffer conversion
 * - deriveEscrowStatePda: PDA derivation for escrow state
 * - deriveVaultPda: PDA derivation for token vault
 * - getOrCreateAta: ATA lookup and creation instruction
 * - buildInitTransaction: init escrow tx with Anchor instruction
 * - buildDepositTransaction: deposit tx with Anchor instruction
 * - buildReleaseTransaction: release tx with ATA creation + Anchor instruction
 * - buildCancelTransaction: cancel tx with Anchor instruction
 * - verifyOnChainState: on-chain account verification via Anchor decoding
 * - signAndSubmit: transaction signing and submission
 * - High-level methods: initEscrowOnChain, releaseEscrowOnChain, cancelEscrowOnChain
 * - getUsdcMintAddress: env-based USDC mint lookup
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';

// Set env before imports so the service can initialize
const testKeypair = Keypair.generate();
process.env.NODE_ENV = 'test';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.ESCROW_PROGRAM_ID = '11111111111111111111111111111111';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.DEVNET_ADMIN_PRIVATE_KEY = JSON.stringify(Array.from(testKeypair.secretKey));

import { InstitutionEscrowProgramService } from '../../../src/services/institution-escrow-program.service';

describe('InstitutionEscrowProgramService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionEscrowProgramService;
  let connectionStub: any;
  let programMethodsStub: any;
  let programAccountStub: any;

  const TEST_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const PAYER_PUBKEY = new PublicKey('7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u');
  const RECIPIENT_PUBKEY = new PublicKey('498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R');
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

  // Helper to create a chainable mock for program.methods.<name>(args).accounts(accts).instruction()
  function createMethodChain(returnIx?: any) {
    const dummyIx = returnIx || {
      programId: new PublicKey('11111111111111111111111111111111'),
      keys: [],
      data: Buffer.alloc(0),
    };
    const chain: any = {
      accounts: sinon.stub().returnsThis(),
      instruction: sinon.stub().resolves(dummyIx),
    };
    return chain;
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    connectionStub = {
      getAccountInfo: sandbox.stub().resolves(null),
      getLatestBlockhash: sandbox.stub().resolves({
        blockhash: 'FakeBlockhash1111111111111111111111111111111',
        lastValidBlockHeight: 100,
      }),
      sendRawTransaction: sandbox.stub().resolves('FakeTxSignature111111111111111111111111111111'),
      confirmTransaction: sandbox.stub().resolves({ value: { err: null } }),
      getTransaction: sandbox.stub().resolves({ meta: { err: null } }),
    };

    // Create method chain stubs
    const initChain = createMethodChain();
    const depositChain = createMethodChain();
    const releaseChain = createMethodChain();
    const cancelChain = createMethodChain();

    programMethodsStub = {
      initInstitutionEscrow: sandbox.stub().returns(initChain),
      depositInstitutionEscrow: sandbox.stub().returns(depositChain),
      releaseInstitutionEscrow: sandbox.stub().returns(releaseChain),
      cancelInstitutionEscrow: sandbox.stub().returns(cancelChain),
    };

    programAccountStub = {
      institutionEscrow: {
        fetchNullable: sandbox.stub().resolves(null),
      },
    };

    service = new InstitutionEscrowProgramService();
    // Replace internals with stubs
    (service as any).connection = connectionStub;
    (service as any).program = {
      methods: programMethodsStub,
      account: programAccountStub,
      programId: new PublicKey('11111111111111111111111111111111'),
    };
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

      expect(result.subarray(0, 16).equals(expected)).to.be.true;
    });

    it('should zero-pad to 32 bytes', () => {
      const result = service.uuidToBytes(TEST_UUID);

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
        amountMicroUsdc: '1000000000',
        platformFeeMicroUsdc: '10000000',
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

    it('should call program.methods.initInstitutionEscrow with correct args', async () => {
      await service.buildInitTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        usdcMint: USDC_MINT,
        feeCollector: PAYER_PUBKEY,
        settlementAuthority: PAYER_PUBKEY,
        amountMicroUsdc: '1000000000',
        platformFeeMicroUsdc: '10000000',
        conditionType: 0,
        corridor: 'US-MX',
        expiryTimestamp: Math.floor(Date.now() / 1000) + 86400,
      });

      expect(programMethodsStub.initInstitutionEscrow.calledOnce).to.be.true;
      const args = programMethodsStub.initInstitutionEscrow.firstCall.args;
      // First arg: escrowIdArray (Array<number>, 32 elements)
      expect(args[0]).to.have.length(32);
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
        amountMicroUsdc: '1000000000',
        platformFeeMicroUsdc: '10000000',
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
        amountMicroUsdc: '1000000000',
        platformFeeMicroUsdc: '10000000',
        conditionType: 0,
        corridor: 'US-MX',
        expiryTimestamp: Math.floor(Date.now() / 1000) + 86400,
      });

      expect(result1.escrowPda).to.not.equal(result2.escrowPda);
    });

    it('should map string condition types correctly', async () => {
      await service.buildInitTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        usdcMint: USDC_MINT,
        feeCollector: PAYER_PUBKEY,
        settlementAuthority: PAYER_PUBKEY,
        amountMicroUsdc: '1000000000',
        platformFeeMicroUsdc: '10000000',
        conditionType: 'COMPLIANCE_CHECK',
        corridor: 'US-MX',
        expiryTimestamp: Math.floor(Date.now() / 1000) + 86400,
      });

      const args = programMethodsStub.initInstitutionEscrow.firstCall.args;
      // Fourth arg is condition type enum
      expect(args[3]).to.deep.equal({ complianceCheck: {} });
    });

    it('should append SPL Memo instruction when memo is provided', async () => {
      const result = await service.buildInitTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        usdcMint: USDC_MINT,
        feeCollector: PAYER_PUBKEY,
        settlementAuthority: PAYER_PUBKEY,
        amountMicroUsdc: '1000000000',
        platformFeeMicroUsdc: '10000000',
        conditionType: 0,
        corridor: 'US-MX',
        expiryTimestamp: Math.floor(Date.now() / 1000) + 86400,
        memo: 'EasyEscrow:init:EE-A3K7-9WFP',
      });

      // 1 init instruction + 1 memo instruction
      expect(result.transaction.instructions.length).to.equal(2);
      const memoIx = result.transaction.instructions[1];
      expect(memoIx.programId.toBase58()).to.equal('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
      expect(memoIx.data.toString('utf-8')).to.equal('EasyEscrow:init:EE-A3K7-9WFP');
    });

    it('should not append memo when memo is omitted', async () => {
      const result = await service.buildInitTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        usdcMint: USDC_MINT,
        feeCollector: PAYER_PUBKEY,
        settlementAuthority: PAYER_PUBKEY,
        amountMicroUsdc: '1000000000',
        platformFeeMicroUsdc: '10000000',
        conditionType: 0,
        corridor: 'US-MX',
        expiryTimestamp: Math.floor(Date.now() / 1000) + 86400,
      });

      expect(result.transaction.instructions.length).to.equal(1);
    });
  });

  // ─── buildDepositTransaction ────────────────────────────────

  describe('buildDepositTransaction', () => {
    it('should return a Transaction with deposit instruction', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });

      const result = await service.buildDepositTransaction({
        escrowId: TEST_UUID,
        payer: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
        feeCollector: PAYER_PUBKEY,
      });

      expect(result).to.be.instanceOf(Transaction);
      expect(programMethodsStub.depositInstitutionEscrow.calledOnce).to.be.true;
    });

    it('should pass escrow ID array as arg', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });

      await service.buildDepositTransaction({
        escrowId: TEST_UUID,
        payer: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
        feeCollector: PAYER_PUBKEY,
      });

      const args = programMethodsStub.depositInstitutionEscrow.firstCall.args;
      expect(args[0]).to.have.length(32);
    });
  });

  // ─── buildReleaseTransaction ────────────────────────────────

  describe('buildReleaseTransaction', () => {
    it('should return a Transaction with release instruction', async () => {
      connectionStub.getAccountInfo.resolves(null);

      const result = await service.buildReleaseTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      expect(result).to.be.instanceOf(Transaction);
      expect(programMethodsStub.releaseInstitutionEscrow.calledOnce).to.be.true;
    });

    it('should add ATA creation instruction when recipient ATA does not exist', async () => {
      connectionStub.getAccountInfo.resolves(null);

      const result = await service.buildReleaseTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      // 2 ATA create instructions (recipient + fee collector) + 1 release instruction
      expect(result.instructions.length).to.equal(3);
    });

    it('should skip ATA creation instruction when recipient ATA already exists', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });

      const result = await service.buildReleaseTransaction({
        escrowId: TEST_UUID,
        authority: PAYER_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      // Only release instruction, no ATA creation
      expect(result.instructions.length).to.equal(1);
    });
  });

  // ─── buildCancelTransaction ─────────────────────────────────

  describe('buildCancelTransaction', () => {
    it('should return a Transaction with cancel instruction', async () => {
      const result = await service.buildCancelTransaction({
        escrowId: TEST_UUID,
        caller: PAYER_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      expect(result).to.be.instanceOf(Transaction);
      expect(programMethodsStub.cancelInstitutionEscrow.calledOnce).to.be.true;
    });
  });

  // ─── verifyOnChainState ─────────────────────────────────────

  describe('verifyOnChainState', () => {
    it('should return exists: false when account does not exist', async () => {
      programAccountStub.institutionEscrow.fetchNullable.resolves(null);

      const result = await service.verifyOnChainState(TEST_UUID);

      expect(result).to.deep.equal({ exists: false });
    });

    it('should return decoded state when account exists with funded status', async () => {
      // Mock amount with valueOf() so Number(decoded.amount) works like a real BN
      const bnLikeAmount = { valueOf: () => 1000000, toNumber: () => 1000000 };
      programAccountStub.institutionEscrow.fetchNullable.resolves({
        status: { funded: {} },
        amount: bnLikeAmount,
        payer: PAYER_PUBKEY,
        recipient: RECIPIENT_PUBKEY,
      });

      const result = await service.verifyOnChainState(TEST_UUID);

      expect(result.exists).to.be.true;
      expect(result.status).to.equal(1);
      expect(result.amount).to.equal(1000000);
      expect(result.payer).to.equal(PAYER_PUBKEY.toBase58());
      expect(result.recipient).to.equal(RECIPIENT_PUBKEY.toBase58());
    });

    it('should return created status (0) correctly', async () => {
      const bnLikeAmount = { valueOf: () => 500000, toNumber: () => 500000 };
      programAccountStub.institutionEscrow.fetchNullable.resolves({
        status: { created: {} },
        amount: bnLikeAmount,
        payer: PAYER_PUBKEY,
        recipient: RECIPIENT_PUBKEY,
      });

      const result = await service.verifyOnChainState(TEST_UUID);

      expect(result.exists).to.be.true;
      expect(result.status).to.equal(0);
    });

    it('should return exists: false on fetch error', async () => {
      programAccountStub.institutionEscrow.fetchNullable.rejects(new Error('RPC timeout'));

      const result = await service.verifyOnChainState(TEST_UUID);

      expect(result).to.deep.equal({ exists: false });
    });
  });

  // ─── High-level methods ─────────────────────────────────────

  describe('initEscrowOnChain', () => {
    let signAndSubmitStub: sinon.SinonStub;

    beforeEach(() => {
      signAndSubmitStub = sandbox.stub(service as any, 'signAndSubmit').resolves('FakeTxSig123');
    });

    it('should call buildInitTransaction and signAndSubmit', async () => {
      // PDA does not exist yet (getAccountInfo returns null)
      connectionStub.getAccountInfo.resolves(null);

      const result = await service.initEscrowOnChain({
        escrowId: TEST_UUID,
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

      expect(result.txSignature).to.equal('FakeTxSig123');
      expect(result.escrowPda).to.be.a('string');
      expect(result.vaultPda).to.be.a('string');
      expect(programMethodsStub.initInstitutionEscrow.calledOnce).to.be.true;
      expect(signAndSubmitStub.calledOnce).to.be.true;
    });

    it('should skip init if PDA already exists (idempotency)', async () => {
      // First call: check PDA existence — it exists
      connectionStub.getAccountInfo.resolves({
        data: Buffer.alloc(200),
        lamports: 1000000,
        owner: new PublicKey('11111111111111111111111111111111'),
      });

      const result = await service.initEscrowOnChain({
        escrowId: TEST_UUID,
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

      expect(result.txSignature).to.equal('already-initialized');
      expect(programMethodsStub.initInstitutionEscrow.called).to.be.false;
      expect(signAndSubmitStub.called).to.be.false;
    });
  });

  describe('releaseEscrowOnChain', () => {
    let signAndSubmitStub: sinon.SinonStub;

    beforeEach(() => {
      signAndSubmitStub = sandbox.stub(service as any, 'signAndSubmit').resolves('ReleaseTxSig456');
    });

    it('should call buildReleaseTransaction and signAndSubmit', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });

      const result = await service.releaseEscrowOnChain({
        escrowId: TEST_UUID,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      expect(result).to.equal('ReleaseTxSig456');
      expect(programMethodsStub.releaseInstitutionEscrow.calledOnce).to.be.true;
      expect(signAndSubmitStub.calledOnce).to.be.true;
    });
  });

  describe('cancelEscrowOnChain', () => {
    let signAndSubmitStub: sinon.SinonStub;

    beforeEach(() => {
      signAndSubmitStub = sandbox.stub(service as any, 'signAndSubmit').resolves('CancelTxSig789');
    });

    it('should call buildCancelTransaction and signAndSubmit', async () => {
      const result = await service.cancelEscrowOnChain({
        escrowId: TEST_UUID,
        payerWallet: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      expect(result).to.equal('CancelTxSig789');
      expect(programMethodsStub.cancelInstitutionEscrow.calledOnce).to.be.true;
      expect(signAndSubmitStub.calledOnce).to.be.true;
    });
  });

  // ─── Error rollback ─────────────────────────────────────────

  describe('error handling', () => {
    it('should throw when signAndSubmit fails on init', async () => {
      connectionStub.getAccountInfo.resolves(null);
      sandbox
        .stub(service as any, 'signAndSubmit')
        .rejects(new Error('Transaction simulation failed'));

      try {
        await service.initEscrowOnChain({
          escrowId: TEST_UUID,
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
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Transaction simulation failed');
      }
    });

    it('should throw when signAndSubmit fails on release', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });
      sandbox.stub(service as any, 'signAndSubmit').rejects(new Error('Insufficient funds'));

      try {
        await service.releaseEscrowOnChain({
          escrowId: TEST_UUID,
          recipientWallet: RECIPIENT_PUBKEY,
          feeCollector: PAYER_PUBKEY,
          usdcMint: USDC_MINT,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Insufficient funds');
      }
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

  // ─── adminPublicKey getter ──────────────────────────────────

  describe('adminPublicKey', () => {
    it('should return the admin keypair public key', () => {
      const adminPk = service.adminPublicKey;

      expect(adminPk).to.be.instanceOf(PublicKey);
      expect(adminPk.toBase58()).to.equal(testKeypair.publicKey.toBase58());
    });
  });

  // ─── releaseEscrowWithCdp ─────────────────────────────────

  describe('releaseEscrowWithCdp', () => {
    const CDP_PUBKEY = new PublicKey('498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R');
    let cdpServiceStub: any;

    // Valid base58 blockhash (needed for transaction.partialSign)
    const VALID_BLOCKHASH = '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM';

    beforeEach(() => {
      // Use a valid base58 blockhash for partialSign
      connectionStub.getLatestBlockhash.resolves({
        blockhash: VALID_BLOCKHASH,
        lastValidBlockHeight: 100,
      });

      // Mock getCdpSettlementService
      cdpServiceStub = {
        signTransaction: sandbox.stub().callsFake(async (serialized: Buffer) => {
          // Return the same buffer (pretend CDP signed it)
          return serialized;
        }),
        getPublicKey: sandbox.stub().resolves(CDP_PUBKEY),
      };
      // Stub the import
      const cdpModule = require('../../../src/services/cdp-settlement.service');
      sandbox.stub(cdpModule, 'getCdpSettlementService').returns(cdpServiceStub);
    });

    it('should build release tx with CDP pubkey as authority', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });

      await service.releaseEscrowWithCdp({
        escrowId: TEST_UUID,
        cdpAuthorityPubkey: CDP_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      // buildReleaseTransaction should use CDP pubkey as authority
      expect(programMethodsStub.releaseInstitutionEscrow.calledOnce).to.be.true;
    });

    it('should set admin as fee payer and call CDP signTransaction', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });

      await service.releaseEscrowWithCdp({
        escrowId: TEST_UUID,
        cdpAuthorityPubkey: CDP_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      // Verify CDP service was called with serialized tx
      expect(cdpServiceStub.signTransaction.calledOnce).to.be.true;
      const serializedArg = cdpServiceStub.signTransaction.firstCall.args[0];
      expect(serializedArg).to.be.instanceOf(Buffer);
    });

    it('should submit fully-signed tx to Solana RPC', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });

      const result = await service.releaseEscrowWithCdp({
        escrowId: TEST_UUID,
        cdpAuthorityPubkey: CDP_PUBKEY,
        recipientWallet: RECIPIENT_PUBKEY,
        feeCollector: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      expect(connectionStub.sendRawTransaction.calledOnce).to.be.true;
      expect(connectionStub.confirmTransaction.calledOnce).to.be.true;
      expect(result).to.equal('FakeTxSignature111111111111111111111111111111');
    });

    it('should throw if CDP signing fails', async () => {
      connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(165), lamports: 1000 });
      cdpServiceStub.signTransaction.rejects(new Error('CDP policy violation'));

      try {
        await service.releaseEscrowWithCdp({
          escrowId: TEST_UUID,
          cdpAuthorityPubkey: CDP_PUBKEY,
          recipientWallet: RECIPIENT_PUBKEY,
          feeCollector: PAYER_PUBKEY,
          usdcMint: USDC_MINT,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('CDP policy violation');
      }
    });
  });

  // ─── cancelEscrowWithCdp ──────────────────────────────────

  describe('cancelEscrowWithCdp', () => {
    const CDP_PUBKEY = new PublicKey('498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R');
    let cdpServiceStub: any;

    const VALID_BLOCKHASH = '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM';

    beforeEach(() => {
      connectionStub.getLatestBlockhash.resolves({
        blockhash: VALID_BLOCKHASH,
        lastValidBlockHeight: 100,
      });

      cdpServiceStub = {
        signTransaction: sandbox.stub().callsFake(async (serialized: Buffer) => serialized),
        getPublicKey: sandbox.stub().resolves(CDP_PUBKEY),
      };
      const cdpModule = require('../../../src/services/cdp-settlement.service');
      sandbox.stub(cdpModule, 'getCdpSettlementService').returns(cdpServiceStub);
    });

    it('should build cancel tx with CDP pubkey as caller', async () => {
      await service.cancelEscrowWithCdp({
        escrowId: TEST_UUID,
        cdpCallerPubkey: CDP_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      expect(programMethodsStub.cancelInstitutionEscrow.calledOnce).to.be.true;
    });

    it('should follow same multi-sign pattern as release', async () => {
      await service.cancelEscrowWithCdp({
        escrowId: TEST_UUID,
        cdpCallerPubkey: CDP_PUBKEY,
        payerWallet: PAYER_PUBKEY,
        usdcMint: USDC_MINT,
      });

      // CDP signs + RPC submit
      expect(cdpServiceStub.signTransaction.calledOnce).to.be.true;
      expect(connectionStub.sendRawTransaction.calledOnce).to.be.true;
      expect(connectionStub.confirmTransaction.calledOnce).to.be.true;
    });

    it('should throw if CDP signing fails', async () => {
      cdpServiceStub.signTransaction.rejects(new Error('CDP policy violation'));

      try {
        await service.cancelEscrowWithCdp({
          escrowId: TEST_UUID,
          cdpCallerPubkey: CDP_PUBKEY,
          payerWallet: PAYER_PUBKEY,
          usdcMint: USDC_MINT,
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('CDP policy violation');
        // Verify downstream RPC methods were NOT called after signing failure
        expect(connectionStub.sendRawTransaction.called).to.be.false;
        expect(connectionStub.confirmTransaction.called).to.be.false;
      }
    });
  });
});
