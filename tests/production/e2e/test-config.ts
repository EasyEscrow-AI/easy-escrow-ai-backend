/**
 * PRODUCTION Test Configuration
 * 
 * Centralized configuration for PRODUCTION E2E tests
 * 
 * ⚠️ WARNING: These tests run against PRODUCTION with REAL MAINNET SOL and USDC
 * 
 * Note: .env.production should be loaded BEFORE importing this file
 */

export const PRODUCTION_CONFIG = {
  // Environment
  environment: 'PRODUCTION',
  
  // Network
  network: 'mainnet-beta' as const,
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  
  // API endpoint (defaults to PRODUCTION deployment)
  apiBaseUrl: process.env.PRODUCTION_API_BASE_URL || 'https://api.easyescrow.ai',
  
  // PRODUCTION Program ID (from Task 92)
  programId: '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx',
  
  // Official Circle USDC Mainnet Mint
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  
  // Test parameters - SMALLER amounts for production testing
  swapAmount: 0.01, // 0.01 USDC ($0.01 worth) for testing
  feePercentage: 0.01, // 1% platform fee
  testAmounts: {
    swap: 0.01, // 0.01 USDC
    fee: 0.01, // 1%
    minSOL: 0.01, // Minimum SOL balance for testing
  },
  
  // Timeouts (more conservative for mainnet)
  timeouts: {
    transaction: 90000, // 90 seconds for transaction confirmation
    settlement: 45000, // 45 seconds for settlement
    polling: 2000, // 2 seconds between status polls
  },
  
  // Wallet paths
  walletPaths: {
    sender: 'wallets/production/production-sender.json',
    receiver: 'wallets/production/production-receiver.json',
    admin: 'wallets/production/production-admin.json',
    feeCollector: 'wallets/production/production-fee-collector.json',
  },
  
  // IDL path
  idlPath: 'target/idl/escrow.json',
  
  // Explorer base URL
  explorerUrl: 'https://explorer.solana.com',
};

/**
 * Get explorer URL for transaction or address
 */
export function getExplorerUrl(
  identifier: string,
  type: 'tx' | 'address' = 'tx'
): string {
  // No cluster param for mainnet
  return `${PRODUCTION_CONFIG.explorerUrl}/${type}/${identifier}`;
}

/**
 * Generate unique idempotency key for tests
 */
export function generateIdempotencyKey(prefix: string = 'prod-e2e'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Calculate expected amounts after fees
 */
export function calculateExpectedAmounts(swapAmount: number, feePercentage: number) {
  const fee = swapAmount * feePercentage;
  const sellerReceives = swapAmount - fee;
  
  return {
    swapAmount,
    fee,
    sellerReceives,
    feePercentage,
  };
}




