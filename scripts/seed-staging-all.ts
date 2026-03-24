/**
 * Unified Staging Seed — All Institution Data
 *
 * Single script to populate the staging database with comprehensive, realistic
 * institution data. Every reference (escrows, payments, notifications) is wired
 * to actual clients in the database — no broken foreign keys.
 *
 * Loginable accounts (password: StagingDemo2026!):
 *   1. ops@helvetica-digital.ch        (Helvetica Digital AG, ENTERPRISE)
 *   2. treasury@alpine-custody.ch      (Alpine Crypto Custody GmbH, PREMIUM)
 *   3. finance@satoshi-bridge.io       (Satoshi Bridge Labs Inc, ENTERPRISE)
 *   4. ops@chainflow-remit.sg          (ChainFlow Remittance Pte Ltd, PREMIUM)
 *   5. admin@aminagroup.com            (AMINA Bank AG, ENTERPRISE)
 *   6. treasury@meridian-trade.co.uk   (Meridian Trade Finance Corp, ENTERPRISE)
 *   7. finance@pacificrim-exports.sg   (Pacific Rim Exports Pte Ltd, PREMIUM)
 *
 * Usage:
 *   npx ts-node scripts/seed-staging-all.ts --staging
 *   (or) npm run seed:staging:all
 */

import { PrismaClient } from '../src/generated/prisma';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}
function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3600000);
}
function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60000);
}
function hoursFromNow(n: number): Date {
  return new Date(Date.now() + n * 3600000);
}

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

function escrowCode(seed: string): string {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  return `EE-${hash.slice(0, 3).toUpperCase()}-${hash.slice(3, 6).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const USDC_MINT = process.env.USDC_MINT_ADDRESS || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

interface ClientDef {
  email: string;
  companyName: string;
  legalName?: string;
  tradingName?: string;
  tier: 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  kycStatus: string;
  kybStatus?: string;
  kybVerifiedAt?: Date;
  kybExpiresAt?: Date;
  jurisdiction: string;
  country?: string;
  city?: string;
  postalCode?: string;
  addressLine1?: string;
  state?: string;
  registrationNumber?: string;
  registrationCountry?: string;
  entityType?: string;
  lei?: string;
  taxId?: string;
  taxCountry?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactTitle?: string;
  riskRating?: string;
  sanctionsStatus?: string;
  sourceOfFunds?: string;
  isRegulatedEntity?: boolean;
  regulatoryStatus?: string;
  licenseType?: string;
  licenseNumber?: string;
  regulatoryBody?: string;
  industry?: string;
  websiteUrl?: string;
  businessDescription?: string;
  yearEstablished?: number;
  employeeCountRange?: string;
  annualRevenueRange?: string;
  expectedMonthlyVolume?: number;
  walletCustodyType?: string;
  custodianName?: string;
  preferredSettlementChain?: string;
  wallet: string;
  /** If true, this client is a counterparty only (not a loginable account) */
  counterpartyOnly?: boolean;
}

// ── 7 loginable clients ────────────────────────────────────────────────────

const loginableClients: ClientDef[] = [
  {
    email: 'ops@helvetica-digital.ch',
    companyName: 'Helvetica Digital AG',
    legalName: 'Helvetica Digital AG',
    tradingName: 'Helvetica Digital',
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
    registrationNumber: 'CHE-123.456.789',
    registrationCountry: 'CH',
    entityType: 'CORPORATION',
    lei: '5299009QN2DKJH7P2X42',
    taxId: 'CHE-123.456.789 MWST',
    taxCountry: 'CH',
    contactFirstName: 'Elena',
    contactLastName: 'Mueller',
    contactEmail: 'elena.mueller@helvetica-digital.ch',
    contactPhone: '+41 44 123 4567',
    contactTitle: 'Head of Operations',
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Licensed banking operations and institutional custody services',
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
    wallet: 'HeLv3t1cAd1g1tALwA11etAddr355000000000001',
  },
  {
    email: 'treasury@alpine-custody.ch',
    companyName: 'Alpine Crypto Custody GmbH',
    legalName: 'Alpine Crypto Custody GmbH',
    tradingName: 'Alpine Custody',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(60),
    kybExpiresAt: hoursFromNow(24 * 305),
    jurisdiction: 'CH',
    country: 'Switzerland',
    city: 'Bern',
    postalCode: '3011',
    addressLine1: 'Bundesplatz 10',
    state: 'BE',
    registrationNumber: 'CHE-987.654.321',
    registrationCountry: 'CH',
    entityType: 'LLC',
    taxId: 'CHE-987.654.321 MWST',
    taxCountry: 'CH',
    contactFirstName: 'Marco',
    contactLastName: 'Brunetti',
    contactEmail: 'marco.brunetti@alpine-custody.ch',
    contactPhone: '+41-31-555-0202',
    contactTitle: 'Chief Operations Officer',
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Institutional custody fees and staking revenue',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'Securities Dealer License',
    licenseNumber: 'FINMA-2020-SD-0078',
    regulatoryBody: 'FINMA',
    industry: 'Crypto Custody',
    websiteUrl: 'https://alpine-custody.ch',
    businessDescription:
      'Regulated crypto custody provider specializing in institutional-grade cold storage and staking',
    yearEstablished: 2020,
    employeeCountRange: 'RANGE_51_200',
    annualRevenueRange: 'RANGE_10M_50M',
    expectedMonthlyVolume: 5000000,
    walletCustodyType: 'MULTISIG',
    preferredSettlementChain: 'solana',
    wallet: fakeWallet('alpine-primary'),
  },
  {
    email: 'finance@satoshi-bridge.io',
    companyName: 'Satoshi Bridge Labs Inc',
    legalName: 'Satoshi Bridge Labs Inc',
    tradingName: 'SatoshiBridge',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(120),
    kybExpiresAt: hoursFromNow(24 * 245),
    jurisdiction: 'US',
    country: 'United States',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    addressLine1: '100 Market Street, Suite 300',
    registrationNumber: 'DE-12345678',
    registrationCountry: 'US',
    entityType: 'CORPORATION',
    lei: '254900OPPU84GM83MG36',
    taxId: '82-1234567',
    taxCountry: 'US',
    contactFirstName: 'Sarah',
    contactLastName: 'Nakamura',
    contactEmail: 'sarah.nakamura@satoshi-bridge.io',
    contactPhone: '+1-415-555-0303',
    contactTitle: 'VP of Treasury',
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Bridge protocol fees and venture capital',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'Money Transmitter License',
    licenseNumber: 'NMLS-987654',
    regulatoryBody: 'FinCEN / State DFPI',
    industry: 'Cross-Chain Infrastructure',
    websiteUrl: 'https://satoshi-bridge.io',
    businessDescription:
      'Cross-chain bridge protocol enabling institutional USDC transfers across Solana, Ethereum, and traditional rail',
    yearEstablished: 2021,
    employeeCountRange: 'RANGE_51_200',
    annualRevenueRange: 'RANGE_50M_100M',
    expectedMonthlyVolume: 25000000,
    walletCustodyType: 'MPC',
    custodianName: 'Fordefi',
    preferredSettlementChain: 'solana',
    wallet: fakeWallet('satoshi-bridge-primary'),
  },
  {
    email: 'ops@chainflow-remit.sg',
    companyName: 'ChainFlow Remittance Pte Ltd',
    legalName: 'ChainFlow Remittance Pte Ltd',
    tradingName: 'ChainFlow',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(45),
    kybExpiresAt: hoursFromNow(24 * 320),
    jurisdiction: 'SG',
    country: 'Singapore',
    city: 'Singapore',
    postalCode: '048616',
    addressLine1: '1 Raffles Place, #20-01',
    registrationNumber: '202312345G',
    registrationCountry: 'SG',
    entityType: 'CORPORATION',
    taxId: 'T20SG12345G',
    taxCountry: 'SG',
    contactFirstName: 'Wei',
    contactLastName: 'Tan',
    contactEmail: 'wei.tan@chainflow-remit.sg',
    contactPhone: '+65-6555-0404',
    contactTitle: 'Managing Director',
    riskRating: 'MEDIUM',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Remittance service fees and institutional partnerships',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'Major Payment Institution License',
    licenseNumber: 'MAS-PS-2023-0456',
    regulatoryBody: 'MAS',
    industry: 'Crypto Remittance',
    websiteUrl: 'https://chainflow-remit.sg',
    businessDescription:
      'MAS-licensed crypto remittance platform serving SG-ASEAN corridors with USDC settlement',
    yearEstablished: 2022,
    employeeCountRange: 'RANGE_11_50',
    annualRevenueRange: 'RANGE_10M_50M',
    expectedMonthlyVolume: 8000000,
    walletCustodyType: 'THIRD_PARTY',
    custodianName: 'Cobo Custody',
    preferredSettlementChain: 'solana',
    wallet: fakeWallet('chainflow-primary'),
  },
  {
    email: 'admin@aminagroup.com',
    companyName: 'AMINA Bank AG',
    legalName: 'AMINA Bank AG',
    tradingName: 'AMINA',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(30),
    kybExpiresAt: hoursFromNow(24 * 335),
    jurisdiction: 'CH',
    country: 'Switzerland',
    city: 'Zug',
    state: 'ZG',
    postalCode: '6300',
    addressLine1: 'Kolinplatz 15',
    registrationNumber: 'CHE-395.686.339',
    registrationCountry: 'CH',
    entityType: 'CORPORATION',
    lei: '506700GE1N983WUND067',
    taxId: 'CHE-395.686.339 MWST',
    taxCountry: 'CH',
    contactFirstName: 'Admin',
    contactLastName: 'Admin',
    contactEmail: 'admin@aminagroup.com',
    contactPhone: '+41-41-710-0100',
    contactTitle: 'Platform Administrator',
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Licensed banking operations, institutional custody, and digital asset trading',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'Banking & Securities Dealer License',
    licenseNumber: 'FINMA-2018-BL-0091',
    regulatoryBody: 'FINMA',
    industry: 'Digital Asset Banking',
    websiteUrl: 'https://aminagroup.com',
    businessDescription:
      'FINMA-regulated crypto bank providing institutional custody, trading, and tokenization services',
    yearEstablished: 2018,
    employeeCountRange: 'RANGE_201_500',
    annualRevenueRange: 'RANGE_100M_500M',
    expectedMonthlyVolume: 50000000,
    walletCustodyType: 'MPC',
    custodianName: 'AMINA Custody',
    preferredSettlementChain: 'solana',
    wallet: fakeWallet('amina-primary'),
  },
  {
    email: 'treasury@meridian-trade.co.uk',
    companyName: 'Meridian Trade Finance Corp',
    legalName: 'Meridian Trade Finance Corporation',
    tradingName: 'Meridian TFC',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(180),
    kybExpiresAt: hoursFromNow(24 * 185),
    jurisdiction: 'GB',
    country: 'United Kingdom',
    city: 'London',
    state: 'Greater London',
    postalCode: 'EC2N 1HQ',
    addressLine1: '25 Old Broad Street',
    registrationNumber: 'UK-08765432',
    registrationCountry: 'GB',
    entityType: 'CORPORATION',
    lei: '213800ABCD1234567890',
    taxId: 'GB876543210',
    taxCountry: 'GB',
    contactFirstName: 'Emma',
    contactLastName: 'Whitfield',
    contactEmail: 'emma.whitfield@meridian-trade.co.uk',
    contactPhone: '+44-20-7555-0606',
    contactTitle: 'Director of Treasury',
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Trade finance operations and letter-of-credit fees',
    isRegulatedEntity: true,
    regulatoryStatus: 'REGULATED',
    licenseType: 'FCA Authorization',
    licenseNumber: 'FCA-654321',
    regulatoryBody: 'FCA',
    industry: 'Trade Finance',
    websiteUrl: 'https://meridian-trade.co.uk',
    businessDescription:
      'FCA-authorized trade finance house providing cross-border LC and USDC settlement for commodity importers',
    yearEstablished: 2015,
    employeeCountRange: 'RANGE_501_1000',
    annualRevenueRange: 'RANGE_500M_1B',
    expectedMonthlyVolume: 50000000,
    walletCustodyType: 'THIRD_PARTY',
    custodianName: 'Anchorage Digital',
    preferredSettlementChain: 'solana',
    wallet: fakeWallet('meridian-primary'),
  },
  {
    email: 'finance@pacificrim-exports.sg',
    companyName: 'Pacific Rim Exports Pte Ltd',
    legalName: 'Pacific Rim Exports Pte Ltd',
    tradingName: 'Pacific Rim Exports',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    kybStatus: 'VERIFIED',
    kybVerifiedAt: daysAgo(150),
    kybExpiresAt: hoursFromNow(24 * 215),
    jurisdiction: 'SG',
    country: 'Singapore',
    city: 'Singapore',
    postalCode: '068898',
    addressLine1: '80 Robinson Road, #10-01',
    registrationNumber: '201998765Z',
    registrationCountry: 'SG',
    entityType: 'CORPORATION',
    taxId: 'T19SG98765Z',
    taxCountry: 'SG',
    contactFirstName: 'Priya',
    contactLastName: 'Sharma',
    contactEmail: 'priya.sharma@pacificrim-exports.sg',
    contactPhone: '+65-6555-0707',
    contactTitle: 'CFO',
    riskRating: 'LOW',
    sanctionsStatus: 'CLEAR',
    sourceOfFunds: 'Export revenue and trade receivables',
    isRegulatedEntity: false,
    regulatoryStatus: 'EXEMPT',
    industry: 'Export Trading',
    websiteUrl: 'https://pacificrim-exports.sg',
    businessDescription:
      'Singapore-based commodity exporter leveraging USDC for fast cross-border settlement',
    yearEstablished: 2018,
    employeeCountRange: 'RANGE_51_200',
    annualRevenueRange: 'RANGE_50M_100M',
    expectedMonthlyVolume: 10000000,
    walletCustodyType: 'EXCHANGE',
    custodianName: 'Coinbase Prime',
    preferredSettlementChain: 'solana',
    wallet: fakeWallet('pacificrim-primary'),
  },
];

// ── Counterparty-only clients (appear in escrows/payments but not loginable) ─

const counterpartyClients: ClientDef[] = [
  {
    email: 'ops@globaltrade-industries.com',
    companyName: 'GlobalTrade Industries',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'SG',
    country: 'Singapore',
    city: 'Singapore',
    industry: 'International Trade',
    isRegulatedEntity: true,
    regulatoryBody: 'MAS',
    wallet: fakeWallet('globaltrade'),
    counterpartyOnly: true,
  },
  {
    email: 'finance@swiss-precision.ch',
    companyName: 'Swiss Precision AG',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'CH',
    country: 'Switzerland',
    city: 'Basel',
    industry: 'Precision Manufacturing',
    wallet: fakeWallet('swiss-precision'),
    counterpartyOnly: true,
  },
  {
    email: 'ops@eurolink-trading.de',
    companyName: 'Eurolink Trading GmbH',
    tier: 'STANDARD',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'DE',
    country: 'Germany',
    city: 'Frankfurt',
    industry: 'Cross-border Trade',
    isRegulatedEntity: true,
    regulatoryBody: 'BaFin',
    wallet: fakeWallet('eurolink'),
    counterpartyOnly: true,
  },
  {
    email: 'ops@dbs-digital.sg',
    companyName: 'DBS Digital Exchange',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'SG',
    country: 'Singapore',
    city: 'Singapore',
    industry: 'Digital Asset Exchange',
    isRegulatedEntity: true,
    regulatoryBody: 'MAS',
    wallet: fakeWallet('dbs-digital'),
    counterpartyOnly: true,
  },
  {
    email: 'digital@hsbc.co.uk',
    companyName: 'HSBC Digital Assets',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'GB',
    country: 'United Kingdom',
    city: 'London',
    industry: 'Banking',
    isRegulatedEntity: true,
    regulatoryBody: 'FCA',
    wallet: fakeWallet('hsbc-digital'),
    counterpartyOnly: true,
  },
  {
    email: 'digital@emirates-nbd.ae',
    companyName: 'Emirates NBD Digital',
    tier: 'ENTERPRISE',
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    jurisdiction: 'AE',
    country: 'United Arab Emirates',
    city: 'Dubai',
    industry: 'Banking',
    isRegulatedEntity: true,
    regulatoryBody: 'DFSA',
    wallet: fakeWallet('emirates-nbd'),
    counterpartyOnly: true,
  },
];

const allClients = [...loginableClients, ...counterpartyClients];

// ── Corridors ──────────────────────────────────────────────────────────────

const corridorConfigs: Record<
  string,
  { risk: string; min: number; max: number; daily: number; monthly: number; docs: string[] }
> = {
  'CH-SG': {
    risk: 'LOW',
    min: 100,
    max: 5000000,
    daily: 20000000,
    monthly: 200000000,
    docs: ['INVOICE', 'CONTRACT'],
  },
  'SG-CH': {
    risk: 'LOW',
    min: 100,
    max: 5000000,
    daily: 20000000,
    monthly: 200000000,
    docs: ['INVOICE', 'CONTRACT'],
  },
  'CH-US': {
    risk: 'LOW',
    min: 500,
    max: 5000000,
    daily: 20000000,
    monthly: 200000000,
    docs: ['INVOICE'],
  },
  'US-CH': {
    risk: 'LOW',
    min: 500,
    max: 5000000,
    daily: 20000000,
    monthly: 200000000,
    docs: ['INVOICE'],
  },
  'SG-JP': {
    risk: 'LOW',
    min: 100,
    max: 3000000,
    daily: 15000000,
    monthly: 150000000,
    docs: ['INVOICE', 'CONTRACT'],
  },
  'JP-SG': {
    risk: 'LOW',
    min: 100,
    max: 3000000,
    daily: 15000000,
    monthly: 150000000,
    docs: ['INVOICE', 'CONTRACT'],
  },
  'GB-CH': {
    risk: 'LOW',
    min: 100,
    max: 5000000,
    daily: 20000000,
    monthly: 200000000,
    docs: ['INVOICE'],
  },
  'CH-GB': {
    risk: 'LOW',
    min: 100,
    max: 5000000,
    daily: 20000000,
    monthly: 200000000,
    docs: ['INVOICE'],
  },
  'AE-AE': {
    risk: 'LOW',
    min: 100,
    max: 2000000,
    daily: 10000000,
    monthly: 100000000,
    docs: ['INVOICE'],
  },
  'CH-CH': { risk: 'LOW', min: 100, max: 10000000, daily: 50000000, monthly: 500000000, docs: [] },
  'US-DE': {
    risk: 'LOW',
    min: 100,
    max: 5000000,
    daily: 20000000,
    monthly: 200000000,
    docs: ['INVOICE'],
  },
  'DE-US': {
    risk: 'LOW',
    min: 100,
    max: 5000000,
    daily: 20000000,
    monthly: 200000000,
    docs: ['INVOICE'],
  },
  'GB-SG': {
    risk: 'LOW',
    min: 100,
    max: 3000000,
    daily: 15000000,
    monthly: 150000000,
    docs: ['INVOICE'],
  },
  'SG-GB': {
    risk: 'LOW',
    min: 100,
    max: 3000000,
    daily: 15000000,
    monthly: 150000000,
    docs: ['INVOICE'],
  },
  'US-MX': {
    risk: 'MEDIUM',
    min: 100,
    max: 500000,
    daily: 2000000,
    monthly: 20000000,
    docs: ['INVOICE'],
  },
  'US-PH': {
    risk: 'MEDIUM',
    min: 50,
    max: 250000,
    daily: 1000000,
    monthly: 10000000,
    docs: ['INVOICE', 'SHIPPING_DOC'],
  },
  'EU-UK': {
    risk: 'LOW',
    min: 500,
    max: 2000000,
    daily: 10000000,
    monthly: 100000000,
    docs: ['INVOICE'],
  },
  'SG-US': {
    risk: 'LOW',
    min: 100,
    max: 1000000,
    daily: 5000000,
    monthly: 50000000,
    docs: ['INVOICE', 'CONTRACT'],
  },
  'GB-HK': {
    risk: 'MEDIUM',
    min: 500,
    max: 2000000,
    daily: 10000000,
    monthly: 100000000,
    docs: ['INVOICE', 'CONTRACT'],
  },
  'HK-GB': {
    risk: 'MEDIUM',
    min: 500,
    max: 2000000,
    daily: 10000000,
    monthly: 100000000,
    docs: ['INVOICE', 'CONTRACT'],
  },
  'CH-AE': {
    risk: 'MEDIUM',
    min: 1000,
    max: 1000000,
    daily: 5000000,
    monthly: 50000000,
    docs: ['INVOICE', 'CONTRACT', 'LETTER_OF_CREDIT'],
  },
  'AE-CH': {
    risk: 'MEDIUM',
    min: 1000,
    max: 1000000,
    daily: 5000000,
    monthly: 50000000,
    docs: ['INVOICE', 'CONTRACT', 'LETTER_OF_CREDIT'],
  },
  'CH-IT': {
    risk: 'LOW',
    min: 100,
    max: 3000000,
    daily: 15000000,
    monthly: 150000000,
    docs: ['INVOICE'],
  },
  'IT-CH': {
    risk: 'LOW',
    min: 100,
    max: 3000000,
    daily: 15000000,
    monthly: 150000000,
    docs: ['INVOICE'],
  },
  'SG-AE': {
    risk: 'MEDIUM',
    min: 500,
    max: 2000000,
    daily: 8000000,
    monthly: 80000000,
    docs: ['INVOICE', 'CONTRACT'],
  },
  'AE-SG': {
    risk: 'MEDIUM',
    min: 500,
    max: 2000000,
    daily: 8000000,
    monthly: 80000000,
    docs: ['INVOICE', 'CONTRACT'],
  },
};

// ── Account definitions per loginable client ───────────────────────────────

interface AccountDef {
  name: string;
  label: string;
  accountType: 'OPERATIONS' | 'COLLATERAL' | 'SETTLEMENT' | 'TREASURY' | 'GENERAL';
  walletSeed: string;
  branchCountryCode?: string;
  isDefault: boolean;
  description: string;
}

const accountsByClient: Record<string, AccountDef[]> = {
  'ops@helvetica-digital.ch': [
    {
      name: 'Operating Account',
      label: 'Operating Account',
      accountType: 'OPERATIONS',
      walletSeed: 'helvetica-ops',
      branchCountryCode: 'CH',
      isDefault: true,
      description: 'Primary operating account for daily USDC settlements',
    },
    {
      name: 'Escrow Reserve',
      label: 'Escrow Reserve',
      accountType: 'COLLATERAL',
      walletSeed: 'helvetica-escrow',
      branchCountryCode: 'CH',
      isDefault: false,
      description: 'Collateral reserve for active escrow positions',
    },
    {
      name: 'Settlement Float',
      label: 'Settlement Float',
      accountType: 'SETTLEMENT',
      walletSeed: 'helvetica-settlement',
      branchCountryCode: 'CH',
      isDefault: false,
      description: 'Settlement float for cross-border payments',
    },
  ],
  'treasury@alpine-custody.ch': [
    {
      name: 'Treasury Account',
      label: 'Treasury Account',
      accountType: 'TREASURY',
      walletSeed: 'alpine-treasury',
      isDefault: true,
      description: 'Primary treasury account for custody settlements',
    },
    {
      name: 'Staking Rewards',
      label: 'Staking Rewards',
      accountType: 'OPERATIONS',
      walletSeed: 'alpine-staking',
      isDefault: false,
      description: 'Accumulated staking rewards and fee collection',
    },
  ],
  'finance@satoshi-bridge.io': [
    {
      name: 'Bridge Liquidity',
      label: 'Bridge Liquidity',
      accountType: 'OPERATIONS',
      walletSeed: 'satoshi-liquidity',
      isDefault: true,
      description: 'Main liquidity pool for bridge operations',
    },
    {
      name: 'Settlement Reserve',
      label: 'Settlement Reserve',
      accountType: 'SETTLEMENT',
      walletSeed: 'satoshi-settlement',
      isDefault: false,
      description: 'Reserve for cross-chain settlement finality',
    },
    {
      name: 'Fee Collection',
      label: 'Fee Collection',
      accountType: 'TREASURY',
      walletSeed: 'satoshi-fees',
      isDefault: false,
      description: 'Bridge fee accumulation account',
    },
  ],
  'ops@chainflow-remit.sg': [
    {
      name: 'Remittance Pool',
      label: 'Remittance Pool',
      accountType: 'OPERATIONS',
      walletSeed: 'chainflow-pool',
      isDefault: true,
      description: 'Primary pool for SG-ASEAN remittance flows',
    },
    {
      name: 'Float Account',
      label: 'Float Account',
      accountType: 'SETTLEMENT',
      walletSeed: 'chainflow-float',
      isDefault: false,
      description: 'Working capital float for instant settlement',
    },
  ],
  'admin@aminagroup.com': [
    {
      name: 'Institutional Custody',
      label: 'Institutional Custody',
      accountType: 'OPERATIONS',
      walletSeed: 'amina-custody',
      isDefault: true,
      description: 'Primary custody settlement account',
    },
    {
      name: 'Trading Desk',
      label: 'Trading Desk',
      accountType: 'TREASURY',
      walletSeed: 'amina-trading',
      isDefault: false,
      description: 'OTC trading desk settlement account',
    },
    {
      name: 'Client Escrow Pool',
      label: 'Client Escrow Pool',
      accountType: 'COLLATERAL',
      walletSeed: 'amina-escrow-pool',
      isDefault: false,
      description: 'Pooled escrow collateral for client positions',
    },
  ],
  'treasury@meridian-trade.co.uk': [
    {
      name: 'Trade Finance Account',
      label: 'Trade Finance Account',
      accountType: 'OPERATIONS',
      walletSeed: 'meridian-trade',
      isDefault: true,
      description: 'Primary trade finance settlement account',
    },
    {
      name: 'LC Collateral',
      label: 'LC Collateral',
      accountType: 'COLLATERAL',
      walletSeed: 'meridian-lc',
      isDefault: false,
      description: 'Letter of credit collateral pool',
    },
  ],
  'finance@pacificrim-exports.sg': [
    {
      name: 'Export Settlements',
      label: 'Export Settlements',
      accountType: 'OPERATIONS',
      walletSeed: 'pacificrim-exports',
      isDefault: true,
      description: 'Export payment settlement account',
    },
    {
      name: 'Receivables Account',
      label: 'Receivables Account',
      accountType: 'SETTLEMENT',
      walletSeed: 'pacificrim-receivables',
      isDefault: false,
      description: 'Trade receivables and pending settlements',
    },
  ],
};

// ── Branch definitions (Helvetica only has branches) ──────────────────────

const helveticaBranches = [
  {
    name: 'Zurich HQ',
    city: 'Zurich',
    country: 'Switzerland',
    countryCode: 'CH',
    address: 'Bahnhofstrasse 42, 8001 Zurich',
    timezone: 'Europe/Zurich',
    riskScore: 5,
    complianceStatus: 'ACTIVE',
    regulatoryBody: 'FINMA',
  },
  {
    name: 'New York Branch',
    city: 'New York',
    country: 'United States',
    countryCode: 'US',
    address: '55 Water Street, New York, NY 10041',
    timezone: 'America/New_York',
    riskScore: 10,
    complianceStatus: 'ACTIVE',
    regulatoryBody: 'FinCEN',
  },
  {
    name: 'Singapore Branch',
    city: 'Singapore',
    country: 'Singapore',
    countryCode: 'SG',
    address: '1 Raffles Place, #20-01, Tower 2',
    timezone: 'Asia/Singapore',
    riskScore: 8,
    complianceStatus: 'ACTIVE',
    regulatoryBody: 'MAS',
  },
  {
    name: 'London Branch',
    city: 'London',
    country: 'United Kingdom',
    countryCode: 'GB',
    address: '25 Old Broad Street, EC2N 1HQ',
    timezone: 'Europe/London',
    riskScore: 6,
    complianceStatus: 'ACTIVE',
    regulatoryBody: 'FCA',
  },
  {
    name: 'Dubai Branch',
    city: 'Dubai',
    country: 'United Arab Emirates',
    countryCode: 'AE',
    address: 'Gate Village, Building 3, DIFC',
    timezone: 'Asia/Dubai',
    riskScore: 15,
    complianceStatus: 'ACTIVE',
    regulatoryBody: 'DFSA',
  },
  {
    name: 'Moscow Office',
    city: 'Moscow',
    country: 'Russia',
    countryCode: 'RU',
    address: 'Tverskaya Street 22, Moscow 125009',
    timezone: 'Europe/Moscow',
    riskScore: 100,
    complianceStatus: 'BLOCKED',
    regulatoryBody: 'CBR',
    isSanctioned: true,
    sanctionReason: 'All operations suspended per EU/US/CH sanctions',
    isActive: false,
  },
];

// ── Settings per loginable client ──────────────────────────────────────────

const settingsByClient: Record<
  string,
  {
    corridor: string | null;
    timezone: string;
    autoApprove?: number;
    manualReview?: number;
    riskTolerance?: string;
    defaultToken?: string;
  }
> = {
  'ops@helvetica-digital.ch': {
    corridor: 'CH-SG',
    timezone: 'Europe/Zurich',
    autoApprove: 10000,
    manualReview: 50000,
    riskTolerance: 'low',
    defaultToken: 'usdc',
  },
  'treasury@alpine-custody.ch': {
    corridor: 'CH-US',
    timezone: 'Europe/Zurich',
    autoApprove: 25000,
    riskTolerance: 'low',
    defaultToken: 'usdc',
  },
  'finance@satoshi-bridge.io': {
    corridor: 'US-MX',
    timezone: 'America/Los_Angeles',
    autoApprove: 100000,
    riskTolerance: 'medium',
    defaultToken: 'usdc',
  },
  'ops@chainflow-remit.sg': {
    corridor: 'SG-CH',
    timezone: 'Asia/Singapore',
    autoApprove: 50000,
    riskTolerance: 'medium',
    defaultToken: 'usdc',
  },
  'admin@aminagroup.com': {
    corridor: 'CH-SG',
    timezone: 'Europe/Zurich',
    autoApprove: 500000,
    riskTolerance: 'low',
    defaultToken: 'usdc',
  },
  'treasury@meridian-trade.co.uk': {
    corridor: 'EU-UK',
    timezone: 'Europe/London',
    autoApprove: 200000,
    riskTolerance: 'low',
    defaultToken: 'usdc',
  },
  'finance@pacificrim-exports.sg': {
    corridor: 'SG-US',
    timezone: 'Asia/Singapore',
    autoApprove: 75000,
    riskTolerance: 'medium',
    defaultToken: 'usdc',
  },
};

// ── Escrow definitions (all reference loginable clients as payer) ─────────

interface EscrowDef {
  payerEmail: string;
  recipientEmail: string;
  corridor: string;
  amount: number;
  status: string;
  conditionType: 'ADMIN_RELEASE' | 'TIME_LOCK' | 'COMPLIANCE_CHECK';
  riskScore: number | null;
  createdAt: Date;
  code: string;
}

const escrowDefs: EscrowDef[] = [
  // ── Helvetica Digital escrows ──
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'ops@globaltrade-industries.com',
    corridor: 'CH-SG',
    amount: 2500000,
    status: 'FUNDED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 12,
    createdAt: hoursAgo(2),
    code: escrowCode('helv-funded-ch-sg'),
  },
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'finance@pacificrim-exports.sg',
    corridor: 'SG-JP',
    amount: 1800000,
    status: 'COMPLIANCE_HOLD',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 42,
    createdAt: hoursAgo(5),
    code: escrowCode('helv-compliance-sg-jp'),
  },
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'finance@swiss-precision.ch',
    corridor: 'GB-CH',
    amount: 4200000,
    status: 'CREATED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 8,
    createdAt: hoursAgo(9),
    code: escrowCode('helv-created-gb-ch'),
  },
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'ops@globaltrade-industries.com',
    corridor: 'AE-AE',
    amount: 1100000,
    status: 'RELEASING',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 18,
    createdAt: daysAgo(1),
    code: escrowCode('helv-releasing-ae-ae'),
  },
  // Historical released
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'ops@chainflow-remit.sg',
    corridor: 'CH-SG',
    amount: 150000,
    status: 'RELEASED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 10,
    createdAt: daysAgo(30),
    code: escrowCode('helv-rel-30d'),
  },
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'finance@satoshi-bridge.io',
    corridor: 'CH-US',
    amount: 420000,
    status: 'RELEASED',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 20,
    createdAt: daysAgo(45),
    code: escrowCode('helv-rel-45d'),
  },
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'ops@dbs-digital.sg',
    corridor: 'SG-CH',
    amount: 85000,
    status: 'RELEASED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 5,
    createdAt: daysAgo(60),
    code: escrowCode('helv-rel-60d'),
  },

  // ── Alpine Custody escrows ──
  {
    payerEmail: 'treasury@alpine-custody.ch',
    recipientEmail: 'finance@satoshi-bridge.io',
    corridor: 'CH-US',
    amount: 500000,
    status: 'COMPLIANCE_HOLD',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 65,
    createdAt: daysAgo(3),
    code: escrowCode('alpine-hold'),
  },
  {
    payerEmail: 'treasury@alpine-custody.ch',
    recipientEmail: 'ops@helvetica-digital.ch',
    corridor: 'CH-SG',
    amount: 180000,
    status: 'FUNDED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 10,
    createdAt: daysAgo(1),
    code: escrowCode('alpine-funded'),
  },
  {
    payerEmail: 'treasury@alpine-custody.ch',
    recipientEmail: 'digital@hsbc.co.uk',
    corridor: 'CH-GB',
    amount: 25000,
    status: 'CANCELLED',
    conditionType: 'TIME_LOCK',
    riskScore: null,
    createdAt: daysAgo(20),
    code: escrowCode('alpine-cancelled'),
  },

  // ── Satoshi Bridge escrows ──
  {
    payerEmail: 'finance@satoshi-bridge.io',
    recipientEmail: 'ops@eurolink-trading.de',
    corridor: 'US-MX',
    amount: 100000,
    status: 'CREATED',
    conditionType: 'TIME_LOCK',
    riskScore: null,
    createdAt: hoursAgo(3),
    code: escrowCode('satoshi-created'),
  },
  {
    payerEmail: 'finance@satoshi-bridge.io',
    recipientEmail: 'ops@chainflow-remit.sg',
    corridor: 'US-PH',
    amount: 450000,
    status: 'FUNDED',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 25,
    createdAt: daysAgo(1),
    code: escrowCode('satoshi-funded'),
  },
  {
    payerEmail: 'finance@satoshi-bridge.io',
    recipientEmail: 'treasury@meridian-trade.co.uk',
    corridor: 'US-CH',
    amount: 500000,
    status: 'RELEASED',
    conditionType: 'TIME_LOCK',
    riskScore: 12,
    createdAt: daysAgo(14),
    code: escrowCode('satoshi-released'),
  },
  {
    payerEmail: 'finance@satoshi-bridge.io',
    recipientEmail: 'admin@aminagroup.com',
    corridor: 'CH-US',
    amount: 75000,
    status: 'FAILED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 40,
    createdAt: daysAgo(6),
    code: escrowCode('satoshi-failed'),
  },

  // ── ChainFlow Remittance escrows ──
  {
    payerEmail: 'ops@chainflow-remit.sg',
    recipientEmail: 'ops@helvetica-digital.ch',
    corridor: 'SG-CH',
    amount: 75000,
    status: 'FUNDED',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 22,
    createdAt: daysAgo(1),
    code: escrowCode('chainflow-funded'),
  },
  {
    payerEmail: 'ops@chainflow-remit.sg',
    recipientEmail: 'treasury@alpine-custody.ch',
    corridor: 'SG-CH',
    amount: 60000,
    status: 'CANCELLED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 30,
    createdAt: daysAgo(12),
    code: escrowCode('chainflow-cancelled'),
  },
  {
    payerEmail: 'ops@chainflow-remit.sg',
    recipientEmail: 'finance@pacificrim-exports.sg',
    corridor: 'SG-US',
    amount: 220000,
    status: 'RELEASING',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 14,
    createdAt: daysAgo(2),
    code: escrowCode('chainflow-releasing'),
  },

  // ── AMINA Bank escrows ──
  {
    payerEmail: 'admin@aminagroup.com',
    recipientEmail: 'ops@globaltrade-industries.com',
    corridor: 'CH-SG',
    amount: 3000000,
    status: 'FUNDED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 8,
    createdAt: hoursAgo(6),
    code: escrowCode('amina-funded'),
  },
  {
    payerEmail: 'admin@aminagroup.com',
    recipientEmail: 'digital@emirates-nbd.ae',
    corridor: 'CH-AE',
    amount: 750000,
    status: 'COMPLIANCE_HOLD',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 55,
    createdAt: daysAgo(2),
    code: escrowCode('amina-hold'),
  },
  {
    payerEmail: 'admin@aminagroup.com',
    recipientEmail: 'treasury@alpine-custody.ch',
    corridor: 'US-MX',
    amount: 30000,
    status: 'CANCELLING',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 45,
    createdAt: daysAgo(4),
    code: escrowCode('amina-cancelling'),
  },
  {
    payerEmail: 'admin@aminagroup.com',
    recipientEmail: 'finance@satoshi-bridge.io',
    corridor: 'US-MX',
    amount: 10000,
    status: 'EXPIRED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: null,
    createdAt: daysAgo(15),
    code: escrowCode('amina-expired'),
  },

  // ── Meridian Trade Finance escrows ──
  {
    payerEmail: 'treasury@meridian-trade.co.uk',
    recipientEmail: 'finance@pacificrim-exports.sg',
    corridor: 'EU-UK',
    amount: 1000000,
    status: 'RELEASING',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 10,
    createdAt: daysAgo(5),
    code: escrowCode('meridian-releasing'),
  },
  {
    payerEmail: 'treasury@meridian-trade.co.uk',
    recipientEmail: 'digital@hsbc.co.uk',
    corridor: 'EU-UK',
    amount: 400000,
    status: 'EXPIRED',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 55,
    createdAt: daysAgo(8),
    code: escrowCode('meridian-expired'),
  },
  {
    payerEmail: 'treasury@meridian-trade.co.uk',
    recipientEmail: 'ops@eurolink-trading.de',
    corridor: 'GB-CH',
    amount: 650000,
    status: 'FUNDED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 12,
    createdAt: daysAgo(1),
    code: escrowCode('meridian-funded'),
  },

  // ── Pacific Rim Exports escrows ──
  {
    payerEmail: 'finance@pacificrim-exports.sg',
    recipientEmail: 'ops@helvetica-digital.ch',
    corridor: 'SG-CH',
    amount: 180000,
    status: 'RELEASED',
    conditionType: 'COMPLIANCE_CHECK',
    riskScore: 18,
    createdAt: daysAgo(7),
    code: escrowCode('pacificrim-released'),
  },
  {
    payerEmail: 'finance@pacificrim-exports.sg',
    recipientEmail: 'finance@satoshi-bridge.io',
    corridor: 'SG-US',
    amount: 320000,
    status: 'FUNDED',
    conditionType: 'ADMIN_RELEASE',
    riskScore: 15,
    createdAt: daysAgo(1),
    code: escrowCode('pacificrim-funded'),
  },
  {
    payerEmail: 'finance@pacificrim-exports.sg',
    recipientEmail: 'digital@emirates-nbd.ae',
    corridor: 'SG-AE',
    amount: 95000,
    status: 'CREATED',
    conditionType: 'TIME_LOCK',
    riskScore: null,
    createdAt: hoursAgo(4),
    code: escrowCode('pacificrim-created'),
  },
];

// ── Direct payments (all wired to real DB clients) ─────────────────────────

interface PaymentDef {
  payerEmail: string;
  recipientEmail: string;
  corridor: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: Date;
  code: string;
}

const paymentDefs: PaymentDef[] = [
  // Helvetica payments
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'finance@swiss-precision.ch',
    corridor: 'CH-CH',
    amount: 450000,
    currency: 'USDC',
    status: 'completed',
    createdAt: hoursAgo(18),
    code: 'dp-001',
  },
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'finance@pacificrim-exports.sg',
    corridor: 'SG-JP',
    amount: 1200000,
    currency: 'USDC',
    status: 'completed',
    createdAt: hoursAgo(20),
    code: 'dp-002',
  },
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'ops@eurolink-trading.de',
    corridor: 'US-DE',
    amount: 780000,
    currency: 'EURC',
    status: 'completed',
    createdAt: daysAgo(1),
    code: 'dp-003',
  },
  {
    payerEmail: 'ops@helvetica-digital.ch',
    recipientEmail: 'ops@globaltrade-industries.com',
    corridor: 'GB-SG',
    amount: 2100000,
    currency: 'USDC',
    status: 'pending',
    createdAt: minutesAgo(2),
    code: 'dp-004',
  },

  // Alpine payments
  {
    payerEmail: 'treasury@alpine-custody.ch',
    recipientEmail: 'ops@helvetica-digital.ch',
    corridor: 'CH-CH',
    amount: 320000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(2),
    code: 'dp-alp-001',
  },
  {
    payerEmail: 'treasury@alpine-custody.ch',
    recipientEmail: 'admin@aminagroup.com',
    corridor: 'CH-CH',
    amount: 175000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(5),
    code: 'dp-alp-002',
  },

  // Satoshi Bridge payments
  {
    payerEmail: 'finance@satoshi-bridge.io',
    recipientEmail: 'ops@chainflow-remit.sg',
    corridor: 'US-CH',
    amount: 890000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(3),
    code: 'dp-sat-001',
  },
  {
    payerEmail: 'finance@satoshi-bridge.io',
    recipientEmail: 'treasury@meridian-trade.co.uk',
    corridor: 'US-DE',
    amount: 540000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(7),
    code: 'dp-sat-002',
  },
  {
    payerEmail: 'finance@satoshi-bridge.io',
    recipientEmail: 'ops@eurolink-trading.de',
    corridor: 'US-DE',
    amount: 125000,
    currency: 'USDC',
    status: 'pending',
    createdAt: hoursAgo(1),
    code: 'dp-sat-003',
  },

  // ChainFlow payments
  {
    payerEmail: 'ops@chainflow-remit.sg',
    recipientEmail: 'ops@helvetica-digital.ch',
    corridor: 'SG-CH',
    amount: 410000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(4),
    code: 'dp-cf-001',
  },
  {
    payerEmail: 'ops@chainflow-remit.sg',
    recipientEmail: 'finance@pacificrim-exports.sg',
    corridor: 'SG-US',
    amount: 155000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(6),
    code: 'dp-cf-002',
  },

  // AMINA payments
  {
    payerEmail: 'admin@aminagroup.com',
    recipientEmail: 'treasury@alpine-custody.ch',
    corridor: 'CH-CH',
    amount: 1500000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(2),
    code: 'dp-amn-001',
  },
  {
    payerEmail: 'admin@aminagroup.com',
    recipientEmail: 'ops@globaltrade-industries.com',
    corridor: 'CH-SG',
    amount: 2200000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(8),
    code: 'dp-amn-002',
  },
  {
    payerEmail: 'admin@aminagroup.com',
    recipientEmail: 'digital@hsbc.co.uk',
    corridor: 'CH-GB',
    amount: 800000,
    currency: 'USDC',
    status: 'pending',
    createdAt: hoursAgo(3),
    code: 'dp-amn-003',
  },

  // Meridian payments
  {
    payerEmail: 'treasury@meridian-trade.co.uk',
    recipientEmail: 'finance@pacificrim-exports.sg',
    corridor: 'GB-SG',
    amount: 620000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(3),
    code: 'dp-mer-001',
  },
  {
    payerEmail: 'treasury@meridian-trade.co.uk',
    recipientEmail: 'ops@eurolink-trading.de',
    corridor: 'GB-CH',
    amount: 350000,
    currency: 'EURC',
    status: 'completed',
    createdAt: daysAgo(10),
    code: 'dp-mer-002',
  },

  // Pacific Rim payments
  {
    payerEmail: 'finance@pacificrim-exports.sg',
    recipientEmail: 'ops@helvetica-digital.ch',
    corridor: 'SG-CH',
    amount: 280000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(5),
    code: 'dp-pr-001',
  },
  {
    payerEmail: 'finance@pacificrim-exports.sg',
    recipientEmail: 'ops@dbs-digital.sg',
    corridor: 'SG-US',
    amount: 190000,
    currency: 'USDC',
    status: 'completed',
    createdAt: daysAgo(9),
    code: 'dp-pr-002',
  },
];

// ── Notifications per loginable client (unique for each) ───────────────────

interface NotifDef {
  clientEmail: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  createdAt: Date;
  isRead?: boolean;
}

const notificationDefs: NotifDef[] = [
  // ── Helvetica Digital (5 notifications) ──
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'COMPLIANCE_REVIEW_REQUIRED',
    priority: 'HIGH',
    title: 'Pacific Rim Exports — compliance review required',
    message:
      '1,800,000 USDC escrow on SG-JP corridor flagged for compliance review. Risk score: 42.',
    metadata: { escrowCode: 'esc-e5f6a7b8', corridor: 'SG-JP', amount: 1800000 },
    createdAt: daysAgo(2),
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'ESCROW_CREATED',
    priority: 'MEDIUM',
    title: 'Swiss Precision AG — awaiting funding',
    message: '4,200,000 USDC escrow on GB-CH corridor created and awaiting deposit.',
    metadata: { escrowCode: 'esc-a3b4c5d6', corridor: 'GB-CH', amount: 4200000 },
    createdAt: daysAgo(2),
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'SETTLEMENT_COMPLETE',
    priority: 'MEDIUM',
    title: 'GlobalTrade Industries — releasing funds',
    message: '1,100,000 USDC escrow on AE-AE corridor is releasing funds to recipient.',
    metadata: { escrowCode: 'esc-c1d2e3f4', corridor: 'AE-AE', amount: 1100000 },
    createdAt: daysAgo(3),
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'DEPOSIT_CONFIRMED',
    priority: 'LOW',
    title: 'Deposit confirmed — GlobalTrade Industries',
    message: '2,500,000 USDC deposit confirmed for CH-SG corridor escrow.',
    metadata: { escrowCode: 'esc-a1b2c3d4', corridor: 'CH-SG', amount: 2500000 },
    createdAt: daysAgo(1),
    isRead: true,
  },
  {
    clientEmail: 'ops@helvetica-digital.ch',
    type: 'SECURITY_ALERT',
    priority: 'HIGH',
    title: 'Moscow Office — operations suspended',
    message:
      'Russia branch blocked due to EU/US/CH sanctions. All transactions through RU corridor suspended.',
    metadata: { branch: 'Moscow Office', countryCode: 'RU' },
    createdAt: daysAgo(14),
    isRead: true,
  },

  // ── Alpine Crypto Custody (4 notifications) ──
  {
    clientEmail: 'treasury@alpine-custody.ch',
    type: 'ESCROW_COMPLIANCE_HOLD',
    priority: 'HIGH',
    title: 'Escrow Held for Compliance Review',
    message:
      'Escrow ' +
      escrowCode('alpine-hold') +
      ' (500,000 USDC) on CH-US corridor requires compliance review. Risk score: 65.',
    metadata: {
      escrowCode: escrowCode('alpine-hold'),
      corridor: 'CH-US',
      amount: 500000,
      riskScore: 65,
    },
    createdAt: daysAgo(3),
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    type: 'DEPOSIT_CONFIRMED',
    priority: 'MEDIUM',
    title: 'Deposit confirmed — Helvetica Digital',
    message: '180,000 USDC deposit confirmed for CH-SG corridor escrow with Helvetica Digital.',
    metadata: { escrowCode: escrowCode('alpine-funded'), corridor: 'CH-SG', amount: 180000 },
    createdAt: daysAgo(1),
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    type: 'ESCROW_CANCELLED',
    priority: 'LOW',
    title: 'Escrow cancelled — HSBC Digital Assets',
    message: '25,000 USDC escrow on CH-GB corridor has been cancelled and refunded.',
    metadata: { escrowCode: escrowCode('alpine-cancelled'), corridor: 'CH-GB', amount: 25000 },
    createdAt: daysAgo(20),
    isRead: true,
  },
  {
    clientEmail: 'treasury@alpine-custody.ch',
    type: 'KYB_EXPIRING',
    priority: 'MEDIUM',
    title: 'KYB verification expiring soon',
    message: 'Your KYB verification will expire in 305 days. Please prepare updated documentation.',
    metadata: {},
    createdAt: daysAgo(5),
  },

  // ── Satoshi Bridge Labs (5 notifications) ──
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'ESCROW_CREATED',
    priority: 'MEDIUM',
    title: 'New escrow — Eurolink Trading GmbH',
    message: '100,000 USDC escrow on US-MX corridor created and awaiting deposit.',
    metadata: { escrowCode: escrowCode('satoshi-created'), corridor: 'US-MX', amount: 100000 },
    createdAt: hoursAgo(3),
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'ESCROW_COMPLIANCE_HOLD',
    priority: 'HIGH',
    title: 'Escrow Held for Compliance Review',
    message:
      'Escrow ' +
      escrowCode('satoshi-funded') +
      ' (450,000 USDC) on US-PH corridor requires compliance review before proceeding.',
    metadata: {
      escrowCode: escrowCode('satoshi-funded'),
      corridor: 'US-PH',
      amount: 450000,
      riskScore: 25,
    },
    createdAt: daysAgo(1),
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'ESCROW_RELEASED',
    priority: 'LOW',
    title: 'Settlement complete — Meridian Trade Finance',
    message:
      '500,000 USDC escrow on US-CH corridor successfully released to Meridian Trade Finance.',
    metadata: { escrowCode: escrowCode('satoshi-released'), corridor: 'US-CH', amount: 500000 },
    createdAt: daysAgo(14),
    isRead: true,
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'COMPLIANCE_CHECK_FAILED',
    priority: 'CRITICAL',
    title: 'Escrow failed — AMINA Bank settlement',
    message:
      '75,000 USDC escrow on CH-US corridor failed during release. Manual intervention required.',
    metadata: {
      escrowCode: escrowCode('satoshi-failed'),
      corridor: 'CH-US',
      amount: 75000,
      riskScore: 40,
    },
    createdAt: daysAgo(6),
  },
  {
    clientEmail: 'finance@satoshi-bridge.io',
    type: 'ACCOUNT_VERIFIED',
    priority: 'LOW',
    title: 'Account verified — Bridge Liquidity',
    message: 'Your Bridge Liquidity account has been verified and is now active for settlements.',
    metadata: { accountName: 'Bridge Liquidity' },
    createdAt: daysAgo(30),
    isRead: true,
  },

  // ── ChainFlow Remittance (4 notifications) ──
  {
    clientEmail: 'ops@chainflow-remit.sg',
    type: 'DEPOSIT_CONFIRMED',
    priority: 'MEDIUM',
    title: 'Deposit confirmed — Helvetica Digital',
    message: '75,000 USDC deposit confirmed for SG-CH corridor escrow.',
    metadata: { escrowCode: escrowCode('chainflow-funded'), corridor: 'SG-CH', amount: 75000 },
    createdAt: daysAgo(1),
  },
  {
    clientEmail: 'ops@chainflow-remit.sg',
    type: 'SETTLEMENT_COMPLETE',
    priority: 'MEDIUM',
    title: 'Releasing funds — Pacific Rim Exports',
    message: '220,000 USDC escrow on SG-US corridor is releasing funds to recipient.',
    metadata: { escrowCode: escrowCode('chainflow-releasing'), corridor: 'SG-US', amount: 220000 },
    createdAt: daysAgo(2),
  },
  {
    clientEmail: 'ops@chainflow-remit.sg',
    type: 'ESCROW_CANCELLED',
    priority: 'LOW',
    title: 'Escrow cancelled — Alpine Crypto Custody',
    message: '60,000 USDC escrow on SG-CH corridor has been cancelled.',
    metadata: { escrowCode: escrowCode('chainflow-cancelled'), corridor: 'SG-CH', amount: 60000 },
    createdAt: daysAgo(12),
    isRead: true,
  },
  {
    clientEmail: 'ops@chainflow-remit.sg',
    type: 'COMPLIANCE_REVIEW_REQUIRED',
    priority: 'HIGH',
    title: 'Compliance review — US-PH corridor transaction',
    message:
      'A 75,000 USDC transaction on SG-CH corridor has been flagged for enhanced due diligence. Risk score: 22.',
    metadata: { corridor: 'SG-CH', riskScore: 22 },
    createdAt: daysAgo(1),
  },

  // ── AMINA Bank (5 notifications) ──
  {
    clientEmail: 'admin@aminagroup.com',
    type: 'DEPOSIT_CONFIRMED',
    priority: 'MEDIUM',
    title: 'Deposit confirmed — GlobalTrade Industries',
    message: '3,000,000 USDC deposit confirmed for CH-SG corridor institutional escrow.',
    metadata: { escrowCode: escrowCode('amina-funded'), corridor: 'CH-SG', amount: 3000000 },
    createdAt: hoursAgo(5),
  },
  {
    clientEmail: 'admin@aminagroup.com',
    type: 'ESCROW_COMPLIANCE_HOLD',
    priority: 'HIGH',
    title: 'Escrow Held for Compliance Review',
    message:
      'Escrow ' +
      escrowCode('amina-hold') +
      ' (750,000 USDC) on CH-AE corridor requires compliance review. Risk score: 55.',
    metadata: {
      escrowCode: escrowCode('amina-hold'),
      corridor: 'CH-AE',
      amount: 750000,
      riskScore: 55,
    },
    createdAt: daysAgo(2),
  },
  {
    clientEmail: 'admin@aminagroup.com',
    type: 'ESCROW_EXPIRED',
    priority: 'LOW',
    title: 'Escrow expired — unfunded',
    message: '10,000 USDC escrow on US-MX corridor expired without being funded.',
    metadata: { escrowCode: escrowCode('amina-expired'), corridor: 'US-MX', amount: 10000 },
    createdAt: daysAgo(15),
    isRead: true,
  },
  {
    clientEmail: 'admin@aminagroup.com',
    type: 'COMPLIANCE_CHECK_PASSED',
    priority: 'LOW',
    title: 'Compliance check passed — Q1 review',
    message:
      'Quarterly compliance review for AMINA Bank AG completed successfully. All accounts cleared.',
    metadata: {},
    createdAt: daysAgo(30),
    isRead: true,
  },
  {
    clientEmail: 'admin@aminagroup.com',
    type: 'SYSTEM_MAINTENANCE',
    priority: 'LOW',
    title: 'Scheduled maintenance — March 25',
    message:
      'Platform maintenance window scheduled for March 25, 02:00-04:00 UTC. Settlement processing may be delayed.',
    metadata: { maintenanceDate: '2026-03-25' },
    createdAt: daysAgo(1),
  },

  // ── Meridian Trade Finance (4 notifications) ──
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    type: 'SETTLEMENT_COMPLETE',
    priority: 'MEDIUM',
    title: 'Releasing funds — Pacific Rim Exports',
    message: '1,000,000 USDC escrow on EU-UK corridor is releasing funds to Pacific Rim Exports.',
    metadata: { escrowCode: escrowCode('meridian-releasing'), corridor: 'EU-UK', amount: 1000000 },
    createdAt: daysAgo(5),
  },
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    type: 'ESCROW_EXPIRED',
    priority: 'MEDIUM',
    title: 'Escrow expired — HSBC Digital Assets',
    message:
      '400,000 USDC escrow on EU-UK corridor expired under compliance review. Risk score: 55.',
    metadata: {
      escrowCode: escrowCode('meridian-expired'),
      corridor: 'EU-UK',
      amount: 400000,
      riskScore: 55,
    },
    createdAt: daysAgo(8),
  },
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    type: 'DEPOSIT_CONFIRMED',
    priority: 'MEDIUM',
    title: 'Deposit confirmed — Eurolink Trading',
    message: '650,000 USDC deposit confirmed for GB-CH corridor escrow with Eurolink Trading.',
    metadata: { escrowCode: escrowCode('meridian-funded'), corridor: 'GB-CH', amount: 650000 },
    createdAt: daysAgo(1),
  },
  {
    clientEmail: 'treasury@meridian-trade.co.uk',
    type: 'KYB_EXPIRING',
    priority: 'HIGH',
    title: 'KYB verification expiring in 185 days',
    message:
      'Your FCA authorization KYB verification will expire soon. Please initiate renewal with updated trade finance documentation.',
    metadata: {},
    createdAt: daysAgo(3),
  },

  // ── Pacific Rim Exports (4 notifications) ──
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    type: 'ESCROW_RELEASED',
    priority: 'LOW',
    title: 'Settlement complete — Helvetica Digital',
    message:
      '180,000 USDC escrow on SG-CH corridor successfully released. Funds available in your account.',
    metadata: { escrowCode: escrowCode('pacificrim-released'), corridor: 'SG-CH', amount: 180000 },
    createdAt: daysAgo(7),
    isRead: true,
  },
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    type: 'DEPOSIT_CONFIRMED',
    priority: 'MEDIUM',
    title: 'Deposit confirmed — Satoshi Bridge Labs',
    message: '320,000 USDC deposit confirmed for SG-US corridor escrow with Satoshi Bridge.',
    metadata: { escrowCode: escrowCode('pacificrim-funded'), corridor: 'SG-US', amount: 320000 },
    createdAt: daysAgo(1),
  },
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    type: 'ESCROW_CREATED',
    priority: 'MEDIUM',
    title: 'New escrow — Emirates NBD Digital',
    message: '95,000 USDC escrow on SG-AE corridor created and awaiting deposit.',
    metadata: { escrowCode: escrowCode('pacificrim-created'), corridor: 'SG-AE', amount: 95000 },
    createdAt: hoursAgo(4),
  },
  {
    clientEmail: 'finance@pacificrim-exports.sg',
    type: 'COMPLIANCE_CHECK_PASSED',
    priority: 'LOW',
    title: 'Export compliance check cleared',
    message:
      'Your latest SG-US corridor export transaction passed compliance review. No further action required.',
    metadata: { corridor: 'SG-US' },
    createdAt: daysAgo(10),
    isRead: true,
  },
];

// ===========================================================================
// MAIN SEEDER
// ===========================================================================

async function main() {
  if (process.env.NODE_ENV !== 'staging' && !process.argv.includes('--staging')) {
    console.error('ERROR: Requires NODE_ENV=staging or --staging flag');
    process.exit(1);
  }

  console.log('=== Unified Staging Seed — All Institution Data ===\n');
  const passwordHash = await bcrypt.hash('StagingDemo2026!', 12);

  // ── 1. Corridors ──────────────────────────────────────────────────────
  console.log('1. Seeding corridors...');
  for (const [code, cfg] of Object.entries(corridorConfigs)) {
    const [src, dst] = code.split('-');
    await prisma.institutionCorridor.upsert({
      where: { code },
      create: {
        code,
        sourceCountry: src,
        destCountry: dst,
        minAmount: cfg.min,
        maxAmount: cfg.max,
        dailyLimit: cfg.daily,
        monthlyLimit: cfg.monthly,
        requiredDocuments: cfg.docs,
        riskLevel: cfg.risk,
        status: 'ACTIVE',
      },
      update: { minAmount: cfg.min, maxAmount: cfg.max, riskLevel: cfg.risk, status: 'ACTIVE' },
    });
  }
  console.log(`   ${Object.keys(corridorConfigs).length} corridors`);

  // ── 2. Clients ────────────────────────────────────────────────────────
  console.log('\n2. Seeding clients...');
  const clientMap = new Map<string, { id: string; wallet: string; company: string }>();

  for (const c of allClients) {
    const data: any = {
      email: c.email,
      passwordHash,
      companyName: c.companyName,
      tier: c.tier,
      status: c.status,
      kycStatus: c.kycStatus,
      primaryWallet: c.wallet,
      settledWallets: [c.wallet],
      isTestAccount: true,
    };
    // Optional KYB fields
    const optionals: Record<string, any> = {
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
      jurisdiction: c.jurisdiction,
      contactFirstName: c.contactFirstName,
      contactLastName: c.contactLastName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      contactTitle: c.contactTitle,
      kybStatus: c.kybStatus,
      kybVerifiedAt: c.kybVerifiedAt,
      kybExpiresAt: c.kybExpiresAt,
      riskRating: c.riskRating,
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
      walletCustodyType: c.walletCustodyType,
      custodianName: c.custodianName,
      preferredSettlementChain: c.preferredSettlementChain,
    };
    for (const [k, v] of Object.entries(optionals)) {
      if (v !== undefined) data[k] = v;
    }

    const client = await prisma.institutionClient.upsert({
      where: { email: c.email },
      create: data,
      update: {
        companyName: c.companyName,
        primaryWallet: c.wallet,
        settledWallets: [c.wallet],
        status: c.status,
        kycStatus: c.kycStatus,
      },
    });
    clientMap.set(c.email, { id: client.id, wallet: c.wallet, company: c.companyName });
    console.log(`   [${c.counterpartyOnly ? 'CP' : 'OK'}] ${c.companyName} (${c.tier})`);
  }

  // ── 3. Settings ───────────────────────────────────────────────────────
  console.log('\n3. Seeding client settings...');
  for (const [email, s] of Object.entries(settingsByClient)) {
    const clientId = clientMap.get(email)?.id;
    if (!clientId) continue;
    await prisma.institutionClientSettings.upsert({
      where: { clientId },
      create: {
        clientId,
        defaultCorridor: s.corridor,
        defaultCurrency: 'USDC',
        timezone: s.timezone,
        autoApproveThreshold: s.autoApprove ?? null,
        manualReviewThreshold: s.manualReview ?? null,
        autoTravelRule: true,
        activeSanctionsLists: ['OFAC SDN', 'EU Consolidated', 'UN Sanctions'],
        riskTolerance: s.riskTolerance ?? 'low',
        defaultToken: s.defaultToken ?? 'usdc',
        emailNotifications: true,
        notificationEmail: email,
      },
      update: {
        defaultCorridor: s.corridor,
        timezone: s.timezone,
        autoApproveThreshold: s.autoApprove ?? null,
        manualReviewThreshold: s.manualReview ?? null,
        notificationEmail: email,
        emailNotifications: true,
        defaultToken: s.defaultToken ?? 'usdc',
        autoTravelRule: true,
        activeSanctionsLists: ['OFAC SDN', 'EU Consolidated', 'UN Sanctions'],
        riskTolerance: s.riskTolerance ?? 'low',
      },
    });
  }
  console.log(`   ${Object.keys(settingsByClient).length} settings`);

  // ── 4. Branches (Helvetica only) ──────────────────────────────────────
  console.log('\n4. Seeding Helvetica branches...');
  const helveticaId = clientMap.get('ops@helvetica-digital.ch')!.id;

  // Clean branches + accounts first
  await prisma.institutionAccount.deleteMany({ where: { clientId: helveticaId } });
  await prisma.institutionBranch.deleteMany({ where: { clientId: helveticaId } });

  const branchMap: Record<string, string> = {};
  for (const b of helveticaBranches) {
    const branch = await prisma.institutionBranch.create({
      data: {
        clientId: helveticaId,
        name: b.name,
        city: b.city,
        country: b.country,
        countryCode: b.countryCode,
        address: b.address,
        timezone: b.timezone,
        riskScore: b.riskScore,
        complianceStatus: b.complianceStatus,
        regulatoryBody: b.regulatoryBody,
        ...('isSanctioned' in b
          ? { isSanctioned: true, sanctionReason: (b as any).sanctionReason, isActive: false }
          : {}),
      },
    });
    branchMap[b.countryCode] = branch.id;
    console.log(`   ${b.name} (${b.countryCode})${'isSanctioned' in b ? ' [SANCTIONED]' : ''}`);
  }

  // ── 5. Accounts ───────────────────────────────────────────────────────
  console.log('\n5. Seeding accounts...');
  let totalAccounts = 0;

  for (const [email, accounts] of Object.entries(accountsByClient)) {
    const clientId = clientMap.get(email)?.id;
    if (!clientId) continue;

    // Clean existing accounts for non-Helvetica (Helvetica cleaned above with branches)
    if (email !== 'ops@helvetica-digital.ch') {
      await prisma.institutionAccount.deleteMany({ where: { clientId } });
    }

    for (const a of accounts) {
      await prisma.institutionAccount.create({
        data: {
          clientId,
          name: a.name,
          label: a.label,
          accountType: a.accountType,
          walletAddress: fakeWallet(a.walletSeed),
          branchId: a.branchCountryCode ? branchMap[a.branchCountryCode] || null : null,
          isDefault: a.isDefault,
          verificationStatus: 'VERIFIED',
          verifiedAt: daysAgo(90),
          description: a.description,
        },
      });
      totalAccounts++;
    }
  }
  console.log(
    `   ${totalAccounts} accounts across ${Object.keys(accountsByClient).length} clients`
  );

  // ── 6. Clean old data for all loginable clients ───────────────────────
  console.log('\n6. Cleaning previous escrows/payments/notifications...');
  for (const c of loginableClients) {
    const clientId = clientMap.get(c.email)?.id;
    if (!clientId) continue;
    await prisma.institutionAuditLog.deleteMany({ where: { clientId } });
    await prisma.institutionNotification.deleteMany({ where: { clientId } });
    await prisma.institutionEscrow.deleteMany({ where: { clientId } });
    await prisma.directPayment.deleteMany({ where: { clientId } });
  }

  // ── 7. Escrows ────────────────────────────────────────────────────────
  console.log('\n7. Seeding escrows...');
  for (const e of escrowDefs) {
    const payer = clientMap.get(e.payerEmail);
    const recipient = clientMap.get(e.recipientEmail);
    if (!payer || !recipient) {
      console.log(`   [SKIP] ${e.code} — missing client`);
      continue;
    }

    const escrowId = crypto.randomUUID();
    const feeBps = 20;
    const rawFee = (e.amount * feeBps) / 10000;
    const platformFee = Math.min(20, Math.max(0.2, rawFee));
    const expiresAt = new Date(e.createdAt.getTime() + 72 * 3600000);

    const fundedAt = [
      'FUNDED',
      'RELEASING',
      'RELEASED',
      'COMPLIANCE_HOLD',
      'CANCELLING',
      'FAILED',
    ].includes(e.status)
      ? new Date(e.createdAt.getTime() + 30 * 60000)
      : undefined;

    const depositTx = fundedAt ? fakeTxSig(`deposit-${e.code}`) : undefined;
    const releaseTx = ['RELEASED'].includes(e.status) ? fakeTxSig(`release-${e.code}`) : undefined;

    await prisma.institutionEscrow.create({
      data: {
        escrowId,
        escrowCode: e.code,
        clientId: payer.id,
        payerWallet: payer.wallet,
        recipientWallet: recipient.wallet,
        usdcMint: USDC_MINT,
        amount: e.amount,
        platformFee,
        corridor: e.corridor,
        conditionType: e.conditionType,
        status: e.status as any,
        settlementAuthority: payer.wallet,
        riskScore: e.riskScore,
        expiresAt,
        createdAt: e.createdAt,
        fundedAt,
        depositTxSignature: depositTx,
        releaseTxSignature: releaseTx,
      },
    });

    // Audit log
    await prisma.institutionAuditLog.create({
      data: {
        escrowId,
        clientId: payer.id,
        action: 'ESCROW_CREATED',
        actor: e.payerEmail,
        details: { corridor: e.corridor, amount: e.amount, recipient: recipient.company },
        createdAt: e.createdAt,
      },
    });

    if (fundedAt) {
      await prisma.institutionAuditLog.create({
        data: {
          escrowId,
          clientId: payer.id,
          action: 'DEPOSIT_CONFIRMED',
          actor: 'system',
          details: { amount: e.amount, txSignature: depositTx },
          createdAt: fundedAt,
        },
      });
    }

    if (e.status === 'COMPLIANCE_HOLD') {
      await prisma.institutionAuditLog.create({
        data: {
          escrowId,
          clientId: payer.id,
          action: 'COMPLIANCE_REVIEW_REQUIRED',
          actor: 'system',
          details: {
            reason: 'Automated compliance check flagged for manual review',
            riskScore: e.riskScore,
          },
          createdAt: new Date(e.createdAt.getTime() + 15 * 60000),
        },
      });
    }

    console.log(
      `   ${e.code} (${payer.company} -> ${recipient.company}, $${e.amount.toLocaleString()}, ${
        e.status
      })`
    );
  }

  // ── 8. Direct Payments ────────────────────────────────────────────────
  console.log('\n8. Seeding direct payments...');
  for (const dp of paymentDefs) {
    const payer = clientMap.get(dp.payerEmail);
    const recipient = clientMap.get(dp.recipientEmail);
    if (!payer || !recipient) {
      console.log(`   [SKIP] ${dp.code} — missing client`);
      continue;
    }

    const feeBps = 25;
    const rawFee = (dp.amount * feeBps) / 10000;
    const platformFee = Math.min(20, Math.max(0.2, rawFee));
    const txHash = dp.status === 'completed' ? fakeTxSig(`dp-${dp.code}`) : null;
    const settledAt =
      dp.status === 'completed' ? new Date(dp.createdAt.getTime() + 10 * 60000) : null;

    await prisma.directPayment.deleteMany({ where: { paymentCode: dp.code } });

    await prisma.directPayment.create({
      data: {
        clientId: payer.id,
        paymentCode: dp.code,
        sender: payer.company,
        senderCountry: dp.corridor.split('-')[0],
        senderWallet: payer.wallet,
        recipient: recipient.company,
        recipientCountry: dp.corridor.split('-')[1],
        recipientWallet: recipient.wallet,
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

    console.log(
      `   ${dp.code}: ${payer.company} -> ${recipient.company} ($${dp.amount.toLocaleString()} ${
        dp.currency
      }, ${dp.status})`
    );
  }

  // ── 9. Notifications ──────────────────────────────────────────────────
  console.log('\n9. Seeding notifications...');
  for (const n of notificationDefs) {
    const clientId = clientMap.get(n.clientEmail)?.id;
    if (!clientId) continue;

    await prisma.institutionNotification.create({
      data: {
        clientId,
        type: n.type as any,
        priority: n.priority as any,
        title: n.title,
        message: n.message,
        metadata: n.metadata,
        isRead: n.isRead ?? false,
        readAt: n.isRead ? daysAgo(1) : null,
        createdAt: n.createdAt,
      },
    });
  }
  console.log(
    `   ${notificationDefs.length} notifications across ${loginableClients.length} clients`
  );

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n=== Staging Seed Complete ===');
  console.log(`   Corridors: ${Object.keys(corridorConfigs).length}`);
  console.log(
    `   Clients: ${allClients.length} (${loginableClients.length} loginable + ${counterpartyClients.length} counterparty)`
  );
  console.log(`   Accounts: ${totalAccounts}`);
  console.log(`   Branches: ${helveticaBranches.length} (Helvetica)`);
  console.log(`   Escrows: ${escrowDefs.length}`);
  console.log(`   Direct Payments: ${paymentDefs.length}`);
  console.log(`   Notifications: ${notificationDefs.length}`);
  console.log(`\n   Password for all logins: StagingDemo2026!`);
  console.log(`\n   Loginable accounts:`);
  for (const c of loginableClients) {
    console.log(`     ${c.email} (${c.companyName})`);
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
