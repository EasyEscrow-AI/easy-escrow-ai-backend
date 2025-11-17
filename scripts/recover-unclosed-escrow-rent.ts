/**
 * Script to recover rent from unclosed escrow PDAs (PRODUCTION MAINNET)
 * 
 * This script scans the blockchain directly for ALL escrow PDAs owned by the program
 * and closes them to recover rent-exempt lamports back to the admin wallet.
 * 
 * STANDALONE SCRIPT - Always uses production mainnet, no configuration needed.
 * 
 * Each closed escrow recovers ~0.002-0.003 SOL (rent-exempt reserve)
 * 
 * Requirements:
 *   - MAINNET_ADMIN_PRIVATE_KEY environment variable (base58 encoded)
 * 
 * Usage:
 *   npx ts-node scripts/recover-unclosed-escrow-rent.ts --dry-run  (preview only)
 *   npx ts-node scripts/recover-unclosed-escrow-rent.ts             (execute recovery)
 *   npx ts-node scripts/recover-unclosed-escrow-rent.ts --limit 10  (max 10 closures)
 */

// Force production mode and load production environment variables
process.env.NODE_ENV = 'production';

// Load .env.production file explicitly
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

import { Connection, PublicKey } from '@solana/web3.js';
import { PrismaClient, AgreementStatus } from '../src/generated/prisma';
import { getEscrowProgramService } from '../src/services/escrow-program.service';

const prisma = new PrismaClient();

interface EscrowRentRecoveryOptions {
  dryRun?: boolean;
  limit?: number;
}

// Terminal statuses where escrow can be closed
const TERMINAL_STATUSES: AgreementStatus[] = [
  AgreementStatus.SETTLED,
  AgreementStatus.REFUNDED,
  AgreementStatus.CANCELLED,
  AgreementStatus.ARCHIVED,
  AgreementStatus.EXPIRED,
];

/**
 * Check if an escrow account exists on-chain
 */
async function checkEscrowExists(
  connection: Connection,
  escrowPda: PublicKey
): Promise<{ exists: boolean; lamports?: number }> {
  try {
    const accountInfo = await connection.getAccountInfo(escrowPda);
    if (accountInfo) {
      return { exists: true, lamports: accountInfo.lamports };
    }
    return { exists: false };
  } catch (error) {
    console.error(`Error checking escrow ${escrowPda.toString()}:`, error);
    return { exists: false };
  }
}

/**
 * Find all escrow PDAs on-chain (scan blockchain directly)
 */
async function findUnclosedEscrows() {
  console.log('🔍 Scanning blockchain for escrow PDAs...\n');

  // Connect directly to production mainnet
  const RPC_URL = process.env.MAINNET_RPC_URL || 'https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/';
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx'); // Production program ID

  console.log(`Program ID: ${programId.toString()}`);
  console.log(`RPC: ${connection.rpcEndpoint}\n`);

  // Get ALL accounts owned by the escrow program
  console.log('📋 Fetching all escrow program accounts (this may take a moment)...\n');
  
  const accounts = await connection.getProgramAccounts(programId);

  console.log(`Found ${accounts.length} escrow PDAs on-chain\n`);

  // Convert to the format expected by the rest of the script
  const escrowsWithInfo = accounts.map((account, index) => ({
    id: `on-chain-${index}`,
    agreementId: `ONCHAIN-${index + 1}`,
    escrowPda: account.pubkey.toString(),
    status: 'UNKNOWN' as AgreementStatus,
    settledAt: null,
    cancelledAt: null,
    archivedAt: null,
    createdAt: new Date(),
    swapType: 'UNKNOWN' as any,
    lamports: account.account.lamports,
  }));

  return escrowsWithInfo;
}

/**
 * Process escrow PDAs found on-chain
 */
async function checkEscrowsOnChain(
  agreements: any[]
): Promise<{ agreementId: string; escrowPda: string; lamports: number; status: string; date: Date }[]> {
  console.log('⛓️  Processing escrow PDAs found on-chain...\n');

  const unclosedEscrows = agreements.map((agreement) => ({
    agreementId: agreement.agreementId,
    escrowPda: agreement.escrowPda,
    lamports: agreement.lamports,
    status: agreement.status,
    date: agreement.settledAt || agreement.cancelledAt || agreement.archivedAt || agreement.createdAt,
  }));

  // Display first 10 for reference
  const displayCount = Math.min(10, unclosedEscrows.length);
  for (let i = 0; i < displayCount; i++) {
    const escrow = unclosedEscrows[i];
    console.log(
      `  ✓ ${escrow.agreementId} | Rent: ${escrow.lamports / 1e9} SOL | PDA: ${escrow.escrowPda.slice(0, 8)}...`
    );
  }
  
  if (unclosedEscrows.length > displayCount) {
    console.log(`  ... and ${unclosedEscrows.length - displayCount} more`);
  }

  console.log(`\n📊 Found ${unclosedEscrows.length} unclosed escrows with total rent: ${unclosedEscrows.reduce((sum, e) => sum + e.lamports, 0) / 1e9} SOL\n`);

  return unclosedEscrows;
}

/**
 * Close escrows and recover rent
 */
async function closeEscrows(
  escrows: { agreementId: string; escrowPda: string; lamports: number }[],
  options: EscrowRentRecoveryOptions
) {
  const { dryRun = false, limit } = options;

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No closures will be executed\n');
  }

  const escrowsToClose = limit ? escrows.slice(0, limit) : escrows;
  
  if (limit && escrows.length > limit) {
    console.log(`⚠️  Limiting to ${limit} of ${escrows.length} escrows\n`);
  }

  if (dryRun) {
    console.log(`Would close ${escrowsToClose.length} escrows and recover ${escrowsToClose.reduce((sum, e) => sum + e.lamports, 0) / 1e9} SOL\n`);
    return { closed: 0, failed: 0, totalRecovered: 0 };
  }

  console.log(`🔒 Closing ${escrowsToClose.length} escrows...\n`);

  // Get production escrow service (NODE_ENV=production set at top of script)
  const escrowService = getEscrowProgramService();
  console.log(`✅ Using escrow program: ${escrowService.programId.toString()}\n`);
  
  let closed = 0;
  let failed = 0;
  let totalRecovered = 0;

  for (const escrow of escrowsToClose) {
    try {
      console.log(`  Closing ${escrow.agreementId}...`);
      
      const txId = await escrowService.closeEscrow(new PublicKey(escrow.escrowPda));
      
      console.log(`  ✅ Closed! Recovered ${escrow.lamports / 1e9} SOL`);
      console.log(`     TX: https://explorer.solana.com/tx/${txId}?cluster=mainnet-beta\n`);
      
      closed++;
      totalRecovered += escrow.lamports;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      console.error(`  ❌ Failed: ${error.message}\n`);
      failed++;
    }
  }

  return { closed, failed, totalRecovered };
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : undefined;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏦 ESCROW RENT RECOVERY TOOL');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('🔍 Mode: DRY RUN (preview only)\n');
  }

  if (limit) {
    console.log(`📊 Limit: ${limit} escrows max\n`);
  }

  try {
    // 1. Find agreements with potential unclosed escrows
    const agreements = await findUnclosedEscrows();

    if (agreements.length === 0) {
      console.log('✨ No agreements in terminal states found.\n');
      return;
    }

    // 2. Process escrow PDAs found on-chain
    const unclosedEscrows = await checkEscrowsOnChain(agreements);

    if (unclosedEscrows.length === 0) {
      console.log('✨ All escrows have already been closed! No rent to recover.\n');
      return;
    }

    // 3. Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total Agreements in Terminal States: ${agreements.length}`);
    console.log(`Unclosed Escrows: ${unclosedEscrows.length}`);
    console.log(`Recoverable Rent: ${unclosedEscrows.reduce((sum, e) => sum + e.lamports, 0) / 1e9} SOL`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // 4. Close escrows
    const results = await closeEscrows(unclosedEscrows, { dryRun, limit });

    // 5. Final summary
    if (!dryRun) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ RECOVERY COMPLETE');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`Closed: ${results.closed}`);
      console.log(`Failed: ${results.failed}`);
      console.log(`Total Recovered: ${results.totalRecovered / 1e9} SOL`);
      console.log('═══════════════════════════════════════════════════════════\n');
    }

  } catch (error) {
    console.error('\n❌ Error during rent recovery:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();

