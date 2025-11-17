/**
 * Atomic Swap Configuration
 * 
 * Configuration for atomic swap operations including fee calculation,
 * cNFT indexer integration, and swap-specific settings.
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Fee Calculation Configuration
 */
export interface FeeConfig {
  /** Flat fee for NFT-only swaps (no SOL involved) in lamports */
  flatFeeLamports: number;
  
  /** Flat fee in SOL (for display/reference) */
  flatFeeSol: number;
  
  /** Percentage fee rate for SOL-involved swaps (e.g., 0.01 = 1%) */
  percentageFeeRate: number;
  
  /** Percentage fee in basis points (e.g., 100 = 1%) */
  percentageFeeBps: number;
  
  /** Maximum fee cap in lamports */
  maxFeeLamports: number;
  
  /** Maximum fee in SOL (for display/reference) */
  maxFeeSol: number;
  
  /** Minimum fee in lamports (prevent zero-fee transactions) */
  minFeeLamports: number;
}

/**
 * cNFT Indexer Configuration
 */
export interface CNFTIndexerConfig {
  /** Indexer API base URL (e.g., Helius DAS API) */
  apiUrl: string;
  
  /** API key for authentication */
  apiKey: string;
  
  /** Request timeout in milliseconds */
  timeoutMs: number;
  
  /** Maximum retry attempts for failed requests */
  maxRetries: number;
  
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  
  /** Enable request caching */
  enableCaching: boolean;
  
  /** Cache TTL in milliseconds */
  cacheTTL: number;
}

/**
 * Swap Offer Configuration
 */
export interface SwapOfferConfig {
  /** Default offer expiration time in milliseconds (7 days) */
  defaultExpirationMs: number;
  
  /** Minimum offer expiration time in milliseconds (1 hour) */
  minExpirationMs: number;
  
  /** Maximum offer expiration time in milliseconds (30 days) */
  maxExpirationMs: number;
  
  /** Maximum number of assets per side of the swap */
  maxAssetsPerSide: number;
  
  /** Maximum SOL amount per swap in lamports */
  maxSolAmountLamports: number;
}

/**
 * Default Fee Configuration
 */
const DEFAULT_FEE_CONFIG: FeeConfig = {
  flatFeeLamports: 0.005 * LAMPORTS_PER_SOL, // 0.005 SOL
  flatFeeSol: 0.005,
  percentageFeeRate: 0.01, // 1%
  percentageFeeBps: 100, // 100 basis points = 1%
  maxFeeLamports: 0.5 * LAMPORTS_PER_SOL, // 0.5 SOL max
  maxFeeSol: 0.5,
  minFeeLamports: 0.001 * LAMPORTS_PER_SOL, // 0.001 SOL minimum
};

/**
 * Default cNFT Indexer Configuration
 * 
 * Note: Defaults to empty values since we use QuickNode (SOLANA_RPC_URL) for cNFT operations.
 * QuickNode supports DAS API on the same endpoint as regular RPC.
 */
const DEFAULT_CNFT_CONFIG: CNFTIndexerConfig = {
  apiUrl: '', // Will use SOLANA_RPC_URL if not explicitly set
  apiKey: '', // QuickNode doesn't need separate API key (auth in URL)
  timeoutMs: 30000, // 30 seconds
  maxRetries: 3,
  retryDelayMs: 1000, // 1 second
  enableCaching: true,
  cacheTTL: 300000, // 5 minutes
};

/**
 * Default Swap Offer Configuration
 */
const DEFAULT_OFFER_CONFIG: SwapOfferConfig = {
  defaultExpirationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  minExpirationMs: 60 * 60 * 1000, // 1 hour
  maxExpirationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxAssetsPerSide: 10, // Max 10 NFTs per side for MVP
  maxSolAmountLamports: 100 * LAMPORTS_PER_SOL, // 100 SOL max
};

/**
 * Load fee configuration from environment variables
 */
export function loadFeeConfig(): FeeConfig {
  const flatFeeSol = parseFloat(
    process.env.FEE_FLAT_AMOUNT_SOL || String(DEFAULT_FEE_CONFIG.flatFeeSol)
  );
  const percentageFeeBps = parseInt(
    process.env.FEE_PERCENTAGE_BPS || String(DEFAULT_FEE_CONFIG.percentageFeeBps),
    10
  );
  const maxFeeSol = parseFloat(
    process.env.FEE_MAX_AMOUNT_SOL || String(DEFAULT_FEE_CONFIG.maxFeeSol)
  );
  const minFeeSol = parseFloat(
    process.env.FEE_MIN_AMOUNT_SOL || String(DEFAULT_FEE_CONFIG.minFeeLamports / LAMPORTS_PER_SOL)
  );

  return {
    flatFeeLamports: Math.round(flatFeeSol * LAMPORTS_PER_SOL),
    flatFeeSol,
    percentageFeeRate: percentageFeeBps / 10000, // Convert BPS to decimal
    percentageFeeBps,
    maxFeeLamports: Math.round(maxFeeSol * LAMPORTS_PER_SOL),
    maxFeeSol,
    minFeeLamports: Math.round(minFeeSol * LAMPORTS_PER_SOL),
  };
}

/**
 * Load cNFT indexer configuration from environment variables
 */
export function loadCNFTIndexerConfig(): CNFTIndexerConfig {
  return {
    apiUrl: process.env.CNFT_INDEXER_API_URL || DEFAULT_CNFT_CONFIG.apiUrl,
    apiKey: process.env.CNFT_INDEXER_API_KEY || DEFAULT_CNFT_CONFIG.apiKey,
    timeoutMs: parseInt(
      process.env.CNFT_INDEXER_TIMEOUT_MS || String(DEFAULT_CNFT_CONFIG.timeoutMs),
      10
    ),
    maxRetries: parseInt(
      process.env.CNFT_INDEXER_MAX_RETRIES || String(DEFAULT_CNFT_CONFIG.maxRetries),
      10
    ),
    retryDelayMs: parseInt(
      process.env.CNFT_INDEXER_RETRY_DELAY_MS || String(DEFAULT_CNFT_CONFIG.retryDelayMs),
      10
    ),
    enableCaching:
      process.env.CNFT_INDEXER_ENABLE_CACHING !== 'false' && DEFAULT_CNFT_CONFIG.enableCaching,
    cacheTTL: parseInt(
      process.env.CNFT_INDEXER_CACHE_TTL_MS || String(DEFAULT_CNFT_CONFIG.cacheTTL),
      10
    ),
  };
}

/**
 * Load swap offer configuration from environment variables
 */
export function loadSwapOfferConfig(): SwapOfferConfig {
  return {
    defaultExpirationMs: parseInt(
      process.env.OFFER_DEFAULT_EXPIRATION_MS || String(DEFAULT_OFFER_CONFIG.defaultExpirationMs),
      10
    ),
    minExpirationMs: parseInt(
      process.env.OFFER_MIN_EXPIRATION_MS || String(DEFAULT_OFFER_CONFIG.minExpirationMs),
      10
    ),
    maxExpirationMs: parseInt(
      process.env.OFFER_MAX_EXPIRATION_MS || String(DEFAULT_OFFER_CONFIG.maxExpirationMs),
      10
    ),
    maxAssetsPerSide: parseInt(
      process.env.OFFER_MAX_ASSETS_PER_SIDE || String(DEFAULT_OFFER_CONFIG.maxAssetsPerSide),
      10
    ),
    maxSolAmountLamports: parseInt(
      process.env.OFFER_MAX_SOL_LAMPORTS || String(DEFAULT_OFFER_CONFIG.maxSolAmountLamports),
      10
    ),
  };
}

/**
 * Validate fee configuration
 */
export function validateFeeConfig(config: FeeConfig): void {
  if (config.flatFeeLamports < 0) {
    throw new Error('FEE_FLAT_AMOUNT_SOL must be non-negative');
  }
  
  if (config.percentageFeeRate < 0 || config.percentageFeeRate > 1) {
    throw new Error('FEE_PERCENTAGE_BPS must be between 0 and 10000 (0% to 100%)');
  }
  
  if (config.maxFeeLamports < config.flatFeeLamports) {
    throw new Error('FEE_MAX_AMOUNT_SOL must be greater than or equal to FEE_FLAT_AMOUNT_SOL');
  }
  
  if (config.minFeeLamports < 0) {
    throw new Error('FEE_MIN_AMOUNT_SOL must be non-negative');
  }
  
  if (config.minFeeLamports > config.maxFeeLamports) {
    throw new Error('FEE_MIN_AMOUNT_SOL must be less than or equal to FEE_MAX_AMOUNT_SOL');
  }
}

/**
 * Validate cNFT indexer configuration
 */
export function validateCNFTIndexerConfig(config: CNFTIndexerConfig): void {
  // API URL can be empty if using SOLANA_RPC_URL (e.g., QuickNode)
  // If provided, validate format
  if (config.apiUrl && !config.apiUrl.startsWith('http://') && !config.apiUrl.startsWith('https://')) {
    throw new Error('CNFT_INDEXER_API_URL must be a valid HTTP(S) URL');
  }
  
  if (config.timeoutMs < 1000) {
    throw new Error('CNFT_INDEXER_TIMEOUT_MS must be at least 1000ms (1 second)');
  }
  
  if (config.maxRetries < 0) {
    throw new Error('CNFT_INDEXER_MAX_RETRIES must be non-negative');
  }
  
  if (config.retryDelayMs < 0) {
    throw new Error('CNFT_INDEXER_RETRY_DELAY_MS must be non-negative');
  }
  
  if (config.cacheTTL < 0) {
    throw new Error('CNFT_INDEXER_CACHE_TTL_MS must be non-negative');
  }
}

/**
 * Validate swap offer configuration
 */
export function validateSwapOfferConfig(config: SwapOfferConfig): void {
  if (config.defaultExpirationMs < config.minExpirationMs) {
    throw new Error('OFFER_DEFAULT_EXPIRATION_MS must be greater than or equal to OFFER_MIN_EXPIRATION_MS');
  }
  
  if (config.defaultExpirationMs > config.maxExpirationMs) {
    throw new Error('OFFER_DEFAULT_EXPIRATION_MS must be less than or equal to OFFER_MAX_EXPIRATION_MS');
  }
  
  if (config.maxAssetsPerSide < 1) {
    throw new Error('OFFER_MAX_ASSETS_PER_SIDE must be at least 1');
  }
  
  if (config.maxAssetsPerSide > 50) {
    throw new Error('OFFER_MAX_ASSETS_PER_SIDE cannot exceed 50 (transaction size limit)');
  }
  
  if (config.maxSolAmountLamports < 0) {
    throw new Error('OFFER_MAX_SOL_LAMPORTS must be non-negative');
  }
}

/**
 * Get validated fee configuration
 */
export function getFeeConfig(): FeeConfig {
  const config = loadFeeConfig();
  validateFeeConfig(config);
  return config;
}

/**
 * Get validated cNFT indexer configuration
 */
export function getCNFTIndexerConfig(): CNFTIndexerConfig {
  const config = loadCNFTIndexerConfig();
  validateCNFTIndexerConfig(config);
  return config;
}

/**
 * Get validated swap offer configuration
 */
export function getSwapOfferConfig(): SwapOfferConfig {
  const config = loadSwapOfferConfig();
  validateSwapOfferConfig(config);
  return config;
}

/**
 * Complete atomic swap configuration
 */
export interface AtomicSwapConfig {
  fees: FeeConfig;
  cnftIndexer: CNFTIndexerConfig;
  offers: SwapOfferConfig;
}

/**
 * Get complete atomic swap configuration
 */
export function getAtomicSwapConfig(): AtomicSwapConfig {
  return {
    fees: getFeeConfig(),
    cnftIndexer: getCNFTIndexerConfig(),
    offers: getSwapOfferConfig(),
  };
}

// Export singleton instance
let _atomicSwapConfig: AtomicSwapConfig | null = null;

/**
 * Get cached atomic swap configuration
 * Initializes on first access and caches for subsequent calls
 */
export function getCachedAtomicSwapConfig(): AtomicSwapConfig {
  if (!_atomicSwapConfig) {
    _atomicSwapConfig = getAtomicSwapConfig();
  }
  return _atomicSwapConfig;
}

/**
 * Reset cached configuration (useful for testing)
 */
export function resetAtomicSwapConfig(): void {
  _atomicSwapConfig = null;
}

export default {
  getFeeConfig,
  getCNFTIndexerConfig,
  getSwapOfferConfig,
  getAtomicSwapConfig: getCachedAtomicSwapConfig,
  resetAtomicSwapConfig,
};

