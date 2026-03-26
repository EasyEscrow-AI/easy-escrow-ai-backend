/**
 * Seed Optimus Exchange AG — Comprehensive Staging Demo Data (v2 — 2026-03-26)
 *
 * Creates a complete demo dataset for the "Optimus Exchange AG" institution:
 *   1. Institution client (Optimus Exchange AG)
 *   2. Five branches (CH, US, SG, GB, AE)
 *   3. Seven accounts linked to branches
 *   4. Eleven counterparty clients
 *   5. Twelve escrows across multiple statuses
 *   6. Six direct payments
 *   7. Twenty audit log entries
 *   8. Twelve payment corridors
 *   9. Three approved tokens (USDC, USDT, EURC)
 *  10. Seven institution wallets
 *  11. Institution deposits for funded escrows
 *  12. AI compliance analyses for funded/hold/released escrows
 *  13. Fifteen in-app notifications
 *
 * Usage:
 *   npx ts-node scripts/seed-optimus-exchange.ts
 *
 * Idempotent: uses upsert and skipDuplicates throughout.
 */

import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { Keypair } from '@solana/web3.js';

const prisma = new PrismaClient();

const SEED_VERSION = 'optimus-v2';
const SEED_MARKER_ACTION = 'OPTIMUS_EXCHANGE_SEED';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a real devnet wallet if mapped, otherwise derives a deterministic Ed25519 address */
function fakeWallet(seed: string): string {
  if (REAL_WALLETS[seed]) return REAL_WALLETS[seed];
  const hash = createHash('sha256').update(seed).digest();
  return Keypair.fromSeed(hash).publicKey.toBase58();
}

/** Deterministic fake tx signature (base58, 88 chars) */
function fakeTxSig(seed: string): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let hash = 0;
  for (const ch of seed) hash = ((hash << 7) - hash + ch.charCodeAt(0)) | 0;
  let out = '';
  for (let i = 0; i < 88; i++) {
    hash = ((hash << 7) - hash + i) | 0;
    out += chars[Math.abs(hash) % chars.length];
  }
  return out;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3600000);
}

function hoursFromNow(n: number): Date {
  return new Date(Date.now() + n * 3600000);
}

/** Deterministic UUID from a seed string (v4-format, content derived from SHA-256) */
function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  // Format as UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

// Staging USDC mint
const USDC_MINT = process.env.USDC_MINT_ADDRESS || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // devnet USDC default

// Real devnet wallets with USDC balances (for realistic balance display)
// Source: largest USDC token holders on devnet, resolved via getTokenLargestAccounts
const REAL_WALLETS: Record<string, string> = {
  // Optimus Exchange accounts
  'optimus-primary':       'DBD8hAwLDRQkTsu6EqviaYNGKPnsAMmQonxf7AH8ZcFY',
  'optimus-ch-treasury':   'E1bQJ8eMMn3zmeSewW3HQ8zmJr7KR75JonbwAtWx2bux',
  'optimus-ch-settlement': '7wgr184vtmpXpXLoijuvNGznpSsdFUguRQKtxV6eMAJt',
  'optimus-us-treasury':   'HzcTrHjkEhjFTHEsC6Dsv8DXCh21WgujD4s5M15Sm94g',
  'optimus-us-ops':        '9RDLNDCUsr3BrwaMyKUGeKDtWFSdKk7FtVesSauBVphc',
  'optimus-sg-treasury':   'FbafJHTK139tKFoaHiyDQZKCiuQQGUT7n5zoWTPvsw7d',
  'optimus-gb-settlement': '3Qp3e2oBhq68a2JaKdooQKGffYwZ3KcCAwedgZ6Z329m',
  'optimus-ae-ops':        '9XHMRErX7kEeB3hgbNG18p1phNp6Ea3zwzKxVT3L914i',
  // Counterparty clients
  'globaltrade-sg':        'HMG8N4y5thAb2Szn5h8pBYpMJKpxTMwzkhfC3qT8waqv',
  'pacificrim-exports-sg': 'B9fmi8FKQiL4ConStaro2tZDD3V3vkVrXEwZJM5GsCwT',
  'eurolink-de':           '8a9boee9Mry1Kgbp5dbdVca3FmCWgTY7Q25u8Apt6H3i',
  'swiss-precision-ch':    'H2knp7o4asKD79eo1PSPAFcahqAXgk6eQUkCcmAExXFU',
  'med-logistics-it':      '6B9tFQfQEDBmC6kpj77cUJ5roqyEJBcUZ4gbRUqXwjaj',
  'tokyo-digital-jp':      '2xuXUonVks6zJFXH6D62nnLT5VRt8NLQ96c2xUnwdnKf',
  'londonbridge-gb':       '2vcbNe6R2nf9RN2Cfo3cwEH9GroyCaTSEVkymQ1mAprf',
  'gulftrade-ae':          '6EbhsCu7nDMRYGNXkBNBtcx1gubjrUfR8aQ2ZfPzg2Ur',
  'nordic-se':             'H3sjyipQtXAJkvWNkXhDgped7k323kAba8QMwCLcV79w',
  'sahara-ng':             'va1yPZsd2qieP5pE6gtxvAHkHKEW3qmtoZy3oN1GcBX',
  'moscow-ru':             'CkUW7dZtrpdTAw72fsxQqFJ6YE74v7479uBwYXpfBBsB',
};

// ---------------------------------------------------------------------------
// Main seeder
// ---------------------------------------------------------------------------

async function restore() {
  console.log('=== Restoring: Removing Optimus Exchange seed data ===\n');

  const marker = await prisma.institutionAuditLog.findFirst({
    where: { action: SEED_MARKER_ACTION },
    orderBy: { createdAt: 'desc' },
  });
  if (!marker) {
    console.log('No seed marker found — nothing to restore.');
    return;
  }
  const details = marker.details as any;
  const optimusId = details?.clientId as string;
  const seededAt = details?.seededAt as string;
  console.log(`Found seed marker: version=${details?.version}, seeded at ${seededAt}`);
  console.log(`Client ID: ${optimusId}\n`);

  // Delete in reverse dependency order
  const notifDel = await prisma.institutionNotification.deleteMany({ where: { clientId: optimusId } });
  console.log(`   Deleted ${notifDel.count} notifications`);

  const auditDel = await prisma.institutionAuditLog.deleteMany({ where: { clientId: optimusId } });
  console.log(`   Deleted ${auditDel.count} audit logs`);

  const aiDel = await prisma.institutionAiAnalysis.deleteMany({ where: { clientId: optimusId } });
  console.log(`   Deleted ${aiDel.count} AI analyses`);

  const paymentDel = await prisma.directPayment.deleteMany({ where: { clientId: optimusId } });
  console.log(`   Deleted ${paymentDel.count} direct payments`);

  const depositDel = await prisma.institutionDeposit.deleteMany({
    where: { escrow: { clientId: optimusId } },
  });
  console.log(`   Deleted ${depositDel.count} deposits`);

  const escrowDel = await prisma.institutionEscrow.deleteMany({ where: { clientId: optimusId } });
  console.log(`   Deleted ${escrowDel.count} escrows`);

  const walletDel = await prisma.institutionWallet.deleteMany({ where: { clientId: optimusId } });
  console.log(`   Deleted ${walletDel.count} wallets`);

  const accountDel = await prisma.institutionAccount.deleteMany({ where: { clientId: optimusId } });
  console.log(`   Deleted ${accountDel.count} accounts`);

  const branchDel = await prisma.institutionBranch.deleteMany({ where: { clientId: optimusId } });
  console.log(`   Deleted ${branchDel.count} branches`);

  // Delete counterparty clients seeded by this script (tagged by audit log)
  const counterpartyIds = details?.counterpartyIds as string[] | undefined;
  if (counterpartyIds && counterpartyIds.length > 0) {
    // Clean up counterparty audit logs, escrows, etc. first
    await prisma.institutionAuditLog.deleteMany({ where: { clientId: { in: counterpartyIds } } });
    const cpDel = await prisma.institutionClient.deleteMany({ where: { id: { in: counterpartyIds } } });
    console.log(`   Deleted ${cpDel.count} counterparty clients`);
  }

  // Delete the institution itself
  await prisma.institutionClient.deleteMany({ where: { id: optimusId } });
  console.log(`   Deleted Optimus Exchange AG (${optimusId})`);

  console.log('\n=== Restore complete ===');
}

async function main() {
  // Handle --restore flag
  if (process.argv.includes('--restore')) {
    await restore();
    return;
  }

  console.log('=== Optimus Exchange AG — Staging Demo Seeder ===\n');

  const demoPassword = await bcrypt.hash('StagingPass123!', 12);

  // ═══════════════════════════════════════════════════════════════════════
  // 1. CORRIDORS
  // ═══════════════════════════════════════════════════════════════════════

  console.log('1. Seeding corridors...');

  const corridorDefs = [
    { code: 'CH-SG', sourceCountry: 'CH', destCountry: 'SG', name: 'Switzerland to Singapore', compliance: 'FINMA + MAS', riskLevel: 'LOW', minAmount: 100, maxAmount: 5_000_000, dailyLimit: 20_000_000, monthlyLimit: 100_000_000, requiredDocuments: ['INVOICE', 'CONTRACT'] },
    { code: 'SG-JP', sourceCountry: 'SG', destCountry: 'JP', name: 'Singapore to Japan', compliance: 'MAS + FSA', riskLevel: 'LOW', minAmount: 100, maxAmount: 3_000_000, dailyLimit: 15_000_000, monthlyLimit: 80_000_000, requiredDocuments: ['INVOICE'] },
    { code: 'US-DE', sourceCountry: 'US', destCountry: 'DE', name: 'United States to Germany', compliance: 'FinCEN + BaFin', riskLevel: 'MEDIUM', minAmount: 200, maxAmount: 2_000_000, dailyLimit: 10_000_000, monthlyLimit: 50_000_000, requiredDocuments: ['INVOICE', 'CONTRACT'] },
    { code: 'GB-CH', sourceCountry: 'GB', destCountry: 'CH', name: 'United Kingdom to Switzerland', compliance: 'FCA + FINMA', riskLevel: 'LOW', minAmount: 100, maxAmount: 5_000_000, dailyLimit: 25_000_000, monthlyLimit: 120_000_000, requiredDocuments: ['INVOICE'] },
    { code: 'CH-IT', sourceCountry: 'CH', destCountry: 'IT', name: 'Switzerland to Italy', compliance: 'FINMA + CONSOB', riskLevel: 'MEDIUM', minAmount: 100, maxAmount: 2_000_000, dailyLimit: 8_000_000, monthlyLimit: 40_000_000, requiredDocuments: ['INVOICE', 'SHIPPING_DOC'] },
    { code: 'AE-AE', sourceCountry: 'AE', destCountry: 'AE', name: 'UAE Domestic', compliance: 'DFSA', riskLevel: 'LOW', minAmount: 50, maxAmount: 5_000_000, dailyLimit: 20_000_000, monthlyLimit: 100_000_000, requiredDocuments: ['INVOICE'] },
    { code: 'SG-CN', sourceCountry: 'SG', destCountry: 'CN', name: 'Singapore to China', compliance: 'MAS + PBOC', riskLevel: 'HIGH', minAmount: 500, maxAmount: 1_000_000, dailyLimit: 5_000_000, monthlyLimit: 25_000_000, requiredDocuments: ['INVOICE', 'CONTRACT', 'LETTER_OF_CREDIT'] },
    { code: 'US-CH', sourceCountry: 'US', destCountry: 'CH', name: 'United States to Switzerland', compliance: 'FinCEN + FINMA', riskLevel: 'LOW', minAmount: 100, maxAmount: 5_000_000, dailyLimit: 20_000_000, monthlyLimit: 100_000_000, requiredDocuments: ['INVOICE', 'CONTRACT'] },
    { code: 'CH-CH', sourceCountry: 'CH', destCountry: 'CH', name: 'Switzerland Domestic', compliance: 'FINMA', riskLevel: 'LOW', minAmount: 50, maxAmount: 10_000_000, dailyLimit: 50_000_000, monthlyLimit: 200_000_000, requiredDocuments: ['INVOICE'] },
    { code: 'GB-HK', sourceCountry: 'GB', destCountry: 'HK', name: 'United Kingdom to Hong Kong', compliance: 'FCA + SFC', riskLevel: 'MEDIUM', minAmount: 200, maxAmount: 3_000_000, dailyLimit: 15_000_000, monthlyLimit: 75_000_000, requiredDocuments: ['INVOICE', 'CONTRACT'] },
    { code: 'US-GB', sourceCountry: 'US', destCountry: 'GB', name: 'United States to United Kingdom', compliance: 'FinCEN + FCA', riskLevel: 'LOW', minAmount: 100, maxAmount: 5_000_000, dailyLimit: 25_000_000, monthlyLimit: 120_000_000, requiredDocuments: ['INVOICE'] },
    { code: 'AE-SG', sourceCountry: 'AE', destCountry: 'SG', name: 'UAE to Singapore', compliance: 'DFSA + MAS', riskLevel: 'MEDIUM', minAmount: 200, maxAmount: 3_000_000, dailyLimit: 12_000_000, monthlyLimit: 60_000_000, requiredDocuments: ['INVOICE', 'CONTRACT'] },
  ];

  for (const c of corridorDefs) {
    await prisma.institutionCorridor.upsert({
      where: { code: c.code },
      create: c,
      update: {
        name: c.name,
        compliance: c.compliance,
        riskLevel: c.riskLevel,
        minAmount: c.minAmount,
        maxAmount: c.maxAmount,
        dailyLimit: c.dailyLimit,
        monthlyLimit: c.monthlyLimit,
        requiredDocuments: c.requiredDocuments,
      },
    });
    console.log(`   [OK] Corridor ${c.code} (${c.riskLevel})`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. INSTITUTION — Optimus Exchange AG
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n2. Upserting Optimus Exchange AG...');

  const optimusData = {
    email: 'ops@optimus-exchange.ch',
    passwordHash: demoPassword,
    companyName: 'Optimus Exchange AG',
    tier: 'ENTERPRISE' as const,
    status: 'ACTIVE' as const,
    kycStatus: 'VERIFIED',
    jurisdiction: 'CH',
    primaryWallet: fakeWallet('optimus-primary'),
    isTestAccount: true,
    // Legal entity
    legalName: 'Optimus Exchange AG',
    tradingName: 'Zurich Branch',
    registrationNumber: 'CHE-456.789.012',
    registrationCountry: 'CH',
    entityType: 'CORPORATION' as const,
    lei: '529900ABCDEF1234GHIJ',
    taxId: 'CHE-456.789.012 MWST',
    taxCountry: 'CH',
    // Address
    addressLine1: 'Limmatquai 112',
    city: 'Zurich',
    state: 'ZH',
    postalCode: '8001',
    country: 'CH',
    // Contact
    contactFirstName: 'Markus',
    contactLastName: 'Richter',
    contactEmail: 'markus.richter@optimus-exchange.ch',
    contactPhone: '+41-44-800-1234',
    contactTitle: 'Head of Operations',
    // Compliance
    kybStatus: 'VERIFIED' as const,
    kybVerifiedAt: daysAgo(60),
    kybExpiresAt: hoursFromNow(24 * 305),
    riskRating: 'LOW' as const,
    sanctionsStatus: 'CLEAR' as const,
    sourceOfFunds: 'Institutional Trading',
    // Regulatory
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED' as const,
    licenseType: 'Banking & Securities Dealer License',
    licenseNumber: 'FINMA-2020-EX-0156',
    regulatoryBody: 'FINMA',
    // Business
    industry: 'Digital Asset Exchange',
    websiteUrl: 'https://optimus-exchange.example.ch',
    businessDescription: 'FINMA-regulated digital asset exchange providing cross-border institutional trading, custody, and settlement services across 12+ corridors',
    yearEstablished: 2020,
    employeeCountRange: 'RANGE_201_500' as const,
    annualRevenueRange: 'RANGE_100M_500M' as const,
    expectedMonthlyVolume: 50_000_000,
    purposeOfAccount: 'Cross-border USDC settlement for institutional exchange operations',
    // Crypto
    walletCustodyType: 'MPC' as const,
    custodianName: 'Fireblocks',
    preferredSettlementChain: 'solana',
    // Account management
    accountManagerName: 'David Chen',
    accountManagerEmail: 'david.chen@easyescrow.example',
    referralSource: 'Crypto Valley Association',
  };

  const optimus = await prisma.institutionClient.upsert({
    where: { email: 'ops@optimus-exchange.ch' },
    create: optimusData,
    update: optimusData,
  });
  const optimusId = optimus.id;
  console.log(`   [OK] Optimus Exchange AG (id: ${optimusId})`);

  // ═══════════════════════════════════════════════════════════════════════
  // 3. BRANCHES
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n3. Seeding branches...');

  const branchDefs = [
    {
      name: 'Zurich Branch HQ',
      city: 'Zurich',
      country: 'Switzerland',
      countryCode: 'CH',
      address: 'Limmatquai 112, 8001 Zurich',
      timezone: 'Europe/Zurich',
      riskScore: 5,
      complianceStatus: 'COMPLIANT',
      regulatoryBody: 'FINMA',
    },
    {
      name: 'NY Americas',
      city: 'New York',
      country: 'United States',
      countryCode: 'US',
      address: '1 Liberty Plaza, Floor 30, New York, NY 10006',
      timezone: 'America/New_York',
      riskScore: 10,
      complianceStatus: 'ACTIVE',
      regulatoryBody: 'FinCEN',
    },
    {
      name: 'Singapore APAC',
      city: 'Singapore',
      country: 'Singapore',
      countryCode: 'SG',
      address: '1 Raffles Place, #44-01, One Raffles Place, Singapore 048616',
      timezone: 'Asia/Singapore',
      riskScore: 8,
      complianceStatus: 'ACTIVE',
      regulatoryBody: 'MAS',
    },
    {
      name: 'London Trading',
      city: 'London',
      country: 'United Kingdom',
      countryCode: 'GB',
      address: '25 Old Broad Street, London EC2N 1HQ',
      timezone: 'Europe/London',
      riskScore: 7,
      complianceStatus: 'ACTIVE',
      regulatoryBody: 'FCA',
    },
    {
      name: 'Dubai MENA',
      city: 'Dubai',
      country: 'United Arab Emirates',
      countryCode: 'AE',
      address: 'Gate Village, Building 5, DIFC, Dubai',
      timezone: 'Asia/Dubai',
      riskScore: 20,
      complianceStatus: 'UNDER_REVIEW',
      regulatoryBody: 'DFSA',
    },
  ];

  // Branch map: countryCode -> branchId
  const branchMap = new Map<string, string>();

  for (const b of branchDefs) {
    // Find existing by clientId + name
    const existing = await prisma.institutionBranch.findFirst({
      where: { clientId: optimusId, name: b.name },
    });

    let branch;
    if (existing) {
      branch = await prisma.institutionBranch.update({
        where: { id: existing.id },
        data: {
          city: b.city,
          country: b.country,
          countryCode: b.countryCode,
          address: b.address,
          timezone: b.timezone,
          riskScore: b.riskScore,
          complianceStatus: b.complianceStatus,
          regulatoryBody: b.regulatoryBody,
          isActive: true,
        },
      });
    } else {
      branch = await prisma.institutionBranch.create({
        data: {
          clientId: optimusId,
          name: b.name,
          city: b.city,
          country: b.country,
          countryCode: b.countryCode,
          address: b.address,
          timezone: b.timezone,
          riskScore: b.riskScore,
          complianceStatus: b.complianceStatus,
          regulatoryBody: b.regulatoryBody,
          isActive: true,
        },
      });
    }

    branchMap.set(b.countryCode, branch.id);
    console.log(`   [OK] ${b.name} (${b.countryCode}) — ${b.complianceStatus}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. ACCOUNTS (linked to branches)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n4. Seeding accounts...');

  const accountDefs = [
    {
      name: 'Main Treasury',
      label: 'Main Treasury',
      accountType: 'TREASURY' as const,
      walletSeed: 'optimus-ch-treasury',
      branchCountryCode: 'CH',
      isDefault: true,
      description: 'Primary treasury account for Zurich Branch HQ',
      walletProvider: 'Fireblocks',
      custodyType: 'MPC' as const,
      maxTransactionAmount: 10_000_000,
      dailyVolumeLimit: 50_000_000,
      approvalMode: 'MULTI_APPROVAL' as const,
    },
    {
      name: 'FINMA Settlement',
      label: 'FINMA Settlement',
      accountType: 'SETTLEMENT' as const,
      walletSeed: 'optimus-ch-settlement',
      branchCountryCode: 'CH',
      isDefault: false,
      description: 'FINMA-regulated settlement account',
      walletProvider: 'Self-Custody',
      custodyType: 'SELF_CUSTODY' as const,
      maxTransactionAmount: 5_000_000,
      dailyVolumeLimit: 20_000_000,
      approvalMode: 'MULTI_APPROVAL' as const,
    },
    {
      name: 'Americas Treasury',
      label: 'Americas Treasury',
      accountType: 'TREASURY' as const,
      walletSeed: 'optimus-us-treasury-main',
      branchCountryCode: 'US',
      isDefault: false,
      description: 'Primary treasury for NY Americas branch',
      walletProvider: 'Fireblocks',
      custodyType: 'MPC' as const,
      maxTransactionAmount: 5_000_000,
      dailyVolumeLimit: 25_000_000,
      approvalMode: 'MULTI_APPROVAL' as const,
    },
    {
      name: 'Americas Operations',
      label: 'Americas Operations',
      accountType: 'OPERATIONS' as const,
      walletSeed: 'optimus-us-ops-main',
      branchCountryCode: 'US',
      isDefault: false,
      description: 'Day-to-day operations for US branch',
      walletProvider: 'Self-Custody',
      custodyType: 'SELF_CUSTODY' as const,
      maxTransactionAmount: 500_000,
      dailyVolumeLimit: 2_000_000,
      approvalMode: 'SINGLE_APPROVAL' as const,
    },
    {
      name: 'APAC Treasury',
      label: 'APAC Treasury',
      accountType: 'TREASURY' as const,
      walletSeed: 'optimus-sg-treasury-main',
      branchCountryCode: 'SG',
      isDefault: false,
      description: 'Primary treasury for Singapore APAC branch',
      walletProvider: 'Fireblocks',
      custodyType: 'MPC' as const,
      maxTransactionAmount: 5_000_000,
      dailyVolumeLimit: 20_000_000,
      approvalMode: 'MULTI_APPROVAL' as const,
    },
    {
      name: 'London Settlement',
      label: 'London Settlement',
      accountType: 'SETTLEMENT' as const,
      walletSeed: 'optimus-gb-settlement-main',
      branchCountryCode: 'GB',
      isDefault: false,
      description: 'FCA-regulated settlement for London Trading branch',
      walletProvider: 'BitGo',
      custodyType: 'THIRD_PARTY' as const,
      maxTransactionAmount: 5_000_000,
      dailyVolumeLimit: 25_000_000,
      approvalMode: 'MULTI_APPROVAL' as const,
    },
    {
      name: 'Dubai Operations',
      label: 'Dubai Operations',
      accountType: 'OPERATIONS' as const,
      walletSeed: 'optimus-ae-ops-main',
      branchCountryCode: 'AE',
      isDefault: false,
      description: 'Operations account for Dubai MENA branch',
      walletProvider: 'Self-Custody',
      custodyType: 'SELF_CUSTODY' as const,
      maxTransactionAmount: 2_000_000,
      dailyVolumeLimit: 8_000_000,
      approvalMode: 'SINGLE_APPROVAL' as const,
    },
  ];

  // Account map: name -> walletAddress (for escrow assignment)
  const accountWalletMap = new Map<string, string>();

  for (const a of accountDefs) {
    const walletAddress = fakeWallet(a.walletSeed);
    const branchId = branchMap.get(a.branchCountryCode) || null;

    const data = {
      clientId: optimusId,
      name: a.name,
      label: a.label,
      accountType: a.accountType,
      walletAddress,
      walletProvider: a.walletProvider,
      custodyType: a.custodyType,
      verificationStatus: 'VERIFIED' as const,
      verifiedAt: daysAgo(30),
      maxTransactionAmount: a.maxTransactionAmount,
      dailyVolumeLimit: a.dailyVolumeLimit,
      approvalMode: a.approvalMode,
      description: a.description,
      isDefault: a.isDefault,
      isActive: true,
      branchId,
    };

    await prisma.institutionAccount.upsert({
      where: { clientId_name: { clientId: optimusId, name: a.name } },
      create: data,
      update: {
        label: data.label,
        accountType: data.accountType,
        walletAddress: data.walletAddress,
        walletProvider: data.walletProvider,
        custodyType: data.custodyType,
        verificationStatus: data.verificationStatus,
        verifiedAt: data.verifiedAt,
        maxTransactionAmount: data.maxTransactionAmount,
        dailyVolumeLimit: data.dailyVolumeLimit,
        approvalMode: data.approvalMode,
        description: data.description,
        isDefault: data.isDefault,
        isActive: data.isActive,
        branchId: data.branchId,
      },
    });

    accountWalletMap.set(a.name, walletAddress);
    console.log(`   [OK] ${a.name} (${a.accountType}, ${a.branchCountryCode}) — ${a.walletProvider}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. COUNTERPARTY CLIENTS
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n5. Seeding counterparty clients...');

  const counterpartyDefs = [
    {
      email: 'ops@globaltrade-industries.sg',
      companyName: 'GlobalTrade Industries',
      legalName: 'GlobalTrade Industries Pte Ltd',
      jurisdiction: 'SG',
      country: 'SG',
      city: 'Singapore',
      industry: 'Trading',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'globaltrade-sg',
      addressLine1: '80 Robinson Road, #15-01',
      postalCode: '068898',
      contactFirstName: 'Wei',
      contactLastName: 'Lim',
      contactEmail: 'wei.lim@globaltrade-industries.sg',
      contactPhone: '+65-6555-1001',
      contactTitle: 'Head of Treasury',
      entityType: 'CORPORATION' as const,
      registrationNumber: '202301234A',
      registrationCountry: 'SG',
      yearEstablished: 2020,
    },
    {
      email: 'finance@pacificrim-exports-sg.com',
      companyName: 'Pacific Rim Exports',
      legalName: 'Pacific Rim Exports Pte Ltd',
      jurisdiction: 'SG',
      country: 'SG',
      city: 'Singapore',
      industry: 'Logistics',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'pacificrim-exports-sg',
      addressLine1: '10 Collyer Quay, #40-01',
      postalCode: '049315',
      contactFirstName: 'Priya',
      contactLastName: 'Nair',
      contactEmail: 'priya.nair@pacificrim-exports-sg.com',
      contactPhone: '+65-6555-1002',
      contactTitle: 'CFO',
      entityType: 'CORPORATION' as const,
      registrationNumber: '201998765Z',
      registrationCountry: 'SG',
      yearEstablished: 2018,
    },
    {
      email: 'treasury@eurolink-trading.de',
      companyName: 'Eurolink Trading GmbH',
      legalName: 'Eurolink Trading GmbH',
      jurisdiction: 'DE',
      country: 'DE',
      city: 'Frankfurt',
      industry: 'Import/Export',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'eurolink-de',
      addressLine1: 'Mainzer Landstrasse 46',
      postalCode: '60325',
      contactFirstName: 'Klaus',
      contactLastName: 'Weber',
      contactEmail: 'klaus.weber@eurolink-trading.de',
      contactPhone: '+49-69-555-1003',
      contactTitle: 'Managing Director',
      entityType: 'LLC' as const,
      registrationNumber: 'HRB-987654',
      registrationCountry: 'DE',
      yearEstablished: 2015,
    },
    {
      email: 'ops@swiss-precision.ch',
      companyName: 'Swiss Precision AG',
      legalName: 'Swiss Precision AG',
      jurisdiction: 'CH',
      country: 'CH',
      city: 'Basel',
      industry: 'Manufacturing',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'swiss-precision-ch',
      addressLine1: 'Steinenvorstadt 5',
      postalCode: '4051',
      contactFirstName: 'Anna',
      contactLastName: 'Frei',
      contactEmail: 'anna.frei@swiss-precision.ch',
      contactPhone: '+41-61-555-1004',
      contactTitle: 'Finance Director',
      entityType: 'CORPORATION' as const,
      registrationNumber: 'CHE-111.333.555',
      registrationCountry: 'CH',
      yearEstablished: 2005,
    },
    {
      email: 'finance@med-logistics.it',
      companyName: 'Mediterranean Logistics',
      legalName: 'Mediterranean Logistics S.r.l.',
      jurisdiction: 'IT',
      country: 'IT',
      city: 'Milan',
      industry: 'Shipping',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'med-logistics-it',
      addressLine1: 'Via Monte Napoleone 8',
      postalCode: '20121',
      contactFirstName: 'Marco',
      contactLastName: 'Rossi',
      contactEmail: 'marco.rossi@med-logistics.it',
      contactPhone: '+39-02-555-1005',
      contactTitle: 'Head of Finance',
      entityType: 'LLC' as const,
      registrationNumber: 'MI-2020-567890',
      registrationCountry: 'IT',
      yearEstablished: 2012,
    },
    {
      email: 'treasury@tokyo-digital.jp',
      companyName: 'Tokyo Digital Assets',
      legalName: 'Tokyo Digital Assets K.K.',
      jurisdiction: 'JP',
      country: 'JP',
      city: 'Tokyo',
      industry: 'Fintech',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'tokyo-digital-jp',
      addressLine1: '1-1 Marunouchi, Chiyoda-ku',
      postalCode: '100-0005',
      contactFirstName: 'Yuki',
      contactLastName: 'Tanaka',
      contactEmail: 'yuki.tanaka@tokyo-digital.jp',
      contactPhone: '+81-3-555-1006',
      contactTitle: 'Director of Digital Assets',
      entityType: 'CORPORATION' as const,
      registrationNumber: 'JP-0100-01-123456',
      registrationCountry: 'JP',
      yearEstablished: 2021,
    },
    {
      email: 'ops@londonbridge-capital.co.uk',
      companyName: 'London Bridge Capital',
      legalName: 'London Bridge Capital Ltd',
      jurisdiction: 'GB',
      country: 'GB',
      city: 'London',
      industry: 'Asset Management',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'londonbridge-gb',
      addressLine1: '10 Paternoster Square',
      postalCode: 'EC4M 7LS',
      contactFirstName: 'James',
      contactLastName: 'Harrington',
      contactEmail: 'james.harrington@londonbridge-capital.co.uk',
      contactPhone: '+44-20-555-1007',
      contactTitle: 'Portfolio Manager',
      entityType: 'CORPORATION' as const,
      registrationNumber: 'UK-09876543',
      registrationCountry: 'GB',
      yearEstablished: 2017,
    },
    {
      email: 'finance@gulftrade-corp.ae',
      companyName: 'Gulf Trade Corp',
      legalName: 'Gulf Trade Corp FZE',
      jurisdiction: 'AE',
      country: 'AE',
      city: 'Dubai',
      industry: 'Commodities',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'gulftrade-ae',
      addressLine1: 'Gate Village, Building 3, DIFC',
      postalCode: '507222',
      contactFirstName: 'Khalid',
      contactLastName: 'Al-Rashid',
      contactEmail: 'khalid.alrashid@gulftrade-corp.ae',
      contactPhone: '+971-4-555-1008',
      contactTitle: 'CEO',
      entityType: 'CORPORATION' as const,
      registrationNumber: 'DIFC-2019-0456',
      registrationCountry: 'AE',
      yearEstablished: 2019,
    },
    {
      email: 'admin@nordic-systems.se',
      companyName: 'Nordic Systems AB',
      legalName: 'Nordic Systems AB',
      jurisdiction: 'SE',
      country: 'SE',
      city: 'Stockholm',
      industry: 'Technology',
      kycStatus: 'PENDING',
      status: 'PENDING_VERIFICATION' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'nordic-se',
      addressLine1: 'Stureplan 4C',
      postalCode: '114 35',
      contactFirstName: 'Erik',
      contactLastName: 'Lindqvist',
      contactEmail: 'erik.lindqvist@nordic-systems.se',
      contactPhone: '+46-8-555-1009',
      contactTitle: 'CTO',
      entityType: 'CORPORATION' as const,
      registrationNumber: 'SE-556789-0123',
      registrationCountry: 'SE',
      yearEstablished: 2022,
    },
    {
      email: 'ops@sahara-resources.ng',
      companyName: 'Sahara Resources Ltd',
      legalName: 'Sahara Resources Ltd',
      jurisdiction: 'NG',
      country: 'NG',
      city: 'Lagos',
      industry: 'Energy',
      kycStatus: 'PENDING',
      status: 'PENDING_VERIFICATION' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'sahara-ng',
      addressLine1: '12 Akin Adesola Street, Victoria Island',
      postalCode: '101241',
      contactFirstName: 'Chidi',
      contactLastName: 'Okonkwo',
      contactEmail: 'chidi.okonkwo@sahara-resources.ng',
      contactPhone: '+234-1-555-1010',
      contactTitle: 'Head of Finance',
      entityType: 'CORPORATION' as const,
      registrationNumber: 'RC-1234567',
      registrationCountry: 'NG',
      yearEstablished: 2016,
    },
    {
      email: 'finance@satoshi-bridge.io',
      companyName: 'Satoshi Bridge Labs Inc',
      legalName: 'Satoshi Bridge Labs Inc',
      jurisdiction: 'US',
      country: 'US',
      city: 'San Francisco',
      industry: 'Fintech',
      kycStatus: 'VERIFIED',
      status: 'ACTIVE' as const,
      sanctionsStatus: 'CLEAR' as const,
      walletSeed: 'satoshi-bridge-us',
      hardcodedWallet: '59Xet5qZ6b6NbpS9a2JD1maamfYKMYEwbvfbFPR92jHx',
      addressLine1: '548 Market Street, Suite 35000',
      postalCode: '94104',
      contactFirstName: 'Alex',
      contactLastName: 'Chen',
      contactEmail: 'alex.chen@satoshi-bridge.io',
      contactPhone: '+1-415-555-1012',
      contactTitle: 'Head of Treasury',
      entityType: 'CORPORATION' as const,
      registrationNumber: 'C4567890',
      registrationCountry: 'US',
      yearEstablished: 2019,
    },
    {
      email: 'rep@moscow-trade.ru',
      companyName: 'Moscow Representative Office',
      legalName: 'Moscow Representative Office LLC',
      jurisdiction: 'RU',
      country: 'RU',
      city: 'Moscow',
      industry: 'Trade',
      kycStatus: 'REJECTED',
      status: 'SUSPENDED' as const,
      sanctionsStatus: 'FLAGGED' as const,
      walletSeed: 'moscow-ru',
      addressLine1: 'Tverskaya Street 15',
      postalCode: '125009',
      contactFirstName: 'Dmitry',
      contactLastName: 'Volkov',
      contactEmail: 'dmitry.volkov@moscow-trade.ru',
      contactPhone: '+7-495-555-1011',
      contactTitle: 'Regional Manager',
      entityType: 'LLC' as const,
      registrationNumber: 'OGRN-1177746012345',
      registrationCountry: 'RU',
      yearEstablished: 2017,
    },
  ];

  // Counterparty map: companyName -> { id, wallet }
  const counterpartyMap = new Map<string, { id: string; wallet: string }>();

  for (const cp of counterpartyDefs) {
    const wallet = (cp as any).hardcodedWallet || fakeWallet(cp.walletSeed);
    const data: any = {
      email: cp.email,
      passwordHash: demoPassword,
      companyName: cp.companyName,
      tier: 'STANDARD',
      status: cp.status,
      kycStatus: cp.kycStatus,
      jurisdiction: cp.jurisdiction,
      primaryWallet: wallet,
      isTestAccount: true,
      legalName: cp.legalName,
      registrationNumber: cp.registrationNumber,
      registrationCountry: cp.registrationCountry,
      entityType: cp.entityType,
      addressLine1: cp.addressLine1,
      city: cp.city,
      postalCode: cp.postalCode,
      country: cp.country,
      contactFirstName: cp.contactFirstName,
      contactLastName: cp.contactLastName,
      contactEmail: cp.contactEmail,
      contactPhone: cp.contactPhone,
      contactTitle: cp.contactTitle,
      sanctionsStatus: cp.sanctionsStatus,
      industry: cp.industry,
      yearEstablished: cp.yearEstablished,
      kybStatus: cp.kycStatus === 'VERIFIED' ? ('VERIFIED' as const) : cp.kycStatus === 'PENDING' ? ('PENDING' as const) : ('REJECTED' as const),
      kybVerifiedAt: cp.kycStatus === 'VERIFIED' ? daysAgo(45) : undefined,
      kybExpiresAt: cp.kycStatus === 'VERIFIED' ? hoursFromNow(24 * 320) : undefined,
      riskRating: cp.sanctionsStatus === 'FLAGGED' ? ('HIGH' as const) : cp.kycStatus === 'VERIFIED' ? ('LOW' as const) : ('UNRATED' as const),
      preferredSettlementChain: 'solana',
    };

    // Remove undefined keys
    for (const k of Object.keys(data)) {
      if (data[k] === undefined) delete data[k];
    }

    const client = await prisma.institutionClient.upsert({
      where: { email: cp.email },
      create: data,
      update: data,
    });

    counterpartyMap.set(cp.companyName, { id: client.id, wallet });

    // Ensure each counterparty has a default branch (named after the company)
    const existingBranch = await prisma.institutionBranch.findFirst({
      where: { clientId: client.id },
    });
    if (!existingBranch) {
      await prisma.institutionBranch.create({
        data: {
          clientId: client.id,
          name: cp.companyName,
          city: cp.city,
          country: cp.country || cp.jurisdiction,
          countryCode: cp.jurisdiction,
          address: cp.addressLine1,
          timezone: 'UTC',
          riskScore: cp.sanctionsStatus === 'FLAGGED' ? 85 : 10,
          complianceStatus: cp.sanctionsStatus === 'FLAGGED' ? 'BLOCKED' : 'COMPLIANT',
          isSanctioned: cp.sanctionsStatus === 'FLAGGED',
          isActive: cp.status === 'ACTIVE',
        },
      });
    }
    const branch = await prisma.institutionBranch.findFirst({
      where: { clientId: client.id },
    });

    // Ensure each counterparty has a "Primary Receiving" account
    const existingAccount = await prisma.institutionAccount.findFirst({
      where: { clientId: client.id },
    });
    if (!existingAccount) {
      await prisma.institutionAccount.create({
        data: {
          clientId: client.id,
          name: 'Primary Receiving',
          label: 'Primary Receiving',
          accountType: 'OPERATIONS',
          walletAddress: wallet,
          chain: 'solana',
          walletProvider: 'Self-Custody',
          custodyType: 'SELF_CUSTODY',
          verificationStatus: cp.kycStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING',
          isDefault: true,
          isActive: cp.status === 'ACTIVE',
          branchId: branch?.id,
          description: `${cp.city} Office`,
        },
      });
    }

    console.log(`   [OK] ${cp.companyName} (${cp.jurisdiction}, ${cp.status}, KYC: ${cp.kycStatus})`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6. ESCROWS
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n6. Seeding escrows...');

  // Map branch country codes to account wallets for payer side
  const branchToPayerWallet: Record<string, string> = {
    'CH': accountWalletMap.get('Main Treasury')!,
    'US': accountWalletMap.get('Americas Treasury')!,
    'SG': accountWalletMap.get('APAC Treasury')!,
    'GB': accountWalletMap.get('London Settlement')!,
    'AE': accountWalletMap.get('Dubai Operations')!,
  };

  // Map counterparties to corridors for recipient wallets
  const corridorRecipientMap: Record<string, string> = {
    'CH-SG': 'GlobalTrade Industries',
    'SG-JP': 'Tokyo Digital Assets',
    'US-DE': 'Eurolink Trading GmbH',
    'GB-CH': 'Swiss Precision AG',
    'CH-IT': 'Mediterranean Logistics',
    'AE-AE': 'Gulf Trade Corp',
    'SG-CN': 'GlobalTrade Industries',
    'US-CH': 'Swiss Precision AG',
    'CH-CH': 'Swiss Precision AG',
    'GB-HK': 'London Bridge Capital',
    'US-GB': 'London Bridge Capital',
    'AE-SG': 'Pacific Rim Exports',
  };

  const escrowDefs = [
    { escrowCode: 'EE-A1B-C3D', corridor: 'CH-SG', amount: 2_500_000, status: 'FUNDED', daysAgo: 1 },
    { escrowCode: 'EE-E5F-A7B', corridor: 'SG-JP', amount: 1_800_000, status: 'COMPLIANCE_HOLD', daysAgo: 1 },
    { escrowCode: 'EE-C9D-E1F', corridor: 'US-DE', amount: 950_000, status: 'RELEASED', daysAgo: 2 },
    { escrowCode: 'EE-A3B-C5D', corridor: 'GB-CH', amount: 4_200_000, status: 'FUNDED', daysAgo: 2 },
    { escrowCode: 'EE-E7F-A9B', corridor: 'CH-IT', amount: 670_000, status: 'RELEASED', daysAgo: 3 },
    { escrowCode: 'EE-C1D-E3F', corridor: 'AE-AE', amount: 1_100_000, status: 'CREATED', daysAgo: 3 },
    { escrowCode: 'EE-A5B-C7D', corridor: 'SG-CN', amount: 3_300_000, status: 'COMPLIANCE_HOLD', daysAgo: 4 },
    { escrowCode: 'EE-E9F-A1B', corridor: 'US-CH', amount: 520_000, status: 'CANCELLED', daysAgo: 4 },
    { escrowCode: 'EE-A7B-C9D', corridor: 'CH-CH', amount: 280_000, status: 'EXPIRED', daysAgo: 6 },
    { escrowCode: 'EE-B2C-D4E', corridor: 'GB-HK', amount: 1_750_000, status: 'RELEASED', daysAgo: 5 },
    { escrowCode: 'EE-F3G-H5I', corridor: 'CH-SG', amount: 890_000, status: 'FUNDED', daysAgo: 7 },
    { escrowCode: 'EE-J6K-L8M', corridor: 'US-GB', amount: 2_100_000, status: 'RELEASED', daysAgo: 8 },
  ];

  const escrowIdMap = new Map<string, string>(); // escrowCode -> escrowId

  for (const e of escrowDefs) {
    const escrowId = deterministicUuid(`optimus-escrow-${e.escrowCode}`);
    escrowIdMap.set(e.escrowCode, escrowId);

    const sourceCountry = e.corridor.split('-')[0];
    const payerWallet = branchToPayerWallet[sourceCountry] || accountWalletMap.get('Main Treasury')!;
    const recipientName = corridorRecipientMap[e.corridor] || 'GlobalTrade Industries';
    const recipientData = counterpartyMap.get(recipientName);
    const recipientWallet = recipientData?.wallet || fakeWallet(`recipient-${e.escrowCode}`);
    const settlementAuthority = fakeWallet(`settlement-${e.escrowCode}`);
    const platformFee = e.amount * 0.001; // 0.1%
    const createdAt = daysAgo(e.daysAgo);

    // Status-specific timestamps
    const isFunded = ['FUNDED', 'COMPLIANCE_HOLD', 'RELEASED'].includes(e.status);
    const isReleased = e.status === 'RELEASED';
    const isCancelled = e.status === 'CANCELLED';
    const isExpired = e.status === 'EXPIRED';

    const fundedAt = isFunded ? new Date(createdAt.getTime() + 2 * 3600000) : null; // 2h after creation
    const resolvedAt = isReleased ? new Date(createdAt.getTime() + 24 * 3600000) : // 24h after creation
                       isCancelled ? new Date(createdAt.getTime() + 12 * 3600000) : // 12h after creation
                       isExpired ? new Date(createdAt.getTime() + 72 * 3600000) : // 72h after creation
                       null;
    const expiresAt = isExpired ? new Date(createdAt.getTime() + 72 * 3600000) : // past expiry for expired
                      hoursFromNow(48); // 48h from now for active

    const riskScore = e.status === 'COMPLIANCE_HOLD' ? 72 :
                      isReleased ? 15 :
                      isFunded ? 22 :
                      null;

    const escrowData: any = {
      escrowId,
      escrowCode: e.escrowCode,
      clientId: optimusId,
      payerWallet,
      recipientWallet,
      usdcMint: USDC_MINT,
      amount: e.amount,
      platformFee,
      corridor: e.corridor,
      conditionType: 'ADMIN_RELEASE',
      status: e.status,
      settlementAuthority,
      riskScore,
      settlementMode: 'escrow',
      releaseMode: 'manual',
      escrowPda: fakeWallet(`pda-${e.escrowCode}`),
      vaultPda: fakeWallet(`vault-${e.escrowCode}`),
      depositTxSignature: isFunded ? fakeTxSig(`deposit-${e.escrowCode}`) : null,
      releaseTxSignature: isReleased ? fakeTxSig(`release-${e.escrowCode}`) : null,
      cancelTxSignature: isCancelled ? fakeTxSig(`cancel-${e.escrowCode}`) : null,
      expiresAt,
      createdAt,
      resolvedAt,
      fundedAt,
    };

    await prisma.institutionEscrow.upsert({
      where: { escrowId },
      create: escrowData,
      update: {
        status: escrowData.status,
        riskScore: escrowData.riskScore,
        resolvedAt: escrowData.resolvedAt,
        fundedAt: escrowData.fundedAt,
        expiresAt: escrowData.expiresAt,
        depositTxSignature: escrowData.depositTxSignature,
        releaseTxSignature: escrowData.releaseTxSignature,
        cancelTxSignature: escrowData.cancelTxSignature,
      },
    });

    console.log(`   [OK] ${e.escrowCode} — ${e.corridor} — $${(e.amount / 1000).toFixed(0)}k — ${e.status}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 7. DIRECT PAYMENTS
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n7. Seeding direct payments...');

  const paymentDefs = [
    {
      paymentCode: 'DP-F7A8-B9C0',
      corridor: 'CH-CH',
      amount: 450_000,
      currency: 'USDC',
      status: 'completed',
      ageHours: 18,
      recipientName: 'Swiss Precision AG',
      senderCountry: 'CH',
      recipientCountry: 'CH',
    },
    {
      paymentCode: 'DP-A1B2-C3D4',
      corridor: 'SG-JP',
      amount: 1_200_000,
      currency: 'USDC',
      status: 'completed',
      ageHours: 24,
      recipientName: 'Tokyo Digital Assets',
      senderCountry: 'SG',
      recipientCountry: 'JP',
    },
    {
      paymentCode: 'DP-E5F6-G7H8',
      corridor: 'US-DE',
      amount: 380_000,
      currency: 'USDC',
      status: 'completed',
      ageHours: 48,
      recipientName: 'Eurolink Trading GmbH',
      senderCountry: 'US',
      recipientCountry: 'DE',
    },
    {
      paymentCode: 'DP-I9J0-K1L2',
      corridor: 'GB-CH',
      amount: 750_000,
      currency: 'USDC',
      status: 'processing',
      ageHours: 3,
      recipientName: 'Swiss Precision AG',
      senderCountry: 'GB',
      recipientCountry: 'CH',
    },
    {
      paymentCode: 'DP-M3N4-O5P6',
      corridor: 'AE-SG',
      amount: 920_000,
      currency: 'USDC',
      status: 'completed',
      ageHours: 72,
      recipientName: 'Pacific Rim Exports',
      senderCountry: 'AE',
      recipientCountry: 'SG',
    },
    {
      paymentCode: 'DP-Q7R8-S9T0',
      corridor: 'CH-IT',
      amount: 185_000,
      currency: 'USDC',
      status: 'failed',
      ageHours: 96,
      recipientName: 'Mediterranean Logistics',
      senderCountry: 'CH',
      recipientCountry: 'IT',
    },
  ];

  for (const p of paymentDefs) {
    const recipientData = counterpartyMap.get(p.recipientName);
    const recipientWallet = recipientData?.wallet || fakeWallet(`dp-recipient-${p.paymentCode}`);
    const senderWallet = branchToPayerWallet[p.senderCountry] || accountWalletMap.get('Main Treasury')!;
    const txHash = p.status === 'completed' ? fakeTxSig(`dp-tx-${p.paymentCode}`) : null;
    const platformFee = p.amount * 0.001;
    const createdAt = hoursAgo(p.ageHours);
    const settledAt = p.status === 'completed' ? new Date(createdAt.getTime() + 1800000) : null; // 30min after

    // Use upsert on paymentCode
    const existing = await prisma.directPayment.findUnique({
      where: { paymentCode: p.paymentCode },
    });

    const data = {
      paymentCode: p.paymentCode,
      clientId: optimusId,
      sender: 'Optimus Exchange AG',
      senderCountry: p.senderCountry,
      senderWallet,
      recipient: p.recipientName,
      recipientCountry: p.recipientCountry,
      recipientWallet,
      amount: p.amount,
      currency: p.currency,
      corridor: p.corridor,
      status: p.status,
      txHash,
      platformFee,
      settledAt,
      createdAt,
    };

    if (existing) {
      await prisma.directPayment.update({
        where: { paymentCode: p.paymentCode },
        data: {
          status: data.status,
          txHash: data.txHash,
          settledAt: data.settledAt,
        },
      });
    } else {
      await prisma.directPayment.create({ data });
    }

    console.log(`   [OK] ${p.paymentCode} — ${p.corridor} — $${(p.amount / 1000).toFixed(0)}k — ${p.status}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 8. AUDIT LOGS (20 entries)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n8. Seeding audit logs...');

  const auditEntries: {
    escrowCode: string;
    action: string;
    actor: string;
    details: any;
    ipAddress: string;
    createdAt: Date;
  }[] = [];

  // ESCROW_CREATED for each escrow
  for (const e of escrowDefs) {
    auditEntries.push({
      escrowCode: e.escrowCode,
      action: 'ESCROW_CREATED',
      actor: 'ops@optimus-exchange.ch',
      details: { amount: e.amount, corridor: e.corridor, escrowCode: e.escrowCode },
      ipAddress: '185.12.64.100',
      createdAt: daysAgo(e.daysAgo),
    });
  }

  // DEPOSIT_CONFIRMED for funded escrows
  const fundedEscrows = escrowDefs.filter(e => ['FUNDED', 'COMPLIANCE_HOLD', 'RELEASED'].includes(e.status));
  for (const e of fundedEscrows) {
    auditEntries.push({
      escrowCode: e.escrowCode,
      action: 'DEPOSIT_CONFIRMED',
      actor: 'system',
      details: { amount: e.amount, txSignature: fakeTxSig(`deposit-${e.escrowCode}`) },
      ipAddress: '10.0.0.1',
      createdAt: new Date(daysAgo(e.daysAgo).getTime() + 2 * 3600000),
    });
  }

  // COMPLIANCE_HOLD for compliance_hold escrows
  const complianceHoldEscrows = escrowDefs.filter(e => e.status === 'COMPLIANCE_HOLD');
  for (const e of complianceHoldEscrows) {
    auditEntries.push({
      escrowCode: e.escrowCode,
      action: 'COMPLIANCE_HOLD',
      actor: 'system',
      details: { riskScore: 72, reason: 'Automated compliance screening triggered — elevated risk corridor' },
      ipAddress: '10.0.0.1',
      createdAt: new Date(daysAgo(e.daysAgo).getTime() + 4 * 3600000),
    });
  }

  // FUNDS_RELEASED for released escrows
  const releasedEscrows = escrowDefs.filter(e => e.status === 'RELEASED');
  for (const e of releasedEscrows) {
    auditEntries.push({
      escrowCode: e.escrowCode,
      action: 'FUNDS_RELEASED',
      actor: 'ops@optimus-exchange.ch',
      details: { txSignature: fakeTxSig(`release-${e.escrowCode}`), amount: e.amount },
      ipAddress: '185.12.64.100',
      createdAt: new Date(daysAgo(e.daysAgo).getTime() + 24 * 3600000),
    });
  }

  // ESCROW_CANCELLED for cancelled
  const cancelledEscrows = escrowDefs.filter(e => e.status === 'CANCELLED');
  for (const e of cancelledEscrows) {
    auditEntries.push({
      escrowCode: e.escrowCode,
      action: 'ESCROW_CANCELLED',
      actor: 'ops@optimus-exchange.ch',
      details: { reason: 'Counterparty requested cancellation', txSignature: fakeTxSig(`cancel-${e.escrowCode}`) },
      ipAddress: '185.12.64.100',
      createdAt: new Date(daysAgo(e.daysAgo).getTime() + 12 * 3600000),
    });
  }

  // ESCROW_EXPIRED for expired
  const expiredEscrows = escrowDefs.filter(e => e.status === 'EXPIRED');
  for (const e of expiredEscrows) {
    auditEntries.push({
      escrowCode: e.escrowCode,
      action: 'ESCROW_EXPIRED',
      actor: 'system',
      details: { reason: 'Escrow passed 72-hour expiry deadline without funding' },
      ipAddress: '10.0.0.1',
      createdAt: new Date(daysAgo(e.daysAgo).getTime() + 72 * 3600000),
    });
  }

  // Trim to exactly 20 entries (should be close already; pad or trim as needed)
  // We have: 12 CREATED + 8 DEPOSIT + 2 COMPLIANCE + 4 RELEASED + 1 CANCELLED + 1 EXPIRED = 28
  // Take first 20
  const finalAuditEntries = auditEntries.slice(0, 20);

  // Delete existing audit logs for optimus escrows to avoid duplicates on re-run
  const optimusEscrowIds = Array.from(escrowIdMap.values());
  await prisma.institutionAuditLog.deleteMany({
    where: {
      escrowId: { in: optimusEscrowIds },
      action: { in: ['ESCROW_CREATED', 'DEPOSIT_CONFIRMED', 'COMPLIANCE_HOLD', 'FUNDS_RELEASED', 'ESCROW_CANCELLED', 'ESCROW_EXPIRED'] },
    },
  });

  let auditCount = 0;
  for (const entry of finalAuditEntries) {
    const escrowId = escrowIdMap.get(entry.escrowCode);
    if (!escrowId) continue;

    await prisma.institutionAuditLog.create({
      data: {
        escrowId,
        clientId: optimusId,
        action: entry.action,
        actor: entry.actor,
        details: entry.details,
        ipAddress: entry.ipAddress,
        createdAt: entry.createdAt,
      },
    });
    auditCount++;
  }

  console.log(`   [OK] Created ${auditCount} audit log entries`);

  // ═══════════════════════════════════════════════════════════════════════
  // 9. APPROVED TOKENS (whitelist)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n9. Seeding approved tokens...');

  const approvedTokenDefs = [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      mintAddress: USDC_MINT,
      decimals: 6,
      issuer: 'Circle',
      jurisdiction: 'US',
      isDefault: true,
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      mintAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      decimals: 6,
      issuer: 'Tether',
      jurisdiction: 'VG',
      isDefault: false,
    },
    {
      symbol: 'EURC',
      name: 'Euro Coin',
      mintAddress: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzKKUBu7evYAP3j',
      decimals: 6,
      issuer: 'Circle',
      jurisdiction: 'EU',
      isDefault: false,
    },
  ];

  for (const t of approvedTokenDefs) {
    await prisma.institutionApprovedToken.upsert({
      where: { symbol: t.symbol },
      create: t,
      update: { name: t.name, mintAddress: t.mintAddress, issuer: t.issuer, jurisdiction: t.jurisdiction, isDefault: t.isDefault },
    });
    console.log(`   [OK] ${t.symbol} — ${t.name} (${t.issuer})${t.isDefault ? ' [default]' : ''}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 10. INSTITUTION WALLETS (dedicated wallet table)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n10. Seeding institution wallets...');

  // Delete existing wallets for Optimus to avoid duplicates on re-run
  await prisma.institutionWallet.deleteMany({ where: { clientId: optimusId } });

  const walletDefs = [
    { name: 'Main Treasury',        address: accountWalletMap.get('Main Treasury')!,        provider: 'Fireblocks',   isPrimary: true,  isSettlement: false, description: 'Primary treasury wallet for institutional operations' },
    { name: 'FINMA Settlement',     address: accountWalletMap.get('FINMA Settlement')!,     provider: 'Self-Custody', isPrimary: false, isSettlement: true,  description: 'Zurich HQ settlement wallet' },
    { name: 'Americas Treasury',    address: accountWalletMap.get('Americas Treasury')!,    provider: 'Fireblocks',   isPrimary: false, isSettlement: false, description: 'New York Americas treasury' },
    { name: 'Americas Operations',  address: accountWalletMap.get('Americas Operations')!,  provider: 'Self-Custody', isPrimary: false, isSettlement: false, description: 'US daily operations wallet' },
    { name: 'APAC Treasury',        address: accountWalletMap.get('APAC Treasury')!,        provider: 'Fireblocks',   isPrimary: false, isSettlement: false, description: 'Singapore APAC treasury' },
    { name: 'London Settlement',    address: accountWalletMap.get('London Settlement')!,    provider: 'BitGo',        isPrimary: false, isSettlement: false, description: 'London trading settlement wallet' },
    { name: 'Dubai Operations',     address: accountWalletMap.get('Dubai Operations')!,     provider: 'Self-Custody', isPrimary: false, isSettlement: false, description: 'Dubai MENA operations wallet' },
  ];

  for (const w of walletDefs) {
    await prisma.institutionWallet.create({
      data: {
        clientId: optimusId,
        name: w.name,
        address: w.address,
        chain: 'solana',
        description: w.description,
        provider: w.provider,
        isPrimary: w.isPrimary,
        isSettlement: w.isSettlement,
      },
    });
    console.log(`   [OK] ${w.name}${w.isPrimary ? ' [primary]' : ''}${w.isSettlement ? ' [settlement]' : ''}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 11. INSTITUTION DEPOSITS (for funded/released escrows)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n11. Seeding institution deposits...');

  // Delete existing deposits for these escrows to avoid duplicates on re-run
  await prisma.institutionDeposit.deleteMany({
    where: { escrowId: { in: Array.from(escrowIdMap.values()) } },
  });

  let depositCount = 0;
  for (const e of escrowDefs) {
    const isFunded = ['FUNDED', 'COMPLIANCE_HOLD', 'RELEASED'].includes(e.status);
    if (!isFunded) continue;

    const escrowId = escrowIdMap.get(e.escrowCode)!;
    const createdAt = daysAgo(e.daysAgo);
    const confirmedAt = new Date(createdAt.getTime() + 2 * 3600000 + 300000); // 2h5m after escrow creation

    await prisma.institutionDeposit.create({
      data: {
        escrowId,
        txSignature: fakeTxSig(`deposit-${e.escrowCode}`),
        amount: e.amount,
        confirmedAt,
        blockHeight: BigInt(200_000_000 + depositCount * 1000),
        createdAt: new Date(createdAt.getTime() + 2 * 3600000), // 2h after escrow creation
      },
    });
    depositCount++;
    console.log(`   [OK] Deposit for ${e.escrowCode} — $${(e.amount / 1000).toFixed(0)}k`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 12. AI COMPLIANCE ANALYSES (for funded/compliance_hold/released escrows)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n12. Seeding AI compliance analyses...');

  // Delete existing analyses for these escrows to avoid duplicates on re-run
  await prisma.institutionAiAnalysis.deleteMany({
    where: { escrowId: { in: Array.from(escrowIdMap.values()) } },
  });

  let analysisCount = 0;
  for (const e of escrowDefs) {
    const hasAnalysis = ['FUNDED', 'COMPLIANCE_HOLD', 'RELEASED'].includes(e.status);
    if (!hasAnalysis) continue;

    const escrowId = escrowIdMap.get(e.escrowCode)!;
    const createdAt = daysAgo(e.daysAgo);
    const isHold = e.status === 'COMPLIANCE_HOLD';
    const isReleased = e.status === 'RELEASED';

    const riskScore = isHold ? 72 + Math.floor(Math.random() * 15) : // 72-86 for holds
                      isReleased ? 8 + Math.floor(Math.random() * 15) : // 8-22 for released
                      20 + Math.floor(Math.random() * 20); // 20-39 for funded
    const recommendation = isHold ? 'REVIEW' :
                           riskScore > 50 ? 'REVIEW' : 'APPROVE';

    const factors = isHold ? [
      { name: 'Counterparty jurisdiction risk', weight: 0.3, value: 85 },
      { name: 'Transaction amount vs. corridor average', weight: 0.25, value: 70 },
      { name: 'Source of funds documentation', weight: 0.2, value: 60 },
      { name: 'Historical pattern analysis', weight: 0.15, value: 45 },
      { name: 'Sanctions screening', weight: 0.1, value: 90 },
    ] : [
      { name: 'Counterparty jurisdiction risk', weight: 0.3, value: 15 },
      { name: 'Transaction amount vs. corridor average', weight: 0.25, value: 20 },
      { name: 'Source of funds documentation', weight: 0.2, value: 10 },
      { name: 'Historical pattern analysis', weight: 0.15, value: 12 },
      { name: 'Sanctions screening', weight: 0.1, value: 5 },
    ];

    const summary = isHold
      ? `Elevated risk detected for ${e.corridor} corridor transaction of $${(e.amount / 1_000_000).toFixed(1)}M. Counterparty jurisdiction flagged for enhanced due diligence. Manual review recommended before release.`
      : isReleased
        ? `Transaction cleared. All compliance checks passed for ${e.corridor} corridor. Risk score within acceptable threshold. No sanctions matches found.`
        : `Preliminary compliance check completed for ${e.corridor} corridor. Transaction amount within normal range for this corridor. Awaiting final verification.`;

    await prisma.institutionAiAnalysis.create({
      data: {
        analysisType: 'ESCROW',
        escrowId,
        clientId: optimusId,
        riskScore,
        factors,
        recommendation,
        extractedFields: {
          corridor: e.corridor,
          amount: e.amount,
          currency: 'USDC',
          sourceCountry: e.corridor.split('-')[0],
          destCountry: e.corridor.split('-')[1],
        },
        summary,
        model: 'claude-sonnet-4-20250514',
        createdAt: new Date(createdAt.getTime() + 2.5 * 3600000), // 2.5h after escrow creation
      },
    });
    analysisCount++;
    console.log(`   [OK] Analysis for ${e.escrowCode} — risk=${riskScore} — ${recommendation}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 13. NOTIFICATIONS (in-app notification feed)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n13. Seeding notifications...');

  // Delete existing seed notifications for Optimus to avoid duplicates
  await prisma.institutionNotification.deleteMany({ where: { clientId: optimusId } });

  const notificationDefs: Array<{
    type: string;
    priority: string;
    title: string;
    message: string;
    escrowCode?: string;
    isRead: boolean;
    hoursAgo: number;
  }> = [
    // Recent unread
    { type: 'ESCROW_FUNDED',           priority: 'MEDIUM', title: 'Escrow EE-A1B-C3D funded',                  message: 'Deposit of $2,500,000 USDC confirmed for CH-SG escrow.',                                      escrowCode: 'EE-A1B-C3D', isRead: false, hoursAgo: 2 },
    { type: 'ESCROW_COMPLIANCE_HOLD',  priority: 'HIGH',   title: 'Compliance hold: EE-E5F-A7B',              message: 'SG-JP escrow of $1,800,000 flagged for enhanced due diligence. Manual review required.',       escrowCode: 'EE-E5F-A7B', isRead: false, hoursAgo: 5 },
    { type: 'ESCROW_FUNDED',           priority: 'MEDIUM', title: 'Escrow EE-A3B-C5D funded',                  message: 'Deposit of $4,200,000 USDC confirmed for GB-CH escrow.',                                      escrowCode: 'EE-A3B-C5D', isRead: false, hoursAgo: 8 },
    { type: 'ESCROW_COMPLIANCE_HOLD',  priority: 'HIGH',   title: 'Compliance hold: EE-A5B-C7D',              message: 'SG-CN escrow of $3,300,000 flagged for PBOC cross-border restrictions. Review before release.', escrowCode: 'EE-A5B-C7D', isRead: false, hoursAgo: 20 },
    { type: 'DEPOSIT_CONFIRMED',       priority: 'LOW',    title: 'Deposit confirmed',                         message: 'USDC deposit of $890,000 confirmed for escrow EE-F3G-H5I.',                                   escrowCode: 'EE-F3G-H5I', isRead: false, hoursAgo: 26 },
    // Older read
    { type: 'ESCROW_RELEASED',         priority: 'MEDIUM', title: 'Escrow EE-C9D-E1F released',               message: 'Settlement of $950,000 USDC completed for US-DE corridor. Funds delivered to recipient.',       escrowCode: 'EE-C9D-E1F', isRead: true, hoursAgo: 36 },
    { type: 'ESCROW_RELEASED',         priority: 'MEDIUM', title: 'Escrow EE-E7F-A9B released',               message: 'Settlement of $670,000 USDC completed for CH-IT corridor.',                                    escrowCode: 'EE-E7F-A9B', isRead: true, hoursAgo: 60 },
    { type: 'COMPLIANCE_CHECK_PASSED', priority: 'LOW',    title: 'Compliance check passed',                   message: 'AI analysis cleared escrow EE-B2C-D4E (GB-HK, $1,750,000). All sanctions checks negative.',    escrowCode: 'EE-B2C-D4E', isRead: true, hoursAgo: 96 },
    { type: 'ESCROW_RELEASED',         priority: 'MEDIUM', title: 'Escrow EE-B2C-D4E released',               message: 'Settlement of $1,750,000 USDC completed for GB-HK corridor.',                                  escrowCode: 'EE-B2C-D4E', isRead: true, hoursAgo: 100 },
    { type: 'ESCROW_CANCELLED',        priority: 'MEDIUM', title: 'Escrow EE-E9F-A1B cancelled',              message: 'US-CH escrow of $520,000 cancelled by payer. Funds refunded.',                                  escrowCode: 'EE-E9F-A1B', isRead: true, hoursAgo: 80 },
    { type: 'ESCROW_EXPIRED',          priority: 'LOW',    title: 'Escrow EE-A7B-C9D expired',                message: 'CH-CH escrow of $280,000 expired after 72 hours. Funds auto-refunded.',                         escrowCode: 'EE-A7B-C9D', isRead: true, hoursAgo: 120 },
    { type: 'ESCROW_RELEASED',         priority: 'MEDIUM', title: 'Escrow EE-J6K-L8M released',               message: 'Settlement of $2,100,000 USDC completed for US-GB corridor.',                                  escrowCode: 'EE-J6K-L8M', isRead: true, hoursAgo: 168 },
    { type: 'KYB_VERIFIED',            priority: 'LOW',    title: 'KYB verification complete',                 message: 'Your institution (Optimus Exchange AG) KYB status verified by compliance team.',                                           isRead: true, hoursAgo: 200 },
    { type: 'ACCOUNT_VERIFIED',        priority: 'LOW',    title: 'Account verified: Main Treasury',           message: 'Your Main Treasury account has been verified and is ready for escrow operations.',                                        isRead: true, hoursAgo: 210 },
    { type: 'SETTLEMENT_COMPLETE',     priority: 'MEDIUM', title: 'Daily settlement summary',                  message: '4 escrows settled today totaling $5,470,000 USDC across CH-SG, US-DE, CH-IT, GB-HK corridors.',                          isRead: true, hoursAgo: 130 },
  ];

  let notifCount = 0;
  for (const n of notificationDefs) {
    const escrowId = n.escrowCode ? escrowIdMap.get(n.escrowCode) : undefined;
    await prisma.institutionNotification.create({
      data: {
        clientId: optimusId,
        escrowId: escrowId || null,
        type: n.type as any,
        priority: n.priority as any,
        title: n.title,
        message: n.message,
        metadata: n.escrowCode ? { escrowCode: n.escrowCode } : {},
        isRead: n.isRead,
        readAt: n.isRead ? hoursAgo(n.hoursAgo - 1) : null,
        createdAt: hoursAgo(n.hoursAgo),
      },
    });
    notifCount++;
  }
  console.log(`   [OK] Created ${notifCount} notifications (${notificationDefs.filter(n => !n.isRead).length} unread)`);

  // ═══════════════════════════════════════════════════════════════════════
  // SEED MARKER (for timestamped restore)
  // ═══════════════════════════════════════════════════════════════════════

  const seededAt = new Date().toISOString();
  const counterpartyIds = counterpartyDefs.map((cp: any) => cp.id || deterministicUuid('optimus-cp-' + cp.email));

  // Resolve actual counterparty IDs from DB
  const cpRecords = await prisma.institutionClient.findMany({
    where: { email: { in: counterpartyDefs.map((cp: any) => cp.email) } },
    select: { id: true },
  });

  await prisma.institutionAuditLog.create({
    data: {
      clientId: optimusId,
      action: SEED_MARKER_ACTION,
      actor: 'seed-script',
      details: {
        version: SEED_VERSION,
        seededAt,
        clientId: optimusId,
        counterpartyIds: cpRecords.map((r: any) => r.id),
        counts: {
          branches: branchDefs.length,
          accounts: accountDefs.length,
          clients: counterpartyDefs.length,
          escrows: escrowDefs.length,
          payments: paymentDefs.length,
          auditLogs: auditCount,
          corridors: corridorDefs.length,
          approvedTokens: approvedTokenDefs.length,
          wallets: walletDefs.length,
          deposits: depositCount,
          aiAnalyses: analysisCount,
          notifications: notifCount,
        },
      },
      ipAddress: '127.0.0.1',
    },
  });

  console.log('\n=== Seed Complete ===');
  console.log(`   Timestamp:    ${seededAt}`);
  console.log(`   Version:      ${SEED_VERSION}`);
  console.log(`   Institution:  Optimus Exchange AG (${optimusId})`);
  console.log(`   Branches:     ${branchDefs.length}`);
  console.log(`   Accounts:     ${accountDefs.length}`);
  console.log(`   Wallets:      ${walletDefs.length}`);
  console.log(`   Clients:      ${counterpartyDefs.length}`);
  console.log(`   Escrows:      ${escrowDefs.length}`);
  console.log(`   Deposits:     ${depositCount}`);
  console.log(`   AI Analyses:  ${analysisCount}`);
  console.log(`   Payments:     ${paymentDefs.length}`);
  console.log(`   Audit logs:   ${auditCount}`);
  console.log(`   Notifications:${notifCount}`);
  console.log(`   Tokens:       ${approvedTokenDefs.length}`);
  console.log(`   Corridors:    ${corridorDefs.length}`);
  console.log(`\n   To restore:   npx ts-node scripts/seed-optimus-exchange.ts --restore`);
}

main()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
