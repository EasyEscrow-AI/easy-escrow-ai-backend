/**
 * Seed Institution Escrow Data
 *
 * Seeds corridors, demo clients, allowlist, and settings for development/staging.
 *
 * Usage: npx ts-node scripts/seed-institution-data.ts
 */

import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding institution escrow data...\n');

  // 1. Seed corridors
  console.log('📍 Seeding corridors...');
  const corridors = [
    {
      code: 'SG-CH',
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

  // Staging test wallets (from .env.staging DEVNET_STAGING_SENDER/RECEIVER)
  const STAGING_SENDER_WALLET = 'AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z';
  const STAGING_RECEIVER_WALLET = '5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4';

  const clients = [
    {
      email: 'demo-enterprise@bank.com',
      companyName: 'Demo Enterprise Bank',
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
      const merged = Array.from(new Set([
        ...existing.settledWallets,
        ...c.settledWallets,
      ]));
      client = await prisma.institutionClient.update({
        where: { email: c.email },
        data: {
          settledWallets: merged,
          primaryWallet: c.primaryWallet ?? existing.primaryWallet,
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
          defaultCorridor: c.jurisdiction === 'SG' ? 'SG-CH' : c.jurisdiction === 'US' ? 'US-MX' : null,
          timezone: c.jurisdiction === 'SG' ? 'Asia/Singapore' : c.jurisdiction === 'US' ? 'America/New_York' : 'UTC',
        },
      });
    }
  }

  console.log('\n✅ Institution escrow seed data complete!');
  console.log(`   ${corridors.length} corridors configured`);
  console.log(`   ${clients.length} demo clients created`);
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
