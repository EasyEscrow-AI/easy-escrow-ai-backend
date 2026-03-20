/**
 * Seed Institution Portal Data
 *
 * Usage: npm run seed:portal
 */

import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generateEscrowCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const seg = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `EE-${seg(4)}-${seg(4)}`;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function main() {
  console.log('🌱 Seeding institution portal data...\n');

  console.log('🏢 Seeding primary client: Helvetica Digital...');
  const passwordHash = await bcrypt.hash('HelveticaDemo2026!', 12);

  const helvetica = await prisma.institutionClient.upsert({
    where: { email: 'ops@helvetica-digital.ch' },
    create: {
      email: 'ops@helvetica-digital.ch',
      passwordHash,
      companyName: 'Helvetica Digital AG',
      legalName: 'Helvetica Digital AG',
      tradingName: 'Helvetica Digital',
      registrationNumber: 'CHE-123.456.789',
      registrationCountry: 'CH',
      entityType: 'CORPORATION',
      tier: 'ENTERPRISE',
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      kybStatus: 'VERIFIED',
      kybVerifiedAt: daysAgo(180),
      kybExpiresAt: new Date('2027-06-01'),
      jurisdiction: 'CH',
      country: 'Switzerland',
      city: 'Zurich',
      postalCode: '8001',
      addressLine1: 'Bahnhofstrasse 42',
      contactFirstName: 'Elena',
      contactLastName: 'Mueller',
      contactEmail: 'elena.mueller@helvetica-digital.ch',
      contactPhone: '+41 44 123 4567',
      contactTitle: 'Head of Operations',
      riskRating: 'LOW',
      sanctionsStatus: 'CLEAR',
      isRegulatedEntity: true,
      regulatoryStatus: 'REGULATED',
      licenseType: 'FINMA DLT License',
      licenseNumber: 'FINMA-2024-DLT-0042',
      regulatoryBody: 'FINMA',
      industry: 'Digital Assets & Custody',
      websiteUrl: 'https://helvetica-digital.ch',
      businessDescription: 'Swiss digital asset custody and cross-border settlement provider',
      yearEstablished: 2019,
      employeeCountRange: 'RANGE_51_200',
      annualRevenueRange: 'RANGE_10M_50M',
      expectedMonthlyVolume: 5000000,
      walletCustodyType: 'MPC',
      custodianName: 'Fireblocks',
      preferredSettlementChain: 'solana',
      primaryWallet: 'HeLv3t1cAd1g1tALwA11etAddr355000000000001',
      settledWallets: ['HeLv3t1cAd1g1tALwA11etAddr355000000000001', 'HeLv3t1cAd1g1tALwA11etAddr355000000000002'],
      isTestAccount: true,
    },
    update: { companyName: 'Helvetica Digital AG', status: 'ACTIVE', kycStatus: 'VERIFIED' },
  });

  console.log(`  ✅ Helvetica Digital (${helvetica.id})`);

  await prisma.institutionClientSettings.upsert({
    where: { clientId: helvetica.id },
    create: {
      clientId: helvetica.id, defaultCorridor: 'CH-SG', defaultCurrency: 'USDC',
      timezone: 'Europe/Zurich', autoApproveThreshold: 10000, manualReviewThreshold: 50000,
      autoTravelRule: true, activeSanctionsLists: ['OFAC SDN', 'EU Consolidated', 'UN Sanctions', 'SECO'],
      aiAutoRelease: false, riskTolerance: 'low', defaultToken: 'usdc', emailNotifications: true,
    },
    update: { manualReviewThreshold: 50000, autoTravelRule: true, aiAutoRelease: false, riskTolerance: 'low', defaultToken: 'usdc', emailNotifications: true },
  });

  console.log('\n🏬 Seeding branches...');
  const branchData = [
    { name: 'Zurich HQ', city: 'Zurich', country: 'Switzerland', countryCode: 'CH', address: 'Bahnhofstrasse 42, 8001 Zurich', timezone: 'Europe/Zurich', riskScore: 5, complianceStatus: 'ACTIVE', regulatoryBody: 'FINMA' },
    { name: 'Singapore Office', city: 'Singapore', country: 'Singapore', countryCode: 'SG', address: '1 Raffles Place, #20-01, Tower 2', timezone: 'Asia/Singapore', riskScore: 8, complianceStatus: 'ACTIVE', regulatoryBody: 'MAS' },
    { name: 'London Branch', city: 'London', country: 'United Kingdom', countryCode: 'GB', address: '25 Old Broad Street, EC2N 1HQ', timezone: 'Europe/London', riskScore: 6, complianceStatus: 'ACTIVE', regulatoryBody: 'FCA' },
    { name: 'New York Representative', city: 'New York', country: 'United States', countryCode: 'US', address: '55 Water Street, New York, NY 10041', timezone: 'America/New_York', riskScore: 10, complianceStatus: 'ACTIVE', regulatoryBody: 'FinCEN' },
    { name: 'Dubai DIFC', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', address: 'Gate Village, Building 3, DIFC', timezone: 'Asia/Dubai', riskScore: 15, complianceStatus: 'UNDER_REVIEW', regulatoryBody: 'DFSA', complianceNote: 'Enhanced due diligence in progress for VARA registration' },
    { name: 'Geneva Wealth Office', city: 'Geneva', country: 'Switzerland', countryCode: 'CH', address: 'Rue du Rhone 80, 1204 Geneva', timezone: 'Europe/Zurich', riskScore: 4, complianceStatus: 'ACTIVE', regulatoryBody: 'FINMA' },
  ];

  const branches: Record<string, any> = {};
  for (const b of branchData) {
    await prisma.institutionBranch.deleteMany({ where: { clientId: helvetica.id, name: b.name } });
    const branch = await prisma.institutionBranch.create({ data: { clientId: helvetica.id, ...b } });
    branches[b.countryCode + '-' + b.city] = branch;
    console.log(`  ✅ ${b.name} (${b.countryCode})`);
  }

  console.log('\n💰 Seeding accounts...');
  const accountData = [
    { name: 'ZH Treasury', accountType: 'TREASURY' as const, walletAddress: 'HeLv3t1cAd1g1tALwA11etAddr355000000000001', branchId: branches['CH-Zurich']?.id, isDefault: true, verificationStatus: 'VERIFIED' as const },
    { name: 'SG Operations', accountType: 'OPERATIONS' as const, walletAddress: 'HeLv3t1cAd1g1tALwA11etAddr355000000000002', branchId: branches['SG-Singapore']?.id, verificationStatus: 'VERIFIED' as const },
    { name: 'London Settlement', accountType: 'SETTLEMENT' as const, walletAddress: 'HeLv3t1cAd1g1tALwA11etAddr355000000000003', branchId: branches['GB-London']?.id, verificationStatus: 'VERIFIED' as const },
    { name: 'Dubai Collateral', accountType: 'COLLATERAL' as const, walletAddress: 'HeLv3t1cAd1g1tALwA11etAddr355000000000004', branchId: branches['AE-Dubai']?.id, verificationStatus: 'PENDING' as const },
    { name: 'NY General', accountType: 'GENERAL' as const, walletAddress: 'HeLv3t1cAd1g1tALwA11etAddr355000000000005', branchId: branches['US-New York']?.id, verificationStatus: 'VERIFIED' as const },
    { name: 'Geneva Wealth', accountType: 'TREASURY' as const, walletAddress: 'HeLv3t1cAd1g1tALwA11etAddr355000000000006', branchId: branches['CH-Geneva']?.id, verificationStatus: 'VERIFIED' as const },
  ];

  for (const a of accountData) {
    await prisma.institutionAccount.upsert({
      where: { clientId_name: { clientId: helvetica.id, name: a.name } },
      create: { clientId: helvetica.id, name: a.name, accountType: a.accountType, walletAddress: a.walletAddress, branchId: a.branchId || null, isDefault: a.isDefault || false, verificationStatus: a.verificationStatus, verifiedAt: a.verificationStatus === 'VERIFIED' ? daysAgo(90) : undefined },
      update: { branchId: a.branchId || null, verificationStatus: a.verificationStatus },
    });
    console.log(`  ✅ ${a.name} (${a.accountType})`);
  }

  console.log('\n🌐 Seeding corridors...');
  const corridorConfigs: Record<string, { risk: string; min: number; max: number; daily: number; monthly: number; docs: string[] }> = {
    'CH-SG': { risk: 'LOW', min: 100, max: 2000000, daily: 10000000, monthly: 100000000, docs: ['INVOICE', 'CONTRACT'] },
    'SG-CH': { risk: 'LOW', min: 100, max: 2000000, daily: 10000000, monthly: 100000000, docs: ['INVOICE', 'CONTRACT'] },
    'CH-US': { risk: 'LOW', min: 500, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE'] },
    'US-CH': { risk: 'LOW', min: 500, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE'] },
    'CH-GB': { risk: 'LOW', min: 100, max: 3000000, daily: 15000000, monthly: 150000000, docs: ['INVOICE'] },
    'GB-CH': { risk: 'LOW', min: 100, max: 3000000, daily: 15000000, monthly: 150000000, docs: ['INVOICE'] },
    'CH-AE': { risk: 'MEDIUM', min: 1000, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT', 'LETTER_OF_CREDIT'] },
    'AE-CH': { risk: 'MEDIUM', min: 1000, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT', 'LETTER_OF_CREDIT'] },
    'SG-US': { risk: 'LOW', min: 100, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT'] },
    'US-SG': { risk: 'LOW', min: 100, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT'] },
    'SG-GB': { risk: 'LOW', min: 100, max: 2000000, daily: 10000000, monthly: 100000000, docs: ['INVOICE'] },
    'GB-SG': { risk: 'LOW', min: 100, max: 2000000, daily: 10000000, monthly: 100000000, docs: ['INVOICE'] },
    'SG-AE': { risk: 'MEDIUM', min: 500, max: 500000, daily: 2500000, monthly: 25000000, docs: ['INVOICE', 'CONTRACT'] },
    'AE-SG': { risk: 'MEDIUM', min: 500, max: 500000, daily: 2500000, monthly: 25000000, docs: ['INVOICE', 'CONTRACT'] },
    'US-GB': { risk: 'LOW', min: 100, max: 5000000, daily: 25000000, monthly: 250000000, docs: ['INVOICE'] },
    'GB-US': { risk: 'LOW', min: 100, max: 5000000, daily: 25000000, monthly: 250000000, docs: ['INVOICE'] },
    'US-AE': { risk: 'MEDIUM', min: 1000, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT'] },
    'AE-US': { risk: 'MEDIUM', min: 1000, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT'] },
    'GB-AE': { risk: 'MEDIUM', min: 500, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT'] },
    'AE-GB': { risk: 'MEDIUM', min: 500, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT'] },
  };

  for (const [code, cfg] of Object.entries(corridorConfigs)) {
    const [src, dst] = code.split('-');
    await prisma.institutionCorridor.upsert({
      where: { code },
      create: { code, sourceCountry: src, destCountry: dst, minAmount: cfg.min, maxAmount: cfg.max, dailyLimit: cfg.daily, monthlyLimit: cfg.monthly, requiredDocuments: cfg.docs, riskLevel: cfg.risk, status: 'ACTIVE' },
      update: { minAmount: cfg.min, maxAmount: cfg.max, riskLevel: cfg.risk, status: 'ACTIVE' },
    });
  }
  console.log(`  ✅ ${Object.keys(corridorConfigs).length} corridors seeded`);

  console.log('\n👥 Seeding external clients...');
  // Generate deterministic wallet addresses from email prefix
  function walletFromEmail(email: string): string {
    const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    return (prefix + 'Wa11etAddr355' + '0'.repeat(44)).slice(0, 44);
  }

  const externalClients = [
    { email: 'treasury@amina-bank.ch', company: 'AMINA Bank AG', country: 'Switzerland', city: 'Zug', industry: 'Digital Asset Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'FINMA' },
    { email: 'ops@dbs-digital.sg', company: 'DBS Digital Exchange', country: 'Singapore', city: 'Singapore', industry: 'Digital Asset Exchange', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'MAS' },
    { email: 'settlements@circle.com', company: 'Circle Internet Financial', country: 'United States', city: 'Boston', industry: 'Stablecoin Issuance', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'NYDFS' },
    { email: 'ops@seba-bank.ch', company: 'SEBA Bank AG', country: 'Switzerland', city: 'Zug', industry: 'Digital Asset Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'FINMA' },
    { email: 'custody@fireblocks.com', company: 'Fireblocks Inc.', country: 'United States', city: 'New York', industry: 'Digital Asset Custody', tier: 'PREMIUM' as const, regulated: false, regBody: null },
    { email: 'trading@bc-group.hk', company: 'BC Technology Group', country: 'Hong Kong', city: 'Hong Kong', industry: 'Digital Asset Trading', tier: 'PREMIUM' as const, regulated: true, regBody: 'SFC' },
    { email: 'compliance@chainalysis.com', company: 'Chainalysis Inc.', country: 'United States', city: 'New York', industry: 'Blockchain Analytics', tier: 'PREMIUM' as const, regulated: false, regBody: null },
    { email: 'ops@standard-chartered.sg', company: 'SC Ventures Digital', country: 'Singapore', city: 'Singapore', industry: 'Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'MAS' },
    { email: 'digital@hsbc.co.uk', company: 'HSBC Digital Assets', country: 'United Kingdom', city: 'London', industry: 'Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'FCA' },
    { email: 'treasury@tether.to', company: 'Tether Holdings', country: 'British Virgin Islands', city: 'Road Town', industry: 'Stablecoin Issuance', tier: 'ENTERPRISE' as const, regulated: false, regBody: null },
    { email: 'ops@copper.co', company: 'Copper Technologies', country: 'United Kingdom', city: 'London', industry: 'Digital Asset Custody', tier: 'PREMIUM' as const, regulated: true, regBody: 'FCA' },
    { email: 'settlements@paxos.com', company: 'Paxos Trust Company', country: 'United States', city: 'New York', industry: 'Stablecoin & Settlement', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'NYDFS' },
    { email: 'ops@matrixport.com', company: 'Matrixport', country: 'Singapore', city: 'Singapore', industry: 'Digital Asset Services', tier: 'PREMIUM' as const, regulated: true, regBody: 'MAS' },
    { email: 'custody@anchorage.com', company: 'Anchorage Digital', country: 'United States', city: 'San Francisco', industry: 'Digital Asset Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'OCC' },
    { email: 'digital@emirates-nbd.ae', company: 'Emirates NBD Digital', country: 'United Arab Emirates', city: 'Dubai', industry: 'Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'DFSA' },
  ];

  for (const c of externalClients) {
    const wallet = walletFromEmail(c.email);
    await prisma.institutionClient.upsert({
      where: { email: c.email },
      create: { email: c.email, passwordHash, companyName: c.company, country: c.country, city: c.city, industry: c.industry, tier: c.tier, status: 'ACTIVE', kycStatus: 'VERIFIED', kybStatus: 'VERIFIED', kybVerifiedAt: daysAgo(120), riskRating: 'LOW', sanctionsStatus: 'CLEAR', isRegulatedEntity: c.regulated, regulatoryBody: c.regBody, isTestAccount: true, primaryWallet: wallet, settledWallets: [wallet] },
      update: { companyName: c.company, primaryWallet: wallet, settledWallets: [wallet] },
    });
  }
  console.log(`  ✅ ${externalClients.length} external clients seeded`);

  console.log('\n📦 Seeding escrow records...');
  // Clean up previous demo data to avoid duplicates on re-run
  await prisma.institutionAuditLog.deleteMany({ where: { clientId: helvetica.id } });
  await prisma.institutionEscrow.deleteMany({ where: { clientId: helvetica.id } });
  await prisma.directPayment.deleteMany({ where: { clientId: helvetica.id } });
  const usdcMint = process.env.USDC_MINT_ADDRESS || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
  const escrowData = [
    { corridor: 'CH-SG', amount: 125000, status: 'COMPLETE' as const, condition: 'COMPLIANCE_CHECK', days: 30, recipientEmail: 'ops@dbs-digital.sg' },
    { corridor: 'CH-US', amount: 250000, status: 'FUNDED' as const, condition: 'ADMIN_RELEASE', days: 5, recipientEmail: 'settlements@circle.com' },
    { corridor: 'SG-CH', amount: 75000, status: 'CREATED' as const, condition: 'COMPLIANCE_CHECK', days: 2, recipientEmail: 'ops@seba-bank.ch' },
    { corridor: 'CH-GB', amount: 500000, status: 'COMPLIANCE_HOLD' as const, condition: 'COMPLIANCE_CHECK', days: 3, recipientEmail: 'digital@hsbc.co.uk' },
    { corridor: 'GB-CH', amount: 180000, status: 'RELEASED' as const, condition: 'ADMIN_RELEASE', days: 15, recipientEmail: 'ops@copper.co' },
    { corridor: 'CH-AE', amount: 95000, status: 'CANCELLED' as const, condition: 'ADMIN_RELEASE', days: 20, recipientEmail: 'digital@emirates-nbd.ae' },
    { corridor: 'US-CH', amount: 350000, status: 'DRAFT' as const, condition: 'COMPLIANCE_CHECK', days: 1, recipientEmail: 'settlements@paxos.com' },
    { corridor: 'SG-US', amount: 420000, status: 'EXPIRED' as const, condition: 'TIME_LOCK', days: 45, recipientEmail: 'custody@anchorage.com' },
  ];

  for (const e of escrowData) {
    const escrowId = crypto.randomUUID();
    const escrowCode = generateEscrowCode();
    const recipient = await prisma.institutionClient.findUnique({ where: { email: e.recipientEmail } });
    const recipientWallet = recipient?.primaryWallet || 'RecipientWa11etAddr355000000000000000000000';
    const feeBps = 50;
    const platformFee = (e.amount * feeBps) / 10000;

    await prisma.institutionEscrow.create({
      data: {
        escrowId, escrowCode, clientId: helvetica.id,
        payerWallet: helvetica.primaryWallet || 'HeLv3t1cAd1g1tALwA11etAddr355000000000001',
        recipientWallet, usdcMint, amount: e.amount, platformFee,
        corridor: e.corridor, conditionType: e.condition, status: e.status,
        settlementAuthority: helvetica.primaryWallet || 'HeLv3t1cAd1g1tALwA11etAddr355000000000001',
        riskScore: Math.floor(Math.random() * 30) + 5,
        expiresAt: new Date(daysAgo(e.days).getTime() + 72 * 60 * 60 * 1000),
        createdAt: daysAgo(e.days),
        resolvedAt: ['COMPLETE', 'RELEASED', 'CANCELLED', 'EXPIRED'].includes(e.status) ? daysAgo(Math.max(0, e.days - 2)) : undefined,
        fundedAt: ['FUNDED', 'COMPLETE', 'RELEASED'].includes(e.status) ? daysAgo(Math.max(0, e.days - 1)) : undefined,
      },
    });

    await prisma.institutionAuditLog.create({
      data: { escrowId, clientId: helvetica.id, action: 'ESCROW_CREATED', actor: helvetica.email, details: { corridor: e.corridor, amount: e.amount }, createdAt: daysAgo(e.days) },
    });

    if (['FUNDED', 'COMPLETE', 'RELEASED'].includes(e.status)) {
      await prisma.institutionAuditLog.create({
        data: { escrowId, clientId: helvetica.id, action: 'DEPOSIT_CONFIRMED', actor: 'system', details: { amount: e.amount }, createdAt: daysAgo(Math.max(0, e.days - 1)) },
      });
    }
    if (['COMPLETE', 'RELEASED'].includes(e.status)) {
      await prisma.institutionAuditLog.create({
        data: { escrowId, clientId: helvetica.id, action: 'FUNDS_RELEASED', actor: 'settlement-authority', details: { recipientWallet }, createdAt: daysAgo(Math.max(0, e.days - 2)) },
      });
    }

    console.log(`  ✅ Escrow ${escrowCode} (${e.corridor}, $${e.amount.toLocaleString()}, ${e.status})`);
  }

  console.log('\n💸 Seeding direct payments...');
  const directPayments = [
    { sender: 'Helvetica Digital', senderCountry: 'CH', recipient: 'DBS Digital Exchange', recipientCountry: 'SG', amount: 50000, corridor: 'CH-SG', status: 'completed', days: 10 },
    { sender: 'Helvetica Digital', senderCountry: 'CH', recipient: 'Circle Internet Financial', recipientCountry: 'US', amount: 100000, corridor: 'CH-US', status: 'completed', days: 8 },
    { sender: 'AMINA Bank AG', senderCountry: 'CH', recipient: 'Helvetica Digital', recipientCountry: 'CH', amount: 75000, corridor: 'CH-CH', status: 'completed', days: 15 },
    { sender: 'Helvetica Digital', senderCountry: 'CH', recipient: 'HSBC Digital Assets', recipientCountry: 'GB', amount: 200000, corridor: 'CH-GB', status: 'completed', days: 1 },
    { sender: 'SC Ventures Digital', senderCountry: 'SG', recipient: 'Helvetica Digital', recipientCountry: 'CH', amount: 150000, corridor: 'SG-CH', status: 'completed', days: 20 },
    { sender: 'Helvetica Digital', senderCountry: 'CH', recipient: 'Emirates NBD Digital', recipientCountry: 'AE', amount: 80000, corridor: 'CH-AE', status: 'cancelled', days: 12 },
    { sender: 'Helvetica Digital', senderCountry: 'CH', recipient: 'Copper Technologies', recipientCountry: 'GB', amount: 45000, corridor: 'CH-GB', status: 'completed', days: 25 },
    { sender: 'Anchorage Digital', senderCountry: 'US', recipient: 'Helvetica Digital', recipientCountry: 'CH', amount: 300000, corridor: 'US-CH', status: 'completed', days: 2 },
  ];

  for (const dp of directPayments) {
    const feeBps = 25;
    const platformFee = (dp.amount * feeBps) / 10000;
    const txHash = dp.status === 'completed' ? `sim_tx_${crypto.randomUUID().slice(0, 16)}` : null;
    const settledAt = dp.status === 'completed' ? daysAgo(Math.max(0, dp.days - 1)) : null;
    const payment = await prisma.directPayment.create({
      data: {
        clientId: helvetica.id, sender: dp.sender, senderCountry: dp.senderCountry,
        senderWallet: 'SenderWa11etAddr3550000000000000000000000' + Math.floor(Math.random() * 10),
        recipient: dp.recipient, recipientCountry: dp.recipientCountry,
        recipientWallet: 'RecipWa11etAddr35500000000000000000000000' + Math.floor(Math.random() * 10),
        amount: dp.amount, corridor: dp.corridor, status: dp.status, platformFee,
        riskScore: Math.floor(Math.random() * 25) + 5,
        txHash,
        settledAt,
        createdAt: daysAgo(dp.days),
      },
    });

    // Audit log: creation
    await prisma.institutionAuditLog.create({
      data: { clientId: helvetica.id, action: 'DIRECT_PAYMENT_CREATED', actor: helvetica.email, details: { paymentId: payment.id, corridor: dp.corridor, amount: dp.amount, recipient: dp.recipient }, createdAt: daysAgo(dp.days) },
    });

    // Audit log: completion or cancellation
    if (dp.status === 'completed') {
      await prisma.institutionAuditLog.create({
        data: { clientId: helvetica.id, action: 'DIRECT_PAYMENT_COMPLETED', actor: 'system', details: { paymentId: payment.id, txHash, settledAt }, createdAt: settledAt || daysAgo(dp.days) },
      });
    } else if (dp.status === 'cancelled') {
      await prisma.institutionAuditLog.create({
        data: { clientId: helvetica.id, action: 'DIRECT_PAYMENT_FAILED', actor: 'system', details: { paymentId: payment.id, reason: 'Client-requested cancellation' }, createdAt: daysAgo(Math.max(0, dp.days - 1)) },
      });
    }

    console.log(`  ✅ ${dp.sender} → ${dp.recipient} ($${dp.amount.toLocaleString()}, ${dp.status})`);
  }

  console.log('\n✅ Institution portal seed data complete!');
  console.log(`   Login: ops@helvetica-digital.ch / HelveticaDemo2026!`);
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
