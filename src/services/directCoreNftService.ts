/**
 * Direct Metaplex Core NFT Transfer Service
 * 
 * Builds Core NFT transfer instructions that use the mpl-core program directly,
 * bypassing our escrow program. This enables bulk Core NFT swaps via Jito bundles.
 * 
 * Used with Jito bundles to achieve atomic multi-NFT swaps:
 * - Transaction 1: SOL transfers (payment + fee)
 * - Transaction 2-N: Core NFT transfers directly
 * 
 * Note: Metaplex Core NFTs use a different on-chain program than SPL Token NFTs.
 * The mpl-core program handles ownership and transfers natively (no token accounts).
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';

// Metaplex Core program ID
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

/**
 * Parameters for building a direct Core NFT transfer instruction
 */
export interface DirectCoreNftTransferParams {
  /** Core NFT asset address */
  assetAddress: string;
  /** Current owner (must sign) */
  fromWallet: PublicKey;
  /** New owner */
  toWallet: PublicKey;
  /** Optional collection address (if asset belongs to a collection) */
  collection?: PublicKey;
}

/**
 * Result of building a direct Core NFT transfer
 */
export interface DirectCoreNftTransferResult {
  /** The transfer instruction */
  instruction: TransactionInstruction;
  /** Asset address */
  assetAddress: PublicKey;
  /** Estimated size in bytes */
  estimatedSize: number;
}

/**
 * Core NFT TransferV1 instruction discriminator
 * This is a single byte (u8) that identifies the TransferV1 instruction in mpl-core
 * Value: 14 (0x0E) - from @metaplex-foundation/mpl-core TransferV1 instruction
 */
const TRANSFER_V1_DISCRIMINATOR = 14;

/**
 * Service for building direct Metaplex Core NFT transfer instructions
 */
export class DirectCoreNftService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
    console.log('[DirectCoreNftService] Initialized');
  }

  /**
   * Build a direct Core NFT transfer instruction
   * 
   * Metaplex Core uses a simpler ownership model than SPL tokens:
   * - No token accounts needed
   * - Ownership is tracked directly on the asset account
   * - Transfer just updates the owner field on the asset
   * - Collection is REQUIRED for collection NFTs or transfer fails
   */
  async buildTransferInstruction(
    params: DirectCoreNftTransferParams
  ): Promise<DirectCoreNftTransferResult> {
    console.log('[DirectCoreNftService] Building transfer instruction:', {
      assetAddress: params.assetAddress,
      from: params.fromWallet.toBase58(),
      to: params.toWallet.toBase58(),
    });

    const assetPubkey = new PublicKey(params.assetAddress);
    
    // Fetch asset data to get collection (required for collection NFTs)
    let collection: PublicKey | undefined = params.collection;
    if (!collection) {
      try {
        const assetData = await this.fetchAssetData(params.assetAddress);
        if (assetData.collection) {
          collection = new PublicKey(assetData.collection);
          console.log('[DirectCoreNftService] Fetched collection:', collection.toBase58());
        }
      } catch (error) {
        console.warn('[DirectCoreNftService] Could not fetch collection, proceeding without:', error);
      }
    }

    // Build the transfer instruction data
    // TransferV1 instruction format:
    // - discriminator: u8 (1 byte) = 14
    // - compressionProof: Option<CompressionProof> (1 byte for None = 0x00)
    const instructionData = Buffer.from([
      TRANSFER_V1_DISCRIMINATOR, // u8 discriminator (1 byte)
      0, // Option::None for compression_proof (not compressed)
    ]);

    // Build account metas for the transfer
    // Accounts order for mpl-core Transfer:
    // 1. asset (writable) - The Core NFT asset
    // 2. collection (optional) - Collection if asset belongs to one
    // 3. payer (signer) - Pays for any rent
    // 4. authority (signer) - Current owner authorizing the transfer
    // 5. new_owner - The new owner to transfer to
    // 6. system_program (optional) - For any lamport transfers
    // 7+ additional accounts for plugins (optional)

    const keys = [
      { pubkey: assetPubkey, isSigner: false, isWritable: true }, // asset
      { pubkey: params.fromWallet, isSigner: true, isWritable: true }, // payer
      { pubkey: params.fromWallet, isSigner: true, isWritable: false }, // authority (owner)
      { pubkey: params.toWallet, isSigner: false, isWritable: false }, // new_owner
    ];

    // Add collection if available (required for collection NFTs)
    if (collection) {
      keys.splice(1, 0, { pubkey: collection, isSigner: false, isWritable: false });
      console.log('[DirectCoreNftService] Added collection to transfer:', collection.toBase58());
    }

    // Add system program (usually needed for rent)
    keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });

    const instruction = new TransactionInstruction({
      programId: MPL_CORE_PROGRAM_ID,
      keys,
      data: instructionData,
    });

    // Estimate size: ~100 bytes for Core NFT transfer
    const estimatedSize = 100;

    console.log('[DirectCoreNftService] Transfer instruction built:', {
      assetAddress: params.assetAddress,
      programId: MPL_CORE_PROGRAM_ID.toBase58(),
      accountCount: keys.length,
      estimatedSize,
    });

    return {
      instruction,
      assetAddress: assetPubkey,
      estimatedSize,
    };
  }

  /**
   * Build multiple Core NFT transfers
   * Useful for batching multiple transfers in one transaction
   */
  async buildBatchTransferInstructions(
    transfers: DirectCoreNftTransferParams[]
  ): Promise<{
    instructions: TransactionInstruction[];
    totalEstimatedSize: number;
    transferCount: number;
  }> {
    console.log('[DirectCoreNftService] Building batch transfers:', transfers.length);

    const instructions: TransactionInstruction[] = [];
    let totalEstimatedSize = 0;

    for (const transfer of transfers) {
      const result = await this.buildTransferInstruction(transfer);
      instructions.push(result.instruction);
      totalEstimatedSize += result.estimatedSize;
    }

    console.log('[DirectCoreNftService] Batch transfers built:', {
      transferCount: transfers.length,
      totalInstructions: instructions.length,
      totalEstimatedSize,
    });

    return {
      instructions,
      totalEstimatedSize,
      transferCount: transfers.length,
    };
  }

  /**
   * Fetch Core NFT asset data to verify ownership and get collection info
   * Uses DAS API (same as cNFTs)
   */
  async fetchAssetData(assetAddress: string): Promise<{
    owner: string;
    collection?: string;
    interface: string;
  }> {
    console.log('[DirectCoreNftService] Fetching asset data:', assetAddress);

    const rpcEndpoint = this.connection.rpcEndpoint;
    
    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-asset',
        method: 'getAsset',
        params: { id: assetAddress },
      }),
    });

    const data = await response.json() as { error?: { message: string }; result?: any };
    
    if (data.error) {
      throw new Error(`DAS API error: ${data.error.message}`);
    }

    const result = data.result;
    
    return {
      owner: result.ownership?.owner || '',
      collection: result.grouping?.find((g: any) => g.group_key === 'collection')?.group_value,
      interface: result.interface || 'unknown',
    };
  }
}

/**
 * Factory function to create DirectCoreNftService instance
 */
export function createDirectCoreNftService(connection: Connection): DirectCoreNftService {
  return new DirectCoreNftService(connection);
}

