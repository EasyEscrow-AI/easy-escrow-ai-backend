/**
 * Production Wallet Helpers for Mainnet Testing
 * 
 * Provides utilities for managing production test wallets on mainnet including:
 * - Balance checking and validation
 * - SOL transfer utilities
 * - Wallet funding verification
 * - Cost tracking for tests
 * 
 * ⚠️ IMPORTANT: These helpers work with REAL mainnet wallets and REAL SOL
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

export interface WalletInfo {
  publicKey: PublicKey;
  balance: number; // in SOL
  balanceLamports: bigint;
}

export interface TransactionCost {
  transactionFee: number; // in SOL
  platformFee: number; // in SOL
  totalCost: number; // in SOL
}

/**
 * Load a production wallet from a JSON file
 */
export function loadProductionWallet(walletPath: string): Keypair {
  try {
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    return Keypair.fromSecretKey(new Uint8Array(walletData));
  } catch (error) {
    throw new Error(`Failed to load production wallet from ${walletPath}: ${error}`);
  }
}

/**
 * Get wallet balance in SOL and lamports
 */
export async function getWalletInfo(
  connection: Connection,
  wallet: PublicKey
): Promise<WalletInfo> {
  const balanceLamports = await connection.getBalance(wallet);
  return {
    publicKey: wallet,
    balance: balanceLamports / LAMPORTS_PER_SOL,
    balanceLamports: BigInt(balanceLamports),
  };
}

/**
 * Verify wallet has sufficient balance for testing
 * @param minBalance - Minimum balance required in SOL
 */
export async function verifyWalletBalance(
  connection: Connection,
  wallet: PublicKey,
  minBalance: number
): Promise<void> {
  const info = await getWalletInfo(connection, wallet);
  
  if (info.balance < minBalance) {
    throw new Error(
      `Wallet ${wallet.toBase58()} has insufficient balance: ${info.balance.toFixed(4)} SOL (need at least ${minBalance} SOL)`
    );
  }
  
  console.log(`✅ Wallet ${wallet.toBase58()} balance: ${info.balance.toFixed(4)} SOL`);
}

/**
 * Transfer SOL from one wallet to another (for test setup)
 * ⚠️ WARNING: This transfers REAL SOL on mainnet!
 */
export async function transferSol(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  amountSol: number
): Promise<string> {
  console.log(`\n💸 Transferring ${amountSol} SOL from ${from.publicKey.toBase58()} to ${to.toBase58()}...`);
  
  const lamports = amountSol * LAMPORTS_PER_SOL;
  
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports,
    })
  );
  
  const signature = await sendAndConfirmTransaction(connection, transaction, [from], {
    commitment: 'confirmed',
  });
  
  console.log(`✅ Transfer successful: ${signature}`);
  return signature;
}

/**
 * Check if a wallet needs funding and log a warning
 */
export async function checkAndWarnIfUnderfunded(
  connection: Connection,
  wallet: PublicKey,
  minBalance: number,
  walletName: string
): Promise<boolean> {
  const info = await getWalletInfo(connection, wallet);
  
  if (info.balance < minBalance) {
    console.warn(`\n⚠️  WARNING: ${walletName} wallet is underfunded!`);
    console.warn(`   Address: ${wallet.toBase58()}`);
    console.warn(`   Current: ${info.balance.toFixed(4)} SOL`);
    console.warn(`   Required: ${minBalance.toFixed(4)} SOL`);
    console.warn(`   Shortfall: ${(minBalance - info.balance).toFixed(4)} SOL`);
    console.warn(`\n   To fund this wallet, run:`);
    console.warn(`   solana transfer ${wallet.toBase58()} ${(minBalance - info.balance).toFixed(4)} --url mainnet-beta\n`);
    return false;
  }
  
  return true;
}

/**
 * Display wallet balances for all test wallets
 */
export async function displayWalletBalances(
  connection: Connection,
  wallets: { name: string; publicKey: PublicKey }[]
): Promise<void> {
  console.log('\n💰 Production Wallet Balances:');
  console.log('═'.repeat(70));
  
  for (const wallet of wallets) {
    const info = await getWalletInfo(connection, wallet.publicKey);
    console.log(`  ${wallet.name.padEnd(20)} ${wallet.publicKey.toBase58()}`);
    console.log(`  ${''.padEnd(20)} ${info.balance.toFixed(6)} SOL`);
  }
  
  console.log('═'.repeat(70) + '\n');
}

/**
 * Estimate transaction cost for atomic swap
 */
export function estimateSwapCost(
  platformFeeBps: number,
  swapValueSol: number
): TransactionCost {
  const transactionFee = 0.000005; // ~5,000 lamports for signature
  const platformFee = (swapValueSol * platformFeeBps) / 10000;
  const totalCost = transactionFee + platformFee;
  
  return {
    transactionFee,
    platformFee,
    totalCost,
  };
}

/**
 * Load all standard production test wallets
 */
export function loadProductionTestWallets(basePath?: string): {
  sender: Keypair;
  receiver: Keypair;
  treasury: Keypair;
} {
  const walletsDir = basePath || path.join(__dirname, '../../../wallets/production');
  
  return {
    sender: loadProductionWallet(path.join(walletsDir, 'production-sender.json')),
    receiver: loadProductionWallet(path.join(walletsDir, 'production-receiver.json')),
    treasury: loadProductionWallet(path.join(walletsDir, 'production-treasury.json')),
  };
}

/**
 * Wait for transaction confirmation with retry
 */
export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
  maxAttempts: number = 30
): Promise<void> {
  console.log(`⏳ Waiting for transaction confirmation: ${signature}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await connection.getSignatureStatus(signature);
    
    if (status?.value?.confirmationStatus === commitment || status?.value?.confirmationStatus === 'finalized') {
      console.log(`✅ Transaction confirmed (${status.value.confirmationStatus})`);
      return;
    }
    
    if (status?.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between attempts
    }
  }
  
  throw new Error(`Transaction confirmation timeout after ${maxAttempts} attempts`);
}

/**
 * Get recent prioritization fees for better transaction success rate
 */
export async function getRecentPrioritizationFees(
  connection: Connection
): Promise<number> {
  try {
    const recentFees = await connection.getRecentPrioritizationFees();
    if (recentFees && recentFees.length > 0) {
      // Get median fee
      const sorted = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return median;
    }
  } catch (error) {
    console.warn('Failed to get prioritization fees, using default');
  }
  
  return 1000; // Default: 1,000 micro-lamports
}

/**
 * Check mainnet health before running tests
 */
export async function checkMainnetHealth(connection: Connection): Promise<void> {
  console.log('\n🏥 Checking Mainnet Health...');
  
  try {
    // Check connection
    const version = await connection.getVersion();
    console.log(`  ✅ RPC Connection: OK (version ${version['solana-core']})`);
    
    // Check recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    console.log(`  ✅ Recent Blockhash: ${blockhash.substring(0, 8)}...`);
    
    // Check TPS (if available)
    try {
      const perfSamples = await connection.getRecentPerformanceSamples(1);
      if (perfSamples && perfSamples.length > 0) {
        const tps = perfSamples[0].numTransactions / perfSamples[0].samplePeriodSecs;
        console.log(`  ✅ Network TPS: ${tps.toFixed(0)}`);
      }
    } catch {
      // Performance samples not always available
    }
    
    console.log('  ✅ Mainnet is healthy\n');
  } catch (error) {
    console.error('  ❌ Mainnet health check FAILED:', error);
    throw new Error('Mainnet is not healthy - tests may fail');
  }
}

