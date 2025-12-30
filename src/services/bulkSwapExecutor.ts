/**
 * Bulk Swap Executor Service
 * 
 * Orchestrates the execution of bulk cNFT swaps using:
 * - TransactionGroupBuilder for transaction splitting
 * - Jito bundles for atomic multi-transaction execution
 * 
 * This service bridges OfferManager with the underlying Jito bundle submission.
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { 
  TransactionGroupBuilder, 
  TransactionGroupResult, 
  SwapStrategy,
  TransactionGroupInput,
  createTransactionGroupBuilder,
} from './transactionGroupBuilder';
import { getEscrowProgramService, EscrowProgramService } from './escrow-program.service';
import { ALTService } from './altService';
import { isJitoBundlesEnabled } from '../utils/featureFlags';

/**
 * Result of bulk swap execution
 */
export interface BulkSwapExecutionResult {
  /** Whether the execution was successful */
  success: boolean;
  /** Strategy used */
  strategy: SwapStrategy;
  /** Transaction signatures (single tx) or bundle ID (bulk) */
  signatures?: string[];
  bundleId?: string;
  /** Bundle status if using Jito */
  bundleStatus?: 'Pending' | 'Landed' | 'Failed' | 'Timeout';
  /** Error message if failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: 'STALE_PROOF_REBUILD_REQUIRED' | 'EXECUTION_FAILED' | 'BUILD_FAILED';
  /** Transaction group info for bulk swaps */
  transactionGroup?: TransactionGroupResult;
  /** Indices of transactions with stale proofs (when errorCode is STALE_PROOF_REBUILD_REQUIRED) */
  staleTransactionIndices?: number[];
  /** Whether client needs to re-sign transactions */
  requiresResigning?: boolean;
}

/**
 * Options for bulk swap execution
 */
export interface BulkSwapExecutionOptions {
  /** Wait for confirmation (default: true) */
  waitForConfirmation?: boolean;
  /** Confirmation timeout in seconds (default: 30) */
  confirmationTimeoutSeconds?: number;
  /** Skip bundle simulation (use with caution) */
  skipSimulation?: boolean;
  /** Description for logging */
  description?: string;
}

/**
 * Service for executing bulk cNFT swaps with automatic strategy selection
 */
export class BulkSwapExecutor {
  private connection: Connection;
  private transactionGroupBuilder: TransactionGroupBuilder;
  private escrowProgramService: EscrowProgramService;
  
  constructor(
    connection: Connection,
    platformAuthority: Keypair,
    treasuryPda?: PublicKey,
    altService?: ALTService
  ) {
    this.connection = connection;
    this.transactionGroupBuilder = createTransactionGroupBuilder(
      connection,
      platformAuthority,
      treasuryPda,
      altService
    );
    this.escrowProgramService = getEscrowProgramService();
    
    const jitoEnabled = isJitoBundlesEnabled();
    console.log('[BulkSwapExecutor] Initialized');
    console.log(`[BulkSwapExecutor] JITO bundles: ${jitoEnabled ? 'ENABLED' : 'DISABLED (will use sequential transactions)'}`);
  }
  
  /**
   * Execute a bulk swap with automatic strategy selection
   * 
   * - For 1-2 total cNFTs: Uses single transaction
   * - For 3+ total cNFTs: Uses Jito bundle for atomicity
   * 
   * @param inputs - Transaction build inputs
   * @param options - Execution options
   * @returns Execution result with signatures/bundle ID
   */
  async executeSwap(
    inputs: TransactionGroupInput,
    options: BulkSwapExecutionOptions = {}
  ): Promise<BulkSwapExecutionResult> {
    const {
      waitForConfirmation = true,
      confirmationTimeoutSeconds = 30,
      skipSimulation = true, // Default to true - Jito API doesn't support simulateBundle
      description = 'Bulk swap',
    } = options;
    
    console.log('[BulkSwapExecutor] Executing swap:', {
      makerAssets: inputs.makerAssets.length,
      takerAssets: inputs.takerAssets.length,
      waitForConfirmation,
    });
    
    try {
      // Build transaction group
      const groupResult = await this.transactionGroupBuilder.buildTransactionGroup(inputs);
      
      console.log('[BulkSwapExecutor] Transaction group built:', {
        strategy: groupResult.strategy,
        transactionCount: groupResult.transactionCount,
        requiresJitoBundle: groupResult.requiresJitoBundle,
      });
      
      if (groupResult.strategy === SwapStrategy.CANNOT_FIT) {
        return {
          success: false,
          strategy: groupResult.strategy,
          error: `Swap cannot be executed: ${groupResult.analysis.reason}`,
          transactionGroup: groupResult,
        };
      }
      
      // Execute based on strategy
      if (groupResult.strategy === SwapStrategy.SINGLE_TRANSACTION) {
        return this.executeSingleTransaction(groupResult, waitForConfirmation);
      } else {
        return this.executeJitoBundle(groupResult, {
          waitForConfirmation,
          confirmationTimeoutSeconds,
          skipSimulation,
          description,
        });
      }
      
    } catch (error) {
      console.error('[BulkSwapExecutor] Execution error:', error);
      return {
        success: false,
        strategy: SwapStrategy.CANNOT_FIT,
        error: error instanceof Error ? error.message : 'Unknown execution error',
      };
    }
  }
  
  /**
   * Execute a single transaction swap
   */
  private async executeSingleTransaction(
    groupResult: TransactionGroupResult,
    waitForConfirmation: boolean
  ): Promise<BulkSwapExecutionResult> {
    console.log('[BulkSwapExecutor] Executing single transaction...');
    
    const tx = groupResult.transactions[0];
    if (!tx.transaction) {
      return {
        success: false,
        strategy: groupResult.strategy,
        error: 'Transaction not built',
        transactionGroup: groupResult,
      };
    }
    
    // The transaction is already signed by platform authority
    // It needs maker and taker signatures before submission
    // For now, return the prepared transaction for client-side signing
    
    return {
      success: true,
      strategy: groupResult.strategy,
      signatures: [], // Will be populated after client signs and submits
      transactionGroup: groupResult,
    };
  }
  
  /**
   * Execute a Jito bundle for multi-transaction swaps
   */
  private async executeJitoBundle(
    groupResult: TransactionGroupResult,
    options: {
      waitForConfirmation: boolean;
      confirmationTimeoutSeconds: number;
      skipSimulation: boolean;
      description: string;
    }
  ): Promise<BulkSwapExecutionResult> {
    console.log(`[BulkSwapExecutor] Executing Jito bundle with ${groupResult.transactionCount} transactions...`);
    
    // Collect serialized transactions
    const serializedTransactions: string[] = [];
    
    for (const txItem of groupResult.transactions) {
      if (!txItem.transaction) {
        return {
          success: false,
          strategy: groupResult.strategy,
          error: `Transaction ${txItem.index} not built`,
          transactionGroup: groupResult,
        };
      }
      serializedTransactions.push(txItem.transaction.serializedTransaction);
    }
    
    // Submit bundle to Jito
    const bundleResult = await this.escrowProgramService.sendBundleViaJito(
      serializedTransactions,
      {
        skipSimulation: options.skipSimulation,
        description: options.description,
      }
    );
    
    if (!bundleResult.success) {
      return {
        success: false,
        strategy: groupResult.strategy,
        error: bundleResult.error,
        transactionGroup: groupResult,
      };
    }
    
    // Wait for confirmation if requested
    if (options.waitForConfirmation && bundleResult.bundleId) {
      const confirmation = await this.escrowProgramService.waitForBundleConfirmation(
        bundleResult.bundleId,
        options.confirmationTimeoutSeconds,
        bundleResult.signatures
      );
      
      return {
        success: confirmation.confirmed,
        strategy: groupResult.strategy,
        bundleId: bundleResult.bundleId,
        bundleStatus: confirmation.status,
        error: confirmation.error,
        transactionGroup: groupResult,
      };
    }
    
    // Return without waiting for confirmation
    return {
      success: true,
      strategy: groupResult.strategy,
      bundleId: bundleResult.bundleId,
      bundleStatus: 'Pending',
      transactionGroup: groupResult,
    };
  }
  
  /**
   * Get the TransactionGroupBuilder instance
   */
  getTransactionGroupBuilder(): TransactionGroupBuilder {
    return this.transactionGroupBuilder;
  }
  
  /**
   * Check if a swap requires Jito bundle
   */
  requiresJitoBundle(inputs: TransactionGroupInput): boolean {
    return this.transactionGroupBuilder.requiresJitoBundle(inputs);
  }
  
  /**
   * Analyze a swap without building transactions
   */
  analyzeSwap(inputs: TransactionGroupInput) {
    return this.transactionGroupBuilder.analyzeSwap(inputs);
  }

  /**
   * Validate all cNFT proofs in a transaction group before bundle submission.
   * This should be called just before submitting to Jito to ensure proofs are still fresh.
   *
   * @param groupResult - The built transaction group
   * @returns Validation result with list of stale transaction indices
   */
  async validateProofsBeforeSubmission(
    groupResult: TransactionGroupResult
  ): Promise<{
    allValid: boolean;
    staleTransactionIndices: number[];
    validationResults: Map<number, { assetId: string; isValid: boolean; onChainRoot: string }>;
  }> {
    console.log('[BulkSwapExecutor] Validating proofs before bundle submission...');

    const result = await this.transactionGroupBuilder.validateCnftProofsInGroup(groupResult);

    const allValid = result.staleTransactionIndices.length === 0;

    console.log('[BulkSwapExecutor] Proof validation complete:', {
      allValid,
      staleCount: result.staleTransactionIndices.length,
      staleIndices: result.staleTransactionIndices,
    });

    return {
      allValid,
      staleTransactionIndices: result.staleTransactionIndices,
      validationResults: result.validationResults,
    };
  }

  /**
   * Rebuild stale transactions in a group with fresh proofs.
   * Call this when validateProofsBeforeSubmission() returns stale transactions.
   *
   * @param groupResult - The original transaction group
   * @param staleTransactionIndices - Indices of transactions to rebuild
   * @param inputs - Original build inputs (needed to reconstruct transactions)
   * @returns Updated transaction group with rebuilt transactions
   */
  async rebuildStaleTransactions(
    groupResult: TransactionGroupResult,
    staleTransactionIndices: number[],
    inputs: TransactionGroupInput
  ): Promise<{
    updatedGroup: TransactionGroupResult;
    rebuiltIndices: number[];
    requiresResigning: boolean;
  }> {
    console.log('[BulkSwapExecutor] Rebuilding stale transactions:', staleTransactionIndices);

    // Clone the group result
    const updatedGroup: TransactionGroupResult = {
      ...groupResult,
      transactions: [...groupResult.transactions],
    };

    const rebuiltIndices: number[] = [];

    // Rebuild each stale transaction
    for (const txIndex of staleTransactionIndices) {
      try {
        const result = await this.transactionGroupBuilder.rebuildCnftTransactionWithFreshProof(
          groupResult,
          txIndex,
          inputs
        );

        // Replace the transaction in the group
        updatedGroup.transactions[txIndex] = result.rebuiltTransaction;
        rebuiltIndices.push(txIndex);

        console.log(`[BulkSwapExecutor] Successfully rebuilt transaction ${txIndex}`);
      } catch (error) {
        console.error(`[BulkSwapExecutor] Failed to rebuild transaction ${txIndex}:`, error);
        throw new Error(`Failed to rebuild transaction ${txIndex}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log('[BulkSwapExecutor] Rebuild complete:', {
      rebuiltCount: rebuiltIndices.length,
      rebuiltIndices,
    });

    return {
      updatedGroup,
      rebuiltIndices,
      requiresResigning: rebuiltIndices.length > 0,
    };
  }

  /**
   * Execute a swap with automatic stale proof detection and rebuild.
   * This is the recommended method for executing swaps that may have stale proofs.
   *
   * @param inputs - Transaction build inputs
   * @param options - Execution options
   * @param maxRetries - Maximum number of rebuild attempts (default: 3)
   * @returns Execution result
   */
  async executeSwapWithProofValidation(
    inputs: TransactionGroupInput,
    options: BulkSwapExecutionOptions = {},
    maxRetries: number = 3
  ): Promise<BulkSwapExecutionResult> {
    console.log('[BulkSwapExecutor] Executing swap with proof validation...');

    let groupResult: TransactionGroupResult | null = null;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // Build or use existing group
        if (!groupResult) {
          groupResult = await this.transactionGroupBuilder.buildTransactionGroup(inputs);
        }

        // Validate proofs before submission
        const validation = await this.validateProofsBeforeSubmission(groupResult);

        if (!validation.allValid) {
          console.log(`[BulkSwapExecutor] Stale proofs detected (attempt ${retryCount + 1}/${maxRetries}), rebuilding...`);

          // Rebuild stale transactions
          const rebuildResult = await this.rebuildStaleTransactions(
            groupResult,
            validation.staleTransactionIndices,
            inputs
          );

          groupResult = rebuildResult.updatedGroup;
          retryCount++;

          // Continue to re-validate after rebuild
          continue;
        }

        // All proofs are valid, proceed with execution
        console.log('[BulkSwapExecutor] All proofs validated, proceeding with execution...');

        if (groupResult.strategy === SwapStrategy.SINGLE_TRANSACTION) {
          return this.executeSingleTransaction(groupResult, options.waitForConfirmation ?? true);
        } else {
          return this.executeJitoBundle(groupResult, {
            waitForConfirmation: options.waitForConfirmation ?? true,
            confirmationTimeoutSeconds: options.confirmationTimeoutSeconds ?? 30,
            skipSimulation: options.skipSimulation ?? true,
            description: options.description ?? 'Bulk swap with proof validation',
          });
        }
      } catch (error) {
        console.error('[BulkSwapExecutor] Execution error:', error);
        return {
          success: false,
          strategy: groupResult?.strategy || SwapStrategy.CANNOT_FIT,
          error: error instanceof Error ? error.message : 'Unknown execution error',
          errorCode: 'EXECUTION_FAILED',
          transactionGroup: groupResult || undefined,
        };
      }
    }

    // Max retries exhausted
    return {
      success: false,
      strategy: groupResult?.strategy || SwapStrategy.CANNOT_FIT,
      error: `Failed to obtain fresh proofs after ${maxRetries} attempts`,
      errorCode: 'STALE_PROOF_REBUILD_REQUIRED',
      transactionGroup: groupResult || undefined,
    };
  }
}

/**
 * Create BulkSwapExecutor instance
 */
export function createBulkSwapExecutor(
  connection: Connection,
  platformAuthority: Keypair,
  treasuryPda?: PublicKey,
  altService?: ALTService
): BulkSwapExecutor {
  return new BulkSwapExecutor(connection, platformAuthority, treasuryPda, altService);
}

