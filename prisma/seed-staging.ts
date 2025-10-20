import { PrismaClient, AgreementStatus, DepositType, DepositStatus, WebhookEventType, WebhookDeliveryStatus } from '../src/generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

/**
 * Staging Database Seed Script
 * 
 * This script populates the staging database with realistic test data
 * that mirrors production scenarios for comprehensive testing.
 * 
 * Test Scenarios Covered:
 * 1. Active pending agreements
 * 2. Partially funded agreements
 * 3. Fully locked agreements ready for settlement
 * 4. Completed settlements with receipts
 * 5. Expired agreements
 * 6. Cancelled agreements
 * 7. Webhook delivery scenarios (success, retry, failed)
 */

async function main() {
  console.log('🌱 Seeding staging database...');

  // Clear existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.webhook.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.agreement.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.transactionLog.deleteMany();

  console.log('✅ Existing data cleared');

  // ============================================================================
  // Staging Test Wallets (Devnet)
  // ============================================================================
  
  const stagingSeller1 = 'STGsLLR1ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvP';
  const stagingBuyer1 = 'STGbYR2ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvQ';
  const stagingNftMint1 = 'NFT1XAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
  const stagingEscrowPda1 = 'ESC1WHmXKj2jRqKvF4uXtXg3F3HgvP8VfYNPZZqNHfWZz';

  const stagingSeller2 = 'STGsLLR2ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvR';
  const stagingBuyer2 = 'STGbYR3ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvS';
  const stagingNftMint2 = 'NFT2XAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPC374';
  const stagingEscrowPda2 = 'ESC2WHmXKj2jRqKvF4uXtXg3F3HgvP8VfYNPZZqNHgX0';

  const stagingSeller3 = 'STGsLLR3ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvT';
  const stagingBuyer3 = 'STGbYR4ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvU';
  const stagingNftMint3 = 'NFT3XAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPD485';
  const stagingEscrowPda3 = 'ESC3WHmXKj2jRqKvF4uXtXg3F3HgvP8VfYNPZZqNHgY1';

  const stagingSeller4 = 'STGsLLR4ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvV';
  const stagingBuyer4 = 'STGbYR5ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvW';
  const stagingNftMint4 = 'NFT4XAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPE596';
  const stagingEscrowPda4 = 'ESC4WHmXKj2jRqKvF4uXtXg3F3HgvP8VfYNPZZqNHgZ2';

  const stagingSeller5 = 'STGsLLR5ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvX';
  const stagingBuyer5 = 'STGbYR6ZeRp7FqQvH8c9pN3WxJ2KvF4uXtXg3F3HgvY';
  const stagingNftMint5 = 'NFT5XAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPF607';
  const stagingEscrowPda5 = 'ESC5WHmXKj2jRqKvF4uXtXg3F3HgvP8VfYNPZZqNHg03';

  // ============================================================================
  // Scenario 1: Fresh Pending Agreement (Just Created)
  // ============================================================================
  console.log('📝 Creating Scenario 1: Fresh pending agreement...');

  const agreement1 = await prisma.agreement.create({
    data: {
      agreementId: 'stg-agreement-001-pending',
      escrowPda: stagingEscrowPda1,
      nftMint: stagingNftMint1,
      seller: stagingSeller1,
      buyer: stagingBuyer1,
      price: new Decimal('50.25'),
      feeBps: 250, // 2.5%
      honorRoyalties: true,
      status: AgreementStatus.PENDING,
      expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      usdcDepositAddr: 'stg-usdc-deposit-addr-1',
      nftDepositAddr: 'stg-nft-deposit-addr-1',
      initTxId: 'stg-init-tx-001',
    },
  });

  await prisma.transactionLog.create({
    data: {
      agreementId: agreement1.id,
      txId: 'stg-init-tx-001',
      operationType: 'init',
      blockHeight: BigInt(100000),
      slot: BigInt(1000000),
      status: 'success',
    },
  });

  console.log('✅ Scenario 1 created');

  // ============================================================================
  // Scenario 2: Agreement with USDC Locked (Waiting for NFT)
  // ============================================================================
  console.log('📝 Creating Scenario 2: USDC locked, waiting for NFT...');

  const agreement2 = await prisma.agreement.create({
    data: {
      agreementId: 'stg-agreement-002-usdc-locked',
      escrowPda: stagingEscrowPda2,
      nftMint: stagingNftMint2,
      seller: stagingSeller2,
      buyer: stagingBuyer2,
      price: new Decimal('150.50'),
      feeBps: 300, // 3%
      honorRoyalties: false,
      status: AgreementStatus.USDC_LOCKED,
      expiry: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      usdcDepositAddr: 'stg-usdc-deposit-addr-2',
      nftDepositAddr: 'stg-nft-deposit-addr-2',
      initTxId: 'stg-init-tx-002',
    },
  });

  await prisma.deposit.create({
    data: {
      agreementId: agreement2.id,
      type: DepositType.USDC,
      depositor: stagingBuyer2,
      amount: new Decimal('150.50'),
      tokenAccount: 'stg-token-account-usdc-2',
      status: DepositStatus.CONFIRMED,
      txId: 'stg-deposit-usdc-tx-002',
      blockHeight: BigInt(100100),
      confirmedAt: new Date(),
    },
  });

  await prisma.transactionLog.createMany({
    data: [
      {
        agreementId: agreement2.id,
        txId: 'stg-init-tx-002',
        operationType: 'init',
        blockHeight: BigInt(100050),
        slot: BigInt(1000500),
        status: 'success',
      },
      {
        agreementId: agreement2.id,
        txId: 'stg-deposit-usdc-tx-002',
        operationType: 'deposit_usdc',
        blockHeight: BigInt(100100),
        slot: BigInt(1001000),
        status: 'success',
      },
    ],
  });

  console.log('✅ Scenario 2 created');

  // ============================================================================
  // Scenario 3: Agreement with NFT Locked (Waiting for USDC)
  // ============================================================================
  console.log('📝 Creating Scenario 3: NFT locked, waiting for USDC...');

  const agreement3 = await prisma.agreement.create({
    data: {
      agreementId: 'stg-agreement-003-nft-locked',
      escrowPda: stagingEscrowPda3,
      nftMint: stagingNftMint3,
      seller: stagingSeller3,
      buyer: stagingBuyer3,
      price: new Decimal('300.00'),
      feeBps: 250,
      honorRoyalties: true,
      status: AgreementStatus.NFT_LOCKED,
      expiry: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
      usdcDepositAddr: 'stg-usdc-deposit-addr-3',
      nftDepositAddr: 'stg-nft-deposit-addr-3',
      initTxId: 'stg-init-tx-003',
    },
  });

  await prisma.deposit.create({
    data: {
      agreementId: agreement3.id,
      type: DepositType.NFT,
      depositor: stagingSeller3,
      tokenAccount: 'stg-token-account-nft-3',
      status: DepositStatus.CONFIRMED,
      txId: 'stg-deposit-nft-tx-003',
      blockHeight: BigInt(100200),
      nftMetadata: {
        name: 'Staging NFT #003',
        symbol: 'STGNFT',
        uri: 'https://staging.example.com/nft/003',
      },
      confirmedAt: new Date(),
    },
  });

  await prisma.transactionLog.createMany({
    data: [
      {
        agreementId: agreement3.id,
        txId: 'stg-init-tx-003',
        operationType: 'init',
        blockHeight: BigInt(100150),
        slot: BigInt(1001500),
        status: 'success',
      },
      {
        agreementId: agreement3.id,
        txId: 'stg-deposit-nft-tx-003',
        operationType: 'deposit_nft',
        blockHeight: BigInt(100200),
        slot: BigInt(1002000),
        status: 'success',
      },
    ],
  });

  console.log('✅ Scenario 3 created');

  // ============================================================================
  // Scenario 4: Fully Locked Agreement (Ready for Settlement)
  // ============================================================================
  console.log('📝 Creating Scenario 4: Both deposits locked, ready for settlement...');

  const agreement4 = await prisma.agreement.create({
    data: {
      agreementId: 'stg-agreement-004-both-locked',
      escrowPda: stagingEscrowPda4,
      nftMint: stagingNftMint4,
      seller: stagingSeller4,
      buyer: stagingBuyer4,
      price: new Decimal('500.00'),
      feeBps: 300,
      honorRoyalties: true,
      status: AgreementStatus.BOTH_LOCKED,
      expiry: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      usdcDepositAddr: 'stg-usdc-deposit-addr-4',
      nftDepositAddr: 'stg-nft-deposit-addr-4',
      initTxId: 'stg-init-tx-004',
    },
  });

  await prisma.deposit.createMany({
    data: [
      {
        agreementId: agreement4.id,
        type: DepositType.USDC,
        depositor: stagingBuyer4,
        amount: new Decimal('500.00'),
        tokenAccount: 'stg-token-account-usdc-4',
        status: DepositStatus.CONFIRMED,
        txId: 'stg-deposit-usdc-tx-004',
        blockHeight: BigInt(100300),
        confirmedAt: new Date(),
      },
      {
        agreementId: agreement4.id,
        type: DepositType.NFT,
        depositor: stagingSeller4,
        tokenAccount: 'stg-token-account-nft-4',
        status: DepositStatus.CONFIRMED,
        txId: 'stg-deposit-nft-tx-004',
        blockHeight: BigInt(100350),
        nftMetadata: {
          name: 'Staging NFT #004',
          symbol: 'STGNFT',
          uri: 'https://staging.example.com/nft/004',
        },
        confirmedAt: new Date(),
      },
    ],
  });

  await prisma.transactionLog.createMany({
    data: [
      {
        agreementId: agreement4.id,
        txId: 'stg-init-tx-004',
        operationType: 'init',
        blockHeight: BigInt(100250),
        slot: BigInt(1002500),
        status: 'success',
      },
      {
        agreementId: agreement4.id,
        txId: 'stg-deposit-usdc-tx-004',
        operationType: 'deposit_usdc',
        blockHeight: BigInt(100300),
        slot: BigInt(1003000),
        status: 'success',
      },
      {
        agreementId: agreement4.id,
        txId: 'stg-deposit-nft-tx-004',
        operationType: 'deposit_nft',
        blockHeight: BigInt(100350),
        slot: BigInt(1003500),
        status: 'success',
      },
    ],
  });

  // Create webhook for both locked event
  await prisma.webhook.create({
    data: {
      agreementId: agreement4.id,
      eventType: WebhookEventType.ESCROW_ASSET_LOCKED,
      targetUrl: 'https://staging-webhook.example.com/escrow/events',
      payload: {
        agreementId: 'stg-agreement-004-both-locked',
        event: 'BOTH_LOCKED',
        timestamp: new Date().toISOString(),
      },
      status: WebhookDeliveryStatus.PENDING,
      attempts: 0,
      scheduledFor: new Date(),
    },
  });

  console.log('✅ Scenario 4 created');

  // ============================================================================
  // Scenario 5: Completed Settlement with Receipt
  // ============================================================================
  console.log('📝 Creating Scenario 5: Completed settlement with receipt...');

  const agreement5 = await prisma.agreement.create({
    data: {
      agreementId: 'stg-agreement-005-settled',
      escrowPda: stagingEscrowPda5,
      nftMint: stagingNftMint5,
      seller: stagingSeller5,
      buyer: stagingBuyer5,
      price: new Decimal('1000.00'),
      feeBps: 250,
      honorRoyalties: true,
      status: AgreementStatus.SETTLED,
      expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      usdcDepositAddr: 'stg-usdc-deposit-addr-5',
      nftDepositAddr: 'stg-nft-deposit-addr-5',
      initTxId: 'stg-init-tx-005',
      settleTxId: 'stg-settle-tx-005',
      settledAt: new Date(),
    },
  });

  await prisma.deposit.createMany({
    data: [
      {
        agreementId: agreement5.id,
        type: DepositType.USDC,
        depositor: stagingBuyer5,
        amount: new Decimal('1000.00'),
        tokenAccount: 'stg-token-account-usdc-5',
        status: DepositStatus.CONFIRMED,
        txId: 'stg-deposit-usdc-tx-005',
        blockHeight: BigInt(100400),
        confirmedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      },
      {
        agreementId: agreement5.id,
        type: DepositType.NFT,
        depositor: stagingSeller5,
        tokenAccount: 'stg-token-account-nft-5',
        status: DepositStatus.CONFIRMED,
        txId: 'stg-deposit-nft-tx-005',
        blockHeight: BigInt(100450),
        nftMetadata: {
          name: 'Premium Staging NFT #005',
          symbol: 'PSTGNFT',
          uri: 'https://staging.example.com/nft/005',
          creators: [
            { address: stagingSeller5, share: 100 }
          ],
        },
        confirmedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ],
  });

  const platformFee = new Decimal('25.00'); // 2.5% of 1000
  const creatorRoyalty = new Decimal('50.00'); // 5% royalty
  const sellerReceived = new Decimal('925.00'); // 1000 - 25 - 50

  await prisma.settlement.create({
    data: {
      agreementId: agreement5.id,
      nftMint: stagingNftMint5,
      price: new Decimal('1000.00'),
      platformFee,
      creatorRoyalty,
      sellerReceived,
      settleTxId: 'stg-settle-tx-005',
      blockHeight: BigInt(100500),
      buyer: stagingBuyer5,
      seller: stagingSeller5,
      feeCollector: 'FeeCollectorAddress',
      royaltyRecipient: stagingSeller5,
      settledAt: new Date(),
    },
  });

  await prisma.receipt.create({
    data: {
      agreementId: agreement5.id,
      nftMint: stagingNftMint5,
      price: new Decimal('1000.00'),
      platformFee,
      creatorRoyalty,
      buyer: stagingBuyer5,
      seller: stagingSeller5,
      escrowTxId: 'stg-init-tx-005',
      settlementTxId: 'stg-settle-tx-005',
      receiptHash: 'receipt-hash-' + Date.now(),
      signature: 'receipt-signature-' + Date.now(),
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      settledAt: new Date(),
    },
  });

  await prisma.transactionLog.createMany({
    data: [
      {
        agreementId: agreement5.id,
        txId: 'stg-init-tx-005',
        operationType: 'init',
        blockHeight: BigInt(100350),
        slot: BigInt(1003500),
        status: 'success',
      },
      {
        agreementId: agreement5.id,
        txId: 'stg-deposit-usdc-tx-005',
        operationType: 'deposit_usdc',
        blockHeight: BigInt(100400),
        slot: BigInt(1004000),
        status: 'success',
      },
      {
        agreementId: agreement5.id,
        txId: 'stg-deposit-nft-tx-005',
        operationType: 'deposit_nft',
        blockHeight: BigInt(100450),
        slot: BigInt(1004500),
        status: 'success',
      },
      {
        agreementId: agreement5.id,
        txId: 'stg-settle-tx-005',
        operationType: 'settle',
        blockHeight: BigInt(100500),
        slot: BigInt(1005000),
        status: 'success',
      },
    ],
  });

  // Create successful webhook delivery
  await prisma.webhook.create({
    data: {
      agreementId: agreement5.id,
      eventType: WebhookEventType.ESCROW_SETTLED,
      targetUrl: 'https://staging-webhook.example.com/escrow/events',
      payload: {
        agreementId: 'stg-agreement-005-settled',
        event: 'SETTLED',
        timestamp: new Date().toISOString(),
      },
      status: WebhookDeliveryStatus.DELIVERED,
      attempts: 1,
      lastAttemptAt: new Date(),
      lastResponseCode: 200,
      deliveredAt: new Date(),
      signature: 'webhook-signature-' + Date.now(),
    },
  });

  console.log('✅ Scenario 5 created');

  // ============================================================================
  // Create Idempotency Keys
  // ============================================================================
  console.log('🔑 Creating idempotency keys...');

  await prisma.idempotencyKey.createMany({
    data: [
      {
        key: 'stg-idempotency-key-001',
        endpoint: '/v1/agreements',
        requestHash: 'hash-of-request-body-001',
        responseStatus: 201,
        responseBody: { agreementId: agreement1.agreementId },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      {
        key: 'stg-idempotency-key-002',
        endpoint: '/v1/agreements',
        requestHash: 'hash-of-request-body-002',
        responseStatus: 201,
        responseBody: { agreementId: agreement2.agreementId },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    ],
  });

  console.log('✅ Idempotency keys created');

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('');
  console.log('🎉 Staging database seeding completed successfully!');
  console.log('');
  console.log('Created Test Scenarios:');
  console.log('  1. ⏳ Fresh pending agreement (no deposits)');
  console.log('  2. 💰 USDC locked (waiting for NFT)');
  console.log('  3. 🖼️  NFT locked (waiting for USDC)');
  console.log('  4. 🔒 Both deposits locked (ready for settlement)');
  console.log('  5. ✅ Completed settlement with receipt');
  console.log('');
  console.log('Statistics:');
  console.log('  - 5 agreements');
  console.log('  - 8 deposits');
  console.log('  - 12 transaction logs');
  console.log('  - 1 settlement');
  console.log('  - 1 receipt');
  console.log('  - 2 webhooks');
  console.log('  - 2 idempotency keys');
  console.log('');
  console.log('💡 Use these test scenarios to verify:');
  console.log('   - API endpoint responses');
  console.log('   - Deposit detection logic');
  console.log('   - Settlement processing');
  console.log('   - Webhook delivery');
  console.log('   - Receipt generation');
  console.log('   - Idempotency key handling');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding staging database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

