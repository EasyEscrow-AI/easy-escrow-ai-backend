/**
 * Seed Institution Portal Data — Helvetica Digital Dashboard
 *
 * Seeds the ops@helvetica-digital.ch account with:
 * - 3 accounts (Operating, Escrow Reserve, Settlement Float)
 * - 6 branches (CH, US, SG, GB, AE + RU sanctioned)
 * - 4 external counterparty clients
 * - 4 active escrows
 * - 4 recent direct payments
 * - Corridors for all payment routes
 * - Notifications for pending actions
 *
 * Usage: npm run seed:portal
 */

import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log('Seeding institution portal data...\n');

  // ============================================================================
  // 1. Primary Client: Helvetica Digital
  // ============================================================================
  console.log('Seeding primary client: Helvetica Digital...');
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
      settledWallets: [
        'HeLv3t1cAd1g1tALwA11etAddr355000000000001',
        'HeLv3t1cAd1g1tALwA11etAddr355000000000002',
      ],
      isTestAccount: true,
    },
    update: { companyName: 'Helvetica Digital AG', status: 'ACTIVE', kycStatus: 'VERIFIED' },
  });

  console.log(`  Helvetica Digital (${helvetica.id})`);

  // Settings
  await prisma.institutionClientSettings.upsert({
    where: { clientId: helvetica.id },
    create: {
      clientId: helvetica.id,
      defaultCorridor: 'CH-SG',
      defaultCurrency: 'USDC',
      timezone: 'Europe/Zurich',
      autoApproveThreshold: 10000,
      manualReviewThreshold: 50000,
      autoTravelRule: true,
      activeSanctionsLists: ['OFAC SDN', 'EU Consolidated', 'UN Sanctions', 'SECO'],
      aiAutoRelease: false,
      riskTolerance: 'low',
      defaultToken: 'usdc',
      emailNotifications: true,
    },
    update: {},
  });

  // ============================================================================
  // 2. Branches
  // ============================================================================
  console.log('\nSeeding branches...');

  // Clean previous branches
  await prisma.institutionAccount.deleteMany({ where: { clientId: helvetica.id } });
  await prisma.institutionBranch.deleteMany({ where: { clientId: helvetica.id } });

  const branchData = [
    { name: 'Zurich HQ', city: 'Zurich', country: 'Switzerland', countryCode: 'CH', address: 'Bahnhofstrasse 42, 8001 Zurich', timezone: 'Europe/Zurich', riskScore: 5, complianceStatus: 'ACTIVE', regulatoryBody: 'FINMA' },
    { name: 'New York Branch', city: 'New York', country: 'United States', countryCode: 'US', address: '55 Water Street, New York, NY 10041', timezone: 'America/New_York', riskScore: 10, complianceStatus: 'ACTIVE', regulatoryBody: 'FinCEN' },
    { name: 'Singapore Branch', city: 'Singapore', country: 'Singapore', countryCode: 'SG', address: '1 Raffles Place, #20-01, Tower 2', timezone: 'Asia/Singapore', riskScore: 8, complianceStatus: 'ACTIVE', regulatoryBody: 'MAS' },
    { name: 'London Branch', city: 'London', country: 'United Kingdom', countryCode: 'GB', address: '25 Old Broad Street, EC2N 1HQ', timezone: 'Europe/London', riskScore: 6, complianceStatus: 'ACTIVE', regulatoryBody: 'FCA' },
    { name: 'Dubai Branch', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', address: 'Gate Village, Building 3, DIFC', timezone: 'Asia/Dubai', riskScore: 15, complianceStatus: 'ACTIVE', regulatoryBody: 'DFSA' },
    { name: 'Moscow Office', city: 'Moscow', country: 'Russia', countryCode: 'RU', address: 'Tverskaya Street 22, Moscow 125009', timezone: 'Europe/Moscow', riskScore: 100, complianceStatus: 'BLOCKED', regulatoryBody: 'CBR', isSanctioned: true, sanctionReason: 'All operations suspended — EU/US/CH sanctions', isActive: false },
  ];

  const branches: Record<string, any> = {};
  for (const b of branchData) {
    const branch = await prisma.institutionBranch.create({
      data: { clientId: helvetica.id, ...b },
    });
    branches[b.countryCode] = branch;
    console.log(`  ${b.name} (${b.countryCode})${b.isSanctioned ? ' [SANCTIONED]' : ''}`);
  }

  // ============================================================================
  // 3. Accounts (3 dashboard accounts)
  // ============================================================================
  console.log('\nSeeding accounts...');

  const accountData = [
    {
      name: 'Operating Account',
      label: 'Operating Account',
      accountType: 'OPERATIONS' as const,
      walletAddress: 'HeLv3t1cAd1g1tALOp1rAddr355000000000001',
      branchKey: 'CH',
      isDefault: true,
      verificationStatus: 'VERIFIED' as const,
      description: 'Primary operating account — USDC',
    },
    {
      name: 'Escrow Reserve',
      label: 'Escrow Reserve',
      accountType: 'COLLATERAL' as const,
      walletAddress: 'HeLv3t1cAd1g1tALEs1rAddr355000000000001',
      branchKey: 'CH',
      isDefault: false,
      verificationStatus: 'VERIFIED' as const,
      description: 'Escrow reserve for active escrows — USDC',
    },
    {
      name: 'Settlement Float',
      label: 'Settlement Float',
      accountType: 'SETTLEMENT' as const,
      walletAddress: 'HeLv3t1cAd1g1tALSe1rAddr355000000000001',
      branchKey: 'CH',
      isDefault: false,
      verificationStatus: 'VERIFIED' as const,
      description: 'Settlement float for cross-border payments — USDC',
    },
  ];

  for (const a of accountData) {
    await prisma.institutionAccount.create({
      data: {
        clientId: helvetica.id,
        name: a.name,
        label: a.label,
        accountType: a.accountType,
        walletAddress: a.walletAddress,
        branchId: branches[a.branchKey]?.id || null,
        isDefault: a.isDefault,
        verificationStatus: a.verificationStatus,
        verifiedAt: daysAgo(90),
        description: a.description,
      },
    });
    console.log(`  ${a.name} (${a.accountType})`);
  }

  // ============================================================================
  // 4. Corridors
  // ============================================================================
  console.log('\nSeeding corridors...');

  const corridorConfigs: Record<string, { risk: string; min: number; max: number; daily: number; monthly: number; docs: string[] }> = {
    // Corridors from active escrows
    'CH-SG': { risk: 'LOW', min: 100, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE', 'CONTRACT'] },
    'SG-JP': { risk: 'LOW', min: 100, max: 3000000, daily: 15000000, monthly: 150000000, docs: ['INVOICE', 'CONTRACT'] },
    'GB-CH': { risk: 'LOW', min: 100, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE'] },
    'AE-AE': { risk: 'LOW', min: 100, max: 2000000, daily: 10000000, monthly: 100000000, docs: ['INVOICE'] },
    // Corridors from direct payments
    'CH-CH': { risk: 'LOW', min: 100, max: 10000000, daily: 50000000, monthly: 500000000, docs: [] },
    'US-DE': { risk: 'LOW', min: 100, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE'] },
    'GB-SG': { risk: 'LOW', min: 100, max: 3000000, daily: 15000000, monthly: 150000000, docs: ['INVOICE'] },
    // Corridors from corridor activity
    'US-CH': { risk: 'LOW', min: 500, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE'] },
    'GB-HK': { risk: 'MEDIUM', min: 500, max: 2000000, daily: 10000000, monthly: 100000000, docs: ['INVOICE', 'CONTRACT'] },
    'CH-IT': { risk: 'LOW', min: 100, max: 3000000, daily: 15000000, monthly: 150000000, docs: ['INVOICE'] },
    // Reverse corridors
    'SG-CH': { risk: 'LOW', min: 100, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE', 'CONTRACT'] },
    'JP-SG': { risk: 'LOW', min: 100, max: 3000000, daily: 15000000, monthly: 150000000, docs: ['INVOICE', 'CONTRACT'] },
    'CH-GB': { risk: 'LOW', min: 100, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE'] },
    'DE-US': { risk: 'LOW', min: 100, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE'] },
    'HK-GB': { risk: 'MEDIUM', min: 500, max: 2000000, daily: 10000000, monthly: 100000000, docs: ['INVOICE', 'CONTRACT'] },
    'IT-CH': { risk: 'LOW', min: 100, max: 3000000, daily: 15000000, monthly: 150000000, docs: ['INVOICE'] },
    'CH-US': { risk: 'LOW', min: 500, max: 5000000, daily: 20000000, monthly: 200000000, docs: ['INVOICE'] },
    'SG-GB': { risk: 'LOW', min: 100, max: 2000000, daily: 10000000, monthly: 100000000, docs: ['INVOICE'] },
    'CH-AE': { risk: 'MEDIUM', min: 1000, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT', 'LETTER_OF_CREDIT'] },
    'AE-CH': { risk: 'MEDIUM', min: 1000, max: 1000000, daily: 5000000, monthly: 50000000, docs: ['INVOICE', 'CONTRACT', 'LETTER_OF_CREDIT'] },
  };

  for (const [code, cfg] of Object.entries(corridorConfigs)) {
    const [src, dst] = code.split('-');
    await prisma.institutionCorridor.upsert({
      where: { code },
      create: { code, sourceCountry: src, destCountry: dst, minAmount: cfg.min, maxAmount: cfg.max, dailyLimit: cfg.daily, monthlyLimit: cfg.monthly, requiredDocuments: cfg.docs, riskLevel: cfg.risk, status: 'ACTIVE' },
      update: { minAmount: cfg.min, maxAmount: cfg.max, riskLevel: cfg.risk, status: 'ACTIVE' },
    });
  }
  console.log(`  ${Object.keys(corridorConfigs).length} corridors seeded`);

  // ============================================================================
  // 5. External Counterparty Clients
  // ============================================================================
  console.log('\nSeeding external clients...');

  function walletFromSeed(seed: string): string {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let hash = 0;
    for (const ch of seed) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
    let out = '';
    for (let i = 0; i < 44; i++) {
      hash = ((hash << 5) - hash + i) | 0;
      out += chars[Math.abs(hash) % chars.length];
    }
    return out;
  }

  // Clients appearing in the dashboard escrows and payments
  const dashboardClients = [
    { email: 'ops@globaltrade-industries.com', company: 'GlobalTrade Industries', country: 'Singapore', city: 'Singapore', countryCode: 'SG', industry: 'International Trade', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'MAS' },
    { email: 'ops@pacific-rim-exports.sg', company: 'Pacific Rim Exports', country: 'Singapore', city: 'Singapore', countryCode: 'SG', industry: 'Export Trading', tier: 'PREMIUM' as const, regulated: true, regBody: 'MAS' },
    { email: 'finance@swiss-precision.ch', company: 'Swiss Precision AG', country: 'Switzerland', city: 'Basel', countryCode: 'CH', industry: 'Precision Manufacturing', tier: 'PREMIUM' as const, regulated: false, regBody: null },
    { email: 'ops@eurolink-trading.de', company: 'Eurolink Trading GmbH', country: 'Germany', city: 'Frankfurt', countryCode: 'DE', industry: 'Cross-border Trade', tier: 'STANDARD' as const, regulated: true, regBody: 'BaFin' },
  ];

  // Keep existing external clients from previous seed
  const existingClients = [
    { email: 'treasury@amina-bank.ch', company: 'AMINA Bank AG', country: 'Switzerland', city: 'Zug', countryCode: 'CH', industry: 'Digital Asset Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'FINMA' },
    { email: 'ops@dbs-digital.sg', company: 'DBS Digital Exchange', country: 'Singapore', city: 'Singapore', countryCode: 'SG', industry: 'Digital Asset Exchange', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'MAS' },
    { email: 'settlements@circle.com', company: 'Circle Internet Financial', country: 'United States', city: 'Boston', countryCode: 'US', industry: 'Stablecoin Issuance', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'NYDFS' },
    { email: 'ops@seba-bank.ch', company: 'SEBA Bank AG', country: 'Switzerland', city: 'Zug', countryCode: 'CH', industry: 'Digital Asset Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'FINMA' },
    { email: 'digital@hsbc.co.uk', company: 'HSBC Digital Assets', country: 'United Kingdom', city: 'London', countryCode: 'GB', industry: 'Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'FCA' },
    { email: 'ops@copper.co', company: 'Copper Technologies', country: 'United Kingdom', city: 'London', countryCode: 'GB', industry: 'Digital Asset Custody', tier: 'PREMIUM' as const, regulated: true, regBody: 'FCA' },
    { email: 'digital@emirates-nbd.ae', company: 'Emirates NBD Digital', country: 'United Arab Emirates', city: 'Dubai', countryCode: 'AE', industry: 'Banking', tier: 'ENTERPRISE' as const, regulated: true, regBody: 'DFSA' },
  ];

  const allExternal = [...dashboardClients, ...existingClients];
  for (const c of allExternal) {
    const wallet = walletFromSeed(c.email);
    await prisma.institutionClient.upsert({
      where: { email: c.email },
      create: {
        email: c.email, passwordHash, companyName: c.company,
        country: c.country, city: c.city, industry: c.industry,
        tier: c.tier, status: 'ACTIVE', kycStatus: 'VERIFIED',
        kybStatus: 'VERIFIED', kybVerifiedAt: daysAgo(120),
        riskRating: 'LOW', sanctionsStatus: 'CLEAR',
        isRegulatedEntity: c.regulated, regulatoryBody: c.regBody,
        isTestAccount: true, primaryWallet: wallet, settledWallets: [wallet],
      },
      update: { companyName: c.company, primaryWallet: wallet, settledWallets: [wallet] },
    });
  }
  console.log(`  ${allExternal.length} external clients seeded`);

  // ============================================================================
  // 6. Active Escrows (4 matching dashboard)
  // ============================================================================
  console.log('\nSeeding escrow records...');

  // Clean previous Helvetica data
  await prisma.institutionAuditLog.deleteMany({ where: { clientId: helvetica.id } });
  await prisma.institutionNotification.deleteMany({ where: { clientId: helvetica.id } });
  // Deposits cascade-delete with escrows (onDelete: Cascade)
  await prisma.institutionEscrow.deleteMany({ where: { clientId: helvetica.id } });
  await prisma.directPayment.deleteMany({ where: { clientId: helvetica.id } });

  const usdcMint = process.env.USDC_MINT_ADDRESS || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
  const helveticaWallet = helvetica.primaryWallet || 'HeLv3t1cAd1g1tALwA11etAddr355000000000001';

  // Lookup counterparty wallets
  const globalTrade = await prisma.institutionClient.findUnique({ where: { email: 'ops@globaltrade-industries.com' } });
  const pacificRim = await prisma.institutionClient.findUnique({ where: { email: 'ops@pacific-rim-exports.sg' } });
  const swissPrecision = await prisma.institutionClient.findUnique({ where: { email: 'finance@swiss-precision.ch' } });

  const escrows = [
    {
      escrowCode: 'esc-a1b2c3d4',
      corridor: 'CH-SG',
      amount: 2500000,
      status: 'FUNDED' as const,
      conditionType: 'ADMIN_RELEASE' as const,
      recipientWallet: globalTrade?.primaryWallet || walletFromSeed('globaltrade'),
      recipientName: 'GlobalTrade Industries',
      createdAt: hoursAgo(2),
      riskScore: 12,
    },
    {
      escrowCode: 'esc-e5f6a7b8',
      corridor: 'SG-JP',
      amount: 1800000,
      status: 'COMPLIANCE_HOLD' as const,
      conditionType: 'COMPLIANCE_CHECK' as const,
      recipientWallet: pacificRim?.primaryWallet || walletFromSeed('pacificrim'),
      recipientName: 'Pacific Rim Exports',
      createdAt: hoursAgo(5),
      riskScore: 42,
    },
    {
      escrowCode: 'esc-a3b4c5d6',
      corridor: 'GB-CH',
      amount: 4200000,
      status: 'CREATED' as const,
      conditionType: 'ADMIN_RELEASE' as const,
      recipientWallet: swissPrecision?.primaryWallet || walletFromSeed('swissprecision'),
      recipientName: 'Swiss Precision AG',
      createdAt: hoursAgo(9),
      riskScore: 8,
    },
    {
      escrowCode: 'esc-c1d2e3f4',
      corridor: 'AE-AE',
      amount: 1100000,
      status: 'RELEASING' as const,
      conditionType: 'ADMIN_RELEASE' as const,
      recipientWallet: globalTrade?.primaryWallet || walletFromSeed('globaltrade'),
      recipientName: 'GlobalTrade Industries',
      createdAt: daysAgo(1),
      riskScore: 18,
    },
  ];

  for (const e of escrows) {
    const escrowId = crypto.randomUUID();
    const feeBps = 20;
    const platformFee = (e.amount * feeBps) / 10000;

    await prisma.institutionEscrow.create({
      data: {
        escrowId,
        escrowCode: e.escrowCode,
        clientId: helvetica.id,
        payerWallet: helveticaWallet,
        recipientWallet: e.recipientWallet,
        usdcMint,
        amount: e.amount,
        platformFee,
        corridor: e.corridor,
        conditionType: e.conditionType,
        status: e.status,
        settlementAuthority: helveticaWallet,
        riskScore: e.riskScore,
        expiresAt: new Date(e.createdAt.getTime() + 72 * 60 * 60 * 1000),
        createdAt: e.createdAt,
        fundedAt: ['FUNDED', 'RELEASING'].includes(e.status) ? new Date(e.createdAt.getTime() + 30 * 60 * 1000) : undefined,
      },
    });

    // Audit log: creation
    await prisma.institutionAuditLog.create({
      data: {
        escrowId, clientId: helvetica.id,
        action: 'ESCROW_CREATED', actor: helvetica.email,
        details: { corridor: e.corridor, amount: e.amount, recipient: e.recipientName },
        createdAt: e.createdAt,
      },
    });

    // Audit log: funded
    if (['FUNDED', 'RELEASING'].includes(e.status)) {
      await prisma.institutionAuditLog.create({
        data: {
          escrowId, clientId: helvetica.id,
          action: 'DEPOSIT_CONFIRMED', actor: 'system',
          details: { amount: e.amount },
          createdAt: new Date(e.createdAt.getTime() + 30 * 60 * 1000),
        },
      });
    }

    // Audit log: compliance hold
    if (e.status === 'COMPLIANCE_HOLD') {
      await prisma.institutionAuditLog.create({
        data: {
          escrowId, clientId: helvetica.id,
          action: 'COMPLIANCE_REVIEW_REQUIRED', actor: 'system',
          details: { reason: 'Automated compliance check flagged for manual review', riskScore: e.riskScore },
          createdAt: new Date(e.createdAt.getTime() + 15 * 60 * 1000),
        },
      });
    }

    console.log(`  Escrow ${e.escrowCode} (${e.corridor}, $${e.amount.toLocaleString()}, ${e.status})`);
  }

  // ============================================================================
  // 7. Direct Payments (4 matching dashboard)
  // ============================================================================
  console.log('\nSeeding direct payments...');

  const eurolink = await prisma.institutionClient.findUnique({ where: { email: 'ops@eurolink-trading.de' } });

  const directPayments = [
    {
      paymentCode: 'dp-001',
      sender: 'Helvetica Digital',
      senderCountry: 'CH',
      senderWallet: helveticaWallet,
      recipient: 'Swiss Precision AG',
      recipientCountry: 'CH',
      recipientWallet: swissPrecision?.primaryWallet || walletFromSeed('swissprecision'),
      amount: 450000,
      currency: 'USDC',
      corridor: 'CH-CH',
      status: 'completed',
      createdAt: hoursAgo(18),
    },
    {
      paymentCode: 'dp-002',
      sender: 'Helvetica Digital',
      senderCountry: 'SG',
      senderWallet: helveticaWallet,
      recipient: 'Pacific Rim Exports',
      recipientCountry: 'JP',
      recipientWallet: pacificRim?.primaryWallet || walletFromSeed('pacificrim'),
      amount: 1200000,
      currency: 'USDC',
      corridor: 'SG-JP',
      status: 'completed',
      createdAt: hoursAgo(20),
    },
    {
      paymentCode: 'dp-003',
      sender: 'Helvetica Digital',
      senderCountry: 'US',
      senderWallet: helveticaWallet,
      recipient: 'Eurolink Trading GmbH',
      recipientCountry: 'DE',
      recipientWallet: eurolink?.primaryWallet || walletFromSeed('eurolink'),
      amount: 780000,
      currency: 'EURC',
      corridor: 'US-DE',
      status: 'completed',
      createdAt: daysAgo(1),
    },
    {
      paymentCode: 'dp-004',
      sender: 'Helvetica Digital',
      senderCountry: 'GB',
      senderWallet: helveticaWallet,
      recipient: 'GlobalTrade Industries',
      recipientCountry: 'SG',
      recipientWallet: globalTrade?.primaryWallet || walletFromSeed('globaltrade'),
      amount: 2100000,
      currency: 'USDC',
      corridor: 'GB-SG',
      status: 'pending',
      createdAt: minutesAgo(2),
    },
  ];

  for (const dp of directPayments) {
    const feeBps = 25;
    const platformFee = (dp.amount * feeBps) / 10000;
    const txHash = dp.status === 'completed' ? `sim_tx_${crypto.randomUUID().slice(0, 16)}` : null;
    const settledAt = dp.status === 'completed' ? new Date(dp.createdAt.getTime() + 10 * 60 * 1000) : null;

    // Delete any existing payment with this code (idempotent re-run)
    await prisma.directPayment.deleteMany({ where: { paymentCode: dp.paymentCode } });

    const payment = await prisma.directPayment.create({
      data: {
        clientId: helvetica.id,
        paymentCode: dp.paymentCode,
        sender: dp.sender,
        senderCountry: dp.senderCountry,
        senderWallet: dp.senderWallet,
        recipient: dp.recipient,
        recipientCountry: dp.recipientCountry,
        recipientWallet: dp.recipientWallet,
        amount: dp.amount,
        currency: dp.currency,
        corridor: dp.corridor,
        status: dp.status,
        platformFee,
        riskScore: Math.floor(Math.random() * 20) + 5,
        txHash,
        settledAt,
        createdAt: dp.createdAt,
      },
    });

    // Audit log
    await prisma.institutionAuditLog.create({
      data: {
        clientId: helvetica.id,
        action: 'DIRECT_PAYMENT_CREATED',
        actor: helvetica.email,
        details: { paymentId: payment.id, corridor: dp.corridor, amount: dp.amount, currency: dp.currency, recipient: dp.recipient },
        createdAt: dp.createdAt,
      },
    });

    if (dp.status === 'completed') {
      await prisma.institutionAuditLog.create({
        data: {
          clientId: helvetica.id,
          action: 'DIRECT_PAYMENT_COMPLETED',
          actor: 'system',
          details: { paymentId: payment.id, txHash, settledAt },
          createdAt: settledAt || dp.createdAt,
        },
      });
    }

    console.log(`  ${dp.sender} -> ${dp.recipient} ($${dp.amount.toLocaleString()} ${dp.currency}, ${dp.status})`);
  }

  // ============================================================================
  // 8. Notifications (pending actions)
  // ============================================================================
  console.log('\nSeeding notifications...');

  const notifications = [
    {
      type: 'COMPLIANCE_REVIEW_REQUIRED' as const,
      priority: 'HIGH' as const,
      title: 'Pacific Rim Exports — compliance review required',
      message: '1,800,000 USDC escrow on SG-JP corridor flagged for compliance review. Risk score: 42.',
      metadata: { escrowCode: 'esc-e5f6a7b8', corridor: 'SG-JP', amount: 1800000 },
      createdAt: hoursAgo(1),
    },
    {
      type: 'ESCROW_CREATED' as const,
      priority: 'MEDIUM' as const,
      title: 'Swiss Precision AG — awaiting funding',
      message: '4,200,000 USDC escrow on GB-CH corridor created and awaiting deposit.',
      metadata: { escrowCode: 'esc-a3b4c5d6', corridor: 'GB-CH', amount: 4200000 },
      createdAt: hoursAgo(9),
    },
    {
      type: 'SETTLEMENT_COMPLETE' as const,
      priority: 'MEDIUM' as const,
      title: 'GlobalTrade Industries — releasing funds',
      message: '1,100,000 USDC escrow on AE-AE corridor is releasing funds to recipient.',
      metadata: { escrowCode: 'esc-c1d2e3f4', corridor: 'AE-AE', amount: 1100000 },
      createdAt: daysAgo(1),
    },
  ];

  for (const n of notifications) {
    await prisma.institutionNotification.create({
      data: {
        clientId: helvetica.id,
        type: n.type,
        priority: n.priority,
        title: n.title,
        message: n.message,
        metadata: n.metadata,
        createdAt: n.createdAt,
      },
    });
    console.log(`  ${n.title}`);
  }

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\nInstitution portal seed data complete!');
  console.log(`  Login: ops@helvetica-digital.ch / HelveticaDemo2026!`);
  console.log(`  Branches: ${branchData.length} (incl. RU sanctioned)`);
  console.log(`  Accounts: ${accountData.length}`);
  console.log(`  Escrows: ${escrows.length} active`);
  console.log(`  Direct Payments: ${directPayments.length}`);
  console.log(`  Corridors: ${Object.keys(corridorConfigs).length}`);
  console.log(`  Notifications: ${notifications.length}`);
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
