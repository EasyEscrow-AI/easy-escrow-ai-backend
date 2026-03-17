/**
 * Shared Test Utilities for STAGING E2E Tests
 *
 * Common functions, types, and configurations used across staging E2E test scenarios.
 */

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, getAccount, createMint, mintTo } from '@solana/spl-token';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const STAGING_CONFIG = {
  environment: 'STAGING',
  network: 'devnet' as const,
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  apiBaseUrl: process.env.STAGING_API_BASE_URL || 'https://staging-api.easyescrow.ai',
  programId: 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei',
  usdcMint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
  timeouts: {
    transaction: 60000,
    settlement: 30000,
    polling: 1000,
  },
  explorerUrl: 'https://explorer.solana.com',
};

// ============================================================================
// TYPES
// ============================================================================

export interface StagingWallets {
  sender: Keypair;
  receiver: Keypair;
  admin: Keypair;
  feeCollector: Keypair;
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

export function generateIdempotencyKey(prefix: string = 'staging-e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function getExplorerUrl(address: string, type: 'address' | 'tx' = 'tx'): string {
  return `https://explorer.solana.com/${type}/${address}?cluster=${STAGING_CONFIG.network}`;
}

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
      console.error(`   Warning: Error checking status: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`Timeout waiting for status ${targetStatus} after ${maxAttempts} attempts`);
}

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

export async function createTestNFT(
  connection: Connection,
  owner: Keypair
): Promise<TestNFT> {
  console.log('   Creating real NFT on devnet...');

  const nftMint = await createMint(
    connection,
    owner,
    owner.publicKey,
    null,
    0
  );

  console.log(`   NFT Mint created: ${nftMint.toBase58()}`);

  // Wait for mint confirmation
  let mintConfirmed = false;
  for (let i = 0; i < 10; i++) {
    try {
      const mintInfo = await connection.getAccountInfo(nftMint);
      if (mintInfo !== null) {
        mintConfirmed = true;
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

  // Create token account
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
      break;
    } catch (error: any) {
      lastError = error;
      console.log(`   Token account creation failed (attempt ${i + 1}/5), retrying...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!tokenAccount) {
    throw new Error(`Failed to create token account after 5 attempts: ${lastError}`);
  }

  // Mint 1 NFT
  const mintTxSignature = await mintTo(
    connection,
    owner,
    nftMint,
    tokenAccount.address,
    owner.publicKey,
    1
  );

  await connection.confirmTransaction(mintTxSignature, 'confirmed');

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
