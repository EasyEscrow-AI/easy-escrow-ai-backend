/**
 * Swap Flow Router (Task 12)
 *
 * Determines the appropriate execution flow for swap offers based on asset types.
 * Routes to atomic swaps, cNFT delegation, or two-phase settlement as needed.
 *
 * Routing Logic:
 * 1. Single NFT/SPL for NFT/SPL → Existing atomic swap
 * 2. Any cNFT involved → Delegation-based flow (Tasks 4-7)
 * 3. Bulk (3+ cNFTs or 5+ total assets) → Two-phase swap (Tasks 8-11)
 * 4. cNFT-for-SOL only → Single-tx delegate transfer
 *
 * @see .taskmaster/tasks/task_012_cnft-delegation-swap.txt
 */

import { AssetType } from '../services/assetValidator';
import { isJitoBundlesEnabled } from './featureFlags';

// =============================================================================
// Types
// =============================================================================

/**
 * The type of swap flow to use
 */
export enum SwapFlowType {
  /** Standard atomic swap (single transaction, both parties sign) */
  ATOMIC = 'ATOMIC',
  /** cNFT delegation-based swap (delegation instruction + transfer) */
  CNFT_DELEGATION = 'CNFT_DELEGATION',
  /** Two-phase swap with lock/settle pattern for bulk assets */
  TWO_PHASE = 'TWO_PHASE',
  /** Invalid swap configuration */
  INVALID = 'INVALID',
}

/**
 * Asset input for flow determination
 */
export interface SwapAssetInput {
  /** Asset type: NFT, CNFT, or CORE_NFT */
  type: AssetType;
  /** Asset identifier (mint address or asset ID) */
  identifier: string;
}

/**
 * Result of swap flow determination
 */
export interface SwapFlowResult {
  /** The recommended swap flow type */
  flowType: SwapFlowType;
  /** Whether cNFT delegation is required */
  requiresDelegation: boolean;
  /** Whether two-phase lock/settle is required */
  requiresTwoPhase: boolean;
  /** Whether JITO bundles can be used (if enabled) */
  canUseJito: boolean;
  /** Number of cNFTs in the swap */
  cnftCount: number;
  /** Total number of assets in the swap */
  totalAssetCount: number;
  /** Human-readable reason for the routing decision */
  reason: string;
  /** Error message if flow is INVALID */
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Threshold for triggering two-phase swap based on cNFT count per side
 * Per task spec: 3+ cNFTs on either side triggers two-phase
 */
const CNFT_TWO_PHASE_THRESHOLD = 3;

/**
 * Threshold for triggering two-phase swap based on total asset count
 * Per task spec: 5+ total assets triggers two-phase
 */
const TOTAL_ASSET_TWO_PHASE_THRESHOLD = 5;

// =============================================================================
// Main Function
// =============================================================================

/**
 * Determine the appropriate swap flow based on asset types and counts.
 *
 * @param offeredAssets - Assets being offered (maker side)
 * @param requestedAssets - Assets being requested (taker side)
 * @param offeredSol - SOL amount being offered (lamports)
 * @param requestedSol - SOL amount being requested (lamports)
 * @param jitoEnabled - Whether JITO bundles are enabled (defaults to checking env)
 * @returns SwapFlowResult with routing decision and metadata
 *
 * @example
 * ```typescript
 * const result = determineSwapFlow(
 *   [{ type: AssetType.CNFT, identifier: 'asset-id' }],
 *   [],
 *   undefined,
 *   BigInt(1_000_000_000) // 1 SOL
 * );
 *
 * if (result.flowType === SwapFlowType.CNFT_DELEGATION) {
 *   // Use delegation-based settlement
 * }
 * ```
 */
export function determineSwapFlow(
  offeredAssets: SwapAssetInput[],
  requestedAssets: SwapAssetInput[],
  offeredSol?: bigint,
  requestedSol?: bigint,
  jitoEnabled?: boolean
): SwapFlowResult {
  // Use provided value or check environment
  const canUseJito = jitoEnabled ?? isJitoBundlesEnabled();

  // Count assets by type
  const offeredCnftCount = offeredAssets.filter((a) => a.type === AssetType.CNFT).length;
  const requestedCnftCount = requestedAssets.filter((a) => a.type === AssetType.CNFT).length;
  const totalCnftCount = offeredCnftCount + requestedCnftCount;

  const totalOfferedAssets = offeredAssets.length;
  const totalRequestedAssets = requestedAssets.length;
  const totalAssetCount = totalOfferedAssets + totalRequestedAssets;

  // Check for SOL amounts
  const hasOfferedSol = offeredSol !== undefined && offeredSol > BigInt(0);
  const hasRequestedSol = requestedSol !== undefined && requestedSol > BigInt(0);

  // Base result structure
  const baseResult: Omit<SwapFlowResult, 'flowType' | 'reason' | 'error'> = {
    requiresDelegation: totalCnftCount > 0,
    requiresTwoPhase: false,
    canUseJito,
    cnftCount: totalCnftCount,
    totalAssetCount,
  };

  // Validation: Must have at least one asset on at least one side
  // SOL-for-SOL is not a valid swap
  if (totalAssetCount === 0) {
    if (hasOfferedSol && hasRequestedSol) {
      return {
        ...baseResult,
        flowType: SwapFlowType.INVALID,
        reason: 'Invalid swap: SOL-for-SOL is not supported',
        error: 'At least one side must include an asset. SOL-for-SOL swaps are not supported.',
      };
    }
    return {
      ...baseResult,
      flowType: SwapFlowType.INVALID,
      reason: 'Invalid swap: no assets provided',
      error: 'At least one side must include assets or SOL.',
    };
  }

  // Check for two-phase swap triggers
  // Two-phase is ONLY needed for cNFT delegation - SPL/CORE NFTs use bulk transactions

  // Trigger 1: 3+ cNFTs on either side
  const needsTwoPhaseForCnfts = offeredCnftCount >= CNFT_TWO_PHASE_THRESHOLD ||
                                requestedCnftCount >= CNFT_TWO_PHASE_THRESHOLD;

  // Trigger 2: 5+ total assets WITH cNFTs (cNFTs require delegation, others don't)
  // SPL/CORE NFT-only bundles use bulk transaction execution instead
  const needsTwoPhaseForBulk = totalAssetCount >= TOTAL_ASSET_TWO_PHASE_THRESHOLD && totalCnftCount > 0;

  // Trigger 3: 4+ assets with any cNFT (bulk swap with cNFT complexity)
  const needsTwoPhaseForMixedBulk = totalAssetCount >= 4 && totalCnftCount > 0;

  if (needsTwoPhaseForCnfts || needsTwoPhaseForBulk || needsTwoPhaseForMixedBulk) {
    let reason = 'Routing to two-phase swap: ';
    if (needsTwoPhaseForCnfts) {
      reason += `bulk cNFT swap (${Math.max(offeredCnftCount, requestedCnftCount)} cNFTs on one side)`;
    } else if (needsTwoPhaseForMixedBulk) {
      reason += `bulk swap with cNFTs (${totalAssetCount} assets, ${totalCnftCount} cNFTs)`;
    } else {
      reason += `bulk asset swap (${totalAssetCount} total assets)`;
    }

    return {
      ...baseResult,
      flowType: SwapFlowType.TWO_PHASE,
      requiresTwoPhase: true,
      requiresDelegation: totalCnftCount > 0,
      reason,
    };
  }

  // Check for cNFT delegation flow (any cNFT involved, but not bulk)
  if (totalCnftCount > 0) {
    let reason = `Routing to cNFT delegation flow: ${totalCnftCount} cNFT`;
    if (totalCnftCount > 1) {
      reason += 's';
    }

    // Simple cNFT-for-SOL or cNFT-for-NFT swap
    if (totalCnftCount <= 2 && totalAssetCount <= 3) {
      return {
        ...baseResult,
        flowType: SwapFlowType.CNFT_DELEGATION,
        requiresDelegation: true,
        reason,
      };
    }

    return {
      ...baseResult,
      flowType: SwapFlowType.CNFT_DELEGATION,
      requiresDelegation: true,
      reason,
    };
  }

  // Standard atomic swap (NFT/Core NFT only, no cNFTs)
  return {
    ...baseResult,
    flowType: SwapFlowType.ATOMIC,
    requiresDelegation: false,
    reason: `Routing to atomic swap: ${totalAssetCount} standard asset(s)`,
  };
}

/**
 * Convenience function to determine if an offer needs delegation based on its assets.
 *
 * @param offeredAssets - Assets being offered
 * @param requestedAssets - Assets being requested
 * @returns true if any cNFTs are involved
 */
export function needsDelegation(
  offeredAssets: SwapAssetInput[],
  requestedAssets: SwapAssetInput[]
): boolean {
  return offeredAssets.some((a) => a.type === AssetType.CNFT) ||
         requestedAssets.some((a) => a.type === AssetType.CNFT);
}

/**
 * Convenience function to determine if an offer needs two-phase execution.
 *
 * @param offeredAssets - Assets being offered
 * @param requestedAssets - Assets being requested
 * @returns true if two-phase is required
 */
export function needsTwoPhase(
  offeredAssets: SwapAssetInput[],
  requestedAssets: SwapAssetInput[]
): boolean {
  const result = determineSwapFlow(offeredAssets, requestedAssets, undefined, undefined);
  return result.requiresTwoPhase;
}

// Re-export for convenience
export { isJitoBundlesEnabled };
