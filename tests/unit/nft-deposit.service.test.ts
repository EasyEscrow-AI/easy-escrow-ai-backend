/**
 * Unit Tests for NFT Deposit Service
 * 
 * Tests NFT deposit detection, validation, metadata fetching,
 * and transaction log creation.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { PublicKey, AccountInfo, Context } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { NftDepositService, resetNftDepositService } from '../../src/services/nft-deposit.service';
import * as solanaService from '../../src/services/solana.service';
import * as transactionLogService from '../../src/services/transaction-log.service';
import { DepositStatus, AgreementStatus } from '../../src/generated/prisma';
import { mockPrismaForTest, teardownPrismaMock } from '../helpers/prisma-mock';

describe('NFT Deposit Service - Unit Tests', () => {
  let nftDepositService: NftDepositService;
  let prismaStub: any;
  let solanaServiceStub: any;
  let transactionLogServiceStub: any;

  beforeEach(() => {
    // Reset service instance
    resetNftDepositService();

    // Create Prisma stub
    prismaStub = {
      deposit: {
        findFirst: sinon.stub(),
        create: sinon.stub(),
        update: sinon.stub(),
      },
      agreement: {
        findUnique: sinon.stub(),
        update: sinon.stub(),
      },
    };

    // Setup mock Prisma client
    mockPrismaForTest(prismaStub);

    // Stub Solana service
    solanaServiceStub = {
      getAccountInfo: sinon.stub(),
      getRecentTransactionSignature: sinon.stub(),
    };
    sinon.stub(solanaService, 'getSolanaService').returns(solanaServiceStub as any);

    // Stub Transaction Log service
    transactionLogServiceStub = {
      captureTransaction: sinon.stub(),
    };
    sinon.stub(transactionLogService, 'getTransactionLogService').returns(transactionLogServiceStub as any);

    // Create service instance (will use mocked Prisma)
    nftDepositService = new NftDepositService();

    // Replace internal solana service with stub
    (nftDepositService as any).solanaService = solanaServiceStub;
  });

  afterEach(() => {
    sinon.restore();
    teardownPrismaMock();
  });

  describe('handleNftAccountChange', () => {
    const agreementId = 'test-agreement-id';
    const publicKey = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    const nftMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'; // Valid Solana NFT mint address
    const context: Context = { slot: 100 };

    function createMockAccountInfo(amount: bigint = BigInt(1)): AccountInfo<Buffer> {
      const accountData = Buffer.alloc(AccountLayout.span);
      const mockData = {
        mint: new PublicKey(nftMint),
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // Valid base58 address
        amount,
        state: 1,
        delegateOption: 0 as 0 | 1,
        delegate: new PublicKey('11111111111111111111111111111111'),
        isNativeOption: 0 as 0 | 1,
        isNative: BigInt(0),
        delegatedAmount: BigInt(0),
        closeAuthorityOption: 0 as 0 | 1,
        closeAuthority: new PublicKey('11111111111111111111111111111111'),
      };

      AccountLayout.encode(mockData, accountData);

      return {
        data: accountData,
        owner: TOKEN_PROGRAM_ID,
        lamports: 1000000,
        executable: false,
        rentEpoch: 0,
      };
    }

    it('should successfully detect new NFT deposit', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        nftMint,
        seller: 'SellerAddress',
        nftDepositAddr: publicKey,
        status: 'PENDING',
      };

      const mockDeposit = {
        id: 'deposit-123',
        agreementId,
        type: 'NFT',
        status: 'CONFIRMED',
      };

      prismaStub.deposit.findFirst.resolves(null); // No existing deposit
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves(mockDeposit);
      prismaStub.deposit.findFirst.onSecondCall().resolves(null); // For USDC check
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-signature-123');

      const accountInfo = createMockAccountInfo(BigInt(1));
      const result = await nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(result.depositId).to.equal('deposit-123');
      expect(result.mint).to.equal(nftMint);
      expect(result.status).to.equal('CONFIRMED');

      expect(prismaStub.deposit.create.calledOnce).to.be.true;
      expect(transactionLogServiceStub.captureTransaction.calledOnce).to.be.true;
    });

    it('should reject deposit with invalid account owner', async () => {
      const accountInfo = createMockAccountInfo();
      accountInfo.owner = new PublicKey('11111111111111111111111111111111'); // System program, not Token program

      const result = await nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('Invalid account owner');
    });

    it('should reject NFT with wrong mint address', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        nftMint: 'So11111111111111111111111111111111111111112', // Valid but different mint (wrapped SOL)
        seller: 'SellerAddress',
        nftDepositAddr: publicKey,
        status: 'PENDING',
      };

      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const accountInfo = createMockAccountInfo();
      const result = await nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('mint does not match');
    });

    it('should handle pending deposit (amount = 0)', async () => {
      const accountInfo = createMockAccountInfo(BigInt(0));

      const result = await nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('not yet deposited');
    });

    it('should update existing pending deposit to confirmed', async () => {
      const existingDeposit = {
        id: 'existing-deposit-123',
        status: 'PENDING',
      };

      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
      };

      prismaStub.deposit.findFirst.resolves(existingDeposit);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.update.resolves({ ...existingDeposit, status: 'CONFIRMED' });
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-signature-update');

      const accountInfo = createMockAccountInfo(BigInt(1));
      const result = await nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(result.status).to.equal('CONFIRMED');
      expect(prismaStub.deposit.update.calledOnce).to.be.true;
      expect(transactionLogServiceStub.captureTransaction.calledOnce).to.be.true;
    });

    it('should return existing confirmed deposit without changes', async () => {
      const existingDeposit = {
        id: 'existing-deposit-123',
        status: 'CONFIRMED',
      };

      prismaStub.deposit.findFirst.resolves(existingDeposit);

      const accountInfo = createMockAccountInfo(BigInt(1));
      const result = await nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(result.depositId).to.equal('existing-deposit-123');
      expect(result.status).to.equal('CONFIRMED');
      expect(prismaStub.deposit.create.called).to.be.false;
      expect(prismaStub.deposit.update.called).to.be.false;
    });

    it('should handle agreement not found', async () => {
      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(null);

      const accountInfo = createMockAccountInfo();
      const result = await nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include('Agreement not found');
    });

    it('should continue if transaction log creation fails', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        nftMint,
        seller: 'SellerAddress',
        nftDepositAddr: publicKey,
        status: 'PENDING',
      };

      const mockDeposit = {
        id: 'deposit-123',
        agreementId,
        type: 'NFT',
        status: 'CONFIRMED',
      };

      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves(mockDeposit);
      prismaStub.deposit.findFirst.onSecondCall().resolves(null);
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-signature');
      transactionLogServiceStub.captureTransaction.rejects(new Error('DB error'));

      const accountInfo = createMockAccountInfo();
      const result = await nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      // Should still succeed despite transaction log error
      expect(result.success).to.be.true;
      expect(result.depositId).to.equal('deposit-123');
    });

    it('should handle transaction signature not found gracefully', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        nftMint,
        seller: 'SellerAddress',
        nftDepositAddr: publicKey,
        status: 'PENDING',
      };

      const mockDeposit = {
        id: 'deposit-123',
        agreementId,
        type: 'NFT',
        status: 'CONFIRMED',
      };

      prismaStub.deposit.findFirst.resolves(null);
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves(mockDeposit);
      prismaStub.deposit.findFirst.onSecondCall().resolves(null);
      solanaServiceStub.getRecentTransactionSignature.resolves(null); // No signature found

      const accountInfo = createMockAccountInfo();
      const result = await nftDepositService.handleNftAccountChange(
        publicKey,
        accountInfo,
        context,
        agreementId
      );

      expect(result.success).to.be.true;
      expect(transactionLogServiceStub.captureTransaction.called).to.be.false;
    });
  });

  describe('verifyNftDeposit', () => {
    const agreementId = 'test-agreement-id';

    it('should verify deposited NFT from database', async () => {
      const mockAgreement = {
        id: agreementId,
        nftMint: 'NFTMint123',
        nftDepositAddr: 'DepositAddress',
        deposits: [
          {
            type: 'NFT',
            status: 'CONFIRMED',
            nftMetadata: { name: 'Test NFT' },
          },
        ],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);

      const result = await nftDepositService.verifyNftDeposit(agreementId);

      expect(result.deposited).to.be.true;
      expect(result.mint).to.equal('NFTMint123');
      expect(result.metadata).to.deep.equal({ name: 'Test NFT' });
    });

    it('should return false for agreement without deposits', async () => {
      const mockAgreement = {
        id: agreementId,
        nftMint: 'NFTMint123',
        nftDepositAddr: 'DepositAddress',
        deposits: [],
      };

      prismaStub.agreement.findUnique.resolves(mockAgreement);
      solanaServiceStub.getAccountInfo.resolves(null);

      const result = await nftDepositService.verifyNftDeposit(agreementId);

      expect(result.deposited).to.be.false;
    });

    it('should return false for non-existent agreement', async () => {
      prismaStub.agreement.findUnique.resolves(null);

      const result = await nftDepositService.verifyNftDeposit(agreementId);

      expect(result.deposited).to.be.false;
    });
  });

  describe('validateNftMint', () => {
    const nftMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'; // Valid Solana address

    it('should validate valid NFT mint with metadata', async () => {
      const mockAccountInfo = {
        owner: TOKEN_PROGRAM_ID, // This is already a PublicKey with toBase58() method
        data: Buffer.alloc(82), // Mint account size
        lamports: 1000000,
        executable: false,
        rentEpoch: 0,
      };

      const mockMetadata = {
        mint: nftMint,
        onChain: {
          name: 'Test NFT',
          symbol: 'TEST',
          uri: 'https://example.com/metadata.json',
          sellerFeeBasisPoints: 500,
          creators: [],
        },
      };

      solanaServiceStub.getAccountInfo.resolves(mockAccountInfo);

      // Replace the private method directly on the instance
      (nftDepositService as any).fetchNftMetadata = sinon.stub().resolves(mockMetadata);

      const result = await nftDepositService.validateNftMint(nftMint);

      expect(result.valid).to.be.true;
      expect(result.isNft).to.be.true;
      expect(result.metadata).to.deep.equal(mockMetadata);
    });

    it('should return invalid for non-existent mint', async () => {
      solanaServiceStub.getAccountInfo.resolves(null);

      const result = await nftDepositService.validateNftMint(nftMint);

      expect(result.valid).to.be.false;
      expect(result.isNft).to.be.false;
    });

    it('should return invalid for non-token-program account', async () => {
      const mockAccountInfo = {
        owner: new PublicKey('11111111111111111111111111111111'), // System program, not Token program
        data: Buffer.alloc(82),
        lamports: 1000000,
        executable: false,
        rentEpoch: 0,
      };

      solanaServiceStub.getAccountInfo.resolves(mockAccountInfo);

      const result = await nftDepositService.validateNftMint(nftMint);

      expect(result.valid).to.be.false;
      expect(result.isNft).to.be.false;
    });

    it('should handle errors gracefully', async () => {
      solanaServiceStub.getAccountInfo.rejects(new Error('RPC error'));

      const result = await nftDepositService.validateNftMint(nftMint);

      expect(result.valid).to.be.false;
      expect(result.isNft).to.be.false;
    });
  });

  describe('Agreement Status Updates', () => {
    const agreementId = 'test-agreement-id';
    const nftMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'; // Valid Solana NFT mint address

    it('should update status to NFT_LOCKED when only NFT is deposited', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        nftMint,  // Use the valid nftMint from describe block
        seller: 'SellerAddress',
        nftDepositAddr: 'DepositAddress',
        status: 'PENDING',
      };

      prismaStub.deposit.findFirst.onFirstCall().resolves(null); // First call: check existing NFT deposit
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves({ id: 'deposit-123' });
      prismaStub.deposit.findFirst.onSecondCall().resolves(null); // Second call: check USDC deposit
      prismaStub.agreement.update.resolves({ ...mockAgreement, status: 'NFT_LOCKED' });
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-sig');

      const accountInfo = {
        data: Buffer.alloc(AccountLayout.span),
        owner: TOKEN_PROGRAM_ID,
        lamports: 1000000,
        executable: false,
        rentEpoch: 0,
      };

      // Encode NFT data
      const mockData = {
        mint: new PublicKey(nftMint),
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // Valid base58 address
        amount: BigInt(1),
        state: 1,
        delegateOption: 0 as 0 | 1,
        delegate: new PublicKey('11111111111111111111111111111111'),
        isNativeOption: 0 as 0 | 1,
        isNative: BigInt(0),
        delegatedAmount: BigInt(0),
        closeAuthorityOption: 0 as 0 | 1,
        closeAuthority: new PublicKey('11111111111111111111111111111111'),
      };
      AccountLayout.encode(mockData, accountInfo.data);

      await nftDepositService.handleNftAccountChange(
        'DepositAddress',
        accountInfo,
        { slot: 100 },
        agreementId
      );

      expect(prismaStub.agreement.update.calledOnce).to.be.true;
      const updateCall = prismaStub.agreement.update.getCall(0);
      expect(updateCall.args[0].data.status).to.equal('NFT_LOCKED');
    });

    it('should update status to BOTH_LOCKED when both assets are deposited', async () => {
      const mockAgreement = {
        id: agreementId,
        agreementId: 'AGR-TEST-001',
        nftMint,  // Use the valid nftMint from describe block
        seller: 'SellerAddress',
        nftDepositAddr: 'DepositAddress',
        status: 'USDC_LOCKED',
      };

      const mockUsdcDeposit = {
        id: 'usdc-deposit-123',
        type: 'USDC',
        status: 'CONFIRMED',
      };

      prismaStub.deposit.findFirst.onFirstCall().resolves(null); // Check existing NFT deposit
      prismaStub.agreement.findUnique.resolves(mockAgreement);
      prismaStub.deposit.create.resolves({ id: 'deposit-123' });
      prismaStub.deposit.findFirst.onSecondCall().resolves(mockUsdcDeposit); // USDC is deposited
      prismaStub.agreement.update.resolves({ ...mockAgreement, status: 'BOTH_LOCKED' });
      solanaServiceStub.getRecentTransactionSignature.resolves('tx-sig');

      const accountInfo = {
        data: Buffer.alloc(AccountLayout.span),
        owner: TOKEN_PROGRAM_ID,
        lamports: 1000000,
        executable: false,
        rentEpoch: 0,
      };

      const mockData = {
        mint: new PublicKey(nftMint),
        owner: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // Valid base58 address
        amount: BigInt(1),
        state: 1,
        delegateOption: 0 as 0 | 1,
        delegate: new PublicKey('11111111111111111111111111111111'),
        isNativeOption: 0 as 0 | 1,
        isNative: BigInt(0),
        delegatedAmount: BigInt(0),
        closeAuthorityOption: 0 as 0 | 1,
        closeAuthority: new PublicKey('11111111111111111111111111111111'),
      };
      AccountLayout.encode(mockData, accountInfo.data);

      await nftDepositService.handleNftAccountChange(
        'DepositAddress',
        accountInfo,
        { slot: 100 },
        agreementId
      );

      expect(prismaStub.agreement.update.calledOnce).to.be.true;
      const updateCall = prismaStub.agreement.update.getCall(0);
      expect(updateCall.args[0].data.status).to.equal('BOTH_LOCKED');
    });
  });
});

