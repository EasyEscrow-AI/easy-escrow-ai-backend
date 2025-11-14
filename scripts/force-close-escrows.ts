/**
 * Force close escrow accounts by admin-cancelling them first, then closing
 * 
 * Process:
 * 1. Scan blockchain for all escrow PDAs
 * 2. For each PDA: Try admin_cancel (if not already cancelled)
 * 3. Then try close_escrow to recover rent
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

process.env.NODE_ENV = 'production';

import { Connection, PublicKey } from '@solana/web3.js';
import { getEscrowProgramService } from '../src/services/escrow-program.service';

const RPC_URL = 'https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/';
const PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '999999');

async function forceCloseEscrows() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔧 FORCE CLOSE ESCROW ACCOUNTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(DRY_RUN ? '🔍 DRY RUN MODE - No changes will be made' : '⚠️  LIVE MODE - Accounts will be closed');
  console.log('');

  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);

  // Get all program accounts
  console.log('📋 Scanning blockchain for escrow PDAs...\n');
  const accounts = await connection.getProgramAccounts(programId);
  
  const totalAccounts = Math.min(accounts.length, LIMIT);
  const totalRent = accounts.slice(0, totalAccounts).reduce((sum, acc) => sum + acc.account.lamports, 0) / 1e9;
  
  console.log(`Found: ${accounts.length} accounts`);
  console.log(`Will process: ${totalAccounts} accounts`);
  console.log(`Estimated rent: ${totalRent.toFixed(6)} SOL`);
  console.log('');

  if (DRY_RUN) {
    console.log('✅ Dry run complete. Run without --dry-run to execute.');
    return;
  }

  // Initialize escrow service
  console.log('🔧 Initializing escrow service...\n');
  const escrowService = await getEscrowProgramService();
  
  let cancelled = 0;
  let closed = 0;
  let alreadyClosed = 0;
  let failed = 0;
  let totalRecovered = 0;

  // Process each account
  for (let i = 0; i < totalAccounts; i++) {
    const account = accounts[i];
    const pda = account.pubkey;
    const shortPda = pda.toString().slice(0, 8);
    const lamports = account.account.lamports;
    const sol = (lamports / 1e9).toFixed(6);

    console.log(`\n[${i + 1}/${totalAccounts}] Processing ${shortPda}... (${sol} SOL)`);

    try {
      // Step 1: Try to close directly (in case already in terminal state)
      console.log(`  Attempting direct close...`);
      try {
        await escrowService.closeEscrow(pda);
        console.log(`  ✅ Closed directly (+${sol} SOL)`);
        closed++;
        totalRecovered += lamports;
        continue;
      } catch (closeError: any) {
        console.log(`  ⚠️  Direct close failed: ${closeError.message}`);
        
        // If account doesn't exist, it's already closed
        if (closeError.message?.includes('Account does not exist') || 
            closeError.message?.includes('not found')) {
          console.log(`  ℹ️  Account already closed`);
          alreadyClosed++;
          continue;
        }
        
        // Otherwise, try to admin cancel first
        console.log(`  Attempting admin cancel...`);
      }

      // Step 2: Try admin cancel (TypeScript doesn't expose this yet, so skip for now)
      console.log(`  ⚠️  Admin cancel not yet implemented in TypeScript service`);
      console.log(`  ❌ Skipping (needs admin_cancel implementation)`);
      failed++;

    } catch (error: any) {
      console.log(`  ❌ Failed: ${error.message}`);
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ PROCESSING COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Closed Directly: ${closed}`);
  console.log(`Already Closed: ${alreadyClosed}`);
  console.log(`Cancelled First: ${cancelled}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total Recovered: ${(totalRecovered / 1e9).toFixed(6)} SOL`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log(`⚠️  ${failed} accounts could not be processed.`);
    console.log(`These may need admin_cancel implementation or manual intervention.`);
  }
}

forceCloseEscrows().catch(console.error).finally(() => process.exit());



