/**
 * Seed Stealth Meta-Addresses for Staging Institutions
 *
 * Registers stealth meta-addresses for institution clients that don't have one,
 * enabling stealth privacy on their next escrow release.
 *
 * Usage: npx ts-node scripts/seed-stealth-meta-addresses.ts
 *
 * Requires env vars: DATABASE_URL, STEALTH_KEY_ENCRYPTION_SECRET, PRIVACY_ENABLED
 * Idempotent: skips clients that already have an active meta-address.
 */

import { PrismaClient } from '../src/generated/prisma';
import { getStealthAddressService } from '../src/services/privacy/stealth-address.service';
import { isPrivacyEnabled } from '../src/utils/featureFlags';

const prisma = new PrismaClient();

// Clients to register meta-addresses for (by email)
const TARGET_CLIENTS = [
  'finance@satoshi-bridge.io',      // Satoshi Bridge Labs Inc
  'treasury@optimus-exchange.ch',   // Optimus Exchange AG
  'ops@chainflow-remit.sg',         // ChainFlow Remittance Pte Ltd
  'admin@aminagroup.com',           // AMINA Bank AG
];

async function main() {
  if (!isPrivacyEnabled()) {
    console.error('❌ PRIVACY_ENABLED is false — cannot register meta-addresses');
    process.exit(1);
  }

  const stealthService = getStealthAddressService();
  let created = 0;
  let skipped = 0;

  for (const email of TARGET_CLIENTS) {
    const client = await prisma.institutionClient.findUnique({
      where: { email },
      select: { id: true, companyName: true },
    });

    if (!client) {
      console.log(`⚠ Client not found: ${email} — skipping`);
      skipped++;
      continue;
    }

    // Check if client already has an active meta-address
    const existing = await prisma.stealthMetaAddress.findFirst({
      where: { institutionClientId: client.id, isActive: true },
      select: { id: true },
    });

    if (existing) {
      console.log(`✓ ${client.companyName} already has meta-address ${existing.id} — skipping`);
      skipped++;
      continue;
    }

    // Register new meta-address
    const result = await stealthService.registerMetaAddress(client.id, 'default');
    console.log(`✅ ${client.companyName} — registered meta-address ${result.id}`);
    console.log(`   scanPub: ${result.scanPublicKey}`);
    console.log(`   spendPub: ${result.spendPublicKey}`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
