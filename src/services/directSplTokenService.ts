/**
 * Direct SPL Token Transfer Service
 * 
 * Builds SPL NFT transfer instructions that use the Token Program directly,
 * bypassing our escrow program. This enables bulk SPL NFT swaps via Jito bundles.
 * 
 * Used with Jito bundles to achieve atomic multi-NFT swaps:
 * - Transaction 1: SOL transfers (payment + fee)
 * - Transaction 2-N: SPL token transfers directly
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

/**
 * Parameters for building a direct SPL token transfer instruction
 */
export interface DirectSplTokenTransferParams {
  /** SPL NFT mint address */
  mint: string;
  /** Current owner (must sign) */
  fromWallet: PublicKey;
  /** New owner */
  toWallet: PublicKey;
}

/**
 * Result of building a direct SPL token transfer
 */
export interface DirectSplTokenTransferResult {
  /** The transfer instruction(s) - may include ATA creation */
  instructions: TransactionInstruction[];
  /** Source token account */
  sourceAta: PublicKey;
  /** Destination token account */
  destinationAta: PublicKey;
  /** Whether destination ATA needs to be created */
  needsAtaCreation: boolean;
  /** Estimated size in bytes */
  estimatedSize: number;
}

/**
 * Service for building direct SPL token transfer instructions
 */
export class DirectSplTokenService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
    console.log('[DirectSplTokenService] Initialized');
  }

  /**
   * Build direct SPL token transfer instruction(s)
   * 
   * This creates transfer instruction(s) that call the Token Program directly,
   * including ATA creation if the destination doesn't have one.
   */
  async buildTransferInstruction(
    params: DirectSplTokenTransferParams
  ): Promise<DirectSplTokenTransferResult> {
    console.log('[DirectSplTokenService] Building transfer instruction:', {
      mint: params.mint,
      from: params.fromWallet.toBase58(),
      to: params.toWallet.toBase58(),
    });

    const mint = new PublicKey(params.mint);
    const instructions: TransactionInstruction[] = [];
    let needsAtaCreation = false;

    // Get source and destination ATAs
    const sourceAta = await getAssociatedTokenAddress(mint, params.fromWallet);
    const destinationAta = await getAssociatedTokenAddress(mint, params.toWallet);

    // Check if destination ATA exists
    try {
      await getAccount(this.connection, destinationAta);
      console.log('[DirectSplTokenService] Destination ATA exists:', destinationAta.toBase58());
    } catch (error) {
      // ATA doesn't exist, create it
      console.log('[DirectSplTokenService] Creating destination ATA:', destinationAta.toBase58());
      needsAtaCreation = true;
      
      instructions.push(
        createAssociatedTokenAccountInstruction(
          params.fromWallet, // Payer (the sender pays for ATA creation)
          destinationAta,
          params.toWallet,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Create transfer instruction
    instructions.push(
      createTransferInstruction(
        sourceAta,
        destinationAta,
        params.fromWallet, // Owner must sign
        1 // NFTs always transfer amount of 1
      )
    );

    // Estimate size: ~82 bytes for transfer, ~165 for ATA creation
    const estimatedSize = needsAtaCreation ? 247 : 82;

    console.log('[DirectSplTokenService] Transfer instruction built:', {
      mint: params.mint,
      sourceAta: sourceAta.toBase58(),
      destinationAta: destinationAta.toBase58(),
      needsAtaCreation,
      instructionCount: instructions.length,
      estimatedSize,
    });

    return {
      instructions,
      sourceAta,
      destinationAta,
      needsAtaCreation,
      estimatedSize,
    };
  }

  /**
   * Build multiple SPL token transfers
   * Useful for batching multiple transfers in one transaction
   */
  async buildBatchTransferInstructions(
    transfers: DirectSplTokenTransferParams[]
  ): Promise<{
    instructions: TransactionInstruction[];
    totalEstimatedSize: number;
    transferCount: number;
  }> {
    console.log('[DirectSplTokenService] Building batch transfers:', transfers.length);

    const allInstructions: TransactionInstruction[] = [];
    let totalEstimatedSize = 0;

    for (const transfer of transfers) {
      const result = await this.buildTransferInstruction(transfer);
      allInstructions.push(...result.instructions);
      totalEstimatedSize += result.estimatedSize;
    }

    console.log('[DirectSplTokenService] Batch transfers built:', {
      transferCount: transfers.length,
      totalInstructions: allInstructions.length,
      totalEstimatedSize,
    });

    return {
      instructions: allInstructions,
      totalEstimatedSize,
      transferCount: transfers.length,
    };
  }
}

/**
 * Factory function to create DirectSplTokenService instance
 */
export function createDirectSplTokenService(connection: Connection): DirectSplTokenService {
  return new DirectSplTokenService(connection);
}

