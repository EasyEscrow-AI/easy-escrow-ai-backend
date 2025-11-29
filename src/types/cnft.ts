/**
 * Compressed NFT (cNFT) Type Definitions
 * 
 * Types for handling compressed NFTs using Metaplex Bubblegum standard.
 * Compressed NFTs use Merkle trees for efficient on-chain storage.
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Merkle proof required for cNFT ownership verification and transfers.
 * 
 * The proof demonstrates that a specific NFT leaf exists in the Merkle tree
 * without requiring the entire tree to be loaded.
 * 
 * Proof structure based on mpl-bubblegum v0.7.0 / v1.2.0 API.
 */
export interface CnftProof {
  /**
   * Current Merkle root of the tree.
   * Used to verify proof validity - must match on-chain tree root.
   * 32-byte hash.
   */
  root: number[] | Uint8Array;

  /**
   * Data hash of the NFT metadata.
   * Hash of the NFT's URI and other mutable data fields.
   * 32-byte hash.
   */
  dataHash: number[] | Uint8Array;

  /**
   * Creator hash for the NFT.
   * Hash of the creator array (verified creators who can modify metadata).
   * 32-byte hash.
   */
  creatorHash: number[] | Uint8Array;

  /**
   * Nonce (leaf index) of the NFT in the tree.
   * Used to compute the leaf's position in the Merkle tree.
   * Typically same as the leaf index.
   */
  nonce: number | bigint;

  /**
   * Leaf index in the Merkle tree.
   * Position of this NFT in the tree (0 to tree_size - 1).
   */
  index: number;

  /**
   * Merkle proof path (optional for high canopy trees).
   * Array of sibling hashes from leaf to root.
   * Required length = tree_depth - canopy_depth.
   * Empty array if canopy covers entire path.
   */
  proof?: (number[] | Uint8Array)[];
}

/**
 * On-chain cNFT asset data from DAS (Digital Asset Standard) API.
 * Minimal fields needed for swap operations.
 */
export interface CnftAssetData {
  /** Asset ID (same as mint address for queries) */
  id: string;

  /** Compressed NFT flag (always true for cNFTs) */
  compression: {
    compressed: boolean;
    tree: string; // Merkle tree PublicKey
    leaf_id: number; // Leaf index
    data_hash: string; // Base58 encoded data hash
    creator_hash: string; // Base58 encoded creator hash
    asset_hash: string; // Base58 encoded asset hash
  };

  /** Current owner wallet address */
  ownership: {
    owner: string;
    delegate?: string;
  };

  /** Metadata */
  content: {
    metadata?: {
      name?: string;
      symbol?: string;
    };
    json_uri?: string;
  };
}

/**
 * Parameters for building a cNFT transfer instruction.
 * Used by transactionBuilder to construct Bubblegum CPI calls.
 */
export interface CnftTransferParams {
  /** Merkle tree containing the cNFT */
  treeAddress: PublicKey;

  /** Tree authority PDA */
  treeAuthorityAddress: PublicKey;

  /** Current owner of the cNFT */
  fromAddress: PublicKey;

  /** New owner of the cNFT */
  toAddress: PublicKey;

  /** Merkle proof for the transfer */
  proof: CnftProof;

  /** Optional: Leaf delegate if different from owner */
  delegateAddress?: PublicKey;
}

/**
 * Response from DAS API getAssetProof endpoint.
 * Contains full Merkle proof needed for cNFT operations.
 */
export interface DasProofResponse {
  root: string; // Base58 encoded
  proof: string[]; // Array of base58 encoded proof nodes
  node_index: number;
  leaf: string; // Base58 encoded leaf hash
  tree_id: string; // Merkle tree PublicKey
}

