/**
 * Simple escrow closer - sends close instructions without state validation
 * 
 * This bypasses the state read/validation that's causing failures
 * and directly sends close_escrow instructions to the blockchain.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

process.env.NODE_ENV = 'production';

import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import bs58 from 'bs58';

// Use standard Solana RPC (no Jito requirements)
const RPC_URL = process.env.SOLANA_RPC_URL_FALLBACK || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '999999');

async function simpleCloseEscrows() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔧 SIMPLE ESCROW CLOSER (No Jito, No State Validation)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(DRY_RUN ? '🔍 DRY RUN MODE' : '⚠️  LIVE MODE');
  console.log('');

  // Setup connection
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);

  // Load admin keypair
  const adminPrivateKeyBase58 = process.env.MAINNET_ADMIN_PRIVATE_KEY;
  if (!adminPrivateKeyBase58) {
    throw new Error('MAINNET_ADMIN_PRIVATE_KEY not found');
  }
  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKeyBase58));
  console.log(`Admin wallet: ${adminKeypair.publicKey.toString()}\n`);

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/escrow.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // Create program
  const wallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idl, provider);

  // Get all program accounts
  console.log('📋 Scanning blockchain...\n');
  const accounts = await connection.getProgramAccounts(programId);
  
  const totalAccounts = Math.min(accounts.length, LIMIT);
  const totalRent = accounts.slice(0, totalAccounts).reduce((sum, acc) => sum + acc.account.lamports, 0) / 1e9;
  
  console.log(`Found: ${accounts.length} accounts`);
  console.log(`Will process: ${totalAccounts} accounts`);
  console.log(`Estimated rent: ${totalRent.toFixed(6)} SOL`);
  console.log('');

  if (DRY_RUN) {
    console.log('✅ Dry run complete.');
    return;
  }

  let closed = 0;
  let failed = 0;
  let totalRecovered = 0;

  // Process each account
  for (let i = 0; i < totalAccounts; i++) {
    const account = accounts[i];
    const pda = account.pubkey;
    const shortPda = pda.toString().slice(0, 8);
    const lamports = account.account.lamports;
    const sol = (lamports / 1e9).toFixed(6);

    console.log(`\n[${i + 1}/${totalAccounts}] ${shortPda}... (${sol} SOL)`);

    try {
      // Build close instruction WITHOUT reading/validating state
      const instruction = await (program.methods as any)
        .closeEscrow()
        .accountsStrict({
          admin: adminKeypair.publicKey,
          escrowState: pda,
        })
        .instruction();

      // Create transaction
      const transaction = new Transaction().add(instruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = adminKeypair.publicKey;

      // Sign
      transaction.sign(adminKeypair);

      // Send via standard RPC (NO JITO)
      console.log(`  Sending transaction...`);
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
        }
      );

      // Confirm
      console.log(`  Confirming...`);
      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      console.log(`  ✅ Closed successfully (+${sol} SOL)`);
      console.log(`  TX: ${signature}`);
      closed++;
      totalRecovered += lamports;

    } catch (error: any) {
      console.log(`  ❌ Failed: ${error.message || error}`);
      
      // Log specific error types
      if (error.message?.includes('Invalid')) {
        console.log(`     → Likely not in terminal state (needs cancel first)`);
      } else if (error.message?.includes('custom program error')) {
        console.log(`     → Smart contract error (check logs)`);
      }
      
      failed++;
    }

    // Rate limit protection
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ PROCESSING COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Closed: ${closed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total Recovered: ${(totalRecovered / 1e9).toFixed(6)} SOL`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

simpleCloseEscrows().catch(console.error).finally(() => process.exit());

