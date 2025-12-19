/**
 * Unified Offer Service
 *
 * Facade service that wraps existing managers (OfferManager, ListingManager,
 * CnftOfferEscrowManager) and provides a unified API for all offer types.
 *
 * Key responsibilities:
 * - Route operations to correct underlying service based on offer type
 * - Normalize responses to unified format
 * - Handle ID lookups (support both UUID and numeric IDs)
 *
 * @see Plan: C:\Users\samde\.claude\plans\reflective-juggling-squid.md
 * @see Task 10: Create Unified Offer Service
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PrismaClient, OfferStatus, OfferType as PrismaOfferType } from '../generated/prisma';
import {
  UnifiedOffer,
  UnifiedOfferResponse,
  UnifiedOfferListResponse,
  UnifiedOfferFilters,
  UnifiedOfferType,
  UnifiedOfferStatus,
  UnifiedAsset,
  CostBreakdown,
  SerializedTransaction,
  DelegationStatusType,
} from '../types/unified-offer.types';
import {
  OfferType,
  NormalizationResult,
  normalizeOfferRequest,
  UnifiedOfferRequest,
} from '../utils/unifiedOfferNormalizer';
import { OfferManager, CreateOfferInput, OfferSummary } from './offerManager';
import { ListingManager, CreateListingParams, CreateListingResult } from './listingManager';
import { CnftOfferEscrowManager, CreateOfferParams as CnftBidParams } from './cnftOfferEscrowManager';
import { AssetType } from './assetValidator';

/**
 * Parameters for creating an offer through the unified service
 */
export interface UnifiedCreateOfferParams extends UnifiedOfferRequest {
  // All fields from UnifiedOfferRequest
}

/**
 * Result of creating an offer through the unified service
 */
export interface UnifiedCreateResult {
  offer: UnifiedOffer;
  transaction?: SerializedTransaction;
  costs?: CostBreakdown;
}

/**
 * Parameters for accepting an offer
 */
export interface UnifiedAcceptParams {
  /** Offer ID (UUID or numeric) */
  offerId: string;
  /** Acceptor wallet address */
  wallet: string;
}

/**
 * Parameters for cancelling an offer
 */
export interface UnifiedCancelParams {
  /** Offer ID (UUID or numeric) */
  offerId: string;
  /** Canceller wallet address */
  wallet: string;
  /** Admin override */
  isAdmin?: boolean;
}

/**
 * Unified Offer Service
 *
 * Provides a single interface for all offer operations regardless of offer type.
 */
export class UnifiedOfferService {
  private connection: Connection;
  private prisma: PrismaClient;
  private offerManager: OfferManager;
  private listingManager: ListingManager;
  private cnftBidManager: CnftOfferEscrowManager;

  constructor(
    connection: Connection,
    prisma: PrismaClient,
    offerManager: OfferManager,
    listingManager: ListingManager,
    cnftBidManager: CnftOfferEscrowManager
  ) {
    this.connection = connection;
    this.prisma = prisma;
    this.offerManager = offerManager;
    this.listingManager = listingManager;
    this.cnftBidManager = cnftBidManager;
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a new offer (auto-detects type)
   */
  async createOffer(params: UnifiedCreateOfferParams): Promise<UnifiedCreateResult> {
    // Normalize request and detect type
    const normalized = normalizeOfferRequest(params);

    switch (normalized.offerType) {
      case OfferType.LISTING:
        return this.createListing(normalized);
      case OfferType.CNFT_BID:
        return this.createCnftBid(normalized);
      case OfferType.BULK_TWO_PHASE:
        return this.createBulkOffer(normalized);
      case OfferType.ATOMIC:
      default:
        return this.createAtomicOffer(normalized);
    }
  }

  /**
   * Create a listing (delegation-based)
   */
  private async createListing(normalized: NormalizationResult): Promise<UnifiedCreateResult> {
    const req = normalized.listingRequest!;

    const result = await this.listingManager.createListing({
      seller: req.seller,
      assetId: req.assetId,
      priceLamports: req.priceLamports,
      durationSeconds: req.durationSeconds,
      feeBps: req.feeBps,
    });

    return {
      offer: this.normalizeListingToOffer(result.listing),
      transaction: result.transaction ? {
        serializedTransaction: result.transaction.serializedTransaction,
        blockhash: result.transaction.blockhash,
        lastValidBlockHeight: result.transaction.lastValidBlockHeight,
        requiredSigners: result.transaction.requiredSigners,
        isVersioned: result.transaction.isVersioned,
      } : undefined,
      costs: {
        totalCostLamports: result.listing.priceLamports,
        platformFeeLamports: result.fees.platformFeeLamports,
        makerReceivesLamports: result.fees.sellerReceivesLamports,
        feeBps: result.listing.feeBps,
      },
    };
  }

  /**
   * Create a cNFT bid
   */
  private async createCnftBid(normalized: NormalizationResult): Promise<UnifiedCreateResult> {
    const req = normalized.cnftBidRequest!;

    const result = await this.cnftBidManager.createOffer({
      bidderWallet: req.bidderWallet,
      targetAssetId: req.targetAssetId,
      offerLamports: req.offerLamports,
      durationSeconds: req.durationSeconds,
      feeBps: req.feeBps,
      listingId: req.listingId,
    });

    // Calculate owner receives from escrow minus fee
    const offerLamports = BigInt(result.offer.offerLamports);
    const platformFee = BigInt(result.fees.platformFeeLamports);
    const ownerReceives = (offerLamports - platformFee).toString();

    return {
      offer: this.normalizeCnftBidToOffer(result.offer),
      transaction: result.transaction ? {
        serializedTransaction: result.transaction.serializedTransaction,
        blockhash: result.transaction.blockhash,
        lastValidBlockHeight: result.transaction.lastValidBlockHeight,
        requiredSigners: result.transaction.requiredSigners,
        isVersioned: result.transaction.isVersioned,
      } : undefined,
      costs: {
        totalCostLamports: result.fees.totalEscrowLamports,
        platformFeeLamports: result.fees.platformFeeLamports,
        makerReceivesLamports: ownerReceives,
        feeBps: req.feeBps || 100,
      },
    };
  }

  /**
   * Create an atomic swap offer
   */
  private async createAtomicOffer(normalized: NormalizationResult): Promise<UnifiedCreateResult> {
    const req = normalized.atomicRequest!;

    const input: CreateOfferInput = {
      makerWallet: req.makerWallet,
      takerWallet: req.takerWallet,
      offeredAssets: req.offeredAssets.map((a) => ({
        type: a.type,
        identifier: a.identifier,
      })),
      requestedAssets: req.requestedAssets.map((a) => ({
        type: a.type,
        identifier: a.identifier,
      })),
      offeredSol: req.offeredSol,
      requestedSol: req.requestedSol,
      customFee: req.customFee,
    };

    const result = await this.offerManager.createOffer(input);

    return {
      offer: this.normalizeAtomicOfferToUnified(result),
    };
  }

  /**
   * Create a bulk two-phase offer
   */
  private async createBulkOffer(normalized: NormalizationResult): Promise<UnifiedCreateResult> {
    // Bulk offers go through the same offerManager but with different transaction handling
    const req = normalized.atomicRequest!;

    const input: CreateOfferInput = {
      makerWallet: req.makerWallet,
      takerWallet: req.takerWallet,
      offeredAssets: req.offeredAssets.map((a) => ({
        type: a.type,
        identifier: a.identifier,
      })),
      requestedAssets: req.requestedAssets.map((a) => ({
        type: a.type,
        identifier: a.identifier,
      })),
      offeredSol: req.offeredSol,
      requestedSol: req.requestedSol,
      customFee: req.customFee,
    };

    const result = await this.offerManager.createOffer(input);
    const offer = this.normalizeAtomicOfferToUnified(result);

    // Mark as bulk type
    offer.offerType = UnifiedOfferType.BULK_TWO_PHASE;

    return { offer };
  }

  // ===========================================================================
  // Accept Operations
  // ===========================================================================

  /**
   * Accept an offer (handles all types)
   */
  async acceptOffer(params: UnifiedAcceptParams): Promise<UnifiedCreateResult> {
    // Determine offer type by looking it up
    const offerType = await this.detectOfferType(params.offerId);

    switch (offerType) {
      case UnifiedOfferType.LISTING:
        return this.buyListing(params.offerId, params.wallet);
      case UnifiedOfferType.CNFT_BID:
        return this.acceptCnftBid(params.offerId, params.wallet);
      case UnifiedOfferType.BULK_TWO_PHASE:
      case UnifiedOfferType.ATOMIC:
      default:
        return this.acceptAtomicOffer(params.offerId, params.wallet);
    }
  }

  /**
   * Buy a listing (accept from buyer side)
   */
  private async buyListing(offerId: string, buyerWallet: string): Promise<UnifiedCreateResult> {
    const result = await this.listingManager.buyListing({
      listingId: offerId,
      buyer: buyerWallet,
    });

    // BuyListingResult has partial listing data - need to extend with defaults
    const listingForNormalization = {
      ...result.listing,
      status: 'PENDING_PURCHASE' as const,
      delegationStatus: 'DELEGATION_CONFIRMED' as const,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h for purchase
      feeBps: 100, // Default fee
      buyer: buyerWallet,
    };

    // Calculate total cost (price + fee + network)
    const totalCost = BigInt(result.costs.priceLamports) +
                      BigInt(result.costs.platformFeeLamports) +
                      BigInt(result.costs.estimatedNetworkFee);

    return {
      offer: this.normalizeListingToOffer(listingForNormalization),
      transaction: result.transaction ? {
        serializedTransaction: result.transaction.serializedTransaction,
        blockhash: result.transaction.blockhash,
        lastValidBlockHeight: result.transaction.lastValidBlockHeight,
        requiredSigners: result.transaction.requiredSigners,
        isVersioned: result.transaction.isVersioned,
      } : undefined,
      costs: {
        totalCostLamports: totalCost.toString(),
        platformFeeLamports: result.costs.platformFeeLamports,
        networkFeeLamports: result.costs.estimatedNetworkFee,
        makerReceivesLamports: result.costs.sellerReceivesLamports,
        feeBps: 100,
      },
    };
  }

  /**
   * Accept a cNFT bid (accept from owner side)
   */
  private async acceptCnftBid(offerId: string, ownerWallet: string): Promise<UnifiedCreateResult> {
    const result = await this.cnftBidManager.acceptOffer({
      offerId,
      ownerWallet,
    });

    return {
      offer: this.normalizeCnftBidToOffer(result.offer),
      transaction: result.transaction ? {
        serializedTransaction: result.transaction.serializedTransaction,
        blockhash: result.transaction.blockhash,
        lastValidBlockHeight: result.transaction.lastValidBlockHeight,
        requiredSigners: result.transaction.requiredSigners,
        isVersioned: result.transaction.isVersioned,
      } : undefined,
    };
  }

  /**
   * Accept an atomic swap offer
   */
  private async acceptAtomicOffer(offerId: string, takerWallet: string): Promise<UnifiedCreateResult> {
    const numericId = this.parseOfferId(offerId);
    const result = await this.offerManager.acceptOffer(numericId, takerWallet);

    const offer = await this.offerManager.getOffer(numericId);
    if (!offer) {
      throw new Error('Offer not found after accept');
    }

    // acceptOffer returns { serializedTransaction, offer, isBulkSwap?, transactionGroup? }
    // We need to extract the transaction details from the offer or build them
    return {
      offer: this.normalizeAtomicOfferToUnified(offer),
      transaction: result.serializedTransaction ? {
        serializedTransaction: result.serializedTransaction,
        blockhash: offer.nonceAccount || '', // Nonce-based transactions use nonce account
        lastValidBlockHeight: 0, // Nonce transactions don't use block height
        requiredSigners: [takerWallet],
        isVersioned: true,
      } : undefined,
    };
  }

  // ===========================================================================
  // Cancel Operations
  // ===========================================================================

  /**
   * Cancel an offer (handles all types)
   */
  async cancelOffer(params: UnifiedCancelParams): Promise<UnifiedCreateResult> {
    const offerType = await this.detectOfferType(params.offerId);

    switch (offerType) {
      case UnifiedOfferType.LISTING:
        return this.cancelListing(params.offerId, params.wallet);
      case UnifiedOfferType.CNFT_BID:
        return this.cancelCnftBid(params.offerId, params.wallet);
      case UnifiedOfferType.BULK_TWO_PHASE:
      case UnifiedOfferType.ATOMIC:
      default:
        return this.cancelAtomicOffer(params.offerId, params.wallet, params.isAdmin);
    }
  }

  /**
   * Cancel a listing
   */
  private async cancelListing(offerId: string, seller: string): Promise<UnifiedCreateResult> {
    const result = await this.listingManager.cancelListing({
      listingId: offerId,
      seller,
    });

    return {
      offer: this.normalizeListingToOffer(result.listing),
      transaction: result.transaction ? {
        serializedTransaction: result.transaction.serializedTransaction,
        blockhash: result.transaction.blockhash,
        lastValidBlockHeight: result.transaction.lastValidBlockHeight,
        requiredSigners: result.transaction.requiredSigners,
        isVersioned: result.transaction.isVersioned,
      } : undefined,
    };
  }

  /**
   * Cancel a cNFT bid
   */
  private async cancelCnftBid(offerId: string, bidder: string): Promise<UnifiedCreateResult> {
    const result = await this.cnftBidManager.cancelOffer({
      offerId,
      bidderWallet: bidder,
    });

    return {
      offer: this.normalizeCnftBidToOffer(result.offer),
      transaction: result.transaction ? {
        serializedTransaction: result.transaction.serializedTransaction,
        blockhash: result.transaction.blockhash,
        lastValidBlockHeight: result.transaction.lastValidBlockHeight,
        requiredSigners: result.transaction.requiredSigners,
        isVersioned: result.transaction.isVersioned,
      } : undefined,
    };
  }

  /**
   * Cancel an atomic swap offer
   */
  private async cancelAtomicOffer(
    offerId: string,
    wallet: string,
    isAdmin?: boolean
  ): Promise<UnifiedCreateResult> {
    const numericId = this.parseOfferId(offerId);
    await this.offerManager.cancelOffer(numericId, wallet, isAdmin);

    const offer = await this.offerManager.getOffer(numericId);
    if (!offer) {
      throw new Error('Offer not found after cancel');
    }

    return {
      offer: this.normalizeAtomicOfferToUnified(offer),
    };
  }

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  /**
   * Get a single offer by ID
   */
  async getOffer(offerId: string): Promise<UnifiedOffer | null> {
    // Try each manager in sequence
    // First try as listing UUID
    try {
      const listing = await this.listingManager.getListing(offerId);
      if (listing) {
        return this.normalizeListingToOffer(listing);
      }
    } catch {
      // Not a listing
    }

    // Try as cNFT bid UUID
    try {
      const bid = await this.cnftBidManager.getOffer(offerId);
      if (bid) {
        return this.normalizeCnftBidToOffer(bid);
      }
    } catch {
      // Not a bid
    }

    // Try as numeric offer ID
    try {
      const numericId = this.parseOfferId(offerId);
      const offer = await this.offerManager.getOffer(numericId);
      if (offer) {
        return this.normalizeAtomicOfferToUnified(offer);
      }
    } catch {
      // Not an atomic offer
    }

    return null;
  }

  /**
   * List offers with filters
   */
  async listOffers(filters: UnifiedOfferFilters): Promise<UnifiedOfferListResponse> {
    const offers: UnifiedOffer[] = [];
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    // Calculate how many records we need to fetch from each source
    // We need to fetch enough to cover offset + limit to properly paginate across sources
    const fetchLimit = offset + limit;

    // Determine which types to query
    const types = Array.isArray(filters.type)
      ? filters.type
      : filters.type
        ? [filters.type]
        : [
            UnifiedOfferType.LISTING,
            UnifiedOfferType.CNFT_BID,
            UnifiedOfferType.ATOMIC,
            UnifiedOfferType.BULK_TWO_PHASE,
          ];

    // Query listings if requested
    if (types.includes(UnifiedOfferType.LISTING)) {
      try {
        const listingResult = await this.listingManager.getListings({
          seller: filters.maker,
          includeExpired: filters.includeExpired,
          limit: fetchLimit, // Fetch enough to cover offset + limit
          offset: 0, // Don't apply offset to individual sources
        });
        offers.push(...listingResult.listings.map((l) => this.normalizeListingToOffer(l)));
      } catch {
        // Listing table may not exist
      }
    }

    // Query cNFT bids if requested
    if (types.includes(UnifiedOfferType.CNFT_BID)) {
      try {
        const bidsResult = await this.cnftBidManager.getOffers({
          bidderWallet: filters.maker,
          ownerWallet: filters.taker,
        });
        offers.push(...bidsResult.offers.map((b: any) => this.normalizeCnftBidToOffer(b)));
      } catch {
        // Bid table may not exist
      }
    }

    // Query atomic offers if requested
    if (types.includes(UnifiedOfferType.ATOMIC) || types.includes(UnifiedOfferType.BULK_TWO_PHASE)) {
      try {
        // Handle status filter - can be single value or array
        const statusFilter = this.resolveStatusFilter(filters.status);

        const atomicResult = await this.offerManager.listOffers({
          makerWallet: filters.maker,
          takerWallet: filters.taker,
          status: statusFilter,
          limit: fetchLimit, // Fetch enough to cover offset + limit
          offset: 0, // Don't apply offset to individual sources
        });
        offers.push(...atomicResult.offers.map((o: any) => this.normalizeAtomicOfferToUnified(o)));
      } catch {
        // Offer table may not exist
      }
    }

    // Sort all collected offers
    const sortedOffers = this.sortOffers(offers, filters.sortBy, filters.sortOrder);

    // Apply pagination ONCE to the combined, sorted results
    const paginatedOffers = sortedOffers.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        offers: paginatedOffers,
        pagination: {
          total: sortedOffers.length,
          limit,
          offset,
          hasMore: offset + limit < sortedOffers.length,
        },
      },
    };
  }

  /**
   * Resolve status filter - handles both single values and arrays
   * For arrays, returns the first mapped value (Prisma doesn't support OR on status directly)
   */
  private resolveStatusFilter(status: UnifiedOfferStatus | UnifiedOfferStatus[] | undefined): OfferStatus | undefined {
    if (!status) return undefined;

    // Handle array - map all values and filter out undefined
    if (Array.isArray(status)) {
      // For now, use the first valid status if multiple are provided
      // A more complete solution would require Prisma OR queries
      for (const s of status) {
        const mapped = this.mapStatusToPrisma(s);
        if (mapped) return mapped;
      }
      return undefined;
    }

    // Single value
    return this.mapStatusToPrisma(status);
  }

  // ===========================================================================
  // Delegation Operations (Listings)
  // ===========================================================================

  /**
   * Confirm delegation for a listing
   */
  async confirmDelegation(offerId: string, signature: string): Promise<UnifiedOffer> {
    const listing = await this.listingManager.confirmListing({
      listingId: offerId,
      signature,
    });
    return this.normalizeListingToOffer(listing);
  }

  /**
   * Revoke delegation for a listing
   */
  async revokeDelegation(offerId: string, seller: string): Promise<UnifiedCreateResult> {
    const result = await this.listingManager.cancelListing({
      listingId: offerId,
      seller,
    });

    return {
      offer: this.normalizeListingToOffer(result.listing),
      transaction: result.transaction ? {
        serializedTransaction: result.transaction.serializedTransaction,
        blockhash: result.transaction.blockhash,
        lastValidBlockHeight: result.transaction.lastValidBlockHeight,
        requiredSigners: result.transaction.requiredSigners,
        isVersioned: result.transaction.isVersioned,
      } : undefined,
    };
  }

  /**
   * Confirm delegation revocation
   */
  async confirmRevocation(offerId: string, signature: string): Promise<UnifiedOffer> {
    const listing = await this.listingManager.confirmRevoke(offerId, signature);
    return this.normalizeListingToOffer(listing);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Detect offer type by looking up the offer
   */
  private async detectOfferType(offerId: string): Promise<UnifiedOfferType> {
    // Check if it's a UUID (listings and bids use UUIDs)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId);

    if (isUuid) {
      // Try listing first
      try {
        const listing = await this.listingManager.getListing(offerId);
        if (listing) return UnifiedOfferType.LISTING;
      } catch {
        // Not a listing
      }

      // Try cNFT bid
      try {
        const bid = await this.cnftBidManager.getOffer(offerId);
        if (bid) return UnifiedOfferType.CNFT_BID;
      } catch {
        // Not a bid
      }
    }

    // Default to atomic (includes bulk)
    return UnifiedOfferType.ATOMIC;
  }

  /**
   * Parse offer ID to numeric (for atomic offers)
   */
  private parseOfferId(offerId: string): number {
    const numericId = parseInt(offerId, 10);
    if (isNaN(numericId)) {
      throw new Error(`Invalid offer ID format: ${offerId}`);
    }
    return numericId;
  }

  /**
   * Normalize a listing to UnifiedOffer format
   */
  private normalizeListingToOffer(listing: any): UnifiedOffer {
    return {
      id: listing.id,
      offerId: listing.listingId,
      offerType: UnifiedOfferType.LISTING,
      status: this.mapListingStatusToUnified(listing.status),
      maker: listing.seller,
      taker: listing.buyer,
      offeredAssets: [
        {
          type: 'CNFT',
          mint: listing.assetId,
          isCompressed: true,
          name: listing.metadata?.name,
          image: listing.metadata?.image,
        },
      ],
      requestedAssets: [
        {
          type: 'SOL',
          amount: listing.priceLamports.toString(),
        },
      ],
      platformFeeLamports: listing.platformFeeLamports?.toString() || '0',
      feeBps: listing.feeBps || 100,
      expiresAt: listing.expiresAt?.toISOString() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: listing.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: listing.updatedAt?.toISOString(),
      delegationStatus: this.mapDelegationStatus(listing.delegationStatus),
      delegationSignature: listing.delegationSignature,
    };
  }

  /**
   * Normalize a cNFT bid to UnifiedOffer format
   */
  private normalizeCnftBidToOffer(bid: any): UnifiedOffer {
    return {
      id: bid.id,
      offerId: bid.offerId,
      offerType: UnifiedOfferType.CNFT_BID,
      status: this.mapBidStatusToUnified(bid.status),
      maker: bid.bidderWallet,
      taker: bid.ownerWallet,
      offeredAssets: [
        {
          type: 'SOL',
          amount: bid.offerLamports.toString(),
        },
      ],
      requestedAssets: [
        {
          type: 'CNFT',
          mint: bid.targetAssetId,
          isCompressed: true,
        },
      ],
      platformFeeLamports: bid.platformFeeLamports?.toString() || '0',
      feeBps: bid.feeBps || 100,
      expiresAt: bid.expiresAt?.toISOString() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: bid.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: bid.updatedAt?.toISOString(),
    };
  }

  /**
   * Normalize an atomic offer to UnifiedOffer format
   */
  private normalizeAtomicOfferToUnified(offer: OfferSummary): UnifiedOffer {
    // Convert offered assets - checking for SOL assets in the array
    const offeredAssets: UnifiedAsset[] = offer.offeredAssets.map((a: any) => {
      // Check if this is a SOL asset (indicated by type or lack of identifier)
      if (a.type === 'SOL' || a.assetType === 'SOL') {
        return {
          type: 'SOL' as const,
          amount: a.amount?.toString() || a.lamports?.toString() || '0',
        };
      }
      return {
        type: this.mapAssetTypeToUnified(a.type || a.assetType),
        mint: a.identifier || a.mint || a.assetId,
        name: a.metadata?.name,
        image: a.metadata?.image,
        isCompressed: a.type === AssetType.CNFT || a.type === 'cnft' || a.isCompressed,
      };
    });

    // Convert requested assets
    const requestedAssets: UnifiedAsset[] = offer.requestedAssets.map((a: any) => {
      // Check if this is a SOL asset
      if (a.type === 'SOL' || a.assetType === 'SOL') {
        return {
          type: 'SOL' as const,
          amount: a.amount?.toString() || a.lamports?.toString() || '0',
        };
      }
      return {
        type: this.mapAssetTypeToUnified(a.type || a.assetType),
        mint: a.identifier || a.mint || a.assetId,
        name: a.metadata?.name,
        image: a.metadata?.image,
        isCompressed: a.type === AssetType.CNFT || a.type === 'cnft' || a.isCompressed,
      };
    });

    // Determine if this is a bulk offer
    const isBulk =
      offeredAssets.filter((a) => a.type === 'CNFT').length >= 3 ||
      requestedAssets.filter((a) => a.type === 'CNFT').length >= 3 ||
      offeredAssets.length + requestedAssets.length >= 5;

    // Extract fee info from platformFee (FeeBreakdown type)
    const feeLamports = offer.platformFee?.feeLamports?.toString() || '0';
    // Calculate feeBps from rate (percentage) or default
    const feeBps = offer.platformFee?.feeType === 'percentage'
      ? Math.round(offer.platformFee.rate * 10000) // Convert decimal to bps
      : 100; // Default 1%

    return {
      id: offer.id,
      offerId: offer.id.toString(),
      offerType: isBulk ? UnifiedOfferType.BULK_TWO_PHASE : UnifiedOfferType.ATOMIC,
      status: this.mapOfferStatusToUnified(offer.status),
      maker: offer.makerWallet,
      taker: offer.takerWallet,
      offeredAssets,
      requestedAssets,
      platformFeeLamports: feeLamports,
      feeBps,
      expiresAt: offer.expiresAt?.toISOString() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: offer.createdAt?.toISOString() || new Date().toISOString(),
    };
  }

  /**
   * Map asset type string to unified format
   */
  private mapAssetTypeToUnified(type: string | AssetType): 'NFT' | 'CNFT' | 'CORE_NFT' | 'SOL' | 'SPL_TOKEN' {
    if (type === AssetType.CNFT || type === 'cnft' || type === 'CNFT') return 'CNFT';
    if (type === AssetType.CORE_NFT || type === 'core_nft' || type === 'CORE_NFT') return 'CORE_NFT';
    if (type === 'SOL' || type === 'sol') return 'SOL';
    if (type === 'SPL_TOKEN' || type === 'spl_token') return 'SPL_TOKEN';
    return 'NFT';
  }

  /**
   * Map listing status to unified format
   */
  private mapListingStatusToUnified(status: string): UnifiedOfferStatus {
    const statusMap: Record<string, UnifiedOfferStatus> = {
      PENDING: 'PENDING',
      ACTIVE: 'ACTIVE',
      SOLD: 'COMPLETED',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED',
    };
    return statusMap[status] || 'PENDING';
  }

  /**
   * Map bid status to unified format
   */
  private mapBidStatusToUnified(status: string): UnifiedOfferStatus {
    const statusMap: Record<string, UnifiedOfferStatus> = {
      PENDING_ESCROW: 'PENDING',
      ACTIVE: 'ACTIVE',
      ACCEPTED: 'ACCEPTED',
      COMPLETED: 'COMPLETED',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED',
    };
    return statusMap[status] || 'PENDING';
  }

  /**
   * Map offer status to unified format
   * Prisma OfferStatus: ACTIVE, ACCEPTED, FILLED, CANCELLED, EXPIRED, COUNTERED
   */
  private mapOfferStatusToUnified(status: OfferStatus): UnifiedOfferStatus {
    const statusMap: Record<string, UnifiedOfferStatus> = {
      ACTIVE: 'ACTIVE',
      ACCEPTED: 'ACCEPTED',
      FILLED: 'COMPLETED',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED',
      COUNTERED: 'PENDING', // Counter-offer state maps to pending
    };
    return statusMap[status] || 'PENDING';
  }

  /**
   * Map unified status to Prisma status
   */
  private mapStatusToPrisma(status: UnifiedOfferStatus): OfferStatus | undefined {
    const statusMap: Partial<Record<UnifiedOfferStatus, OfferStatus>> = {
      PENDING: 'ACTIVE', // No direct PENDING in Prisma
      ACTIVE: 'ACTIVE',
      ACCEPTED: 'ACCEPTED',
      LOCKED: 'ACTIVE', // No direct mapping
      SETTLING: 'ACTIVE', // No direct mapping
      COMPLETED: 'FILLED',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED',
      FAILED: 'CANCELLED', // Map failed to cancelled
    };
    return statusMap[status];
  }

  /**
   * Map delegation status
   */
  private mapDelegationStatus(status: string | undefined): DelegationStatusType {
    if (!status) return 'NONE';
    const statusMap: Record<string, DelegationStatusType> = {
      PENDING_DELEGATION: 'PENDING_DELEGATION',
      DELEGATION_CONFIRMED: 'DELEGATION_CONFIRMED',
      REVOCATION_PENDING: 'REVOCATION_PENDING',
      REVOKED: 'REVOKED',
    };
    return statusMap[status] || 'NONE';
  }

  /**
   * Sort offers by specified field
   */
  private sortOffers(
    offers: UnifiedOffer[],
    sortBy?: 'createdAt' | 'expiresAt' | 'price',
    sortOrder?: 'asc' | 'desc'
  ): UnifiedOffer[] {
    const order = sortOrder === 'asc' ? 1 : -1;

    return offers.sort((a, b) => {
      if (sortBy === 'price') {
        const priceA = this.getOfferPrice(a);
        const priceB = this.getOfferPrice(b);
        return (priceA - priceB) * order;
      }

      if (sortBy === 'expiresAt') {
        return (new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()) * order;
      }

      // Default: createdAt
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * order;
    });
  }

  /**
   * Get price from offer (SOL amount requested)
   */
  private getOfferPrice(offer: UnifiedOffer): number {
    const solAsset = offer.requestedAssets.find((a) => a.type === 'SOL');
    return solAsset?.amount ? parseInt(solAsset.amount, 10) : 0;
  }
}

/**
 * Factory function to create UnifiedOfferService
 */
export function createUnifiedOfferService(
  connection: Connection,
  prisma: PrismaClient,
  offerManager: OfferManager,
  listingManager: ListingManager,
  cnftBidManager: CnftOfferEscrowManager
): UnifiedOfferService {
  return new UnifiedOfferService(connection, prisma, offerManager, listingManager, cnftBidManager);
}
