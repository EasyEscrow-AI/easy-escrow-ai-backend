import { AgreementStatus, DepositType, DepositStatus } from '../../src/generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { generateTestSolanaAddress } from '../helpers/test-utils';

/**
 * Test agreement fixtures
 */
export const testAgreements = {
  pending: {
    agreementId: 'TEST-AGR-001',
    escrowPda: generateTestSolanaAddress(),
    nftMint: generateTestSolanaAddress(),
    seller: generateTestSolanaAddress(),
    buyer: generateTestSolanaAddress(),
    price: new Decimal('100.50'),
    feeBps: 250, // 2.5%
    honorRoyalties: true,
    status: AgreementStatus.PENDING,
    expiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    usdcDepositAddr: generateTestSolanaAddress(),
    nftDepositAddr: generateTestSolanaAddress(),
    initTxId: 'TEST_INIT_TX_001',
  },
  
  expired: {
    agreementId: 'TEST-AGR-002',
    escrowPda: generateTestSolanaAddress(),
    nftMint: generateTestSolanaAddress(),
    seller: generateTestSolanaAddress(),
    buyer: generateTestSolanaAddress(),
    price: new Decimal('50.00'),
    feeBps: 250,
    honorRoyalties: false,
    status: AgreementStatus.PENDING,
    expiry: new Date(Date.now() - 1000), // Already expired
    usdcDepositAddr: generateTestSolanaAddress(),
    nftDepositAddr: generateTestSolanaAddress(),
    initTxId: 'TEST_INIT_TX_002',
  },

  usdcLocked: {
    agreementId: 'TEST-AGR-003',
    escrowPda: generateTestSolanaAddress(),
    nftMint: generateTestSolanaAddress(),
    seller: generateTestSolanaAddress(),
    buyer: generateTestSolanaAddress(),
    price: new Decimal('200.00'),
    feeBps: 250,
    honorRoyalties: true,
    status: AgreementStatus.USDC_LOCKED,
    expiry: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
    usdcDepositAddr: generateTestSolanaAddress(),
    nftDepositAddr: generateTestSolanaAddress(),
    initTxId: 'TEST_INIT_TX_003',
  },

  bothLocked: {
    agreementId: 'TEST-AGR-004',
    escrowPda: generateTestSolanaAddress(),
    nftMint: generateTestSolanaAddress(),
    seller: generateTestSolanaAddress(),
    buyer: generateTestSolanaAddress(),
    price: new Decimal('150.00'),
    feeBps: 250,
    honorRoyalties: true,
    status: AgreementStatus.BOTH_LOCKED,
    expiry: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours from now
    usdcDepositAddr: generateTestSolanaAddress(),
    nftDepositAddr: generateTestSolanaAddress(),
    initTxId: 'TEST_INIT_TX_004',
  },

  settled: {
    agreementId: 'TEST-AGR-005',
    escrowPda: generateTestSolanaAddress(),
    nftMint: generateTestSolanaAddress(),
    seller: generateTestSolanaAddress(),
    buyer: generateTestSolanaAddress(),
    price: new Decimal('300.00'),
    feeBps: 250,
    honorRoyalties: true,
    status: AgreementStatus.SETTLED,
    expiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    usdcDepositAddr: generateTestSolanaAddress(),
    nftDepositAddr: generateTestSolanaAddress(),
    initTxId: 'TEST_INIT_TX_005',
    settledAt: new Date(),
    settleTxId: 'TEST_SETTLE_TX_005',
  },
};

/**
 * Test deposit fixtures
 */
export const testDeposits = {
  usdcConfirmed: {
    type: DepositType.USDC,
    depositor: testAgreements.usdcLocked.buyer,
    amount: new Decimal('200.00'),
    status: DepositStatus.CONFIRMED,
    txId: 'TEST_USDC_TX_001',
    detectedAt: new Date(),
    confirmedAt: new Date(),
  },

  nftConfirmed: {
    type: DepositType.NFT,
    depositor: testAgreements.usdcLocked.seller,
    amount: null,
    status: DepositStatus.CONFIRMED,
    txId: 'TEST_NFT_TX_001',
    detectedAt: new Date(),
    confirmedAt: new Date(),
  },

  usdcPending: {
    type: DepositType.USDC,
    depositor: testAgreements.pending.buyer,
    amount: new Decimal('100.50'),
    status: DepositStatus.PENDING,
    txId: 'TEST_USDC_TX_002',
    detectedAt: new Date(),
    confirmedAt: null,
  },
};

/**
 * Test DTO fixtures
 */
export const testCreateAgreementDTO = {
  valid: {
    nftMint: generateTestSolanaAddress(),
    price: '100.50',
    seller: generateTestSolanaAddress(),
    buyer: generateTestSolanaAddress(),
    expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    feeBps: 250,
    honorRoyalties: true,
  },

  invalidPrice: {
    nftMint: generateTestSolanaAddress(),
    price: '-10.00',
    seller: generateTestSolanaAddress(),
    buyer: generateTestSolanaAddress(),
    expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    feeBps: 250,
    honorRoyalties: true,
  },

  expiredDate: {
    nftMint: generateTestSolanaAddress(),
    price: '100.50',
    seller: generateTestSolanaAddress(),
    buyer: generateTestSolanaAddress(),
    expiry: new Date(Date.now() - 1000).toISOString(), // Past date
    feeBps: 250,
    honorRoyalties: true,
  },
};

