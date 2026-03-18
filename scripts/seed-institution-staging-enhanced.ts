/**
 * Enhanced Staging Mock Data
 *
 * Adds richer mock data on top of seed-institution-staging.ts:
 * - More escrows across different months (for dashboard charts)
 * - Notifications for all clients (3+ per client, varied types)
 * - Extra escrows for ops@helvetica-digital.ch (3+ active, buyer role)
 * - Extra escrows for finance@satoshi-bridge.io (provider role)
 * - More accounts per client
 *
 * Usage: npx ts-node scripts/seed-institution-staging-enhanced.ts --staging
 *
 * Idempotent: checks for ENHANCED_STAGING_SEED audit marker before creating.
 */

import { PrismaClient, Prisma } from '../src/generated/prisma';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeWallet(seed: string): string {
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

/** Generate escrow code in EE-XXXX-XXXX format */
function generateEscrowCode(seed: string): string {
  const hash = createHash('md5').update(seed).digest('hex');
  const part1 = hash.slice(0, 4).toUpperCase();
  const part2 = hash.slice(4, 8).toUpperCase();
  return `EE-${part1}-${part2}`;
}

const USDC_MINT = process.env.USDC_MINT_ADDRESS;
if (!USDC_MINT) {
  console.error('ERROR: USDC_MINT_ADDRESS environment variable is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Enhanced escrow data — spread across months for chart visualization
// ---------------------------------------------------------------------------

interface EnhancedEscrow {
  clientEmail: string;
  status: string;
  amount: number;
  platformFee: number;
  corridor: string;
  conditionType: 'ADMIN_RELEASE' | 'TIME_LOCK' | 'COMPLIANCE_CHECK';
  riskScore: number | null;
  createdDaysAgo: number;
  expiresInHours: number;
  hasTxSigs: { deposit?: boolean; release?: boolean; cancel?: boolean };
  hasPdas: boolean;
  isFunded: boolean;
  isResolved: boolean;
  seedTag: string;
}

// Helvetica Digital — 3 more active escrows + historical for charts
const helveticaEscrows: EnhancedEscrow[] = [
  // Active escrows as buyer
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'FUNDED',
    amount: 175_000,
    platformFee: 875,
    corridor: 'CH-SG',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 12,
    createdDaysAgo: 1,
    expiresInHours: 60,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
    seedTag: 'enh-helvetica-funded-1',
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'FUNDED',
    amount: 320_000,
    platformFee: 1_600,
    corridor: 'CH-US',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 18,
    createdDaysAgo: 2,
    expiresInHours: 48,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
    seedTag: 'enh-helvetica-funded-2',
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'CREATED',
    amount: 95_000,
    platformFee: 475,
    corridor: 'SG-CH',
    conditionType: 'TIME_LOCK',
    riskScore: null,
    createdDaysAgo: 0,
    expiresInHours: 72,
    hasTxSigs: {},
    hasPdas: true,
    isFunded: false,
    isResolved: false,
    seedTag: 'enh-helvetica-created-1',
  },
  // Historical released escrows across different months (for charts)
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'RELEASED',
    amount: 150_000,
    platformFee: 750,
    corridor: 'CH-SG',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 10,
    createdDaysAgo: 30,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-helvetica-released-30d',
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'RELEASED',
    amount: 420_000,
    platformFee: 2_100,
    corridor: 'CH-US',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 20,
    createdDaysAgo: 45,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-helvetica-released-45d',
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'RELEASED',
    amount: 85_000,
    platformFee: 425,
    corridor: 'SG-CH',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 5,
    createdDaysAgo: 60,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-helvetica-released-60d',
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'RELEASED',
    amount: 275_000,
    platformFee: 1_375,
    corridor: 'CH-SG',
    conditionType: 'TIME_LOCK',
    riskScore: 15,
    createdDaysAgo: 75,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-helvetica-released-75d',
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'RELEASED',
    amount: 190_000,
    platformFee: 950,
    corridor: 'CH-US',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 8,
    createdDaysAgo: 90,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-helvetica-released-90d',
  },
  // Cancelled one
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'CANCELLED',
    amount: 50_000,
    platformFee: 250,
    corridor: 'CH-SG',
    conditionType: 'ADMIN_RELEASE',
    riskScore: null,
    createdDaysAgo: 55,
    expiresInHours: -1,
    hasTxSigs: { cancel: true },
    hasPdas: true,
    isFunded: false,
    isResolved: true,
    seedTag: 'enh-helvetica-cancelled-55d',
  },
];

// Satoshi Bridge — more escrows as provider (receiving payments)
const satoshiEscrows: EnhancedEscrow[] = [
  // Active/funded
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'FUNDED',
    amount: 450_000,
    platformFee: 2_250,
    corridor: 'US-MX',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 25,
    createdDaysAgo: 1,
    expiresInHours: 48,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
    seedTag: 'enh-satoshi-funded-1',
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'FUNDED',
    amount: 200_000,
    platformFee: 1_000,
    corridor: 'CH-US',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 15,
    createdDaysAgo: 2,
    expiresInHours: 36,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
    seedTag: 'enh-satoshi-funded-2',
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'CREATED',
    amount: 125_000,
    platformFee: 625,
    corridor: 'US-PH',
    conditionType: 'TIME_LOCK',
    riskScore: null,
    createdDaysAgo: 0,
    expiresInHours: 72,
    hasTxSigs: {},
    hasPdas: true,
    isFunded: false,
    isResolved: false,
    seedTag: 'enh-satoshi-created-1',
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'COMPLIANCE_HOLD',
    amount: 380_000,
    platformFee: 1_900,
    corridor: 'US-MX',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 58,
    createdDaysAgo: 3,
    expiresInHours: 24,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
    seedTag: 'enh-satoshi-compliance-1',
  },
  // Historical across months
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'RELEASED',
    amount: 350_000,
    platformFee: 1_750,
    corridor: 'US-MX',
    conditionType: 'TIME_LOCK',
    riskScore: 14,
    createdDaysAgo: 25,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-satoshi-released-25d',
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'RELEASED',
    amount: 180_000,
    platformFee: 900,
    corridor: 'CH-US',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 10,
    createdDaysAgo: 40,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-satoshi-released-40d',
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'RELEASED',
    amount: 550_000,
    platformFee: 2_750,
    corridor: 'US-PH',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 22,
    createdDaysAgo: 55,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-satoshi-released-55d',
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'RELEASED',
    amount: 290_000,
    platformFee: 1_450,
    corridor: 'US-MX',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 18,
    createdDaysAgo: 70,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-satoshi-released-70d',
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'RELEASED',
    amount: 420_000,
    platformFee: 2_100,
    corridor: 'SG-US',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 12,
    createdDaysAgo: 85,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-satoshi-released-85d',
  },
  // Expired
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'EXPIRED',
    amount: 75_000,
    platformFee: 375,
    corridor: 'US-PH',
    conditionType: 'TIME_LOCK',
    riskScore: null,
    createdDaysAgo: 50,
    expiresInHours: -1,
    hasTxSigs: {},
    hasPdas: true,
    isFunded: false,
    isResolved: true,
    seedTag: 'enh-satoshi-expired-50d',
  },
];

// Cross-client escrows for other clients (spread across months for charts)
const otherEscrows: EnhancedEscrow[] = [
  // Alpine Custody — historical
  {
    clientEmail: 'treasury@alpine-custody.ch',
    status: 'RELEASED',
    amount: 300_000,
    platformFee: 1_500,
    corridor: 'CH-US',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 12,
    createdDaysAgo: 35,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-alpine-released-35d',
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    status: 'RELEASED',
    amount: 125_000,
    platformFee: 625,
    corridor: 'CH-SG',
    conditionType: 'TIME_LOCK',
    riskScore: 8,
    createdDaysAgo: 65,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-alpine-released-65d',
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    status: 'FUNDED',
    amount: 200_000,
    platformFee: 1_000,
    corridor: 'CH-US',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 20,
    createdDaysAgo: 1,
    expiresInHours: 48,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
    seedTag: 'enh-alpine-funded-1',
  },

  // ChainFlow — historical
  {
    clientEmail: 'ops@chainflow-remit.sg',
    status: 'RELEASED',
    amount: 45_000,
    platformFee: 225,
    corridor: 'SG-CH',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 15,
    createdDaysAgo: 20,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-chainflow-released-20d',
  },
  {
    clientEmail: 'ops@chainflow-remit.sg',
    status: 'RELEASED',
    amount: 80_000,
    platformFee: 400,
    corridor: 'SG-US',
    conditionType: 'TIME_LOCK',
    riskScore: 18,
    createdDaysAgo: 50,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-chainflow-released-50d',
  },
  {
    clientEmail: 'ops@chainflow-remit.sg',
    status: 'RELEASED',
    amount: 62_000,
    platformFee: 310,
    corridor: 'SG-CH',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 10,
    createdDaysAgo: 80,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-chainflow-released-80d',
  },

  // AMINA — historical
  {
    clientEmail: 'admin@aminagroup.com',
    status: 'RELEASED',
    amount: 750_000,
    platformFee: 3_750,
    corridor: 'CH-SG',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 5,
    createdDaysAgo: 22,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-amina-released-22d',
  },
  {
    clientEmail: 'admin@aminagroup.com',
    status: 'RELEASED',
    amount: 500_000,
    platformFee: 2_500,
    corridor: 'CH-US',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 8,
    createdDaysAgo: 48,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-amina-released-48d',
  },
  {
    clientEmail: 'admin@aminagroup.com',
    status: 'FUNDED',
    amount: 350_000,
    platformFee: 1_750,
    corridor: 'SG-CH',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 10,
    createdDaysAgo: 1,
    expiresInHours: 60,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
    seedTag: 'enh-amina-funded-1',
  },

  // Meridian Trade — historical
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    status: 'RELEASED',
    amount: 800_000,
    platformFee: 4_000,
    corridor: 'EU-UK',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 6,
    createdDaysAgo: 18,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-meridian-released-18d',
  },
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    status: 'RELEASED',
    amount: 650_000,
    platformFee: 3_250,
    corridor: 'EU-UK',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 14,
    createdDaysAgo: 42,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-meridian-released-42d',
  },
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    status: 'RELEASED',
    amount: 900_000,
    platformFee: 4_500,
    corridor: 'EU-UK',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 10,
    createdDaysAgo: 72,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-meridian-released-72d',
  },

  // Pacific Rim — historical
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    status: 'RELEASED',
    amount: 95_000,
    platformFee: 475,
    corridor: 'SG-US',
    conditionType: 'TIME_LOCK',
    riskScore: 12,
    createdDaysAgo: 28,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-pacificrim-released-28d',
  },
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    status: 'RELEASED',
    amount: 140_000,
    platformFee: 700,
    corridor: 'SG-CH',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 8,
    createdDaysAgo: 58,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
    seedTag: 'enh-pacificrim-released-58d',
  },
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    status: 'FUNDED',
    amount: 110_000,
    platformFee: 550,
    corridor: 'SG-US',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 16,
    createdDaysAgo: 1,
    expiresInHours: 48,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
    seedTag: 'enh-pacificrim-funded-1',
  },
];

const allEnhancedEscrows = [...helveticaEscrows, ...satoshiEscrows, ...otherEscrows];

// ---------------------------------------------------------------------------
// Notification definitions — 3+ per client, various types
// ---------------------------------------------------------------------------

interface NotificationDef {
  clientEmail: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  isRead: boolean;
  createdDaysAgo: number;
}

const notifications: NotificationDef[] = [
  // ── ops@helvetica-digital.ch ──────────────────────────────────────
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'ESCROW_FUNDED',
    priority: 'HIGH',
    title: 'Escrow funded: CHF 175,000 USDC',
    message:
      'Your escrow EE-A1B2-C3D4 for CH-SG corridor has been funded. 175,000 USDC deposited and confirmed on-chain.',
    metadata: { corridor: 'CH-SG', amount: 175000, escrowCode: 'EE-A1B2-C3D4' },
    isRead: false,
    createdDaysAgo: 1,
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'KYB_VERIFIED',
    priority: 'MEDIUM',
    title: 'KYB verification renewed',
    message:
      'Your KYB verification has been successfully renewed. Next review date: September 2026.',
    metadata: {
      verifiedAt: daysAgo(5).toISOString(),
      expiresAt: hoursFromNow(24 * 275).toISOString(),
    },
    isRead: true,
    createdDaysAgo: 5,
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'WALLET_WHITELISTED',
    priority: 'MEDIUM',
    title: 'Wallet whitelisted: Settlement Vault',
    message:
      'Your Settlement Vault wallet has been verified and added to the whitelist for cross-border transfers.',
    metadata: { walletName: 'Settlement Vault', provider: 'Fireblocks' },
    isRead: true,
    createdDaysAgo: 10,
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'COMPLIANCE_CHECK_PASSED',
    priority: 'LOW',
    title: 'Monthly compliance review passed',
    message:
      'Your monthly compliance review has been completed. All transactions within approved limits. Risk rating: LOW.',
    metadata: { reviewPeriod: 'February 2026', riskRating: 'LOW', totalVolume: 845000 },
    isRead: true,
    createdDaysAgo: 15,
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'ESCROW_RELEASED',
    priority: 'HIGH',
    title: 'Escrow released: CHF 420,000 USDC',
    message:
      'Escrow EE-F5G6-H7I8 for CH-US corridor has been released successfully. 420,000 USDC transferred to recipient.',
    metadata: { corridor: 'CH-US', amount: 420000, escrowCode: 'EE-F5G6-H7I8' },
    isRead: true,
    createdDaysAgo: 44,
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'ACCOUNT_VERIFIED',
    priority: 'MEDIUM',
    title: 'Account verified: Cross-border Settlement',
    message:
      'Your Cross-border Settlement account has been verified and is now active for transactions.',
    metadata: { accountName: 'Settlement', accountType: 'SETTLEMENT' },
    isRead: true,
    createdDaysAgo: 85,
  },

  // ── treasury@alpine-custody.ch ────────────────────────────────────
  {
    clientEmail: 'treasury@alpine-custody.ch',
    type: 'ESCROW_COMPLIANCE_HOLD',
    priority: 'CRITICAL',
    title: 'Compliance hold: 500,000 USDC escrow',
    message:
      'Your escrow for CH-US corridor ($500,000) has been placed on compliance hold. Risk score: 65. Additional documentation may be required.',
    metadata: { corridor: 'CH-US', amount: 500000, riskScore: 65 },
    isRead: false,
    createdDaysAgo: 2,
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    type: 'COMPLIANCE_REVIEW_REQUIRED',
    priority: 'HIGH',
    title: 'Enhanced due diligence review requested',
    message:
      'An enhanced due diligence review has been requested for your account due to a high-value transaction flagged by automated screening.',
    metadata: { reason: 'High-value CH-US corridor transaction', threshold: 250000 },
    isRead: false,
    createdDaysAgo: 3,
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    type: 'KYC_APPROVED',
    priority: 'MEDIUM',
    title: 'KYC verification approved',
    message: 'Your institutional KYC verification has been approved. All documentation verified.',
    metadata: { verifiedBy: 'compliance-team' },
    isRead: true,
    createdDaysAgo: 60,
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    type: 'WALLET_WHITELISTED',
    priority: 'MEDIUM',
    title: 'Wallet whitelisted: Primary Multisig',
    message: 'Your Primary Multisig wallet (Gnosis Safe) has been verified and whitelisted.',
    metadata: { walletName: 'Primary Multisig', custodyType: 'MULTISIG' },
    isRead: true,
    createdDaysAgo: 45,
  },

  // ── finance@satoshi-bridge.io ─────────────────────────────────────
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'ESCROW_FUNDED',
    priority: 'HIGH',
    title: 'Escrow funded: $450,000 USDC',
    message:
      'Your escrow for US-MX corridor has been funded. $450,000 USDC deposited and confirmed. Compliance review in progress.',
    metadata: { corridor: 'US-MX', amount: 450000 },
    isRead: false,
    createdDaysAgo: 1,
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'ESCROW_COMPLIANCE_HOLD',
    priority: 'HIGH',
    title: 'Compliance review: $380,000 US-MX transfer',
    message:
      'Your $380,000 USDC escrow for US-MX corridor requires compliance review. Risk score: 58. Estimated review time: 24-48 hours.',
    metadata: { corridor: 'US-MX', amount: 380000, riskScore: 58 },
    isRead: false,
    createdDaysAgo: 3,
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'KYB_VERIFIED',
    priority: 'MEDIUM',
    title: 'KYB verification complete',
    message:
      'Satoshi Bridge Labs Inc KYB verification has been completed and approved. Money Transmitter License verified with FinCEN.',
    metadata: { licenseType: 'Money Transmitter License', regulatoryBody: 'FinCEN / State DFPI' },
    isRead: true,
    createdDaysAgo: 120,
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'SETTLEMENT_COMPLETE',
    priority: 'MEDIUM',
    title: 'Monthly settlement: $1.79M processed',
    message:
      'Your February 2026 settlement cycle is complete. Total volume: $1,790,000 across 5 escrows. All funds released successfully.',
    metadata: { period: 'February 2026', totalVolume: 1790000, escrowCount: 5 },
    isRead: true,
    createdDaysAgo: 18,
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'WALLET_WHITELISTED',
    priority: 'MEDIUM',
    title: 'Wallet verified: Bridge Hot Wallet',
    message:
      'Your Bridge Hot Wallet (Fordefi MPC) has been verified and whitelisted for escrow transactions.',
    metadata: { walletName: 'Bridge Hot Wallet', provider: 'Fordefi', custodyType: 'MPC' },
    isRead: true,
    createdDaysAgo: 90,
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'COMPLIANCE_CHECK_PASSED',
    priority: 'LOW',
    title: 'Quarterly compliance review passed',
    message:
      'Q1 2026 compliance review completed. All corridors within limits. No adverse findings.',
    metadata: { reviewPeriod: 'Q1 2026', corridors: ['US-MX', 'US-PH', 'CH-US'] },
    isRead: true,
    createdDaysAgo: 25,
  },

  // ── ops@chainflow-remit.sg ────────────────────────────────────────
  {
    clientEmail: 'ops@chainflow-remit.sg',
    type: 'ESCROW_FUNDED',
    priority: 'HIGH',
    title: 'Escrow funded: $75,000 USDC',
    message: 'Your escrow for SG-US corridor has been funded and is pending compliance review.',
    metadata: { corridor: 'SG-US', amount: 75000 },
    isRead: false,
    createdDaysAgo: 1,
  },
  {
    clientEmail: 'ops@chainflow-remit.sg',
    type: 'KYC_APPROVED',
    priority: 'MEDIUM',
    title: 'KYC verification renewed',
    message: 'Your institutional KYC has been renewed. MAS license verification confirmed.',
    metadata: { regulatoryBody: 'MAS', licenseType: 'Major Payment Institution License' },
    isRead: true,
    createdDaysAgo: 45,
  },
  {
    clientEmail: 'ops@chainflow-remit.sg',
    type: 'COMPLIANCE_CHECK_PASSED',
    priority: 'LOW',
    title: 'Monthly compliance passed',
    message: 'February 2026 compliance review completed. SG-CH and SG-US corridors within limits.',
    metadata: { reviewPeriod: 'February 2026', corridors: ['SG-CH', 'SG-US'] },
    isRead: true,
    createdDaysAgo: 18,
  },
  {
    clientEmail: 'ops@chainflow-remit.sg',
    type: 'WALLET_VERIFICATION_PENDING',
    priority: 'MEDIUM',
    title: 'Settlement account verification pending',
    message:
      'Your Settlement account wallet is pending verification. Please complete the verification process to enable settlement transfers.',
    metadata: { accountName: 'Settlement', walletAddress: fakeWallet('chainflow-settlement') },
    isRead: false,
    createdDaysAgo: 5,
  },

  // ── admin@aminagroup.com ──────────────────────────────────────────
  {
    clientEmail: 'admin@aminagroup.com',
    type: 'ESCROW_CANCELLED',
    priority: 'MEDIUM',
    title: 'Escrow cancellation in progress',
    message:
      'Your escrow for US-PH corridor ($30,000) is being cancelled. Refund will be processed within 24 hours.',
    metadata: { corridor: 'US-PH', amount: 30000 },
    isRead: false,
    createdDaysAgo: 4,
  },
  {
    clientEmail: 'admin@aminagroup.com',
    type: 'COMPLIANCE_CHECK_PASSED',
    priority: 'LOW',
    title: 'Quarterly compliance review passed',
    message:
      'Q1 2026 compliance review passed. All operations within regulatory limits. FINMA reporting submitted.',
    metadata: { reviewPeriod: 'Q1 2026', regulatoryBody: 'FINMA' },
    isRead: true,
    createdDaysAgo: 12,
  },
  {
    clientEmail: 'admin@aminagroup.com',
    type: 'ACCOUNT_VERIFIED',
    priority: 'MEDIUM',
    title: 'Collateral Reserve account verified',
    message:
      'Your Collateral Reserve account (Copper custody) has been verified and activated for margin operations.',
    metadata: { accountName: 'Collateral Reserve', custodyType: 'THIRD_PARTY', provider: 'Copper' },
    isRead: true,
    createdDaysAgo: 30,
  },
  {
    clientEmail: 'admin@aminagroup.com',
    type: 'SECURITY_ALERT',
    priority: 'HIGH',
    title: 'New API key created',
    message:
      'A new API key was created for your account. If you did not authorize this, contact support immediately.',
    metadata: { keyLabel: 'Production API v2', createdBy: 'admin@aminagroup.com' },
    isRead: true,
    createdDaysAgo: 20,
  },

  // ── treasury@meridian-trade.co.uk ─────────────────────────────────
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    type: 'ESCROW_RELEASED',
    priority: 'HIGH',
    title: 'Escrow released: £800,000 USDC',
    message:
      'Your EU-UK corridor escrow has been released. £800,000 USDC transferred to recipient wallet.',
    metadata: { corridor: 'EU-UK', amount: 800000 },
    isRead: true,
    createdDaysAgo: 17,
  },
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    type: 'KYB_VERIFIED',
    priority: 'MEDIUM',
    title: 'FCA authorization verified',
    message:
      'Your FCA authorization (FCA-654321) has been verified and confirmed for the current regulatory period.',
    metadata: { licenseNumber: 'FCA-654321', regulatoryBody: 'FCA' },
    isRead: true,
    createdDaysAgo: 180,
  },
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    type: 'COMPLIANCE_CHECK_PASSED',
    priority: 'LOW',
    title: 'Trade compliance check passed',
    message:
      'Monthly EU-UK trade compliance review completed. All transactions verified against FCA and PRA requirements.',
    metadata: { reviewPeriod: 'February 2026', corridors: ['EU-UK'] },
    isRead: true,
    createdDaysAgo: 15,
  },
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    type: 'ESCROW_EXPIRED',
    priority: 'MEDIUM',
    title: 'Escrow expired: £400,000 USDC',
    message:
      'Your EU-UK escrow ($400,000) has expired without completion. Funded amount will be returned to your wallet.',
    metadata: { corridor: 'EU-UK', amount: 400000 },
    isRead: false,
    createdDaysAgo: 7,
  },

  // ── finance@pacificrim-exports.sg ─────────────────────────────────
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    type: 'ESCROW_RELEASED',
    priority: 'HIGH',
    title: 'Escrow released: $95,000 USDC',
    message: 'Your SG-US corridor escrow has been released. $95,000 USDC transferred successfully.',
    metadata: { corridor: 'SG-US', amount: 95000 },
    isRead: true,
    createdDaysAgo: 27,
  },
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    type: 'KYC_APPROVED',
    priority: 'MEDIUM',
    title: 'KYC verification approved',
    message: 'Pacific Rim Exports KYC has been approved. All export documentation verified.',
    metadata: { verifiedBy: 'compliance-team' },
    isRead: true,
    createdDaysAgo: 150,
  },
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    type: 'DEPOSIT_CONFIRMED',
    priority: 'HIGH',
    title: 'Deposit confirmed: $110,000 USDC',
    message: 'Your deposit of $110,000 USDC for SG-US escrow has been confirmed on-chain.',
    metadata: { corridor: 'SG-US', amount: 110000 },
    isRead: false,
    createdDaysAgo: 1,
  },
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    type: 'WALLET_WHITELISTED',
    priority: 'MEDIUM',
    title: 'Wallet whitelisted: Export Settlements',
    message:
      'Your Export Settlements wallet (Coinbase Prime / BitGo) has been verified and whitelisted.',
    metadata: { walletName: 'Export Settlements', provider: 'BitGo' },
    isRead: true,
    createdDaysAgo: 60,
  },

  // ── onboarding@nova-payments.ch ───────────────────────────────────
  {
    clientEmail: 'onboarding@nova-payments.ch',
    type: 'KYC_EXPIRING',
    priority: 'HIGH',
    title: 'KYC verification pending',
    message:
      'Your KYC verification is still pending. Please submit required documentation to activate your account.',
    metadata: {
      requiredDocuments: ['Certificate of Incorporation', 'Proof of Address', 'Director ID'],
    },
    isRead: false,
    createdDaysAgo: 2,
  },
  {
    clientEmail: 'onboarding@nova-payments.ch',
    type: 'WALLET_VERIFICATION_PENDING',
    priority: 'MEDIUM',
    title: 'Wallet setup required',
    message: 'Please register and verify a primary wallet address to complete your onboarding.',
    metadata: { step: 'wallet_registration' },
    isRead: false,
    createdDaysAgo: 3,
  },
  {
    clientEmail: 'onboarding@nova-payments.ch',
    type: 'SYSTEM_MAINTENANCE',
    priority: 'LOW',
    title: 'Welcome to EasyEscrow.ai',
    message:
      'Your institutional account has been created. Complete the onboarding steps to start using cross-border USDC escrow.',
    metadata: { onboardingSteps: ['KYC', 'KYB', 'Wallet Registration', 'First Escrow'] },
    isRead: true,
    createdDaysAgo: 7,
  },

  // ── compliance@defi-connect.co.uk ─────────────────────────────────
  {
    clientEmail: 'compliance@defi-connect.co.uk',
    type: 'ESCROW_COMPLIANCE_HOLD',
    priority: 'CRITICAL',
    title: 'Escrow under compliance review',
    message:
      'Your EU-UK escrow ($150,000) has been placed on compliance hold. Risk score: 72. Enhanced verification required.',
    metadata: { corridor: 'EU-UK', amount: 150000, riskScore: 72 },
    isRead: false,
    createdDaysAgo: 2,
  },
  {
    clientEmail: 'compliance@defi-connect.co.uk',
    type: 'KYB_EXPIRING',
    priority: 'HIGH',
    title: 'KYB review in progress',
    message:
      'Your KYB review is currently in progress. Additional documentation may be required for DeFi protocol operations.',
    metadata: { status: 'IN_REVIEW', industry: 'DeFi Infrastructure' },
    isRead: false,
    createdDaysAgo: 5,
  },
  {
    clientEmail: 'compliance@defi-connect.co.uk',
    type: 'COMPLIANCE_REVIEW_REQUIRED',
    priority: 'HIGH',
    title: 'Source of funds documentation needed',
    message:
      'Please provide additional documentation regarding your source of funds from DeFi protocol operations.',
    metadata: { requiredDocuments: ['Source of Funds Declaration', 'Protocol Revenue Report'] },
    isRead: false,
    createdDaysAgo: 8,
  },
  {
    clientEmail: 'compliance@defi-connect.co.uk',
    type: 'WALLET_VERIFICATION_PENDING',
    priority: 'MEDIUM',
    title: 'DeFi Operations wallet pending',
    message:
      'Your DeFi Operations wallet is pending verification. Multisig setup confirmation required.',
    metadata: { walletName: 'DeFi Operations', custodyType: 'MULTISIG' },
    isRead: false,
    createdDaysAgo: 10,
  },
];

// ---------------------------------------------------------------------------
// Additional accounts for clients that need more
// ---------------------------------------------------------------------------

interface ExtraAccountDef {
  clientEmail: string;
  accounts: {
    name: string;
    label?: string;
    accountType: 'TREASURY' | 'OPERATIONS' | 'SETTLEMENT' | 'COLLATERAL' | 'GENERAL';
    description?: string;
    walletAddress: string;
    walletProvider?: string;
    custodyType?: 'SELF_CUSTODY' | 'THIRD_PARTY' | 'MPC' | 'MULTISIG' | 'EXCHANGE';
    verificationStatus: 'PENDING' | 'VERIFIED' | 'SUSPENDED' | 'REJECTED';
    verifiedAt?: Date;
    approvalMode: 'AUTO' | 'SINGLE_APPROVAL' | 'MULTI_APPROVAL';
    isDefault: boolean;
  }[];
}

const extraAccounts: ExtraAccountDef[] = [
  {
    clientEmail: 'ops@helvetica-digital.ch',
    accounts: [
      {
        name: 'Collateral Reserve',
        label: 'Cold Storage Collateral',
        accountType: 'COLLATERAL',
        description: 'Cold storage collateral reserve for margin and lending operations',
        walletAddress: fakeWallet('helvetica-collateral'),
        walletProvider: 'Fireblocks',
        custodyType: 'MPC',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2026-01-10'),
        approvalMode: 'MULTI_APPROVAL',
        isDefault: false,
      },
      {
        name: 'EURC Settlement',
        label: 'Euro Stablecoin Operations',
        accountType: 'SETTLEMENT',
        description: 'Dedicated account for EURC stablecoin cross-border settlement',
        walletAddress: fakeWallet('helvetica-eurc'),
        walletProvider: 'Fireblocks',
        custodyType: 'MPC',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2026-02-01'),
        approvalMode: 'SINGLE_APPROVAL',
        isDefault: false,
      },
    ],
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    accounts: [
      {
        name: 'Collateral',
        label: 'Bridge Collateral Reserve',
        accountType: 'COLLATERAL',
        description: 'Collateral reserve for bridge liquidity backing',
        walletAddress: fakeWallet('satoshi-collateral'),
        walletProvider: 'Fordefi',
        custodyType: 'MPC',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2026-01-15'),
        approvalMode: 'MULTI_APPROVAL',
        isDefault: false,
      },
      {
        name: 'PH Corridor Settlement',
        label: 'Philippines Corridor',
        accountType: 'SETTLEMENT',
        description: 'Dedicated settlement for US-PH corridor',
        walletAddress: fakeWallet('satoshi-settlement-ph'),
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2026-02-01'),
        approvalMode: 'SINGLE_APPROVAL',
        isDefault: false,
      },
    ],
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    accounts: [
      {
        name: 'Treasury',
        label: 'Main Treasury',
        accountType: 'TREASURY',
        description: 'Primary institutional treasury for custody reserves',
        walletAddress: fakeWallet('alpine-treasury'),
        walletProvider: 'Gnosis Safe',
        custodyType: 'MULTISIG',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2026-01-05'),
        approvalMode: 'MULTI_APPROVAL',
        isDefault: false,
      },
      {
        name: 'Settlement',
        label: 'CH-US Settlement',
        accountType: 'SETTLEMENT',
        description: 'Dedicated settlement for CH-US corridor',
        walletAddress: fakeWallet('alpine-settlement'),
        verificationStatus: 'PENDING',
        approvalMode: 'SINGLE_APPROVAL',
        isDefault: false,
      },
    ],
  },
  {
    clientEmail: 'admin@aminagroup.com',
    accounts: [
      {
        name: 'Settlement',
        label: 'AMINA Settlement Pool',
        accountType: 'SETTLEMENT',
        description: 'Settlement pool for institutional client transactions',
        walletAddress: fakeWallet('amina-settlement'),
        walletProvider: 'AMINA Custody',
        custodyType: 'MPC',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2025-12-01'),
        approvalMode: 'SINGLE_APPROVAL',
        isDefault: false,
      },
      {
        name: 'General',
        label: 'General Purpose',
        accountType: 'GENERAL',
        description: 'General purpose testing and development account',
        walletAddress: fakeWallet('amina-general'),
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2025-12-01'),
        approvalMode: 'AUTO',
        isDefault: false,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main seeder
// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV !== 'staging' && !process.argv.includes('--staging')) {
    console.error('ERROR: Requires NODE_ENV=staging or --staging flag');
    process.exit(1);
  }

  console.log('=== Enhanced Institution Staging Data ===\n');

  // Check if already seeded
  const marker = await prisma.institutionAuditLog.findFirst({
    where: { action: 'ENHANCED_STAGING_SEED', details: { path: ['version'], equals: 'v1' } },
  });
  if (marker) {
    console.log('Enhanced staging data already seeded (v1). Skipping.\n');
    console.log('To re-seed, delete audit logs with action=ENHANCED_STAGING_SEED first.');
    return;
  }

  // Build client email -> id map
  const allClients = await prisma.institutionClient.findMany({ select: { id: true, email: true } });
  const clientMap = new Map(allClients.map((c) => [c.email, c.id]));

  // ── 1. Enhanced Escrows ───────────────────────────────────────────
  console.log('1. Seeding enhanced escrows...');
  let escrowCount = 0;

  for (const e of allEnhancedEscrows) {
    const clientId = clientMap.get(e.clientEmail);
    if (!clientId) {
      console.log(`   [SKIP] No client for ${e.clientEmail}`);
      continue;
    }

    // Check if already exists
    const existing = await prisma.institutionAuditLog.findFirst({
      where: { action: 'ENHANCED_STAGING_SEED', details: { path: ['seedTag'], equals: e.seedTag } },
    });
    if (existing) {
      console.log(`   [SKIP] ${e.seedTag} already exists`);
      escrowCount++;
      continue;
    }

    const escrowId = randomUUID();
    const payerWallet = fakeWallet(`payer-enh-${e.seedTag}`);
    const recipientWallet = fakeWallet(`recipient-enh-${e.seedTag}`);
    const settlementAuthority = fakeWallet(`settlement-enh-${e.seedTag}`);
    const escrowCode = generateEscrowCode(e.seedTag);

    const createdAt = daysAgo(e.createdDaysAgo);
    const expiresAt =
      e.expiresInHours > 0 ? hoursFromNow(e.expiresInHours) : daysAgo(e.createdDaysAgo - 3);
    const resolvedAt = e.isResolved ? daysAgo(Math.max(0, e.createdDaysAgo - 1)) : null;
    const fundedAt = e.isFunded ? new Date(createdAt.getTime() + 3600000) : null;

    await prisma.institutionEscrow.create({
      data: {
        escrowId,
        escrowCode,
        clientId,
        payerWallet,
        recipientWallet,
        usdcMint: USDC_MINT,
        amount: e.amount,
        platformFee: e.platformFee,
        corridor: e.corridor,
        conditionType: e.conditionType,
        status: e.status,
        settlementAuthority,
        riskScore: e.riskScore,
        escrowPda: e.hasPdas ? fakeWallet(`pda-enh-${e.seedTag}`) : null,
        vaultPda: e.hasPdas ? fakeWallet(`vault-enh-${e.seedTag}`) : null,
        depositTxSignature: e.hasTxSigs.deposit ? fakeTxSig(`deposit-enh-${e.seedTag}`) : null,
        releaseTxSignature: e.hasTxSigs.release ? fakeTxSig(`release-enh-${e.seedTag}`) : null,
        cancelTxSignature: e.hasTxSigs.cancel ? fakeTxSig(`cancel-enh-${e.seedTag}`) : null,
        expiresAt,
        createdAt,
        resolvedAt,
        fundedAt,
      },
    });

    // Deposit record
    if (e.isFunded && e.hasTxSigs.deposit) {
      await prisma.institutionDeposit.create({
        data: {
          escrowId,
          txSignature: fakeTxSig(`deposit-enh-${e.seedTag}`),
          amount: e.amount,
          confirmedAt: fundedAt,
          blockHeight: BigInt(Math.floor(200_000_000 + Math.random() * 50_000_000)),
        },
      });
    }

    // Audit logs
    const auditActions: { action: string; at: Date; details: any }[] = [
      {
        action: 'ESCROW_CREATED',
        at: createdAt,
        details: { amount: e.amount, corridor: e.corridor, escrowCode },
      },
    ];

    if (e.isFunded) {
      auditActions.push({
        action: 'DEPOSIT_CONFIRMED',
        at: fundedAt!,
        details: { amount: e.amount },
      });
    }
    if (e.status === 'COMPLIANCE_HOLD') {
      auditActions.push({
        action: 'COMPLIANCE_HOLD_PLACED',
        at: hoursAgo(12),
        details: { riskScore: e.riskScore },
      });
    }
    if (e.status === 'RELEASED') {
      auditActions.push({
        action: 'FUNDS_RELEASED',
        at: resolvedAt!,
        details: { txSignature: fakeTxSig(`release-enh-${e.seedTag}`) },
      });
    }
    if (e.status === 'CANCELLED') {
      auditActions.push({
        action: 'ESCROW_CANCELLED',
        at: resolvedAt!,
        details: { reason: 'Counterparty requested cancellation' },
      });
    }
    if (e.status === 'EXPIRED') {
      auditActions.push({
        action: 'ESCROW_EXPIRED',
        at: resolvedAt!,
        details: { reason: 'Escrow passed expiry deadline' },
      });
    }

    // Seed marker
    auditActions.push({
      action: 'ENHANCED_STAGING_SEED',
      at: createdAt,
      details: { seedTag: e.seedTag, version: 'v1' },
    });

    for (const a of auditActions) {
      await prisma.institutionAuditLog.create({
        data: {
          escrowId,
          clientId,
          action: a.action,
          actor: 'enhanced-staging-seeder',
          details: a.details,
          ipAddress: '127.0.0.1',
          createdAt: a.at,
        },
      });
    }

    // AI analysis
    if (e.riskScore !== null && e.riskScore > 0) {
      const recommendation = e.riskScore < 30 ? 'APPROVE' : e.riskScore < 60 ? 'REVIEW' : 'REJECT';
      await prisma.institutionAiAnalysis.create({
        data: {
          escrowId,
          riskScore: e.riskScore,
          factors: [
            { name: 'corridor_risk', weight: 0.3, value: e.corridor.includes('US') ? 50 : 20 },
            { name: 'amount_threshold', weight: 0.25, value: e.amount > 100_000 ? 80 : 30 },
            { name: 'client_history', weight: 0.25, value: 70 },
            { name: 'sanctions_screening', weight: 0.2, value: 10 },
          ],
          recommendation,
          extractedFields: {
            payerJurisdiction: e.corridor.split('-')[0],
            recipientJurisdiction: e.corridor.split('-')[1],
            amountUSD: e.amount,
          },
          model: 'claude-sonnet-4-20250514',
        },
      });
    }

    // File records for funded/released escrows
    if (['FUNDED', 'RELEASED', 'COMPLIANCE_HOLD'].includes(e.status)) {
      await prisma.institutionFile.create({
        data: {
          clientId,
          escrowId,
          fileName: `invoice-${escrowId.slice(0, 8)}.pdf`,
          fileKey: `institutions/${clientId}/escrows/${escrowId}/invoice-${escrowId.slice(
            0,
            8
          )}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 45_000 + Math.floor(Math.random() * 100_000),
          documentType: 'INVOICE',
        },
      });
    }

    escrowCount++;
    console.log(
      `   [OK] ${e.status} — $${e.amount.toLocaleString()} (${e.corridor}) ${e.clientEmail}`
    );
  }

  // ── 2. Notifications ──────────────────────────────────────────────
  console.log(`\n2. Seeding notifications...`);
  let notifCount = 0;

  for (const n of notifications) {
    const clientId = clientMap.get(n.clientEmail);
    if (!clientId) {
      console.log(`   [SKIP] No client for ${n.clientEmail}`);
      continue;
    }

    await (prisma as any).institutionNotification.create({
      data: {
        clientId,
        type: n.type,
        priority: n.priority,
        title: n.title,
        message: n.message,
        metadata: n.metadata,
        isRead: n.isRead,
        readAt: n.isRead ? daysAgo(Math.max(0, n.createdDaysAgo - 1)) : null,
        createdAt: daysAgo(n.createdDaysAgo),
      },
    });

    notifCount++;
    const readLabel = n.isRead ? 'read' : 'UNREAD';
    console.log(`   [OK] ${n.type} (${readLabel}) — ${n.clientEmail}`);
  }

  // ── 3. Extra Accounts ─────────────────────────────────────────────
  console.log(`\n3. Seeding extra accounts...`);
  let acctCount = 0;

  for (const ea of extraAccounts) {
    const clientId = clientMap.get(ea.clientEmail);
    if (!clientId) {
      console.log(`   [SKIP] No client for ${ea.clientEmail}`);
      continue;
    }

    for (const acct of ea.accounts) {
      try {
        await prisma.institutionAccount.upsert({
          where: {
            clientId_name: { clientId, name: acct.name },
          },
          create: {
            clientId,
            name: acct.name,
            label: acct.label || null,
            accountType: acct.accountType,
            description: acct.description || null,
            walletAddress: acct.walletAddress,
            walletProvider: acct.walletProvider || null,
            custodyType: acct.custodyType || null,
            verificationStatus: acct.verificationStatus,
            verifiedAt: acct.verifiedAt || null,
            approvalMode: acct.approvalMode,
            isDefault: acct.isDefault,
          },
          update: {
            label: acct.label || null,
            accountType: acct.accountType,
            description: acct.description || null,
            walletAddress: acct.walletAddress,
            walletProvider: acct.walletProvider || null,
            custodyType: acct.custodyType || null,
            verificationStatus: acct.verificationStatus,
            verifiedAt: acct.verifiedAt || null,
            approvalMode: acct.approvalMode,
            isDefault: acct.isDefault,
          },
        });

        acctCount++;
        console.log(`   [OK] ${acct.name} (${acct.accountType}) — ${ea.clientEmail}`);
      } catch (err: any) {
        console.log(`   [ERR] ${acct.name}: ${err.message}`);
      }
    }
  }

  // ── 4. Seed marker ────────────────────────────────────────────────
  await prisma.institutionAuditLog.create({
    data: {
      action: 'ENHANCED_STAGING_SEED',
      actor: 'enhanced-staging-seeder',
      details: { version: 'v1', seededAt: new Date().toISOString() },
      ipAddress: '127.0.0.1',
    },
  });

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n=== Enhanced Staging Data Complete ===');
  console.log(`   Escrows added: ${escrowCount}`);
  console.log(`   Notifications added: ${notifCount}`);
  console.log(`   Accounts added: ${acctCount}`);

  // Per-client escrow counts
  console.log('\n   Escrows per client:');
  const perClient: Record<string, number> = {};
  for (const e of allEnhancedEscrows) {
    perClient[e.clientEmail] = (perClient[e.clientEmail] || 0) + 1;
  }
  for (const [email, count] of Object.entries(perClient).sort()) {
    console.log(`     ${email}: +${count}`);
  }

  console.log('\n   Notifications per client:');
  const perClientNotif: Record<string, number> = {};
  for (const n of notifications) {
    perClientNotif[n.clientEmail] = (perClientNotif[n.clientEmail] || 0) + 1;
  }
  for (const [email, count] of Object.entries(perClientNotif).sort()) {
    console.log(`     ${email}: ${count}`);
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
