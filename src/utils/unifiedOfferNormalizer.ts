/**
 * Unified Offer Request Normalizer
 *
 * Normalizes request bodies from different API formats into a common internal format.
 * Supports three input styles:
 * 1. Atomic swap style: {makerWallet, offeredAssets, requestedAssets, ...}
 * 2. Bulk swap style: {partyA, assetsA, assetsB, ...}
 * 3. cNFT bid style: {bidderWallet, targetAssetId, offerLamports, ...}
 *
 * @see Tasks 1 & 2: API Consolidation
 */

import { AssetType } from '../services/assetValidator';

// =============================================================================
// Types
// =============================================================================

/**
 * Detected offer type for routing
 */
export enum OfferType {
  /** Standard atomic swap (NFT↔NFT, NFT↔SOL, cNFT swaps) */
  ATOMIC = 'ATOMIC',
  /** cNFT bid with SOL escrow (bidding on a specific cNFT) */
  CNFT_BID = 'CNFT_BID',
  /** Bulk two-phase swap (cNFT delegation required: 3+ cNFTs or bulk with cNFTs) */
  BULK_TWO_PHASE = 'BULK_TWO_PHASE',
}

/**
 * Asset input format (supports multiple naming conventions)
 */
export interface AssetInput {
  /** Asset identifier (mint address or asset ID) */
  mint?: string;
  identifier?: string;
  assetId?: string;
  /** Asset type flags */
  isCompressed?: boolean;
  isCoreNft?: boolean;
  type?: 'NFT' | 'CNFT' | 'CORE_NFT';
  /** Optional metadata */
  metadata?: any;
}

/**
 * Normalized asset for internal use
 */
export interface NormalizedAsset {
  identifier: string;
  type: AssetType;
  metadata?: any;
}

/**
 * Raw unified offer request (accepts any format)
 */
export interface UnifiedOfferRequest {
  // === Maker/Taker style (atomic swaps) ===
  makerWallet?: string;
  takerWallet?: string;
  offeredAssets?: AssetInput[];
  requestedAssets?: AssetInput[];
  offeredSol?: string | number;
  requestedSol?: string | number;

  // === Party A/B style (bulk swaps) - ALIASES ===
  partyA?: string;
  partyB?: string;
  assetsA?: AssetInput[];
  assetsB?: AssetInput[];
  solAmountA?: string | number;
  solAmountB?: string | number;

  // === cNFT Bid style ===
  bidderWallet?: string;
  targetAssetId?: string;
  offerLamports?: string | number;

  // === Common optional fields ===
  customFee?: string | number;
  durationSeconds?: string | number;
  feeBps?: string | number;
  lockTimeoutSeconds?: string | number;
  platformFeeLamports?: string | number;
}

/**
 * Normalized offer request for internal processing
 */
export interface NormalizedOfferRequest {
  /** Offer initiator wallet */
  makerWallet: string;
  /** Counterparty wallet (optional for open offers) */
  takerWallet?: string;
  /** Assets being offered by maker */
  offeredAssets: NormalizedAsset[];
  /** Assets requested from taker */
  requestedAssets: NormalizedAsset[];
  /** SOL amount offered (lamports) */
  offeredSol?: bigint;
  /** SOL amount requested (lamports) */
  requestedSol?: bigint;
  /** Custom fee override (lamports) */
  customFee?: bigint;
}

/**
 * Normalized cNFT bid request
 */
export interface NormalizedCnftBidRequest {
  bidderWallet: string;
  targetAssetId: string;
  offerLamports: bigint;
  durationSeconds?: number;
  feeBps?: number;
}

/**
 * Normalized bulk swap request
 */
export interface NormalizedBulkRequest {
  partyA: string;
  partyB?: string;
  assetsA: NormalizedAsset[];
  assetsB: NormalizedAsset[];
  solAmountA?: bigint;
  solAmountB?: bigint;
  lockTimeoutSeconds?: number;
  platformFeeLamports?: bigint;
}

/**
 * Result of offer type detection and normalization
 */
export interface NormalizationResult {
  /** Detected offer type */
  offerType: OfferType;
  /** Normalized request for atomic swaps */
  atomicRequest?: NormalizedOfferRequest;
  /** Normalized request for cNFT bids */
  cnftBidRequest?: NormalizedCnftBidRequest;
  /** Normalized request for bulk swaps */
  bulkRequest?: NormalizedBulkRequest;
  /** Warnings about ambiguous or deprecated field usage */
  warnings: string[];
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detect if the request is a cNFT bid (SOL offer on a specific cNFT)
 */
export function isCnftBidRequest(body: UnifiedOfferRequest): boolean {
  return !!(body.bidderWallet && body.targetAssetId && body.offerLamports);
}

/**
 * Detect if the request uses bulk/partyA-B naming convention
 */
export function usesBulkNaming(body: UnifiedOfferRequest): boolean {
  return !!(body.partyA || body.assetsA || body.assetsB || body.solAmountA || body.solAmountB);
}

/**
 * Detect if the request uses atomic/maker-taker naming convention
 */
export function usesAtomicNaming(body: UnifiedOfferRequest): boolean {
  return !!(
    body.makerWallet ||
    body.offeredAssets ||
    body.requestedAssets ||
    body.offeredSol ||
    body.requestedSol
  );
}

// =============================================================================
// Normalization Functions
// =============================================================================

/**
 * Normalize a single asset to internal format
 */
export function normalizeAsset(asset: AssetInput): NormalizedAsset {
  // Get identifier (support multiple field names)
  const identifier = asset.mint || asset.identifier || asset.assetId;
  if (!identifier) {
    throw new Error('Asset must have mint, identifier, or assetId field');
  }

  // Determine asset type (priority: explicit type > isCoreNft > isCompressed > NFT)
  let type: AssetType = AssetType.NFT;
  if (asset.type === 'CORE_NFT' || asset.isCoreNft) {
    type = AssetType.CORE_NFT;
  } else if (asset.type === 'CNFT' || asset.isCompressed) {
    type = AssetType.CNFT;
  } else if (asset.type === 'NFT') {
    type = AssetType.NFT;
  }

  return {
    identifier,
    type,
    metadata: asset.metadata,
  };
}

/**
 * Normalize an array of assets
 */
export function normalizeAssets(assets: AssetInput[] | undefined): NormalizedAsset[] {
  if (!assets || !Array.isArray(assets)) {
    return [];
  }
  return assets.map(normalizeAsset);
}

/**
 * Convert SOL amount to bigint (handles string and number inputs)
 */
export function normalizeSolAmount(amount: string | number | undefined): bigint | undefined {
  if (amount === undefined || amount === null || amount === '') {
    return undefined;
  }
  try {
    return BigInt(amount);
  } catch (error) {
    throw new Error(`Invalid SOL amount: ${amount}`);
  }
}

/**
 * Parse integer from string or number
 */
export function parseIntSafe(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}

// =============================================================================
// Main Normalization Function
// =============================================================================

/**
 * Detect offer type and normalize the request
 *
 * @param body - Raw request body from API
 * @returns Normalization result with detected type and normalized request
 */
export function normalizeOfferRequest(body: UnifiedOfferRequest): NormalizationResult {
  const warnings: string[] = [];

  // === Detection Phase ===

  // 1. Check for cNFT bid (SOL offer on a specific cNFT)
  if (isCnftBidRequest(body)) {
    return {
      offerType: OfferType.CNFT_BID,
      cnftBidRequest: {
        bidderWallet: body.bidderWallet!,
        targetAssetId: body.targetAssetId!,
        offerLamports: normalizeSolAmount(body.offerLamports)!,
        durationSeconds: parseIntSafe(body.durationSeconds),
        feeBps: parseIntSafe(body.feeBps),
      },
      warnings,
    };
  }

  // === Normalization Phase (for swap requests) ===

  // Check for ambiguous naming (both conventions used)
  const hasBulkNaming = usesBulkNaming(body);
  const hasAtomicNaming = usesAtomicNaming(body);

  if (hasBulkNaming && hasAtomicNaming) {
    warnings.push(
      'Request uses both maker/taker and partyA/B naming conventions. ' +
        'Preferring maker/taker fields. Consider using only one convention.'
    );
  }

  // Normalize fields (maker/taker takes precedence)
  const makerWallet = body.makerWallet || body.partyA;
  const takerWallet = body.takerWallet || body.partyB;
  const offeredAssets = normalizeAssets(body.offeredAssets || body.assetsA);
  const requestedAssets = normalizeAssets(body.requestedAssets || body.assetsB);
  const offeredSol = normalizeSolAmount(body.offeredSol ?? body.solAmountA);
  const requestedSol = normalizeSolAmount(body.requestedSol ?? body.solAmountB);
  const customFee = normalizeSolAmount(body.customFee);

  // Validate we have a maker wallet
  if (!makerWallet) {
    throw new Error('Request must include makerWallet or partyA');
  }

  // Build normalized atomic request
  const atomicRequest: NormalizedOfferRequest = {
    makerWallet,
    takerWallet,
    offeredAssets,
    requestedAssets,
    offeredSol,
    requestedSol,
    customFee,
  };

  // 2. Determine if this should be a bulk TWO-PHASE swap
  // Two-phase lock/settle is ONLY needed for cNFT delegation.
  // SPL/Core NFT-only bulk swaps use Jito bundles or sequential execution instead.
  //
  // Two-phase triggers (all require cNFTs):
  // - 3+ cNFTs on either side
  // - 5+ total assets WITH at least one cNFT
  // - 4+ total assets WITH at least one cNFT
  const offeredCnftCount = offeredAssets.filter((a) => a.type === AssetType.CNFT).length;
  const requestedCnftCount = requestedAssets.filter((a) => a.type === AssetType.CNFT).length;
  const totalAssetCount = offeredAssets.length + requestedAssets.length;
  const totalCnftCount = offeredCnftCount + requestedCnftCount;

  const needsBulk =
    offeredCnftCount >= 3 ||
    requestedCnftCount >= 3 ||
    (totalAssetCount >= 5 && totalCnftCount > 0) ||
    (totalAssetCount >= 4 && totalCnftCount > 0);

  if (needsBulk) {
    // Build bulk request format
    const bulkRequest: NormalizedBulkRequest = {
      partyA: makerWallet,
      partyB: takerWallet,
      assetsA: offeredAssets,
      assetsB: requestedAssets,
      solAmountA: offeredSol,
      solAmountB: requestedSol,
      lockTimeoutSeconds: parseIntSafe(body.lockTimeoutSeconds),
      platformFeeLamports: normalizeSolAmount(body.platformFeeLamports ?? body.customFee),
    };

    return {
      offerType: OfferType.BULK_TWO_PHASE,
      bulkRequest,
      atomicRequest, // Also include atomic format for reference
      warnings,
    };
  }

  // 3. Default to atomic swap
  return {
    offerType: OfferType.ATOMIC,
    atomicRequest,
    warnings,
  };
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate a unified offer request
 */
export function validateUnifiedRequest(body: UnifiedOfferRequest): ValidationResult {
  const errors: ValidationError[] = [];

  // Check for cNFT bid
  if (isCnftBidRequest(body)) {
    // cNFT bid validation
    if (!body.bidderWallet) {
      errors.push({ field: 'bidderWallet', message: 'bidderWallet is required for cNFT bids' });
    }
    if (!body.targetAssetId) {
      errors.push({ field: 'targetAssetId', message: 'targetAssetId is required for cNFT bids' });
    }
    if (!body.offerLamports) {
      errors.push({ field: 'offerLamports', message: 'offerLamports is required for cNFT bids' });
    }
    return { isValid: errors.length === 0, errors };
  }

  // Swap request validation
  const makerWallet = body.makerWallet || body.partyA;
  const offeredAssets = body.offeredAssets || body.assetsA || [];
  const requestedAssets = body.requestedAssets || body.assetsB || [];
  const offeredSol = body.offeredSol ?? body.solAmountA;
  const requestedSol = body.requestedSol ?? body.solAmountB;

  // Must have maker/initiator
  if (!makerWallet) {
    errors.push({
      field: 'makerWallet',
      message: 'makerWallet (or partyA) is required',
    });
  }

  // Must have something on at least one side
  const hasOffered = offeredAssets.length > 0 || (offeredSol !== undefined && offeredSol !== '');
  const hasRequested =
    requestedAssets.length > 0 || (requestedSol !== undefined && requestedSol !== '');

  if (!hasOffered && !hasRequested) {
    errors.push({
      field: 'offeredAssets',
      message: 'Must provide at least one asset or SOL amount on either side',
    });
  }

  // Validate asset arrays are arrays
  if (body.offeredAssets && !Array.isArray(body.offeredAssets)) {
    errors.push({ field: 'offeredAssets', message: 'offeredAssets must be an array' });
  }
  if (body.requestedAssets && !Array.isArray(body.requestedAssets)) {
    errors.push({ field: 'requestedAssets', message: 'requestedAssets must be an array' });
  }
  if (body.assetsA && !Array.isArray(body.assetsA)) {
    errors.push({ field: 'assetsA', message: 'assetsA must be an array' });
  }
  if (body.assetsB && !Array.isArray(body.assetsB)) {
    errors.push({ field: 'assetsB', message: 'assetsB must be an array' });
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Get a human-readable description of the detected offer type
 */
export function getOfferTypeDescription(offerType: OfferType): string {
  switch (offerType) {
    case OfferType.CNFT_BID:
      return 'cNFT bid with SOL escrow';
    case OfferType.BULK_TWO_PHASE:
      return 'bulk two-phase swap (lock/settle)';
    case OfferType.ATOMIC:
    default:
      return 'atomic swap';
  }
}
