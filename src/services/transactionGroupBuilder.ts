/**
 * Transaction Group Builder Service
 * 
 * Handles bulk NFT swap transaction splitting and Jito bundle management.
 * Supports ALL NFT types: SPL NFTs, cNFTs, and Core NFTs.
 * 
 * Key features:
 * - Uses Jito bundles for 3+ total NFTs of ANY type for atomic execution
 * - Splits bulk swaps into optimal transaction groups
 * - Smart ordering: payments first → NFT transfers → SOL cleanup
 * - Integrates with Address Lookup Tables (ALTs) for size optimization
 * - Direct transfers bypass escrow program limitations
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
  ComputeBudgetProgram,
  NonceAccount,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { AssetType } from './assetValidator';
import { TransactionBuilder, SwapAsset, TransactionBuildInputs, BuiltTransaction } from './transactionBuilder';
import { ALTService, TransactionSizeEstimate } from './altService';
import { CnftService, createCnftService } from './cnftService';
import { DirectBubblegumService, createDirectBubblegumService } from './directBubblegumService';
import { DirectSplTokenService, createDirectSplTokenService } from './directSplTokenService';
import { DirectCoreNftService, createDirectCoreNftService } from './directCoreNftService';
import { isJitoBundlesEnabled } from '../utils/featureFlags';

// Conservative limits for transaction splitting
// cNFT Merkle proofs are typically large (~350+ bytes per cNFT with proof nodes)
// FIX: Always use 1 cNFT per transaction to avoid "Transaction too large" errors
// The NO_PROOFS constant was causing cNFT x 1 <> cNFT x 3 swaps to fail with 1758 > 1232 bytes
const MAX_CNFTS_PER_TRANSACTION = 1; // Always 1 cNFT per transaction (proofs are almost always needed)
const MAX_SPL_NFTS_PER_TRANSACTION = 5; // SPL NFT transfers are small (~80 bytes each)
const MAX_CORE_NFTS_PER_TRANSACTION = 4; // Core NFT transfers (~100 bytes each)
const JITO_BUNDLE_THRESHOLD = 3; // Use Jito bundles for 3+ total NFTs
const MAX_TRANSACTIONS_PER_BUNDLE = 5; // Jito limit

// cNFT swaps ALWAYS need Jito bundles because proof nodes don't fit in single tx
const CNFT_ALWAYS_NEEDS_BUNDLE = true;

/**
 * Strategy for executing a swap based on asset composition
 */
export enum SwapStrategy {
  /** Single transaction, no bundle needed (1-2 NFTs of any type, uses escrow program) */
  SINGLE_TRANSACTION = 'SINGLE_TRANSACTION',
  /** Direct Bubblegum bundle - bypasses escrow program for cNFT swaps */
  DIRECT_BUBBLEGUM_BUNDLE = 'DIRECT_BUBBLEGUM_BUNDLE',
  /** Direct NFT bundle - bypasses escrow program for bulk SPL/Core NFT swaps */
  DIRECT_NFT_BUNDLE = 'DIRECT_NFT_BUNDLE',
  /** Mixed bundle - handles combination of cNFTs, SPL NFTs, and Core NFTs */
  MIXED_NFT_BUNDLE = 'MIXED_NFT_BUNDLE',
  /** Multiple transactions with Jito bundle for atomicity (legacy) */
  JITO_BUNDLE = 'JITO_BUNDLE',
  /** Cannot fit even with splitting (rare edge case) */
  CANNOT_FIT = 'CANNOT_FIT',
  /** Two-phase delegation flow for swaps exceeding Jito limits or when Jito disabled */
  TWO_PHASE_DELEGATION = 'TWO_PHASE_DELEGATION',
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
  /** Whether this swap requires two-phase delegation flow */
  requiresTwoPhase?: boolean;
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

  // === cNFT JIT rebuild metadata (for sequential RPC execution) ===
  /** cNFT asset ID for JIT rebuild (only set for cNFT transfer transactions) */
  cnftAssetId?: string;
  /** Source wallet for JIT rebuild */
  cnftFromWallet?: string;
  /** Destination wallet for JIT rebuild */
  cnftToWallet?: string;
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
  /** Whether this swap requires two-phase delegation flow */
  requiresTwoPhase?: boolean;
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
  private directSplTokenService: DirectSplTokenService;
  private directCoreNftService: DirectCoreNftService;
  private treasuryPda: PublicKey | null = null;

  // Cache for analyzeSwap results to avoid redundant computation
  // Key: hash of inputs, Value: { analysis, timestamp }
  private swapAnalysisCache: Map<string, { analysis: SwapAnalysis; timestamp: number }> = new Map();
  private static readonly CACHE_TTL_MS = 5000; // 5 second TTL
  private static readonly CACHE_CLEANUP_INTERVAL_MS = 30000; // Clean up every 30 seconds
  private static readonly CACHE_MAX_SIZE = 100; // Max entries before forced cleanup
  private cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;
  private isDisposed = false;
  private shutdownHandler: (() => void) | null = null;

  // Static flag to ensure shutdown handlers are registered only once globally
  // (prevents duplicate listeners if multiple instances are created)
  private static handlersRegistered = false;
  private static registeredInstances: Set<TransactionGroupBuilder> = new Set();

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
    this.directSplTokenService = createDirectSplTokenService(connection);
    this.directCoreNftService = createDirectCoreNftService(connection);
    this.treasuryPda = treasuryPda || null;
    
    if (altService) {
      this.altService = altService;
      this.transactionBuilder.setALTService(altService);
    }
    
    console.log('[TransactionGroupBuilder] Initialized');
    console.log('[TransactionGroupBuilder] Platform Authority:', platformAuthority.publicKey.toBase58());
    console.log('[TransactionGroupBuilder] Treasury PDA:', treasuryPda?.toBase58() || 'not set');
    console.log('[TransactionGroupBuilder] ALT Service:', altService ? 'enabled' : 'disabled');
    console.log('[TransactionGroupBuilder] Direct Services: Bubblegum, SPL Token, Core NFT');

    // Start periodic cache cleanup
    this.startCacheCleanup();

    // Register shutdown handlers for graceful cleanup
    this.registerShutdownHandlers();
  }

  /**
   * Register process shutdown handlers to ensure dispose() is called.
   * Uses static tracking to ensure handlers are registered only once globally,
   * preventing duplicate listeners if multiple instances are created.
   */
  private registerShutdownHandlers(): void {
    // Track this instance for cleanup
    TransactionGroupBuilder.registeredInstances.add(this);

    // Only register global handlers once
    if (TransactionGroupBuilder.handlersRegistered) {
      return;
    }
    TransactionGroupBuilder.handlersRegistered = true;

    // Create a global handler that disposes all registered instances
    const globalShutdownHandler = () => {
      // Create a snapshot copy to safely iterate (dispose() may modify the Set)
      const instances = [...TransactionGroupBuilder.registeredInstances];
      for (const instance of instances) {
        if (!instance.isDisposed) {
          instance.dispose();
        }
      }
      TransactionGroupBuilder.registeredInstances.clear();

      // Remove listeners after handling
      process.removeListener('SIGINT', globalShutdownHandler);
      process.removeListener('SIGTERM', globalShutdownHandler);
      process.removeListener('beforeExit', globalShutdownHandler);
      TransactionGroupBuilder.handlersRegistered = false;
    };

    // Store reference for potential manual removal
    this.shutdownHandler = globalShutdownHandler;

    // Register for common shutdown signals
    process.on('SIGINT', globalShutdownHandler);
    process.on('SIGTERM', globalShutdownHandler);
    process.on('beforeExit', globalShutdownHandler);
  }

  /**
   * Remove this instance from shutdown tracking
   * (called after dispose to clean up references)
   */
  private removeShutdownHandlers(): void {
    TransactionGroupBuilder.registeredInstances.delete(this);
    this.shutdownHandler = null;
  }

  /**
   * Start the periodic cache cleanup interval
   */
  private startCacheCleanup(): void {
    if (this.cacheCleanupInterval) {
      return; // Already running
    }

    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupExpiredCacheEntries();
    }, TransactionGroupBuilder.CACHE_CLEANUP_INTERVAL_MS);

    // Ensure interval doesn't prevent Node from exiting
    if (this.cacheCleanupInterval.unref) {
      this.cacheCleanupInterval.unref();
    }
  }

  /**
   * Remove expired entries from the cache
   */
  private cleanupExpiredCacheEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.swapAnalysisCache) {
      if (now - value.timestamp > TransactionGroupBuilder.CACHE_TTL_MS) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.swapAnalysisCache.delete(key);
    }

    if (expiredKeys.length > 0) {
      console.log(`[TransactionGroupBuilder] Cache cleanup: removed ${expiredKeys.length} expired entries, ${this.swapAnalysisCache.size} remaining`);
    }
  }

  /**
   * Dispose of resources (call on shutdown)
   * Safe to call multiple times - will only run cleanup once
   */
  dispose(): void {
    if (this.isDisposed) {
      return; // Already disposed
    }
    this.isDisposed = true;

    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.swapAnalysisCache.clear();
    this.removeShutdownHandlers();
    console.log('[TransactionGroupBuilder] Disposed - cache cleared and cleanup interval stopped');
  }
  
  /**
   * Generate a cache key for swap analysis inputs
   */
  private getSwapAnalysisCacheKey(inputs: TransactionGroupInput): string {
    // Create a stable key from the relevant input fields
    const keyParts = [
      inputs.swapId || '',
      inputs.makerAssets.map(a => `${a.type}:${a.identifier}`).sort().join(','),
      inputs.takerAssets.map(a => `${a.type}:${a.identifier}`).sort().join(','),
      inputs.makerSolLamports.toString(),
      inputs.takerSolLamports.toString(),
      inputs.platformFeeLamports.toString(),
      inputs.forceSingleTransaction ? '1' : '0',
    ];
    return keyParts.join('|');
  }

  /**
   * Analyze swap assets and determine the best execution strategy
   */
  analyzeSwap(inputs: TransactionGroupInput): SwapAnalysis {
    // Check cache first
    const cacheKey = this.getSwapAnalysisCacheKey(inputs);
    const cached = this.swapAnalysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < TransactionGroupBuilder.CACHE_TTL_MS) {
      console.log('[TransactionGroupBuilder] analyzeSwap - cache hit');
      return cached.analysis;
    }

    // DEBUG: Log all asset types for troubleshooting (only on cache miss)
    console.log('[TransactionGroupBuilder] analyzeSwap - cache miss, computing...');
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
    
    // Calculate total NFTs of all types
    const totalAllNfts = totalCnfts + totalNfts + totalCoreNfts;
    console.log(`[TransactionGroupBuilder] Total NFTs: ${totalAllNfts} (cNFTs: ${totalCnfts}, SPL: ${totalNfts}, Core: ${totalCoreNfts})`);
    
    // Determine strategy
    let strategy: SwapStrategy;
    let transactionCount: number;
    let reason: string;
    
    if (inputs.forceSingleTransaction) {
      // User explicitly requested single transaction
      if (totalCnfts > 0) {
        // cNFT swaps CANNOT fit in single transaction - always need bundles
        strategy = SwapStrategy.CANNOT_FIT;
        transactionCount = 0;
        reason = `cNFT swaps require Jito bundles (cannot fit in single transaction)`;
      } else if (totalAllNfts > 2) {
        // Bulk SPL/Core NFTs also need bundles to bypass escrow limit
        strategy = SwapStrategy.CANNOT_FIT;
        transactionCount = 0;
        reason = `Bulk NFT swaps (${totalAllNfts} NFTs) require Jito bundles`;
      } else {
        strategy = SwapStrategy.SINGLE_TRANSACTION;
        transactionCount = 1;
        reason = 'Forced single transaction';
      }
    } else if (totalCnfts > 0) {
      // ANY swap with cNFTs needs bundle (proof nodes don't fit in single tx)
      // This handles mixed cases like 1 cNFT + 1 SPL NFT
      const cnftsPerTx = MAX_CNFTS_PER_TRANSACTION;
      const splPerTx = MAX_SPL_NFTS_PER_TRANSACTION;
      const corePerTx = MAX_CORE_NFTS_PER_TRANSACTION;
      
      const cnftTxCount = Math.ceil(totalCnfts / cnftsPerTx);
      const splTxCount = totalNfts > 0 ? Math.ceil(totalNfts / splPerTx) : 0;
      const coreTxCount = totalCoreNfts > 0 ? Math.ceil(totalCoreNfts / corePerTx) : 0;
      const needsSolTx = hasSolTransfer || inputs.platformFeeLamports > BigInt(0);
      
      transactionCount = cnftTxCount + splTxCount + coreTxCount + (needsSolTx ? 1 : 0);
      
      console.log(`[TransactionGroupBuilder] cNFT swap batching: cNFT txs=${cnftTxCount}, SPL txs=${splTxCount}, Core txs=${coreTxCount}, SOL tx=${needsSolTx ? 1 : 0}, total=${transactionCount}`);
      
      if (transactionCount > MAX_TRANSACTIONS_PER_BUNDLE) {
        strategy = SwapStrategy.CANNOT_FIT;
        reason = `Swap would require ${transactionCount} transactions, exceeding Jito's ${MAX_TRANSACTIONS_PER_BUNDLE} limit`;
      } else if (totalNfts === 0 && totalCoreNfts === 0) {
        strategy = SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE;
        reason = `${totalCnfts} cNFT(s) using direct Bubblegum bundle (${transactionCount} transactions)`;
      } else {
        strategy = SwapStrategy.MIXED_NFT_BUNDLE;
        reason = `Mixed swap with cNFTs: ${totalCnfts} cNFTs + ${totalNfts} SPL + ${totalCoreNfts} Core (${transactionCount} transactions)`;
      }
    } else if (totalAllNfts <= 2) {
      // Simple swap: 1-2 SPL/Core NFTs total, no cNFTs
      // BUT escrow program only supports 1 NFT per side!
      const makerNftCount = inputs.makerAssets.filter(a => 
        a.type === AssetType.NFT || a.type === AssetType.CORE_NFT ||
        String(a.type).toLowerCase() === 'nft' || String(a.type).toLowerCase() === 'core_nft'
      ).length;
      const takerNftCount = inputs.takerAssets.filter(a => 
        a.type === AssetType.NFT || a.type === AssetType.CORE_NFT ||
        String(a.type).toLowerCase() === 'nft' || String(a.type).toLowerCase() === 'core_nft'
      ).length;
      
      if (makerNftCount <= 1 && takerNftCount <= 1) {
        // Escrow program can handle this
        strategy = SwapStrategy.SINGLE_TRANSACTION;
        transactionCount = 1;
        reason = 'Simple swap (1 NFT per side max) - standard single transaction via escrow';
      } else {
        // 2 NFTs on same side - need bundle to bypass escrow limit
        strategy = SwapStrategy.DIRECT_NFT_BUNDLE;
        transactionCount = 2; // 1 SOL tx + 1 NFT tx
        reason = `${totalAllNfts} NFTs with ${Math.max(makerNftCount, takerNftCount)} on one side - using direct bundle`;
      }
    } else if (totalNfts >= JITO_BUNDLE_THRESHOLD && totalCoreNfts === 0) {
      // Bulk SPL NFT swap - use direct SPL token bundle
      const splPerTx = MAX_SPL_NFTS_PER_TRANSACTION;
      const splTxCount = Math.ceil(totalNfts / splPerTx);
      const needsSolTx = hasSolTransfer || inputs.platformFeeLamports > BigInt(0);
      transactionCount = splTxCount + (needsSolTx ? 1 : 0);
      
      console.log(`[TransactionGroupBuilder] SPL NFT batching: ${totalNfts} NFTs ÷ ${splPerTx}/tx = ${splTxCount} NFT txs + ${needsSolTx ? 1 : 0} SOL tx = ${transactionCount} total`);
      
      if (transactionCount > MAX_TRANSACTIONS_PER_BUNDLE) {
        strategy = SwapStrategy.CANNOT_FIT;
        reason = `${totalNfts} SPL NFTs would require ${transactionCount} transactions, exceeding Jito's ${MAX_TRANSACTIONS_PER_BUNDLE} limit`;
      } else {
        strategy = SwapStrategy.DIRECT_NFT_BUNDLE;
        reason = `${totalNfts} SPL NFT(s) using direct token bundle (${transactionCount} transactions)`;
      }
    } else if (totalCoreNfts >= JITO_BUNDLE_THRESHOLD && totalNfts === 0) {
      // Bulk Core NFT swap - use direct Core NFT bundle
      const corePerTx = MAX_CORE_NFTS_PER_TRANSACTION;
      const coreTxCount = Math.ceil(totalCoreNfts / corePerTx);
      const needsSolTx = hasSolTransfer || inputs.platformFeeLamports > BigInt(0);
      transactionCount = coreTxCount + (needsSolTx ? 1 : 0);
      
      console.log(`[TransactionGroupBuilder] Core NFT batching: ${totalCoreNfts} NFTs ÷ ${corePerTx}/tx = ${coreTxCount} NFT txs + ${needsSolTx ? 1 : 0} SOL tx = ${transactionCount} total`);
      
      if (transactionCount > MAX_TRANSACTIONS_PER_BUNDLE) {
        strategy = SwapStrategy.CANNOT_FIT;
        reason = `${totalCoreNfts} Core NFTs would require ${transactionCount} transactions, exceeding Jito's ${MAX_TRANSACTIONS_PER_BUNDLE} limit`;
      } else {
        strategy = SwapStrategy.DIRECT_NFT_BUNDLE;
        reason = `${totalCoreNfts} Core NFT(s) using direct token bundle (${transactionCount} transactions)`;
      }
    } else if (totalAllNfts >= JITO_BUNDLE_THRESHOLD) {
      // Mixed NFT types - use mixed bundle strategy
      // Calculate transactions needed for each type
      const cnftsPerTx = MAX_CNFTS_PER_TRANSACTION;
      const splPerTx = MAX_SPL_NFTS_PER_TRANSACTION;
      const corePerTx = MAX_CORE_NFTS_PER_TRANSACTION;
      
      const cnftTxCount = totalCnfts > 0 ? Math.ceil(totalCnfts / cnftsPerTx) : 0;
      const splTxCount = totalNfts > 0 ? Math.ceil(totalNfts / splPerTx) : 0;
      const coreTxCount = totalCoreNfts > 0 ? Math.ceil(totalCoreNfts / corePerTx) : 0;
      const needsSolTx = hasSolTransfer || inputs.platformFeeLamports > BigInt(0);
      
      transactionCount = cnftTxCount + splTxCount + coreTxCount + (needsSolTx ? 1 : 0);
      
      console.log(`[TransactionGroupBuilder] Mixed NFT batching: cNFT txs=${cnftTxCount}, SPL txs=${splTxCount}, Core txs=${coreTxCount}, SOL tx=${needsSolTx ? 1 : 0}, total=${transactionCount}`);
      
      if (transactionCount > MAX_TRANSACTIONS_PER_BUNDLE) {
        strategy = SwapStrategy.CANNOT_FIT;
        reason = `Mixed NFT swap would require ${transactionCount} transactions, exceeding Jito's ${MAX_TRANSACTIONS_PER_BUNDLE} limit`;
      } else {
        strategy = SwapStrategy.MIXED_NFT_BUNDLE;
        reason = `Mixed NFT swap: ${totalCnfts} cNFTs + ${totalNfts} SPL + ${totalCoreNfts} Core (${transactionCount} transactions)`;
      }
    } else {
      // Fallback: simple swap via escrow
      strategy = SwapStrategy.SINGLE_TRANSACTION;
      transactionCount = 1;
      reason = 'Simple swap - standard single transaction via escrow';
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

    // Cache the result (with size limit enforcement)
    if (this.swapAnalysisCache.size >= TransactionGroupBuilder.CACHE_MAX_SIZE) {
      // Trigger cleanup when cache is full
      this.cleanupExpiredCacheEntries();
      // If still at max after cleanup, delete oldest entry
      if (this.swapAnalysisCache.size >= TransactionGroupBuilder.CACHE_MAX_SIZE) {
        const oldestKey = this.swapAnalysisCache.keys().next().value;
        if (oldestKey) {
          this.swapAnalysisCache.delete(oldestKey);
        }
      }
    }
    this.swapAnalysisCache.set(cacheKey, { analysis, timestamp: Date.now() });

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
      // When swap exceeds Jito limits, fall back to two-phase delegation flow
      console.log(`[TransactionGroupBuilder] Swap exceeds Jito limits, routing to two-phase: ${analysis.reason}`);
      const twoPhaseAnalysis = {
        ...analysis,
        strategy: SwapStrategy.TWO_PHASE_DELEGATION,
        reason: `${analysis.reason}. Using two-phase delegation flow.`,
        requiresTwoPhase: true,
      };
      return {
        strategy: SwapStrategy.TWO_PHASE_DELEGATION,
        analysis: twoPhaseAnalysis,
        transactions: [], // No transactions built - two-phase flow handles this
        transactionCount: analysis.transactionCount,
        requiresJitoBundle: false,
        totalSizeBytes: 0,
        nonceValue: '',
        requiresTwoPhase: true,
      };
    }

    // Route ALL cNFT swaps to two-phase delegation
    // This provides better reliability than Jito bundles:
    // - No rate limits (Jito can return 429 during congestion)
    // - Simpler execution flow
    // - Fresh Merkle proofs at settlement time
    // - Proven reliable for cNFT-to-cNFT, now extended to cNFT-to-SOL and cNFT-to-NFT
    const totalCnfts = analysis.makerCnfts + analysis.takerCnfts;
    if (totalCnfts > 0) {
      const swapType = analysis.makerCnfts > 0 && analysis.takerCnfts > 0
        ? `cNFT-to-cNFT (${analysis.makerCnfts} ↔ ${analysis.takerCnfts})`
        : analysis.makerCnfts > 0
          ? `cNFT-to-other (${analysis.makerCnfts} cNFT → SOL/NFT)`
          : `other-to-cNFT (SOL/NFT → ${analysis.takerCnfts} cNFT)`;

      console.log(`[TransactionGroupBuilder] ${swapType} swap detected - routing to two-phase delegation`);
      const twoPhaseAnalysis = {
        ...analysis,
        strategy: SwapStrategy.TWO_PHASE_DELEGATION,
        reason: `cNFT swap uses two-phase delegation for reliability. Avoids Jito rate limits and ensures fresh Merkle proofs.`,
        requiresTwoPhase: true,
      };
      return {
        strategy: SwapStrategy.TWO_PHASE_DELEGATION,
        analysis: twoPhaseAnalysis,
        transactions: [], // No transactions built - two-phase flow handles this
        transactionCount: analysis.transactionCount,
        requiresJitoBundle: false,
        totalSizeBytes: 0,
        nonceValue: '',
        requiresTwoPhase: true,
      };
    }

    // If Jito is disabled and swap requires bundle, use sequential RPC for SPL/CORE NFTs
    // Note: cNFT swaps are already handled above and routed to two-phase
    if (!isJitoBundlesEnabled() && analysis.transactionCount > 1) {
      const nftTypes = [
        analysis.totalNfts > 0 ? `${analysis.totalNfts} SPL` : '',
        analysis.totalCoreNfts > 0 ? `${analysis.totalCoreNfts} Core` : '',
      ].filter(Boolean).join(', ') || 'NFT';
      console.log(`[TransactionGroupBuilder] Jito disabled, NFT swap (${nftTypes}) - using sequential RPC fallback`);
      // Continue to build transactions for sequential RPC execution
    }
    
    // Get nonce value (same for all transactions in the group)
    const nonceValue = await this.getNonceValue(inputs.nonceAccountPubkey);
    
    switch (analysis.strategy) {
      case SwapStrategy.SINGLE_TRANSACTION:
        // Single transaction - use existing TransactionBuilder (escrow program)
        return this.buildSingleTransaction(inputs, analysis, nonceValue);
        
      case SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE:
        // Direct Bubblegum bundle - bypasses escrow program for cNFT swaps
        return this.buildDirectBubblegumBundle(inputs, analysis, nonceValue);
        
      case SwapStrategy.DIRECT_NFT_BUNDLE:
        // Direct NFT bundle - bypasses escrow program for bulk SPL/Core NFT swaps
        return this.buildDirectNftBundle(inputs, analysis, nonceValue);
        
      case SwapStrategy.MIXED_NFT_BUNDLE:
        // Mixed bundle - handles combination of cNFTs, SPL NFTs, and Core NFTs
        return this.buildMixedNftBundle(inputs, analysis, nonceValue);
        
      case SwapStrategy.JITO_BUNDLE:
        // Legacy Jito bundle for edge cases
        return this.buildMultipleTransactions(inputs, analysis, nonceValue);
        
      default:
        throw new Error(`Unsupported swap strategy: ${analysis.strategy}`);
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
  /**
   * Pre-fetch all cNFT proofs in batch for JITO bundles
   * This optimizes performance by fetching all proofs simultaneously (reduces stale proof risk)
   * 
   * @param assetIds - Array of unique cNFT asset IDs
   * @returns Map of assetId -> DasProofResponse
   */
  private async preFetchProofs(assetIds: string[]): Promise<Map<string, any>> {
    if (assetIds.length === 0) {
      return new Map();
    }
    
    // Use batch fetching for 2+ cNFTs (optimization for JITO bundles)
    if (assetIds.length >= 2) {
      console.log(`[TransactionGroupBuilder] Pre-fetching ${assetIds.length} proofs in batch for JITO bundle`);
      const startTime = Date.now();
      
      try {
        // Do NOT always force skipCache here:
        // - Proof cache TTL is intentionally short to reduce staleness risk
        // - Always skipping cache increases DAS load and can trigger provider RPS limits (e.g. QuickNode -32007)
        const proofMap = await this.cnftService.getAssetProofBatch(assetIds, false);
        const fetchTime = Date.now() - startTime;
        console.log(`[TransactionGroupBuilder] ✅ Batch proof fetch complete: ${proofMap.size}/${assetIds.length} proofs in ${fetchTime}ms`);
        return proofMap;
      } catch (error: any) {
        console.error(`[TransactionGroupBuilder] Batch proof fetch failed: ${error.message}`);
        // Fallback handled by getAssetProofBatch internally
        return new Map();
      }
    }
    
    // For single cNFT, no pre-fetch needed (DirectBubblegumService handles it)
    return new Map();
  }

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
    
    // IMPORTANT: Jito bundles do NOT use durable nonces!
    // Jito provides atomicity through the bundle mechanism - all transactions land together
    // Durable nonces can only be advanced ONCE per slot, which breaks multi-tx bundles
    // Each transaction would try to advance the same nonce → only first succeeds
    // Use recent blockhash for all Jito bundle transactions instead
    const useJitoNonces = false;
    const isMainnet = process.env.SOLANA_NETWORK === 'mainnet-beta' ||
                      process.env.NODE_ENV === 'production';

    console.log(`[TransactionGroupBuilder] Network mode: ${isMainnet ? 'mainnet' : 'devnet/staging'}, useJitoNonces: ${useJitoNonces}`);
    
    // Collect all cNFT assets
    const makerCnfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    const takerCnfts = inputs.takerAssets.filter(a => 
      a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    
    // Pre-fetch all proofs in batch for 2+ cNFTs (JITO bundle optimization)
    const allCnftAssetIds = [
      ...makerCnfts.map(c => c.identifier),
      ...takerCnfts.map(c => c.identifier),
    ];
    const preFetchedProofs = allCnftAssetIds.length >= 2 
      ? await this.preFetchProofs(allCnftAssetIds)
      : new Map<string, any>();
    
    // === Transaction 1: SOL transfers ===
    // This handles: maker SOL → taker, taker SOL → maker, platform fee → treasury
    const willHaveSolTx = analysis.hasSolTransfer || inputs.platformFeeLamports > BigInt(0);

    if (willHaveSolTx) {
      console.log('[TransactionGroupBuilder] Building Tx1: SOL transfers');
      
      const solInstructions: TransactionInstruction[] = [];
      
      // Only add nonce advance instruction for mainnet Jito bundles
      if (useJitoNonces) {
        solInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }
      
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

      // NOTE: Jito tip is intentionally NOT added to Tx1.
      // Jito bundles are prioritized by a tip transfer, and the tip instruction should be in the LAST transaction
      // of the bundle (and as the LAST instruction in that transaction).
      
      // Build SOL transaction
      // On mainnet: use durable nonce for Jito bundles
      // On devnet: use fresh blockhash for sequential sends
      let solBlockhash: string;
      if (useJitoNonces) {
        solBlockhash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        solBlockhash = blockhash;
      }
      
      const solTx = new Transaction({
        recentBlockhash: solBlockhash,
        feePayer: this.platformAuthority.publicKey,
      }).add(...solInstructions);
      
      // Partial sign with platform authority
      solTx.partialSign(this.platformAuthority);
      
      const solTxSerialized = solTx.serialize({ requireAllSignatures: false });
      const solTxSize = solTxSerialized.length;
      
      // Determine which signers are actually needed for SOL tx
      // Must match the fee payer logic above (lines 426-433)
      const solTxSigners: string[] = [];
      
      // Determine who pays the platform fee (same logic as above)
      let feePayerIsMaker = false;
      let feePayerIsTaker = false;
      if (inputs.platformFeeLamports > BigInt(0)) {
        if (inputs.takerSolLamports > BigInt(0)) {
          feePayerIsTaker = true;
        } else {
          // Maker pays fee if they send SOL OR if it's a pure cNFT swap
          feePayerIsMaker = true;
        }
      }
      
      // Maker signs if they send SOL OR pay the fee
      if (inputs.makerSolLamports > BigInt(0) || feePayerIsMaker) {
        solTxSigners.push(inputs.makerPubkey.toBase58());
      }
      // Taker signs if they send SOL OR pay the fee
      if (inputs.takerSolLamports > BigInt(0) || feePayerIsTaker) {
        solTxSigners.push(inputs.takerPubkey.toBase58());
      }
      
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
          nonceValue: solBlockhash, // Use actual blockhash (nonce or fresh)
          estimatedComputeUnits: 50000, // SOL transfers are simple
          requiredSigners: solTxSigners,
        },
        isVersioned: false,
      });
      
      totalSizeBytes += solTxSize;
      console.log(`[TransactionGroupBuilder] Tx1 (SOL) built: ${solTxSize} bytes, signers: ${solTxSigners.join(', ')}`);
    }
    
    // === Transaction 2+: cNFT transfers via direct Bubblegum ===
    // Each cNFT gets its own transaction (proof nodes require significant space)
    let txIndex = transactions.length;
    
    // Calculate total cNFT transactions to determine which is last
    const totalCnftTransactions = makerCnfts.length + takerCnfts.length;
    let cnftTransactionCount = 0;
    
    // Maker cNFT → Taker
    for (const cnft of makerCnfts) {
      cnftTransactionCount++;
      const isLastTransaction = cnftTransactionCount === totalCnftTransactions; // Last cNFT transaction overall
      
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: Maker cNFT transfer${isLastTransaction ? ' (LAST - will add Jito tip)' : ''}`);
      
      // Use pre-fetched proof if available (for JITO bundles with 2+ cNFTs)
      const preFetchedProof = preFetchedProofs.get(cnft.identifier);
      const transferResult = await this.directBubblegumService.buildTransferInstruction({
        assetId: cnft.identifier,
        fromWallet: inputs.makerPubkey,
        toWallet: inputs.takerPubkey,
      }, 0, preFetchedProof);
      
      // Build transaction
      const cnftInstructions: TransactionInstruction[] = [];
      
      // Only add nonce advance instruction for mainnet Jito bundles
      if (useJitoNonces) {
        cnftInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }

      // Compute budget for cNFT operations (required for all networks)
      // Deep mainnet Merkle trees (30+ proof nodes) can use 500k+ compute
      // We use 600k to handle the deepest trees and avoid ProgramFailedToComplete errors
      // Note: For durable nonce transactions, nonceAdvance must be first. ComputeBudget can follow it safely.
      cnftInstructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
      );

      cnftInstructions.push(transferResult.instruction);

      // Add Jito tip as LAST instruction in LAST transaction (Jito requirement / best practice).
      if (useJitoNonces && isLastTransaction) {
        const JITO_TIP_ACCOUNTS = [
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'HFqU5x63VTqvQss8hp11i4bVmkdzGHnsRRskfJ2J4ybE',
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
        ];
        
        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        const tipAmount = 1_000_000; // 0.001 SOL (default Jito tip)
        
        console.log(`[TransactionGroupBuilder] Adding Jito tip: ${tipAmount} lamports to ${jitoTipAccount.toString()} (LAST instruction in LAST transaction)`);
        
        cnftInstructions.push(
          SystemProgram.transfer({
            fromPubkey: this.platformAuthority.publicKey,
            toPubkey: jitoTipAccount,
            lamports: tipAmount,
          })
        );
      }
      
      // Get blockhash (fresh for devnet, nonce for mainnet)
      let cnftBlockhash: string;
      if (useJitoNonces) {
        cnftBlockhash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        cnftBlockhash = blockhash;
      }
      
      const cnftTx = new Transaction({
        recentBlockhash: cnftBlockhash,
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
          nonceValue: cnftBlockhash, // Use actual blockhash (nonce or fresh)
          estimatedComputeUnits: 200000, // cNFT transfers with proof are expensive
          requiredSigners: [inputs.makerPubkey.toBase58()],
        },
        isVersioned: false,
        // JIT rebuild metadata for sequential RPC execution
        cnftAssetId: cnft.identifier,
        cnftFromWallet: inputs.makerPubkey.toBase58(),
        cnftToWallet: inputs.takerPubkey.toBase58(),
      });
      
      totalSizeBytes += cnftTxSize;
      txIndex++;
      console.log(`[TransactionGroupBuilder] cNFT tx built: ${cnftTxSize} bytes, ${transferResult.proofNodes.length} proof nodes`);
    }
    
    // Taker cNFT → Maker
    for (const cnft of takerCnfts) {
      cnftTransactionCount++;
      const isLastTransaction = cnftTransactionCount === totalCnftTransactions; // Last cNFT transaction overall
      
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: Taker cNFT transfer${isLastTransaction ? ' (LAST - will add Jito tip)' : ''}`);
      
      // Use pre-fetched proof if available (for JITO bundles with 2+ cNFTs)
      const preFetchedProof = preFetchedProofs.get(cnft.identifier);
      const transferResult = await this.directBubblegumService.buildTransferInstruction({
        assetId: cnft.identifier,
        fromWallet: inputs.takerPubkey,
        toWallet: inputs.makerPubkey,
      }, 0, preFetchedProof);
      
      // Build transaction
      const cnftInstructions: TransactionInstruction[] = [];
      
      // Only add nonce advance instruction for mainnet Jito bundles
      if (useJitoNonces) {
        cnftInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }

      // Compute budget for cNFT operations (required for all networks)
      // Deep mainnet Merkle trees (30+ proof nodes) can use 500k+ compute
      // We use 600k to handle the deepest trees and avoid ProgramFailedToComplete errors
      // Note: For durable nonce transactions, nonceAdvance must be first. ComputeBudget can follow it safely.
      cnftInstructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
      );

      cnftInstructions.push(transferResult.instruction);

      // Add Jito tip as LAST instruction in LAST transaction (Jito requirement / best practice).
      if (useJitoNonces && isLastTransaction) {
        const JITO_TIP_ACCOUNTS = [
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'HFqU5x63VTqvQss8hp11i4bVmkdzGHnsRRskfJ2J4ybE',
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
        ];
        
        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        const tipAmount = 1_000_000; // 0.001 SOL (default Jito tip)
        
        console.log(`[TransactionGroupBuilder] Adding Jito tip: ${tipAmount} lamports to ${jitoTipAccount.toString()} (LAST instruction in LAST transaction)`);
        
        cnftInstructions.push(
          SystemProgram.transfer({
            fromPubkey: this.platformAuthority.publicKey,
            toPubkey: jitoTipAccount,
            lamports: tipAmount,
          })
        );
      }
      
      // Get blockhash (fresh for devnet, nonce for mainnet)
      let cnftBlockhash: string;
      if (useJitoNonces) {
        cnftBlockhash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        cnftBlockhash = blockhash;
      }
      
      const cnftTx = new Transaction({
        recentBlockhash: cnftBlockhash,
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
          nonceValue: cnftBlockhash, // Use actual blockhash (nonce or fresh)
          estimatedComputeUnits: 200000, // cNFT transfers with proof are expensive
          requiredSigners: [inputs.takerPubkey.toBase58()],
        },
        isVersioned: false,
        // JIT rebuild metadata for sequential RPC execution
        cnftAssetId: cnft.identifier,
        cnftFromWallet: inputs.takerPubkey.toBase58(),
        cnftToWallet: inputs.makerPubkey.toBase58(),
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
      useJitoNonces,
    });

    // Validate all transactions have proper structure
    if (transactions.length === 0) {
      throw new Error(
        `No transactions built for Bubblegum bundle. ` +
        `cNFTs: maker=${makerCnfts.length}, taker=${takerCnfts.length}`
      );
    }

    // Verify each transaction has serialized data
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      if (!tx) {
        throw new Error(`Transaction at index ${i} is undefined`);
      }
      if (!tx.transaction) {
        throw new Error(
          `Transaction at index ${i} (${tx.purpose}) has no transaction data`
        );
      }
      if (!tx.transaction.serializedTransaction) {
        throw new Error(
          `Transaction at index ${i} (${tx.purpose}) has no serialized transaction`
        );
      }
    }

    return {
      strategy: SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE,
      analysis,
      transactions,
      transactionCount: transactions.length,
      requiresJitoBundle: useJitoNonces, // Only require Jito on mainnet
      totalSizeBytes,
      nonceValue: useJitoNonces ? nonceValue : 'fresh-blockhash', // Indicate blockhash strategy
    };
  }
  
  /**
   * Build direct NFT bundle for bulk SPL or Core NFT swaps
   * Bypasses escrow program by using direct token transfers
   */
  private async buildDirectNftBundle(
    inputs: TransactionGroupInput,
    analysis: SwapAnalysis,
    nonceValue: string
  ): Promise<TransactionGroupResult> {
    console.log('[TransactionGroupBuilder] Building direct NFT bundle for SPL/Core NFT swap');
    
    if (!this.treasuryPda) {
      throw new Error('Treasury PDA required for direct NFT bundles');
    }
    
    const transactions: TransactionGroupItem[] = [];
    let totalSizeBytes = 0;
    
    // Network mode detection
    const isMainnet = process.env.SOLANA_NETWORK === 'mainnet-beta' || 
                      process.env.NODE_ENV === 'production';
    const useJitoNonces = isMainnet && isJitoBundlesEnabled();
    
    console.log(`[TransactionGroupBuilder] Network mode: ${isMainnet ? 'mainnet (Jito bundles)' : 'devnet (sequential sends)'}`);
    
    // Collect all SPL NFTs
    const makerSplNfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.NFT || String(a.type).toLowerCase() === 'nft'
    );
    const takerSplNfts = inputs.takerAssets.filter(a => 
      a.type === AssetType.NFT || String(a.type).toLowerCase() === 'nft'
    );
    
    // Collect all Core NFTs
    const makerCoreNfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.CORE_NFT || String(a.type).toLowerCase() === 'core_nft'
    );
    const takerCoreNfts = inputs.takerAssets.filter(a => 
      a.type === AssetType.CORE_NFT || String(a.type).toLowerCase() === 'core_nft'
    );
    
    // === Transaction 1: SOL transfers (if any) ===
    if (analysis.hasSolTransfer || inputs.platformFeeLamports > BigInt(0)) {
      const solTx = await this.buildSolTransferTransaction(inputs, nonceValue, useJitoNonces);
      transactions.push(solTx);
      totalSizeBytes += solTx.transaction?.sizeBytes || 0;
    }
    
    // === Transaction 2+: SPL NFT transfers ===
    let txIndex = transactions.length;
    
    // Batch SPL NFTs efficiently (multiple per transaction)
    const splPerTx = MAX_SPL_NFTS_PER_TRANSACTION;
    
    // Maker SPL NFTs → Taker
    for (let i = 0; i < makerSplNfts.length; i += splPerTx) {
      const batch = makerSplNfts.slice(i, i + splPerTx);
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: Maker SPL NFT batch (${batch.length} NFTs)`);
      
      const splInstructions: TransactionInstruction[] = [];
      
      if (useJitoNonces) {
        splInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }
      
      // Build transfer instructions for each NFT in batch
      for (const nft of batch) {
        const result = await this.directSplTokenService.buildTransferInstruction({
          mint: nft.identifier,
          fromWallet: inputs.makerPubkey,
          toWallet: inputs.takerPubkey,
        });
        splInstructions.push(...result.instructions);
      }
      
      // Build transaction
      let blockHash: string;
      if (useJitoNonces) {
        blockHash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        blockHash = blockhash;
      }
      
      const splTx = new Transaction({
        recentBlockhash: blockHash,
        feePayer: this.platformAuthority.publicKey,
      }).add(...splInstructions);
      
      splTx.partialSign(this.platformAuthority);
      
      const splTxSerialized = splTx.serialize({ requireAllSignatures: false });
      const splTxSize = splTxSerialized.length;
      
      transactions.push({
        index: txIndex,
        purpose: `Maker SPL NFT transfers (${batch.length} NFTs)`,
        assets: {
          makerAssets: batch,
          takerAssets: [],
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: splTxSerialized.toString('base64'),
          sizeBytes: splTxSize,
          isVersioned: false,
          nonceValue: blockHash,
          estimatedComputeUnits: 50000 * batch.length,
          requiredSigners: [inputs.makerPubkey.toBase58()],
        },
        isVersioned: false,
      });
      
      totalSizeBytes += splTxSize;
      txIndex++;
      console.log(`[TransactionGroupBuilder] SPL NFT tx built: ${splTxSize} bytes, ${batch.length} transfers`);
    }
    
    // Taker SPL NFTs → Maker
    for (let i = 0; i < takerSplNfts.length; i += splPerTx) {
      const batch = takerSplNfts.slice(i, i + splPerTx);
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: Taker SPL NFT batch (${batch.length} NFTs)`);
      
      const splInstructions: TransactionInstruction[] = [];
      
      if (useJitoNonces) {
        splInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }
      
      for (const nft of batch) {
        const result = await this.directSplTokenService.buildTransferInstruction({
          mint: nft.identifier,
          fromWallet: inputs.takerPubkey,
          toWallet: inputs.makerPubkey,
        });
        splInstructions.push(...result.instructions);
      }
      
      let blockHash: string;
      if (useJitoNonces) {
        blockHash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        blockHash = blockhash;
      }
      
      const splTx = new Transaction({
        recentBlockhash: blockHash,
        feePayer: this.platformAuthority.publicKey,
      }).add(...splInstructions);
      
      splTx.partialSign(this.platformAuthority);
      
      const splTxSerialized = splTx.serialize({ requireAllSignatures: false });
      const splTxSize = splTxSerialized.length;
      
      transactions.push({
        index: txIndex,
        purpose: `Taker SPL NFT transfers (${batch.length} NFTs)`,
        assets: {
          makerAssets: [],
          takerAssets: batch,
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: splTxSerialized.toString('base64'),
          sizeBytes: splTxSize,
          isVersioned: false,
          nonceValue: blockHash,
          estimatedComputeUnits: 50000 * batch.length,
          requiredSigners: [inputs.takerPubkey.toBase58()],
        },
        isVersioned: false,
      });
      
      totalSizeBytes += splTxSize;
      txIndex++;
      console.log(`[TransactionGroupBuilder] SPL NFT tx built: ${splTxSize} bytes, ${batch.length} transfers`);
    }
    
    // === Core NFT transfers ===
    const corePerTx = MAX_CORE_NFTS_PER_TRANSACTION;
    
    // Maker Core NFTs → Taker
    for (let i = 0; i < makerCoreNfts.length; i += corePerTx) {
      const batch = makerCoreNfts.slice(i, i + corePerTx);
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: Maker Core NFT batch (${batch.length} NFTs)`);
      
      const coreInstructions: TransactionInstruction[] = [];
      
      if (useJitoNonces) {
        coreInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }
      
      for (const nft of batch) {
        const result = await this.directCoreNftService.buildTransferInstruction({
          assetAddress: nft.identifier,
          fromWallet: inputs.makerPubkey,
          toWallet: inputs.takerPubkey,
        });
        coreInstructions.push(result.instruction);
      }
      
      let blockHash: string;
      if (useJitoNonces) {
        blockHash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        blockHash = blockhash;
      }
      
      const coreTx = new Transaction({
        recentBlockhash: blockHash,
        feePayer: this.platformAuthority.publicKey,
      }).add(...coreInstructions);
      
      coreTx.partialSign(this.platformAuthority);
      
      const coreTxSerialized = coreTx.serialize({ requireAllSignatures: false });
      const coreTxSize = coreTxSerialized.length;
      
      transactions.push({
        index: txIndex,
        purpose: `Maker Core NFT transfers (${batch.length} NFTs)`,
        assets: {
          makerAssets: batch,
          takerAssets: [],
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: coreTxSerialized.toString('base64'),
          sizeBytes: coreTxSize,
          isVersioned: false,
          nonceValue: blockHash,
          estimatedComputeUnits: 75000 * batch.length,
          requiredSigners: [inputs.makerPubkey.toBase58()],
        },
        isVersioned: false,
      });
      
      totalSizeBytes += coreTxSize;
      txIndex++;
      console.log(`[TransactionGroupBuilder] Core NFT tx built: ${coreTxSize} bytes, ${batch.length} transfers`);
    }
    
    // Taker Core NFTs → Maker
    for (let i = 0; i < takerCoreNfts.length; i += corePerTx) {
      const batch = takerCoreNfts.slice(i, i + corePerTx);
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: Taker Core NFT batch (${batch.length} NFTs)`);
      
      const coreInstructions: TransactionInstruction[] = [];
      
      if (useJitoNonces) {
        coreInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }
      
      for (const nft of batch) {
        const result = await this.directCoreNftService.buildTransferInstruction({
          assetAddress: nft.identifier,
          fromWallet: inputs.takerPubkey,
          toWallet: inputs.makerPubkey,
        });
        coreInstructions.push(result.instruction);
      }
      
      let blockHash: string;
      if (useJitoNonces) {
        blockHash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        blockHash = blockhash;
      }
      
      const coreTx = new Transaction({
        recentBlockhash: blockHash,
        feePayer: this.platformAuthority.publicKey,
      }).add(...coreInstructions);
      
      coreTx.partialSign(this.platformAuthority);
      
      const coreTxSerialized = coreTx.serialize({ requireAllSignatures: false });
      const coreTxSize = coreTxSerialized.length;
      
      transactions.push({
        index: txIndex,
        purpose: `Taker Core NFT transfers (${batch.length} NFTs)`,
        assets: {
          makerAssets: [],
          takerAssets: batch,
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: coreTxSerialized.toString('base64'),
          sizeBytes: coreTxSize,
          isVersioned: false,
          nonceValue: blockHash,
          estimatedComputeUnits: 75000 * batch.length,
          requiredSigners: [inputs.takerPubkey.toBase58()],
        },
        isVersioned: false,
      });
      
      totalSizeBytes += coreTxSize;
      txIndex++;
      console.log(`[TransactionGroupBuilder] Core NFT tx built: ${coreTxSize} bytes, ${batch.length} transfers`);
    }
    
    console.log(`[TransactionGroupBuilder] Direct NFT bundle complete:`, {
      transactionCount: transactions.length,
      totalSizeBytes,
      makerSplNfts: makerSplNfts.length,
      takerSplNfts: takerSplNfts.length,
      makerCoreNfts: makerCoreNfts.length,
      takerCoreNfts: takerCoreNfts.length,
      useJitoNonces,
    });

    // Validate all transactions have proper structure
    if (transactions.length === 0) {
      throw new Error(
        `No transactions built for direct NFT bundle. ` +
        `Assets: maker SPL=${makerSplNfts.length}, taker SPL=${takerSplNfts.length}, ` +
        `maker Core=${makerCoreNfts.length}, taker Core=${takerCoreNfts.length}`
      );
    }

    // Verify each transaction has serialized data
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      if (!tx) {
        throw new Error(`Transaction at index ${i} is undefined`);
      }
      if (!tx.transaction) {
        throw new Error(
          `Transaction at index ${i} (${tx.purpose}) has no transaction data`
        );
      }
      if (!tx.transaction.serializedTransaction) {
        throw new Error(
          `Transaction at index ${i} (${tx.purpose}) has no serialized transaction`
        );
      }
    }

    return {
      strategy: SwapStrategy.DIRECT_NFT_BUNDLE,
      analysis,
      transactions,
      transactionCount: transactions.length,
      requiresJitoBundle: useJitoNonces,
      totalSizeBytes,
      nonceValue: useJitoNonces ? nonceValue : 'fresh-blockhash',
    };
  }
  
  /**
   * Build mixed NFT bundle for swaps with combinations of cNFTs, SPL NFTs, and Core NFTs
   */
  private async buildMixedNftBundle(
    inputs: TransactionGroupInput,
    analysis: SwapAnalysis,
    nonceValue: string
  ): Promise<TransactionGroupResult> {
    console.log('[TransactionGroupBuilder] Building mixed NFT bundle');
    
    if (!this.treasuryPda) {
      throw new Error('Treasury PDA required for mixed NFT bundles');
    }
    
    const transactions: TransactionGroupItem[] = [];
    let totalSizeBytes = 0;
    
    // Network mode detection
    const isMainnet = process.env.SOLANA_NETWORK === 'mainnet-beta' || 
                      process.env.NODE_ENV === 'production';
    const useJitoNonces = isMainnet && isJitoBundlesEnabled();
    
    // Collect all NFT types
    const makerCnfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    const takerCnfts = inputs.takerAssets.filter(a => 
      a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    const makerSplNfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.NFT || String(a.type).toLowerCase() === 'nft'
    );
    const takerSplNfts = inputs.takerAssets.filter(a => 
      a.type === AssetType.NFT || String(a.type).toLowerCase() === 'nft'
    );
    const makerCoreNfts = inputs.makerAssets.filter(a => 
      a.type === AssetType.CORE_NFT || String(a.type).toLowerCase() === 'core_nft'
    );
    const takerCoreNfts = inputs.takerAssets.filter(a => 
      a.type === AssetType.CORE_NFT || String(a.type).toLowerCase() === 'core_nft'
    );
    
    console.log(`[TransactionGroupBuilder] Mixed bundle assets: cNFTs=${makerCnfts.length + takerCnfts.length}, SPL=${makerSplNfts.length + takerSplNfts.length}, Core=${makerCoreNfts.length + takerCoreNfts.length}`);
    
    // === Transaction 1: SOL transfers (if any) ===
    if (analysis.hasSolTransfer || inputs.platformFeeLamports > BigInt(0)) {
      const solTx = await this.buildSolTransferTransaction(inputs, nonceValue, useJitoNonces);
      transactions.push(solTx);
      totalSizeBytes += solTx.transaction?.sizeBytes || 0;
    }
    
    let txIndex = transactions.length;
    
    // Pre-fetch all proofs in batch for 2+ cNFTs (JITO bundle optimization)
    const allCnftAssetIds = [
      ...makerCnfts.map(c => c.identifier),
      ...takerCnfts.map(c => c.identifier),
    ];
    const preFetchedProofs = allCnftAssetIds.length >= 2 
      ? await this.preFetchProofs(allCnftAssetIds)
      : new Map<string, any>();
    
    // === cNFT transfers (1 per transaction due to proof nodes) ===
    const cnftsPerTx = MAX_CNFTS_PER_TRANSACTION;
    const allCnfts = [
      ...makerCnfts.map(c => ({ asset: c, from: inputs.makerPubkey, to: inputs.takerPubkey, side: 'maker' as const })),
      ...takerCnfts.map(c => ({ asset: c, from: inputs.takerPubkey, to: inputs.makerPubkey, side: 'taker' as const })),
    ];
    
    for (let i = 0; i < allCnfts.length; i += cnftsPerTx) {
      const batch = allCnfts.slice(i, i + cnftsPerTx);
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: cNFT batch (${batch.length} NFTs)`);
      
      const cnftInstructions: TransactionInstruction[] = [];
      const requiredSigners: string[] = [];
      
      if (useJitoNonces) {
        cnftInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }
      
      for (const { asset, from, to, side } of batch) {
        // Use pre-fetched proof if available (for JITO bundles with 2+ cNFTs)
        const preFetchedProof = preFetchedProofs.get(asset.identifier);
        const result = await this.directBubblegumService.buildTransferInstruction({
          assetId: asset.identifier,
          fromWallet: from,
          toWallet: to,
        }, 0, preFetchedProof);
        cnftInstructions.push(result.instruction);
        if (!requiredSigners.includes(from.toBase58())) {
          requiredSigners.push(from.toBase58());
        }
      }
      
      let blockHash: string;
      if (useJitoNonces) {
        blockHash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        blockHash = blockhash;
      }
      
      const cnftTx = new Transaction({
        recentBlockhash: blockHash,
        feePayer: this.platformAuthority.publicKey,
      }).add(...cnftInstructions);
      
      cnftTx.partialSign(this.platformAuthority);
      
      const cnftTxSerialized = cnftTx.serialize({ requireAllSignatures: false });
      const cnftTxSize = cnftTxSerialized.length;
      
      transactions.push({
        index: txIndex,
        purpose: `cNFT transfers (${batch.length} NFTs)`,
        assets: {
          makerAssets: batch.filter(b => b.side === 'maker').map(b => b.asset),
          takerAssets: batch.filter(b => b.side === 'taker').map(b => b.asset),
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: cnftTxSerialized.toString('base64'),
          sizeBytes: cnftTxSize,
          isVersioned: false,
          nonceValue: blockHash,
          estimatedComputeUnits: 200000 * batch.length,
          requiredSigners,
        },
        isVersioned: false,
      });
      
      totalSizeBytes += cnftTxSize;
      txIndex++;
    }
    
    // === SPL NFT transfers ===
    const splPerTx = MAX_SPL_NFTS_PER_TRANSACTION;
    const allSplNfts = [
      ...makerSplNfts.map(n => ({ asset: n, from: inputs.makerPubkey, to: inputs.takerPubkey, side: 'maker' as const })),
      ...takerSplNfts.map(n => ({ asset: n, from: inputs.takerPubkey, to: inputs.makerPubkey, side: 'taker' as const })),
    ];
    
    for (let i = 0; i < allSplNfts.length; i += splPerTx) {
      const batch = allSplNfts.slice(i, i + splPerTx);
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: SPL NFT batch (${batch.length} NFTs)`);
      
      const splInstructions: TransactionInstruction[] = [];
      const requiredSigners: string[] = [];
      
      if (useJitoNonces) {
        splInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }
      
      for (const { asset, from, to } of batch) {
        const result = await this.directSplTokenService.buildTransferInstruction({
          mint: asset.identifier,
          fromWallet: from,
          toWallet: to,
        });
        splInstructions.push(...result.instructions);
        if (!requiredSigners.includes(from.toBase58())) {
          requiredSigners.push(from.toBase58());
        }
      }
      
      let blockHash: string;
      if (useJitoNonces) {
        blockHash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        blockHash = blockhash;
      }
      
      const splTx = new Transaction({
        recentBlockhash: blockHash,
        feePayer: this.platformAuthority.publicKey,
      }).add(...splInstructions);
      
      splTx.partialSign(this.platformAuthority);
      
      const splTxSerialized = splTx.serialize({ requireAllSignatures: false });
      const splTxSize = splTxSerialized.length;
      
      transactions.push({
        index: txIndex,
        purpose: `SPL NFT transfers (${batch.length} NFTs)`,
        assets: {
          makerAssets: batch.filter(b => b.side === 'maker').map(b => b.asset),
          takerAssets: batch.filter(b => b.side === 'taker').map(b => b.asset),
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: splTxSerialized.toString('base64'),
          sizeBytes: splTxSize,
          isVersioned: false,
          nonceValue: blockHash,
          estimatedComputeUnits: 50000 * batch.length,
          requiredSigners,
        },
        isVersioned: false,
      });
      
      totalSizeBytes += splTxSize;
      txIndex++;
    }
    
    // === Core NFT transfers ===
    const corePerTx = MAX_CORE_NFTS_PER_TRANSACTION;
    const allCoreNfts = [
      ...makerCoreNfts.map(n => ({ asset: n, from: inputs.makerPubkey, to: inputs.takerPubkey, side: 'maker' as const })),
      ...takerCoreNfts.map(n => ({ asset: n, from: inputs.takerPubkey, to: inputs.makerPubkey, side: 'taker' as const })),
    ];
    
    for (let i = 0; i < allCoreNfts.length; i += corePerTx) {
      const batch = allCoreNfts.slice(i, i + corePerTx);
      console.log(`[TransactionGroupBuilder] Building Tx${txIndex + 1}: Core NFT batch (${batch.length} NFTs)`);
      
      const coreInstructions: TransactionInstruction[] = [];
      const requiredSigners: string[] = [];
      
      if (useJitoNonces) {
        coreInstructions.push(
          SystemProgram.nonceAdvance({
            noncePubkey: inputs.nonceAccountPubkey,
            authorizedPubkey: this.platformAuthority.publicKey,
          })
        );
      }
      
      for (const { asset, from, to } of batch) {
        const result = await this.directCoreNftService.buildTransferInstruction({
          assetAddress: asset.identifier,
          fromWallet: from,
          toWallet: to,
        });
        coreInstructions.push(result.instruction);
        if (!requiredSigners.includes(from.toBase58())) {
          requiredSigners.push(from.toBase58());
        }
      }
      
      let blockHash: string;
      if (useJitoNonces) {
        blockHash = nonceValue;
      } else {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        blockHash = blockhash;
      }
      
      const coreTx = new Transaction({
        recentBlockhash: blockHash,
        feePayer: this.platformAuthority.publicKey,
      }).add(...coreInstructions);
      
      coreTx.partialSign(this.platformAuthority);
      
      const coreTxSerialized = coreTx.serialize({ requireAllSignatures: false });
      const coreTxSize = coreTxSerialized.length;
      
      transactions.push({
        index: txIndex,
        purpose: `Core NFT transfers (${batch.length} NFTs)`,
        assets: {
          makerAssets: batch.filter(b => b.side === 'maker').map(b => b.asset),
          takerAssets: batch.filter(b => b.side === 'taker').map(b => b.asset),
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: coreTxSerialized.toString('base64'),
          sizeBytes: coreTxSize,
          isVersioned: false,
          nonceValue: blockHash,
          estimatedComputeUnits: 75000 * batch.length,
          requiredSigners,
        },
        isVersioned: false,
      });
      
      totalSizeBytes += coreTxSize;
      txIndex++;
    }
    
    console.log(`[TransactionGroupBuilder] Mixed NFT bundle complete:`, {
      transactionCount: transactions.length,
      totalSizeBytes,
      cNfts: makerCnfts.length + takerCnfts.length,
      splNfts: makerSplNfts.length + takerSplNfts.length,
      coreNfts: makerCoreNfts.length + takerCoreNfts.length,
      useJitoNonces,
    });

    // Validate all transactions have proper structure
    if (transactions.length === 0) {
      throw new Error(
        `No transactions built for mixed NFT bundle. ` +
        `Assets: cNFTs=${makerCnfts.length + takerCnfts.length}, ` +
        `SPL=${makerSplNfts.length + takerSplNfts.length}, ` +
        `Core=${makerCoreNfts.length + takerCoreNfts.length}`
      );
    }

    // Verify each transaction has serialized data
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      if (!tx) {
        throw new Error(`Transaction at index ${i} is undefined`);
      }
      if (!tx.transaction) {
        throw new Error(
          `Transaction at index ${i} (${tx.purpose}) has no transaction data`
        );
      }
      if (!tx.transaction.serializedTransaction) {
        throw new Error(
          `Transaction at index ${i} (${tx.purpose}) has no serialized transaction`
        );
      }
    }

    return {
      strategy: SwapStrategy.MIXED_NFT_BUNDLE,
      analysis,
      transactions,
      transactionCount: transactions.length,
      requiresJitoBundle: useJitoNonces,
      totalSizeBytes,
      nonceValue: useJitoNonces ? nonceValue : 'fresh-blockhash',
    };
  }
  
  /**
   * Helper: Build SOL transfer transaction for bundles
   */
  private async buildSolTransferTransaction(
    inputs: TransactionGroupInput,
    nonceValue: string,
    useJitoNonces: boolean
  ): Promise<TransactionGroupItem> {
    console.log('[TransactionGroupBuilder] Building SOL transfer transaction');
    
    const solInstructions: TransactionInstruction[] = [];
    
    if (useJitoNonces) {
      solInstructions.push(
        SystemProgram.nonceAdvance({
          noncePubkey: inputs.nonceAccountPubkey,
          authorizedPubkey: this.platformAuthority.publicKey,
        })
      );
    }
    
    // Maker sends SOL to taker
    if (inputs.makerSolLamports > BigInt(0)) {
      solInstructions.push(
        SystemProgram.transfer({
          fromPubkey: inputs.makerPubkey,
          toPubkey: inputs.takerPubkey,
          lamports: inputs.makerSolLamports,
        })
      );
    }
    
    // Taker sends SOL to maker (minus fee)
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
    
    // Platform fee
    if (inputs.platformFeeLamports > BigInt(0) && this.treasuryPda) {
      let feePayer: PublicKey;
      if (inputs.takerSolLamports > BigInt(0)) {
        feePayer = inputs.takerPubkey;
      } else if (inputs.makerSolLamports > BigInt(0)) {
        feePayer = inputs.makerPubkey;
      } else {
        feePayer = inputs.makerPubkey;
      }
      
      solInstructions.push(
        SystemProgram.transfer({
          fromPubkey: feePayer,
          toPubkey: this.treasuryPda,
          lamports: inputs.platformFeeLamports,
        })
      );
    }
    
    let blockHash: string;
    if (useJitoNonces) {
      blockHash = nonceValue;
    } else {
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      blockHash = blockhash;
    }
    
    const solTx = new Transaction({
      recentBlockhash: blockHash,
      feePayer: this.platformAuthority.publicKey,
    }).add(...solInstructions);
    
    solTx.partialSign(this.platformAuthority);
    
    const solTxSerialized = solTx.serialize({ requireAllSignatures: false });
    const solTxSize = solTxSerialized.length;
    
    // Determine required signers
    const solTxSigners: string[] = [];
    let feePayerIsMaker = false;
    let feePayerIsTaker = false;
    
    if (inputs.platformFeeLamports > BigInt(0)) {
      if (inputs.takerSolLamports > BigInt(0)) {
        feePayerIsTaker = true;
      } else {
        feePayerIsMaker = true;
      }
    }
    
    if (inputs.makerSolLamports > BigInt(0) || feePayerIsMaker) {
      solTxSigners.push(inputs.makerPubkey.toBase58());
    }
    if (inputs.takerSolLamports > BigInt(0) || feePayerIsTaker) {
      solTxSigners.push(inputs.takerPubkey.toBase58());
    }
    
    console.log(`[TransactionGroupBuilder] SOL tx built: ${solTxSize} bytes, signers: ${solTxSigners.join(', ')}`);
    
    return {
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
        nonceValue: blockHash,
        estimatedComputeUnits: 50000,
        requiredSigners: solTxSigners,
      },
      isVersioned: false,
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
    
    // Group cNFTs (1 per transaction due to Merkle proof size)
    const allCnfts: { asset: SwapAsset; side: 'maker' | 'taker' }[] = [
      ...makerCnfts.map(a => ({ asset: a, side: 'maker' as const })),
      ...takerCnfts.map(a => ({ asset: a, side: 'taker' as const })),
    ];

    // Each cNFT needs its own transaction (proof nodes are typically large)
    const cnftsPerTx = MAX_CNFTS_PER_TRANSACTION;
    console.log(`[TransactionGroupBuilder] Batching ${allCnfts.length} cNFTs into groups of ${cnftsPerTx}`);
    
    for (let i = 0; i < allCnfts.length; i += cnftsPerTx) {
      const chunk = allCnfts.slice(i, i + cnftsPerTx);
      
      const groupMakerAssets: SwapAsset[] = chunk
        .filter(c => c.side === 'maker')
        .map(c => c.asset);
      const groupTakerAssets: SwapAsset[] = chunk
        .filter(c => c.side === 'taker')
        .map(c => c.asset);
      
      // First transaction gets non-cNFT assets and SOL
      const isFirstGroup = groups.length === 0;
      // Last cNFT transaction gets the platform fee
      const isLastCnftGroup = i + cnftsPerTx >= allCnfts.length;
      
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
   * Check if a swap requires Jito bundle (for any bulk NFT swap)
   */
  requiresJitoBundle(inputs: TransactionGroupInput): boolean {
    console.log('[TransactionGroupBuilder] requiresJitoBundle called');
    
    // If JITO bundles are disabled, always return false
    if (!isJitoBundlesEnabled()) {
      console.log('[TransactionGroupBuilder] JITO bundles disabled via feature flag, returning false');
      return false;
    }
    console.log('[TransactionGroupBuilder] Input makerAssets count:', inputs.makerAssets?.length || 0);
    console.log('[TransactionGroupBuilder] Input takerAssets count:', inputs.takerAssets?.length || 0);
    
    const analysis = this.analyzeSwap(inputs);
    
    // All bundle strategies require Jito for atomic execution
    const bundleStrategies = [
      SwapStrategy.JITO_BUNDLE,
      SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE,
      SwapStrategy.DIRECT_NFT_BUNDLE,
      SwapStrategy.MIXED_NFT_BUNDLE,
    ];
    
    const result = bundleStrategies.includes(analysis.strategy);
    
    console.log('[TransactionGroupBuilder] requiresJitoBundle result:', result, 'strategy:', analysis.strategy);
    
    return result;
  }
  
  /**
   * Estimate the number of transactions needed for a swap
   */
  estimateTransactionCount(inputs: TransactionGroupInput): number {
    const analysis = this.analyzeSwap(inputs);
    return analysis.transactionCount;
  }

  /**
   * Extract cNFT asset info from a transaction in the group
   * Returns the cNFT identifier and transfer direction (maker/taker)
   */
  extractCnftFromTransaction(
    txItem: TransactionGroupItem
  ): { assetId: string; isMaker: boolean } | null {
    // Check if this is a cNFT transfer transaction
    if (!txItem.purpose.includes('cNFT transfer')) {
      return null;
    }

    // Check maker assets first
    const makerCnft = txItem.assets.makerAssets.find(
      a => a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    if (makerCnft) {
      return { assetId: makerCnft.identifier, isMaker: true };
    }

    // Check taker assets
    const takerCnft = txItem.assets.takerAssets.find(
      a => a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
    );
    if (takerCnft) {
      return { assetId: takerCnft.identifier, isMaker: false };
    }

    return null;
  }

  /**
   * Rebuild a single cNFT transaction in a group with fresh Merkle proof.
   * Used when a transaction's proof became stale during client signing.
   *
   * @param originalGroup - The original transaction group
   * @param transactionIndex - Index of transaction to rebuild
   * @param inputs - Original build inputs
   * @returns Updated transaction group item with fresh proof (requires new signature)
   */
  async rebuildCnftTransactionWithFreshProof(
    originalGroup: TransactionGroupResult,
    transactionIndex: number,
    inputs: TransactionGroupInput
  ): Promise<{
    rebuiltTransaction: TransactionGroupItem;
    requiresResigning: boolean;
  }> {
    const txItem = originalGroup.transactions[transactionIndex];
    if (!txItem) {
      throw new Error(`Transaction at index ${transactionIndex} not found in group`);
    }

    // Extract the cNFT from this transaction
    const cnftInfo = this.extractCnftFromTransaction(txItem);
    if (!cnftInfo) {
      throw new Error(`Transaction at index ${transactionIndex} is not a cNFT transfer`);
    }

    console.log(`[TransactionGroupBuilder] Rebuilding transaction ${transactionIndex} with fresh proof for asset ${cnftInfo.assetId.substring(0, 12)}...`);

    // Clear cached proof and fetch fresh
    this.cnftService.clearCachedProof(cnftInfo.assetId);

    // Determine transfer direction
    const fromWallet = cnftInfo.isMaker ? inputs.makerPubkey : inputs.takerPubkey;
    const toWallet = cnftInfo.isMaker ? inputs.takerPubkey : inputs.makerPubkey;

    // Build fresh transfer instruction (no pre-fetched proof - forces validation)
    const transferResult = await this.directBubblegumService.buildTransferInstruction(
      {
        assetId: cnftInfo.assetId,
        fromWallet,
        toWallet,
      },
      0,
      undefined // No pre-fetched proof - this triggers validation in DirectBubblegumService
    );

    // Determine network mode
    const isMainnet = process.env.SOLANA_NETWORK === 'mainnet-beta' ||
                      process.env.NODE_ENV === 'production';
    const useJitoNonces = isMainnet && isJitoBundlesEnabled();

    // Build the transaction with fresh proof
    const cnftInstructions: TransactionInstruction[] = [];

    // Nonce advance for mainnet
    if (useJitoNonces) {
      cnftInstructions.push(
        SystemProgram.nonceAdvance({
          noncePubkey: inputs.nonceAccountPubkey,
          authorizedPubkey: this.platformAuthority.publicKey,
        })
      );
    }

    // Compute budget - 600k CU for deep mainnet trees (30+ proof nodes)
    cnftInstructions.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
    );

    // Transfer instruction with fresh proof
    cnftInstructions.push(transferResult.instruction);

    // Check if this is the last cNFT transaction (needs Jito tip)
    const isLastCnftTx = this.isLastCnftTransaction(originalGroup, transactionIndex);
    if (useJitoNonces && isLastCnftTx) {
      const JITO_TIP_ACCOUNTS = [
        'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
        'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
        'HFqU5x63VTqvQss8hp11i4bVmkdzGHnsRRskfJ2J4ybE',
        '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
        '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
        'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
        'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
      ];

      const jitoTipAccount = new PublicKey(
        JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
      );
      const tipAmount = 1_000_000; // 0.001 SOL

      cnftInstructions.push(
        SystemProgram.transfer({
          fromPubkey: this.platformAuthority.publicKey,
          toPubkey: jitoTipAccount,
          lamports: tipAmount,
        })
      );
    }

    // Get blockhash (use nonce value for mainnet, fresh for devnet)
    let cnftBlockhash: string;
    if (useJitoNonces) {
      cnftBlockhash = originalGroup.nonceValue;
    } else {
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      cnftBlockhash = blockhash;
    }

    const cnftTx = new Transaction({
      recentBlockhash: cnftBlockhash,
      feePayer: this.platformAuthority.publicKey,
    }).add(...cnftInstructions);

    // Partial sign with platform authority
    cnftTx.partialSign(this.platformAuthority);

    const cnftTxSerialized = cnftTx.serialize({ requireAllSignatures: false });
    const cnftTxSize = cnftTxSerialized.length;

    const rebuiltTransaction: TransactionGroupItem = {
      index: transactionIndex,
      purpose: txItem.purpose + ' (rebuilt)',
      assets: txItem.assets,
      transaction: {
        serializedTransaction: cnftTxSerialized.toString('base64'),
        sizeBytes: cnftTxSize,
        isVersioned: false,
        nonceValue: cnftBlockhash,
        estimatedComputeUnits: 200000,
        requiredSigners: txItem.transaction?.requiredSigners || [fromWallet.toBase58()],
      },
      isVersioned: false,
    };

    console.log(`[TransactionGroupBuilder] ✅ Transaction ${transactionIndex} rebuilt with fresh proof: ${cnftTxSize} bytes`);

    return {
      rebuiltTransaction,
      requiresResigning: true,
    };
  }

  /**
   * Check if a transaction is the last cNFT transaction in the group
   */
  private isLastCnftTransaction(group: TransactionGroupResult, txIndex: number): boolean {
    // Find all cNFT transactions
    const cnftTxIndices: number[] = [];
    for (let i = 0; i < group.transactions.length; i++) {
      if (group.transactions[i].purpose.includes('cNFT transfer')) {
        cnftTxIndices.push(i);
      }
    }

    // Check if this is the last one
    return cnftTxIndices.length > 0 && cnftTxIndices[cnftTxIndices.length - 1] === txIndex;
  }

  /**
   * Validate all cNFT proofs in a transaction group before bundle submission.
   * Returns list of transaction indices that have stale proofs.
   */
  async validateCnftProofsInGroup(
    group: TransactionGroupResult
  ): Promise<{
    staleTransactionIndices: number[];
    validationResults: Map<number, { assetId: string; isValid: boolean; onChainRoot: string }>;
  }> {
    console.log('[TransactionGroupBuilder] Validating cNFT proofs in transaction group');

    const staleTransactionIndices: number[] = [];
    const validationResults = new Map<number, { assetId: string; isValid: boolean; onChainRoot: string }>();

    // Collect all cNFT assets with their proofs
    const proofsToValidate = new Map<string, { root: string; tree_id: string }>();
    const assetToTxIndex = new Map<string, number>();

    for (let i = 0; i < group.transactions.length; i++) {
      const txItem = group.transactions[i];
      const cnftInfo = this.extractCnftFromTransaction(txItem);

      if (cnftInfo) {
        // Get the cached proof for this asset
        const cachedProof = await this.cnftService.getCnftProof(cnftInfo.assetId, false, 0);
        if (cachedProof) {
          const assetData = await this.cnftService.getCnftAsset(cnftInfo.assetId);
          proofsToValidate.set(cnftInfo.assetId, {
            root: cachedProof.root,
            tree_id: assetData.compression.tree,
          });
          assetToTxIndex.set(cnftInfo.assetId, i);
        }
      }
    }

    if (proofsToValidate.size === 0) {
      console.log('[TransactionGroupBuilder] No cNFT transactions found in group');
      return { staleTransactionIndices, validationResults };
    }

    // Batch validate all proofs
    const batchResults = await this.cnftService.validateProofRootsBatch(proofsToValidate);

    // Process results
    for (const [assetId, result] of batchResults) {
      const txIndex = assetToTxIndex.get(assetId);
      if (txIndex !== undefined) {
        validationResults.set(txIndex, {
          assetId,
          isValid: result.isValid,
          onChainRoot: result.onChainRoot,
        });

        if (!result.isValid) {
          staleTransactionIndices.push(txIndex);
        }
      }
    }

    console.log('[TransactionGroupBuilder] Proof validation complete:', {
      totalCnftTransactions: proofsToValidate.size,
      staleCount: staleTransactionIndices.length,
      staleIndices: staleTransactionIndices,
    });

    return { staleTransactionIndices, validationResults };
  }

  /**
   * Build a single cNFT transaction Just-In-Time (JIT) for sequential RPC execution.
   * This fetches fresh proof and blockhash immediately before the transaction is needed,
   * solving the stale proof issue that occurs when proofs are fetched upfront but the
   * Merkle tree changes between transaction building and execution.
   *
   * @param cnftAssetId - The cNFT asset ID to transfer
   * @param fromWallet - Source wallet public key
   * @param toWallet - Destination wallet public key
   * @param txPurpose - Description of the transaction purpose
   * @returns A fresh TransactionGroupItem ready for signing and submission
   */
  async buildSingleCnftTransactionJIT(
    cnftAssetId: string,
    fromWallet: PublicKey,
    toWallet: PublicKey,
    txPurpose: string
  ): Promise<TransactionGroupItem> {
    console.log('[TransactionGroupBuilder] Building JIT cNFT transaction:', {
      assetId: cnftAssetId.substring(0, 8) + '...',
      from: fromWallet.toBase58().substring(0, 8) + '...',
      to: toWallet.toBase58().substring(0, 8) + '...',
    });

    // Clear any cached proof for this asset to ensure fresh proof
    this.directBubblegumService.getCnftService().clearCachedProof(cnftAssetId);

    // Get fresh blockhash
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    console.log('[TransactionGroupBuilder] JIT fresh blockhash:', blockhash.substring(0, 16) + '...');

    // Build transfer instruction with fresh proof (retryCount=0 forces validation)
    const transferResult = await this.directBubblegumService.buildTransferInstruction({
      assetId: cnftAssetId,
      fromWallet: fromWallet,
      toWallet: toWallet,
    }, 0); // retryCount=0 forces proof validation

    // Build transaction with compute budget - 600k CU for deep mainnet trees (30+ proof nodes)
    const instructions: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      transferResult.instruction,
    ];

    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: this.platformAuthority.publicKey,
    }).add(...instructions);

    // Partial sign with platform authority
    tx.partialSign(this.platformAuthority);

    const serialized = tx.serialize({ requireAllSignatures: false });
    const sizeBytes = serialized.length;

    console.log('[TransactionGroupBuilder] JIT cNFT transaction built:', {
      sizeBytes,
      proofNodes: transferResult.proofNodes.length,
    });

    return {
      index: 0, // Will be updated by caller if needed
      purpose: txPurpose,
      assets: {
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(0),
      },
      transaction: {
        serializedTransaction: serialized.toString('base64'),
        sizeBytes,
        isVersioned: false,
        nonceValue: blockhash,
        estimatedComputeUnits: 200000,
        requiredSigners: [fromWallet.toBase58()],
      },
      isVersioned: false,
      cnftAssetId,
      cnftFromWallet: fromWallet.toBase58(),
      cnftToWallet: toWallet.toBase58(),
    };
  }

  /**
   * Check if an error string indicates a Bubblegum stale proof error.
   *
   * Bubblegum error 6001 (AssetOwnerMismatch) is returned when the Merkle proof
   * is stale - meaning the tree was modified after the proof was fetched.
   * This is recoverable by refetching proofs and rebuilding transactions.
   *
   * @param errorStr - JSON-stringified error from simulation or transaction
   * @returns true if this is a stale proof error
   */
  private isBubblegumStaleProofError(errorStr: string): boolean {
    return errorStr.includes('6001') || errorStr.includes('Custom(6001)');
  }

  /**
   * Helper to wrap a promise with a timeout.
   * Rejects with a clear error message if the timeout is exceeded.
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  /**
   * Build optimistic cNFT bundle with fresh proofs fetched atomically.
   *
   * This method minimizes the window between proof fetch and transaction execution:
   * 1. Fetches ALL proofs atomically in a single batch call
   * 2. Validates all proofs against on-chain state
   * 3. Builds ALL transactions in parallel
   * 4. Optionally adds Jito tip to last transaction (mainnet only, 3+ assets)
   * 5. Returns timing metrics for monitoring
   *
   * @param cnftAssets - Array of cNFT transfer specifications
   * @param options - Bundle options (priority fee, Jito tip, timeouts)
   * @returns Built transactions with timing metrics
   */
  async buildOptimisticCnftBundle(
    cnftAssets: Array<{ assetId: string; from: PublicKey; to: PublicKey }>,
    options: {
      priorityFeeMicroLamports?: number;
      jitoTipLamports?: number;
      proofFetchTimeoutMs?: number;
      validationTimeoutMs?: number;
      blockhashTimeoutMs?: number;
    } = {}
  ): Promise<{
    transactions: TransactionGroupItem[];
    proofFetchTime: number;
    validationTime: number;
    buildTime: number;
    totalTime: number;
    staleProofsDetected: number;
    isMainnet: boolean;
    jitoTipAdded: boolean;
  }> {
    const startTime = Date.now();

    // Network detection
    const isMainnet = process.env.SOLANA_NETWORK === 'mainnet-beta' ||
      this.connection.rpcEndpoint.includes('mainnet');
    console.log(`[TransactionGroupBuilder] Building optimistic cNFT bundle for ${cnftAssets.length} assets (${isMainnet ? 'mainnet' : 'devnet'})`);

    const assetIds = cnftAssets.map(a => a.assetId);
    const priorityFee = options.priorityFeeMicroLamports ?? 50_000;
    const proofFetchTimeout = options.proofFetchTimeoutMs ?? 30_000;
    const validationTimeout = options.validationTimeoutMs ?? 15_000;
    const blockhashTimeout = options.blockhashTimeoutMs ?? 10_000;

    // Jito tip configuration (only on mainnet with 3+ assets)
    const JITO_TIP_ACCOUNTS = [
      'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
      'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
      'HFqU5x63VTqvQss8hp11i4bVmkdzGHnsRRskfJ2J4ybE',
      '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
      '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
      'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
      'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
      'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    ];
    const shouldAddJitoTip = isMainnet && options.jitoTipLamports && cnftAssets.length >= 3;

    // Step 1: Fetch ALL proofs atomically with timeout
    const proofFetchStart = Date.now();
    let proofs: Map<string, any>;
    try {
      proofs = await this.withTimeout(
        this.cnftService.getProofsAtomically(assetIds),
        proofFetchTimeout,
        'Proof fetch'
      );
    } catch (error: any) {
      console.error(`[TransactionGroupBuilder] Proof fetch failed: ${error.message}`);
      throw error;
    }
    const proofFetchTime = Date.now() - proofFetchStart;
    console.log(`[TransactionGroupBuilder] Atomic proof fetch: ${proofs.size} proofs in ${proofFetchTime}ms`);

    // Check if we got all proofs
    if (proofs.size !== assetIds.length) {
      const missing = assetIds.filter(id => !proofs.has(id));
      throw new Error(`Failed to fetch proofs for ${missing.length} assets: ${missing.map(id => id.substring(0, 8)).join(', ')}`);
    }

    // Step 2: Validate all proofs against on-chain state with timeout
    const validationStart = Date.now();
    let validation: { valid: string[]; stale: string[]; validationTimeMs: number };
    try {
      validation = await this.withTimeout(
        this.cnftService.validateProofsFreshness(proofs),
        validationTimeout,
        'Proof validation'
      );
    } catch (error: any) {
      console.error(`[TransactionGroupBuilder] Proof validation failed: ${error.message}`);
      throw error;
    }
    const validationTime = Date.now() - validationStart;
    console.log(`[TransactionGroupBuilder] Proof validation: ${validation.valid.length} valid, ${validation.stale.length} stale in ${validationTime}ms`);

    let staleProofsDetected = validation.stale.length;

    // If any proofs are stale, refetch only those
    if (validation.stale.length > 0) {
      console.log(`[TransactionGroupBuilder] Refetching ${validation.stale.length} stale proofs...`);
      try {
        const freshProofs = await this.withTimeout(
          this.cnftService.getProofsAtomically(validation.stale),
          proofFetchTimeout,
          'Stale proof refetch'
        );
        for (const [assetId, proof] of freshProofs) {
          proofs.set(assetId, proof);
        }
      } catch (error: any) {
        console.error(`[TransactionGroupBuilder] Stale proof refetch failed: ${error.message}`);
        throw error;
      }
    }

    // Step 3: Get fresh blockhash with timeout
    let blockhash: string;
    try {
      const result = await this.withTimeout(
        this.connection.getLatestBlockhash('confirmed'),
        blockhashTimeout,
        'Blockhash fetch'
      );
      blockhash = result.blockhash;
    } catch (error: any) {
      console.error(`[TransactionGroupBuilder] Blockhash fetch failed: ${error.message}`);
      throw error;
    }
    console.log(`[TransactionGroupBuilder] Fresh blockhash: ${blockhash.substring(0, 16)}...`);

    // Step 4: Build ALL transactions in parallel
    const buildStart = Date.now();
    const transactionPromises = cnftAssets.map(async (asset, index) => {
      const proof = proofs.get(asset.assetId);
      if (!proof) {
        throw new Error(`No proof available for asset ${asset.assetId.substring(0, 8)}...`);
      }

      // Build transfer instruction using direct bubblegum service
      // Note: directBubblegumService.buildTransferInstruction fetches asset data internally
      const transferResult = await this.directBubblegumService.buildTransferInstruction({
        assetId: asset.assetId,
        fromWallet: asset.from,
        toWallet: asset.to,
      }, 0);

      // Build transaction with compute budget and priority fee
      const instructions: TransactionInstruction[] = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
        transferResult.instruction,
      ];

      // Add Jito tip to LAST transaction only (Jito requirement)
      const isLastTransaction = index === cnftAssets.length - 1;
      if (shouldAddJitoTip && isLastTransaction) {
        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        console.log(`[TransactionGroupBuilder] Adding Jito tip: ${options.jitoTipLamports} lamports to ${jitoTipAccount.toBase58().substring(0, 12)}...`);
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: this.platformAuthority.publicKey,
            toPubkey: jitoTipAccount,
            lamports: options.jitoTipLamports!,
          })
        );
      }

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: this.platformAuthority.publicKey,
      }).add(...instructions);

      // Partial sign with platform authority
      tx.partialSign(this.platformAuthority);

      const serialized = tx.serialize({ requireAllSignatures: false });

      return {
        index,
        purpose: `cNFT transfer ${index + 1}/${cnftAssets.length}`,
        assets: {
          makerAssets: [],
          takerAssets: [],
          makerSolLamports: BigInt(0),
          takerSolLamports: BigInt(0),
          platformFeeLamports: BigInt(0),
        },
        transaction: {
          serializedTransaction: serialized.toString('base64'),
          sizeBytes: serialized.length,
          isVersioned: false,
          nonceValue: blockhash,
          estimatedComputeUnits: 600_000,
          requiredSigners: [asset.from.toBase58()],
        },
        isVersioned: false,
        cnftAssetId: asset.assetId,
        cnftFromWallet: asset.from.toBase58(),
        cnftToWallet: asset.to.toBase58(),
      } as TransactionGroupItem;
    });

    const transactions = await Promise.all(transactionPromises);
    const buildTime = Date.now() - buildStart;
    const totalTime = Date.now() - startTime;

    console.log(`[TransactionGroupBuilder] Optimistic bundle built: ${transactions.length} TXs in ${totalTime}ms`);
    console.log(`[TransactionGroupBuilder] Timing breakdown: proof=${proofFetchTime}ms, validate=${validationTime}ms, build=${buildTime}ms`);
    if (shouldAddJitoTip) {
      console.log(`[TransactionGroupBuilder] Jito tip added: ${options.jitoTipLamports} lamports`);
    }

    return {
      transactions,
      proofFetchTime,
      validationTime,
      buildTime,
      totalTime,
      staleProofsDetected,
      isMainnet,
      jitoTipAdded: !!shouldAddJitoTip,
    };
  }

  /**
   * Simulate transactions and retry with fresh proofs if stale proof errors detected.
   *
   * @param transactions - Array of transactions to simulate
   * @param maxAttempts - Maximum retry attempts (default: 5)
   * @param rebuildFn - Function to rebuild transactions with fresh proofs
   * @returns Simulation results
   */
  async simulateAndRetry(
    transactions: Transaction[],
    maxAttempts: number = 5,
    rebuildFn: () => Promise<Transaction[]>
  ): Promise<{
    simulatedTransactions: Transaction[];
    attemptCount: number;
    allSimulationsPass: boolean;
    staleProofRetries: number;
    errors: string[];
  }> {
    let currentTransactions = transactions;
    let staleProofRetries = 0;
    const errors: string[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[TransactionGroupBuilder] Simulation attempt ${attempt}/${maxAttempts}`);

      let allPass = true;
      let hasStaleProof = false;

      for (let i = 0; i < currentTransactions.length; i++) {
        const tx = currentTransactions[i];

        try {
          // Use legacy simulateTransaction overload for Transaction objects
          const simResult = await this.connection.simulateTransaction(tx);

          if (simResult.value.err) {
            const errorStr = JSON.stringify(simResult.value.err);
            console.log(`[TransactionGroupBuilder] TX ${i + 1} simulation failed: ${errorStr}`);

            // Check for stale proof error (Bubblegum error 6001) - recoverable via rebuild
            if (this.isBubblegumStaleProofError(errorStr)) {
              hasStaleProof = true;
              allPass = false;
              console.log(`[TransactionGroupBuilder] Stale proof detected in TX ${i + 1}`);
            } else {
              // Non-stale-proof error - not recoverable, record it
              errors.push(`TX ${i + 1}: ${errorStr}`);
              allPass = false;
            }
          } else {
            console.log(`[TransactionGroupBuilder] TX ${i + 1} simulation passed`);
          }
        } catch (simError: any) {
          console.error(`[TransactionGroupBuilder] TX ${i + 1} simulation error: ${simError.message}`);
          errors.push(`TX ${i + 1}: ${simError.message}`);
          allPass = false;
        }
      }

      if (allPass) {
        console.log(`[TransactionGroupBuilder] All ${currentTransactions.length} simulations passed on attempt ${attempt}`);
        return {
          simulatedTransactions: currentTransactions,
          attemptCount: attempt,
          allSimulationsPass: true,
          staleProofRetries,
          errors: [],
        };
      }

      if (hasStaleProof && attempt < maxAttempts) {
        staleProofRetries++;
        console.log(`[TransactionGroupBuilder] Stale proof detected, rebuilding transactions...`);

        try {
          currentTransactions = await rebuildFn();
          console.log(`[TransactionGroupBuilder] Transactions rebuilt, retrying simulation...`);
        } catch (rebuildError: any) {
          console.error(`[TransactionGroupBuilder] Rebuild failed: ${rebuildError.message}`);
          errors.push(`Rebuild failed: ${rebuildError.message}`);
          break;
        }
      } else if (!hasStaleProof) {
        // Non-stale-proof errors - don't retry
        console.log(`[TransactionGroupBuilder] Non-stale-proof errors detected, stopping retry loop`);
        break;
      }
    }

    console.log(`[TransactionGroupBuilder] Simulation failed after ${maxAttempts} attempts`);
    return {
      simulatedTransactions: currentTransactions,
      attemptCount: maxAttempts,
      allSimulationsPass: false,
      staleProofRetries,
      errors,
    };
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

/**
 * Re-export AssetType for convenience
 */
export { AssetType };

/**
 * Simplified swap analysis input (for quote endpoint)
 */
export interface SwapAnalysisInput {
  makerAssets: Array<{ mint: string; type: AssetType }>;
  takerAssets: Array<{ mint: string; type: AssetType }>;
  makerSolLamports: bigint;
  takerSolLamports: bigint;
  platformFeeLamports: bigint;
  forceSingleTransaction?: boolean;
}

/**
 * Standalone function to analyze swap strategy without requiring full builder instantiation.
 * Useful for quote endpoints that just need to determine strategy and transaction count.
 */
export function analyzeSwapStrategy(inputs: SwapAnalysisInput): SwapAnalysis {
  // Count assets by type
  const makerCnfts = inputs.makerAssets.filter(a => 
    a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
  ).length;
  const takerCnfts = inputs.takerAssets.filter(a => 
    a.type === AssetType.CNFT || String(a.type).toLowerCase() === 'cnft'
  ).length;
  const totalCnfts = makerCnfts + takerCnfts;
  
  // Count SPL NFTs
  const makerNfts = inputs.makerAssets.filter(a => 
    a.type === AssetType.NFT || String(a.type).toLowerCase() === 'nft'
  ).length;
  const takerNfts = inputs.takerAssets.filter(a => 
    a.type === AssetType.NFT || String(a.type).toLowerCase() === 'nft'
  ).length;
  const totalNfts = makerNfts + takerNfts;
  
  // Count Core NFTs
  const makerCoreNfts = inputs.makerAssets.filter(a => 
    a.type === AssetType.CORE_NFT || String(a.type).toLowerCase() === 'core_nft'
  ).length;
  const takerCoreNfts = inputs.takerAssets.filter(a => 
    a.type === AssetType.CORE_NFT || String(a.type).toLowerCase() === 'core_nft'
  ).length;
  const totalCoreNfts = makerCoreNfts + takerCoreNfts;
  
  const totalAllNfts = totalCnfts + totalNfts + totalCoreNfts;
  const hasSolTransfer = inputs.makerSolLamports > BigInt(0) || inputs.takerSolLamports > BigInt(0);
  
  // Determine strategy (same logic as TransactionGroupBuilder.analyzeSwap)
  let strategy: SwapStrategy;
  let transactionCount: number;
  let reason: string;
  
  if (inputs.forceSingleTransaction) {
    if (totalCnfts > 0) {
      strategy = SwapStrategy.CANNOT_FIT;
      transactionCount = 0;
      reason = 'cNFT swaps require Jito bundles (cannot fit in single transaction)';
    } else if (totalAllNfts > 2) {
      strategy = SwapStrategy.CANNOT_FIT;
      transactionCount = 0;
      reason = `Bulk NFT swaps (${totalAllNfts} NFTs) require Jito bundles`;
    } else {
      strategy = SwapStrategy.SINGLE_TRANSACTION;
      transactionCount = 1;
      reason = 'Forced single transaction';
    }
  } else if (totalCnfts > 0) {
    // ANY swap with cNFTs needs bundle
    const cnftsPerTx = MAX_CNFTS_PER_TRANSACTION;
    const splPerTx = MAX_SPL_NFTS_PER_TRANSACTION;
    const corePerTx = MAX_CORE_NFTS_PER_TRANSACTION;
    
    const cnftTxCount = Math.ceil(totalCnfts / cnftsPerTx);
    const splTxCount = totalNfts > 0 ? Math.ceil(totalNfts / splPerTx) : 0;
    const coreTxCount = totalCoreNfts > 0 ? Math.ceil(totalCoreNfts / corePerTx) : 0;
    const needsSolTx = hasSolTransfer || inputs.platformFeeLamports > BigInt(0);
    
    transactionCount = cnftTxCount + splTxCount + coreTxCount + (needsSolTx ? 1 : 0);
    
    if (transactionCount > MAX_TRANSACTIONS_PER_BUNDLE) {
      strategy = SwapStrategy.CANNOT_FIT;
      reason = `Swap would require ${transactionCount} transactions, exceeding Jito's ${MAX_TRANSACTIONS_PER_BUNDLE} limit`;
    } else if (totalNfts === 0 && totalCoreNfts === 0) {
      strategy = SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE;
      reason = `${totalCnfts} cNFT(s) using direct Bubblegum bundle (${transactionCount} transactions)`;
    } else {
      strategy = SwapStrategy.MIXED_NFT_BUNDLE;
      reason = `Mixed swap with cNFTs: ${totalCnfts} cNFTs + ${totalNfts} SPL + ${totalCoreNfts} Core (${transactionCount} transactions)`;
    }
  } else if (totalAllNfts <= 2) {
    // Simple swap - check per-side limits
    const makerNftCount = makerNfts + makerCoreNfts;
    const takerNftCount = takerNfts + takerCoreNfts;
    
    if (makerNftCount <= 1 && takerNftCount <= 1) {
      strategy = SwapStrategy.SINGLE_TRANSACTION;
      transactionCount = 1;
      reason = 'Simple swap (1 NFT per side max) - standard single transaction via escrow';
    } else {
      strategy = SwapStrategy.DIRECT_NFT_BUNDLE;
      transactionCount = 2;
      reason = `${totalAllNfts} NFTs with ${Math.max(makerNftCount, takerNftCount)} on one side - using direct bundle`;
    }
  } else if (totalNfts >= JITO_BUNDLE_THRESHOLD && totalCoreNfts === 0) {
    // Bulk SPL NFT swap
    const splPerTx = MAX_SPL_NFTS_PER_TRANSACTION;
    const splTxCount = Math.ceil(totalNfts / splPerTx);
    const needsSolTx = hasSolTransfer || inputs.platformFeeLamports > BigInt(0);
    transactionCount = splTxCount + (needsSolTx ? 1 : 0);
    
    if (transactionCount > MAX_TRANSACTIONS_PER_BUNDLE) {
      strategy = SwapStrategy.CANNOT_FIT;
      reason = `${totalNfts} SPL NFTs would require ${transactionCount} transactions, exceeding Jito's ${MAX_TRANSACTIONS_PER_BUNDLE} limit`;
    } else {
      strategy = SwapStrategy.DIRECT_NFT_BUNDLE;
      reason = `${totalNfts} SPL NFT(s) using direct token bundle (${transactionCount} transactions)`;
    }
  } else if (totalCoreNfts >= JITO_BUNDLE_THRESHOLD && totalNfts === 0) {
    // Bulk Core NFT swap
    const corePerTx = MAX_CORE_NFTS_PER_TRANSACTION;
    const coreTxCount = Math.ceil(totalCoreNfts / corePerTx);
    const needsSolTx = hasSolTransfer || inputs.platformFeeLamports > BigInt(0);
    transactionCount = coreTxCount + (needsSolTx ? 1 : 0);
    
    if (transactionCount > MAX_TRANSACTIONS_PER_BUNDLE) {
      strategy = SwapStrategy.CANNOT_FIT;
      reason = `${totalCoreNfts} Core NFTs would require ${transactionCount} transactions, exceeding Jito's ${MAX_TRANSACTIONS_PER_BUNDLE} limit`;
    } else {
      strategy = SwapStrategy.DIRECT_NFT_BUNDLE;
      reason = `${totalCoreNfts} Core NFT(s) using direct token bundle (${transactionCount} transactions)`;
    }
  } else if (totalAllNfts >= JITO_BUNDLE_THRESHOLD) {
    // Mixed NFT types
    const splPerTx = MAX_SPL_NFTS_PER_TRANSACTION;
    const corePerTx = MAX_CORE_NFTS_PER_TRANSACTION;
    
    const splTxCount = totalNfts > 0 ? Math.ceil(totalNfts / splPerTx) : 0;
    const coreTxCount = totalCoreNfts > 0 ? Math.ceil(totalCoreNfts / corePerTx) : 0;
    const needsSolTx = hasSolTransfer || inputs.platformFeeLamports > BigInt(0);
    
    transactionCount = splTxCount + coreTxCount + (needsSolTx ? 1 : 0);
    
    if (transactionCount > MAX_TRANSACTIONS_PER_BUNDLE) {
      strategy = SwapStrategy.CANNOT_FIT;
      reason = `Mixed NFT swap would require ${transactionCount} transactions, exceeding Jito's ${MAX_TRANSACTIONS_PER_BUNDLE} limit`;
    } else {
      strategy = SwapStrategy.MIXED_NFT_BUNDLE;
      reason = `Mixed NFT swap: ${totalNfts} SPL + ${totalCoreNfts} Core (${transactionCount} transactions)`;
    }
  } else {
    // Fallback
    strategy = SwapStrategy.SINGLE_TRANSACTION;
    transactionCount = 1;
    reason = 'Simple swap - standard single transaction via escrow';
  }
  
  return {
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
}

