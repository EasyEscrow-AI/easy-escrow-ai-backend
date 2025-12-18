/**
 * cNFT Delegation Service
 *
 * Manages cNFT delegation operations using Metaplex Bubblegum delegate authority.
 * This service enables non-custodial escrow patterns where:
 * - cNFT stays in user's wallet during listing
 * - Marketplace PDA has delegation authority to execute transfers
 * - Frozen assets prevent double-spend during swap lock
 *
 * Based on ADR-001: Delegation-Based Settlement for cNFT Atomic Swaps
 *
 * @see docs/ADR_DELEGATION_SETTLEMENT.md
 * @see docs/BUBBLEGUM_DELEGATION.md
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  AccountMeta,
  SystemProgram,
} from '@solana/web3.js';
import {
  createDelegateInstruction,
  createTransferInstruction,
  PROGRAM_ID as MPL_BUBBLEGUM_PROGRAM_ID,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
} from '../constants/bubblegum';
import { CnftService, createCnftService } from './cnftService';
import { CnftAssetData, DasProofResponse } from '../types/cnft';

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Base error class for delegation operations
 */
export class DelegationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DelegationError';
  }
}

/**
 * Delegation transaction failed
 */
export class DelegationFailedError extends DelegationError {
  public readonly assetId: string;
  public readonly reason: string;

  constructor(assetId: string, reason: string) {
    super(`Delegation failed for asset ${assetId}: ${reason}`);
    this.name = 'DelegationFailedError';
    this.assetId = assetId;
    this.reason = reason;
  }
}

/**
 * cNFT is already delegated to another account
 */
export class AlreadyDelegatedError extends DelegationError {
  public readonly assetId: string;
  public readonly currentDelegate: string;

  constructor(assetId: string, currentDelegate: string) {
    super(`Asset ${assetId} is already delegated to ${currentDelegate}`);
    this.name = 'AlreadyDelegatedError';
    this.assetId = assetId;
    this.currentDelegate = currentDelegate;
  }
}

/**
 * Transfer attempted without proper delegation
 */
export class NotDelegatedError extends DelegationError {
  public readonly assetId: string;
  public readonly expectedDelegate: string;

  constructor(assetId: string, expectedDelegate: string) {
    super(`Asset ${assetId} is not delegated to ${expectedDelegate}`);
    this.name = 'NotDelegatedError';
    this.assetId = assetId;
    this.expectedDelegate = expectedDelegate;
  }
}

/**
 * Wrong delegate authority provided
 */
export class InvalidDelegateError extends DelegationError {
  public readonly assetId: string;
  public readonly providedDelegate: string;
  public readonly expectedDelegate: string;

  constructor(assetId: string, providedDelegate: string, expectedDelegate: string) {
    super(
      `Invalid delegate for asset ${assetId}: ` +
        `provided ${providedDelegate}, expected ${expectedDelegate}`
    );
    this.name = 'InvalidDelegateError';
    this.assetId = assetId;
    this.providedDelegate = providedDelegate;
    this.expectedDelegate = expectedDelegate;
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Delegation status for a cNFT
 */
export enum DelegationStatus {
  /** Not delegated - owner has full control */
  NOT_DELEGATED = 'NOT_DELEGATED',
  /** Delegated to a specific account */
  DELEGATED = 'DELEGATED',
  /** Delegated and frozen (V2 feature) */
  DELEGATED_AND_FROZEN = 'DELEGATED_AND_FROZEN',
}

/**
 * Result of checking delegation status
 */
export interface DelegationStatusResult {
  status: DelegationStatus;
  delegate?: string;
  owner: string;
  frozen?: boolean;
}

/**
 * Parameters for delegating a cNFT
 */
export interface DelegateCnftParams {
  /** cNFT asset ID */
  assetId: string;
  /** Current owner public key */
  ownerPubkey: PublicKey;
  /** PDA or account to delegate to */
  delegatePDA: PublicKey;
  /** Previous delegate (defaults to owner if not set) */
  previousDelegate?: PublicKey;
}

/**
 * Parameters for revoking delegation
 */
export interface RevokeDelegationParams {
  /** cNFT asset ID */
  assetId: string;
  /** Current owner public key */
  ownerPubkey: PublicKey;
  /** Current delegate being revoked */
  currentDelegate?: PublicKey;
}

/**
 * Parameters for transferring as delegate
 */
export interface TransferAsDelegateParams {
  /** cNFT asset ID */
  assetId: string;
  /** Current owner (from wallet) */
  fromOwner: PublicKey;
  /** New owner (to wallet) */
  toRecipient: PublicKey;
  /** Delegate authority (PDA signing the transfer) */
  delegatePDA: PublicKey;
}

/**
 * Result of building a delegation instruction
 */
export interface DelegationInstructionResult {
  /** The delegation instruction */
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
 * Service configuration
 */
export interface CnftDelegationServiceConfig {
  /** Maximum retry attempts for transient failures */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
}

// =============================================================================
// PDA Derivation Constants
// =============================================================================

/**
 * Seeds for marketplace delegate PDA
 * Format: ['delegate', marketplaceId]
 */
export const DELEGATE_PDA_SEEDS = {
  prefix: 'delegate',
};

/**
 * Seeds for escrow agreement PDA
 * Format: ['escrow', agreementId]
 */
export const ESCROW_PDA_SEEDS = {
  prefix: 'escrow',
};

// =============================================================================
// Main Service Class
// =============================================================================

/**
 * Service for managing cNFT delegation operations
 *
 * Provides methods for:
 * - Delegating cNFTs to marketplace PDAs
 * - Revoking delegation
 * - Transferring cNFTs as delegate authority
 * - Checking delegation status
 */
export class CnftDelegationService {
  private connection: Connection;
  private cnftService: CnftService;
  private config: CnftDelegationServiceConfig;

  private static readonly DEFAULT_CONFIG: CnftDelegationServiceConfig = {
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  constructor(
    connection: Connection,
    config?: Partial<CnftDelegationServiceConfig>
  ) {
    this.connection = connection;
    this.cnftService = createCnftService(connection);
    this.config = {
      ...CnftDelegationService.DEFAULT_CONFIG,
      ...config,
    };

    console.log('[CnftDelegationService] Initialized');
  }

  // ===========================================================================
  // PDA Derivation
  // ===========================================================================

  /**
   * Derive marketplace delegate PDA
   *
   * This PDA can be used as the delegate authority for cNFTs,
   * allowing the escrow program to authorize transfers.
   *
   * @param programId - The escrow program ID
   * @param marketplaceId - Unique identifier for the marketplace
   * @returns [PDA, bump seed]
   */
  deriveMarketplaceDelegatePDA(
    programId: PublicKey,
    marketplaceId: Buffer | Uint8Array | string
  ): [PublicKey, number] {
    const idBuffer =
      typeof marketplaceId === 'string'
        ? Buffer.from(marketplaceId)
        : Buffer.from(marketplaceId);

    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(DELEGATE_PDA_SEEDS.prefix), idBuffer],
      programId
    );

    console.log('[CnftDelegationService] Derived marketplace delegate PDA:', {
      programId: programId.toBase58(),
      marketplaceId:
        typeof marketplaceId === 'string' ? marketplaceId : idBuffer.toString('hex'),
      pda: pda.toBase58(),
      bump,
    });

    return [pda, bump];
  }

  /**
   * Derive escrow PDA for a specific agreement
   *
   * @param programId - The escrow program ID
   * @param agreementId - Unique agreement identifier
   * @returns [PDA, bump seed]
   */
  deriveEscrowPDA(
    programId: PublicKey,
    agreementId: Buffer | Uint8Array | string
  ): [PublicKey, number] {
    const idBuffer =
      typeof agreementId === 'string'
        ? Buffer.from(agreementId)
        : Buffer.from(agreementId);

    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(ESCROW_PDA_SEEDS.prefix), idBuffer],
      programId
    );

    console.log('[CnftDelegationService] Derived escrow PDA:', {
      programId: programId.toBase58(),
      agreementId:
        typeof agreementId === 'string' ? agreementId : idBuffer.toString('hex'),
      pda: pda.toBase58(),
      bump,
    });

    return [pda, bump];
  }

  // ===========================================================================
  // Delegation Status
  // ===========================================================================

  /**
   * Get current delegation status for a cNFT
   *
   * @param assetId - The cNFT asset ID
   * @returns Delegation status with delegate info if applicable
   */
  async getDelegationStatus(assetId: string): Promise<DelegationStatusResult> {
    console.log('[CnftDelegationService] Getting delegation status:', assetId);

    try {
      const assetData = await this.cnftService.getCnftAsset(assetId);

      const owner = assetData.ownership.owner;
      const delegate = assetData.ownership.delegate;

      // Determine status based on delegate field
      let status: DelegationStatus;
      if (!delegate || delegate === owner) {
        status = DelegationStatus.NOT_DELEGATED;
      } else {
        // Note: Freeze status requires Bubblegum V2 and additional API calls
        // For now, we report DELEGATED; freeze detection can be added later
        status = DelegationStatus.DELEGATED;
      }

      const result: DelegationStatusResult = {
        status,
        owner,
        delegate: delegate !== owner ? delegate : undefined,
      };

      console.log('[CnftDelegationService] Delegation status:', result);
      return result;
    } catch (error: any) {
      console.error(
        '[CnftDelegationService] Failed to get delegation status:',
        error.message
      );
      throw new DelegationError(
        `Failed to get delegation status for ${assetId}: ${error.message}`
      );
    }
  }

  /**
   * Check if a cNFT is delegated to a specific PDA/account
   *
   * @param assetId - The cNFT asset ID
   * @param delegatePDA - The expected delegate account
   * @returns true if delegated to the specified account
   */
  async isDelegatedToProgram(
    assetId: string,
    delegatePDA: PublicKey
  ): Promise<boolean> {
    console.log('[CnftDelegationService] Checking if delegated to:', {
      assetId,
      delegatePDA: delegatePDA.toBase58(),
    });

    try {
      const status = await this.getDelegationStatus(assetId);

      // Check for both DELEGATED and DELEGATED_AND_FROZEN states
      const isDelegatedStatus =
        status.status === DelegationStatus.DELEGATED ||
        status.status === DelegationStatus.DELEGATED_AND_FROZEN;
      const isDelegated =
        isDelegatedStatus && status.delegate === delegatePDA.toBase58();

      console.log('[CnftDelegationService] isDelegatedToProgram result:', isDelegated);
      return isDelegated;
    } catch (error: any) {
      console.error(
        '[CnftDelegationService] Failed to check delegation:',
        error.message
      );
      return false;
    }
  }

  // ===========================================================================
  // Delegation Instructions
  // ===========================================================================

  /**
   * Build delegate instruction for a cNFT
   *
   * Low-level instruction builder that creates a Bubblegum delegate instruction.
   * The owner must sign this transaction.
   *
   * @param params - Delegation parameters
   * @param retryCount - Current retry attempt (for stale proof handling)
   * @returns Delegation instruction with metadata
   */
  async buildDelegateInstruction(
    params: DelegateCnftParams,
    retryCount = 0
  ): Promise<DelegationInstructionResult> {
    console.log('[CnftDelegationService] Building delegate instruction:', {
      assetId: params.assetId,
      owner: params.ownerPubkey.toBase58(),
      newDelegate: params.delegatePDA.toBase58(),
      retryCount,
    });

    // Fetch asset data and proof
    const assetData = await this.cnftService.getCnftAsset(params.assetId);

    // Validate ownership
    if (assetData.ownership.owner !== params.ownerPubkey.toBase58()) {
      throw new DelegationFailedError(
        params.assetId,
        `Ownership mismatch: expected ${params.ownerPubkey.toBase58()}, ` +
          `actual ${assetData.ownership.owner}`
      );
    }

    // Check if already delegated to a different account
    // Exception: Allow delegation to owner (revocation) even if already delegated
    const currentDelegate = assetData.ownership.delegate;
    const isRevocation = params.delegatePDA.toBase58() === assetData.ownership.owner;
    if (
      !isRevocation &&
      currentDelegate &&
      currentDelegate !== assetData.ownership.owner &&
      currentDelegate !== params.delegatePDA.toBase58()
    ) {
      throw new AlreadyDelegatedError(params.assetId, currentDelegate);
    }

    // Fetch fresh proof (skip cache for critical operations)
    const proofData = await this.cnftService.getCnftProof(
      params.assetId,
      true, // Skip cache
      retryCount
    );

    // Convert proof to transfer params format
    const treeAddress = new PublicKey(assetData.compression.tree);
    const treeAuthority = this.cnftService.deriveTreeAuthority(treeAddress);
    const cnftProof = await this.cnftService.convertDasProofToCnftProofAsync(
      proofData,
      assetData
    );

    // Determine previous delegate
    const previousDelegate =
      params.previousDelegate ||
      (currentDelegate ? new PublicKey(currentDelegate) : params.ownerPubkey);

    // Build the delegate instruction
    const instruction = createDelegateInstruction(
      {
        treeAuthority,
        leafOwner: params.ownerPubkey,
        previousLeafDelegate: previousDelegate,
        newLeafDelegate: params.delegatePDA,
        merkleTree: treeAddress,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      },
      {
        root: Array.from(cnftProof.root),
        dataHash: Array.from(cnftProof.dataHash),
        creatorHash: Array.from(cnftProof.creatorHash),
        nonce:
          typeof cnftProof.nonce === 'bigint'
            ? Number(cnftProof.nonce)
            : cnftProof.nonce,
        index: cnftProof.index,
      }
    );

    // Convert proof nodes to PublicKey array
    const proofNodes: PublicKey[] = (cnftProof.proof || []).map(
      (node: number[] | Uint8Array) => {
        const nodeBuffer = node instanceof Uint8Array ? node : Buffer.from(node);
        return new PublicKey(nodeBuffer);
      }
    );

    // Add proof nodes as remaining accounts
    const proofAccountMetas: AccountMeta[] = proofNodes.map((node) => ({
      pubkey: node,
      isSigner: false,
      isWritable: false,
    }));
    instruction.keys.push(...proofAccountMetas);

    // Estimate size
    const estimatedSize = 200 + proofNodes.length * 32;

    console.log('[CnftDelegationService] Delegate instruction built:', {
      accountCount: instruction.keys.length,
      proofNodes: proofNodes.length,
      estimatedSize,
    });

    return {
      instruction,
      treeAddress,
      treeAuthority,
      proofNodes,
      estimatedSize,
    };
  }

  /**
   * Build revoke delegation instruction
   *
   * Revokes delegation by setting the delegate back to the owner.
   * This is effectively a "self-delegation" that removes external delegation.
   *
   * @param params - Revocation parameters
   * @param retryCount - Current retry attempt
   * @returns Revoke instruction with metadata
   */
  async buildRevokeInstruction(
    params: RevokeDelegationParams,
    retryCount = 0
  ): Promise<DelegationInstructionResult> {
    console.log('[CnftDelegationService] Building revoke instruction:', {
      assetId: params.assetId,
      owner: params.ownerPubkey.toBase58(),
      retryCount,
    });

    // Fetch asset data to get current delegate
    const assetData = await this.cnftService.getCnftAsset(params.assetId);

    // Validate ownership
    if (assetData.ownership.owner !== params.ownerPubkey.toBase58()) {
      throw new DelegationFailedError(
        params.assetId,
        `Ownership mismatch: expected ${params.ownerPubkey.toBase58()}, ` +
          `actual ${assetData.ownership.owner}`
      );
    }

    // Determine current delegate
    const currentDelegate =
      params.currentDelegate ||
      (assetData.ownership.delegate
        ? new PublicKey(assetData.ownership.delegate)
        : params.ownerPubkey);

    // Revoke by delegating back to owner (self-delegation)
    return this.buildDelegateInstruction(
      {
        assetId: params.assetId,
        ownerPubkey: params.ownerPubkey,
        delegatePDA: params.ownerPubkey, // Delegate to self = revoke
        previousDelegate: currentDelegate,
      },
      retryCount
    );
  }

  // ===========================================================================
  // High-Level Delegation Methods
  // ===========================================================================

  /**
   * Delegate a cNFT to a marketplace PDA
   *
   * High-level method that builds and returns a delegation instruction.
   * The caller is responsible for signing and submitting the transaction.
   *
   * @param assetId - The cNFT asset ID
   * @param ownerPubkey - Current owner public key
   * @param delegatePDA - PDA to delegate to
   * @returns Delegation instruction result
   */
  async delegateCnft(
    assetId: string,
    ownerPubkey: PublicKey,
    delegatePDA: PublicKey
  ): Promise<DelegationInstructionResult> {
    console.log('[CnftDelegationService] Delegating cNFT:', {
      assetId,
      owner: ownerPubkey.toBase58(),
      delegate: delegatePDA.toBase58(),
    });

    return this.buildDelegateInstruction(
      {
        assetId,
        ownerPubkey,
        delegatePDA,
      },
      0
    );
  }

  /**
   * Revoke delegation for a cNFT
   *
   * High-level method that builds and returns a revocation instruction.
   * The caller is responsible for signing and submitting the transaction.
   *
   * @param assetId - The cNFT asset ID
   * @param ownerPubkey - Current owner public key
   * @returns Revoke instruction result
   */
  async revokeDelegation(
    assetId: string,
    ownerPubkey: PublicKey
  ): Promise<DelegationInstructionResult> {
    console.log('[CnftDelegationService] Revoking delegation:', {
      assetId,
      owner: ownerPubkey.toBase58(),
    });

    return this.buildRevokeInstruction(
      {
        assetId,
        ownerPubkey,
      },
      0
    );
  }

  /**
   * Build transfer instruction using delegate authority
   *
   * Builds a transfer instruction where the delegate (not the owner) authorizes
   * the transfer. This is the core mechanism for escrow settlement.
   *
   * @param params - Transfer parameters
   * @param retryCount - Current retry attempt (for stale proof handling)
   * @param preFetchedProof - Optional pre-fetched proof for batch operations
   * @returns Transfer instruction result
   */
  async transferAsDelegate(
    params: TransferAsDelegateParams,
    retryCount = 0,
    preFetchedProof?: DasProofResponse
  ): Promise<DelegationInstructionResult> {
    console.log('[CnftDelegationService] Building transfer as delegate:', {
      assetId: params.assetId,
      from: params.fromOwner.toBase58(),
      to: params.toRecipient.toBase58(),
      delegate: params.delegatePDA.toBase58(),
      retryCount,
      usingPreFetchedProof: !!preFetchedProof,
    });

    // Fetch asset data
    const assetData = await this.cnftService.getCnftAsset(params.assetId);

    // Validate ownership
    if (assetData.ownership.owner !== params.fromOwner.toBase58()) {
      throw new DelegationFailedError(
        params.assetId,
        `Ownership mismatch: expected ${params.fromOwner.toBase58()}, ` +
          `actual ${assetData.ownership.owner}`
      );
    }

    // Validate delegation
    const currentDelegate = assetData.ownership.delegate;
    if (!currentDelegate || currentDelegate !== params.delegatePDA.toBase58()) {
      throw new NotDelegatedError(params.assetId, params.delegatePDA.toBase58());
    }

    // Get proof (use pre-fetched or fetch fresh)
    let proofData: DasProofResponse;
    if (preFetchedProof) {
      proofData = preFetchedProof;
    } else {
      proofData = await this.cnftService.getCnftProof(
        params.assetId,
        true, // Skip cache
        retryCount
      );
    }

    // Convert to CnftProof format
    const treeAddress = new PublicKey(assetData.compression.tree);
    const treeAuthority = this.cnftService.deriveTreeAuthority(treeAddress);
    const cnftProof = await this.cnftService.convertDasProofToCnftProofAsync(
      proofData,
      assetData
    );

    // Build transfer instruction
    const instruction = createTransferInstruction(
      {
        treeAuthority,
        leafOwner: params.fromOwner,
        leafDelegate: params.delegatePDA, // Delegate signs
        newLeafOwner: params.toRecipient,
        merkleTree: treeAddress,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      },
      {
        root: Array.from(cnftProof.root),
        dataHash: Array.from(cnftProof.dataHash),
        creatorHash: Array.from(cnftProof.creatorHash),
        nonce:
          typeof cnftProof.nonce === 'bigint'
            ? Number(cnftProof.nonce)
            : cnftProof.nonce,
        index: cnftProof.index,
      }
    );

    // CRITICAL: Fix signer flag for delegate
    // mpl-bubblegum may not set the delegate as signer correctly
    const delegateIndex = instruction.keys.findIndex((key) =>
      key.pubkey.equals(params.delegatePDA)
    );
    if (delegateIndex !== -1) {
      instruction.keys[delegateIndex].isSigner = true;
      console.log(
        '[CnftDelegationService] Fixed signer flag for delegate:',
        params.delegatePDA.toBase58()
      );
    }

    // Convert proof nodes to PublicKey array
    const proofNodes: PublicKey[] = (cnftProof.proof || []).map(
      (node: number[] | Uint8Array) => {
        const nodeBuffer = node instanceof Uint8Array ? node : Buffer.from(node);
        return new PublicKey(nodeBuffer);
      }
    );

    // Add proof nodes as remaining accounts
    const proofAccountMetas: AccountMeta[] = proofNodes.map((node) => ({
      pubkey: node,
      isSigner: false,
      isWritable: false,
    }));
    instruction.keys.push(...proofAccountMetas);

    // Estimate size
    const estimatedSize = 200 + proofNodes.length * 32;

    console.log('[CnftDelegationService] Transfer as delegate instruction built:', {
      accountCount: instruction.keys.length,
      proofNodes: proofNodes.length,
      estimatedSize,
    });

    return {
      instruction,
      treeAddress,
      treeAuthority,
      proofNodes,
      estimatedSize,
    };
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Build transfer instructions for multiple cNFTs as delegate
   *
   * Optimized for batch operations like bulk swaps.
   * Fetches all proofs in a single batch call to reduce API calls
   * and minimize stale proof risk.
   *
   * @param transfers - Array of transfer parameters
   * @returns Array of transfer instruction results
   */
  async batchTransferAsDelegate(
    transfers: TransferAsDelegateParams[]
  ): Promise<DelegationInstructionResult[]> {
    console.log(
      '[CnftDelegationService] Building batch transfer as delegate:',
      transfers.length
    );

    if (transfers.length === 0) {
      return [];
    }

    // Batch fetch all proofs
    const assetIds = transfers.map((t) => t.assetId);
    const proofsMap = await this.cnftService.getAssetProofBatch(
      assetIds,
      true // Skip cache for fresh proofs
    );

    // Build instructions for each transfer
    const results: DelegationInstructionResult[] = [];
    for (const transfer of transfers) {
      const proof = proofsMap.get(transfer.assetId);
      if (!proof) {
        throw new DelegationFailedError(
          transfer.assetId,
          'Failed to fetch proof in batch'
        );
      }

      const result = await this.transferAsDelegate(transfer, 0, proof);
      results.push(result);
    }

    console.log(
      '[CnftDelegationService] Batch transfer instructions built:',
      results.length
    );
    return results;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get the underlying CnftService for direct access
   */
  getCnftService(): CnftService {
    return this.cnftService;
  }

  /**
   * Validate that a cNFT can be delegated
   *
   * Checks ownership and current delegation status.
   *
   * @param assetId - The cNFT asset ID
   * @param ownerPubkey - Expected owner
   * @param targetDelegate - Intended delegate (optional, for checking conflicts)
   * @returns Validation result with reason if invalid
   */
  async validateCanDelegate(
    assetId: string,
    ownerPubkey: PublicKey,
    targetDelegate?: PublicKey
  ): Promise<{ valid: boolean; reason?: string }> {
    console.log('[CnftDelegationService] Validating can delegate:', {
      assetId,
      owner: ownerPubkey.toBase58(),
      targetDelegate: targetDelegate?.toBase58(),
    });

    try {
      const assetData = await this.cnftService.getCnftAsset(assetId);

      // Check ownership
      if (assetData.ownership.owner !== ownerPubkey.toBase58()) {
        return {
          valid: false,
          reason: `Ownership mismatch: expected ${ownerPubkey.toBase58()}, actual ${assetData.ownership.owner}`,
        };
      }

      // Check existing delegation
      const currentDelegate = assetData.ownership.delegate;
      if (
        currentDelegate &&
        currentDelegate !== assetData.ownership.owner &&
        targetDelegate &&
        currentDelegate !== targetDelegate.toBase58()
      ) {
        return {
          valid: false,
          reason: `Already delegated to ${currentDelegate}`,
        };
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        reason: `Validation failed: ${error.message}`,
      };
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a CnftDelegationService instance
 */
export function createCnftDelegationService(
  connection: Connection,
  config?: Partial<CnftDelegationServiceConfig>
): CnftDelegationService {
  return new CnftDelegationService(connection, config);
}
