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
  
  // Test parameters - BETA LIMITS: $1.00 minimum
  swapAmount: 1.00, // 1.00 USDC ($1.00 worth) - BETA minimum
  feePercentage: 0.01, // 1% platform fee
  testAmounts: {
    swap: 1.00, // 1.00 USDC - BETA minimum limit
    fee: 0.01, // 1%
    minSOL: 0.01, // Minimum SOL balance for testing
  },
  
  // Timeouts (more conservative for mainnet)
  timeouts: {
    transaction: 90000, // 90 seconds for transaction confirmation
    settlement: 45000, // 45 seconds for settlement
    polling: 2000, // 2 seconds between status polls
  },
  
  // Wallet paths (load keypairs from these files)
  walletPaths: {
    sender: 'wallets/production/production-sender.json',
    receiver: 'wallets/production/production-receiver.json',
    admin: 'wallets/production/production-admin.json',
    feeCollector: 'wallets/production/production-fee-collector.json',
  },
  
  // Public keys of our controlled wallets (for API tests that don't need keypairs)
  // ALWAYS use these addresses in tests, NOT random/exchange addresses!
  testWallets: {
    sender: 'B7jiNm8TKvaoad3N36pyDeXMSVPmvHLaXZMDC7udhTfr',    // From mainnet-sender.json
    receiver: '3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY',  // From mainnet-receiver.json
    admin: 'HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2',     // From mainnet-admin.json
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








