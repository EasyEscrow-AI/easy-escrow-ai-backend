/**
 * Script to recover rent from unclosed escrow PDAs
 * 
 * Finds all agreements in terminal states (SETTLED, REFUNDED, CANCELLED, ARCHIVED, EXPIRED)
 * that still have open escrow accounts, and closes them to recover rent.
 * 
 * Each closed escrow recovers ~0.00230376 SOL (rent-exempt reserve)
 * 
 * Usage:
 *   npx ts-node scripts/recover-unclosed-escrow-rent.ts
 *   npx ts-node scripts/recover-unclosed-escrow-rent.ts --dry-run  (preview only)
 *   npx ts-node scripts/recover-unclosed-escrow-rent.ts --limit 10 (max 10 closures)
 */

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
 * Find all agreements with unclosed escrows
 */
async function findUnclosedEscrows() {
  console.log('🔍 Finding agreements with unclosed escrows...\n');

  const agreements = await prisma.agreement.findMany({
    where: {
      status: {
        in: TERMINAL_STATUSES,
      },
      escrowPda: {
        not: null,
      },
    },
    select: {
      id: true,
      agreementId: true,
      escrowPda: true,
      status: true,
      settledAt: true,
      cancelledAt: true,
      archivedAt: true,
      createdAt: true,
      swapType: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`Found ${agreements.length} agreements in terminal states\n`);

  return agreements;
}

/**
 * Check which escrows still exist on-chain
 */
async function checkEscrowsOnChain(
  agreements: any[],
  connection: Connection
): Promise<{ agreementId: string; escrowPda: string; lamports: number; status: string; date: Date }[]> {
  console.log('⛓️  Checking which escrows still exist on-chain...\n');

  const unclosedEscrows: { agreementId: string; escrowPda: string; lamports: number; status: string; date: Date }[] = [];

  for (const agreement of agreements) {
    const escrowPda = new PublicKey(agreement.escrowPda);
    const result = await checkEscrowExists(connection, escrowPda);

    if (result.exists && result.lamports) {
      unclosedEscrows.push({
        agreementId: agreement.agreementId,
        escrowPda: agreement.escrowPda,
        lamports: result.lamports,
        status: agreement.status,
        date: agreement.settledAt || agreement.cancelledAt || agreement.archivedAt || agreement.createdAt,
      });

      console.log(
        `  ✓ ${agreement.agreementId} | Status: ${agreement.status} | Rent: ${result.lamports / 1e9} SOL | PDA: ${agreement.escrowPda.slice(0, 8)}...`
      );
    }
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

  const escrowService = getEscrowProgramService();
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

    // 2. Check which escrows still exist on-chain
    const escrowService = getEscrowProgramService();
    const connection = escrowService.getConnection();
    const unclosedEscrows = await checkEscrowsOnChain(agreements, connection);

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

