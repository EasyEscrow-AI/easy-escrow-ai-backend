/**
 * Execute Force Close Batch
 * 
 * This script executes the admin_force_close_with_recovery transactions
 * for all escrows marked as "ready".
 * 
 * Input: temp/force-close-transactions.json (from build-force-close-transactions.ts)
 * Output: temp/force-close-execution-results.json
 * 
 * SAFETY: Runs in dry-run mode by default. Use --live to execute real transactions.
 */

import { Connection, PublicKey, Transaction, SystemProgram, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { Program, AnchorProvider, Wallet, BN, web3 } from '@coral-xyz/anchor';
import * as bs58 from 'bs58';

// Load environment
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL_FALLBACK || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';

interface ForceCloseTransaction {
  escrowPda: string;
  escrowId: number;
  recipientAccounts: {
    nfts: {
      escrowTokenAccount: string;
      recipientTokenAccount: string;
      recipientWallet: string;
      mint: string;
      needsATA: boolean;
    }[];
    sol?: {
      solVault: string;
      recipient: string;
      amount: number;
    };
  };
  estimatedCost: number;
  status: 'ready' | 'needs_review' | 'skip';
  reason?: string;
}

interface ExecutionResult {
  escrowPda: string;
  escrowId: number;
  status: 'success' | 'failed' | 'skipped';
  signature?: string;
  error?: string;
  timestamp: string;
}

async function createATAsIfNeeded(
  connection: Connection,
  adminKeypair: Keypair,
  nfts: ForceCloseTransaction['recipientAccounts']['nfts'],
  dryRun: boolean
): Promise<string[]> {
  const signatures: string[] = [];
  
  const needsATA = nfts.filter(nft => nft.needsATA);
  if (needsATA.length === 0) {
    return signatures;
  }
  
  console.log(`   📝 Creating ${needsATA.length} ATAs...`);
  
  for (const nft of needsATA) {
    const mint = new PublicKey(nft.mint);
    const recipient = new PublicKey(nft.recipientWallet);
    const ata = new PublicKey(nft.recipientTokenAccount);
    
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        adminKeypair.publicKey, // payer
        ata, // ata
        recipient, // owner
        mint // mint
      )
    );
    
    if (dryRun) {
      console.log(`   [DRY RUN] Would create ATA: ${ata.toString().slice(0, 8)}... for ${recipient.toString().slice(0, 8)}...`);
    } else {
      try {
        const sig = await sendAndConfirmTransaction(connection, tx, [adminKeypair], {
          commitment: 'confirmed',
        });
        signatures.push(sig);
        console.log(`   ✅ ATA created: ${sig.slice(0, 8)}...`);
      } catch (error: any) {
        throw new Error(`Failed to create ATA: ${error.message}`);
      }
    }
  }
  
  return signatures;
}

async function executeForceClose(
  connection: Connection,
  program: Program,
  adminKeypair: Keypair,
  tx: ForceCloseTransaction,
  dryRun: boolean
): Promise<ExecutionResult> {
  console.log(`\n🔨 Processing ${tx.escrowPda.slice(0, 8)}... (ID: ${tx.escrowId})`);
  
  const result: ExecutionResult = {
    escrowPda: tx.escrowPda,
    escrowId: tx.escrowId,
    status: 'skipped',
    timestamp: new Date().toISOString(),
  };
  
  try {
    // Step 1: Create ATAs if needed
    const ataSignatures = await createATAsIfNeeded(
      connection,
      adminKeypair,
      tx.recipientAccounts.nfts,
      dryRun
    );
    
    // Step 2: Build remaining_accounts array
    const remainingAccounts: any[] = [];
    
    // Add NFT token accounts (escrow, recipient, recipient_wallet)
    for (const nft of tx.recipientAccounts.nfts) {
      remainingAccounts.push({
        pubkey: new PublicKey(nft.escrowTokenAccount),
        isSigner: false,
        isWritable: true,
      });
    }
    for (const nft of tx.recipientAccounts.nfts) {
      remainingAccounts.push({
        pubkey: new PublicKey(nft.recipientTokenAccount),
        isSigner: false,
        isWritable: true,
      });
    }
    for (const nft of tx.recipientAccounts.nfts) {
      remainingAccounts.push({
        pubkey: new PublicKey(nft.recipientWallet),
        isSigner: false,
        isWritable: true,
      });
    }
    
    // Add SOL vault and recipient (if exists)
    if (tx.recipientAccounts.sol) {
      remainingAccounts.push({
        pubkey: new PublicKey(tx.recipientAccounts.sol.solVault),
        isSigner: false,
        isWritable: true,
      });
      remainingAccounts.push({
        pubkey: new PublicKey(tx.recipientAccounts.sol.recipient),
        isSigner: false,
        isWritable: true,
      });
    }
    
    console.log(`   Remaining accounts: ${remainingAccounts.length}`);
    console.log(`     - ${tx.recipientAccounts.nfts.length} NFTs`);
    if (tx.recipientAccounts.sol) {
      console.log(`     - 1 SOL vault (${tx.recipientAccounts.sol.amount / 1e9} SOL)`);
    }
    
    if (dryRun) {
      console.log(`   [DRY RUN] Would call admin_force_close_with_recovery`);
      console.log(`   [DRY RUN] Escrow ID: ${tx.escrowId}`);
      console.log(`   [DRY RUN] Escrow PDA: ${tx.escrowPda}`);
      console.log(`   [DRY RUN] Remaining accounts: ${remainingAccounts.length}`);
      result.status = 'success';
      result.signature = 'DRY_RUN';
    } else {
      // Step 3: Call admin_force_close_with_recovery
      const signature = await program.methods
        .adminForceCloseWithRecovery(new BN(tx.escrowId))
        .accounts({
          admin: adminKeypair.publicKey,
          escrowState: new PublicKey(tx.escrowPda),
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([adminKeypair])
        .rpc({ commitment: 'confirmed' });
      
      result.status = 'success';
      result.signature = signature;
      console.log(`   ✅ SUCCESS: ${signature.slice(0, 8)}...`);
    }
    
  } catch (error: any) {
    result.status = 'failed';
    result.error = error.message;
    console.error(`   ❌ FAILED: ${error.message}`);
  }
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--live');
  const maxAccounts = args.includes('--limit') 
    ? parseInt(args[args.indexOf('--limit') + 1]) 
    : undefined;
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 EXECUTING FORCE CLOSE BATCH');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Mode: ${dryRun ? '🧪 DRY RUN' : '🔴 LIVE'}`);
  if (maxAccounts) {
    console.log(`Limit: ${maxAccounts} accounts`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');
  
  if (!dryRun) {
    console.log('⚠️  WARNING: Running in LIVE mode!');
    console.log('⚠️  Real transactions will be sent to mainnet.');
    console.log('⚠️  Press Ctrl+C within 10 seconds to abort...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  // Load transactions
  const inputPath = path.join(__dirname, '../temp/force-close-transactions.json');
  if (!fs.existsSync(inputPath)) {
    console.error('❌ Input file not found: temp/force-close-transactions.json');
    console.error('   Run build-force-close-transactions.ts first!\n');
    process.exit(1);
  }
  
  const allTransactions: ForceCloseTransaction[] = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const readyTransactions = allTransactions.filter(tx => tx.status === 'ready');
  
  if (maxAccounts) {
    readyTransactions.splice(maxAccounts);
  }
  
  console.log(`📂 Loaded ${readyTransactions.length} transactions to execute\n`);
  
  // Load admin wallet
  const adminPrivateKey = process.env.MAINNET_ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    console.error('❌ MAINNET_ADMIN_PRIVATE_KEY not found in environment');
    process.exit(1);
  }
  
  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  console.log(`🔑 Admin wallet: ${adminKeypair.publicKey.toString()}\n`);
  
  // Initialize connection and program
  const connection = new Connection(RPC_URL, 'confirmed');
  console.log(`🌐 Connected to RPC: ${RPC_URL}\n`);
  
  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/escrow.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  
  const wallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program(idl, provider);
  
  console.log(`📜 Program loaded: ${program.programId.toString()}\n`);
  
  // Execute batch
  console.log('🚀 Starting batch execution...\n');
  
  const results: ExecutionResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < readyTransactions.length; i++) {
    const tx = readyTransactions[i];
    console.log(`\n[${i + 1}/${readyTransactions.length}] ─────────────────────────────────────────`);
    
    try {
      const result = await executeForceClose(connection, program, adminKeypair, tx, dryRun);
      results.push(result);
      
      if (result.status === 'success') successCount++;
      else if (result.status === 'failed') failedCount++;
      
    } catch (error: any) {
      console.error(`   ❌ Unexpected error: ${error.message}`);
      results.push({
        escrowPda: tx.escrowPda,
        escrowId: tx.escrowId,
        status: 'failed',
        error: `Unexpected error: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      failedCount++;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 EXECUTION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Processed: ${readyTransactions.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Save results
  const outputPath = path.join(__dirname, '../temp/force-close-execution-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`✅ Results saved to: ${outputPath}\n`);
  
  if (failedCount > 0) {
    console.log('⚠️  Some transactions failed. Review the results file for details.\n');
  }
  
  if (dryRun) {
    console.log('✅ Dry run complete!\n');
    console.log('To execute for real:');
    console.log('  npx ts-node scripts/execute-force-close-batch.ts --live');
    console.log('');
    console.log('To test on a limited number of accounts:');
    console.log('  npx ts-node scripts/execute-force-close-batch.ts --live --limit 5');
    console.log('');
  } else {
    console.log('✅ Batch execution complete!\n');
    console.log('Verify results:');
    console.log('  - Check transaction signatures on Solscan');
    console.log('  - Verify assets returned to correct addresses');
    console.log('  - Check admin wallet received rent');
    console.log('');
  }
}

main().catch(console.error);



