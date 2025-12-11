/**
 * Direct Bubblegum Transfer Service
 * 
 * Builds cNFT transfer instructions that call Bubblegum directly,
 * bypassing our escrow program. This is required because:
 * 1. cNFT transfers with proof nodes exceed single transaction size limits
 * 2. Our escrow program doesn't pass proof nodes to Bubblegum CPI
 * 
 * Used with Jito bundles to achieve atomic cNFT swaps:
 * - Transaction 1: SOL transfers (payment + fee)
 * - Transaction 2: cNFT transfer via Bubblegum directly
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  AccountMeta,
  SystemProgram,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  PROGRAM_ID as MPL_BUBBLEGUM_PROGRAM_ID,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
} from '../constants/bubblegum';
import { CnftService, createCnftService } from './cnftService';

/**
 * Parameters for building a direct Bubblegum transfer instruction
 */
export interface DirectBubblegumTransferParams {
  /** cNFT asset ID */
  assetId: string;
  /** Current owner (must sign) */
  fromWallet: PublicKey;
  /** New owner */
  toWallet: PublicKey;
  /** Optional delegate (if different from owner) */
  delegate?: PublicKey;
}

/**
 * Result of building a direct Bubblegum transfer
 */
export interface DirectBubblegumTransferResult {
  /** The transfer instruction */
  instruction: TransactionInstruction;
  /** Tree address */
  treeAddress: PublicKey;
  /** Tree authority PDA */
  treeAuthority: PublicKey;
  /** Proof nodes used */
  proofNodes: PublicKey[];
  /** Estimated size in bytes */
  estimatedSize: number;
}

/**
 * Service for building direct Bubblegum transfer instructions
 */
export class DirectBubblegumService {
  private connection: Connection;
  private cnftService: CnftService;

  constructor(connection: Connection) {
    this.connection = connection;
    this.cnftService = createCnftService(connection);
    console.log('[DirectBubblegumService] Initialized');
  }

  /**
   * Build a direct Bubblegum transfer instruction with proof nodes
   * 
   * This creates a transfer instruction that calls Bubblegum directly,
   * including all necessary proof nodes as remaining accounts.
   */
  async buildTransferInstruction(
    params: DirectBubblegumTransferParams
  ): Promise<DirectBubblegumTransferResult> {
    console.log('[DirectBubblegumService] Building transfer instruction:', {
      assetId: params.assetId,
      from: params.fromWallet.toBase58(),
      to: params.toWallet.toBase58(),
    });

    // Fetch cNFT data and proof from DAS API
    const transferParams = await this.cnftService.buildTransferParams(
      params.assetId,
      params.fromWallet,
      params.toWallet
    );

    const {
      treeAddress,
      treeAuthorityAddress,
      proof,
    } = transferParams;

    // Convert proof nodes to PublicKey array for remaining accounts
    // Each proof node is a 32-byte array
    // The proof.proof field is optional (empty for full canopy trees)
    const proofNodesRaw = proof.proof || [];
    const proofNodes: PublicKey[] = proofNodesRaw.map((node) => {
      // Handle both number[] and Uint8Array types
      const nodeBuffer = node instanceof Uint8Array ? node : Buffer.from(node);
      return new PublicKey(nodeBuffer);
    });

    console.log('[DirectBubblegumService] Proof details:', {
      treeAddress: treeAddress.toBase58(),
      treeAuthority: treeAuthorityAddress.toBase58(),
      proofNodesCount: proofNodes.length,
      leafIndex: proof.index,
    });

    // Build the transfer instruction using mpl-bubblegum
    // The instruction accounts are: treeAuthority, leafOwner, leafDelegate, newLeafOwner,
    // merkleTree, logWrapper, compressionProgram, systemProgram
    const instruction = createTransferInstruction(
      {
        treeAuthority: treeAuthorityAddress,
        leafOwner: params.fromWallet,
        leafDelegate: params.delegate || params.fromWallet,
        newLeafOwner: params.toWallet,
        merkleTree: treeAddress,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      },
      {
        root: Array.from(proof.root),
        dataHash: Array.from(proof.dataHash),
        creatorHash: Array.from(proof.creatorHash),
        // mpl-bubblegum expects nonce as number, not bigint (bignum)
        nonce: typeof proof.nonce === 'bigint' ? Number(proof.nonce) : proof.nonce,
        index: proof.index,
      }
    );

    // CRITICAL FIX: mpl-bubblegum library incorrectly sets leafOwner.isSigner = false
    // Bubblegum actually requires the leafOwner (or leafDelegate if different) to sign
    // Find and fix the signer account
    const signerPubkey = params.delegate || params.fromWallet;
    const signerIndex = instruction.keys.findIndex(
      key => key.pubkey.equals(signerPubkey)
    );
    if (signerIndex !== -1) {
      instruction.keys[signerIndex].isSigner = true;
      console.log('[DirectBubblegumService] Fixed signer flag for:', signerPubkey.toBase58());
    } else {
      console.warn('[DirectBubblegumService] Could not find signer account in instruction keys');
    }

    // Add proof nodes as remaining accounts
    // These are required when canopy depth < max depth
    const proofAccountMetas: AccountMeta[] = proofNodes.map(node => ({
      pubkey: node,
      isSigner: false,
      isWritable: false,
    }));

    // Append proof accounts to the instruction
    instruction.keys.push(...proofAccountMetas);

    // Estimate size: base instruction + proof nodes (32 bytes each)
    const estimatedSize = 200 + (proofNodes.length * 32);

    console.log('[DirectBubblegumService] Transfer instruction built:', {
      accountCount: instruction.keys.length,
      dataSize: instruction.data.length,
      proofNodes: proofNodes.length,
      estimatedSize,
    });

    return {
      instruction,
      treeAddress,
      treeAuthority: treeAuthorityAddress,
      proofNodes,
      estimatedSize,
    };
  }

  /**
   * Verify that a cNFT transfer would succeed (simulation)
   */
  async simulateTransfer(
    params: DirectBubblegumTransferParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { instruction } = await this.buildTransferInstruction(params);
      
      // Create a minimal transaction for simulation
      const { Transaction } = await import('@solana/web3.js');
      const recentBlockhash = await this.connection.getLatestBlockhash();
      
      const tx = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: params.fromWallet,
      }).add(instruction);

      // Simulate
      const simulation = await this.connection.simulateTransaction(tx);
      
      if (simulation.value.err) {
        return {
          success: false,
          error: JSON.stringify(simulation.value.err),
        };
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get the CnftService instance for direct access
   */
  getCnftService(): CnftService {
    return this.cnftService;
  }
}

/**
 * Create a DirectBubblegumService instance
 */
export function createDirectBubblegumService(connection: Connection): DirectBubblegumService {
  return new DirectBubblegumService(connection);
}

