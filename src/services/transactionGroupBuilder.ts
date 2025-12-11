/**
 * Transaction Group Builder Service
 * 
 * Handles bulk cNFT swap transaction splitting and Jito bundle management.
 * 
 * Key features:
 * - Splits bulk swaps into groups of 1-2 cNFTs per transaction (conservative approach)
 * - Uses single transactions for 1-2 total cNFTs (no bundle overhead)
 * - Uses Jito bundles for 3+ total cNFTs for atomic execution
 * - Smart ordering: payments first → NFT transfers → SOL cleanup
 * - Integrates with Address Lookup Tables (ALTs) for size optimization
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
  SystemProgram,
  NonceAccount,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { AssetType } from './assetValidator';
import { TransactionBuilder, SwapAsset, TransactionBuildInputs, BuiltTransaction } from './transactionBuilder';
import { ALTService, TransactionSizeEstimate } from './altService';
import { CnftService, createCnftService } from './cnftService';
import { DirectBubblegumService, createDirectBubblegumService } from './directBubblegumService';

// Conservative limits for transaction splitting
const MAX_CNFTS_PER_TRANSACTION = 2; // Conservative: 1-2 cNFTs per transaction
const JITO_BUNDLE_THRESHOLD = 3; // Use Jito bundles for 3+ total cNFTs
const MAX_TRANSACTIONS_PER_BUNDLE = 5; // Jito limit

// cNFT swaps ALWAYS need Jito bundles because proof nodes don't fit in single tx
const CNFT_ALWAYS_NEEDS_BUNDLE = true;

/**
 * Strategy for executing a swap based on asset composition
 */
export enum SwapStrategy {
  /** Single transaction, no bundle needed (no cNFTs or cNFT with full canopy) */
  SINGLE_TRANSACTION = 'SINGLE_TRANSACTION',
  /** Direct Bubblegum bundle - bypasses escrow program for cNFT+SOL swaps */
  DIRECT_BUBBLEGUM_BUNDLE = 'DIRECT_BUBBLEGUM_BUNDLE',
  /** Multiple transactions with Jito bundle for atomicity (bulk cNFTs) */
  JITO_BUNDLE = 'JITO_BUNDLE',
  /** Cannot fit even with splitting (rare edge case) */
  CANNOT_FIT = 'CANNOT_FIT',
}

/**
 * Analysis result for swap assets
 */
export interface SwapAnalysis {
  /** Total cNFTs in the swap */
  totalCnfts: number;
  /** cNFTs from maker */
  makerCnfts: number;
  /** cNFTs from taker */
  takerCnfts: number;
  /** Total standard NFTs */
  totalNfts: number;
  /** Total Core NFTs */
  totalCoreNfts: number;
  /** Whether SOL is involved */
  hasSolTransfer: boolean;
  /** Recommended strategy */
  strategy: SwapStrategy;
  /** Number of transactions required */
  transactionCount: number;
  /** Reason for strategy selection */
  reason: string;
}

/**
 * A single transaction in a group
 */
export interface TransactionGroupItem {
  /** Transaction index in the group (0-based) */
  index: number;
  /** Transaction purpose description */
  purpose: string;
  /** Assets transferred in this transaction */
  assets: {
    makerAssets: SwapAsset[];
    takerAssets: SwapAsset[];
    makerSolLamports: bigint;
    takerSolLamports: bigint;
    platformFeeLamports: bigint;
  };
  /** Built transaction (populated after building) */
  transaction?: BuiltTransaction;
  /** Whether this is a versioned transaction */
  isVersioned: boolean;
}

/**
 * Result of building a transaction group
 */
export interface TransactionGroupResult {
  /** Strategy used */
  strategy: SwapStrategy;
  /** Analysis of the swap */
  analysis: SwapAnalysis;
  /** Individual transactions in the group */
  transactions: TransactionGroupItem[];
  /** Total number of transactions */
  transactionCount: number;
  /** Whether Jito bundle is required */
  requiresJitoBundle: boolean;
  /** Estimated total size across all transactions */
  totalSizeBytes: number;
  /** Nonce value used (same for all transactions in bundle) */
  nonceValue: string;
}

/**
 * Input for building a transaction group
 */
export interface TransactionGroupInput extends TransactionBuildInputs {
  /** Force single transaction (will fail if assets exceed limit) */
  forceSingleTransaction?: boolean;
}

export class TransactionGroupBuilder {
  private connection: Connection;
  private platformAuthority: Keypair;
  private transactionBuilder: TransactionBuilder;
  private altService: ALTService | null = null;
  private cnftService: CnftService;
  private directBubblegumService: DirectBubblegumService;
  private treasuryPda: PublicKey | null = null;
  
  constructor(
    connection: Connection,
    platformAuthority: Keypair,
    treasuryPda?: PublicKey,
    altService?: ALTService
  ) {
    this.connection = connection;
    this.platformAuthority = platformAuthority;
    this.transactionBuilder = new TransactionBuilder(connection, platformAuthority, treasuryPda);
    this.cnftService = createCnftService(connection);
    this.directBubblegumService = createDirectBubblegumService(connection);
    this.treasuryPda = treasuryPda || null;
    
    if (altService) {
      this.altService = altService;
      this.transactionBuilder.setALTService(altService);
    }
    
    console.log('[TransactionGroupBuilder] Initialized');
    console.log('[TransactionGroupBuilder] Platform Authority:', platformAuthority.publicKey.toBase58());
    console.log('[TransactionGroupBuilder] Treasury PDA:', treasuryPda?.toBase58() || 'not set');
    console.log('[TransactionGroupBuilder] ALT Service:', altService ? 'enabled' : 'disabled');
    console.log('[TransactionGroupBuilder] Direct Bubblegum Service: enabled');
  }
  
  /**
   * Analyze swap assets and determine the best execution strategy
   */
  analyzeSwap(inputs: TransactionGroupInput): SwapAnalysis {
    // DEBUG: Log all asset types for troubleshooting
    console.log('[TransactionGroupBuilder] analyzeSwap - makerAssets:', JSON.stringify(inputs.makerAssets));
    console.log('[TransactionGroupBuilder] analyzeSwap - takerAssets:', JSON.stringify(inputs.takerAssets));
    console.log('[TransactionGroupBuilder] analyzeSwap - AssetType.CNFT value:', AssetType.CNFT);
    
    const makerCnfts = inputs.makerAssets.filter(a => {
      const isCnft = a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft';
      console.log(`[TransactionGroupBuilder] makerAsset type="${a.type}", isCnft=${isCnft}`);
      return isCnft;
    }).length;
    
    const takerCnfts = inputs.takerAssets.filter(a => {
      const isCnft = a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft';
      console.log(`[TransactionGroupBuilder] takerAsset type="${a.type}", isCnft=${isCnft}`);
      return isCnft;
    }).length;
    
    const totalCnfts = makerCnfts + takerCnfts;
    console.log(`[TransactionGroupBuilder] cNFT counts: maker=${makerCnfts}, taker=${takerCnfts}, total=${totalCnfts}`);
    
    const totalNfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.NFT || String(a.type).toLowerCase() === 'nft'
    ).length + inputs.takerAssets.filter(a => 
      a.type === AssetType.NFT || String(a.type).toLowerCase() === 'nft'
    ).length;
    
    const totalCoreNfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.CORE_NFT || String(a.type).toLowerCase() === 'core_nft'
    ).length + inputs.takerAssets.filter(a => 
      a.type === AssetType.CORE_NFT || String(a.type).toLowerCase() === 'core_nft'
    ).length;
    
    const hasSolTransfer = inputs.makerSolLamports > BigInt(0) || inputs.takerSolLamports > BigInt(0);
    
    // Determine strategy
    let strategy: SwapStrategy;
    let transactionCount: number;
    let reason: string;
    
    if (inputs.forceSingleTransaction) {
      // User explicitly requested single transaction
      if (totalCnfts > 0) {
        // cNFT swaps with proof nodes CANNOT fit in single transaction
        strategy = SwapStrategy.CANNOT_FIT;
        transactionCount = 0;
        reason = `cNFT swaps require Jito bundles (proof nodes exceed single tx size limit)`;
      } else if (totalCnfts > MAX_CNFTS_PER_TRANSACTION) {
        strategy = SwapStrategy.CANNOT_FIT;
        transactionCount = 0;
        reason = `Cannot fit ${totalCnfts} cNFTs in single transaction (max ${MAX_CNFTS_PER_TRANSACTION})`;
      } else {
        strategy = SwapStrategy.SINGLE_TRANSACTION;
        transactionCount = 1;
        reason = 'Forced single transaction';
      }
    } else if (totalCnfts === 0) {
      // No cNFTs - single transaction
      strategy = SwapStrategy.SINGLE_TRANSACTION;
      transactionCount = 1;
      reason = 'No cNFTs - standard single transaction';
    } else if (totalCnfts === 1 && (totalNfts === 0 && totalCoreNfts === 0)) {
      // Single cNFT swap (cNFT↔SOL) - use direct Bubblegum bundle
      // This bypasses our escrow program and uses Bubblegum directly
      // Tx1: SOL transfers, Tx2: cNFT transfer via Bubblegum
      strategy = SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE;
      transactionCount = 2;
      reason = 'Single cNFT swap uses direct Bubblegum bundle (proof nodes require separate tx)';
    } else if (totalCnfts >= 1) {
      // Multiple cNFTs or mixed assets - use Jito bundle with direct Bubblegum
      // Calculate: 1 tx per cNFT + 1 tx for SOL/fee if applicable
      // Note: We need a SOL tx if there's SOL transfer OR platform fee
      const cnftTxCount = totalCnfts;
      const needsSolTx = hasSolTransfer || inputs.platformFeeLamports > BigInt(0);
      transactionCount = cnftTxCount + (needsSolTx ? 1 : 0);
      
      // Check if we exceed Jito's bundle limit
      if (transactionCount > MAX_TRANSACTIONS_PER_BUNDLE) {
        strategy = SwapStrategy.CANNOT_FIT;
        reason = `${totalCnfts} cNFTs would require ${transactionCount} transactions, exceeding Jito's ${MAX_TRANSACTIONS_PER_BUNDLE} limit`;
      } else {
        strategy = SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE;
        reason = `${totalCnfts} cNFT(s) using direct Bubblegum bundle (${transactionCount} transactions)`;
      }
    } else {
      // Fallback (shouldn't reach here with current logic)
      strategy = SwapStrategy.SINGLE_TRANSACTION;
      transactionCount = 1;
      reason = 'Default single transaction';
    }
    
    const analysis: SwapAnalysis = {
      totalCnfts,
      makerCnfts,
      takerCnfts,
      totalNfts,
      totalCoreNfts,
      hasSolTransfer,
      strategy,
      transactionCount,
      reason,
    };
    
    console.log('[TransactionGroupBuilder] Swap analysis:', analysis);
    
    return analysis;
  }
  
  /**
   * Build transaction group for a bulk swap
   */
  async buildTransactionGroup(inputs: TransactionGroupInput): Promise<TransactionGroupResult> {
    console.log('[TransactionGroupBuilder] Building transaction group:', {
      swapId: inputs.swapId,
      makerAssets: inputs.makerAssets.length,
      takerAssets: inputs.takerAssets.length,
      makerSol: inputs.makerSolLamports.toString(),
      takerSol: inputs.takerSolLamports.toString(),
    });
    
    // Analyze the swap
    const analysis = this.analyzeSwap(inputs);
    
    if (analysis.strategy === SwapStrategy.CANNOT_FIT) {
      throw new Error(`Swap cannot be executed: ${analysis.reason}`);
    }
    
    // Get nonce value (same for all transactions in the group)
    const nonceValue = await this.getNonceValue(inputs.nonceAccountPubkey);
    
    if (analysis.strategy === SwapStrategy.SINGLE_TRANSACTION) {
      // Single transaction - use existing TransactionBuilder
      return this.buildSingleTransaction(inputs, analysis, nonceValue);
    } else if (analysis.strategy === SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE) {
      // Direct Bubblegum bundle - bypasses escrow program for cNFT swaps
      return this.buildDirectBubblegumBundle(inputs, analysis, nonceValue);
    } else {
      // Multiple transactions - split and prepare for Jito bundle
      return this.buildMultipleTransactions(inputs, analysis, nonceValue);
    }
  }
  
  /**
   * Build a single transaction (for simple swaps)
   */
  private async buildSingleTransaction(
    inputs: TransactionGroupInput,
    analysis: SwapAnalysis,
    nonceValue: string
  ): Promise<TransactionGroupResult> {
    console.log('[TransactionGroupBuilder] Building single transaction');
    
    // Use existing TransactionBuilder
    const builtTx = await this.transactionBuilder.buildSwapTransaction(inputs);
    
    const transactionItem: TransactionGroupItem = {
      index: 0,
      purpose: 'Complete atomic swap',
      assets: {
        makerAssets: inputs.makerAssets,
        takerAssets: inputs.takerAssets,
        makerSolLamports: inputs.makerSolLamports,
        takerSolLamports: inputs.takerSolLamports,
        platformFeeLamports: inputs.platformFeeLamports,
      },
      transaction: builtTx,
      isVersioned: builtTx.isVersioned || false,
    };
    
    return {
      strategy: SwapStrategy.SINGLE_TRANSACTION,
      analysis,
      transactions: [transactionItem],
      transactionCount: 1,
      requiresJitoBundle: false,
      totalSizeBytes: builtTx.sizeBytes,
      nonceValue,
    };
  }
  
  /**
   * Build direct Bubblegum bundle for cNFT swaps
   * 
   * This bypasses our escrow program and creates:
   * - Tx1: SOL transfers (payment + platform fee) via SystemProgram
   * - Tx2+: cNFT transfers via Bubblegum directly (with proof nodes)
   * 
   * Used for cNFT↔SOL and cNFT↔cNFT swaps where proof nodes don't fit in single tx
   */
  private async buildDirectBubblegumBundle(
    inputs: TransactionGroupInput,
    analysis: SwapAnalysis,
    nonceValue: string
  ): Promise<TransactionGroupResult> {
    console.log('[TransactionGroupBuilder] Building direct Bubblegum bundle for cNFT swap');
    
    if (!this.treasuryPda) {
      throw new Error('Treasury PDA required for direct Bubblegum bundles');
    }
    
    const transactions: TransactionGroupItem[] = [];
    let totalSizeBytes = 0;
    
    // Note: All transactions use nonceValue for durable nonce consistency
    
    // Collect all cNFT assets
    const makerCnfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    const takerCnfts = inputs.takerAssets.filter(a => 
      a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    
    // === Transaction 1: SOL transfers ===
    // This handles: maker SOL → taker, taker SOL → maker, platform fee → treasury
    if (analysis.hasSolTransfer || inputs.platformFeeLamports > BigInt(0)) {
      console.log('[TransactionGroupBuilder] Building Tx1: SOL transfers');
      
      const solInstructions: TransactionInstruction[] = [];
      
      // Nonce advance instruction (for durable nonce)
      solInstructions.push(
        SystemProgram.nonceAdvance({
          noncePubkey: inputs.nonceAccountPubkey,
          authorizedPubkey: this.platformAuthority.publicKey,
        })
      );
      
      // Maker sends SOL to taker (if any)
      if (inputs.makerSolLamports > BigInt(0)) {
        solInstructions.push(
          SystemProgram.transfer({
            fromPubkey: inputs.makerPubkey,
            toPubkey: inputs.takerPubkey,
            lamports: inputs.makerSolLamports,
          })
        );
      }
      
      // Taker sends SOL to maker (minus platform fee)
      if (inputs.takerSolLamports > BigInt(0)) {
        const takerToMaker = inputs.takerSolLamports - inputs.platformFeeLamports;
        if (takerToMaker > BigInt(0)) {
          solInstructions.push(
            SystemProgram.transfer({
              fromPubkey: inputs.takerPubkey,
              toPubkey: inputs.makerPubkey,
              lamports: takerToMaker,
            })
          );
        }
      }
      
      // Platform fee to treasury
      if (inputs.platformFeeLamports > BigInt(0)) {
        // Determine fee payer:
        // 1. If taker sends SOL, fee comes from taker's SOL payment
        // 2. If maker sends SOL, fee comes from maker's SOL payment
        // 3. For pure cNFT-for-cNFT swaps (no SOL), maker pays fee (initiator)
        let feePayer: PublicKey;
        if (inputs.takerSolLamports > BigInt(0)) {
          feePayer = inputs.takerPubkey;
        } else if (inputs.makerSolLamports > BigInt(0)) {
          feePayer = inputs.makerPubkey;
        } else {
          // Pure cNFT-for-cNFT swap with fixed fee - maker pays
          feePayer = inputs.makerPubkey;
          console.log('[TransactionGroupBuilder] cNFT-for-cNFT swap: maker pays platform fee');
        }
        
        solInstructions.push(
          SystemProgram.transfer({
            fromPubkey: feePayer,
            toPubkey: this.treasuryPda,
            lamports: inputs.platformFeeLamports,
          })
        );
      }
      
      // Build SOL transaction using nonce value for durable nonce consistency
      // All transactions in the bundle must use the same blockhash approach
      const solTx = new Transaction({
        recentBlockhash: nonceValue, // Use nonce for durable tx (matches cNFT transactions)
        feePayer: this.platformAuthority.publicKey,
      }).add(...solInstructions);
      
      // Partial sign with platform authority
      solTx.partialSign(this.platformAuthority);
      
      const solTxSerialized = solTx.serialize({ requireAllSignatures: false });
      const solTxSize = solTxSerialized.length;
      
      transactions.push({
        index: 0,
        purpose: 'SOL transfers + platform fee',
        assets: {
          makerAssets: [],
          takerAssets: [],
          makerSolLamports: inputs.makerSolLamports,
          takerSolLamports: inputs.takerSolLamports,
          platformFeeLamports: inputs.platformFeeLamports,
        },
        transaction: {
          serializedTransaction: solTxSerialized.toString('base64'),
          sizeBytes: solTxSize,
          isVersioned: false,
          nonceValue,
          estimatedComputeUnits: 50000, // SOL transfers are simple
          requiredSigners: [
            inputs.makerPubkey.toBase58(),
            inputs.takerPubkey.toBase58(),
          ],
        },
        isVersioned: false,
      });
      
      totalSizeBytes += solTxSize;
      console.log(`[TransactionGroupBuilder] Tx1 (SOL) built: ${solTxSize} bytes`);
    }
    
    // === Transaction 2+: cNFT transfers via direct Bubblegum ===
    // Each cNFT gets its own transaction (proof nodes require significant space)
    let txIndex = transactions.length;
    
    // Maker cNFT → Taker
    for (const cnft of makerCnfts) {
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: Maker cNFT transfer`);
      
      const transferResult = await this.directBubblegumService.buildTransferInstruction({
        assetId: cnft.identifier,
        fromWallet: inputs.makerPubkey,
        toWallet: inputs.takerPubkey,
      });
      
      // Build transaction with nonce advance
      const cnftInstructions: TransactionInstruction[] = [];
      
      // Nonce advance for durability
      cnftInstructions.push(
        SystemProgram.nonceAdvance({
          noncePubkey: inputs.nonceAccountPubkey,
          authorizedPubkey: this.platformAuthority.publicKey,
        })
      );
      
      cnftInstructions.push(transferResult.instruction);
      
      const cnftTx = new Transaction({
        recentBlockhash: nonceValue, // Use nonce for durable tx
        feePayer: this.platformAuthority.publicKey,
      }).add(...cnftInstructions);
      
      // Partial sign with platform authority
      cnftTx.partialSign(this.platformAuthority);
      
      const cnftTxSerialized = cnftTx.serialize({ requireAllSignatures: false });
      const cnftTxSize = cnftTxSerialized.length;
      
      transactions.push({
        index: txIndex,
        purpose: `Maker cNFT transfer (${cnft.identifier.substring(0, 8)}...)`,
        assets: {
          makerAssets: [cnft],
          takerAssets: [],
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: cnftTxSerialized.toString('base64'),
          sizeBytes: cnftTxSize,
          isVersioned: false,
          nonceValue,
          estimatedComputeUnits: 200000, // cNFT transfers with proof are expensive
          requiredSigners: [inputs.makerPubkey.toBase58()],
        },
        isVersioned: false,
      });
      
      totalSizeBytes += cnftTxSize;
      txIndex++;
      console.log(`[TransactionGroupBuilder] cNFT tx built: ${cnftTxSize} bytes, ${transferResult.proofNodes.length} proof nodes`);
    }
    
    // Taker cNFT → Maker
    for (const cnft of takerCnfts) {
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: Taker cNFT transfer`);
      
      const transferResult = await this.directBubblegumService.buildTransferInstruction({
        assetId: cnft.identifier,
        fromWallet: inputs.takerPubkey,
        toWallet: inputs.makerPubkey,
      });
      
      // Build transaction with nonce advance
      const cnftInstructions: TransactionInstruction[] = [];
      
      cnftInstructions.push(
        SystemProgram.nonceAdvance({
          noncePubkey: inputs.nonceAccountPubkey,
          authorizedPubkey: this.platformAuthority.publicKey,
        })
      );
      
      cnftInstructions.push(transferResult.instruction);
      
      const cnftTx = new Transaction({
        recentBlockhash: nonceValue,
        feePayer: this.platformAuthority.publicKey,
      }).add(...cnftInstructions);
      
      cnftTx.partialSign(this.platformAuthority);
      
      const cnftTxSerialized = cnftTx.serialize({ requireAllSignatures: false });
      const cnftTxSize = cnftTxSerialized.length;
      
      transactions.push({
        index: txIndex,
        purpose: `Taker cNFT transfer (${cnft.identifier.substring(0, 8)}...)`,
        assets: {
          makerAssets: [],
          takerAssets: [cnft],
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: cnftTxSerialized.toString('base64'),
          sizeBytes: cnftTxSize,
          isVersioned: false,
          nonceValue,
          estimatedComputeUnits: 200000, // cNFT transfers with proof are expensive
          requiredSigners: [inputs.takerPubkey.toBase58()],
        },
        isVersioned: false,
      });
      
      totalSizeBytes += cnftTxSize;
      txIndex++;
      console.log(`[TransactionGroupBuilder] cNFT tx built: ${cnftTxSize} bytes, ${transferResult.proofNodes.length} proof nodes`);
    }
    
    console.log(`[TransactionGroupBuilder] Direct Bubblegum bundle complete:`, {
      transactionCount: transactions.length,
      totalSizeBytes,
      makerCnfts: makerCnfts.length,
      takerCnfts: takerCnfts.length,
    });
    
    return {
      strategy: SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE,
      analysis,
      transactions,
      transactionCount: transactions.length,
      requiresJitoBundle: true,
      totalSizeBytes,
      nonceValue,
    };
  }
  
  /**
   * Build multiple transactions for bulk swap (for Jito bundle)
   */
  private async buildMultipleTransactions(
    inputs: TransactionGroupInput,
    analysis: SwapAnalysis,
    nonceValue: string
  ): Promise<TransactionGroupResult> {
    console.log('[TransactionGroupBuilder] Building multiple transactions for Jito bundle');
    
    // Split assets into transaction groups
    const transactionGroups = this.splitAssetsIntoGroups(inputs, analysis);
    
    console.log(`[TransactionGroupBuilder] Split into ${transactionGroups.length} transaction groups`);
    
    const transactions: TransactionGroupItem[] = [];
    let totalSizeBytes = 0;
    
    // Build each transaction
    for (let i = 0; i < transactionGroups.length; i++) {
      const group = transactionGroups[i];
      
      console.log(`[TransactionGroupBuilder] Building transaction ${i + 1}/${transactionGroups.length}:`, {
        makerAssets: group.makerAssets.length,
        takerAssets: group.takerAssets.length,
        makerSol: group.makerSolLamports.toString(),
        takerSol: group.takerSolLamports.toString(),
        fee: group.platformFeeLamports.toString(),
      });
      
      // Create inputs for this transaction
      const txInputs: TransactionBuildInputs = {
        ...inputs,
        makerAssets: group.makerAssets,
        takerAssets: group.takerAssets,
        makerSolLamports: group.makerSolLamports,
        takerSolLamports: group.takerSolLamports,
        platformFeeLamports: group.platformFeeLamports,
        swapId: `${inputs.swapId}_${i}`, // Unique ID for each transaction
      };
      
      // Build the transaction
      const builtTx = await this.transactionBuilder.buildSwapTransaction(txInputs);
      
      const transactionItem: TransactionGroupItem = {
        index: i,
        purpose: group.purpose,
        assets: {
          makerAssets: group.makerAssets,
          takerAssets: group.takerAssets,
          makerSolLamports: group.makerSolLamports,
          takerSolLamports: group.takerSolLamports,
          platformFeeLamports: group.platformFeeLamports,
        },
        transaction: builtTx,
        isVersioned: builtTx.isVersioned || false,
      };
      
      transactions.push(transactionItem);
      totalSizeBytes += builtTx.sizeBytes;
    }
    
    return {
      strategy: SwapStrategy.JITO_BUNDLE,
      analysis,
      transactions,
      transactionCount: transactions.length,
      requiresJitoBundle: true,
      totalSizeBytes,
      nonceValue,
    };
  }
  
  /**
   * Split assets into transaction groups with smart ordering
   * 
   * Order: payments first → NFT transfers → SOL cleanup
   */
  private splitAssetsIntoGroups(
    inputs: TransactionGroupInput,
    analysis: SwapAnalysis
  ): Array<{
    makerAssets: SwapAsset[];
    takerAssets: SwapAsset[];
    makerSolLamports: bigint;
    takerSolLamports: bigint;
    platformFeeLamports: bigint;
    purpose: string;
  }> {
    const groups: Array<{
      makerAssets: SwapAsset[];
      takerAssets: SwapAsset[];
      makerSolLamports: bigint;
      takerSolLamports: bigint;
      platformFeeLamports: bigint;
      purpose: string;
    }> = [];
    
    // Separate assets by type
    const makerCnfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    const takerCnfts = inputs.takerAssets.filter(a => 
      a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    const makerOther = inputs.makerAssets.filter(a => 
      a.type !== AssetType.CNFT && String(a.type).toLowerCase() !== 'cnft'
    );
    const takerOther = inputs.takerAssets.filter(a => 
      a.type !== AssetType.CNFT && String(a.type).toLowerCase() !== 'cnft'
    );
    
    // Track remaining SOL and fees
    let remainingMakerSol = inputs.makerSolLamports;
    let remainingTakerSol = inputs.takerSolLamports;
    let remainingFee = inputs.platformFeeLamports;
    
    // Group cNFTs (1-2 per transaction)
    const allCnfts: { asset: SwapAsset; side: 'maker' | 'taker' }[] = [
      ...makerCnfts.map(a => ({ asset: a, side: 'maker' as const })),
      ...takerCnfts.map(a => ({ asset: a, side: 'taker' as const })),
    ];
    
    // Create groups of 1-2 cNFTs
    for (let i = 0; i < allCnfts.length; i += MAX_CNFTS_PER_TRANSACTION) {
      const chunk = allCnfts.slice(i, i + MAX_CNFTS_PER_TRANSACTION);
      
      const groupMakerAssets: SwapAsset[] = chunk
        .filter(c => c.side === 'maker')
        .map(c => c.asset);
      const groupTakerAssets: SwapAsset[] = chunk
        .filter(c => c.side === 'taker')
        .map(c => c.asset);
      
      // First transaction gets non-cNFT assets and SOL
      const isFirstGroup = groups.length === 0;
      // Last cNFT transaction gets the platform fee
      const isLastCnftGroup = i + MAX_CNFTS_PER_TRANSACTION >= allCnfts.length;
      
      const group = {
        makerAssets: isFirstGroup ? [...groupMakerAssets, ...makerOther] : groupMakerAssets,
        takerAssets: isFirstGroup ? [...groupTakerAssets, ...takerOther] : groupTakerAssets,
        makerSolLamports: isFirstGroup ? remainingMakerSol : BigInt(0),
        takerSolLamports: isFirstGroup ? remainingTakerSol : BigInt(0),
        platformFeeLamports: isLastCnftGroup ? remainingFee : BigInt(0),
        purpose: this.describePurpose(chunk, isFirstGroup, isLastCnftGroup),
      };
      
      // Mark SOL as used if included in first group
      if (isFirstGroup) {
        remainingMakerSol = BigInt(0);
        remainingTakerSol = BigInt(0);
      }
      
      // Mark fee as used if included in last group
      if (isLastCnftGroup) {
        remainingFee = BigInt(0);
      }
      
      groups.push(group);
    }
    
    // If no cNFTs but other assets, create a single group
    if (groups.length === 0 && (makerOther.length > 0 || takerOther.length > 0 || analysis.hasSolTransfer)) {
      groups.push({
        makerAssets: makerOther,
        takerAssets: takerOther,
        makerSolLamports: remainingMakerSol,
        takerSolLamports: remainingTakerSol,
        platformFeeLamports: remainingFee,
        purpose: 'Standard NFT and SOL transfer',
      });
    }
    
    return groups;
  }
  
  /**
   * Generate a description for a transaction purpose
   */
  private describePurpose(
    chunk: { asset: SwapAsset; side: 'maker' | 'taker' }[],
    isFirst: boolean,
    isLast: boolean
  ): string {
    const parts: string[] = [];
    
    const makerCount = chunk.filter(c => c.side === 'maker').length;
    const takerCount = chunk.filter(c => c.side === 'taker').length;
    
    if (makerCount > 0) {
      parts.push(`${makerCount} maker cNFT(s)`);
    }
    if (takerCount > 0) {
      parts.push(`${takerCount} taker cNFT(s)`);
    }
    
    if (isFirst) {
      parts.push('+ SOL transfers');
    }
    if (isLast) {
      parts.push('+ platform fee');
    }
    
    return parts.join(', ') || 'Empty transaction';
  }
  
  /**
   * Get current nonce value from nonce account
   */
  private async getNonceValue(nonceAccountPubkey: PublicKey): Promise<string> {
    const accountInfo = await this.connection.getAccountInfo(nonceAccountPubkey);
    
    if (!accountInfo) {
      throw new Error(`Nonce account ${nonceAccountPubkey.toBase58()} not found`);
    }
    
    const nonceAccount = NonceAccount.fromAccountData(accountInfo.data);
    return nonceAccount.nonce;
  }
  
  /**
   * Validate inputs before building
   */
  validateInputs(inputs: TransactionGroupInput): void {
    // Use base TransactionBuilder validation
    this.transactionBuilder.validateInputs(inputs);
    
    // Additional group-specific validation
    const analysis = this.analyzeSwap(inputs);
    
    if (analysis.strategy === SwapStrategy.CANNOT_FIT) {
      throw new Error(`Bulk swap validation failed: ${analysis.reason}`);
    }
  }
  
  /**
   * Get the underlying TransactionBuilder
   */
  getTransactionBuilder(): TransactionBuilder {
    return this.transactionBuilder;
  }
  
  /**
   * Get the ALT service
   */
  getALTService(): ALTService | null {
    return this.altService;
  }
  
  /**
   * Check if a swap requires Jito bundle
   */
  requiresJitoBundle(inputs: TransactionGroupInput): boolean {
    const analysis = this.analyzeSwap(inputs);
    return analysis.strategy === SwapStrategy.JITO_BUNDLE || 
           analysis.strategy === SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE;
  }
  
  /**
   * Estimate the number of transactions needed for a swap
   */
  estimateTransactionCount(inputs: TransactionGroupInput): number {
    const analysis = this.analyzeSwap(inputs);
    return analysis.transactionCount;
  }
}

/**
 * Create TransactionGroupBuilder instance
 */
export function createTransactionGroupBuilder(
  connection: Connection,
  platformAuthority: Keypair,
  treasuryPda?: PublicKey,
  altService?: ALTService
): TransactionGroupBuilder {
  return new TransactionGroupBuilder(connection, platformAuthority, treasuryPda, altService);
}

