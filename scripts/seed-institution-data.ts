/**
 * Seed Institution Escrow Data (v2 — 2026-03-26)
 *
 * Seeds corridors, demo clients, settings, and simulated payments for development/staging.
 *
 * Usage: npx ts-node scripts/seed-institution-data.ts
 *
 * Run order:
 *   1. npx ts-node prisma/seeds/corridor-config-seed.ts   (49 corridors)
 *   2. npx ts-node scripts/seed-institution-data.ts        (clients + payments)
 *   3. npx ts-node scripts/seed-optimus-exchange.ts        (full demo dataset)
 */

import { PrismaClient } from '../src/generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding institution escrow data...\n');

  // 1. Seed corridors
  console.log('📍 Seeding corridors...');
  const corridors = [
    {
      code: 'SG-CH',
      name: 'Singapore → Switzerland',
      sourceCountry: 'SG',
      destCountry: 'CH',
      minAmount: 1,
      maxAmount: 1000000,
      dailyLimit: 5000000,
      monthlyLimit: 50000000,
      requiredDocuments: ['INVOICE', 'CONTRACT'],
      riskLevel: 'LOW',
    },
    {
      code: 'US-MX',
      name: 'United States → Mexico',
      sourceCountry: 'US',
      destCountry: 'MX',
      minAmount: 100,
      maxAmount: 500000,
      dailyLimit: 2000000,
      monthlyLimit: 20000000,
      requiredDocuments: ['INVOICE'],
      riskLevel: 'MEDIUM',
    },
    {
      code: 'US-PH',
      name: 'United States → Philippines',
      sourceCountry: 'US',
      destCountry: 'PH',
      minAmount: 50,
      maxAmount: 250000,
      dailyLimit: 1000000,
      monthlyLimit: 10000000,
      requiredDocuments: ['INVOICE', 'SHIPPING_DOC'],
      riskLevel: 'MEDIUM',
    },
    {
      code: 'EU-UK',
      name: 'EU → United Kingdom',
      sourceCountry: 'EU',
      destCountry: 'UK',
      minAmount: 500,
      maxAmount: 2000000,
      dailyLimit: 10000000,
      monthlyLimit: 100000000,
      requiredDocuments: ['INVOICE'],
      riskLevel: 'LOW',
    },
    {
      code: 'SG-US',
      name: 'Singapore → United States',
      sourceCountry: 'SG',
      destCountry: 'US',
      minAmount: 100,
      maxAmount: 1000000,
      dailyLimit: 5000000,
      monthlyLimit: 50000000,
      requiredDocuments: ['INVOICE', 'CONTRACT'],
      riskLevel: 'LOW',
    },
  ];

  for (const c of corridors) {
    await prisma.institutionCorridor.upsert({
      where: { code: c.code },
      create: c,
      update: c,
    });
    console.log(`  ✅ Corridor ${c.code} (${c.riskLevel} risk)`);
  }

  // 2. Seed demo clients
  console.log('\n👥 Seeding demo institution clients...');
  const demoPassword = await bcrypt.hash('DemoPass123!', 12);

  // Staging test wallets (from env or .env.staging DEVNET_STAGING_SENDER/RECEIVER)
  const STAGING_SENDER_WALLET =
    process.env.DEVNET_STAGING_SENDER_ADDRESS || 'AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z';
  const STAGING_RECEIVER_WALLET =
    process.env.DEVNET_STAGING_RECEIVER_ADDRESS || '5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4';

  const clients = [
    {
      email: 'demo-enterprise@bank.com',
      companyName: 'Demo Enterprise Bank',
      legalName: 'Demo Enterprise Bank Pte. Ltd.',
      contactFirstName: 'Alice',
      contactLastName: 'Tan',
      contactEmail: 'alice.tan@bank.com',
      contactTitle: 'Head of Treasury',
      tier: 'ENTERPRISE' as const,
      status: 'ACTIVE' as const,
      kycStatus: 'VERIFIED',
      jurisdiction: 'SG',
      primaryWallet: '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u',
      settledWallets: [STAGING_SENDER_WALLET],
    },
    {
      email: 'demo-premium@trade.com',
      companyName: 'Demo Premium Trading Co',
      legalName: 'Demo Premium Trading Co, Inc.',
      contactFirstName: 'Bob',
      contactLastName: 'Johnson',
      contactEmail: 'bob.johnson@trade.com',
      contactTitle: 'CFO',
      tier: 'PREMIUM' as const,
      status: 'ACTIVE' as const,
      kycStatus: 'VERIFIED',
      jurisdiction: 'US',
      primaryWallet: '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R',
      settledWallets: [STAGING_RECEIVER_WALLET],
    },
    {
      email: 'demo-standard@company.com',
      companyName: 'Demo Standard LLC',
      legalName: 'Demo Standard LLC',
      contactFirstName: 'Charlie',
      contactLastName: 'Smith',
      contactEmail: 'charlie.smith@company.com',
      contactTitle: 'Operations Manager',
      tier: 'STANDARD' as const,
      status: 'ACTIVE' as const,
      kycStatus: 'VERIFIED',
      jurisdiction: 'UK',
      primaryWallet: 'HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2',
      settledWallets: [] as string[],
    },
    {
      email: 'demo-pending@newco.com',
      companyName: 'Demo Pending Verification Inc',
      legalName: 'Demo Pending Verification Inc.',
      contactFirstName: 'Diana',
      contactLastName: 'Garcia',
      contactEmail: 'diana.garcia@newco.com',
      contactTitle: 'Director',
      tier: 'STANDARD' as const,
      status: 'PENDING_VERIFICATION' as const,
      kycStatus: 'PENDING',
      jurisdiction: 'MX',
      primaryWallet: null,
      settledWallets: [] as string[],
    },
    {
      email: 'demo-suspended@risk.com',
      companyName: 'Demo Suspended Corp',
      legalName: 'Demo Suspended Corporation',
      contactFirstName: 'Eduardo',
      contactLastName: 'Reyes',
      contactEmail: 'eduardo.reyes@risk.com',
      contactTitle: 'Compliance Officer',
      tier: 'STANDARD' as const,
      status: 'SUSPENDED' as const,
      kycStatus: 'VERIFIED',
      jurisdiction: 'PH',
      primaryWallet: null,
      settledWallets: [] as string[],
    },
  ];

  for (const c of clients) {
    const existing = await prisma.institutionClient.findUnique({
      where: { email: c.email },
    });

    let client;
    if (existing) {
      // Update existing client: ensure settledWallets includes the staging test wallets
      const merged = Array.from(new Set([...existing.settledWallets, ...c.settledWallets]));
      client = await prisma.institutionClient.update({
        where: { email: c.email },
        data: {
          settledWallets: merged,
          primaryWallet: c.primaryWallet ?? existing.primaryWallet,
          legalName: c.legalName,
          contactFirstName: c.contactFirstName,
          contactLastName: c.contactLastName,
          contactEmail: c.contactEmail,
          contactTitle: c.contactTitle,
        },
      });
      console.log(`  ✅ Client ${c.email} updated (settledWallets: ${merged.length})`);
      // Still create settings below
    } else {
      client = await prisma.institutionClient.create({
        data: {
          email: c.email,
          passwordHash: demoPassword,
          companyName: c.companyName,
          legalName: c.legalName,
          contactFirstName: c.contactFirstName,
          contactLastName: c.contactLastName,
          contactEmail: c.contactEmail,
          contactTitle: c.contactTitle,
          tier: c.tier,
          status: c.status,
          kycStatus: c.kycStatus,
          jurisdiction: c.jurisdiction,
          primaryWallet: c.primaryWallet,
          settledWallets: c.settledWallets,
        },
      });
      console.log(`  ✅ Client ${c.email} created (${c.tier}, ${c.status})`);
    }

    // Create default settings (skip if already exists)
    const existingSettings = await prisma.institutionClientSettings.findUnique({
      where: { clientId: client.id },
    });
    if (!existingSettings) {
      await prisma.institutionClientSettings.create({
        data: {
          clientId: client.id,
          defaultCorridor:
            c.jurisdiction === 'SG' ? 'SG-CH' : c.jurisdiction === 'US' ? 'US-MX' : null,
          timezone:
            c.jurisdiction === 'SG'
              ? 'Asia/Singapore'
              : c.jurisdiction === 'US'
              ? 'America/New_York'
              : 'UTC',
        },
      });
    }
  }

  // 3. Seed simulated direct payments (3 per client)
  console.log('\n💸 Seeding simulated direct payments...');
  await prisma.directPayment.deleteMany({
    where: { paymentCode: { startsWith: 'EE-SEED' } },
  });

  function generatePaymentCode(index: number): string {
    return `EE-SEED-${String(index).padStart(3, '0')}`;
  }

  function randomDate(daysAgo: number): Date {
    const now = Date.now();
    const offset = Math.random() * daysAgo * 24 * 60 * 60 * 1000;
    return new Date(now - offset);
  }

  function randomTxHash(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  // Counterparty wallets for realistic payment pairs
  const counterparties = [
    {
      name: 'Axis Capital AG',
      country: 'CH',
      wallet: 'CH1aXisCptl9qR7FqQvH8c9pN3WxJ2KvF4uXtXg3F3Hg',
    },
    {
      name: 'Pacific Rim Holdings',
      country: 'SG',
      wallet: 'SG2pCfRmHld8qR7FqQvH8c9pN3WxJ2KvF4uXtXg3F3Hg',
    },
    {
      name: 'Meridian Trade Corp',
      country: 'MX',
      wallet: 'MX3mRdTrdCrp7qR7FqQvH8c9pN3WxJ2KvF4uXtXg3F3H',
    },
    {
      name: 'Northern Bridge Ltd',
      country: 'UK',
      wallet: 'UK4nRthBrdgLt6qR7FqQvH8c9pN3WxJ2KvF4uXtXg3F3H',
    },
    {
      name: 'Gulf Star Finance',
      country: 'AE',
      wallet: 'AE5gLfStrFnc5qR7FqQvH8c9pN3WxJ2KvF4uXtXg3F3Hg',
    },
  ];

  // Status pool: ~80% completed, ~5% each for the other four
  // 15 payments total → 11 completed, 1 pending_approval, 1 pending_proof, 1 pending_release, 1 cancelled
  const statusPool = [
    'completed',
    'completed',
    'completed',
    'completed',
    'completed',
    'completed',
    'completed',
    'completed',
    'completed',
    'completed',
    'completed',
    'pending_approval',
    'pending_proof',
    'pending_release',
    'cancelled',
  ];
  // Shuffle deterministically so distribution is spread across clients
  const shuffled = [...statusPool].sort(() => 0.5 - Math.random());

  // Fetch all seeded clients
  const seededClients = await prisma.institutionClient.findMany({
    where: { email: { in: clients.map((c) => c.email) } },
  });

  const amounts = [2500, 5000, 7500, 10000, 15000, 25000, 50000, 75000, 100000, 250000];
  let paymentIndex = 0;

  for (const client of seededClients) {
    const clientDef = clients.find((c) => c.email === client.email)!;
    const senderWallet = client.primaryWallet || STAGING_SENDER_WALLET;

    for (let i = 0; i < 3; i++) {
      const status = shuffled[paymentIndex];
      const counterparty = counterparties[paymentIndex % counterparties.length];
      const amount = amounts[paymentIndex % amounts.length];
      const feeBps = 20; // 0.20%
      const fee = Math.max(0.2, Math.min(20, (amount * feeBps) / 10000));
      const createdAt = randomDate(7);
      const corridor = `${clientDef.jurisdiction}-${counterparty.country}`;

      await prisma.directPayment.create({
        data: {
          paymentCode: generatePaymentCode(paymentIndex + 1),
          clientId: client.id,
          sender: clientDef.companyName,
          senderCountry: clientDef.jurisdiction || 'US',
          senderWallet,
          recipient: counterparty.name,
          recipientCountry: counterparty.country,
          recipientWallet: counterparty.wallet,
          amount: new Decimal(amount),
          currency: 'USDC',
          corridor,
          status,
          txHash: status === 'completed' ? randomTxHash() : null,
          platformFee: new Decimal(fee),
          riskScore: Math.floor(Math.random() * 40) + 10,
          settlementMode: 'direct',
          releaseMode: status === 'pending_approval' ? 'manual' : 'auto',
          settledAt: status === 'completed' ? new Date(createdAt.getTime() + 30_000) : null,
          createdAt,
        },
      });

      paymentIndex++;
    }

    console.log(`  ✅ ${clientDef.companyName}: 3 payments created`);
  }

  const statusCounts = shuffled.reduce((acc, s) => {
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(
    `  📊 Status distribution: ${Object.entries(statusCounts)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`
  );

  // 4. Seed transaction pools (if enabled)
  if (process.env.TRANSACTION_POOLS_ENABLED === 'true') {
    console.log('\n🏊 Seeding transaction pools...');

    // Clean up existing seed pools (wrapped in transaction for atomicity)
    await prisma.$transaction([
      prisma.transactionPoolAuditLog.deleteMany({
        where: { pool: { poolCode: { startsWith: 'POOL-SEED' } } },
      }),
      prisma.transactionPoolMember.deleteMany({
        where: { pool: { poolCode: { startsWith: 'POOL-SEED' } } },
      }),
      prisma.transactionPool.deleteMany({
        where: { poolCode: { startsWith: 'POOL-SEED' } },
      }),
    ]);

    const enterpriseClient = seededClients.find((c) => c.email === 'demo-enterprise@bank.com');
    if (enterpriseClient) {
      const pool = await prisma.transactionPool.create({
        data: {
          poolCode: 'POOL-SEED-001',
          clientId: enterpriseClient.id,
          status: 'OPEN',
          settlementMode: 'SEQUENTIAL',
          corridor: 'SG-CH',
          totalAmount: 0,
          totalFees: 0,
          memberCount: 0,
          settledCount: 0,
          failedCount: 0,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await prisma.transactionPoolAuditLog.create({
        data: {
          poolId: pool.id,
          action: 'POOL_CREATED',
          actor: 'seed-script',
          details: { seeded: true } as any,
        },
      });

      console.log(`  ✅ Pool ${pool.poolCode} created for ${enterpriseClient.companyName}`);
    }
  } else {
    console.log('\n⏭️  Transaction pools disabled (TRANSACTION_POOLS_ENABLED !== true)');
  }

  console.log('\n✅ Institution escrow seed data complete!');
  console.log(`   ${corridors.length} corridors configured`);
  console.log(`   ${clients.length} demo clients created`);
  console.log(`   ${paymentIndex} direct payments created`);
  console.log('\n   Demo login: demo-enterprise@bank.com / DemoPass123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
