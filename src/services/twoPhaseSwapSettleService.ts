/**
 * Two-Phase Swap Settle Service
 *
 * Handles Phase B (Settlement Phase) of two-phase swaps:
 * - Triggered automatically when Status = FULLY_LOCKED
 * - Calculates settlement chunks based on asset types and proof sizes
 * - Executes transfers in chunks with progress tracking
 * - Implements retry logic for failed transactions
 *
 * Transfer Instructions per chunk:
 * - cNFT: Bubblegum transfer with delegate authority
 * - SOL: Transfer from escrow PDA
 *
 * @see .taskmaster/tasks/task_010_cnft-delegation-swap.txt
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  Transaction,
  Keypair,
  sendAndConfirmTransaction,
  TransactionSignature,
} from '@solana/web3.js';
import { PrismaClient, TwoPhaseSwapStatus } from '../generated/prisma';
import {
  CnftDelegationService,
  createCnftDelegationService,
  TransferAsDelegateParams,
} from './cnftDelegationService';
import {
  SwapStateMachine,
  createSwapStateMachine,
  SwapAsset,
  TwoPhaseSwapData,
} from './swapStateMachine';
import { TWO_PHASE_SWAP_SEEDS } from './twoPhaseSwapLockService';

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum number of cNFT transfers per transaction
 * Deep trees (proof > 20 nodes): 1 cNFT/tx
 * Shallow trees (proof <= 10 nodes): 2 cNFTs/tx
 */
export const CNFT_CHUNK_LIMITS = {
  /** Deep tree threshold (proof nodes > this value = 1 cNFT per tx) */
  DEEP_TREE_THRESHOLD: 20,
  /** Shallow tree threshold (proof nodes <= this value = 2 cNFTs per tx) */
  SHALLOW_TREE_THRESHOLD: 10,
  /** Maximum cNFTs per tx for deep trees */
  MAX_CNFTS_DEEP_TREE: 1,
  /** Maximum cNFTs per tx for shallow trees */
  MAX_CNFTS_SHALLOW_TREE: 2,
};

/**
 * Transaction size limit (Solana's 1232 byte limit with some buffer)
 */
export const TX_SIZE_LIMIT = 1200;

/**
 * Default retry configuration
 */
export const RETRY_CONFIG = {
  /** Maximum retry attempts per chunk */
  MAX_RETRIES: 3,
  /** Base delay between retries (ms) */
  BASE_DELAY_MS: 1000,
  /** Exponential backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
};

// =============================================================================
// Types
// =============================================================================

/**
 * Settlement chunk containing transfers to execute in a single transaction
 */
export interface SettlementChunk {
  /** Chunk index (0-based) */
  index: number;
  /** Assets to transfer in this chunk */
  assets: SettlementTransfer[];
  /** SOL transfers for this chunk (lamports) */
  solTransfers: SolTransfer[];
  /** Estimated transaction size in bytes */
  estimatedSize: number;
  /** Purpose description for debugging */
  purpose: string;
}

/**
 * Single asset transfer within a chunk
 */
export interface SettlementTransfer {
  /** Asset ID (mint or cNFT asset ID) */
  assetId: string;
  /** Asset type */
  type: 'NFT' | 'CNFT' | 'CORE_NFT';
  /** Source wallet */
  from: string;
  /** Destination wallet */
  to: string;
  /** From party (A or B) */
  fromParty: 'A' | 'B';
}

/**
 * SOL transfer within a chunk
 */
export interface SolTransfer {
  /** Source (vault PDA or wallet) */
  from: string;
  /** Destination wallet */
  to: string;
  /** Amount in lamports */
  amount: bigint;
  /** From party (A or B) */
  fromParty: 'A' | 'B';
  /** Transfer type */
  type: 'escrow_release' | 'platform_fee';
}

/**
 * Result of calculating settlement chunks
 */
export interface ChunkCalculationResult {
  /** List of settlement chunks */
  chunks: SettlementChunk[];
  /** Total number of chunks */
  totalChunks: number;
  /** Total assets being transferred */
  totalAssets: number;
  /** Strategy used */
  strategy: 'single_tx' | 'chunked' | 'jito_bundle';
}

/**
 * Result of executing a single chunk
 */
export interface ChunkExecutionResult {
  /** Chunk index */
  chunkIndex: number;
  /** Transaction signature */
  signature: string;
  /** Whether the chunk was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Number of retries attempted */
  retryCount: number;
}

/**
 * Result of executing full settlement
 */
export interface SettlementResult {
  /** Overall success status */
  success: boolean;
  /** Final swap data */
  swap: TwoPhaseSwapData;
  /** Results for each chunk */
  chunkResults: ChunkExecutionResult[];
  /** Total execution time in ms */
  executionTimeMs: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Settlement progress data for polling
 */
export interface SettlementProgress {
  /** Swap ID */
  swapId: string;
  /** Current status */
  status: TwoPhaseSwapStatus;
  /** Current chunk being processed */
  currentChunk: number;
  /** Total chunks to process */
  totalChunks: number;
  /** Completed transaction signatures */
  completedTxs: string[];
  /** Progress percentage (0-100) */
  percentComplete: number;
  /** Estimated time remaining (ms) */
  estimatedTimeRemainingMs?: number;
  /** Error if any */
  error?: string;
}

/**
 * Parameters for starting settlement
 */
export interface StartSettlementParams {
  /** Swap ID */
  swapId: string;
  /** Triggered by (wallet or 'system') */
  triggeredBy: string;
}

/**
 * Error types for settle service
 */
export class SettleServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettleServiceError';
  }
}

export class SwapNotReadyError extends SettleServiceError {
  constructor(swapId: string, currentStatus: string) {
    super(
      `Swap ${swapId} is not ready for settlement. Current status: ${currentStatus}. ` +
        `Required status: ${TwoPhaseSwapStatus.FULLY_LOCKED}`
    );
    this.name = 'SwapNotReadyError';
  }
}

export class ChunkExecutionError extends SettleServiceError {
  public readonly chunkIndex: number;
  public readonly retryCount: number;

  constructor(chunkIndex: number, retryCount: number, reason: string) {
    super(`Chunk ${chunkIndex} failed after ${retryCount} retries: ${reason}`);
    this.name = 'ChunkExecutionError';
    this.chunkIndex = chunkIndex;
    this.retryCount = retryCount;
  }
}

// =============================================================================
// Main Service Class
// =============================================================================

/**
 * Two-Phase Swap Settle Service
 *
 * Executes settlement phase for two-phase swaps:
 * - Validates swap is fully locked
 * - Calculates optimal chunking strategy
 * - Executes transfers with retry logic
 * - Tracks progress for client polling
 */
export class TwoPhaseSwapSettleService {
  private connection: Connection;
  private prisma: PrismaClient;
  private delegationService: CnftDelegationService;
  private stateMachine: SwapStateMachine;
  private programId: PublicKey;
  private feeCollector: PublicKey;
  private backendSigner: Keypair;

  constructor(
    connection: Connection,
    prisma: PrismaClient,
    programId: PublicKey,
    feeCollector: PublicKey,
    backendSigner: Keypair
  ) {
    this.connection = connection;
    this.prisma = prisma;
    this.programId = programId;
    this.feeCollector = feeCollector;
    this.backendSigner = backendSigner;
    this.delegationService = createCnftDelegationService(connection);
    this.stateMachine = createSwapStateMachine(prisma);

    console.log('[TwoPhaseSwapSettleService] Initialized');
    console.log('[TwoPhaseSwapSettleService] Program ID:', programId.toBase58());
    console.log('[TwoPhaseSwapSettleService] Fee Collector:', feeCollector.toBase58());
  }

  // ===========================================================================
  // PDA Derivation (same as lock service)
  // ===========================================================================

  /**
   * Derive the marketplace delegate PDA for a swap
   */
  deriveDelegatePDA(swapId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(TWO_PHASE_SWAP_SEEDS.DELEGATE_AUTHORITY),
        Buffer.from(swapId),
      ],
      this.programId
    );
  }

  /**
   * Derive SOL vault PDA for a specific party's escrow
   */
  deriveSolVaultPDA(swapId: string, party: 'A' | 'B'): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(TWO_PHASE_SWAP_SEEDS.SOL_VAULT),
        Buffer.from(swapId),
        Buffer.from(party),
      ],
      this.programId
    );
  }

  // ===========================================================================
  // Chunk Calculation
  // ===========================================================================

  /**
   * Calculate settlement chunks based on assets and their proof sizes
   *
   * Chunking Strategy:
   * - 1-2 cNFT transfers per tx (based on proof size)
   * - SOL transfers can batch more
   * - Consider 1232 byte tx limit
   *
   * @param swap - The swap data
   * @returns Chunk calculation result
   */
  async calculateSettlementChunks(
    swap: TwoPhaseSwapData
  ): Promise<ChunkCalculationResult> {
    console.log('[TwoPhaseSwapSettleService] Calculating settlement chunks:', {
      swapId: swap.id,
      assetsA: swap.assetsA.length,
      assetsB: swap.assetsB.length,
      solAmountA: swap.solAmountA?.toString(),
      solAmountB: swap.solAmountB?.toString(),
    });

    // Validate that both parties are present (required for settlement)
    if (!swap.partyB) {
      throw new SettleServiceError(
        `Cannot calculate settlement chunks: swap ${swap.id} has no counterparty (partyB). ` +
        `This is an open swap that hasn't been accepted yet.`
      );
    }

    const chunks: SettlementChunk[] = [];
    let currentChunk: SettlementChunk | null = null;

    // Helper to start a new chunk
    const startNewChunk = (purpose: string): SettlementChunk => {
      return {
        index: chunks.length,
        assets: [],
        solTransfers: [],
        estimatedSize: 100, // Base transaction overhead
        purpose,
      };
    };

    // Helper to finalize current chunk and start new one
    const finalizeChunk = () => {
      if (currentChunk && (currentChunk.assets.length > 0 || currentChunk.solTransfers.length > 0)) {
        chunks.push(currentChunk);
      }
    };

    // Process cNFT assets first (they need the most space)
    // Party A's assets go to Party B
    const cnftAssetsA = swap.assetsA.filter((a) => a.type === 'CNFT');
    // Party B's assets go to Party A
    const cnftAssetsB = swap.assetsB.filter((a) => a.type === 'CNFT');

    // Estimate proof sizes and group cNFTs
    for (const asset of cnftAssetsA) {
      const proofSize = await this.estimateProofSize(asset.identifier);
      const transfer: SettlementTransfer = {
        assetId: asset.identifier,
        type: 'CNFT',
        from: swap.partyA,
        to: swap.partyB!,
        fromParty: 'A',
      };

      const estimatedInstructionSize = 200 + proofSize * 32;

      // Check if we need a new chunk
      if (!currentChunk) {
        currentChunk = startNewChunk(`cNFT transfers A→B`);
      }

      // Check chunk capacity based on proof size
      const maxCnfts =
        proofSize > CNFT_CHUNK_LIMITS.DEEP_TREE_THRESHOLD
          ? CNFT_CHUNK_LIMITS.MAX_CNFTS_DEEP_TREE
          : CNFT_CHUNK_LIMITS.MAX_CNFTS_SHALLOW_TREE;

      if (
        currentChunk.assets.length >= maxCnfts ||
        currentChunk.estimatedSize + estimatedInstructionSize > TX_SIZE_LIMIT
      ) {
        finalizeChunk();
        currentChunk = startNewChunk(`cNFT transfers A→B (continued)`);
      }

      currentChunk.assets.push(transfer);
      currentChunk.estimatedSize += estimatedInstructionSize;
    }

    // Process Party B's cNFTs
    for (const asset of cnftAssetsB) {
      const proofSize = await this.estimateProofSize(asset.identifier);
      const transfer: SettlementTransfer = {
        assetId: asset.identifier,
        type: 'CNFT',
        from: swap.partyB!,
        to: swap.partyA,
        fromParty: 'B',
      };

      const estimatedInstructionSize = 200 + proofSize * 32;

      if (!currentChunk) {
        currentChunk = startNewChunk(`cNFT transfers B→A`);
      }

      const maxCnfts =
        proofSize > CNFT_CHUNK_LIMITS.DEEP_TREE_THRESHOLD
          ? CNFT_CHUNK_LIMITS.MAX_CNFTS_DEEP_TREE
          : CNFT_CHUNK_LIMITS.MAX_CNFTS_SHALLOW_TREE;

      if (
        currentChunk.assets.length >= maxCnfts ||
        currentChunk.estimatedSize + estimatedInstructionSize > TX_SIZE_LIMIT
      ) {
        finalizeChunk();
        currentChunk = startNewChunk(`cNFT transfers B→A`);
      }

      currentChunk.assets.push(transfer);
      currentChunk.estimatedSize += estimatedInstructionSize;
    }

    // Finalize any remaining cNFT chunk
    finalizeChunk();

    // Create SOL transfer chunk (can usually fit in one tx)
    const solTransfers: SolTransfer[] = [];

    // Party A's SOL goes to Party B
    if (swap.solAmountA && swap.solAmountA > BigInt(0)) {
      const [vaultA] = this.deriveSolVaultPDA(swap.id, 'A');
      solTransfers.push({
        from: vaultA.toBase58(),
        to: swap.partyB!,
        amount: swap.solAmountA,
        fromParty: 'A',
        type: 'escrow_release',
      });
    }

    // Party B's SOL goes to Party A
    if (swap.solAmountB && swap.solAmountB > BigInt(0)) {
      const [vaultB] = this.deriveSolVaultPDA(swap.id, 'B');
      solTransfers.push({
        from: vaultB.toBase58(),
        to: swap.partyA,
        amount: swap.solAmountB,
        fromParty: 'B',
        type: 'escrow_release',
      });
    }

    // Platform fee (if any)
    if (swap.platformFeeLamports > BigInt(0)) {
      // Fee is typically taken from the higher SOL amount side
      // For simplicity, we'll add this as a separate transfer
      solTransfers.push({
        from: 'fee_source', // Will be calculated at execution
        to: this.feeCollector.toBase58(),
        amount: swap.platformFeeLamports,
        fromParty: swap.solAmountA && swap.solAmountA > (swap.solAmountB || BigInt(0)) ? 'A' : 'B',
        type: 'platform_fee',
      });
    }

    // Add SOL transfers as a separate chunk if any
    if (solTransfers.length > 0) {
      const solChunk = startNewChunk('SOL transfers');
      solChunk.solTransfers = solTransfers;
      solChunk.estimatedSize += solTransfers.length * 64; // ~64 bytes per SOL transfer
      chunks.push(solChunk);
    }

    // Determine strategy
    let strategy: 'single_tx' | 'chunked' | 'jito_bundle';
    if (chunks.length === 1) {
      strategy = 'single_tx';
    } else if (chunks.length <= 3) {
      strategy = 'chunked';
    } else {
      strategy = 'jito_bundle';
    }

    const totalAssets = swap.assetsA.length + swap.assetsB.length;

    console.log('[TwoPhaseSwapSettleService] Chunks calculated:', {
      swapId: swap.id,
      totalChunks: chunks.length,
      totalAssets,
      strategy,
      chunks: chunks.map((c) => ({
        index: c.index,
        assets: c.assets.length,
        solTransfers: c.solTransfers.length,
        size: c.estimatedSize,
        purpose: c.purpose,
      })),
    });

    return {
      chunks,
      totalChunks: chunks.length,
      totalAssets,
      strategy,
    };
  }

  /**
   * Estimate proof size for a cNFT
   *
   * @param assetId - cNFT asset ID
   * @returns Estimated proof node count
   */
  private async estimateProofSize(assetId: string): Promise<number> {
    try {
      const cnftService = this.delegationService.getCnftService();
      const proof = await cnftService.getCnftProof(assetId, false);
      return proof.proof?.length || 0;
    } catch (error) {
      console.warn(
        `[TwoPhaseSwapSettleService] Failed to get proof size for ${assetId}, using default:`,
        error
      );
      // Default to deep tree assumption for safety
      return 24;
    }
  }

  // ===========================================================================
  // Settlement Execution
  // ===========================================================================

  /**
   * Start and execute the settlement phase
   *
   * This is the main entry point for settlement. It:
   * 1. Validates the swap is FULLY_LOCKED
   * 2. Transitions to SETTLING status
   * 3. Calculates chunks
   * 4. Executes each chunk with retry logic
   * 5. Transitions to COMPLETED or FAILED
   *
   * @param params - Settlement parameters
   * @returns Settlement result
   */
  async startSettlement(params: StartSettlementParams): Promise<SettlementResult> {
    const startTime = Date.now();
    const chunkResults: ChunkExecutionResult[] = [];

    console.log('[TwoPhaseSwapSettleService] Starting settlement:', {
      swapId: params.swapId,
      triggeredBy: params.triggeredBy,
    });

    // Get swap data
    const swap = await this.stateMachine.getSwap(params.swapId);
    if (!swap) {
      throw new SettleServiceError(`Swap not found: ${params.swapId}`);
    }

    // Validate status
    if (swap.status !== TwoPhaseSwapStatus.FULLY_LOCKED) {
      throw new SwapNotReadyError(params.swapId, swap.status);
    }

    // Calculate chunks
    const chunkResult = await this.calculateSettlementChunks(swap);

    // Transition to SETTLING
    const startResult = await this.stateMachine.startSettlement(
      params.swapId,
      chunkResult.totalChunks,
      params.triggeredBy
    );

    if (!startResult.success || !startResult.swap) {
      throw new SettleServiceError(
        `Failed to start settlement: ${startResult.error}`
      );
    }

    // Execute each chunk
    let currentSwap = startResult.swap;
    let hasError = false;
    let errorMessage: string | undefined;

    for (const chunk of chunkResult.chunks) {
      try {
        const result = await this.executeChunkWithRetry(
          params.swapId,
          chunk,
          currentSwap,
          params.triggeredBy
        );

        chunkResults.push(result);

        if (!result.success) {
          hasError = true;
          errorMessage = result.error;
          break;
        }

        // Update swap reference after recording
        const updatedSwap = await this.stateMachine.getSwap(params.swapId);
        if (updatedSwap) {
          currentSwap = updatedSwap;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        hasError = true;
        errorMessage = err.message;
        chunkResults.push({
          chunkIndex: chunk.index,
          signature: '',
          success: false,
          error: err.message,
          retryCount: RETRY_CONFIG.MAX_RETRIES,
        });
        break;
      }
    }

    // Handle failure - must update state BEFORE fetching final swap
    if (hasError) {
      await this.stateMachine.failSwap(
        params.swapId,
        errorMessage || 'Unknown settlement error',
        'SETTLEMENT_FAILED',
        params.triggeredBy
      );
    }

    // Get final swap state AFTER any status updates
    const finalSwap = (await this.stateMachine.getSwap(params.swapId))!;

    const executionTimeMs = Date.now() - startTime;

    console.log('[TwoPhaseSwapSettleService] Settlement complete:', {
      swapId: params.swapId,
      success: !hasError,
      chunksCompleted: chunkResults.filter((r) => r.success).length,
      totalChunks: chunkResult.totalChunks,
      executionTimeMs,
    });

    return {
      success: !hasError,
      swap: finalSwap,
      chunkResults,
      executionTimeMs,
      error: errorMessage,
    };
  }

  /**
   * Execute a single chunk with retry logic
   *
   * @param swapId - Swap ID
   * @param chunk - The chunk to execute
   * @param swap - Current swap data
   * @param triggeredBy - Who triggered the settlement
   * @returns Chunk execution result
   */
  private async executeChunkWithRetry(
    swapId: string,
    chunk: SettlementChunk,
    swap: TwoPhaseSwapData,
    triggeredBy: string
  ): Promise<ChunkExecutionResult> {
    let lastError: Error | null = null;
    let retryCount = 0;

    while (retryCount < RETRY_CONFIG.MAX_RETRIES) {
      try {
        console.log(
          `[TwoPhaseSwapSettleService] Executing chunk ${chunk.index} (attempt ${retryCount + 1}/${RETRY_CONFIG.MAX_RETRIES}):`,
          {
            swapId,
            assets: chunk.assets.length,
            solTransfers: chunk.solTransfers.length,
          }
        );

        // Build transaction for this chunk
        const transaction = await this.buildChunkTransaction(swapId, chunk, swap);

        // Sign and send transaction
        const signature = await this.sendAndConfirmChunkTransaction(
          transaction,
          swapId,
          chunk.index
        );

        // Record successful transaction
        await this.stateMachine.recordSettlementTx(swapId, signature, triggeredBy);

        console.log(
          `[TwoPhaseSwapSettleService] Chunk ${chunk.index} completed:`,
          signature
        );

        return {
          chunkIndex: chunk.index,
          signature,
          success: true,
          retryCount,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;

        console.warn(
          `[TwoPhaseSwapSettleService] Chunk ${chunk.index} failed (attempt ${retryCount}):`,
          lastError.message
        );

        // Wait before retrying with exponential backoff
        if (retryCount < RETRY_CONFIG.MAX_RETRIES) {
          const delay =
            RETRY_CONFIG.BASE_DELAY_MS *
            Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount - 1);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    return {
      chunkIndex: chunk.index,
      signature: '',
      success: false,
      error: lastError?.message || 'Unknown error',
      retryCount,
    };
  }

  /**
   * Build transaction for a settlement chunk
   *
   * @param swapId - Swap ID
   * @param chunk - The chunk to build
   * @param swap - Current swap data
   * @returns Transaction ready for signing
   */
  private async buildChunkTransaction(
    swapId: string,
    chunk: SettlementChunk,
    swap: TwoPhaseSwapData
  ): Promise<Transaction> {
    const instructions: TransactionInstruction[] = [];
    const [delegatePDA] = this.deriveDelegatePDA(swapId);

    // Build cNFT transfer instructions
    for (const transfer of chunk.assets) {
      if (transfer.type === 'CNFT') {
        const transferParams: TransferAsDelegateParams = {
          assetId: transfer.assetId,
          fromOwner: new PublicKey(transfer.from),
          toRecipient: new PublicKey(transfer.to),
          delegatePDA,
        };

        const result = await this.delegationService.transferAsDelegate(
          transferParams,
          0 // First attempt - retries handled at chunk level
        );

        instructions.push(result.instruction);
      }
    }

    // Build SOL transfer instructions
    // NOTE: SOL transfers from vault PDAs require CPI through the on-chain escrow program.
    // PDAs cannot sign transactions directly - they can only authorize through CPI.
    // This is a known limitation that requires on-chain program integration.
    if (chunk.solTransfers.length > 0) {
      // For now, throw an error for SOL transfers until CPI is implemented
      // TODO: Implement escrow program CPI for SOL vault releases
      throw new SettleServiceError(
        'SOL transfers from escrow vaults require on-chain program CPI. ' +
        'This feature is not yet implemented. For cNFT-only swaps, settlement will work. ' +
        'SOL escrow release requires integration with the escrow program\'s release_sol instruction.'
      );
    }

    // Create transaction
    const recentBlockhash = await this.connection.getLatestBlockhash();
    const transaction = new Transaction({
      recentBlockhash: recentBlockhash.blockhash,
      feePayer: this.backendSigner.publicKey,
    });

    for (const ix of instructions) {
      transaction.add(ix);
    }

    return transaction;
  }

  /**
   * Send and confirm a chunk transaction
   *
   * @param transaction - The transaction to send
   * @param swapId - Swap ID for logging
   * @param chunkIndex - Chunk index for logging
   * @returns Transaction signature
   */
  private async sendAndConfirmChunkTransaction(
    transaction: Transaction,
    swapId: string,
    chunkIndex: number
  ): Promise<TransactionSignature> {
    console.log(
      `[TwoPhaseSwapSettleService] Sending chunk ${chunkIndex} transaction:`,
      {
        swapId,
        instructionCount: transaction.instructions.length,
      }
    );

    // Sign with backend authority
    // Note: For cNFT transfers as delegate, the delegate PDA needs to sign
    // This is typically done through program CPI
    // For this implementation, we assume the backend has authority to execute
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.backendSigner],
      {
        commitment: 'confirmed',
        maxRetries: 2,
      }
    );

    console.log(
      `[TwoPhaseSwapSettleService] Chunk ${chunkIndex} confirmed:`,
      signature
    );

    return signature;
  }

  // ===========================================================================
  // Progress Tracking
  // ===========================================================================

  /**
   * Get current settlement progress for a swap
   *
   * @param swapId - Swap ID
   * @returns Settlement progress data
   */
  async getSettlementProgress(swapId: string): Promise<SettlementProgress> {
    const swap = await this.stateMachine.getSwap(swapId);
    if (!swap) {
      throw new SettleServiceError(`Swap not found: ${swapId}`);
    }

    const completedTxs = swap.settleTxs || [];
    const currentChunk = swap.currentSettleIndex;
    const totalChunks = swap.totalSettleTxs;

    const percentComplete =
      totalChunks > 0 ? Math.round((currentChunk / totalChunks) * 100) : 0;

    // Estimate remaining time based on average chunk execution time
    // (assuming ~2 seconds per chunk average)
    const remainingChunks = totalChunks - currentChunk;
    const estimatedTimeRemainingMs =
      swap.status === TwoPhaseSwapStatus.SETTLING ||
      swap.status === TwoPhaseSwapStatus.PARTIAL_SETTLE
        ? remainingChunks * 2000
        : undefined;

    return {
      swapId,
      status: swap.status,
      currentChunk,
      totalChunks,
      completedTxs,
      percentComplete,
      estimatedTimeRemainingMs,
      error: swap.errorMessage || undefined,
    };
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get swaps that are ready for settlement
   */
  async getSwapsReadyForSettlement(limit = 10): Promise<TwoPhaseSwapData[]> {
    const swaps = await this.prisma.twoPhaseSwap.findMany({
      where: {
        status: TwoPhaseSwapStatus.FULLY_LOCKED,
      },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    return swaps.map((swap: any) => this.mapToSwapData(swap));
  }

  /**
   * Get swaps currently in settlement
   */
  async getSwapsInSettlement(limit = 10): Promise<TwoPhaseSwapData[]> {
    const swaps = await this.prisma.twoPhaseSwap.findMany({
      where: {
        status: {
          in: [TwoPhaseSwapStatus.SETTLING, TwoPhaseSwapStatus.PARTIAL_SETTLE],
        },
      },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    return swaps.map((swap: any) => this.mapToSwapData(swap));
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Map database model to TwoPhaseSwapData
   */
  private mapToSwapData(swap: any): TwoPhaseSwapData {
    return {
      id: swap.id,
      status: swap.status,
      createdAt: swap.createdAt,
      updatedAt: swap.updatedAt,
      expiresAt: swap.expiresAt,
      partyA: swap.partyA,
      partyB: swap.partyB,
      assetsA: swap.assetsA as SwapAsset[],
      assetsB: swap.assetsB as SwapAsset[],
      solAmountA: swap.solAmountA ? BigInt(swap.solAmountA) : null,
      solAmountB: swap.solAmountB ? BigInt(swap.solAmountB) : null,
      lockTxA: swap.lockTxA,
      lockTxB: swap.lockTxB,
      lockConfirmedA: swap.lockConfirmedA,
      lockConfirmedB: swap.lockConfirmedB,
      settleTxs: swap.settleTxs as string[],
      currentSettleIndex: swap.currentSettleIndex,
      totalSettleTxs: swap.totalSettleTxs,
      finalSettleTx: swap.finalSettleTx,
      settledAt: swap.settledAt,
      errorMessage: swap.errorMessage,
      errorCode: swap.errorCode,
      failedAt: swap.failedAt,
      cancelledBy: swap.cancelledBy,
      cancelledAt: swap.cancelledAt,
      cancelReason: swap.cancelReason,
      platformFeeLamports: BigInt(swap.platformFeeLamports),
      swapOfferId: swap.swapOfferId,
      delegationStatus: swap.delegationStatus as any,
      stateHistory: swap.stateHistory as any[],
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the underlying delegation service
   */
  getDelegationService(): CnftDelegationService {
    return this.delegationService;
  }

  /**
   * Get the underlying state machine
   */
  getStateMachine(): SwapStateMachine {
    return this.stateMachine;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a TwoPhaseSwapSettleService instance
 */
export function createTwoPhaseSwapSettleService(
  connection: Connection,
  prisma: PrismaClient,
  programId: PublicKey,
  feeCollector: PublicKey,
  backendSigner: Keypair
): TwoPhaseSwapSettleService {
  return new TwoPhaseSwapSettleService(
    connection,
    prisma,
    programId,
    feeCollector,
    backendSigner
  );
}
