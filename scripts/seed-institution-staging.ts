/**
 * Seed Comprehensive Institution Staging Data
 *
 * Creates synthetic institution clients, escrows in ALL states, wallets,
 * settings, deposits, audit logs, AI analyses, and files.
 *
 * Favors AMINA-style Swiss crypto banks and crypto-native clients.
 * All data is synthetic — no real institution data.
 *
 * Usage: npx ts-node scripts/seed-institution-staging.ts
 *
 * Idempotent: uses upsert by email for clients, skips existing escrows.
 */

import { PrismaClient, Prisma } from '../src/generated/prisma';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic fake Solana address (base58-ish, 44 chars) */
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

// Staging USDC mint (devnet/staging)
const USDC_MINT = process.env.USDC_MINT_ADDRESS || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ---------------------------------------------------------------------------
// Corridor data
// ---------------------------------------------------------------------------

const corridors = [
  { code: 'SG-CH', sourceCountry: 'SG', destCountry: 'CH', minAmount: 100, maxAmount: 1_000_000, dailyLimit: 5_000_000, monthlyLimit: 50_000_000, requiredDocuments: ['INVOICE', 'CONTRACT'], riskLevel: 'LOW' },
  { code: 'US-MX', sourceCountry: 'US', destCountry: 'MX', minAmount: 100, maxAmount: 500_000, dailyLimit: 2_000_000, monthlyLimit: 20_000_000, requiredDocuments: ['INVOICE'], riskLevel: 'MEDIUM' },
  { code: 'US-PH', sourceCountry: 'US', destCountry: 'PH', minAmount: 50, maxAmount: 250_000, dailyLimit: 1_000_000, monthlyLimit: 10_000_000, requiredDocuments: ['INVOICE', 'SHIPPING_DOC'], riskLevel: 'MEDIUM' },
  { code: 'EU-UK', sourceCountry: 'EU', destCountry: 'UK', minAmount: 500, maxAmount: 2_000_000, dailyLimit: 10_000_000, monthlyLimit: 100_000_000, requiredDocuments: ['INVOICE'], riskLevel: 'LOW' },
  { code: 'SG-US', sourceCountry: 'SG', destCountry: 'US', minAmount: 100, maxAmount: 1_000_000, dailyLimit: 5_000_000, monthlyLimit: 50_000_000, requiredDocuments: ['INVOICE', 'CONTRACT'], riskLevel: 'LOW' },
  { code: 'CH-SG', sourceCountry: 'CH', destCountry: 'SG', minAmount: 100, maxAmount: 1_000_000, dailyLimit: 5_000_000, monthlyLimit: 50_000_000, requiredDocuments: ['INVOICE', 'CONTRACT'], riskLevel: 'LOW' },
  { code: 'CH-US', sourceCountry: 'CH', destCountry: 'US', minAmount: 200, maxAmount: 750_000, dailyLimit: 3_000_000, monthlyLimit: 30_000_000, requiredDocuments: ['INVOICE', 'CONTRACT', 'LETTER_OF_CREDIT'], riskLevel: 'LOW' },
];

// ---------------------------------------------------------------------------
// Client definitions — synthetic data only
// ---------------------------------------------------------------------------

interface ClientDef {
  email: string;
  companyName: string;
  tier: 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  kycStatus: string;
  jurisdiction: string;
  primaryWallet: string | null;
  // Extended KYB profile
  legalName?: string;
  tradingName?: string;
  registrationNumber?: string;
  registrationCountry?: string;
  entityType?: 'CORPORATION' | 'LLC' | 'PARTNERSHIP' | 'SOLE_PROPRIETORSHIP' | 'TRUST' | 'FOUNDATION' | 'COOPERATIVE' | 'NON_PROFIT' | 'GOVERNMENT' | 'OTHER';
  lei?: string;
  taxId?: string;
  taxCountry?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactTitle?: string;
  kybStatus?: 'NOT_STARTED' | 'PENDING' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  kybVerifiedAt?: Date;
  kybExpiresAt?: Date;
  riskRating?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNRATED';
  riskNotes?: string;
  sanctionsStatus?: 'CLEAR' | 'FLAGGED' | 'BLOCKED' | 'PENDING_REVIEW';
  sourceOfFunds?: string;
  isRegulatedEntity?: boolean;
  regulatoryStatus?: 'REGULATED' | 'UNREGULATED' | 'EXEMPT' | 'PENDING_LICENSE' | 'SUSPENDED';
  licenseType?: string;
  licenseNumber?: string;
  regulatoryBody?: string;
  industry?: string;
  websiteUrl?: string;
  businessDescription?: string;
  yearEstablished?: number;
  employeeCountRange?: 'RANGE_1_10' | 'RANGE_11_50' | 'RANGE_51_200' | 'RANGE_201_500' | 'RANGE_501_1000' | 'RANGE_1001_5000' | 'RANGE_5001_PLUS';
  annualRevenueRange?: 'UNDER_1M' | 'RANGE_1M_10M' | 'RANGE_10M_50M' | 'RANGE_50M_100M' | 'RANGE_100M_500M' | 'RANGE_500M_1B' | 'OVER_1B';
  expectedMonthlyVolume?: number;
  purposeOfAccount?: string;
  walletCustodyType?: 'SELF_CUSTODY' | 'THIRD_PARTY' | 'MPC' | 'MULTISIG' | 'EXCHANGE';
  custodianName?: string;
  preferredSettlementChain?: string;
  accountManagerName?: string;
  accountManagerEmail?: string;
  referralSource?: string;
}

const clients: ClientDef[] = [
  // ── AMINA-style Swiss crypto banks ──────────────────────────────────
  {
    email: 'ops@helvetica-digital.ch',
    companyName: 'Helvetica Digital AG',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'CH',
    primaryWallet: fakeWallet('helvetica-primary'),
    legalName: 'Helvetica Digital AG',
    tradingName: 'Helvetica Digital',
    registrationNumber: 'CHE-123.456.789',
    registrationCountry: 'CH',
    entityType: 'CORPORATION',
    lei: '5299009QN2DKJH7P2X42',
    taxId: 'CHE-123.456.789 MWST',
    taxCountry: 'CH',
    addressLine1: 'Bahnhofstrasse 42',
    city: 'Zurich',
    state: 'ZH',
    postalCode: '8001',
    country: 'CH',
    contactFirstName: 'Lena',
    contactLastName: 'Mueller',
    contactEmail: 'lena.mueller@helvetica-digital.ch',
    contactPhone: '+41-44-555-0101',
    contactTitle: 'Head of Digital Assets',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(90),
    kybExpiresAt: hoursFromNow(24 * 275),
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Licensed banking operations and institutional custody services',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'Banking License',
    licenseNumber: 'FINMA-2021-BL-0042',
    regulatoryBody: 'FINMA',
    industry: 'Digital Asset Banking',
    websiteUrl: 'https://helvetica-digital.example.ch',
    businessDescription: 'FINMA-regulated digital asset bank providing custody, trading, and cross-border settlement services for institutional clients',
    yearEstablished: 2019,
    employeeCountRange: 'RANGE_201_500',
    annualRevenueRange: 'RANGE_100M_500M',
    expectedMonthlyVolume: 15_000_000,
    purposeOfAccount: 'Cross-border USDC settlement for institutional custody clients',
    walletCustodyType: 'MPC',
    custodianName: 'Fireblocks',
    preferredSettlementChain: 'solana',
    accountManagerName: 'David Chen',
    accountManagerEmail: 'david.chen@easyescrow.example',
    referralSource: 'Solana Foundation partnership',
  },
  {
    email: 'treasury@alpine-custody.ch',
    companyName: 'Alpine Crypto Custody GmbH',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'CH',
    primaryWallet: fakeWallet('alpine-primary'),
    legalName: 'Alpine Crypto Custody GmbH',
    tradingName: 'Alpine Custody',
    registrationNumber: 'CHE-987.654.321',
    registrationCountry: 'CH',
    entityType: 'LLC',
    taxId: 'CHE-987.654.321 MWST',
    taxCountry: 'CH',
    addressLine1: 'Bundesplatz 10',
    city: 'Bern',
    state: 'BE',
    postalCode: '3011',
    country: 'CH',
    contactFirstName: 'Marco',
    contactLastName: 'Brunetti',
    contactEmail: 'marco.brunetti@alpine-custody.ch',
    contactPhone: '+41-31-555-0202',
    contactTitle: 'Chief Operations Officer',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(60),
    kybExpiresAt: hoursFromNow(24 * 305),
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Institutional custody fees and staking revenue',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'Securities Dealer License',
    licenseNumber: 'FINMA-2020-SD-0078',
    regulatoryBody: 'FINMA',
    industry: 'Crypto Custody',
    websiteUrl: 'https://alpine-custody.example.ch',
    businessDescription: 'Regulated crypto custody provider specializing in institutional-grade cold storage and staking services',
    yearEstablished: 2020,
    employeeCountRange: 'RANGE_51_200',
    annualRevenueRange: 'RANGE_10M_50M',
    expectedMonthlyVolume: 5_000_000,
    purposeOfAccount: 'Custody settlement and cross-border institutional transfers',
    walletCustodyType: 'MULTISIG',
    preferredSettlementChain: 'solana',
    accountManagerName: 'David Chen',
    accountManagerEmail: 'david.chen@easyescrow.example',
    referralSource: 'Industry referral',
  },

  // ── Crypto-native clients ──────────────────────────────────────────
  {
    email: 'finance@satoshi-bridge.io',
    companyName: 'Satoshi Bridge Labs Inc',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'US',
    primaryWallet: fakeWallet('satoshi-bridge-primary'),
    legalName: 'Satoshi Bridge Labs Inc',
    tradingName: 'SatoshiBridge',
    registrationNumber: 'DE-12345678',
    registrationCountry: 'US',
    entityType: 'CORPORATION',
    lei: '254900OPPU84GM83MG36',
    taxId: '82-1234567',
    taxCountry: 'US',
    addressLine1: '100 Market Street, Suite 300',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
    contactFirstName: 'Sarah',
    contactLastName: 'Nakamura',
    contactEmail: 'sarah.nakamura@satoshi-bridge.io',
    contactPhone: '+1-415-555-0303',
    contactTitle: 'VP of Treasury',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(120),
    kybExpiresAt: hoursFromNow(24 * 245),
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Bridge protocol fees and venture capital',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'Money Transmitter License',
    licenseNumber: 'NMLS-987654',
    regulatoryBody: 'FinCEN / State DFPI',
    industry: 'Cross-Chain Infrastructure',
    websiteUrl: 'https://satoshi-bridge.example.io',
    businessDescription: 'Cross-chain bridge protocol enabling institutional USDC transfers across Solana, Ethereum, and traditional rail',
    yearEstablished: 2021,
    employeeCountRange: 'RANGE_51_200',
    annualRevenueRange: 'RANGE_50M_100M',
    expectedMonthlyVolume: 25_000_000,
    purposeOfAccount: 'High-volume USDC settlement for bridge liquidity pools',
    walletCustodyType: 'MPC',
    custodianName: 'Fordefi',
    preferredSettlementChain: 'solana',
    accountManagerName: 'Lisa Park',
    accountManagerEmail: 'lisa.park@easyescrow.example',
    referralSource: 'Solana Breakpoint 2025',
  },
  {
    email: 'ops@chainflow-remit.sg',
    companyName: 'ChainFlow Remittance Pte Ltd',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'SG',
    primaryWallet: fakeWallet('chainflow-primary'),
    legalName: 'ChainFlow Remittance Pte Ltd',
    tradingName: 'ChainFlow',
    registrationNumber: '202312345G',
    registrationCountry: 'SG',
    entityType: 'CORPORATION',
    taxId: 'T20SG12345G',
    taxCountry: 'SG',
    addressLine1: '1 Raffles Place, #20-01',
    city: 'Singapore',
    postalCode: '048616',
    country: 'SG',
    contactFirstName: 'Wei',
    contactLastName: 'Tan',
    contactEmail: 'wei.tan@chainflow-remit.sg',
    contactPhone: '+65-6555-0404',
    contactTitle: 'Managing Director',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(45),
    kybExpiresAt: hoursFromNow(24 * 320),
    riskRating: 'MEDIUM',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Remittance service fees and institutional partnerships',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'Major Payment Institution License',
    licenseNumber: 'MAS-PS-2023-0456',
    regulatoryBody: 'MAS',
    industry: 'Crypto Remittance',
    websiteUrl: 'https://chainflow-remit.example.sg',
    businessDescription: 'MAS-licensed crypto remittance platform serving SG-ASEAN corridors with USDC settlement',
    yearEstablished: 2022,
    employeeCountRange: 'RANGE_11_50',
    annualRevenueRange: 'RANGE_10M_50M',
    expectedMonthlyVolume: 8_000_000,
    purposeOfAccount: 'USDC remittance settlement for SG-CH and SG-US corridors',
    walletCustodyType: 'THIRD_PARTY',
    custodianName: 'Cobo Custody',
    preferredSettlementChain: 'solana',
    accountManagerName: 'David Chen',
    accountManagerEmail: 'david.chen@easyescrow.example',
    referralSource: 'MAS FinTech Festival',
  },
  {
    email: 'admin@blockvault-assets.com',
    companyName: 'BlockVault Digital Assets LLC',
    tier: 'STANDARD',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'US',
    primaryWallet: fakeWallet('blockvault-primary'),
    legalName: 'BlockVault Digital Assets LLC',
    tradingName: 'BlockVault',
    registrationNumber: 'LLC-US-7890123',
    registrationCountry: 'US',
    entityType: 'LLC',
    taxId: '47-7890123',
    taxCountry: 'US',
    addressLine1: '200 West Street, Floor 12',
    city: 'New York',
    state: 'NY',
    postalCode: '10282',
    country: 'US',
    contactFirstName: 'James',
    contactLastName: 'Rivera',
    contactEmail: 'james.rivera@blockvault-assets.com',
    contactPhone: '+1-212-555-0505',
    contactTitle: 'Fund Manager',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(30),
    kybExpiresAt: hoursFromNow(24 * 335),
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Fund subscriptions and digital asset trading profits',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'Investment Adviser',
    licenseNumber: 'SEC-IA-2024-0789',
    regulatoryBody: 'SEC',
    industry: 'Digital Asset Fund Management',
    websiteUrl: 'https://blockvault-assets.example.com',
    businessDescription: 'SEC-registered digital asset fund managing institutional portfolios across DeFi and CeFi strategies',
    yearEstablished: 2023,
    employeeCountRange: 'RANGE_11_50',
    annualRevenueRange: 'RANGE_1M_10M',
    expectedMonthlyVolume: 2_000_000,
    purposeOfAccount: 'Fund settlement and OTC USDC transfers',
    walletCustodyType: 'SELF_CUSTODY',
    preferredSettlementChain: 'solana',
    accountManagerName: 'Lisa Park',
    accountManagerEmail: 'lisa.park@easyescrow.example',
    referralSource: 'Web signup',
  },

  // ── Traditional finance / trade finance ─────────────────────────────
  {
    email: 'treasury@meridian-trade.co.uk',
    companyName: 'Meridian Trade Finance Corp',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'UK',
    primaryWallet: fakeWallet('meridian-primary'),
    legalName: 'Meridian Trade Finance Corporation',
    tradingName: 'Meridian TFC',
    registrationNumber: 'UK-08765432',
    registrationCountry: 'GB',
    entityType: 'CORPORATION',
    lei: '213800ABCD1234567890',
    taxId: 'GB876543210',
    taxCountry: 'GB',
    addressLine1: '25 Old Broad Street',
    city: 'London',
    state: 'Greater London',
    postalCode: 'EC2N 1HQ',
    country: 'GB',
    contactFirstName: 'Emma',
    contactLastName: 'Whitfield',
    contactEmail: 'emma.whitfield@meridian-trade.co.uk',
    contactPhone: '+44-20-7555-0606',
    contactTitle: 'Director of Treasury',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(180),
    kybExpiresAt: hoursFromNow(24 * 185),
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Trade finance operations and letter-of-credit fees',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'FCA Authorization',
    licenseNumber: 'FCA-654321',
    regulatoryBody: 'FCA',
    industry: 'Trade Finance',
    websiteUrl: 'https://meridian-trade.example.co.uk',
    businessDescription: 'FCA-authorized trade finance house providing cross-border LC and USDC settlement for commodity importers',
    yearEstablished: 2015,
    employeeCountRange: 'RANGE_501_1000',
    annualRevenueRange: 'RANGE_500M_1B',
    expectedMonthlyVolume: 50_000_000,
    purposeOfAccount: 'Trade settlement for EU-UK commodity corridors',
    walletCustodyType: 'THIRD_PARTY',
    custodianName: 'Anchorage Digital',
    preferredSettlementChain: 'solana',
    accountManagerName: 'David Chen',
    accountManagerEmail: 'david.chen@easyescrow.example',
    referralSource: 'Partnership with UK Trade Finance Association',
  },
  {
    email: 'finance@pacificrim-exports.sg',
    companyName: 'Pacific Rim Exports Pte Ltd',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'SG',
    primaryWallet: fakeWallet('pacificrim-primary'),
    legalName: 'Pacific Rim Exports Pte Ltd',
    tradingName: 'Pacific Rim Exports',
    registrationNumber: '201998765Z',
    registrationCountry: 'SG',
    entityType: 'CORPORATION',
    taxId: 'T19SG98765Z',
    taxCountry: 'SG',
    addressLine1: '80 Robinson Road, #10-01',
    city: 'Singapore',
    postalCode: '068898',
    country: 'SG',
    contactFirstName: 'Priya',
    contactLastName: 'Sharma',
    contactEmail: 'priya.sharma@pacificrim-exports.sg',
    contactPhone: '+65-6555-0707',
    contactTitle: 'CFO',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(150),
    kybExpiresAt: hoursFromNow(24 * 215),
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Export revenue and trade receivables',
    isRegulatedEntity: false,
    regulatoryStatus: 'EXEMPT',
    industry: 'Export Trading',
    websiteUrl: 'https://pacificrim-exports.example.sg',
    businessDescription: 'Singapore-based commodity exporter leveraging USDC for fast cross-border settlement with US and Swiss buyers',
    yearEstablished: 2018,
    employeeCountRange: 'RANGE_51_200',
    annualRevenueRange: 'RANGE_50M_100M',
    expectedMonthlyVolume: 10_000_000,
    purposeOfAccount: 'Export settlement via SG-US and SG-CH corridors',
    walletCustodyType: 'EXCHANGE',
    custodianName: 'Coinbase Prime',
    preferredSettlementChain: 'solana',
    accountManagerName: 'Lisa Park',
    accountManagerEmail: 'lisa.park@easyescrow.example',
    referralSource: 'Singapore FinTech Association',
  },

  // ── Pending / verification-in-progress ──────────────────────────────
  {
    email: 'onboarding@nova-payments.ch',
    companyName: 'Nova Digital Payments SA',
    tier: 'STANDARD',
    status: 'PENDING_VERIFICATION',
    kycStatus: 'PENDING',
    jurisdiction: 'CH',
    primaryWallet: null,
    legalName: 'Nova Digital Payments SA',
    registrationNumber: 'CHE-111.222.333',
    registrationCountry: 'CH',
    entityType: 'CORPORATION',
    country: 'CH',
    city: 'Geneva',
    postalCode: '1204',
    addressLine1: 'Rue du Rhone 14',
    contactFirstName: 'Antoine',
    contactLastName: 'Dupont',
    contactEmail: 'antoine.dupont@nova-payments.ch',
    contactPhone: '+41-22-555-0808',
    contactTitle: 'Founder & CEO',
    kybStatus: 'PENDING',
    riskRating: 'UNRATED',
    sanctionsStatus: 'PENDING_REVIEW',
    industry: 'Digital Payments',
    businessDescription: 'Stablecoin payment processor targeting Swiss SME market',
    yearEstablished: 2025,
    employeeCountRange: 'RANGE_1_10',
    annualRevenueRange: 'UNDER_1M',
    walletCustodyType: 'SELF_CUSTODY',
    preferredSettlementChain: 'solana',
    referralSource: 'Crypto Valley Association',
  },

  // ── KYB in review ───────────────────────────────────────────────────
  {
    email: 'compliance@defi-connect.co.uk',
    companyName: 'DeFi Connect Holdings Ltd',
    tier: 'STANDARD',
    status: 'ACTIVE',
    kycStatus: 'PENDING',
    jurisdiction: 'UK',
    primaryWallet: fakeWallet('defi-connect-primary'),
    legalName: 'DeFi Connect Holdings Ltd',
    registrationNumber: 'UK-11223344',
    registrationCountry: 'GB',
    entityType: 'CORPORATION',
    country: 'GB',
    city: 'London',
    postalCode: 'E14 5AB',
    addressLine1: '40 Bank Street, Canary Wharf',
    contactFirstName: 'Oliver',
    contactLastName: 'Grant',
    contactEmail: 'oliver.grant@defi-connect.co.uk',
    contactPhone: '+44-20-7555-0909',
    contactTitle: 'Head of Compliance',
    kybStatus: 'IN_REVIEW',
    riskRating: 'MEDIUM',
    sanctionsStatus: 'PENDING_REVIEW',
    sourceOfFunds: 'DeFi protocol revenue and VC funding',
    isRegulatedEntity: false,
    regulatoryStatus: 'PENDING_LICENSE',
    industry: 'DeFi Infrastructure',
    businessDescription: 'DeFi aggregation platform connecting institutional liquidity with on-chain protocols',
    yearEstablished: 2023,
    employeeCountRange: 'RANGE_11_50',
    annualRevenueRange: 'RANGE_1M_10M',
    expectedMonthlyVolume: 3_000_000,
    purposeOfAccount: 'OTC desk USDC settlement for institutional DeFi access',
    walletCustodyType: 'MULTISIG',
    preferredSettlementChain: 'solana',
    referralSource: 'DeFi London meetup',
  },

  // ── Suspended (compliance issue) ────────────────────────────────────
  {
    email: 'admin@frontier-exchange.ch',
    companyName: 'Frontier Crypto Exchange AG',
    tier: 'STANDARD',
    status: 'SUSPENDED',
    kycStatus: 'VERIFIED',
    jurisdiction: 'CH',
    primaryWallet: fakeWallet('frontier-primary'),
    legalName: 'Frontier Crypto Exchange AG',
    registrationNumber: 'CHE-444.555.666',
    registrationCountry: 'CH',
    entityType: 'CORPORATION',
    country: 'CH',
    city: 'Zug',
    postalCode: '6300',
    addressLine1: 'Baarerstrasse 78',
    contactFirstName: 'Klaus',
    contactLastName: 'Richter',
    contactEmail: 'klaus.richter@frontier-exchange.ch',
    contactPhone: '+41-41-555-1010',
    contactTitle: 'General Manager',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(200),
    kybExpiresAt: daysAgo(10), // expired KYB
    riskRating: 'HIGH',
    riskNotes: 'Sanctions screening flagged potential indirect exposure to restricted jurisdiction. Account suspended pending enhanced due diligence review.',
    sanctionsStatus: 'FLAGGED',
    sourceOfFunds: 'Exchange trading fees',
    isRegulatedEntity: true,
    regulatoryStatus: 'SUSPENDED',
    licenseType: 'VQF SRO Membership',
    licenseNumber: 'VQF-2022-0199',
    regulatoryBody: 'VQF (SRO)',
    industry: 'Crypto Exchange',
    businessDescription: 'Swiss crypto exchange — currently suspended due to compliance review',
    yearEstablished: 2022,
    employeeCountRange: 'RANGE_11_50',
    annualRevenueRange: 'RANGE_1M_10M',
    walletCustodyType: 'SELF_CUSTODY',
    preferredSettlementChain: 'solana',
    referralSource: 'Crypto Valley directory',
  },
];

// ---------------------------------------------------------------------------
// Escrow definitions — one per status, across multiple clients/corridors
// ---------------------------------------------------------------------------

interface EscrowDef {
  clientEmail: string;
  status: string;
  amount: number;
  platformFee: number;
  corridor: string;
  conditionType: 'ADMIN_RELEASE' | 'TIME_LOCK' | 'COMPLIANCE_CHECK';
  riskScore: number | null;
  /** Escrow created N days ago */
  createdDaysAgo: number;
  expiresInHours: number;
  hasTxSigs: { deposit?: boolean; release?: boolean; cancel?: boolean };
  hasPdas: boolean;
  isFunded: boolean;
  isResolved: boolean;
}

const escrows: EscrowDef[] = [
  // CREATED — just created, awaiting funding
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'CREATED',
    amount: 50_000,
    platformFee: 250,
    corridor: 'CH-SG',
    conditionType: 'ADMIN_RELEASE',
    riskScore: null,
    createdDaysAgo: 0,
    expiresInHours: 72,
    hasTxSigs: {},
    hasPdas: true,
    isFunded: false,
    isResolved: false,
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'CREATED',
    amount: 100_000,
    platformFee: 500,
    corridor: 'US-MX',
    conditionType: 'TIME_LOCK',
    riskScore: null,
    createdDaysAgo: 0,
    expiresInHours: 48,
    hasTxSigs: {},
    hasPdas: true,
    isFunded: false,
    isResolved: false,
  },

  // FUNDED — deposit confirmed, ready for release
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'FUNDED',
    amount: 250_000,
    platformFee: 1_250,
    corridor: 'SG-CH',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 15,
    createdDaysAgo: 2,
    expiresInHours: 48,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
  },
  {
    clientEmail: 'ops@chainflow-remit.sg',
    status: 'FUNDED',
    amount: 75_000,
    platformFee: 375,
    corridor: 'SG-US',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 22,
    createdDaysAgo: 1,
    expiresInHours: 60,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
  },

  // COMPLIANCE_HOLD — under compliance review
  {
    clientEmail: 'treasury@alpine-custody.ch',
    status: 'COMPLIANCE_HOLD',
    amount: 500_000,
    platformFee: 2_500,
    corridor: 'CH-US',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 65,
    createdDaysAgo: 3,
    expiresInHours: 24,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
  },
  {
    clientEmail: 'compliance@defi-connect.co.uk',
    status: 'COMPLIANCE_HOLD',
    amount: 150_000,
    platformFee: 750,
    corridor: 'EU-UK',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 72,
    createdDaysAgo: 2,
    expiresInHours: 36,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
  },

  // RELEASING — release tx in progress
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    status: 'RELEASING',
    amount: 1_000_000,
    platformFee: 5_000,
    corridor: 'EU-UK',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 10,
    createdDaysAgo: 5,
    expiresInHours: 12,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
  },

  // RELEASED — completed successfully
  {
    clientEmail: 'ops@helvetica-digital.ch',
    status: 'RELEASED',
    amount: 200_000,
    platformFee: 1_000,
    corridor: 'CH-SG',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 8,
    createdDaysAgo: 10,
    expiresInHours: -1, // expired (but already released)
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'RELEASED',
    amount: 500_000,
    platformFee: 2_500,
    corridor: 'US-MX',
    conditionType: 'TIME_LOCK',
    riskScore: 12,
    createdDaysAgo: 14,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
  },
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    status: 'RELEASED',
    amount: 180_000,
    platformFee: 900,
    corridor: 'SG-US',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 18,
    createdDaysAgo: 7,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, release: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
  },

  // CANCELLING — cancellation in progress
  {
    clientEmail: 'admin@blockvault-assets.com',
    status: 'CANCELLING',
    amount: 30_000,
    platformFee: 150,
    corridor: 'US-PH',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 45,
    createdDaysAgo: 4,
    expiresInHours: 6,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: false,
  },

  // CANCELLED — cancelled and refunded
  {
    clientEmail: 'ops@chainflow-remit.sg',
    status: 'CANCELLED',
    amount: 60_000,
    platformFee: 300,
    corridor: 'SG-CH',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 30,
    createdDaysAgo: 12,
    expiresInHours: -1,
    hasTxSigs: { deposit: true, cancel: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    status: 'CANCELLED',
    amount: 25_000,
    platformFee: 125,
    corridor: 'CH-SG',
    conditionType: 'TIME_LOCK',
    riskScore: null,
    createdDaysAgo: 20,
    expiresInHours: -1,
    hasTxSigs: { cancel: true },
    hasPdas: true,
    isFunded: false, // cancelled before funding
    isResolved: true,
  },

  // EXPIRED — expired before completion
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    status: 'EXPIRED',
    amount: 400_000,
    platformFee: 2_000,
    corridor: 'EU-UK',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 55,
    createdDaysAgo: 8,
    expiresInHours: -1,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
  },
  {
    clientEmail: 'admin@blockvault-assets.com',
    status: 'EXPIRED',
    amount: 10_000,
    platformFee: 50,
    corridor: 'US-MX',
    conditionType: 'ADMIN_RELEASE',
    riskScore: null,
    createdDaysAgo: 15,
    expiresInHours: -1,
    hasTxSigs: {},
    hasPdas: true,
    isFunded: false, // expired before funding
    isResolved: true,
  },

  // FAILED — unrecoverable error
  {
    clientEmail: 'finance@satoshi-bridge.io',
    status: 'FAILED',
    amount: 75_000,
    platformFee: 375,
    corridor: 'CH-US',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 40,
    createdDaysAgo: 6,
    expiresInHours: -1,
    hasTxSigs: { deposit: true },
    hasPdas: true,
    isFunded: true,
    isResolved: true,
  },
];

// ---------------------------------------------------------------------------
// Main seeder
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Institution Staging Data Seeder ===\n');

  // ── 1. Corridors ─────────────────────────────────────────────────
  console.log('1. Seeding corridors...');
  for (const c of corridors) {
    await prisma.institutionCorridor.upsert({
      where: { code: c.code },
      create: c,
      update: c,
    });
    console.log(`   [OK] ${c.code} (${c.riskLevel} risk)`);
  }

  // ── 2. Clients with full KYB profiles ────────────────────────────
  console.log('\n2. Seeding institution clients...');
  const demoPassword = await bcrypt.hash('StagingPass123!', 12);
  const clientMap = new Map<string, string>(); // email -> id

  for (const c of clients) {
    const data: any = {
      email: c.email,
      passwordHash: demoPassword,
      companyName: c.companyName,
      tier: c.tier,
      status: c.status,
      kycStatus: c.kycStatus,
      jurisdiction: c.jurisdiction,
      primaryWallet: c.primaryWallet,
      isTestAccount: true,
      // KYB profile fields
      legalName: c.legalName,
      tradingName: c.tradingName,
      registrationNumber: c.registrationNumber,
      registrationCountry: c.registrationCountry,
      entityType: c.entityType,
      lei: c.lei,
      taxId: c.taxId,
      taxCountry: c.taxCountry,
      addressLine1: c.addressLine1,
      city: c.city,
      state: c.state,
      postalCode: c.postalCode,
      country: c.country,
      contactFirstName: c.contactFirstName,
      contactLastName: c.contactLastName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      contactTitle: c.contactTitle,
      kybStatus: c.kybStatus,
      kybVerifiedAt: c.kybVerifiedAt,
      kybExpiresAt: c.kybExpiresAt,
      riskRating: c.riskRating,
      riskNotes: c.riskNotes,
      sanctionsStatus: c.sanctionsStatus,
      sourceOfFunds: c.sourceOfFunds,
      isRegulatedEntity: c.isRegulatedEntity,
      regulatoryStatus: c.regulatoryStatus,
      licenseType: c.licenseType,
      licenseNumber: c.licenseNumber,
      regulatoryBody: c.regulatoryBody,
      industry: c.industry,
      websiteUrl: c.websiteUrl,
      businessDescription: c.businessDescription,
      yearEstablished: c.yearEstablished,
      employeeCountRange: c.employeeCountRange,
      annualRevenueRange: c.annualRevenueRange,
      expectedMonthlyVolume: c.expectedMonthlyVolume,
      purposeOfAccount: c.purposeOfAccount,
      walletCustodyType: c.walletCustodyType,
      custodianName: c.custodianName,
      preferredSettlementChain: c.preferredSettlementChain,
      accountManagerName: c.accountManagerName,
      accountManagerEmail: c.accountManagerEmail,
      referralSource: c.referralSource,
    };

    // Remove undefined keys so Prisma doesn't complain
    for (const k of Object.keys(data)) {
      if (data[k] === undefined) delete data[k];
    }

    const client = await prisma.institutionClient.upsert({
      where: { email: c.email },
      create: data,
      update: data,
    });
    clientMap.set(c.email, client.id);
    console.log(`   [OK] ${c.companyName} (${c.tier}, ${c.status}, KYB: ${c.kybStatus ?? 'n/a'})`);
  }

  // ── 3. Client settings ───────────────────────────────────────────
  console.log('\n3. Seeding client settings...');
  const settingsData: { email: string; corridor: string | null; timezone: string; autoApprove?: number }[] = [
    { email: 'ops@helvetica-digital.ch', corridor: 'CH-SG', timezone: 'Europe/Zurich', autoApprove: 50_000 },
    { email: 'treasury@alpine-custody.ch', corridor: 'CH-US', timezone: 'Europe/Zurich', autoApprove: 25_000 },
    { email: 'finance@satoshi-bridge.io', corridor: 'US-MX', timezone: 'America/Los_Angeles', autoApprove: 100_000 },
    { email: 'ops@chainflow-remit.sg', corridor: 'SG-CH', timezone: 'Asia/Singapore', autoApprove: 50_000 },
    { email: 'admin@blockvault-assets.com', corridor: 'US-PH', timezone: 'America/New_York' },
    { email: 'treasury@meridian-trade.co.uk', corridor: 'EU-UK', timezone: 'Europe/London', autoApprove: 200_000 },
    { email: 'finance@pacificrim-exports.sg', corridor: 'SG-US', timezone: 'Asia/Singapore', autoApprove: 75_000 },
    { email: 'onboarding@nova-payments.ch', corridor: null, timezone: 'Europe/Zurich' },
    { email: 'compliance@defi-connect.co.uk', corridor: 'EU-UK', timezone: 'Europe/London' },
    { email: 'admin@frontier-exchange.ch', corridor: 'CH-SG', timezone: 'Europe/Zurich' },
  ];

  for (const s of settingsData) {
    const clientId = clientMap.get(s.email);
    if (!clientId) continue;
    await prisma.institutionClientSettings.upsert({
      where: { clientId },
      create: {
        clientId,
        defaultCorridor: s.corridor,
        timezone: s.timezone,
        autoApproveThreshold: s.autoApprove ?? null,
        notificationEmail: s.email,
      },
      update: {
        defaultCorridor: s.corridor,
        timezone: s.timezone,
        autoApproveThreshold: s.autoApprove ?? null,
        notificationEmail: s.email,
      },
    });
    console.log(`   [OK] Settings for ${s.email}`);
  }

  // ── 4. Wallets ───────────────────────────────────────────────────
  console.log('\n4. Seeding wallets...');
  const walletDefs: { email: string; wallets: { name: string; address: string; isPrimary: boolean; isSettlement: boolean; provider?: string }[] }[] = [
    {
      email: 'ops@helvetica-digital.ch',
      wallets: [
        { name: 'Operations Wallet', address: fakeWallet('helvetica-ops'), isPrimary: true, isSettlement: false, provider: 'Fireblocks' },
        { name: 'Settlement Vault', address: fakeWallet('helvetica-settle'), isPrimary: false, isSettlement: true, provider: 'Fireblocks' },
        { name: 'Treasury Cold', address: fakeWallet('helvetica-cold'), isPrimary: false, isSettlement: false, provider: 'Fireblocks' },
      ],
    },
    {
      email: 'treasury@alpine-custody.ch',
      wallets: [
        { name: 'Primary Multisig', address: fakeWallet('alpine-multi'), isPrimary: true, isSettlement: false },
        { name: 'Settlement Multisig', address: fakeWallet('alpine-settle'), isPrimary: false, isSettlement: true },
      ],
    },
    {
      email: 'finance@satoshi-bridge.io',
      wallets: [
        { name: 'Bridge Hot Wallet', address: fakeWallet('satoshi-hot'), isPrimary: true, isSettlement: false, provider: 'Fordefi' },
        { name: 'Settlement Wallet', address: fakeWallet('satoshi-settle'), isPrimary: false, isSettlement: true, provider: 'Fordefi' },
      ],
    },
    {
      email: 'ops@chainflow-remit.sg',
      wallets: [
        { name: 'Remittance Wallet', address: fakeWallet('chainflow-remit'), isPrimary: true, isSettlement: true, provider: 'Cobo' },
      ],
    },
    {
      email: 'treasury@meridian-trade.co.uk',
      wallets: [
        { name: 'Trade Settlement', address: fakeWallet('meridian-trade'), isPrimary: true, isSettlement: true, provider: 'Anchorage' },
        { name: 'Treasury Reserve', address: fakeWallet('meridian-reserve'), isPrimary: false, isSettlement: false, provider: 'Anchorage' },
      ],
    },
    {
      email: 'finance@pacificrim-exports.sg',
      wallets: [
        { name: 'Export Settlement', address: fakeWallet('pacificrim-settle'), isPrimary: true, isSettlement: true, provider: 'Coinbase Prime' },
      ],
    },
  ];

  for (const wd of walletDefs) {
    const clientId = clientMap.get(wd.email);
    if (!clientId) continue;
    // Delete existing wallets for this client to avoid duplicates
    await prisma.institutionWallet.deleteMany({ where: { clientId } });
    for (const w of wd.wallets) {
      await prisma.institutionWallet.create({
        data: { clientId, name: w.name, address: w.address, isPrimary: w.isPrimary, isSettlement: w.isSettlement, provider: w.provider },
      });
    }
    console.log(`   [OK] ${wd.wallets.length} wallets for ${wd.email}`);
  }

  // ── 5. Escrows in ALL states ─────────────────────────────────────
  console.log('\n5. Seeding escrows (all statuses)...');
  const statusCounts: Record<string, number> = {};

  for (let i = 0; i < escrows.length; i++) {
    const e = escrows[i];
    const clientId = clientMap.get(e.clientEmail);
    if (!clientId) {
      console.log(`   [SKIP] No client for ${e.clientEmail}`);
      continue;
    }

    const escrowId = randomUUID();
    const tag = `staging-seed-${i}`;
    const payerWallet = fakeWallet(`payer-${tag}`);
    const recipientWallet = fakeWallet(`recipient-${tag}`);
    const settlementAuthority = fakeWallet(`settlement-${tag}`);

    const createdAt = daysAgo(e.createdDaysAgo);
    const expiresAt = e.expiresInHours > 0 ? hoursFromNow(e.expiresInHours) : daysAgo(e.createdDaysAgo - 3); // expired in past
    const resolvedAt = e.isResolved ? daysAgo(Math.max(0, e.createdDaysAgo - 1)) : null;
    const fundedAt = e.isFunded ? new Date(createdAt.getTime() + 3600000) : null; // 1 hour after creation

    // Check if we already have an escrow from this seed run (by checking audit log)
    const existing = await prisma.institutionAuditLog.findFirst({
      where: { action: 'STAGING_SEED', details: { path: ['seedTag'], equals: tag } },
    });
    if (existing) {
      console.log(`   [SKIP] Escrow seed ${tag} already exists`);
      statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
      continue;
    }

    const escrowData: any = {
      escrowId,
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
      escrowPda: e.hasPdas ? fakeWallet(`pda-${tag}`) : null,
      vaultPda: e.hasPdas ? fakeWallet(`vault-${tag}`) : null,
      depositTxSignature: e.hasTxSigs.deposit ? fakeTxSig(`deposit-${tag}`) : null,
      releaseTxSignature: e.hasTxSigs.release ? fakeTxSig(`release-${tag}`) : null,
      cancelTxSignature: e.hasTxSigs.cancel ? fakeTxSig(`cancel-${tag}`) : null,
      expiresAt,
      createdAt,
      resolvedAt,
      fundedAt,
    };

    const createdEscrow = await prisma.institutionEscrow.create({ data: escrowData });

    // Create deposit record if funded
    if (e.isFunded && e.hasTxSigs.deposit) {
      await prisma.institutionDeposit.create({
        data: {
          escrowId,
          txSignature: fakeTxSig(`deposit-${tag}`),
          amount: e.amount,
          confirmedAt: fundedAt,
          blockHeight: BigInt(Math.floor(200_000_000 + Math.random() * 50_000_000)),
        },
      });
    }

    // Create audit logs for the escrow lifecycle
    const auditActions: { action: string; at: Date; details: any }[] = [
      { action: 'ESCROW_CREATED', at: createdAt, details: { amount: e.amount, corridor: e.corridor } },
    ];

    if (e.isFunded) {
      auditActions.push({ action: 'DEPOSIT_CONFIRMED', at: fundedAt!, details: { amount: e.amount } });
    }

    if (e.status === 'COMPLIANCE_HOLD') {
      auditActions.push({ action: 'COMPLIANCE_HOLD_PLACED', at: hoursAgo(12), details: { riskScore: e.riskScore, reason: 'Automated compliance screening triggered' } });
    }

    if (e.status === 'RELEASED') {
      auditActions.push({ action: 'FUNDS_RELEASED', at: resolvedAt!, details: { txSignature: escrowData.releaseTxSignature } });
    }

    if (e.status === 'CANCELLED') {
      auditActions.push({ action: 'ESCROW_CANCELLED', at: resolvedAt!, details: { reason: e.isFunded ? 'Counterparty requested cancellation' : 'Cancelled before funding' } });
    }

    if (e.status === 'EXPIRED') {
      auditActions.push({ action: 'ESCROW_EXPIRED', at: resolvedAt!, details: { reason: 'Escrow passed expiry deadline' } });
    }

    if (e.status === 'FAILED') {
      auditActions.push({ action: 'ESCROW_FAILED', at: resolvedAt!, details: { error: 'On-chain transaction simulation failed after 3 retries' } });
    }

    // Add seed marker audit log
    auditActions.push({ action: 'STAGING_SEED', at: createdAt, details: { seedTag: tag, seededAt: new Date().toISOString() } });

    for (const a of auditActions) {
      await prisma.institutionAuditLog.create({
        data: {
          escrowId,
          clientId,
          action: a.action,
          actor: 'staging-seeder',
          details: a.details,
          ipAddress: '127.0.0.1',
          createdAt: a.at,
        },
      });
    }

    // Create AI analysis for compliance-relevant escrows
    if (e.riskScore !== null && e.riskScore > 0) {
      const recommendation = e.riskScore < 30 ? 'APPROVE' : e.riskScore < 60 ? 'REVIEW' : 'REJECT';
      await prisma.institutionAiAnalysis.create({
        data: {
          escrowId,
          riskScore: e.riskScore,
          factors: [
            { name: 'corridor_risk', weight: 0.3, value: e.corridor.includes('US') ? 'medium' : 'low' },
            { name: 'amount_threshold', weight: 0.25, value: e.amount > 100_000 ? 'high' : 'standard' },
            { name: 'client_history', weight: 0.25, value: 'established' },
            { name: 'sanctions_screening', weight: 0.2, value: 'clear' },
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

    // Create file records for some escrows (invoices, contracts)
    if (['FUNDED', 'RELEASED', 'COMPLIANCE_HOLD'].includes(e.status)) {
      await prisma.institutionFile.create({
        data: {
          clientId,
          escrowId,
          fileName: `invoice-${escrowId.slice(0, 8)}.pdf`,
          fileKey: `institutions/${clientId}/escrows/${escrowId}/invoice-${escrowId.slice(0, 8)}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 45_000 + Math.floor(Math.random() * 100_000),
          documentType: 'INVOICE',
        },
      });

      if (e.amount > 100_000) {
        await prisma.institutionFile.create({
          data: {
            clientId,
            escrowId,
            fileName: `contract-${escrowId.slice(0, 8)}.pdf`,
            fileKey: `institutions/${clientId}/escrows/${escrowId}/contract-${escrowId.slice(0, 8)}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 120_000 + Math.floor(Math.random() * 200_000),
            documentType: 'CONTRACT',
          },
        });
      }
    }

    statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
    console.log(`   [OK] ${e.status} — $${e.amount.toLocaleString()} USDC (${e.corridor}) for ${e.clientEmail}`);
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log('\n=== Seeding Complete ===');
  console.log(`   Corridors: ${corridors.length}`);
  console.log(`   Clients: ${clients.length}`);
  console.log(`   Escrows by status:`);
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`     ${status}: ${count}`);
  }
  console.log(`\n   Login: any-client-email / StagingPass123!`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
