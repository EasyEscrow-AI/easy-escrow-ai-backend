/**
 * Close orphaned escrow accounts on the staging (devnet) program.
 *
 * Uses admin_force_close_with_recovery — designed for legacy/stuck accounts
 * that can't be deserialized by the current IDL. Recovers rent to admin wallet.
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

// Known account discriminators from IDL
const DISCRIMINATORS: Record<string, string> = {
  EscrowState:        Buffer.from([19, 90, 148, 111, 55, 130, 229, 108]).toString('hex'),
  InstitutionEscrow:  Buffer.from([58, 64, 121, 136, 7, 159, 59, 118]).toString('hex'),
  OfferEscrow:        Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]).toString('hex'), // placeholder
  Treasury:           Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]).toString('hex'), // placeholder
};

function identifyAccountType(data: Buffer): string {
  const disc = data.subarray(0, 8).toString('hex');
  for (const [name, hex] of Object.entries(DISCRIMINATORS)) {
    if (disc === hex) return name;
  }
  return `Unknown(${disc})`;
}

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
  console.log('\n📋 Scanning devnet for program accounts...\n');
  const accounts = await connection.getProgramAccounts(programId);

  // Categorize accounts by type
  const byType: Record<string, number> = {};
  for (const acc of accounts) {
    const type = identifyAccountType(Buffer.from(acc.account.data));
    byType[type] = (byType[type] || 0) + 1;
  }
  console.log('Account types found:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }

  const totalAccounts = Math.min(accounts.length, LIMIT);
  const totalRentLamports = accounts.slice(0, totalAccounts).reduce((s, a) => s + a.account.lamports, 0);
  const totalRentSol = (totalRentLamports / 1e9).toFixed(6);

  console.log(`\nTotal:         ${accounts.length} accounts`);
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
  let failed = 0;
  let skipped = 0;
  let totalRecovered = 0;

  for (let i = 0; i < totalAccounts; i++) {
    const account = accounts[i];
    const pda = account.pubkey;
    const shortPda = pda.toString().slice(0, 12);
    const lamports = account.account.lamports;
    const sol = (lamports / 1e9).toFixed(6);
    const accountType = identifyAccountType(Buffer.from(account.account.data));

    console.log(`\n[${i + 1}/${totalAccounts}] ${shortPda}... (${sol} SOL) [${accountType}]`);

    // Skip Treasury accounts — those should stay
    if (accountType === 'Treasury') {
      console.log('  ⏭️  Skipping Treasury account');
      skipped++;
      continue;
    }

    try {
      // Use admin_force_close_with_recovery — works without deserializing state
      // escrow_id arg is u64, pass 0 since force close doesn't use it for PDA derivation
      const closeIx = await (program.methods as any)
        .adminForceCloseWithRecovery(new BN(0))
        .accountsStrict({
          admin: adminKeypair.publicKey,
          escrowState: pda,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        })
        .instruction();

      const tx = new Transaction().add(closeIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      tx.recentBlockhash = blockhash;
      tx.feePayer = adminKeypair.publicKey;
      tx.sign(adminKeypair);

      console.log('  Sending admin_force_close_with_recovery...');
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      console.log(`  ✅ Closed (+${sol} SOL recovered)`);
      console.log(`  TX: ${sig.slice(0, 20)}...`);
      closed++;
      totalRecovered += lamports;

    } catch (err: any) {
      const msg = err.message || String(err);
      console.log(`  ❌ Failed: ${msg.slice(0, 120)}`);

      if (msg.includes('custom program error: 0x')) {
        const match = msg.match(/0x([0-9a-fA-F]+)/);
        if (match) console.log(`     Program error code: 0x${match[1]} (${parseInt(match[1], 16)})`);
      }
      failed++;
    }

    // Rate limit: stay under devnet limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ STAGING ESCROW CLEANUP COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Closed:         ${closed}`);
  console.log(`Failed:         ${failed}`);
  console.log(`Skipped:        ${skipped}`);
  console.log(`SOL recovered:  ${(totalRecovered / 1e9).toFixed(6)} SOL`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

closeStageEscrows().catch(console.error).finally(() => process.exit());
