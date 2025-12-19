/**
 * Unified Offer Types
 *
 * Defines common types for the unified /api/swaps/* API structure where
 * listings, bids, and swaps are all types of offers.
 *
 * Key design decisions:
 * - SOL is treated as an asset type for future extensibility (USDC, SPL tokens)
 * - Listings are normalized as offers with type: 'LISTING'
 * - All monetary values use string (lamports) for precision
 *
 * @see Plan: C:\Users\samde\.claude\plans\reflective-juggling-squid.md
 */

// =============================================================================
// Asset Types (SOL as Asset)
// =============================================================================

/**
 * Extended asset type supporting SOL and future tokens
 */
export type UnifiedAssetType = 'NFT' | 'CNFT' | 'CORE_NFT' | 'SOL' | 'SPL_TOKEN';

/**
 * Unified asset representation
 * SOL and SPL tokens are assets alongside NFTs
 */
export interface UnifiedAsset {
  /** Asset type */
  type: UnifiedAssetType;

  /** Mint address for NFTs/tokens, undefined for SOL */
  mint?: string;

  /** Amount in smallest unit (lamports for SOL, token decimals for SPL) */
  amount?: string;

  /** Asset name (from metadata) */
  name?: string;

  /** Asset image URL */
  image?: string;

  /** Whether asset is compressed (cNFT) */
  isCompressed?: boolean;

  /** Collection address if applicable */
  collection?: string;

  /** Token symbol (for SPL tokens) */
  symbol?: string;

  /** Token decimals (for SPL tokens) */
  decimals?: number;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Offer Types
// =============================================================================

/**
 * Extended offer types including listings
 */
export enum UnifiedOfferType {
  /** Standard atomic swap (NFT↔NFT, NFT↔SOL) */
  ATOMIC = 'ATOMIC',

  /** cNFT bid with SOL escrow */
  CNFT_BID = 'CNFT_BID',

  /** Bulk two-phase swap (3+ cNFTs or 5+ total assets) */
  BULK_TWO_PHASE = 'BULK_TWO_PHASE',

  /** Delegation-based listing (seller delegates to platform) */
  LISTING = 'LISTING',
}

/**
 * Unified offer status (combines listing and swap statuses)
 */
export type UnifiedOfferStatus =
  | 'PENDING' // Created but not confirmed (awaiting signature)
  | 'ACTIVE' // Live and can be accepted
  | 'ACCEPTED' // Counterparty accepted, awaiting completion
  | 'LOCKED' // Bulk swap: assets locked in two-phase
  | 'SETTLING' // Bulk swap: settlement in progress
  | 'COMPLETED' // Successfully finished
  | 'CANCELLED' // Cancelled by maker
  | 'EXPIRED' // Passed expiration time
  | 'FAILED'; // Transaction failed

/**
 * Delegation status for listing offers
 */
export type DelegationStatusType =
  | 'PENDING_DELEGATION' // Delegation tx created, awaiting signature
  | 'DELEGATION_CONFIRMED' // Delegation tx confirmed on-chain
  | 'REVOCATION_PENDING' // Revocation tx created
  | 'REVOKED' // Delegation revoked
  | 'NONE'; // Not applicable (non-listing offers)

// =============================================================================
// Unified Offer Interface
// =============================================================================

/**
 * Normalized offer representation for all offer types
 */
export interface UnifiedOffer {
  /** Internal numeric ID */
  id: number | string;

  /** External UUID - canonical identifier */
  offerId: string;

  /** Offer type */
  offerType: UnifiedOfferType;

  /** Current status */
  status: UnifiedOfferStatus;

  /** Maker wallet (seller for listings, initiator for swaps) */
  maker: string;

  /** Taker wallet (buyer for listings, counterparty for swaps) */
  taker?: string;

  /** Assets offered by maker (includes SOL if any) */
  offeredAssets: UnifiedAsset[];

  /** Assets requested from taker (includes SOL/price if any) */
  requestedAssets: UnifiedAsset[];

  /** Platform fee in lamports */
  platformFeeLamports: string;

  /** Fee in basis points */
  feeBps: number;

  /** Expiration timestamp */
  expiresAt: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt?: string;

  // === Type-specific fields ===

  /** Delegation status (LISTING type) */
  delegationStatus?: DelegationStatusType;

  /** Delegation transaction signature (LISTING type) */
  delegationSignature?: string;

  /** Bundle status for Jito swaps (BULK_TWO_PHASE type) */
  bundleStatus?: string;

  /** Bundle ID for Jito swaps */
  bundleId?: string;

  /** Lock timestamp for two-phase swaps */
  lockedAt?: string;

  /** Settlement transaction signatures */
  settlementSignatures?: string[];
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Serialized transaction for client signing
 */
export interface SerializedTransaction {
  /** Base64 encoded serialized transaction */
  serializedTransaction: string;

  /** Recent blockhash */
  blockhash: string;

  /** Block height for expiry */
  lastValidBlockHeight: number;

  /** Wallets that must sign */
  requiredSigners: string[];

  /** Whether transaction is versioned (v0) */
  isVersioned: boolean;
}

/**
 * Cost breakdown for an offer
 */
export interface CostBreakdown {
  /** Total cost to buyer/taker in lamports */
  totalCostLamports: string;

  /** Platform fee in lamports */
  platformFeeLamports: string;

  /** Network rent/fee in lamports */
  networkFeeLamports?: string;

  /** Amount seller/maker receives */
  makerReceivesLamports: string;

  /** Fee in basis points */
  feeBps: number;
}

/**
 * Standard API response envelope
 */
export interface UnifiedOfferResponse {
  success: boolean;
  data: {
    offer: UnifiedOffer;
    transaction?: SerializedTransaction;
    costs?: CostBreakdown;
  };
  message?: string;
}

/**
 * List response for multiple offers
 */
export interface UnifiedOfferListResponse {
  success: boolean;
  data: {
    offers: UnifiedOffer[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
}

// =============================================================================
// Request Types
// =============================================================================

/**
 * Filter options for querying offers
 */
export interface UnifiedOfferFilters {
  /** Filter by offer type */
  type?: UnifiedOfferType | UnifiedOfferType[];

  /** Filter by status */
  status?: UnifiedOfferStatus | UnifiedOfferStatus[];

  /** Filter by maker wallet */
  maker?: string;

  /** Filter by taker wallet */
  taker?: string;

  /** Filter by either maker or taker */
  wallet?: string;

  /** Filter by asset mint/ID in any position */
  assetId?: string;

  /** Include expired offers */
  includeExpired?: boolean;

  /** Sort field */
  sortBy?: 'createdAt' | 'expiresAt' | 'price';

  /** Sort order */
  sortOrder?: 'asc' | 'desc';

  /** Limit results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Create offer request - accepts multiple formats
 */
export interface CreateUnifiedOfferRequest {
  // === Listing format ===
  seller?: string;
  assetId?: string;
  priceLamports?: string | number;

  // === Atomic swap format (maker/taker) ===
  makerWallet?: string;
  takerWallet?: string;
  offeredAssets?: UnifiedAssetInput[];
  requestedAssets?: UnifiedAssetInput[];
  offeredSol?: string | number;
  requestedSol?: string | number;

  // === Bulk swap format (partyA/B) ===
  partyA?: string;
  partyB?: string;
  assetsA?: UnifiedAssetInput[];
  assetsB?: UnifiedAssetInput[];
  solAmountA?: string | number;
  solAmountB?: string | number;

  // === cNFT Bid format ===
  bidderWallet?: string;
  targetAssetId?: string;
  offerLamports?: string | number;

  // === Common options ===
  durationSeconds?: number;
  feeBps?: number;
  customFee?: string | number;
  lockTimeoutSeconds?: number;
  platformFeeLamports?: string | number;
}

/**
 * Asset input format for create requests
 */
export interface UnifiedAssetInput {
  /** Asset identifier (mint address or asset ID) */
  mint?: string;
  identifier?: string;
  assetId?: string;

  /** Asset type flags */
  isCompressed?: boolean;
  isCoreNft?: boolean;
  type?: 'NFT' | 'CNFT' | 'CORE_NFT' | 'SOL' | 'SPL_TOKEN';

  /** For SOL/tokens: amount in lamports/smallest unit */
  amount?: string | number;

  /** For SPL tokens: mint address */
  tokenMint?: string;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Type guard for listing offers
 */
export function isListingOffer(offer: UnifiedOffer): boolean {
  return offer.offerType === UnifiedOfferType.LISTING;
}

/**
 * Type guard for bulk offers
 */
export function isBulkOffer(offer: UnifiedOffer): boolean {
  return offer.offerType === UnifiedOfferType.BULK_TWO_PHASE;
}

/**
 * Type guard for bid offers
 */
export function isBidOffer(offer: UnifiedOffer): boolean {
  return offer.offerType === UnifiedOfferType.CNFT_BID;
}

/**
 * Extract SOL asset from assets array
 */
export function getSolFromAssets(assets: UnifiedAsset[]): UnifiedAsset | undefined {
  return assets.find((a) => a.type === 'SOL');
}

/**
 * Extract NFT assets from assets array
 */
export function getNftsFromAssets(assets: UnifiedAsset[]): UnifiedAsset[] {
  return assets.filter((a) => a.type !== 'SOL' && a.type !== 'SPL_TOKEN');
}

/**
 * Convert lamports to SOL (display purposes)
 */
export function lamportsToSol(lamports: string | number | bigint): number {
  const value = typeof lamports === 'bigint' ? lamports : BigInt(lamports);
  return Number(value) / 1e9;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * 1e9));
}
