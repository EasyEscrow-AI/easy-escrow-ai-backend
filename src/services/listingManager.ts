/**
 * Listing Manager Service
 *
 * Manages the lifecycle of cNFT listings with delegation:
 * - Creating listings with delegation transactions
 * - Confirming delegation after seller signs
 * - Cancelling listings with delegation revocation
 * - Listing expiry handling
 *
 * @see docs/BUBBLEGUM_DELEGATION.md for architecture details
 */

import {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import { PrismaClient, Listing, DelegationStatus, ListingStatus } from '../generated/prisma';
import { v4 as uuidv4 } from 'uuid';
import {
  CnftDelegationService,
  createCnftDelegationService,
  DelegationStatus as DelegationStatusEnum,
} from './cnftDelegationService';
import { FeeCalculator } from './feeCalculator';

/**
 * Parameters for creating a new listing
 */
export interface CreateListingParams {
  /** Seller wallet address */
  seller: string;
  /** cNFT asset ID (Metaplex DAS format) */
  assetId: string;
  /** Price in lamports (SOL) */
  priceLamports: bigint;
  /** Listing duration in seconds (default: 7 days) */
  durationSeconds?: number;
  /** Custom fee in basis points (default: 100 = 1%) */
  feeBps?: number;
}

/**
 * Result of creating a listing
 */
export interface CreateListingResult {
  /** The created listing record */
  listing: {
    id: string;
    listingId: string;
    seller: string;
    assetId: string;
    priceLamports: string;
    status: ListingStatus;
    delegationStatus: DelegationStatus;
    expiresAt: Date;
    feeBps: number;
    metadata?: any;
  };
  /** Delegation transaction for seller to sign */
  transaction: {
    serializedTransaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
    requiredSigners: string[];
    isVersioned: boolean;
  };
  /** Estimated fees */
  fees: {
    platformFeeLamports: string;
    sellerReceivesLamports: string;
  };
}

/**
 * Parameters for confirming a listing
 */
export interface ConfirmListingParams {
  /** Listing ID (external) */
  listingId: string;
  /** Transaction signature */
  signature: string;
}

/**
 * Parameters for cancelling a listing
 */
export interface CancelListingParams {
  /** Listing ID (external) */
  listingId: string;
  /** Seller wallet (must match) */
  seller: string;
}

/**
 * Result of cancelling a listing
 */
export interface CancelListingResult {
  /** Updated listing */
  listing: {
    id: string;
    listingId: string;
    status: ListingStatus;
    delegationStatus: DelegationStatus;
  };
  /** Revoke transaction for seller to sign (if delegation was active) */
  transaction?: {
    serializedTransaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
    requiredSigners: string[];
    isVersioned: boolean;
  };
}

/**
 * Filter options for listing queries
 */
export interface ListingFilters {
  /** Filter by seller */
  seller?: string;
  /** Filter by status */
  status?: ListingStatus;
  /** Filter by delegation status */
  delegationStatus?: DelegationStatus;
  /** Include expired listings */
  includeExpired?: boolean;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Listing Manager - handles cNFT listing lifecycle
 */
export class ListingManager {
  private connection: Connection;
  private prisma: PrismaClient;
  private delegationService: CnftDelegationService;
  private feeCalculator: FeeCalculator;
  private marketplacePda: PublicKey;
  private programId: PublicKey;

  constructor(
    connection: Connection,
    prisma: PrismaClient,
    platformAuthority: Keypair,
    programId: PublicKey
  ) {
    this.connection = connection;
    this.prisma = prisma;
    this.programId = programId;
    this.delegationService = createCnftDelegationService(connection);
    this.feeCalculator = new FeeCalculator();

    // Derive marketplace PDA for delegations using the delegation service
    const [pda] = this.delegationService.deriveMarketplaceDelegatePDA(
      programId,
      'easyescrow-marketplace'
    );
    this.marketplacePda = pda;

    console.log('[ListingManager] Initialized');
    console.log('[ListingManager] Marketplace PDA:', this.marketplacePda.toBase58());
  }

  /**
   * Create a new cNFT listing
   *
   * This validates the cNFT, creates a listing record, and builds
   * a delegation transaction for the seller to sign.
   */
  async createListing(params: CreateListingParams): Promise<CreateListingResult> {
    console.log('[ListingManager] Creating listing:', {
      seller: params.seller,
      assetId: params.assetId.substring(0, 12) + '...',
      priceLamports: params.priceLamports.toString(),
    });

    // Validate seller wallet
    let sellerPubkey: PublicKey;
    try {
      sellerPubkey = new PublicKey(params.seller);
    } catch {
      throw new Error('Invalid seller wallet address');
    }

    // Validate price
    if (params.priceLamports <= 0n) {
      throw new Error('Price must be greater than 0');
    }

    // Check for duplicate active listings
    const existingListing = await this.prisma.listing.findFirst({
      where: {
        assetId: params.assetId,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
    });

    if (existingListing) {
      throw new Error(
        `cNFT ${params.assetId.substring(0, 12)}... already has an active listing (${existingListing.listingId})`
      );
    }

    // Validate delegation using the service
    const validationResult = await this.delegationService.validateCanDelegate(
      params.assetId,
      sellerPubkey,
      this.marketplacePda
    );

    if (!validationResult.valid) {
      throw new Error(validationResult.reason || 'Cannot delegate cNFT');
    }

    // Check delegation status (shouldn't be delegated elsewhere)
    const delegationStatus = await this.delegationService.getDelegationStatus(params.assetId);

    if (delegationStatus.owner !== params.seller) {
      throw new Error(
        `Seller ${params.seller.substring(0, 8)}... does not own cNFT ${params.assetId.substring(0, 12)}...`
      );
    }

    const isDelegated = delegationStatus.status === DelegationStatusEnum.DELEGATED ||
                        delegationStatus.status === DelegationStatusEnum.DELEGATED_AND_FROZEN;

    if (isDelegated && delegationStatus.delegate !== this.marketplacePda.toBase58()) {
      throw new Error(
        `cNFT ${params.assetId.substring(0, 12)}... is already delegated to another address`
      );
    }

    // Fetch cNFT data for metadata and tree info
    const cnftService = this.delegationService.getCnftService();
    const assetData = await cnftService.getCnftAsset(params.assetId);

    // Calculate fees
    const feeBps = params.feeBps ?? 100; // Default 1%
    const platformFeeLamports =
      (params.priceLamports * BigInt(feeBps)) / BigInt(10000);
    const sellerReceivesLamports = params.priceLamports - platformFeeLamports;

    // Calculate expiry
    const durationSeconds = params.durationSeconds ?? 7 * 24 * 60 * 60; // Default 7 days
    const expiresAt = new Date(Date.now() + durationSeconds * 1000);

    // Generate listing ID
    const listingId = `lst_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

    // Build delegation instruction using the service
    const delegationResult = await this.delegationService.delegateCnft(
      params.assetId,
      sellerPubkey,
      this.marketplacePda
    );

    // Build transaction from instruction
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
      payerKey: sellerPubkey,
      recentBlockhash: blockhash,
      instructions: [delegationResult.instruction],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

    // Get leaf index from asset data
    const leafIndex = assetData.compression.leaf_id;

    // Create listing record
    const listing = await this.prisma.listing.create({
      data: {
        listingId,
        seller: params.seller,
        assetId: params.assetId,
        merkleTree: assetData.compression.tree,
        leafIndex,
        priceLamports: params.priceLamports,
        delegationStatus: 'PENDING',
        delegatePda: this.marketplacePda.toBase58(),
        status: 'PENDING',
        expiresAt,
        feeBps,
        metadata: {
          name: assetData.content?.metadata?.name || null,
          image: assetData.content?.links?.image || null,
          collection: assetData.grouping?.[0]?.group_value || null,
        },
      },
    });

    console.log('[ListingManager] Listing created:', {
      listingId,
      id: listing.id,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      listing: {
        id: listing.id,
        listingId: listing.listingId,
        seller: listing.seller,
        assetId: listing.assetId,
        priceLamports: listing.priceLamports.toString(),
        status: listing.status,
        delegationStatus: listing.delegationStatus,
        expiresAt: listing.expiresAt,
        feeBps: listing.feeBps,
        metadata: listing.metadata,
      },
      transaction: {
        serializedTransaction,
        blockhash,
        lastValidBlockHeight,
        requiredSigners: [params.seller],
        isVersioned: true,
      },
      fees: {
        platformFeeLamports: platformFeeLamports.toString(),
        sellerReceivesLamports: sellerReceivesLamports.toString(),
      },
    };
  }

  /**
   * Confirm a listing after delegation transaction is confirmed
   */
  async confirmListing(params: ConfirmListingParams): Promise<Listing> {
    console.log('[ListingManager] Confirming listing:', {
      listingId: params.listingId,
      signature: params.signature.substring(0, 16) + '...',
    });

    // Find listing
    const listing = await this.prisma.listing.findUnique({
      where: { listingId: params.listingId },
    });

    if (!listing) {
      throw new Error(`Listing ${params.listingId} not found`);
    }

    if (listing.status !== 'PENDING') {
      throw new Error(`Listing ${params.listingId} is not pending (status: ${listing.status})`);
    }

    // Verify transaction on-chain
    const txInfo = await this.connection.getTransaction(params.signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo) {
      throw new Error(`Transaction ${params.signature.substring(0, 16)}... not found on-chain`);
    }

    if (txInfo.meta?.err) {
      throw new Error(
        `Transaction ${params.signature.substring(0, 16)}... failed: ${JSON.stringify(txInfo.meta.err)}`
      );
    }

    // Verify delegation on-chain using isDelegatedToProgram
    const isDelegatedToMarketplace = await this.delegationService.isDelegatedToProgram(
      listing.assetId,
      this.marketplacePda
    );

    if (!isDelegatedToMarketplace) {
      // Get status for better error message
      const delegationStatus = await this.delegationService.getDelegationStatus(listing.assetId);
      if (delegationStatus.status === DelegationStatusEnum.NOT_DELEGATED) {
        throw new Error(`cNFT ${listing.assetId.substring(0, 12)}... is not delegated after transaction`);
      } else {
        throw new Error(
          `cNFT ${listing.assetId.substring(0, 12)}... is delegated to wrong address: ${delegationStatus.delegate}`
        );
      }
    }

    // Update listing status
    const updatedListing = await this.prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: 'ACTIVE',
        delegationStatus: 'DELEGATED',
        delegatedAt: new Date(),
        delegateTxId: params.signature,
      },
    });

    console.log('[ListingManager] Listing confirmed:', {
      listingId: updatedListing.listingId,
      status: updatedListing.status,
      delegationStatus: updatedListing.delegationStatus,
    });

    return updatedListing;
  }

  /**
   * Cancel a listing
   *
   * Returns a revoke transaction if delegation is active,
   * otherwise just marks the listing as cancelled.
   */
  async cancelListing(params: CancelListingParams): Promise<CancelListingResult> {
    console.log('[ListingManager] Cancelling listing:', {
      listingId: params.listingId,
      seller: params.seller.substring(0, 8) + '...',
    });

    // Find listing
    const listing = await this.prisma.listing.findUnique({
      where: { listingId: params.listingId },
    });

    if (!listing) {
      throw new Error(`Listing ${params.listingId} not found`);
    }

    // Verify seller
    if (listing.seller !== params.seller) {
      throw new Error('Only the seller can cancel this listing');
    }

    // Check if cancellable
    if (!['PENDING', 'ACTIVE'].includes(listing.status)) {
      throw new Error(
        `Listing ${params.listingId} cannot be cancelled (status: ${listing.status})`
      );
    }

    let revokeTransaction: CancelListingResult['transaction'] = undefined;

    // If delegation is active, build revoke transaction
    if (listing.delegationStatus === 'DELEGATED' || listing.delegationStatus === 'FROZEN') {
      const sellerPubkey = new PublicKey(params.seller);

      // Build revoke instruction using the delegation service
      const revokeResult = await this.delegationService.revokeDelegation(
        listing.assetId,
        sellerPubkey
      );

      // Build transaction from instruction
      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash('confirmed');

      const messageV0 = new TransactionMessage({
        payerKey: sellerPubkey,
        recentBlockhash: blockhash,
        instructions: [revokeResult.instruction],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

      revokeTransaction = {
        serializedTransaction,
        blockhash,
        lastValidBlockHeight,
        requiredSigners: [params.seller],
        isVersioned: true,
      };
    }

    // Update listing status
    const updatedListing = await this.prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        // Keep delegation status until revoke is confirmed
        // delegationStatus will be updated in confirmRevoke
      },
    });

    console.log('[ListingManager] Listing cancellation initiated:', {
      listingId: updatedListing.listingId,
      requiresRevoke: !!revokeTransaction,
    });

    return {
      listing: {
        id: updatedListing.id,
        listingId: updatedListing.listingId,
        status: updatedListing.status,
        delegationStatus: updatedListing.delegationStatus,
      },
      transaction: revokeTransaction,
    };
  }

  /**
   * Confirm revoke transaction after cancellation
   */
  async confirmRevoke(listingId: string, signature: string): Promise<Listing> {
    console.log('[ListingManager] Confirming revoke:', {
      listingId,
      signature: signature.substring(0, 16) + '...',
    });

    // Find listing
    const listing = await this.prisma.listing.findUnique({
      where: { listingId },
    });

    if (!listing) {
      throw new Error(`Listing ${listingId} not found`);
    }

    if (listing.status !== 'CANCELLED') {
      throw new Error(`Listing ${listingId} is not cancelled`);
    }

    // Verify transaction on-chain
    const txInfo = await this.connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo) {
      throw new Error(`Transaction ${signature.substring(0, 16)}... not found on-chain`);
    }

    if (txInfo.meta?.err) {
      throw new Error(
        `Transaction ${signature.substring(0, 16)}... failed: ${JSON.stringify(txInfo.meta.err)}`
      );
    }

    // Verify delegation revoked on-chain
    const stillDelegatedToMarketplace = await this.delegationService.isDelegatedToProgram(
      listing.assetId,
      this.marketplacePda
    );

    if (stillDelegatedToMarketplace) {
      throw new Error(`cNFT ${listing.assetId.substring(0, 12)}... is still delegated to marketplace`);
    }

    // Update listing
    const updatedListing = await this.prisma.listing.update({
      where: { id: listing.id },
      data: {
        delegationStatus: 'REVOKED',
        revokeTxId: signature,
      },
    });

    console.log('[ListingManager] Revoke confirmed:', {
      listingId: updatedListing.listingId,
      delegationStatus: updatedListing.delegationStatus,
    });

    return updatedListing;
  }

  /**
   * Get a listing by ID
   */
  async getListing(listingId: string): Promise<Listing | null> {
    return this.prisma.listing.findUnique({
      where: { listingId },
    });
  }

  /**
   * Get listings with filters
   */
  async getListings(filters: ListingFilters = {}): Promise<{ listings: Listing[]; total: number }> {
    const where: any = {};

    if (filters.seller) {
      where.seller = filters.seller;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.delegationStatus) {
      where.delegationStatus = filters.delegationStatus;
    }

    if (!filters.includeExpired) {
      where.OR = [{ expiresAt: { gt: new Date() } }, { status: { in: ['SOLD', 'CANCELLED'] } }];
    }

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        take: filters.limit ?? 20,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return { listings, total };
  }

  /**
   * Get active listings for a seller
   */
  async getSellerListings(seller: string): Promise<Listing[]> {
    return this.prisma.listing.findMany({
      where: {
        seller,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get marketplace PDA
   */
  getMarketplacePda(): PublicKey {
    return this.marketplacePda;
  }
}

/**
 * Create a ListingManager instance
 */
export function createListingManager(
  connection: Connection,
  prisma: PrismaClient,
  platformAuthority: Keypair,
  programId: PublicKey
): ListingManager {
  return new ListingManager(connection, prisma, platformAuthority, programId);
}
