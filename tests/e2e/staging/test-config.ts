/**
 * STAGING Test Configuration
 * 
 * Centralized configuration for STAGING E2E tests
 */

export const STAGING_CONFIG = {
  // Environment
  environment: 'STAGING',
  
  // Network
  network: 'devnet' as const,
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  
  // API endpoint (defaults to STAGING deployment)
  apiBaseUrl: process.env.STAGING_API_BASE_URL || 'https://easyescrow-backend-staging-mwx9s.ondigitalocean.app',
  
  // STAGING Program ID (from Task 64)
  programId: 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei',
  
  // Official Devnet USDC Mint
  usdcMint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
  
  // Test parameters
  testAmounts: {
    swap: 0.1, // 0.1 USDC
    fee: 0.01, // 1%
    minSOL: 0.1, // Minimum SOL balance for testing
  },
  
  // Timeouts
  timeouts: {
    transaction: 60000, // 60 seconds for transaction confirmation
    settlement: 30000, // 30 seconds for settlement
    polling: 1000, // 1 second between status polls
  },
  
  // Wallet paths
  walletPaths: {
    sender: 'wallets/staging/staging-sender.json',
    receiver: 'wallets/staging/staging-receiver.json',
    admin: 'wallets/staging/staging-admin.json',
    feeCollector: 'wallets/staging/staging-fee-collector.json',
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
  return `${STAGING_CONFIG.explorerUrl}/${type}/${identifier}?cluster=${STAGING_CONFIG.network}`;
}

/**
 * Generate unique idempotency key for tests
 */
export function generateIdempotencyKey(prefix: string = 'staging-e2e'): string {
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

