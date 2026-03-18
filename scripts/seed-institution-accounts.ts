/**
 * Seed Institution Accounts
 *
 * Creates multi-account data for existing institution clients seeded by
 * seed-institution-staging.ts. Each client gets 2-4 accounts of different
 * types (Treasury, Operations, Settlement, General) with varied settings.
 *
 * Uses real well-known Solana mainnet wallets for balance endpoint testing.
 *
 * Usage: npx ts-node scripts/seed-institution-accounts.ts
 *
 * Idempotent: uses upsert by (clientId, name) unique constraint.
 */

import { PrismaClient } from '../src/generated/prisma';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

/** Deterministic fake Solana address — produces a valid 32-byte base58 public key */
function fakeWallet(seed: string): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  // SHA-256 produces exactly 32 bytes
  const bytes = createHash('sha256').update(seed).digest();
  // Base58 encode the 32-byte buffer
  let num = BigInt('0x' + bytes.toString('hex'));
  let out = '';
  while (num > 0n) {
    out = chars[Number(num % 58n)] + out;
    num = num / 58n;
  }
  // Pad leading zeros (bytes that are 0x00 become '1' in base58)
  for (const b of bytes) {
    if (b === 0) out = '1' + out;
    else break;
  }
  return out;
}

// Well-known Solana mainnet wallets (real addresses, will return actual balances)
const REAL_WALLETS = {
  circle: '7VHUFJHWu2CuExkJcJrzhQPJ2oygupd2fMsZMRET9eP8',
  coinbase: 'H8sMJSCQxfKbeKb5nyrP1mWJaMwYqH1hanGU8CYpump',
  binance: '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
  jump: 'EUKnThcyuPhEF7rXDKnKGWS9Kpko9U6hMDay3manMGqE',
  phantom: '6gYjCj2VqAX7YxJLJCRSmW4TKhGHPEp2kLZoZxjSFB4E',
};

interface AccountDef {
  name: string;
  label?: string;
  accountType: 'TREASURY' | 'OPERATIONS' | 'SETTLEMENT' | 'COLLATERAL' | 'GENERAL';
  description?: string;
  walletAddress: string;
  walletProvider?: string;
  custodyType?: 'SELF_CUSTODY' | 'THIRD_PARTY' | 'MPC' | 'MULTISIG' | 'EXCHANGE';
  verificationStatus: 'PENDING' | 'VERIFIED' | 'SUSPENDED' | 'REJECTED';
  verifiedAt?: Date;
  maxTransactionAmount?: number;
  minTransactionAmount?: number;
  dailyVolumeLimit?: number;
  monthlyVolumeLimit?: number;
  dailyTransactionCountLimit?: number;
  monthlyTransactionCountLimit?: number;
  approvalMode: 'AUTO' | 'SINGLE_APPROVAL' | 'MULTI_APPROVAL';
  approvalThreshold?: number;
  whitelistEnforced?: boolean;
  notificationEmail?: string;
  isDefault: boolean;
}

// Account definitions per client email
const clientAccounts: Record<string, AccountDef[]> = {
  'ops@helvetica-digital.ch': [
    {
      name: 'Operating Account',
      label: 'Operating Account',
      accountType: 'OPERATIONS',
      description:
        'Primary operating account for day-to-day USDC transactions and client settlements',
      walletAddress: REAL_WALLETS.circle,
      walletProvider: 'Fireblocks',
      custodyType: 'MPC',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2025-12-15'),
      maxTransactionAmount: 500000,
      minTransactionAmount: 100,
      dailyVolumeLimit: 2000000,
      monthlyVolumeLimit: 50000000,
      dailyTransactionCountLimit: 200,
      monthlyTransactionCountLimit: 2000,
      approvalMode: 'SINGLE_APPROVAL',
      approvalThreshold: 25000,
      notificationEmail: 'ops@helvetica-digital.ch',
      isDefault: true,
    },
    {
      name: 'Escrow Reserve',
      label: 'Escrow Reserve',
      accountType: 'TREASURY',
      description:
        'Reserved funds backing active escrow positions and institutional custody reserves',
      walletAddress: REAL_WALLETS.coinbase,
      walletProvider: 'Fireblocks',
      custodyType: 'MPC',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2025-12-15'),
      maxTransactionAmount: 1000000,
      minTransactionAmount: 1000,
      dailyVolumeLimit: 5000000,
      monthlyVolumeLimit: 100000000,
      dailyTransactionCountLimit: 50,
      monthlyTransactionCountLimit: 500,
      approvalMode: 'MULTI_APPROVAL',
      approvalThreshold: 50000,
      notificationEmail: 'treasury-ops@helvetica-digital.ch',
      isDefault: false,
    },
    {
      name: 'Settlement Float',
      label: 'Settlement Float',
      accountType: 'SETTLEMENT',
      description:
        'Multi-stablecoin settlement float for cross-border USDC, EURC, and USDT transfers',
      walletAddress: REAL_WALLETS.binance,
      walletProvider: 'Fireblocks',
      custodyType: 'MPC',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2025-12-20'),
      maxTransactionAmount: 250000,
      dailyVolumeLimit: 1000000,
      approvalMode: 'AUTO',
      notificationEmail: 'settlement@helvetica-digital.ch',
      isDefault: false,
    },
  ],

  'treasury@alpine-custody.ch': [
    {
      name: 'Primary Operations',
      label: 'Main Operating Account',
      accountType: 'OPERATIONS',
      description: 'Primary operations account for custody settlement',
      walletAddress: REAL_WALLETS.binance,
      walletProvider: 'Gnosis Safe',
      custodyType: 'MULTISIG',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-01-10'),
      maxTransactionAmount: 200000,
      minTransactionAmount: 500,
      dailyVolumeLimit: 750000,
      monthlyVolumeLimit: 15000000,
      dailyTransactionCountLimit: 100,
      approvalMode: 'AUTO',
      approvalThreshold: 10000,
      notificationEmail: 'treasury@alpine-custody.ch',
      isDefault: true,
    },
    {
      name: 'Reserve Fund',
      label: 'Cold Storage Reserve',
      accountType: 'COLLATERAL',
      description: 'Cold storage reserve for client collateral',
      walletAddress: fakeWallet('alpine-reserve'),
      walletProvider: 'Ledger',
      custodyType: 'SELF_CUSTODY',
      verificationStatus: 'PENDING',
      maxTransactionAmount: 1000000,
      approvalMode: 'MULTI_APPROVAL',
      approvalThreshold: 100000,
      isDefault: false,
    },
  ],

  'finance@satoshi-bridge.io': [
    {
      name: 'Treasury',
      label: 'Main Treasury',
      accountType: 'TREASURY',
      description: 'Primary treasury for cross-border bridge operations',
      walletAddress: REAL_WALLETS.jump,
      walletProvider: 'Fireblocks',
      custodyType: 'MPC',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-01-05'),
      maxTransactionAmount: 1000000,
      minTransactionAmount: 1000,
      dailyVolumeLimit: 5000000,
      monthlyVolumeLimit: 100000000,
      dailyTransactionCountLimit: 100,
      monthlyTransactionCountLimit: 1000,
      approvalMode: 'MULTI_APPROVAL',
      approvalThreshold: 100000,
      whitelistEnforced: true,
      notificationEmail: 'finance@satoshi-bridge.io',
      isDefault: true,
    },
    {
      name: 'Operations',
      label: 'Bridge Operations',
      accountType: 'OPERATIONS',
      description: 'Operational account for daily bridge transactions',
      walletAddress: REAL_WALLETS.phantom,
      walletProvider: 'Phantom',
      custodyType: 'SELF_CUSTODY',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-01-05'),
      maxTransactionAmount: 250000,
      dailyVolumeLimit: 1000000,
      approvalMode: 'AUTO',
      notificationEmail: 'ops@satoshi-bridge.io',
      isDefault: false,
    },
    {
      name: 'Settlement MX',
      label: 'Mexico Corridor Settlement',
      accountType: 'SETTLEMENT',
      description: 'Dedicated settlement for US-MX corridor',
      walletAddress: fakeWallet('satoshi-settlement-mx'),
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-01-10'),
      maxTransactionAmount: 500000,
      approvalMode: 'SINGLE_APPROVAL',
      approvalThreshold: 50000,
      isDefault: false,
    },
    {
      name: 'General',
      accountType: 'GENERAL',
      description: 'General purpose account for testing',
      walletAddress: fakeWallet('satoshi-general'),
      verificationStatus: 'PENDING',
      approvalMode: 'AUTO',
      isDefault: false,
    },
  ],

  'ops@chainflow-remit.sg': [
    {
      name: 'Remittance Operations',
      label: 'SG Operations',
      accountType: 'OPERATIONS',
      description: 'Primary remittance operations for APAC corridor',
      walletAddress: REAL_WALLETS.circle,
      walletProvider: 'BitGo',
      custodyType: 'THIRD_PARTY',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-02-01'),
      maxTransactionAmount: 100000,
      minTransactionAmount: 100,
      dailyVolumeLimit: 500000,
      monthlyVolumeLimit: 10000000,
      approvalMode: 'AUTO',
      notificationEmail: 'ops@chainflow-remit.sg',
      isDefault: true,
    },
    {
      name: 'Settlement',
      accountType: 'SETTLEMENT',
      description: 'Settlement account for completed remittances',
      walletAddress: fakeWallet('chainflow-settlement'),
      verificationStatus: 'PENDING',
      approvalMode: 'SINGLE_APPROVAL',
      approvalThreshold: 10000,
      isDefault: false,
    },
  ],

  'admin@aminagroup.com': [
    {
      name: 'Treasury',
      label: 'AMINA Treasury',
      accountType: 'TREASURY',
      description: 'Institutional treasury for banking operations',
      walletAddress: REAL_WALLETS.binance,
      walletProvider: 'Fireblocks',
      custodyType: 'MPC',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2025-11-01'),
      maxTransactionAmount: 2000000,
      minTransactionAmount: 5000,
      dailyVolumeLimit: 10000000,
      monthlyVolumeLimit: 200000000,
      dailyTransactionCountLimit: 50,
      monthlyTransactionCountLimit: 500,
      approvalMode: 'MULTI_APPROVAL',
      approvalThreshold: 250000,
      whitelistEnforced: true,
      notificationEmail: 'treasury@aminagroup.com',
      isDefault: true,
    },
    {
      name: 'Operations',
      label: 'Client Operations',
      accountType: 'OPERATIONS',
      description: 'Day-to-day client settlement operations',
      walletAddress: REAL_WALLETS.jump,
      walletProvider: 'Fireblocks',
      custodyType: 'MPC',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2025-11-01'),
      maxTransactionAmount: 500000,
      dailyVolumeLimit: 2000000,
      approvalMode: 'SINGLE_APPROVAL',
      approvalThreshold: 50000,
      notificationEmail: 'ops@aminagroup.com',
      isDefault: false,
    },
    {
      name: 'Collateral Reserve',
      accountType: 'COLLATERAL',
      description: 'Collateral reserve for margin and lending operations',
      walletAddress: fakeWallet('amina-collateral'),
      walletProvider: 'Copper',
      custodyType: 'THIRD_PARTY',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2025-11-15'),
      maxTransactionAmount: 1000000,
      approvalMode: 'MULTI_APPROVAL',
      approvalThreshold: 500000,
      isDefault: false,
    },
  ],

  'treasury@meridian-trade.co.uk': [
    {
      name: 'Trade Settlement',
      label: 'EU-UK Settlement',
      accountType: 'SETTLEMENT',
      description: 'Settlement account for EU-UK trade finance',
      walletAddress: REAL_WALLETS.phantom,
      walletProvider: 'Phantom',
      custodyType: 'SELF_CUSTODY',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-01-20'),
      maxTransactionAmount: 200000,
      dailyVolumeLimit: 500000,
      approvalMode: 'SINGLE_APPROVAL',
      approvalThreshold: 25000,
      notificationEmail: 'treasury@meridian-trade.co.uk',
      isDefault: true,
    },
    {
      name: 'General',
      accountType: 'GENERAL',
      description: 'General purpose account',
      walletAddress: fakeWallet('meridian-general'),
      verificationStatus: 'PENDING',
      approvalMode: 'AUTO',
      isDefault: false,
    },
  ],

  'finance@pacificrim-exports.sg': [
    {
      name: 'Export Settlements',
      label: 'APAC Exports',
      accountType: 'SETTLEMENT',
      description: 'Settlement for Asia-Pacific export payments',
      walletAddress: REAL_WALLETS.coinbase,
      walletProvider: 'BitGo',
      custodyType: 'THIRD_PARTY',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-02-10'),
      maxTransactionAmount: 50000,
      minTransactionAmount: 500,
      dailyVolumeLimit: 200000,
      approvalMode: 'AUTO',
      notificationEmail: 'finance@pacificrim-exports.sg',
      isDefault: true,
    },
  ],

  'onboarding@nova-payments.ch': [
    {
      name: 'Operations',
      label: 'Nova Ops',
      accountType: 'OPERATIONS',
      description: 'Primary operations for payment processing',
      walletAddress: fakeWallet('nova-ops'),
      verificationStatus: 'PENDING',
      approvalMode: 'AUTO',
      notificationEmail: 'onboarding@nova-payments.ch',
      isDefault: true,
    },
  ],

  'compliance@defi-connect.co.uk': [
    {
      name: 'DeFi Operations',
      accountType: 'OPERATIONS',
      description: 'DeFi protocol integration operations',
      walletAddress: fakeWallet('defi-connect-ops'),
      verificationStatus: 'PENDING',
      approvalMode: 'SINGLE_APPROVAL',
      approvalThreshold: 5000,
      notificationEmail: 'compliance@defi-connect.co.uk',
      isDefault: true,
    },
    {
      name: 'Treasury',
      accountType: 'TREASURY',
      description: 'Protocol treasury',
      walletAddress: fakeWallet('defi-connect-treasury'),
      verificationStatus: 'PENDING',
      approvalMode: 'MULTI_APPROVAL',
      approvalThreshold: 25000,
      isDefault: false,
    },
  ],
};

async function main() {
  console.log('=== Seeding Institution Accounts ===\n');

  let created = 0;
  let skipped = 0;

  for (const [email, accounts] of Object.entries(clientAccounts)) {
    // Look up the client by email
    const client = await prisma.institutionClient.findUnique({
      where: { email },
      select: { id: true, companyName: true },
    });

    if (!client) {
      console.log(`⚠️  Client not found for ${email} — skipping`);
      skipped += accounts.length;
      continue;
    }

    console.log(`📦 ${client.companyName} (${email})`);

    for (const acct of accounts) {
      try {
        await prisma.institutionAccount.upsert({
          where: {
            clientId_name: { clientId: client.id, name: acct.name },
          },
          create: {
            clientId: client.id,
            name: acct.name,
            label: acct.label || null,
            accountType: acct.accountType,
            description: acct.description || null,
            walletAddress: acct.walletAddress,
            walletProvider: acct.walletProvider || null,
            custodyType: acct.custodyType || null,
            verificationStatus: acct.verificationStatus,
            verifiedAt: acct.verifiedAt || null,
            maxTransactionAmount: acct.maxTransactionAmount || null,
            minTransactionAmount: acct.minTransactionAmount || null,
            dailyVolumeLimit: acct.dailyVolumeLimit || null,
            monthlyVolumeLimit: acct.monthlyVolumeLimit || null,
            dailyTransactionCountLimit: acct.dailyTransactionCountLimit || null,
            monthlyTransactionCountLimit: acct.monthlyTransactionCountLimit || null,
            approvalMode: acct.approvalMode,
            approvalThreshold: acct.approvalThreshold || null,
            whitelistEnforced: acct.whitelistEnforced || false,
            notificationEmail: acct.notificationEmail || null,
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
            maxTransactionAmount: acct.maxTransactionAmount || null,
            minTransactionAmount: acct.minTransactionAmount || null,
            dailyVolumeLimit: acct.dailyVolumeLimit || null,
            monthlyVolumeLimit: acct.monthlyVolumeLimit || null,
            dailyTransactionCountLimit: acct.dailyTransactionCountLimit || null,
            monthlyTransactionCountLimit: acct.monthlyTransactionCountLimit || null,
            approvalMode: acct.approvalMode,
            approvalThreshold: acct.approvalThreshold || null,
            whitelistEnforced: acct.whitelistEnforced || false,
            notificationEmail: acct.notificationEmail || null,
            isDefault: acct.isDefault,
          },
        });

        console.log(`   ✅ ${acct.name} (${acct.accountType}, ${acct.verificationStatus})`);
        created++;
      } catch (err: any) {
        console.log(`   ❌ ${acct.name}: ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`   Created/updated: ${created}`);
  console.log(`   Skipped: ${skipped}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
