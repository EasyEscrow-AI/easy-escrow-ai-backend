/**
 * Two-Phase Swap Lock Service
 *
 * Handles building lock transactions for the two-phase swap system.
 * During the lock phase, both parties delegate their cNFT assets and
 * escrow their SOL to marketplace PDAs.
 *
 * Lock Transaction per party:
 * 1. Delegate each cNFT to marketplace PDA (via Bubblegum delegate instruction)
 * 2. Transfer SOL to escrow PDA (via System Program transfer)
 *
 * @see .taskmaster/tasks/task_009_cnft-delegation-swap.txt
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  Keypair,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import { PrismaClient, TwoPhaseSwapStatus } from '../generated/prisma';
import {
  CnftDelegationService,
  createCnftDelegationService,
  DelegationInstructionResult,
} from './cnftDelegationService';
import {
  SwapStateMachine,
  createSwapStateMachine,
  SwapAsset,
  TwoPhaseSwapData,
} from './swapStateMachine';

// =============================================================================
// Constants
// =============================================================================

/**
 * PDA seeds for two-phase swap escrow
 */
export const TWO_PHASE_SWAP_SEEDS = {
  /** Main swap escrow prefix */
  SWAP_ESCROW: 'two_phase_swap',
  /** SOL vault for a specific party */
  SOL_VAULT: 'two_phase_sol_vault',
  /** Delegation authority PDA */
  DELEGATE_AUTHORITY: 'two_phase_delegate',
};

/**
 * Default lock phase timeout in seconds (30 minutes)
 */
export const DEFAULT_LOCK_TIMEOUT_SECONDS = 30 * 60;

/**
 * Convert a UUID string to a 16-byte buffer for PDA seeds
 *
 * UUIDs are 36 characters with dashes (e.g., "5d7f5458-839c-47e8-964f-12c80b59fde5")
 * which is 32 hex characters = 16 bytes when parsed as binary.
 *
 * Solana PDA seeds have a max length of 32 bytes per seed, so we must convert
 * the UUID to its binary representation (16 bytes) rather than using the
 * string representation (36 bytes).
 *
 * @param uuid - UUID string with or without dashes
 * @returns 16-byte Buffer containing the binary representation of the UUID
 */
function uuidToBuffer(uuid: string): Buffer {
  // Remove dashes to get the 32 hex character representation
  const hex = uuid.replace(/-/g, '');

  // Validate we have exactly 32 hex characters
  if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid UUID format: ${uuid}. Expected 32 hex characters (with or without dashes).`);
  }

  // Convert hex string to 16-byte buffer
  return Buffer.from(hex, 'hex');
}

// =============================================================================
// Types
// =============================================================================

/**
 * Parameters for creating a new two-phase swap
 */
export interface CreateSwapParams {
  /** Party A (initiator) wallet address */
  partyA: string;
  /** Party B (counterparty) wallet address - optional for open swaps */
  partyB?: string;
  /** Assets from Party A */
  assetsA: SwapAsset[];
  /** Assets from Party B */
  assetsB: SwapAsset[];
  /** SOL amount from Party A (in lamports) */
  solAmountA?: bigint;
  /** SOL amount from Party B (in lamports) */
  solAmountB?: bigint;
  /** Lock phase timeout in seconds (defaults to 30 minutes) */
  lockTimeoutSeconds?: number;
  /** Platform fee in lamports */
  platformFeeLamports?: bigint;
}

/**
 * Result of creating a new swap
 */
export interface CreateSwapResult {
  /** The created swap data */
  swap: TwoPhaseSwapData;
  /** Swap ID */
  swapId: string;
}

/**
 * Parameters for accepting a swap
 */
export interface AcceptSwapParams {
  /** Swap ID */
  swapId: string;
  /** Party B wallet address (acceptor) */
  partyB: string;
}

/**
 * Result of accepting a swap
 */
export interface AcceptSwapResult {
  /** The updated swap data */
  swap: TwoPhaseSwapData;
}

/**
 * Parameters for building a lock transaction
 */
export interface BuildLockTransactionParams {
  /** Swap ID */
  swapId: string;
  /** Wallet address of the party locking assets */
  walletAddress: string;
  /** Whether this is Party A or Party B */
  party: 'A' | 'B';
}

/**
 * Result of building a lock transaction
 */
export interface LockTransactionResult {
  /** Serialized transaction (base64) */
  serializedTransaction: string;
  /** Instructions included in the transaction */
  instructions: TransactionInstruction[];
  /** Required signers for the transaction */
  requiredSigners: string[];
  /** Assets being locked */
  lockedAssets: SwapAsset[];
  /** SOL amount being escrowed (in lamports) */
  solAmountEscrowed: bigint;
  /** Delegate PDA for cNFT assets */
  delegatePDA: PublicKey;
  /** SOL vault PDA */
  solVaultPDA: PublicKey;
  /** Estimated transaction size in bytes */
  estimatedSize: number;
}

/**
 * Parameters for confirming a lock
 */
export interface ConfirmLockParams {
  /** Swap ID */
  swapId: string;
  /** Transaction signature */
  signature: string;
  /** Which party's lock is being confirmed */
  party: 'A' | 'B';
  /** Wallet address that executed the lock */
  walletAddress: string;
}

/**
 * Result of confirming a lock
 */
export interface ConfirmLockResult {
  /** Updated swap data */
  swap: TwoPhaseSwapData;
  /** Whether both parties are now locked */
  fullyLocked: boolean;
  /** Next action required */
  nextAction: 'LOCK_PARTY_B' | 'READY_FOR_SETTLEMENT' | null;
}

/**
 * Error types for lock service
 */
export class LockServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockServiceError';
  }
}

export class SwapNotFoundError extends LockServiceError {
  constructor(swapId: string) {
    super(`Two-phase swap not found: ${swapId}`);
    this.name = 'SwapNotFoundError';
  }
}

export class InvalidPartyError extends LockServiceError {
  constructor(wallet: string, swapId: string) {
    super(`Wallet ${wallet} is not a party to swap ${swapId}`);
    this.name = 'InvalidPartyError';
  }
}

export class InvalidStateError extends LockServiceError {
  constructor(swapId: string, currentState: string, expectedState: string) {
    super(
      `Swap ${swapId} is in state ${currentState}, expected ${expectedState}`
    );
    this.name = 'InvalidStateError';
  }
}

// =============================================================================
// Main Service Class
// =============================================================================

/**
 * Two-Phase Swap Lock Service
 *
 * Manages lock transactions for the two-phase swap system:
 * - Creates swap intents
 * - Builds lock transactions (delegation + SOL escrow)
 * - Confirms lock transactions
 * - Tracks lock status
 */
export class TwoPhaseSwapLockService {
  private connection: Connection;
  private prisma: PrismaClient;
  private delegationService: CnftDelegationService;
  private stateMachine: SwapStateMachine;
  private programId: PublicKey;
  private feeCollector: PublicKey;

  constructor(
    connection: Connection,
    prisma: PrismaClient,
    programId: PublicKey,
    feeCollector: PublicKey
  ) {
    this.connection = connection;
    this.prisma = prisma;
    this.programId = programId;
    this.feeCollector = feeCollector;
    this.delegationService = createCnftDelegationService(connection);
    this.stateMachine = createSwapStateMachine(prisma);

    console.log('[TwoPhaseSwapLockService] Initialized');
    console.log('[TwoPhaseSwapLockService] Program ID:', programId.toBase58());
    console.log('[TwoPhaseSwapLockService] Fee Collector:', feeCollector.toBase58());
  }

  // ===========================================================================
  // PDA Derivation
  // ===========================================================================

  /**
   * Derive the marketplace delegate PDA for a swap
   *
   * This PDA is granted delegation authority over cNFT assets.
   * All cNFTs from both parties are delegated to this same PDA.
   *
   * @param swapId - The swap UUID
   * @returns [PDA, bump]
   */
  deriveDelegatePDA(swapId: string): [PublicKey, number] {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(TWO_PHASE_SWAP_SEEDS.DELEGATE_AUTHORITY),
        uuidToBuffer(swapId),
      ],
      this.programId
    );

    console.log('[TwoPhaseSwapLockService] Derived delegate PDA:', {
      swapId,
      pda: pda.toBase58(),
      bump,
    });

    return [pda, bump];
  }

  /**
   * Derive SOL vault PDA for a specific party's escrow
   *
   * Each party's SOL goes to a separate vault PDA.
   *
   * @param swapId - The swap UUID
   * @param party - 'A' or 'B'
   * @returns [PDA, bump]
   */
  deriveSolVaultPDA(swapId: string, party: 'A' | 'B'): [PublicKey, number] {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(TWO_PHASE_SWAP_SEEDS.SOL_VAULT),
        uuidToBuffer(swapId),
        Buffer.from(party),
      ],
      this.programId
    );

    console.log('[TwoPhaseSwapLockService] Derived SOL vault PDA:', {
      swapId,
      party,
      pda: pda.toBase58(),
      bump,
    });

    return [pda, bump];
  }

  // ===========================================================================
  // Swap Lifecycle: Create
  // ===========================================================================

  /**
   * Create a new two-phase swap intent
   *
   * Party A proposes a swap: their assets for Party B's assets.
   * Creates the swap in CREATED status.
   *
   * @param params - Swap creation parameters
   * @returns Created swap data
   */
  async createSwap(params: CreateSwapParams): Promise<CreateSwapResult> {
    console.log('[TwoPhaseSwapLockService] Creating two-phase swap:', {
      partyA: params.partyA,
      partyB: params.partyB || 'open',
      assetsA: params.assetsA.length,
      assetsB: params.assetsB.length,
      solAmountA: params.solAmountA?.toString(),
      solAmountB: params.solAmountB?.toString(),
    });

    // Validate wallet addresses
    try {
      new PublicKey(params.partyA);
      if (params.partyB) {
        new PublicKey(params.partyB);
      }
    } catch (error) {
      throw new LockServiceError('Invalid wallet address format');
    }

    // Validate assets exist (basic validation - identifier format)
    for (const asset of [...params.assetsA, ...params.assetsB]) {
      if (!asset.identifier) {
        throw new LockServiceError('Asset identifier is required');
      }
    }

    // Calculate expiration
    const timeoutSeconds = params.lockTimeoutSeconds || DEFAULT_LOCK_TIMEOUT_SECONDS;
    const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

    // Calculate platform fee if not provided (default 1% of SOL value)
    const solTotal =
      (params.solAmountA || BigInt(0)) + (params.solAmountB || BigInt(0));
    const platformFee = params.platformFeeLamports ?? (solTotal * BigInt(1)) / BigInt(100);

    // Create via state machine
    const swap = await this.stateMachine.createSwap({
      partyA: params.partyA,
      partyB: params.partyB,
      assetsA: params.assetsA,
      assetsB: params.assetsB,
      solAmountA: params.solAmountA,
      solAmountB: params.solAmountB,
      platformFeeLamports: platformFee,
      expiresAt,
    });

    console.log('[TwoPhaseSwapLockService] Swap created:', swap.id);

    return {
      swap,
      swapId: swap.id,
    };
  }

  // ===========================================================================
  // Swap Lifecycle: Accept
  // ===========================================================================

  /**
   * Accept a swap (Party B accepts Party A's proposal)
   *
   * Transitions swap from CREATED → ACCEPTED.
   * Returns lock instructions for Party A.
   *
   * @param params - Accept parameters
   * @returns Updated swap and lock instructions for Party A
   */
  async acceptSwap(params: AcceptSwapParams): Promise<AcceptSwapResult> {
    console.log('[TwoPhaseSwapLockService] Accepting swap:', {
      swapId: params.swapId,
      partyB: params.partyB,
    });

    // Validate wallet address
    try {
      new PublicKey(params.partyB);
    } catch (error) {
      throw new LockServiceError('Invalid wallet address format');
    }

    // Accept via state machine
    const result = await this.stateMachine.acceptSwap(params.swapId, params.partyB);

    if (!result.success || !result.swap) {
      throw new LockServiceError(result.error || 'Failed to accept swap');
    }

    console.log('[TwoPhaseSwapLockService] Swap accepted:', params.swapId);

    return {
      swap: result.swap,
    };
  }

  // ===========================================================================
  // Lock Transaction Building
  // ===========================================================================

  /**
   * Build lock transaction for a party
   *
   * Creates instructions to:
   * 1. Delegate all cNFT assets to the marketplace PDA
   * 2. Transfer SOL to the escrow vault PDA
   *
   * @param params - Lock transaction parameters
   * @returns Transaction and metadata
   */
  async buildLockTransaction(
    params: BuildLockTransactionParams
  ): Promise<LockTransactionResult> {
    console.log('[TwoPhaseSwapLockService] Building lock transaction:', {
      swapId: params.swapId,
      wallet: params.walletAddress,
      party: params.party,
    });

    // Fetch swap data
    const swap = await this.stateMachine.getSwap(params.swapId);
    if (!swap) {
      throw new SwapNotFoundError(params.swapId);
    }

    // Validate party
    const isPartyA = swap.partyA === params.walletAddress;
    const isPartyB = swap.partyB === params.walletAddress;

    if (!isPartyA && !isPartyB) {
      throw new InvalidPartyError(params.walletAddress, params.swapId);
    }

    // Verify party matches expected
    if (params.party === 'A' && !isPartyA) {
      throw new LockServiceError(
        `Wallet ${params.walletAddress} is not Party A for swap ${params.swapId}`
      );
    }
    if (params.party === 'B' && !isPartyB) {
      throw new LockServiceError(
        `Wallet ${params.walletAddress} is not Party B for swap ${params.swapId}`
      );
    }

    // Validate swap state
    const expectedState = params.party === 'A'
      ? TwoPhaseSwapStatus.ACCEPTED
      : TwoPhaseSwapStatus.PARTY_A_LOCKED;

    if (swap.status !== expectedState) {
      throw new InvalidStateError(
        params.swapId,
        swap.status,
        expectedState
      );
    }

    // Get party's assets and SOL amount
    const assets = params.party === 'A' ? swap.assetsA : swap.assetsB;
    const solAmount = params.party === 'A' ? swap.solAmountA : swap.solAmountB;

    // Derive PDAs
    const [delegatePDA] = this.deriveDelegatePDA(params.swapId);
    const [solVaultPDA] = this.deriveSolVaultPDA(params.swapId, params.party);

    // Build instructions
    const instructions: TransactionInstruction[] = [];
    const walletPubkey = new PublicKey(params.walletAddress);

    // 1. Build delegation instructions for each cNFT
    const cnftAssets = assets.filter((a) => a.type === 'CNFT');
    let totalEstimatedSize = 0;

    for (const asset of cnftAssets) {
      console.log(
        `[TwoPhaseSwapLockService] Building delegation for cNFT:`,
        asset.identifier
      );

      const delegationResult = await this.delegationService.buildDelegateInstruction(
        {
          assetId: asset.identifier,
          ownerPubkey: walletPubkey,
          delegatePDA,
        }
      );

      instructions.push(delegationResult.instruction);
      totalEstimatedSize += delegationResult.estimatedSize;
    }

    // 2. Build SOL transfer instruction (if SOL is being offered)
    const solAmountEscrowed = solAmount || BigInt(0);
    if (solAmountEscrowed > BigInt(0)) {
      console.log(
        `[TwoPhaseSwapLockService] Building SOL escrow transfer:`,
        solAmountEscrowed.toString()
      );

      const transferInstruction = SystemProgram.transfer({
        fromPubkey: walletPubkey,
        toPubkey: solVaultPDA,
        lamports: BigInt(solAmountEscrowed),
      });

      instructions.push(transferInstruction);
      totalEstimatedSize += 64; // SOL transfer is ~64 bytes
    }

    // Build transaction
    const recentBlockhash = await this.connection.getLatestBlockhash();

    // For now, use legacy transaction
    // Can upgrade to versioned if needed for ALT support
    const transaction = new Transaction({
      recentBlockhash: recentBlockhash.blockhash,
      feePayer: walletPubkey,
    });

    for (const ix of instructions) {
      transaction.add(ix);
    }

    // Serialize transaction
    const serializedTransaction = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    console.log('[TwoPhaseSwapLockService] Lock transaction built:', {
      swapId: params.swapId,
      party: params.party,
      instructionCount: instructions.length,
      cnftCount: cnftAssets.length,
      solAmount: solAmountEscrowed.toString(),
      estimatedSize: totalEstimatedSize,
    });

    return {
      serializedTransaction,
      instructions,
      requiredSigners: [params.walletAddress],
      lockedAssets: assets,
      solAmountEscrowed,
      delegatePDA,
      solVaultPDA,
      estimatedSize: totalEstimatedSize,
    };
  }

  // ===========================================================================
  // Lock Confirmation
  // ===========================================================================

  /**
   * Start the lock process for a party
   *
   * Transitions to LOCKING_PARTY_A or LOCKING_PARTY_B state.
   *
   * @param swapId - Swap ID
   * @param party - Which party is starting to lock
   * @param walletAddress - Wallet initiating the lock
   */
  async startLock(
    swapId: string,
    party: 'A' | 'B',
    walletAddress: string
  ): Promise<TwoPhaseSwapData> {
    console.log('[TwoPhaseSwapLockService] Starting lock:', {
      swapId,
      party,
      wallet: walletAddress,
    });

    let result;
    if (party === 'A') {
      result = await this.stateMachine.startLockingPartyA(swapId, walletAddress);
    } else {
      result = await this.stateMachine.startLockingPartyB(swapId, walletAddress);
    }

    if (!result.success || !result.swap) {
      throw new LockServiceError(result.error || 'Failed to start lock');
    }

    return result.swap;
  }

  /**
   * Confirm a lock transaction was successful
   *
   * Transitions:
   * - Party A: LOCKING_PARTY_A → PARTY_A_LOCKED
   * - Party B: LOCKING_PARTY_B → FULLY_LOCKED
   *
   * @param params - Confirmation parameters
   * @returns Updated swap and next action
   */
  async confirmLock(params: ConfirmLockParams): Promise<ConfirmLockResult> {
    console.log('[TwoPhaseSwapLockService] Confirming lock:', {
      swapId: params.swapId,
      party: params.party,
      signature: params.signature,
    });

    // Verify transaction on-chain
    const txStatus = await this.connection.getSignatureStatus(params.signature);
    if (!txStatus || txStatus.value?.err) {
      throw new LockServiceError(
        `Transaction ${params.signature} failed or not found: ${JSON.stringify(txStatus?.value?.err)}`
      );
    }

    // Update state machine
    let result;
    if (params.party === 'A') {
      result = await this.stateMachine.confirmPartyALock(
        params.swapId,
        params.signature,
        params.walletAddress
      );
    } else {
      result = await this.stateMachine.confirmPartyBLock(
        params.swapId,
        params.signature,
        params.walletAddress
      );
    }

    if (!result.success || !result.swap) {
      throw new LockServiceError(result.error || 'Failed to confirm lock');
    }

    // Determine next action
    const fullyLocked = result.swap.status === TwoPhaseSwapStatus.FULLY_LOCKED;
    let nextAction: 'LOCK_PARTY_B' | 'READY_FOR_SETTLEMENT' | null = null;

    if (params.party === 'A' && result.swap.status === TwoPhaseSwapStatus.PARTY_A_LOCKED) {
      nextAction = 'LOCK_PARTY_B';
    } else if (fullyLocked) {
      nextAction = 'READY_FOR_SETTLEMENT';
    }

    // Update delegation status for cNFT assets
    const assets = params.party === 'A' ? result.swap.assetsA : result.swap.assetsB;
    const [delegatePDA] = this.deriveDelegatePDA(params.swapId);

    for (const asset of assets) {
      if (asset.type === 'CNFT') {
        await this.stateMachine.updateAssetDelegation(params.swapId, asset.identifier, {
          delegated: true,
          delegateTxId: params.signature,
          delegatedAt: new Date().toISOString(),
          delegatePda: delegatePDA.toBase58(),
        });
      }
    }

    console.log('[TwoPhaseSwapLockService] Lock confirmed:', {
      swapId: params.swapId,
      party: params.party,
      newStatus: result.swap.status,
      fullyLocked,
      nextAction,
    });

    return {
      swap: result.swap,
      fullyLocked,
      nextAction,
    };
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get a swap by ID
   */
  async getSwap(swapId: string): Promise<TwoPhaseSwapData | null> {
    return this.stateMachine.getSwap(swapId);
  }

  /**
   * Get swaps for a wallet
   */
  async getSwapsForWallet(
    walletAddress: string,
    status?: TwoPhaseSwapStatus
  ): Promise<TwoPhaseSwapData[]> {
    const result = await this.stateMachine.getSwapsByParty(walletAddress, { status });
    return result.swaps;
  }

  /**
   * Check if a cNFT is currently delegated to the swap's delegate PDA
   */
  async isAssetDelegated(swapId: string, assetId: string): Promise<boolean> {
    const [delegatePDA] = this.deriveDelegatePDA(swapId);
    return this.delegationService.isDelegatedToProgram(assetId, delegatePDA);
  }

  // ===========================================================================
  // Cancellation
  // ===========================================================================

  /**
   * Cancel a swap (releases locked assets if any)
   *
   * @param swapId - Swap ID
   * @param walletAddress - Wallet requesting cancellation
   * @param reason - Optional cancellation reason
   */
  async cancelSwap(
    swapId: string,
    walletAddress: string,
    reason?: string
  ): Promise<TwoPhaseSwapData> {
    console.log('[TwoPhaseSwapLockService] Cancelling swap:', {
      swapId,
      wallet: walletAddress,
      reason,
    });

    const result = await this.stateMachine.cancelSwap(
      swapId,
      walletAddress,
      reason
    );

    if (!result.success || !result.swap) {
      throw new LockServiceError(result.error || 'Failed to cancel swap');
    }

    // Note: Actual asset release (revoke delegation, return SOL) is handled
    // separately based on the state at cancellation time

    return result.swap;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

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
 * Create a TwoPhaseSwapLockService instance
 */
export function createTwoPhaseSwapLockService(
  connection: Connection,
  prisma: PrismaClient,
  programId: PublicKey,
  feeCollector: PublicKey
): TwoPhaseSwapLockService {
  return new TwoPhaseSwapLockService(connection, prisma, programId, feeCollector);
}
