/**
 * Metaplex Bubblegum Program Constants
 * 
 * Bubblegum is the standard for compressed NFTs (cNFTs) on Solana.
 * Compressed NFTs use Merkle trees for efficient storage and validation.
 * 
 * @see https://docs.metaplex.com/programs/compression/
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Bubblegum Program ID (canonical Metaplex deployment)
 * Used for all cNFT operations including transfers
 */
export const BUBBLEGUM_PROGRAM_ID = new PublicKey(
  'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY'
);

/**
 * SPL Account Compression Program ID
 * Handles the underlying Merkle tree operations for cNFTs
 */
export const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  'cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK'
);

/**
 * SPL Noop Program ID  
 * Used for logging Merkle tree changes in transactions
 */
export const SPL_NOOP_PROGRAM_ID = new PublicKey(
  'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV'
);

/**
 * Tree Canopy Depth
 * Number of levels cached on-chain for faster transfers.
 * Common values: 0, 11, 14 (higher = more expensive tree but faster transfers)
 */
export const DEFAULT_TREE_CANOPY_DEPTH = 11;

/**
 * Maximum tree depth for efficient proof size
 * Depth 14 = max 16,384 cNFTs per tree
 * Proof size = depth - canopy depth
 */
export const MAX_TREE_DEPTH = 14;

/**
 * Maximum buffer size for efficient batching
 * Buffer size 64 = 64 concurrent tree modifications queued
 */
export const MAX_BUFFER_SIZE = 64;

