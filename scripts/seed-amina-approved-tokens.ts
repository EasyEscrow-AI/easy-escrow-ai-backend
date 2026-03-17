/**
 * Seed AMINA-Approved Token Whitelist
 *
 * Seeds the institution approved token whitelist with AMINA Bank's
 * supported stablecoins for custody, trading, and escrow settlement.
 *
 * Usage: npx ts-node scripts/seed-amina-approved-tokens.ts
 *
 * Idempotent: uses upsert by symbol.
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// AMINA-approved stablecoins (Solana SPL token mints)
const AMINA_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
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
    jurisdiction: 'BVI',
    isDefault: false,
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    mintAddress: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr',
    decimals: 6,
    issuer: 'Circle',
    jurisdiction: 'EU',
    isDefault: false,
  },
  {
    symbol: 'PYUSD',
    name: 'PayPal USD',
    mintAddress: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo',
    decimals: 6,
    issuer: 'Paxos (PayPal)',
    jurisdiction: 'US',
    isDefault: false,
  },
  // Tokens pending Solana mint deployment — placeholder addresses marked inactive
  {
    symbol: 'RLUSD',
    name: 'Ripple USD',
    mintAddress: 'RLUSD_PENDING_SOLANA_DEPLOYMENT',
    decimals: 6,
    issuer: 'Ripple',
    jurisdiction: 'US',
    isDefault: false,
    isActive: false,
  },
  {
    symbol: 'USDG',
    name: 'Global Dollar',
    mintAddress: 'USDG_PENDING_SOLANA_DEPLOYMENT',
    decimals: 6,
    issuer: 'Paxos (Global Dollar Network)',
    jurisdiction: 'US',
    isDefault: false,
    isActive: false,
  },
];

async function main() {
  console.log('=== AMINA-Approved Token Whitelist Seeder ===\n');

  for (const token of AMINA_TOKENS) {
    const isActive = token.isActive !== undefined ? token.isActive : true;

    await prisma.institutionApprovedToken.upsert({
      where: { symbol: token.symbol },
      create: {
        symbol: token.symbol,
        name: token.name,
        mintAddress: token.mintAddress,
        decimals: token.decimals,
        issuer: token.issuer,
        jurisdiction: token.jurisdiction,
        chain: 'solana',
        isDefault: token.isDefault,
        isActive,
        aminaApproved: true,
      },
      update: {
        name: token.name,
        mintAddress: token.mintAddress,
        decimals: token.decimals,
        issuer: token.issuer,
        jurisdiction: token.jurisdiction,
        isDefault: token.isDefault,
        isActive,
        aminaApproved: true,
      },
    });

    const status = isActive ? 'ACTIVE' : 'PENDING';
    console.log(`  [${status}] ${token.symbol} — ${token.name} (${token.issuer})`);
    if (!isActive) {
      console.log(`         Awaiting Solana mint deployment`);
    }
  }

  console.log(`\n=== ${AMINA_TOKENS.length} tokens seeded ===`);
  console.log(`   Active: ${AMINA_TOKENS.filter((t) => t.isActive !== false).length}`);
  console.log(`   Pending: ${AMINA_TOKENS.filter((t) => t.isActive === false).length}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
