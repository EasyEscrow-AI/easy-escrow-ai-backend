/**
 * Swap Flow Router (Task 12)
 *
 * Determines the appropriate execution flow for swap offers based on asset types.
 * Routes to atomic swaps, cNFT delegation, or two-phase settlement as needed.
 *
 * IMPORTANT: Maximum 4 NFTs total per swap (Jito bundle limit: 5 transactions = 1 fee tx + 4 NFT transfers)
 * Swaps with >4 NFTs are rejected as INVALID at the routing level.
 *
 * Routing Logic:
 * 1. >4 NFTs total → INVALID (rejected due to Jito bundle transaction limit)
 * 2. Single NFT (1 per side, no cNFTs) → ATOMIC swap via escrow program
 * 3. cNFT-to-cNFT (any cNFT on both sides) → TWO_PHASE delegation
 * 4. cNFT single-side (cNFT-for-SOL, cNFT-for-NFT) → CNFT_DELEGATION flow
 * 5. Multi-NFT (2+ on one side) → Jito bundle via ATOMIC/CNFT_DELEGATION
 *
 * Note: The actual execution method (Jito bundle vs sequential RPC vs escrow) is determined
 * by TransactionGroupBuilder based on the flow type returned here.
 *
 * @see docs/architecture/SWAP_ROUTING.md
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
 * Maximum total NFTs allowed per swap (Jito bundle limit)
 * Jito bundles max 5 transactions: 1 for SOL/fee + 4 for NFT transfers
 */
const MAX_NFTS_FOR_JITO = 4;

/**
 * Threshold for triggering two-phase swap based on cNFT count per side
 * Per task spec: 3+ cNFTs on either side triggers two-phase
 * NOTE: Now only used for cNFT swaps - SPL/Core NFTs rejected if >4
 */
const CNFT_TWO_PHASE_THRESHOLD = 3;

/**
 * Threshold for triggering two-phase swap based on total asset count
 * @deprecated This threshold is now unreachable due to MAX_NFTS_FOR_JITO=4.
 * Kept for backwards compatibility but the condition at line ~193 (needsTwoPhaseForBulk)
 * will never trigger because swaps with 5+ NFTs are rejected as INVALID first.
 * Two-phase is now only triggered by:
 * - cNFT-to-cNFT swaps (hasCnftOnBothSides)
 * - 4+ assets with cNFTs (needsTwoPhaseForMixedBulk)
 * - 3+ cNFTs on one side (needsTwoPhaseForCnfts)
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

  // Validation: Maximum 4 NFTs total (Jito bundle limit)
  // Jito bundles max 5 transactions: 1 for SOL/fee tx + 4 for NFT transfers
  if (totalAssetCount > MAX_NFTS_FOR_JITO) {
    return {
      ...baseResult,
      flowType: SwapFlowType.INVALID,
      reason: `Invalid swap: too many NFTs (${totalAssetCount})`,
      error: `Maximum ${MAX_NFTS_FOR_JITO} NFTs total per swap due to Jito bundle transaction limits. ` +
             `Please reduce the number of NFTs on either side.`,
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
    // cNFT-to-cNFT swaps ALWAYS use two-phase delegation (Magic Eden style)
    // This eliminates JITO bundle dependency for cNFT swaps
    const hasCnftOnBothSides = offeredCnftCount > 0 && requestedCnftCount > 0;

    if (hasCnftOnBothSides) {
      return {
        ...baseResult,
        flowType: SwapFlowType.TWO_PHASE,
        requiresTwoPhase: true,
        requiresDelegation: true,
        reason: `Routing to two-phase delegation: cNFT-to-cNFT swap (${offeredCnftCount} ↔ ${requestedCnftCount} cNFTs). ` +
                `Sequential settlement with fresh Merkle proofs, no JITO bundle needed.`,
      };
    }

    // Single-side cNFT (cNFT-for-SOL or cNFT-for-NFT) - can use direct delegation
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
