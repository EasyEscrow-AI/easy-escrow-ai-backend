/**
 * Close orphaned escrow accounts on the staging (devnet) program.
 *
 * Two-phase process per account:
 *   1. admin_cancel — moves escrow to Cancelled state (skipped if already terminal)
 *   2. close_escrow — closes account and recovers rent to admin wallet
 *
 * Usage:
 *   npx ts-node scripts/close-staging-escrows.ts --dry-run   # preview only
 *   npx ts-node scripts/close-staging-escrows.ts              # execute
 *   npx ts-node scripts/close-staging-escrows.ts --limit=10   # first 10 only
 *
 * Requires .env.staging with:
 *   DEVNET_STAGING_ADMIN_PRIVATE_KEY, SOLANA_RPC_URL, DEVNET_STAGING_PROGRAM_ID
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.staging') });

import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import bs58 from 'bs58';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.DEVNET_STAGING_PROGRAM_ID || 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei';
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '999999');

// Escrow status enum (matches on-chain EscrowStatus)
const TERMINAL_STATUSES = ['Completed', 'Cancelled', 'Refunded'];

async function closeStageEscrows() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔧 STAGING ESCROW CLOSER (Devnet)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Program:  ${PROGRAM_ID}`);
  console.log(`RPC:      ${RPC_URL.slice(0, 50)}...`);
  console.log(`Mode:     ${DRY_RUN ? '🔍 DRY RUN' : '⚠️  LIVE'}`);
  console.log('');

  // Load admin keypair
  const adminKeyBase58 = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
  if (!adminKeyBase58) {
    console.error('❌ DEVNET_STAGING_ADMIN_PRIVATE_KEY not set in .env.staging');
    process.exit(1);
  }
  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminKeyBase58));
  console.log(`Admin:    ${adminKeypair.publicKey.toString()}`);

  // Setup connection + program
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);
  const wallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

  const idlPath = path.join(__dirname, '../src/generated/anchor/escrow-idl-staging.json');
  if (!fs.existsSync(idlPath)) {
    console.error(`❌ IDL not found: ${idlPath}`);
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  const program = new Program(idl, provider);

  // Scan for all program accounts
  console.log('\n📋 Scanning devnet for escrow PDAs...\n');
  const accounts = await connection.getProgramAccounts(programId);

  const totalAccounts = Math.min(accounts.length, LIMIT);
  const totalRentLamports = accounts.slice(0, totalAccounts).reduce((s, a) => s + a.account.lamports, 0);
  const totalRentSol = (totalRentLamports / 1e9).toFixed(6);

  console.log(`Found:         ${accounts.length} accounts`);
  console.log(`Will process:  ${totalAccounts} accounts`);
  console.log(`Total rent:    ${totalRentSol} SOL`);

  if (DRY_RUN) {
    console.log('\n✅ Dry run complete. Run without --dry-run to execute.');
    return;
  }

  if (totalAccounts === 0) {
    console.log('\n✅ No accounts to close.');
    return;
  }

  let closed = 0;
  let cancelledFirst = 0;
  let alreadyTerminal = 0;
  let failed = 0;
  let totalRecovered = 0;

  for (let i = 0; i < totalAccounts; i++) {
    const account = accounts[i];
    const pda = account.pubkey;
    const shortPda = pda.toString().slice(0, 12);
    const lamports = account.account.lamports;
    const sol = (lamports / 1e9).toFixed(6);

    console.log(`\n[${i + 1}/${totalAccounts}] ${shortPda}... (${sol} SOL)`);

    try {
      // Read on-chain state to check status
      let needsCancel = false;
      let escrowState: any = null;
      try {
        escrowState = await (program.account as any).escrowState.fetch(pda);
        const statusKey = Object.keys(escrowState.status || {})[0];
        if (TERMINAL_STATUSES.some(s => s.toLowerCase() === statusKey?.toLowerCase())) {
          console.log(`  Status: ${statusKey} (already terminal)`);
          alreadyTerminal++;
        } else {
          console.log(`  Status: ${statusKey} → needs admin_cancel first`);
          needsCancel = true;
        }
      } catch {
        // Can't read state — try close directly
        console.log('  Cannot read state — attempting close directly');
      }

      // Phase 1: admin_cancel if not terminal
      if (needsCancel && escrowState) {
        try {
          const escrowId: number[] = Array.from(escrowState.escrowId as Uint8Array);
          // Derive sol_vault PDA
          const [solVault] = PublicKey.findProgramAddressSync(
            [Buffer.from('sol_vault'), Buffer.from(new Uint8Array(escrowId))],
            programId,
          );

          const cancelIx = await (program.methods as any)
            .adminCancel()
            .accountsStrict({
              admin: adminKeypair.publicKey,
              escrowState: pda,
              solVault,
              buyer: escrowState.buyer,
              seller: escrowState.seller,
              sellerNftAccount: escrowState.sellerNftAccount || escrowState.seller,
              escrowNftAccount: escrowState.escrowNftAccount || pda,
              tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
              systemProgram: new PublicKey('11111111111111111111111111111111'),
            })
            .instruction();

          const cancelTx = new Transaction().add(cancelIx);
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
          cancelTx.recentBlockhash = blockhash;
          cancelTx.feePayer = adminKeypair.publicKey;
          cancelTx.sign(adminKeypair);

          console.log('  Sending admin_cancel...');
          const sig = await connection.sendRawTransaction(cancelTx.serialize(), { skipPreflight: true, maxRetries: 3 });
          await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
          console.log(`  ✅ Cancelled (tx: ${sig.slice(0, 16)}...)`);
          cancelledFirst++;
        } catch (cancelErr: any) {
          // If cancel fails, still try close — account might already be terminal
          console.log(`  ⚠️  Cancel failed (${cancelErr.message?.slice(0, 60)}), trying close anyway...`);
        }
      }

      // Phase 2: close_escrow
      const closeIx = await (program.methods as any)
        .closeEscrow()
        .accountsStrict({
          admin: adminKeypair.publicKey,
          escrowState: pda,
        })
        .instruction();

      const closeTx = new Transaction().add(closeIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      closeTx.recentBlockhash = blockhash;
      closeTx.feePayer = adminKeypair.publicKey;
      closeTx.sign(adminKeypair);

      console.log('  Sending close_escrow...');
      const sig = await connection.sendRawTransaction(closeTx.serialize(), { skipPreflight: false, maxRetries: 3 });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      console.log(`  ✅ Closed (+${sol} SOL recovered)`);
      closed++;
      totalRecovered += lamports;

    } catch (err: any) {
      const msg = err.message || String(err);
      console.log(`  ❌ Failed: ${msg.slice(0, 100)}`);

      if (msg.includes('custom program error: 0x')) {
        const match = msg.match(/0x([0-9a-fA-F]+)/);
        if (match) console.log(`     Program error code: 0x${match[1]} (${parseInt(match[1], 16)})`);
      }
      failed++;
    }

    // Rate limit: ~3 requests per account, stay under devnet limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ STAGING ESCROW CLEANUP COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Closed:             ${closed}`);
  console.log(`Cancelled first:    ${cancelledFirst}`);
  console.log(`Already terminal:   ${alreadyTerminal}`);
  console.log(`Failed:             ${failed}`);
  console.log(`SOL recovered:      ${(totalRecovered / 1e9).toFixed(6)} SOL`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

closeStageEscrows().catch(console.error).finally(() => process.exit());
