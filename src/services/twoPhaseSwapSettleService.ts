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
  ComputeBudgetProgram,
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
import { uuidToBuffer, uuidToUint8Array } from '../utils/uuid-conversion';
import { getEscrowProgramService, EscrowProgramService } from './escrow-program.service';
import * as crypto from 'crypto';

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
 * Forced proof size for chunk calculation (always triggers 1 cNFT per chunk).
 *
 * We use a value > DEEP_TREE_THRESHOLD (20) to force single-cNFT chunking because:
 * - Common trees (maxDepth=20, canopy=11) have 9 trimmed proof nodes
 * - Each cNFT instruction is ~488 bytes (17 accounts + proof nodes)
 * - Two cNFT transfers = ~1302 bytes, exceeding 1232 byte limit
 * - By returning 21, we trigger `proofSize > 20` check → 1 cNFT per chunk
 *
 * This is safe because we fetch fresh proofs at execution time anyway.
 */
export const FORCED_PROOF_SIZE_FOR_CHUNKING = 21;

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

/**
 * Delay between sequential cNFT chunk executions (ms).
 * Required for DAS indexer to sync Merkle tree changes after each transaction.
 * Without this delay, subsequent cNFT transfers on the same tree will have stale proofs.
 */
export const CNFT_CHUNK_DELAY_MS = 2000;

/**
 * Initial delay before settlement starts (ms).
 * Required for DAS indexer to sync delegation changes from lock phase.
 * After lock transactions confirm, the DAS API needs time to index the delegation
 * change before we can successfully call transferAsDelegate().
 */
export const DAS_SYNC_DELAY_BEFORE_SETTLEMENT_MS = 3000;

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
  private escrowProgramService: EscrowProgramService;

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
    this.escrowProgramService = getEscrowProgramService();

    console.log('[TwoPhaseSwapSettleService] Initialized');
    console.log('[TwoPhaseSwapSettleService] Program ID:', programId.toBase58());
    console.log('[TwoPhaseSwapSettleService] Fee Collector:', feeCollector.toBase58());
    console.log('[TwoPhaseSwapSettleService] Strategy: SEQUENTIAL_RPC (two-phase delegation requires fresh proofs per TX, JITO bundles disabled)');
  }

  // ===========================================================================
  // Delegate Authority (matches lock service)
  // ===========================================================================

  /**
   * Get the delegate authority for cNFT transfers
   *
   * IMPORTANT: This returns the backend signer's public key, NOT a PDA.
   * PDAs cannot sign external transactions, but the backend keypair can.
   * The backend signer will sign the transfer transaction during settlement.
   *
   * For backwards compatibility, this still returns [PublicKey, number] format.
   *
   * @param _swapId - The swap UUID (unused, kept for API compatibility)
   * @returns [backendSigner.publicKey, 0]
   */
  deriveDelegatePDA(_swapId: string): [PublicKey, number] {
    // Return backend signer's public key as delegate (not a PDA)
    // This allows the backend to sign cNFT transfer transactions during settlement
    return [this.backendSigner.publicKey, 0];
  }

  /**
   * Derive SOL vault PDA for a specific party's escrow
   */
  deriveSolVaultPDA(swapId: string, party: 'A' | 'B'): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(TWO_PHASE_SWAP_SEEDS.SOL_VAULT),
        uuidToBuffer(swapId),
        Buffer.from(party),
      ],
      this.programId
    );
  }
  // ===========================================================================
  // Instruction Builders for Two-Phase SOL Vault Operations
  // ===========================================================================

  /**
   * Get Anchor instruction discriminator (first 8 bytes of SHA256 hash of "global:<instruction_name>")
   */
  private getInstructionDiscriminator(instructionName: string): Buffer {
    const hash = crypto.createHash('sha256')
      .update(`global:${instructionName}`)
      .digest();
    return hash.slice(0, 8);
  }

  /**
   * Build settle_two_phase_with_close instruction
   *
   * Transfers SOL from vault to recipient, pays platform fee, and closes the vault PDA.
   *
   * @param swapId - Swap UUID
   * @param party - Which party's vault ('A' or 'B')
   * @param recipient - Recipient public key
   * @param recipientAmount - Amount to send to recipient in lamports
   * @param platformFee - Platform fee amount in lamports
   * @param rentRecipient - Who receives the PDA rent (typically treasury or depositor)
   * @returns Transaction instruction
   */
  buildSettleTwoPhaseWithCloseInstruction(
    swapId: string,
    party: 'A' | 'B',
    recipient: PublicKey,
    recipientAmount: bigint,
    platformFee: bigint,
    rentRecipient: PublicKey
  ): TransactionInstruction {
    const [solVaultPDA] = this.deriveSolVaultPDA(swapId, party);
    const swapIdBytes = uuidToUint8Array(swapId);
    const partyByte = party.charCodeAt(0); // 'A' = 65, 'B' = 66

    // Build instruction data:
    // - discriminator (8 bytes)
    // - swap_id (16 bytes as [u8; 16])
    // - party (1 byte)
    // - recipient_amount (8 bytes as u64)
    // - platform_fee (8 bytes as u64)
    const discriminator = this.getInstructionDiscriminator('settle_two_phase_with_close');

    const data = Buffer.alloc(8 + 16 + 1 + 8 + 8);
    discriminator.copy(data, 0);
    Buffer.from(swapIdBytes).copy(data, 8);
    data.writeUInt8(partyByte, 24);
    data.writeBigUInt64LE(recipientAmount, 25);
    data.writeBigUInt64LE(platformFee, 33);

    const keys = [
      { pubkey: this.backendSigner.publicKey, isSigner: true, isWritable: true },  // caller
      { pubkey: solVaultPDA, isSigner: false, isWritable: true },                   // sol_vault
      { pubkey: recipient, isSigner: false, isWritable: true },                     // recipient
      { pubkey: this.feeCollector, isSigner: false, isWritable: true },             // platform_fee_collector
      { pubkey: rentRecipient, isSigner: false, isWritable: true },                 // rent_recipient
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },      // system_program
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  /**
   * Build cancel_two_phase_with_close instruction
   *
   * Returns SOL from vault to original depositor and closes the vault PDA.
   *
   * @param swapId - Swap UUID
   * @param party - Which party's vault ('A' or 'B')
   * @param depositor - Original depositor public key (receives refund)
   * @param rentRecipient - Who receives the PDA rent
   * @returns Transaction instruction
   */
  buildCancelTwoPhaseWithCloseInstruction(
    swapId: string,
    party: 'A' | 'B',
    depositor: PublicKey,
    rentRecipient: PublicKey
  ): TransactionInstruction {
    const [solVaultPDA] = this.deriveSolVaultPDA(swapId, party);
    const swapIdBytes = uuidToUint8Array(swapId);
    const partyByte = party.charCodeAt(0);

    // Build instruction data:
    // - discriminator (8 bytes)
    // - swap_id (16 bytes as [u8; 16])
    // - party (1 byte)
    const discriminator = this.getInstructionDiscriminator('cancel_two_phase_with_close');

    const data = Buffer.alloc(8 + 16 + 1);
    discriminator.copy(data, 0);
    Buffer.from(swapIdBytes).copy(data, 8);
    data.writeUInt8(partyByte, 24);

    const keys = [
      { pubkey: this.backendSigner.publicKey, isSigner: true, isWritable: true },  // caller
      { pubkey: solVaultPDA, isSigner: false, isWritable: true },                   // sol_vault
      { pubkey: depositor, isSigner: false, isWritable: true },                     // depositor
      { pubkey: rentRecipient, isSigner: false, isWritable: true },                 // rent_recipient
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },      // system_program
    ];

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
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

    // Group cNFTs into chunks (1 cNFT per chunk for transaction size safety)
    for (const asset of cnftAssetsA) {
      const proofSize = FORCED_PROOF_SIZE_FOR_CHUNKING;
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

    // Process Party B's cNFTs (1 cNFT per chunk for transaction size safety)
    for (const asset of cnftAssetsB) {
      const proofSize = FORCED_PROOF_SIZE_FOR_CHUNKING;
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

    // Determine execution strategy
    // CRITICAL: Two-phase delegation ALWAYS uses sequential RPC, NEVER JITO bundles.
    // Reason: Each cNFT transfer needs a FRESH Merkle proof. In JITO bundles, all transactions
    // are submitted atomically with proofs from the same moment. On active trees, the first
    // TX changes the tree state, invalidating all other proofs in the bundle.
    // Sequential RPC fetches a fresh proof for each transfer, making it resilient to tree changes.
    const useJitoBundle = false; // DISABLED: Two-phase delegation requires fresh proofs per TX

    console.log('[TwoPhaseSwapSettleService] Execution strategy: SEQUENTIAL_RPC (two-phase delegation always uses sequential for fresh proofs)', {
      totalChunks: chunkResult.totalChunks,
      reason: 'Two-phase delegation requires fresh Merkle proofs per transaction',
    });

    // CRITICAL: Wait for DAS indexer to sync delegation changes from lock phase.
    // The lock phase delegated cNFTs to the backend signer, but DAS API may not have
    // indexed this change yet. Without this delay, transferAsDelegate() will fail
    // with NotDelegatedError because getCnftAsset() returns stale delegation status.
    const hasCnftAssets = swap.assetsA.some(a => a.type === 'CNFT') || swap.assetsB.some(a => a.type === 'CNFT');
    if (hasCnftAssets) {
      console.log(
        `[TwoPhaseSwapSettleService] Waiting ${DAS_SYNC_DELAY_BEFORE_SETTLEMENT_MS}ms for DAS indexer to sync delegation changes from lock phase`
      );
      await this.sleep(DAS_SYNC_DELAY_BEFORE_SETTLEMENT_MS);
    }

    // Execute chunks based on strategy
    let currentSwap = startResult.swap;
    let hasError = false;
    let errorMessage: string | undefined;

    if (useJitoBundle) {
      // NEVER REACHED: Two-phase delegation always uses sequential RPC
      // Kept for reference but unreachable
      const results = await this.executeSettlementWithFallback(
        params.swapId,
        chunkResult.chunks,
        currentSwap,
        params.triggeredBy
      );

      chunkResults.push(...results);

      // Check for errors
      const failedResult = results.find(r => !r.success);
      if (failedResult) {
        hasError = true;
        errorMessage = failedResult.error;
      }
    } else {
      // Sequential execution - fetch fresh proofs for each chunk
      for (let i = 0; i < chunkResult.chunks.length; i++) {
        const chunk = chunkResult.chunks[i];
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

          // CRITICAL: Add delay between cNFT chunks for DAS indexer sync.
          // When chunk N modifies a Merkle tree, the next chunk needs time for
          // DAS to index the change before fetching fresh proofs.
          // This is especially important for cNFT <> cNFT swaps on the same tree.
          const hasCnftAssets = chunk.assets.some(a => a.type === 'CNFT');
          const nextChunk = chunkResult.chunks[i + 1];
          const nextHasCnftAssets = nextChunk?.assets.some(a => a.type === 'CNFT');

          if (hasCnftAssets && nextHasCnftAssets) {
            console.log(
              `[TwoPhaseSwapSettleService] Waiting ${CNFT_CHUNK_DELAY_MS}ms for DAS indexer sync before next cNFT chunk`
            );
            await this.sleep(CNFT_CHUNK_DELAY_MS);
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

    // Add compute budget instructions for deep Merkle tree verification
    // Use 600k CU to handle deep mainnet trees (30+ proof nodes) and avoid ProgramFailedToComplete
    instructions.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
    );

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

    // Build SOL transfer instructions using on-chain program CPI
    // SOL vault PDAs can only transfer SOL through the escrow program's settle instruction
    for (const solTransfer of chunk.solTransfers) {
      if (solTransfer.type === 'escrow_release') {
        // Determine recipient based on transfer direction
        // In a swap, Party A's SOL goes to Party B and vice versa
        const recipient = new PublicKey(solTransfer.to);
        const rentRecipient = this.feeCollector; // Treasury receives rent

        // Build the settle instruction with platform fee
        const instruction = this.buildSettleTwoPhaseWithCloseInstruction(
          swapId,
          solTransfer.fromParty,
          recipient,
          solTransfer.amount,
          BigInt(0), // Platform fee handled separately
          rentRecipient
        );

        instructions.push(instruction);

        console.log('[TwoPhaseSwapSettleService] Built SOL release instruction:', {
          swapId,
          party: solTransfer.fromParty,
          recipient: solTransfer.to,
          amount: solTransfer.amount.toString(),
        });
      } else if (solTransfer.type === 'platform_fee') {
        // Platform fee is now included in the settle instruction above
        // This case is handled by passing platformFee to buildSettleTwoPhaseWithCloseInstruction
        console.log('[TwoPhaseSwapSettleService] Platform fee included in settle instruction');
      }
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
  // JITO Bundle Execution
  // ===========================================================================

  /**
   * Execute settlement using JITO bundle for atomicity
   *
   * This method:
   * 1. Builds all chunk transactions
   * 2. Serializes them for JITO submission
   * 3. Submits as a single atomic bundle
   * 4. Waits for confirmation
   *
   * @param swapId - Swap ID
   * @param chunks - All settlement chunks
   * @param swap - Current swap data
   * @param triggeredBy - Who triggered the settlement
   * @returns Array of chunk execution results
   */
  private async executeSettlementWithJitoBundle(
    swapId: string,
    chunks: SettlementChunk[],
    swap: TwoPhaseSwapData,
    triggeredBy: string
  ): Promise<ChunkExecutionResult[]> {
    console.log(`[TwoPhaseSwapSettleService] Executing settlement via JITO bundle (${chunks.length} transactions)`);

    const chunkResults: ChunkExecutionResult[] = [];
    const serializedTransactions: string[] = [];
    const builtTransactions: Transaction[] = [];

    try {
      // Build all chunk transactions
      for (const chunk of chunks) {
        const transaction = await this.buildChunkTransaction(swapId, chunk, swap);

        // Sign with backend signer
        transaction.partialSign(this.backendSigner);

        // Serialize for JITO
        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });

        serializedTransactions.push(serialized.toString('base64'));
        builtTransactions.push(transaction);

        console.log(`[TwoPhaseSwapSettleService] Built chunk ${chunk.index} for JITO bundle`);
      }

      // Submit bundle to JITO
      const bundleResult = await this.escrowProgramService.sendBundleViaJito(
        serializedTransactions,
        {
          skipSimulation: true, // Settlement transactions are pre-validated
          description: `Two-phase settlement for swap ${swapId}`,
        }
      );

      if (!bundleResult.success) {
        console.error('[TwoPhaseSwapSettleService] JITO bundle submission failed:', bundleResult.error);

        // Return failure for all chunks
        for (const chunk of chunks) {
          chunkResults.push({
            chunkIndex: chunk.index,
            signature: '',
            success: false,
            error: `JITO bundle failed: ${bundleResult.error}`,
            retryCount: 0,
          });
        }
        return chunkResults;
      }

      console.log(`[TwoPhaseSwapSettleService] JITO bundle submitted: ${bundleResult.bundleId}`);

      // Wait for bundle confirmation
      const confirmation = await this.escrowProgramService.waitForBundleConfirmation(
        bundleResult.bundleId!,
        60, // 60 second timeout for settlement
        bundleResult.signatures
      );

      if (confirmation.confirmed && confirmation.status === 'Landed') {
        console.log(`[TwoPhaseSwapSettleService] JITO bundle landed successfully`);

        // Record all signatures and return success
        const signatures = bundleResult.signatures || [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const signature = signatures[i] || bundleResult.bundleId || '';

          // Record successful transaction in state machine
          await this.stateMachine.recordSettlementTx(swapId, signature, triggeredBy);

          chunkResults.push({
            chunkIndex: chunk.index,
            signature,
            success: true,
            retryCount: 0,
          });
        }
      } else {
        console.error(`[TwoPhaseSwapSettleService] JITO bundle failed: ${confirmation.status}`);

        // Return failure for all chunks
        for (const chunk of chunks) {
          chunkResults.push({
            chunkIndex: chunk.index,
            signature: '',
            success: false,
            error: `JITO bundle ${confirmation.status}: ${confirmation.error || 'Unknown error'}`,
            retryCount: 0,
          });
        }
      }

      return chunkResults;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown JITO error';
      console.error('[TwoPhaseSwapSettleService] JITO bundle execution error:', errorMessage);

      // Return failure for all chunks
      for (const chunk of chunks) {
        chunkResults.push({
          chunkIndex: chunk.index,
          signature: '',
          success: false,
          error: errorMessage,
          retryCount: 0,
        });
      }
      return chunkResults;
    }
  }

  /**
   * Execute settlement with fallback from JITO to sequential RPC
   *
   * IMPORTANT: We do NOT retry JITO on failure. If JITO fails (network congestion,
   * bundle dropped, etc.), we immediately fall back to sequential RPC.
   * This is intentional - during network congestion, JITO retries won't help.
   *
   * @param swapId - Swap ID
   * @param chunks - All settlement chunks
   * @param swap - Current swap data
   * @param triggeredBy - Who triggered the settlement
   * @returns Array of chunk execution results
   */
  private async executeSettlementWithFallback(
    swapId: string,
    chunks: SettlementChunk[],
    swap: TwoPhaseSwapData,
    triggeredBy: string
  ): Promise<ChunkExecutionResult[]> {
    // Try JITO once (no retries - if congested, retrying won't help)
    console.log('[TwoPhaseSwapSettleService] Attempting JITO bundle for settlement (single attempt, no retry)...');
    const jitoResults = await this.executeSettlementWithJitoBundle(swapId, chunks, swap, triggeredBy);

    // Check if JITO succeeded
    const allSucceeded = jitoResults.every(r => r.success);
    if (allSucceeded) {
      console.log('[TwoPhaseSwapSettleService] JITO bundle succeeded for all chunks');
      return jitoResults;
    }

    // Extract failure reason for logging
    const failedResult = jitoResults.find(r => !r.success);
    const failureReason = failedResult?.error || 'Unknown error';

    // Check if any chunks succeeded (partial success - don't retry those)
    const successfulChunks = jitoResults.filter(r => r.success);
    if (successfulChunks.length > 0) {
      console.warn(`[TwoPhaseSwapSettleService] JITO partially succeeded (${successfulChunks.length}/${chunks.length}). ` +
        `Reason for failures: ${failureReason}. Cannot cleanly fallback - returning partial results.`);
      // Return as-is - partial success means we can't cleanly fallback
      return jitoResults;
    }

    // Full JITO failure - immediately fall back to sequential RPC (NO JITO RETRY)
    console.warn(`[TwoPhaseSwapSettleService] JITO bundle FAILED: ${failureReason}`);
    console.log('[TwoPhaseSwapSettleService] Immediately falling back to sequential RPC (no JITO retry - congestion recovery)');

    const sequentialResults: ChunkExecutionResult[] = [];
    let currentSwap = swap;

    for (const chunk of chunks) {
      try {
        const result = await this.executeChunkWithRetry(swapId, chunk, currentSwap, triggeredBy);
        sequentialResults.push(result);

        if (!result.success) {
          // Stop on first failure in sequential mode
          break;
        }

        // Update swap reference after recording
        const updatedSwap = await this.stateMachine.getSwap(swapId);
        if (updatedSwap) {
          currentSwap = updatedSwap;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        sequentialResults.push({
          chunkIndex: chunk.index,
          signature: '',
          success: false,
          error: err.message,
          retryCount: RETRY_CONFIG.MAX_RETRIES,
        });
        break;
      }
    }

    return sequentialResults;
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
