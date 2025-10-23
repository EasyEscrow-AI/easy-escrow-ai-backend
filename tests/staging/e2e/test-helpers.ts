/**
 * STAGING Test Helpers
 * 
 * Utility functions for STAGING E2E tests
 */

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { STAGING_CONFIG } from './test-config';

// ============================================================================
// WALLET MANAGEMENT
// ============================================================================

export interface StagingWallets {
  sender: Keypair;
  receiver: Keypair;
  admin: Keypair;
  feeCollector: Keypair;
}

/**
 * Load STAGING wallet keypairs from files
 */
export function loadStagingWallets(): StagingWallets {
  const projectRoot = path.join(__dirname, '../../..');
  
  const loadKeypair = (relativePath: string): Keypair => {
    const filepath = path.join(projectRoot, relativePath);
    
    if (!fs.existsSync(filepath)) {
      throw new Error(`Wallet file not found: ${filepath}`);
    }
    
    const keypairData = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keypairData));
  };

  return {
    sender: loadKeypair(STAGING_CONFIG.walletPaths.sender),
    receiver: loadKeypair(STAGING_CONFIG.walletPaths.receiver),
    admin: loadKeypair(STAGING_CONFIG.walletPaths.admin),
    feeCollector: loadKeypair(STAGING_CONFIG.walletPaths.feeCollector),
  };
}

/**
 * Display wallet information
 */
export function displayWalletInfo(wallets: StagingWallets): void {
  console.log('📋 STAGING Wallet Information:');
  console.log(`   Sender: ${wallets.sender.publicKey.toBase58()}`);
  console.log(`   Receiver: ${wallets.receiver.publicKey.toBase58()}`);
  console.log(`   Admin: ${wallets.admin.publicKey.toBase58()}`);
  console.log(`   Fee Collector: ${wallets.feeCollector.publicKey.toBase58()}`);
}

/**
 * Verify wallet balances meet minimum requirements
 */
export async function verifyWalletBalances(
  connection: Connection,
  wallets: StagingWallets,
  minSOL: number = STAGING_CONFIG.testAmounts.minSOL
): Promise<{ [key: string]: number }> {
  const balances: { [key: string]: number } = {};
  
  for (const [role, wallet] of Object.entries(wallets)) {
    const balance = await connection.getBalance(wallet.publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    balances[role] = balanceSOL;
    
    console.log(`   ${role}: ${balanceSOL.toFixed(4)} SOL`);
    
    if (balanceSOL < minSOL) {
      console.log(`   ⚠️  Warning: ${role} balance below minimum (${minSOL} SOL)`);
    }
  }
  
  return balances;
}

// ============================================================================
// TOKEN OPERATIONS
// ============================================================================

/**
 * Get token balance for an account
 */
export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<number> {
  try {
    const accountInfo = await getAccount(connection, tokenAccount);
    return Number(accountInfo.amount) / Math.pow(10, 6); // USDC has 6 decimals
  } catch (error) {
    return 0;
  }
}

// ============================================================================
// AGREEMENT OPERATIONS
// ============================================================================

export interface CreateAgreementParams {
  nftMint: string;
  price: number;
  seller: string;
  buyer: string;
  expiry: string;
  feeBps: number;
  honorRoyalties: boolean;
}

export interface AgreementResponse {
  agreementId: string;
  escrowPda: string;
  depositAddresses: {
    usdc: string;
    nft: string;
  };
  transactionId?: string;
}

/**
 * Create agreement via API
 */
export async function createAgreement(
  params: CreateAgreementParams,
  idempotencyKey: string
): Promise<AgreementResponse> {
  const response = await axios.post(
    `${STAGING_CONFIG.apiBaseUrl}/v1/agreements`,
    params,
    {
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
    }
  );

  if (response.status !== 201 || !response.data.success) {
    throw new Error(`Failed to create agreement: ${JSON.stringify(response.data)}`);
  }

  return response.data.data;
}

/**
 * Get agreement details
 */
export async function getAgreement(agreementId: string): Promise<any> {
  const response = await axios.get(
    `${STAGING_CONFIG.apiBaseUrl}/v1/agreements/${agreementId}`
  );

  if (response.status !== 200 || !response.data.success) {
    throw new Error(`Failed to get agreement: ${JSON.stringify(response.data)}`);
  }

  return response.data.data;
}

/**
 * Wait for agreement to reach target status
 */
export async function waitForAgreementStatus(
  agreementId: string,
  targetStatus: string,
  maxAttempts: number = 30,
  intervalMs: number = STAGING_CONFIG.timeouts.polling
): Promise<any> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const agreement = await getAgreement(agreementId);
      const currentStatus = agreement.status;
      
      console.log(`   [${attempt}/${maxAttempts}] Status: ${currentStatus}`);
      
      if (currentStatus === targetStatus) {
        console.log(`   ✅ Reached status: ${targetStatus}`);
        return agreement;
      }
      
      // Provide helpful status messages
      if (currentStatus === 'PENDING') {
        console.log('      Waiting for deposits...');
      } else if (currentStatus === 'USDC_LOCKED') {
        console.log('      💰 USDC confirmed, waiting for NFT...');
      } else if (currentStatus === 'NFT_LOCKED') {
        console.log('      🎨 NFT confirmed, waiting for USDC...');
      } else if (currentStatus === 'BOTH_LOCKED') {
        console.log('      💫 Both deposits confirmed, settlement in progress...');
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error: any) {
      console.error(`   ⚠️  Error checking status: ${error.message}`);
    }
  }
  
  throw new Error(
    `Timeout waiting for status "${targetStatus}" after ${maxAttempts} attempts (${maxAttempts * intervalMs / 1000}s)`
  );
}

// ============================================================================
// TRANSACTION HELPERS
// ============================================================================

/**
 * Get transaction fee from confirmed transaction
 */
export async function getTransactionFee(
  connection: Connection,
  signature: string
): Promise<number> {
  try {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    
    if (tx && tx.meta && tx.meta.fee) {
      return tx.meta.fee / LAMPORTS_PER_SOL;
    }
    return 0;
  } catch (error) {
    console.warn(`   ⚠️  Could not fetch fee for transaction ${signature}`);
    return 0;
  }
}

/**
 * Prepare and sign deposit transaction
 */
export async function prepareDepositTransaction(
  agreementId: string,
  depositType: 'nft' | 'usdc',
  signer: Keypair,
  connection: Connection
): Promise<string> {
  // Step 1: Get unsigned transaction from API
  const endpoint = depositType === 'nft'
    ? `/v1/agreements/${agreementId}/deposit-nft/prepare`
    : `/v1/agreements/${agreementId}/deposit-usdc/prepare`;

  const prepareResponse = await axios.post(
    `${STAGING_CONFIG.apiBaseUrl}${endpoint}`,
    {},
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (prepareResponse.status !== 200 || !prepareResponse.data.success) {
    throw new Error(`Failed to prepare ${depositType} deposit: ${JSON.stringify(prepareResponse.data)}`);
  }

  const base64Transaction = prepareResponse.data.data.transaction;

  // Step 2: Deserialize transaction
  const { Transaction } = await import('@solana/web3.js');
  const transactionBuffer = Buffer.from(base64Transaction, 'base64');
  const transaction = Transaction.from(transactionBuffer);

  // Step 3: Sign transaction
  transaction.sign(signer);

  // Step 4: Submit to network
  const txId = await connection.sendRawTransaction(transaction.serialize());

  // Step 5: Wait for confirmation
  await connection.confirmTransaction(txId, 'confirmed');

  return txId;
}

// ============================================================================
// TEST DATA GENERATION
// ============================================================================

/**
 * Generate test expiry date
 */
export function generateExpiry(minutesFromNow: number = 60): string {
  const expiry = new Date(Date.now() + minutesFromNow * 60 * 1000);
  return expiry.toISOString();
}

/**
 * Generate short expiry for expiry tests
 */
export function generateShortExpiry(minutesFromNow: number = 5): string {
  return generateExpiry(minutesFromNow);
}

