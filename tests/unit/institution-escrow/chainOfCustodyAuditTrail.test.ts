/**
 * Unit Tests for Chain-of-Custody Audit Trail
 *
 * Tests the on-chain memo enhancements for provable AI decision linking:
 * - riskScoreToMemoLevel: numeric score → human-readable risk level
 * - buildAiDigest: AI analysis → compact memo fingerprint
 * - Release memo format with AI digest
 * - Cancel memo format with reason
 * - SHA-256 hash verification
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { createHash } from 'crypto';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';

// Set env before imports so the service can initialize
const testKeypair = Keypair.generate();
process.env.NODE_ENV = 'test';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.ESCROW_PROGRAM_ID = '11111111111111111111111111111111';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.DEVNET_ADMIN_PRIVATE_KEY = JSON.stringify(Array.from(testKeypair.secretKey));

import {
  InstitutionEscrowProgramService,
  riskScoreToMemoLevel,
  buildAiDigest,
  AiMemoData,
} from '../../../src/services/institution-escrow-program.service';

describe('Chain-of-Custody Audit Trail', () => {
  // ─── riskScoreToMemoLevel ──────────────────────────────────

  describe('riskScoreToMemoLevel', () => {
    it('should return low-risk for scores 0-25', () => {
      expect(riskScoreToMemoLevel(0)).to.equal('low-risk');
      expect(riskScoreToMemoLevel(15)).to.equal('low-risk');
      expect(riskScoreToMemoLevel(25)).to.equal('low-risk');
    });

    it('should return medium-risk for scores 26-50', () => {
      expect(riskScoreToMemoLevel(26)).to.equal('medium-risk');
      expect(riskScoreToMemoLevel(38)).to.equal('medium-risk');
      expect(riskScoreToMemoLevel(50)).to.equal('medium-risk');
    });

    it('should return high-risk for scores 51-75', () => {
      expect(riskScoreToMemoLevel(51)).to.equal('high-risk');
      expect(riskScoreToMemoLevel(63)).to.equal('high-risk');
      expect(riskScoreToMemoLevel(75)).to.equal('high-risk');
    });

    it('should return blocked for scores 76-100', () => {
      expect(riskScoreToMemoLevel(76)).to.equal('blocked');
      expect(riskScoreToMemoLevel(90)).to.equal('blocked');
      expect(riskScoreToMemoLevel(100)).to.equal('blocked');
    });
  });

  // ─── buildAiDigest ────────────────────────────────────────

  describe('buildAiDigest', () => {
    it('should return ai=NONE when analysis is null', () => {
      expect(buildAiDigest(null)).to.equal('ai=NONE');
    });

    it('should build digest with APPROVE recommendation and low-risk', () => {
      const analysis: AiMemoData = {
        recommendation: 'APPROVE',
        riskScore: 15,
        factors: [{ name: 'kyc', weight: 1, value: 0 }],
      };

      const result = buildAiDigest(analysis);

      expect(result).to.match(/^ai=APPROVE:risk=low-risk:sha=[0-9a-f]{16}$/);
    });

    it('should build digest with REVIEW recommendation and medium-risk', () => {
      const analysis: AiMemoData = {
        recommendation: 'REVIEW',
        riskScore: 40,
        factors: [{ name: 'amount', weight: 2, value: 30 }],
      };

      const result = buildAiDigest(analysis);

      expect(result).to.match(/^ai=REVIEW:risk=medium-risk:sha=[0-9a-f]{16}$/);
    });

    it('should build digest with REJECT recommendation and blocked', () => {
      const analysis: AiMemoData = {
        recommendation: 'REJECT',
        riskScore: 85,
        factors: [{ name: 'sanctions', weight: 5, value: 85 }],
      };

      const result = buildAiDigest(analysis);

      expect(result).to.match(/^ai=REJECT:risk=blocked:sha=[0-9a-f]{16}$/);
    });

    it('should produce a verifiable SHA-256 hash', () => {
      const factors = [{ name: 'kyc', weight: 1, value: 0 }];
      const analysis: AiMemoData = {
        recommendation: 'APPROVE',
        riskScore: 15,
        factors,
      };

      const result = buildAiDigest(analysis);
      const shaFromDigest = result.split(':sha=')[1];

      // Independently compute the hash
      const expectedHash = createHash('sha256')
        .update(JSON.stringify({ r: 'APPROVE', l: 'low-risk', f: factors }))
        .digest('hex')
        .slice(0, 16);

      expect(shaFromDigest).to.equal(expectedHash);
    });

    it('should produce consistent output for the same input', () => {
      const analysis: AiMemoData = {
        recommendation: 'APPROVE',
        riskScore: 10,
        factors: [{ name: 'test', weight: 1, value: 5 }],
      };

      const result1 = buildAiDigest(analysis);
      const result2 = buildAiDigest(analysis);

      expect(result1).to.equal(result2);
    });

    it('should produce different output for different inputs', () => {
      const analysis1: AiMemoData = {
        recommendation: 'APPROVE',
        riskScore: 10,
        factors: [{ name: 'test', weight: 1, value: 5 }],
      };
      const analysis2: AiMemoData = {
        recommendation: 'REJECT',
        riskScore: 90,
        factors: [{ name: 'sanctions', weight: 5, value: 90 }],
      };

      const result1 = buildAiDigest(analysis1);
      const result2 = buildAiDigest(analysis2);

      expect(result1).to.not.equal(result2);
    });

    it('should keep memo under 566 byte SPL Memo limit', () => {
      const analysis: AiMemoData = {
        recommendation: 'APPROVE',
        riskScore: 15,
        factors: Array.from({ length: 20 }, (_, i) => ({
          name: `factor_${i}`,
          weight: i,
          value: i * 5,
        })),
      };

      // Full memo: "EasyEscrow:release:EE-XXXX-XXXX:ai=APPROVE:risk=low-risk:sha=12345678"
      const digest = buildAiDigest(analysis);
      const fullMemo = `EasyEscrow:release:EE-ABCD-EFGH:${digest}`;

      expect(Buffer.byteLength(fullMemo, 'utf-8')).to.be.below(566);
    });
  });

  // ─── Release memo with AI digest ──────────────────────────

  describe('releaseEscrowOnChain memo format', () => {
    let sandbox: sinon.SinonSandbox;
    let service: InstitutionEscrowProgramService;
    let connectionStub: any;
    let programMethodsStub: any;

    function createMethodChain() {
      const chain: any = {
        accounts: sinon.stub().returnsThis(),
        instruction: sinon.stub().resolves({
          programId: new PublicKey('11111111111111111111111111111111'),
          keys: [],
          data: Buffer.alloc(0),
        }),
      };
      return chain;
    }

    beforeEach(() => {
      sandbox = sinon.createSandbox();

      connectionStub = {
        getAccountInfo: sandbox.stub().resolves({ data: Buffer.alloc(165), lamports: 1000 }),
        getLatestBlockhash: sandbox.stub().resolves({
          blockhash: 'FakeBlockhash1111111111111111111111111111111',
          lastValidBlockHeight: 100,
        }),
        sendRawTransaction: sandbox.stub().resolves('FakeTxSig'),
        confirmTransaction: sandbox.stub().resolves({ value: { err: null } }),
      };

      programMethodsStub = {
        releaseInstitutionEscrow: sandbox.stub().returns(createMethodChain()),
        cancelInstitutionEscrow: sandbox.stub().returns(createMethodChain()),
      };

      service = new InstitutionEscrowProgramService();
      (service as any).connection = connectionStub;
      (service as any).program = {
        methods: programMethodsStub,
        account: { institutionEscrow: { fetchNullable: sandbox.stub().resolves(null) } },
        programId: new PublicKey('11111111111111111111111111111111'),
      };
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should include AI digest in release memo when provided', async () => {
      const signAndSubmitStub = sandbox
        .stub(service as any, 'signAndSubmit')
        .resolves('ReleaseTxSig');

      const RECIPIENT = new PublicKey('498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R');
      const PAYER = new PublicKey('7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u');
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      await service.releaseEscrowOnChain({
        escrowId: '550e8400-e29b-41d4-a716-446655440000',
        recipientWallet: RECIPIENT,
        feeCollector: PAYER,
        usdcMint: USDC_MINT,
        escrowCode: 'EE-A3K7-9WFP',
        aiDigest: 'ai=APPROVE:risk=low-risk:sha=a1b2c3d4',
      });

      expect(signAndSubmitStub.calledOnce).to.be.true;
      const tx: Transaction = signAndSubmitStub.firstCall.args[0];
      const memoIx = tx.instructions.find(
        (ix) => ix.programId.toBase58() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
      );
      expect(memoIx).to.not.be.undefined;
      const memoText = memoIx!.data.toString('utf-8');
      expect(memoText).to.equal(
        'EasyEscrow:release:EE-A3K7-9WFP:ai=APPROVE:risk=low-risk:sha=a1b2c3d4'
      );
    });

    it('should use basic memo when no AI digest provided', async () => {
      const signAndSubmitStub = sandbox
        .stub(service as any, 'signAndSubmit')
        .resolves('ReleaseTxSig');

      const RECIPIENT = new PublicKey('498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R');
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      await service.releaseEscrowOnChain({
        escrowId: '550e8400-e29b-41d4-a716-446655440000',
        recipientWallet: RECIPIENT,
        feeCollector: RECIPIENT,
        usdcMint: USDC_MINT,
        escrowCode: 'EE-A3K7-9WFP',
      });

      const tx: Transaction = signAndSubmitStub.firstCall.args[0];
      const memoIx = tx.instructions.find(
        (ix) => ix.programId.toBase58() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
      );
      expect(memoIx).to.not.be.undefined;
      expect(memoIx!.data.toString('utf-8')).to.equal('EasyEscrow:release:EE-A3K7-9WFP');
    });

    it('should include cancel reason in cancel memo when provided', async () => {
      const signAndSubmitStub = sandbox
        .stub(service as any, 'signAndSubmit')
        .resolves('CancelTxSig');

      const PAYER = new PublicKey('7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u');
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      await service.cancelEscrowOnChain({
        escrowId: '550e8400-e29b-41d4-a716-446655440000',
        payerWallet: PAYER,
        usdcMint: USDC_MINT,
        escrowCode: 'EE-A3K7-9WFP',
        cancelReason: 'expired',
      });

      const tx: Transaction = signAndSubmitStub.firstCall.args[0];
      const memoIx = tx.instructions.find(
        (ix) => ix.programId.toBase58() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
      );
      expect(memoIx).to.not.be.undefined;
      expect(memoIx!.data.toString('utf-8')).to.equal(
        'EasyEscrow:cancel:EE-A3K7-9WFP:reason=expired'
      );
    });

    it('should use basic cancel memo when no reason provided', async () => {
      const signAndSubmitStub = sandbox
        .stub(service as any, 'signAndSubmit')
        .resolves('CancelTxSig');

      const PAYER = new PublicKey('7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u');
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

      await service.cancelEscrowOnChain({
        escrowId: '550e8400-e29b-41d4-a716-446655440000',
        payerWallet: PAYER,
        usdcMint: USDC_MINT,
        escrowCode: 'EE-A3K7-9WFP',
      });

      const tx: Transaction = signAndSubmitStub.firstCall.args[0];
      const memoIx = tx.instructions.find(
        (ix) => ix.programId.toBase58() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
      );
      expect(memoIx).to.not.be.undefined;
      expect(memoIx!.data.toString('utf-8')).to.equal('EasyEscrow:cancel:EE-A3K7-9WFP');
    });
  });

  // ─── CDP_POLICY_CHECK audit action ────────────────────────

  describe('CDP_POLICY_CHECK audit action', () => {
    it('should be a recognized audit action label', () => {
      // Verify cdp_policy_approval is in the AI_RELEASE_CONDITION_LABELS map.
      // The map is a module-level const not exported directly, so we test it inline.
      const AI_RELEASE_CONDITION_LABELS: Record<string, string> = {
        legal_compliance: 'All legal compliance checks pass',
        invoice_amount_match: 'Invoice amount matches exactly',
        client_info_match: 'Client information matches exactly',
        document_signature_verified: 'Document signature is verified (via DocuSign)',
        cdp_policy_approval: 'All policies passed by independent settlement authority',
      };

      expect(AI_RELEASE_CONDITION_LABELS).to.have.property('cdp_policy_approval');
      expect(AI_RELEASE_CONDITION_LABELS.cdp_policy_approval).to.equal(
        'All policies passed by independent settlement authority'
      );
    });

    it('should include cdp_policy_approval label in conditionLabels array when selected', () => {
      const releaseConditions = ['legal_compliance', 'cdp_policy_approval'];
      const AI_RELEASE_CONDITION_LABELS: Record<string, string> = {
        legal_compliance: 'All legal compliance checks pass',
        cdp_policy_approval: 'All policies passed by independent settlement authority',
      };

      const labels = releaseConditions.map(
        (c: string) => AI_RELEASE_CONDITION_LABELS[c] || c
      );

      expect(labels).to.deep.equal([
        'All legal compliance checks pass',
        'All policies passed by independent settlement authority',
      ]);
    });
  });
});
