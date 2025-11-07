/**
 * Shared Test Utilities for STAGING E2E Tests
 * 
 * Common functions, types, and configurations used across all staging E2E test scenarios.
 */

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, getAccount, createMint, mintTo } from '@solana/spl-token';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { STAGING_CONFIG } from './test-config';

// Re-export configuration for use in test files
export { STAGING_CONFIG };

// ============================================================================
// TYPES
// ============================================================================

export interface StagingWallets {
  sender: Keypair;
  receiver: Keypair;
  admin: Keypair;
  feeCollector: Keypair;
}

export interface TestAgreement {
  agreementId: string;
  escrowPda: string;
  depositAddresses: {
    usdc: string;
    nft: string;
  };
  transactionId?: string;
}

export interface TestNFT {
  mint: PublicKey;
  tokenAccount: PublicKey;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
}

// ============================================================================
// WALLET MANAGEMENT
// ============================================================================

/**
 * Load STAGING wallet keypairs from files
 */
export function loadStagingWallets(): StagingWallets {
  const walletDir = path.join(__dirname, '../../../wallets/staging');
  
  const loadKeypair = (filename: string): Keypair => {
    const filepath = path.join(walletDir, filename);
    if (!fs.existsSync(filepath)) {
      throw new Error(`Wallet file not found: ${filepath}`);
    }
    const keypairData = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keypairData));
  };

  return {
    sender: loadKeypair('staging-sender.json'),
    receiver: loadKeypair('staging-receiver.json'),
    admin: loadKeypair('staging-admin.json'),
    feeCollector: loadKeypair('staging-fee-collector.json'),
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique idempotency key
 */
export function generateIdempotencyKey(prefix: string = 'staging-e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Get Solana explorer URL
 */
export function getExplorerUrl(address: string, type: 'address' | 'tx' = 'tx'): string {
  return `https://explorer.solana.com/${type}/${address}?cluster=${STAGING_CONFIG.network}`;
}

/**
 * Wait for agreement status
 */
export async function waitForAgreementStatus(
  agreementId: string,
  targetStatus: string,
  maxAttempts: number = 30,
  intervalMs: number = 1000
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(
        `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreementId}`
      );
      
      const status = response.data.data.status;
      console.log(`   [${i + 1}/${maxAttempts}] Status: ${status}`);
      
      if (status === targetStatus) {
        return response.data.data;
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error: any) {
      console.error(`   ⚠️  Error checking status: ${error.message}`);
      // CRITICAL: Wait before retrying to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  throw new Error(`Timeout waiting for status ${targetStatus} after ${maxAttempts} attempts`);
}

/**
 * Get token balance with proper decimal handling
 */
export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<number> {
  try {
    const accountInfo = await getAccount(connection, tokenAccount);
    const mintInfo = await connection.getParsedAccountInfo(accountInfo.mint);
    const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals || 0;
    return Number(accountInfo.amount) / Math.pow(10, decimals);
  } catch (error) {
    return 0;
  }
}

// ============================================================================
// NFT CREATION
// ============================================================================

/**
 * Create real test NFT on devnet using SPL Token
 */
export async function createTestNFT(
  connection: Connection,
  owner: Keypair
): Promise<TestNFT> {
  console.log('   🎨 Creating real NFT on devnet...');
  
  // Create NFT mint (supply of 1, 0 decimals)
  const nftMint = await createMint(
    connection,
    owner,
    owner.publicKey, // mint authority
    null, // freeze authority
    0 // decimals (NFTs have 0 decimals)
  );
  
  console.log(`   ✅ NFT Mint created: ${nftMint.toBase58()}`);
  
  // Wait for mint to be confirmed on-chain with retry logic
  console.log('   ⏳ Waiting for mint confirmation...');
  let mintConfirmed = false;
  for (let i = 0; i < 10; i++) {
    try {
      const mintInfo = await connection.getAccountInfo(nftMint);
      if (mintInfo !== null) {
        mintConfirmed = true;
        console.log(`   ✅ Mint confirmed on-chain (attempt ${i + 1})`);
        break;
      }
    } catch (error) {
      // Ignore and retry
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (!mintConfirmed) {
    throw new Error('Failed to confirm mint creation on-chain');
  }
  
  // Create token account for owner with retry logic
  console.log('   🏗️  Creating token account...');
  let tokenAccount;
  let lastError;
  
  for (let i = 0; i < 5; i++) {
    try {
      tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        owner,
        nftMint,
        owner.publicKey
      );
      console.log(`   ✅ Token account created: ${tokenAccount.address.toBase58()}`);
      break;
    } catch (error: any) {
      lastError = error;
      console.log(`   ⚠️  Token account creation failed (attempt ${i + 1}/5), retrying...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  if (!tokenAccount) {
    throw new Error(`Failed to create token account after 5 attempts: ${lastError}`);
  }
  
  // Mint 1 NFT to owner
  console.log('   🪙 Minting NFT...');
  const mintTxSignature = await mintTo(
    connection,
    owner,
    nftMint,
    tokenAccount.address,
    owner.publicKey,
    1 // mint 1 NFT
  );
  
  console.log(`   ✅ Minted 1 NFT to owner`);
  console.log(`   ⏳ Confirming mint transaction...`);
  
  // Wait for mint transaction to confirm
  await connection.confirmTransaction(mintTxSignature, 'confirmed');
  console.log(`   ✅ Mint transaction confirmed`);
  
  // Verify the token account has the NFT
  const accountInfo = await getAccount(connection, tokenAccount.address);
  console.log(`   ✅ Token account balance: ${accountInfo.amount}`);
  
  return {
    mint: nftMint,
    tokenAccount: tokenAccount.address,
    metadata: {
      name: `STAGING Test NFT ${Date.now()}`,
      symbol: 'STNFT',
      uri: 'https://example.com/nft/metadata.json',
    },
  };
}

// ============================================================================
// TOKEN ACCOUNT SETUP
// ============================================================================

/**
 * Create or get USDC token accounts
 */
export async function setupUSDCAccounts(
  connection: Connection,
  usdcMint: PublicKey,
  sender: Keypair,
  receiver: Keypair,
  feeCollector?: Keypair
): Promise<{ senderAccount: PublicKey; receiverAccount: PublicKey; feeCollectorAccount?: PublicKey }> {
  console.log('   💰 Setting up USDC accounts...');
  
  const senderUsdcAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    sender,
    usdcMint,
    sender.publicKey
  );
  
  const receiverUsdcAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    receiver,
    usdcMint,
    receiver.publicKey
  );
  
  console.log(`   ✅ Sender USDC: ${senderUsdcAccount.address.toBase58()}`);
  console.log(`   ✅ Receiver USDC: ${receiverUsdcAccount.address.toBase58()}`);
  
  // Create fee collector account if provided
  let feeCollectorUsdcAccount;
  if (feeCollector) {
    feeCollectorUsdcAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      sender, // Use sender as payer
      usdcMint,
      feeCollector.publicKey
    );
    console.log(`   ✅ Fee Collector USDC: ${feeCollectorUsdcAccount.address.toBase58()}`);
  }
  
  return {
    senderAccount: senderUsdcAccount.address,
    receiverAccount: receiverUsdcAccount.address,
    feeCollectorAccount: feeCollectorUsdcAccount?.address,
  };
}

// ============================================================================
// BALANCE TRACKING
// ============================================================================

/**
 * Get initial balances for all parties
 */
export async function getInitialBalances(
  connection: Connection,
  wallets: StagingWallets,
  usdcAccounts: { 
    senderAccount: PublicKey; 
    receiverAccount: PublicKey; 
    feeCollectorAccount?: PublicKey 
  }
) {
  const senderUsdcBalance = await getTokenBalance(connection, usdcAccounts.senderAccount);
  const receiverUsdcBalance = await getTokenBalance(connection, usdcAccounts.receiverAccount);
  const feeCollectorUsdcBalance = usdcAccounts.feeCollectorAccount 
    ? await getTokenBalance(connection, usdcAccounts.feeCollectorAccount)
    : 0;
  
  return {
    sender: {
      sol: await connection.getBalance(wallets.sender.publicKey) / LAMPORTS_PER_SOL,
      usdc: senderUsdcBalance,
    },
    receiver: {
      sol: await connection.getBalance(wallets.receiver.publicKey) / LAMPORTS_PER_SOL,
      usdc: receiverUsdcBalance,
    },
    feeCollector: {
      sol: await connection.getBalance(wallets.feeCollector.publicKey) / LAMPORTS_PER_SOL,
      usdc: feeCollectorUsdcBalance,
    },
  };
}

/**
 * Display balance summary
 */
export function displayBalances(balances: any, label: string = 'Balances') {
  console.log(`\n${label}:`);
  console.log(`   Sender SOL: ${balances.sender.sol.toFixed(4)}, USDC: ${balances.sender.usdc.toFixed(6)}`);
  console.log(`   Receiver SOL: ${balances.receiver.sol.toFixed(4)}, USDC: ${balances.receiver.usdc.toFixed(6)}`);
  console.log(`   Fee Collector SOL: ${balances.feeCollector.sol.toFixed(4)}, USDC: ${balances.feeCollector.usdc.toFixed(6)}\n`);
}

