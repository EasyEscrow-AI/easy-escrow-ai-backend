import { PrismaClient, AgreementStatus, DepositType, DepositStatus } from '../src/generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.webhook.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.agreement.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.transactionLog.deleteMany();

  // Sample Solana addresses
  const seller1 = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const buyer1 = '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh';
  const nftMint1 = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
  const escrowPda1 = '5ZrWHmXKj2jRqKvF4uXtXg3F3HgvP8VfYNPZZqNHfWZz';

  const seller2 = '8kKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBtV';
  const buyer2 = '4OZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcrnKi';
  const nftMint2 = 'EfzXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPC374';
  const escrowPda2 = '6AsWHmXKj2jRqKvF4uXtXg3F3HgvP8VfYNPZZqNHgX0';

  // Create test agreements
  console.log('📝 Creating test agreements...');

  const agreement1 = await prisma.agreement.create({
    data: {
      agreementId: 'test-agreement-001',
      escrowPda: escrowPda1,
      nftMint: nftMint1,
      seller: seller1,
      buyer: buyer1,
      price: new Decimal('100.5'),
      feeBps: 250, // 2.5%
      honorRoyalties: true,
      status: AgreementStatus.PENDING,
      expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      usdcDepositAddr: 'deposit-usdc-addr-1',
      nftDepositAddr: 'deposit-nft-addr-1',
      initTxId: 'init-tx-signature-1',
    },
  });

  const agreement2 = await prisma.agreement.create({
    data: {
      agreementId: 'test-agreement-002',
      escrowPda: escrowPda2,
      nftMint: nftMint2,
      seller: seller2,
      buyer: buyer2,
      price: new Decimal('250.75'),
      feeBps: 300, // 3%
      honorRoyalties: false,
      status: AgreementStatus.BOTH_LOCKED,
      expiry: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      usdcDepositAddr: 'deposit-usdc-addr-2',
      nftDepositAddr: 'deposit-nft-addr-2',
      initTxId: 'init-tx-signature-2',
    },
  });

  console.log('✅ Created agreements:', agreement1.id, agreement2.id);

  // Create test deposits
  console.log('💰 Creating test deposits...');

  await prisma.deposit.create({
    data: {
      agreementId: agreement1.id,
      type: DepositType.USDC,
      depositor: buyer1,
      amount: new Decimal('100.5'),
      tokenAccount: 'token-account-usdc-1',
      status: DepositStatus.PENDING,
      txId: 'deposit-usdc-tx-1',
      blockHeight: BigInt(12345678),
    },
  });

  await prisma.deposit.create({
    data: {
      agreementId: agreement2.id,
      type: DepositType.USDC,
      depositor: buyer2,
      amount: new Decimal('250.75'),
      tokenAccount: 'token-account-usdc-2',
      status: DepositStatus.CONFIRMED,
      txId: 'deposit-usdc-tx-2',
      blockHeight: BigInt(12345690),
      confirmedAt: new Date(),
    },
  });

  await prisma.deposit.create({
    data: {
      agreementId: agreement2.id,
      type: DepositType.NFT,
      depositor: seller2,
      tokenAccount: 'token-account-nft-2',
      status: DepositStatus.CONFIRMED,
      txId: 'deposit-nft-tx-2',
      blockHeight: BigInt(12345695),
      nftMetadata: {
        name: 'Test NFT #123',
        symbol: 'TNFT',
        uri: 'https://example.com/nft/123',
      },
      confirmedAt: new Date(),
    },
  });

  console.log('✅ Created deposits');

  // Create test transaction logs
  console.log('📊 Creating transaction logs...');

  await prisma.transactionLog.create({
    data: {
      agreementId: agreement1.id,
      txId: 'init-tx-signature-1',
      operationType: 'init',
      blockHeight: BigInt(12345000),
      slot: BigInt(123450000),
      status: 'success',
    },
  });

  await prisma.transactionLog.create({
    data: {
      agreementId: agreement2.id,
      txId: 'init-tx-signature-2',
      operationType: 'init',
      blockHeight: BigInt(12345100),
      slot: BigInt(123451000),
      status: 'success',
    },
  });

  console.log('✅ Created transaction logs');

  // Create test idempotency keys
  console.log('🔑 Creating idempotency keys...');

  await prisma.idempotencyKey.create({
    data: {
      key: 'test-idempotency-key-001',
      endpoint: '/v1/agreements',
      requestHash: 'hash-of-request-body-001',
      responseStatus: 201,
      responseBody: { agreementId: agreement1.agreementId },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    },
  });

  console.log('✅ Created idempotency keys');

  console.log('🎉 Seeding completed successfully!');
  console.log('\nCreated:');
  console.log('  - 2 agreements');
  console.log('  - 3 deposits');
  console.log('  - 2 transaction logs');
  console.log('  - 1 idempotency key');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

