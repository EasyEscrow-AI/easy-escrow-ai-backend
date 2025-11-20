/**
 * Transaction Builder Service
 * 
 * Constructs complete atomic swap transactions on Solana including:
 * - Durable nonce advancement
 * - NFT and cNFT transfers
 * - SOL transfers
 * - Platform fee collection
 * 
 * Ensures transactions are properly structured, signed, and ready for execution.
 */

import {
  Connection,
  Keypair,
  NonceAccount,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { AssetInfo, AssetType } from './assetValidator';

export interface SwapAsset {
  type: AssetType;
  identifier: string;
  assetInfo?: AssetInfo;
}

export interface TransactionBuildInputs {
  /** Maker (offer creator) public key */
  makerPubkey: PublicKey;
  
  /** Taker (offer acceptor) public key */
  takerPubkey: PublicKey;
  
  /** Assets offered by maker */
  makerAssets: SwapAsset[];
  
  /** SOL amount offered by maker (in lamports) */
  makerSolLamports: bigint;
  
  /** Assets requested by maker (offered by taker) */
  takerAssets: SwapAsset[];
  
  /** SOL amount offered by taker (in lamports) */
  takerSolLamports: bigint;
  
  /** Platform fee in lamports */
  platformFeeLamports: bigint;
  
  /** Durable nonce account public key */
  nonceAccountPubkey: PublicKey;
  
  /** Nonce authority (platform authority) */
  nonceAuthorityPubkey: PublicKey;
  
  /** Unique swap identifier */
  swapId: string;
  
  /** Treasury PDA for fee collection */
  treasuryPDA: PublicKey;
  
  /** Escrow program ID */
  programId: PublicKey;
}

export interface BuiltTransaction {
  /** Serialized transaction (base64) */
  serializedTransaction: string;
  
  /** Current nonce value used */
  nonceValue: string;
  
  /** Required signers (partial signatures already applied) */
  requiredSigners: string[];
  
  /** Transaction size in bytes */
  sizeBytes: number;
  
  /** Estimated compute units */
  estimatedComputeUnits: number;
}

export class TransactionBuilder {
  private connection: Connection;
  private platformAuthority: Keypair;
  
  // Maximum transaction size (Solana limit is 1232 bytes)
  private static readonly MAX_TRANSACTION_SIZE = 1200; // Leave buffer
  
  // Compute unit estimates
  private static readonly BASE_COMPUTE_UNITS = 5000;
  private static readonly TRANSFER_COMPUTE_UNITS = 10000;
  private static readonly CNFT_TRANSFER_COMPUTE_UNITS = 50000;
  
  constructor(connection: Connection, platformAuthority: Keypair) {
    this.connection = connection;
    this.platformAuthority = platformAuthority;
    
    console.log('[TransactionBuilder] Initialized with platform authority:', platformAuthority.publicKey.toBase58());
  }
  
  /**
   * Build complete atomic swap transaction
   */
  async buildSwapTransaction(inputs: TransactionBuildInputs): Promise<BuiltTransaction> {
    console.log('[TransactionBuilder] Building swap transaction:', {
      swapId: inputs.swapId,
      maker: inputs.makerPubkey.toBase58(),
      taker: inputs.takerPubkey.toBase58(),
      makerAssets: inputs.makerAssets.length,
      takerAssets: inputs.takerAssets.length,
      fee: inputs.platformFeeLamports.toString(),
    });
    
    try {
      // Get current nonce value
      const nonceValue = await this.getCurrentNonceValue(inputs.nonceAccountPubkey);
      
      // Create transaction
      const transaction = new Transaction();
      
      // Set transaction properties
      transaction.recentBlockhash = nonceValue;
      transaction.feePayer = inputs.takerPubkey; // Taker pays transaction fee
      
      // 1. Add nonce advance instruction (MUST be first)
      transaction.add(this.createNonceAdvanceInstruction(inputs));
      
      // 2. Create any missing ATAs
      const ataInstructions = await this.createMissingATAInstructions(inputs);
      ataInstructions.forEach((ix) => transaction.add(ix));
      
      // 3. Add maker → taker transfers
      const makerTransfers = await this.createAssetTransferInstructions(
        inputs.makerAssets,
        inputs.makerPubkey,
        inputs.takerPubkey
      );
      makerTransfers.forEach((ix) => transaction.add(ix));
      
      // 4. Add maker SOL transfer (if any)
      if (inputs.makerSolLamports > BigInt(0)) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: inputs.makerPubkey,
            toPubkey: inputs.takerPubkey,
            lamports: Number(inputs.makerSolLamports),
          })
        );
      }
      
      // 5. Add taker → maker transfers
      const takerTransfers = await this.createAssetTransferInstructions(
        inputs.takerAssets,
        inputs.takerPubkey,
        inputs.makerPubkey
      );
      takerTransfers.forEach((ix) => transaction.add(ix));
      
      // 6. Add taker SOL transfer (if any)
      if (inputs.takerSolLamports > BigInt(0)) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: inputs.takerPubkey,
            toPubkey: inputs.makerPubkey,
            lamports: Number(inputs.takerSolLamports),
          })
        );
      }
      
      // 7. Add platform fee collection instruction
      transaction.add(this.createFeeCollectionInstruction(inputs));
      
      // Partially sign with platform authority (for nonce advance)
      transaction.partialSign(this.platformAuthority);
      
      // Serialize transaction
      const serialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      
      const serializedBase64 = serialized.toString('base64');
      
      // Check transaction size
      if (serialized.length > TransactionBuilder.MAX_TRANSACTION_SIZE) {
        throw new Error(
          `Transaction size (${serialized.length} bytes) exceeds maximum (${TransactionBuilder.MAX_TRANSACTION_SIZE} bytes)`
        );
      }
      
      // Estimate compute units
      const estimatedComputeUnits = this.estimateComputeUnits(inputs);
      
      console.log('[TransactionBuilder] Transaction built successfully:', {
        sizeBytes: serialized.length,
        estimatedComputeUnits,
        nonceValue,
      });
      
      return {
        serializedTransaction: serializedBase64,
        nonceValue,
        requiredSigners: [inputs.makerPubkey.toBase58(), inputs.takerPubkey.toBase58()],
        sizeBytes: serialized.length,
        estimatedComputeUnits,
      };
    } catch (error) {
      console.error('[TransactionBuilder] Failed to build transaction:', error);
      throw error;
    }
  }
  
  /**
   * Create nonce advance instruction (must be first in transaction)
   */
  private createNonceAdvanceInstruction(inputs: TransactionBuildInputs): TransactionInstruction {
    return SystemProgram.nonceAdvance({
      noncePubkey: inputs.nonceAccountPubkey,
      authorizedPubkey: inputs.nonceAuthorityPubkey,
    });
  }
  
  /**
   * Create instructions for missing associated token accounts
   */
  private async createMissingATAInstructions(inputs: TransactionBuildInputs): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];
    
    // Check maker NFTs → taker needs ATAs
    for (const asset of inputs.makerAssets) {
      if (asset.type === AssetType.NFT) {
        const mint = new PublicKey(asset.identifier);
        const ata = await getAssociatedTokenAddress(mint, inputs.takerPubkey);
        
        const accountInfo = await this.connection.getAccountInfo(ata);
        if (!accountInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              inputs.takerPubkey, // Payer
              ata,
              inputs.takerPubkey, // Owner
              mint
            )
          );
        }
      }
    }
    
    // Check taker NFTs → maker needs ATAs
    for (const asset of inputs.takerAssets) {
      if (asset.type === AssetType.NFT) {
        const mint = new PublicKey(asset.identifier);
        const ata = await getAssociatedTokenAddress(mint, inputs.makerPubkey);
        
        const accountInfo = await this.connection.getAccountInfo(ata);
        if (!accountInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              inputs.takerPubkey, // Payer (taker always pays)
              ata,
              inputs.makerPubkey, // Owner
              mint
            )
          );
        }
      }
    }
    
    return instructions;
  }
  
  /**
   * Create asset transfer instructions
   */
  private async createAssetTransferInstructions(
    assets: SwapAsset[],
    fromPubkey: PublicKey,
    toPubkey: PublicKey
  ): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];
    
    for (const asset of assets) {
      if (asset.type === AssetType.NFT) {
        // Standard NFT transfer using SPL Token
        const mint = new PublicKey(asset.identifier);
        const fromATA = await getAssociatedTokenAddress(mint, fromPubkey);
        const toATA = await getAssociatedTokenAddress(mint, toPubkey);
        
        instructions.push(
          createTransferInstruction(
            fromATA,
            toATA,
            fromPubkey,
            1 // NFTs always transfer amount of 1
          )
        );
      } else if (asset.type === AssetType.CNFT) {
        // Compressed NFT transfer (placeholder - requires Bubblegum program integration)
        // TODO: Implement actual cNFT transfer using Metaplex Bubblegum
        console.warn('[TransactionBuilder] cNFT transfer not yet implemented:', asset.identifier);
        
        // For now, throw error to indicate unsupported
        throw new Error('cNFT transfers not yet implemented');
      }
    }
    
    return instructions;
  }
  
  /**
   * Create platform fee collection instruction
   */
  private createFeeCollectionInstruction(inputs: TransactionBuildInputs): TransactionInstruction {
    // Fee collection: Transfer from taker to treasury PDA
    return SystemProgram.transfer({
      fromPubkey: inputs.takerPubkey,
      toPubkey: inputs.treasuryPDA,
      lamports: Number(inputs.platformFeeLamports),
    });
  }
  
  /**
   * Get current nonce value from nonce account
   */
  private async getCurrentNonceValue(nonceAccountPubkey: PublicKey): Promise<string> {
    const accountInfo = await this.connection.getAccountInfo(nonceAccountPubkey);
    
    if (!accountInfo) {
      throw new Error(`Nonce account ${nonceAccountPubkey.toBase58()} not found`);
    }
    
    // Parse nonce account data using Solana's NonceAccount parser
    // The nonce account stores the blockhash that should be used for durable transactions
    const nonceAccount = NonceAccount.fromAccountData(accountInfo.data);
    
    // Return the stored blockhash (not the nonce value!)
    return nonceAccount.nonce;
  }
  
  /**
   * Estimate compute units for transaction
   */
  private estimateComputeUnits(inputs: TransactionBuildInputs): number {
    let units = TransactionBuilder.BASE_COMPUTE_UNITS;
    
    // NFT transfers
    const nftCount = inputs.makerAssets.filter((a) => a.type === AssetType.NFT).length +
      inputs.takerAssets.filter((a) => a.type === AssetType.NFT).length;
    units += nftCount * TransactionBuilder.TRANSFER_COMPUTE_UNITS;
    
    // cNFT transfers (more expensive)
    const cnftCount = inputs.makerAssets.filter((a) => a.type === AssetType.CNFT).length +
      inputs.takerAssets.filter((a) => a.type === AssetType.CNFT).length;
    units += cnftCount * TransactionBuilder.CNFT_TRANSFER_COMPUTE_UNITS;
    
    // SOL transfers
    if (inputs.makerSolLamports > BigInt(0)) {
      units += 1000;
    }
    if (inputs.takerSolLamports > BigInt(0)) {
      units += 1000;
    }
    
    // Fee collection
    units += 1000;
    
    return units;
  }
  
  /**
   * Validate transaction inputs
   */
  validateInputs(inputs: TransactionBuildInputs): void {
    if (!inputs.makerPubkey) {
      throw new Error('Maker public key is required');
    }
    
    if (!inputs.takerPubkey) {
      throw new Error('Taker public key is required');
    }
    
    if (inputs.makerPubkey.equals(inputs.takerPubkey)) {
      throw new Error('Maker and taker cannot be the same');
    }
    
    if (inputs.makerAssets.length === 0 && inputs.makerSolLamports === BigInt(0)) {
      throw new Error('Maker must offer at least one asset or SOL');
    }
    
    if (inputs.takerAssets.length === 0 && inputs.takerSolLamports === BigInt(0)) {
      throw new Error('Taker must offer at least one asset or SOL');
    }
    
    if (inputs.platformFeeLamports < BigInt(0)) {
      throw new Error('Platform fee cannot be negative');
    }
    
    // Check total asset count (to prevent oversized transactions)
    const totalAssets = inputs.makerAssets.length + inputs.takerAssets.length;
    if (totalAssets > 10) {
      throw new Error(`Too many assets (${totalAssets}). Maximum is 10 per swap.`);
    }
  }
}

/**
 * Create transaction builder instance
 */
export function createTransactionBuilder(
  connection: Connection,
  platformAuthority: Keypair
): TransactionBuilder {
  return new TransactionBuilder(connection, platformAuthority);
}

