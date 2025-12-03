/**
 * Build Force Close Transactions
 * 
 * This script takes the traced asset recipients and builds transactions for the
 * admin_force_close_with_recovery instruction.
 * 
 * Input: temp/escrow-asset-recipients.json (from trace-escrow-depositors.ts)
 * Output: temp/force-close-transactions.json (ready to execute)
 */

import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import * as bs58 from 'bs58';

// Load environment
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL_FALLBACK || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';

interface AssetRecipient {
  escrowPda: string;
  escrowId?: number;
  tokenAccounts: {
    address: string;
    mint: string;
    amount: number;
    depositor?: string;
  }[];
  solVault?: {
    address: string;
    balance: number;
    depositor?: string;
  };
}

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

async function deriveEscrowIdFromPda(
  connection: Connection,
  escrowPda: PublicKey
): Promise<number | undefined> {
  // Try to derive escrow_id by brute force checking PDAs
  // We know escrow IDs are sequential, so we can check a reasonable range
  const programId = new PublicKey(PROGRAM_ID);
  
  // Check escrow IDs from 0 to 10000 (should cover all 172 accounts)
  for (let id = 0; id < 10000; id++) {
    const [derivedPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), new BN(id).toArrayLike(Buffer, 'le', 8)],
      programId
    );
    
    if (derivedPda.equals(escrowPda)) {
      return id;
    }
  }
  
  return undefined;
}

async function checkATAExists(
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey
): Promise<boolean> {
  try {
    const ata = await getAssociatedTokenAddress(mint, wallet);
    const account = await connection.getAccountInfo(ata);
    return account !== null;
  } catch {
    return false;
  }
}

async function buildForceCloseTransaction(
  connection: Connection,
  asset: AssetRecipient,
  adminWallet: PublicKey
): Promise<ForceCloseTransaction> {
  const escrowPda = new PublicKey(asset.escrowPda);
  
  // Derive escrow ID
  console.log(`   Deriving escrow ID for ${asset.escrowPda.slice(0, 8)}...`);
  const escrowId = await deriveEscrowIdFromPda(connection, escrowPda);
  
  if (escrowId === undefined) {
    return {
      escrowPda: asset.escrowPda,
      escrowId: 0,
      recipientAccounts: { nfts: [] },
      estimatedCost: 0,
      status: 'needs_review',
      reason: 'Could not derive escrow ID from PDA',
    };
  }
  
  console.log(`   ✅ Escrow ID: ${escrowId}`);
  
  const result: ForceCloseTransaction = {
    escrowPda: asset.escrowPda,
    escrowId,
    recipientAccounts: { nfts: [] },
    estimatedCost: 0.000015, // Base transaction cost
    status: 'ready',
  };
  
  // Process NFTs
  for (const tokenAccount of asset.tokenAccounts) {
    if (tokenAccount.amount === 0) {
      console.log(`   Skipping empty token account ${tokenAccount.address.slice(0, 8)}...`);
      continue;
    }
    
    if (!tokenAccount.depositor) {
      result.status = 'needs_review';
      result.reason = `Token account ${tokenAccount.address.slice(0, 8)}... has no traced depositor`;
      console.log(`   ⚠️  ${result.reason}`);
      continue;
    }
    
    const recipientWallet = new PublicKey(tokenAccount.depositor);
    const mint = new PublicKey(tokenAccount.mint);
    
    // Check if recipient has ATA
    const ataExists = await checkATAExists(connection, recipientWallet, mint);
    
    // Get recipient ATA address
    const recipientATA = await getAssociatedTokenAddress(mint, recipientWallet);
    
    result.recipientAccounts.nfts.push({
      escrowTokenAccount: tokenAccount.address,
      recipientTokenAccount: recipientATA.toString(),
      recipientWallet: tokenAccount.depositor,
      mint: tokenAccount.mint,
      needsATA: !ataExists,
    });
    
    if (!ataExists) {
      result.estimatedCost += 0.00203928; // ATA creation cost
      console.log(`   📝 Will create ATA for ${tokenAccount.depositor.slice(0, 8)}... (${tokenAccount.mint.slice(0, 8)}...)`);
    } else {
      console.log(`   ✅ ATA exists for ${tokenAccount.depositor.slice(0, 8)}... (${tokenAccount.mint.slice(0, 8)}...)`);
    }
  }
  
  // Check for SOL vault (optional)
  if (asset.solVault) {
    if (asset.solVault.depositor) {
      result.recipientAccounts.sol = {
        solVault: asset.solVault.address,
        recipient: asset.solVault.depositor,
        amount: asset.solVault.balance,
      };
      console.log(`   💰 SOL vault: ${asset.solVault.balance / 1e9} SOL → ${asset.solVault.depositor.slice(0, 8)}...`);
    } else {
      console.log(`   ⚠️  SOL vault has no traced depositor`);
    }
  }
  
  // Skip if no assets to recover (empty escrows)
  if (result.recipientAccounts.nfts.length === 0 && !result.recipientAccounts.sol) {
    result.status = 'skip';
    result.reason = 'Empty escrow (no assets to recover)';
    console.log(`   ℹ️  Skipping: ${result.reason}`);
  }
  
  return result;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔧 BUILDING FORCE CLOSE TRANSACTIONS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Load traced assets
  const inputPath = path.join(__dirname, '../temp/escrow-asset-recipients.json');
  if (!fs.existsSync(inputPath)) {
    console.error('❌ Input file not found: temp/escrow-asset-recipients.json');
    console.error('   Run trace-escrow-depositors.ts first!\n');
    process.exit(1);
  }
  
  const assets: AssetRecipient[] = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  console.log(`📂 Loaded ${assets.length} traced assets\n`);
  
  // Load admin wallet
  const adminPrivateKey = process.env.MAINNET_ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    console.error('❌ MAINNET_ADMIN_PRIVATE_KEY not found in environment');
    process.exit(1);
  }
  
  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  const adminWallet = adminKeypair.publicKey;
  console.log(`🔑 Admin wallet: ${adminWallet.toString()}\n`);
  
  // Initialize connection
  const connection = new Connection(RPC_URL, 'confirmed');
  console.log(`🌐 Connected to RPC: ${RPC_URL}\n`);
  
  // Build transactions
  console.log('🔨 Building transactions...\n');
  
  const transactions: ForceCloseTransaction[] = [];
  let readyCount = 0;
  let needsReviewCount = 0;
  let skipCount = 0;
  
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    console.log(`\n[${i + 1}/${assets.length}] Processing ${asset.escrowPda.slice(0, 8)}...`);
    
    try {
      const tx = await buildForceCloseTransaction(connection, asset, adminWallet);
      transactions.push(tx);
      
      if (tx.status === 'ready') readyCount++;
      else if (tx.status === 'needs_review') needsReviewCount++;
      else if (tx.status === 'skip') skipCount++;
      
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
      transactions.push({
        escrowPda: asset.escrowPda,
        escrowId: 0,
        recipientAccounts: { nfts: [] },
        estimatedCost: 0,
        status: 'needs_review',
        reason: `Build error: ${error.message}`,
      });
      needsReviewCount++;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 BUILD COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Escrows: ${assets.length}`);
  console.log(`Ready to Execute: ${readyCount}`);
  console.log(`Needs Review: ${needsReviewCount}`);
  console.log(`Skip (Empty): ${skipCount}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Calculate costs
  const totalEstimatedCost = transactions
    .filter(tx => tx.status === 'ready')
    .reduce((sum, tx) => sum + tx.estimatedCost, 0);
  
  console.log(`💰 Estimated Total Cost: ${totalEstimatedCost.toFixed(6)} SOL\n`);
  
  // Save results
  const outputPath = path.join(__dirname, '../temp/force-close-transactions.json');
  fs.writeFileSync(outputPath, JSON.stringify(transactions, null, 2));
  console.log(`✅ Transactions saved to: ${outputPath}\n`);
  
  // Summary by status
  console.log('📋 Transactions by Status:');
  console.log(`   Ready: ${readyCount} transactions`);
  if (needsReviewCount > 0) {
    console.log(`   Needs Review: ${needsReviewCount} transactions`);
    const needsReview = transactions.filter(tx => tx.status === 'needs_review');
    needsReview.slice(0, 5).forEach(tx => {
      console.log(`     - ${tx.escrowPda.slice(0, 8)}...: ${tx.reason}`);
    });
    if (needsReview.length > 5) {
      console.log(`     ... and ${needsReview.length - 5} more`);
    }
  }
  console.log('');
  
  console.log('✅ Transaction builder complete!\n');
  console.log('Next steps:');
  console.log('  1. Review temp/force-close-transactions.json');
  console.log('  2. Manually fix any "needs_review" transactions');
  console.log('  3. Deploy smart contract to mainnet');
  console.log('  4. Run batch executor script');
  console.log('');
}

main().catch(console.error);

