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
  ComputeBudgetProgram,
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
import { uuidToBuffer, uuidToUint8Array } from '../utils/uuid-conversion';
import * as crypto from 'crypto';

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
 * Individual lock transaction item (for multi-transaction lock sequences)
 */
export interface LockTransactionItem {
  /** Transaction index (0-based) */
  index: number;
  /** Purpose of this transaction */
  purpose: string;
  /** Serialized transaction (base64) */
  serialized: string;
  /** Instructions included in the transaction */
  instructions: TransactionInstruction[];
  /** Required signers for the transaction */
  requiredSigners: string[];
  /** Assets being locked in this transaction */
  assets: SwapAsset[];
  /** Estimated transaction size in bytes */
  estimatedSize: number;
}

/**
 * Result of building a lock transaction
 */
export interface LockTransactionResult {
  /** Serialized transaction (base64) - first transaction for backwards compatibility */
  serializedTransaction: string;
  /** Instructions included in the first transaction */
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
  /** All transactions (for multi-cNFT locks) */
  transactions?: LockTransactionItem[];
  /** Total number of transactions */
  transactionCount?: number;
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
  private delegateAuthority: PublicKey;

  constructor(
    connection: Connection,
    prisma: PrismaClient,
    programId: PublicKey,
    feeCollector: PublicKey,
    delegateAuthority: PublicKey
  ) {
    this.connection = connection;
    this.prisma = prisma;
    this.programId = programId;
    this.feeCollector = feeCollector;
    this.delegateAuthority = delegateAuthority;
    this.delegationService = createCnftDelegationService(connection);
    this.stateMachine = createSwapStateMachine(prisma);

    console.log('[TwoPhaseSwapLockService] Initialized');
    console.log('[TwoPhaseSwapLockService] Program ID:', programId.toBase58());
    console.log('[TwoPhaseSwapLockService] Fee Collector:', feeCollector.toBase58());
    console.log('[TwoPhaseSwapLockService] Delegate Authority:', delegateAuthority.toBase58());
  }

  // ===========================================================================
  // PDA Derivation
  // ===========================================================================

  /**
   * Get the delegate authority for cNFT assets
   *
   * IMPORTANT: This returns the backend signer's public key, NOT a PDA.
   * PDAs cannot sign external transactions, but the backend keypair can.
   * During settlement, the backend signer will sign the transfer transaction.
   *
   * For backwards compatibility, this still returns [PublicKey, number] format
   * where the second value is always 0 (no bump seed for regular keypairs).
   *
   * @param _swapId - The swap UUID (unused, kept for API compatibility)
   * @returns [delegateAuthority, 0]
   */
  deriveDelegatePDA(_swapId: string): [PublicKey, number] {
    console.log('[TwoPhaseSwapLockService] Using delegate authority (backend signer):', {
      delegateAuthority: this.delegateAuthority.toBase58(),
    });

    // Return backend signer's public key as delegate (not a PDA)
    // This allows the backend to sign settlement transactions
    return [this.delegateAuthority, 0];
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
  // Instruction Builders
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
   * Build deposit_two_phase_sol instruction
   *
   * This instruction initializes the vault PDA (if needed) and deposits SOL to it.
   * The vault will be owned by the escrow program, allowing later settlement.
   *
   * @param swapId - Swap UUID
   * @param party - Which party ('A' or 'B')
   * @param depositor - Depositor public key (signer)
   * @param amount - Amount in lamports to deposit
   * @returns Transaction instruction
   */
  buildDepositTwoPhaseInstruction(
    swapId: string,
    party: 'A' | 'B',
    depositor: PublicKey,
    amount: bigint
  ): TransactionInstruction {
    const [solVaultPDA] = this.deriveSolVaultPDA(swapId, party);
    const swapIdBytes = uuidToUint8Array(swapId);
    const partyByte = party.charCodeAt(0); // 'A' = 65, 'B' = 66

    // Build instruction data:
    // - discriminator (8 bytes)
    // - swap_id (16 bytes as [u8; 16])
    // - party (1 byte)
    // - amount (8 bytes as u64)
    const discriminator = this.getInstructionDiscriminator('deposit_two_phase_sol');

    const data = Buffer.alloc(8 + 16 + 1 + 8);
    discriminator.copy(data, 0);
    Buffer.from(swapIdBytes).copy(data, 8);
    data.writeUInt8(partyByte, 24);
    data.writeBigUInt64LE(amount, 25);

    const keys = [
      { pubkey: depositor, isSigner: true, isWritable: true },        // depositor
      { pubkey: solVaultPDA, isSigner: false, isWritable: true },     // sol_vault
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ];

    console.log('[TwoPhaseSwapLockService] Built deposit instruction:', {
      swapId,
      party,
      depositor: depositor.toBase58(),
      amount: amount.toString(),
      solVaultPDA: solVaultPDA.toBase58(),
    });

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
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

    const walletPubkey = new PublicKey(params.walletAddress);
    const cnftAssets = assets.filter((a) => a.type === 'CNFT');
    const solAmountEscrowed = solAmount || BigInt(0);

    // Get blockhash for all transactions
    const recentBlockhash = await this.connection.getLatestBlockhash();

    // =========================================================================
    // Split cNFT delegations across multiple transactions
    // Each cNFT delegation is ~488 bytes, max transaction size is 1232 bytes
    // Safe to put 1 cNFT delegation per transaction (with overhead for fee payer, etc.)
    // =========================================================================
    const MAX_CNFTS_PER_LOCK_TX = 1; // Conservative: 1 cNFT per transaction
    const transactions: LockTransactionItem[] = [];
    let totalEstimatedSize = 0;

    // Build delegation transactions for each cNFT (1 per transaction)
    for (let i = 0; i < cnftAssets.length; i += MAX_CNFTS_PER_LOCK_TX) {
      const cnftBatch = cnftAssets.slice(i, i + MAX_CNFTS_PER_LOCK_TX);
      const txInstructions: TransactionInstruction[] = [];
      let txEstimatedSize = 0;

      for (const asset of cnftBatch) {
        console.log(
          `[TwoPhaseSwapLockService] Building delegation for cNFT (tx ${transactions.length + 1}):`,
          asset.identifier
        );

        const delegationResult = await this.delegationService.buildDelegateInstruction(
          {
            assetId: asset.identifier,
            ownerPubkey: walletPubkey,
            delegatePDA,
            // Force re-delegation if cNFT is delegated to a stale/failed swap
            forceRedelegate: true,
          }
        );

        txInstructions.push(delegationResult.instruction);
        txEstimatedSize += delegationResult.estimatedSize;
        totalEstimatedSize += delegationResult.estimatedSize;
      }

      // Build transaction for this batch
      const transaction = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: walletPubkey,
      });

      // Add compute budget instructions for cNFT operations
      // cNFT delegation with Merkle proofs requires significant compute units
      // Deep trees (up to 24 proof nodes) can use 350k+ compute, so we use 400k
      // to match transactionGroupBuilder.ts and avoid ProgramFailedToComplete
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
      );

      for (const ix of txInstructions) {
        transaction.add(ix);
      }

      const serialized = transaction
        .serialize({ requireAllSignatures: false })
        .toString('base64');

      transactions.push({
        index: transactions.length,
        purpose: `Delegate cNFT ${cnftBatch.map(a => a.identifier.slice(0, 8)).join(', ')}`,
        serialized,
        instructions: txInstructions,
        requiredSigners: [params.walletAddress],
        assets: cnftBatch,
        estimatedSize: txEstimatedSize,
      });
    }

    // Build SOL deposit transaction (if SOL is being offered)
    if (solAmountEscrowed > BigInt(0)) {
      console.log(
        `[TwoPhaseSwapLockService] Building SOL escrow deposit:`,
        solAmountEscrowed.toString()
      );

      const depositInstruction = this.buildDepositTwoPhaseInstruction(
        params.swapId,
        params.party,
        walletPubkey,
        solAmountEscrowed
      );

      const solTransaction = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: walletPubkey,
      });
      solTransaction.add(depositInstruction);

      const serialized = solTransaction
        .serialize({ requireAllSignatures: false })
        .toString('base64');

      const solTxSize = 100; // SOL deposit is ~100 bytes
      totalEstimatedSize += solTxSize;

      transactions.push({
        index: transactions.length,
        purpose: `Deposit ${(Number(solAmountEscrowed) / 1e9).toFixed(4)} SOL to escrow`,
        serialized,
        instructions: [depositInstruction],
        requiredSigners: [params.walletAddress],
        assets: [], // No assets, just SOL
        estimatedSize: solTxSize,
      });
    }

    console.log('[TwoPhaseSwapLockService] Lock transactions built:', {
      swapId: params.swapId,
      party: params.party,
      transactionCount: transactions.length,
      cnftCount: cnftAssets.length,
      solAmount: solAmountEscrowed.toString(),
      totalEstimatedSize,
    });

    // For backwards compatibility, return first transaction as primary
    const firstTx = transactions[0];

    return {
      // Backwards compatible fields (first transaction)
      serializedTransaction: firstTx?.serialized || '',
      instructions: firstTx?.instructions || [],
      requiredSigners: [params.walletAddress],
      lockedAssets: assets,
      solAmountEscrowed,
      delegatePDA,
      solVaultPDA,
      estimatedSize: totalEstimatedSize,
      // New fields for multi-transaction locks
      transactions,
      transactionCount: transactions.length,
    };
  }

  /**
   * Rebuild a single lock transaction at a specific index with fresh Merkle proofs.
   *
   * This is used when a lock transaction fails due to stale Merkle proof after
   * a previous cNFT delegation modified the tree. The method fetches fresh proofs
   * from the DAS API and rebuilds only the specific transaction.
   *
   * @param params - Lock transaction parameters (swapId, walletAddress, party)
   * @param transactionIndex - Index of the transaction to rebuild (0-based)
   * @returns Single rebuilt lock transaction item
   */
  async rebuildSingleLockTransaction(
    params: BuildLockTransactionParams,
    transactionIndex: number
  ): Promise<LockTransactionItem> {
    console.log('[TwoPhaseSwapLockService] Rebuilding single lock transaction:', {
      swapId: params.swapId,
      wallet: params.walletAddress,
      party: params.party,
      transactionIndex,
    });

    // Fetch swap data
    const swap = await this.stateMachine.getSwap(params.swapId);
    if (!swap) {
      throw new SwapNotFoundError(params.swapId);
    }

    // Validate party - wallet must be a party to the swap
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

    // Validate swap state - rebuild is only valid during active lock phase
    // Party A can rebuild during ACCEPTED or LOCKING_PARTY_A
    // Party B can rebuild during PARTY_A_LOCKED or LOCKING_PARTY_B
    const validStatesA: TwoPhaseSwapStatus[] = [TwoPhaseSwapStatus.ACCEPTED, TwoPhaseSwapStatus.LOCKING_PARTY_A];
    const validStatesB: TwoPhaseSwapStatus[] = [TwoPhaseSwapStatus.PARTY_A_LOCKED, TwoPhaseSwapStatus.LOCKING_PARTY_B];
    const validStates = params.party === 'A' ? validStatesA : validStatesB;

    if (!validStates.includes(swap.status)) {
      throw new InvalidStateError(
        params.swapId,
        swap.status,
        validStates[0] // Expected initial state
      );
    }

    // Get party's assets
    const assets = params.party === 'A' ? swap.assetsA : swap.assetsB;
    const solAmount = params.party === 'A' ? swap.solAmountA : swap.solAmountB;
    const cnftAssets = assets.filter((a) => a.type === 'CNFT');
    const solAmountEscrowed = solAmount || BigInt(0);

    // Calculate max valid transaction index
    // Layout: [cNFT delegations...] [optional SOL deposit]
    const hasSolDeposit = solAmountEscrowed > BigInt(0);
    const maxValidIndex = hasSolDeposit ? cnftAssets.length : cnftAssets.length - 1;
    const isSolDeposit = transactionIndex === cnftAssets.length && hasSolDeposit;

    if (transactionIndex < 0 || transactionIndex > maxValidIndex) {
      const indexRange = hasSolDeposit
        ? `0-${cnftAssets.length} (${cnftAssets.length} cNFTs + SOL deposit)`
        : `0-${cnftAssets.length - 1} (${cnftAssets.length} cNFTs)`;
      throw new LockServiceError(
        `Invalid transaction index ${transactionIndex}. Valid range: ${indexRange}`
      );
    }

    // Derive PDAs
    const [delegatePDA] = this.deriveDelegatePDA(params.swapId);
    const [solVaultPDA] = this.deriveSolVaultPDA(params.swapId, params.party);
    const walletPubkey = new PublicKey(params.walletAddress);

    // Get fresh blockhash
    const recentBlockhash = await this.connection.getLatestBlockhash();

    if (isSolDeposit) {
      // Rebuild SOL deposit transaction
      console.log('[TwoPhaseSwapLockService] Rebuilding SOL deposit transaction');

      const depositInstruction = this.buildDepositTwoPhaseInstruction(
        params.swapId,
        params.party,
        walletPubkey,
        solAmountEscrowed
      );

      const solTransaction = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: walletPubkey,
      });
      solTransaction.add(depositInstruction);

      const serialized = solTransaction
        .serialize({ requireAllSignatures: false })
        .toString('base64');

      return {
        index: transactionIndex,
        purpose: `Deposit ${(Number(solAmountEscrowed) / 1e9).toFixed(4)} SOL to escrow`,
        serialized,
        instructions: [depositInstruction],
        requiredSigners: [params.walletAddress],
        assets: [],
        estimatedSize: 100,
      };
    }

    // Rebuild cNFT delegation transaction with fresh proof
    const cnft = cnftAssets[transactionIndex];
    if (!cnft) {
      throw new LockServiceError(
        `No cNFT found at index ${transactionIndex}. Total cNFTs: ${cnftAssets.length}`
      );
    }

    console.log('[TwoPhaseSwapLockService] Rebuilding delegation with fresh proof for:', {
      assetId: cnft.identifier,
      transactionIndex,
    });

    // Build fresh delegation instruction (this fetches new Merkle proof from DAS)
    const delegationResult = await this.delegationService.buildDelegateInstruction({
      assetId: cnft.identifier,
      ownerPubkey: walletPubkey,
      delegatePDA,
      // Force re-delegation if cNFT is delegated to a stale/failed swap
      forceRedelegate: true,
    });

    // Build transaction
    const transaction = new Transaction({
      recentBlockhash: recentBlockhash.blockhash,
      feePayer: walletPubkey,
    });

    // Add compute budget instructions for cNFT operations
    // Use 400k compute units to handle deep Merkle trees (up to 24 proof nodes)
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
    );
    transaction.add(delegationResult.instruction);

    const serialized = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    console.log('[TwoPhaseSwapLockService] Single lock transaction rebuilt with fresh proof');

    return {
      index: transactionIndex,
      purpose: `Delegate cNFT ${cnft.identifier.slice(0, 8)}`,
      serialized,
      instructions: [delegationResult.instruction],
      requiredSigners: [params.walletAddress],
      assets: [cnft],
      estimatedSize: delegationResult.estimatedSize,
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
 *
 * @param connection - Solana connection
 * @param prisma - Prisma client
 * @param programId - Escrow program ID
 * @param feeCollector - Fee collector public key
 * @param delegateAuthority - Backend signer's public key for cNFT delegation
 */
export function createTwoPhaseSwapLockService(
  connection: Connection,
  prisma: PrismaClient,
  programId: PublicKey,
  feeCollector: PublicKey,
  delegateAuthority: PublicKey
): TwoPhaseSwapLockService {
  return new TwoPhaseSwapLockService(connection, prisma, programId, feeCollector, delegateAuthority);
}
