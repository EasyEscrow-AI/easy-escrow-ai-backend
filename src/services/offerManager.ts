/**
 * Offer Manager Service
 * 
 * Core business logic service for managing atomic swap offers.
 * Integrates with all other services to provide complete offer lifecycle management.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PrismaClient, OfferType, OfferStatus} from '../generated/prisma';
import { NoncePoolManager } from './noncePoolManager';
import { FeeCalculator, FeeBreakdown } from './feeCalculator';
import { AssetValidator, AssetType, ValidationResult } from './assetValidator';
import { TransactionBuilder, SwapAsset, TransactionBuildInputs } from './transactionBuilder';
import { 
  TransactionGroupBuilder, 
  TransactionGroupResult, 
  SwapStrategy,
  createTransactionGroupBuilder 
} from './transactionGroupBuilder';

// Maximum assets allowed per side of a swap (maker's offered + taker's requested)
// Bulk swaps with multiple assets are handled via transaction splitting (Task 44)
const MAX_ASSETS_PER_SIDE = 10;

// Minimum total assets required (at least one side must have assets or SOL)
const MIN_TOTAL_VALUE = 1;

export interface CreateOfferInput {
  /** Maker wallet address */
  makerWallet: string;
  
  /** Taker wallet address (optional - null for open offers) */
  takerWallet?: string;
  
  /** Assets offered by maker */
  offeredAssets: Array<{ type: AssetType; identifier: string }>;
  
  /** SOL amount offered by maker (in lamports) */
  offeredSol?: bigint;
  
  /** Assets requested by maker */
  requestedAssets: Array<{ type: AssetType; identifier: string }>;
  
  /** SOL amount requested by maker (in lamports) */
  requestedSol?: bigint;
  
  /** Custom fee override (optional) */
  customFee?: bigint;
  
  /** Expiration time in milliseconds (optional, default 7 days) */
  expirationMs?: number;
}

export interface OfferSummary {
  id: number;
  makerWallet: string;
  takerWallet?: string;
  offerType: OfferType;
  status: OfferStatus;
  offeredAssets: any[];
  requestedAssets: any[];
  platformFee: FeeBreakdown;
  nonceAccount: string;
  expiresAt: Date;
  createdAt: Date;
  serializedTransaction?: string;
}

export class OfferManager {
  private connection: Connection;
  private prisma: PrismaClient;
  private noncePoolManager: NoncePoolManager;
  private feeCalculator: FeeCalculator;
  private assetValidator: AssetValidator;
  private transactionBuilder: TransactionBuilder;
  private transactionGroupBuilder: TransactionGroupBuilder;
  private platformAuthority: Keypair;
  private treasuryPDA: PublicKey;
  private programId: PublicKey;
  
  constructor(
    connection: Connection,
    prisma: PrismaClient,
    noncePoolManager: NoncePoolManager,
    feeCalculator: FeeCalculator,
    assetValidator: AssetValidator,
    transactionBuilder: TransactionBuilder,
    platformAuthority: Keypair,
    treasuryPDA: PublicKey,
    programId: PublicKey
  ) {
    this.connection = connection;
    this.prisma = prisma;
    this.noncePoolManager = noncePoolManager;
    this.feeCalculator = feeCalculator;
    this.assetValidator = assetValidator;
    this.transactionBuilder = transactionBuilder;
    this.platformAuthority = platformAuthority;
    this.treasuryPDA = treasuryPDA;
    this.programId = programId;
    
    // Initialize TransactionGroupBuilder for bulk swap support
    // Uses the same ALT service as the TransactionBuilder
    this.transactionGroupBuilder = createTransactionGroupBuilder(
      connection,
      platformAuthority,
      treasuryPDA,
      transactionBuilder.getALTService() || undefined
    );
    
    console.log('[OfferManager] Initialized');
    console.log('[OfferManager] Bulk swap support: enabled');
  }
  
  /**
   * Create a new swap offer
   */
  async createOffer(input: CreateOfferInput): Promise<OfferSummary> {
    console.log('[OfferManager] Creating offer:', {
      maker: input.makerWallet,
      taker: input.takerWallet || 'open',
      offeredAssets: input.offeredAssets.length,
      requestedAssets: input.requestedAssets.length,
    });
    
    try {
      // 1. Ensure user exists
      await this.ensureUserExists(input.makerWallet);
      
      // 2. Validate asset count limits
      // Bulk swaps with multiple assets are supported - transaction splitting handles execution
      if (input.offeredAssets.length > MAX_ASSETS_PER_SIDE) {
        throw new Error(
          `Too many offered assets (${input.offeredAssets.length}). ` +
          `Maximum is ${MAX_ASSETS_PER_SIDE} assets per side.`
        );
      }
      
      if (input.requestedAssets.length > MAX_ASSETS_PER_SIDE) {
        throw new Error(
          `Too many requested assets (${input.requestedAssets.length}). ` +
          `Maximum is ${MAX_ASSETS_PER_SIDE} assets per side.`
        );
      }
      
      // 2b. Validate minimum offer value (must offer something)
      const hasOfferedAssets = input.offeredAssets.length > 0;
      const hasOfferedSol = (input.offeredSol || BigInt(0)) > BigInt(0);
      const hasRequestedAssets = input.requestedAssets.length > 0;
      const hasRequestedSol = (input.requestedSol || BigInt(0)) > BigInt(0);
      
      if (!hasOfferedAssets && !hasOfferedSol) {
        throw new Error('Maker must offer at least one asset or SOL');
      }
      
      if (!hasRequestedAssets && !hasRequestedSol) {
        throw new Error('Maker must request at least one asset or SOL');
      }
      
      // 2c. Check for duplicate assets within each side
      const offeredIdentifiers = input.offeredAssets.map(a => a.identifier.toLowerCase());
      const offeredDuplicates = offeredIdentifiers.filter((id, idx) => offeredIdentifiers.indexOf(id) !== idx);
      if (offeredDuplicates.length > 0) {
        throw new Error(
          `Duplicate assets in offered list: ${[...new Set(offeredDuplicates)].join(', ')}`
        );
      }
      
      const requestedIdentifiers = input.requestedAssets.map(a => a.identifier.toLowerCase());
      const requestedDuplicates = requestedIdentifiers.filter((id, idx) => requestedIdentifiers.indexOf(id) !== idx);
      if (requestedDuplicates.length > 0) {
        throw new Error(
          `Duplicate assets in requested list: ${[...new Set(requestedDuplicates)].join(', ')}`
        );
      }
      
      // 3. Validate maker's asset ownership
      const offeredAssetsValidation = await this.assetValidator.validateAssets(
        input.makerWallet,
        input.offeredAssets
      );
      
      const invalidAssets = offeredAssetsValidation.filter((v) => !v.isValid);
      if (invalidAssets.length > 0) {
        throw new Error(
          `Maker does not own the following assets: ${invalidAssets.map((a) => a.error).join(', ')}`
        );
      }
      
      // 4. Assign or get nonce account for maker
      const nonceAccount = await this.noncePoolManager.assignNonceToUser(input.makerWallet);
      
      // 5. Calculate platform fee
      const offeredSol = input.offeredSol || BigInt(0);
      const requestedSol = input.requestedSol || BigInt(0);
      const feeBreakdown = this.feeCalculator.calculateFee(offeredSol, requestedSol);
      const platformFee = input.customFee || feeBreakdown.feeLamports;
      
      // Validate custom fee if provided
      if (input.customFee && !this.feeCalculator.validateFee(input.customFee, offeredSol, requestedSol)) {
        throw new Error('Invalid custom fee');
      }
      
      // 6. Calculate expiration time
      const expiresAt = new Date(Date.now() + (input.expirationMs || 7 * 24 * 60 * 60 * 1000)); // 7 days default
      
      // 7. Get current nonce value (transaction will be built when offer is accepted)
      // NOTE: We don't build the transaction at create time because it needs BOTH
      // maker and taker signatures. The transaction is built when the offer is accepted.
      const currentNonceValue = await this.noncePoolManager.getCurrentNonce(nonceAccount);
      const serializedTransaction: string | undefined = undefined;
      
      // 8. Create offer in database
      const offer = await this.prisma.swapOffer.create({
        data: {
          makerWallet: input.makerWallet,
          takerWallet: input.takerWallet,
          offerType: OfferType.MAKER_OFFER,
          offeredAssets: input.offeredAssets as any,
          requestedAssets: input.requestedAssets as any,
          offeredSolLamports: offeredSol > BigInt(0) ? offeredSol : null,
          requestedSolLamports: requestedSol > BigInt(0) ? requestedSol : null,
          platformFeeLamports: platformFee,
          status: OfferStatus.ACTIVE,
          expiresAt,
          nonceAccount,
          currentNonceValue,
          serializedTransaction,
        },
      });
      
      console.log('[OfferManager] Offer created:', offer.id);
      
      return {
        id: offer.id,
        makerWallet: offer.makerWallet,
        takerWallet: input.takerWallet,
        offerType: offer.offerType,
        status: offer.status,
        offeredAssets: offer.offeredAssets as any[],
        requestedAssets: offer.requestedAssets as any[],
        platformFee: feeBreakdown,
        nonceAccount: offer.nonceAccount,
        expiresAt: offer.expiresAt,
        createdAt: offer.createdAt,
        serializedTransaction,
      };
    } catch (error) {
      console.error('[OfferManager] Failed to create offer:', error);
      throw error;
    }
  }
  
  /**
   * Accept an offer and get transaction to sign
   */
  /**
   * Rebuild transaction for an already-accepted offer with fresh cNFT proofs
   * Used when a transaction becomes stale before execution
   */
  async rebuildTransaction(offerId: number, authorizedAppId?: string): Promise<{
    serializedTransaction: string;
    offer: any;
  }> {
    // Defensive: Ensure offerId is a number (route params can sometimes be strings)
    const safeOfferId = typeof offerId === 'string' ? parseInt(offerId, 10) : offerId;
    
    if (isNaN(safeOfferId)) {
      throw new Error(`Invalid offer ID: ${offerId}`);
    }
    
    console.log('[OfferManager] Rebuilding transaction for offer:', safeOfferId);
    
    const offer = await this.prisma.swapOffer.findUnique({
      where: { id: safeOfferId },
    });
    
    if (!offer) {
      throw new Error('Offer not found');
    }
    
    if (offer.status !== OfferStatus.ACCEPTED) {
      throw new Error(`Can only rebuild transactions for accepted offers (current status: ${offer.status})`);
    }
    
    if (!offer.takerWallet) {
      throw new Error('Offer has no taker wallet');
    }
    
    // Extract data from the accepted offer
    const offeredAssets = offer.offeredAssets as Array<{ type: AssetType; identifier: string }>;
    const requestedAssets = offer.requestedAssets as Array<{ type: AssetType; identifier: string }>;
    const offeredSol = offer.offeredSolLamports ? BigInt(offer.offeredSolLamports) : BigInt(0);
    const requestedSol = offer.requestedSolLamports ? BigInt(offer.requestedSolLamports) : BigInt(0);
    const platformFee = BigInt(offer.platformFeeLamports);
    
    // Rebuild transaction with fresh proofs (no retry loop - caller handles retries)
    // Preserve zero-fee authorization if this was originally a zero-fee swap
    const buildResult = await this.buildOfferTransaction({
      offerId,
      makerWallet: offer.makerWallet,
      takerWallet: offer.takerWallet,
      offeredAssets,
      offeredSol,
      requestedAssets,
      requestedSol,
      platformFee,
      nonceAccount: offer.nonceAccount,
      authorizedAppId, // Pass through for zero-fee swaps
    });
    
    // Update offer with new transaction
    const updatedOffer = await this.prisma.swapOffer.update({
      where: { id: offerId },
      data: {
        serializedTransaction: buildResult.serializedTransaction,
        currentNonceValue: buildResult.nonceValue,
      },
    });
    
    console.log(`[OfferManager] Transaction rebuilt for offer ${offerId}`);
    
    return {
      serializedTransaction: buildResult.serializedTransaction,
      offer: updatedOffer,
    };
  }

  async acceptOffer(offerId: number, takerWallet: string, authorizedAppId?: string): Promise<{ 
    serializedTransaction: string;
    offer: any; // SwapOffer from Prisma
  }> {
    console.log('[OfferManager] Accepting offer:', { offerId, taker: takerWallet });
    
    try {
      // 1. Load offer
      const offer = await this.prisma.swapOffer.findUnique({
        where: { id: offerId },
      });
      
      if (!offer) {
        throw new Error('Offer not found');
      }
      
      // 2. Validate offer is active and not expired
      if (offer.status !== OfferStatus.ACTIVE) {
        throw new Error(`Offer is not active (status: ${offer.status})`);
      }
      
      if (offer.expiresAt < new Date()) {
        // Mark as expired
        await this.prisma.swapOffer.update({
          where: { id: offerId },
          data: { status: OfferStatus.EXPIRED },
        });
        throw new Error('Offer has expired');
      }
      
      // 3. Check taker wallet restriction (private sales)
      // If offer has a designated taker, only that wallet can accept
      if (offer.takerWallet && offer.takerWallet !== takerWallet) {
        throw new Error(
          `This offer is a private sale for wallet ${offer.takerWallet}. ` +
          `Only the designated taker can accept this offer.`
        );
      }
      
      // 4. Ensure taker exists
      await this.ensureUserExists(takerWallet);
      
      // 5. Validate taker's asset ownership
      const requestedAssets = offer.requestedAssets as Array<{ type: AssetType; identifier: string }>;
      const takerAssetsValidation = await this.assetValidator.validateAssets(takerWallet, requestedAssets);
      
      const invalidAssets = takerAssetsValidation.filter((v) => !v.isValid);
      if (invalidAssets.length > 0) {
        throw new Error(
          `Taker does not own the following assets: ${invalidAssets.map((a) => a.error).join(', ')}`
        );
      }
      
      // 6. Extract SOL amounts from offer
      const offeredAssets = offer.offeredAssets as Array<{ type: AssetType; identifier: string }>;
      const offeredSol = offer.offeredSolLamports ? BigInt(offer.offeredSolLamports) : BigInt(0);
      const requestedSol = offer.requestedSolLamports ? BigInt(offer.requestedSolLamports) : BigInt(0);
      
      console.log('[OfferManager] SOL amounts:', {
        offeredSol: offeredSol.toString(),
        requestedSol: requestedSol.toString(),
      });
      
      // 6. Use stored platform fee
      const platformFee = BigInt(offer.platformFeeLamports);
      
      console.log('[OfferManager] Platform fee:', platformFee.toString());
      
      // 7. Build transaction with retry logic for stale cNFT proofs
      // On devnet/staging, Merkle tree roots can change frequently if other cNFTs are modified
      // Retry with fresh proof if we detect a stale proof error
      let buildResult: { serializedTransaction: string; nonceValue: string } | null = null;
      const maxAttempts = 2;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          buildResult = await this.buildOfferTransaction({
            offerId,
            makerWallet: offer.makerWallet,
            takerWallet,
            offeredAssets,
            offeredSol,
            requestedAssets,
            requestedSol,
            platformFee,
            nonceAccount: offer.nonceAccount,
            authorizedAppId,
          });
          
          // Success! Break out of retry loop
          break;
          
        } catch (error: any) {
          const isLastAttempt = attempt === maxAttempts;
          const isStaleProofError = this.isCnftProofStaleError(error);
          
          if (!isLastAttempt && isStaleProofError) {
            console.warn(`⚠️  [OfferManager] Attempt ${attempt}/${maxAttempts} failed with stale cNFT proof, retrying...`);
            console.warn(`   Error: ${error.message}`);
            // Brief delay before retry to let any in-flight tree updates complete
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
          }
          
          // Either not a stale proof error, or we've exhausted retries
          throw error;
        }
      }
      
      // 8. Ensure we have a valid transaction
      if (!buildResult) {
        throw new Error('Failed to build transaction after retries');
      }
      
      // 9. Update offer with transaction and set status to ACCEPTED
      const updatedOffer = await this.prisma.swapOffer.update({
        where: { id: offerId },
        data: {
          takerWallet,
          serializedTransaction: buildResult.serializedTransaction,
          currentNonceValue: buildResult.nonceValue,
          status: OfferStatus.ACCEPTED,
        },
      });
      
      console.log('[OfferManager] Offer accepted, transaction ready:', offerId);
      
      return {
        serializedTransaction: buildResult.serializedTransaction,
        offer: updatedOffer,
      };
    } catch (error) {
      console.error('[OfferManager] Failed to accept offer:', error);
      throw error;
    }
  }
  
  /**
   * Cancel an offer
   * 
   * @param offerId - The offer ID to cancel
   * @param walletAddress - The wallet requesting cancellation
   * @param isAdmin - Whether the requester is an admin (can cancel any offer)
   */
  async cancelOffer(offerId: number, walletAddress: string, isAdmin: boolean = false): Promise<void> {
    console.log('[OfferManager] Canceling offer:', { offerId, wallet: walletAddress, isAdmin });
    
    try {
      // 1. Load offer
      const offer = await this.prisma.swapOffer.findUnique({
        where: { id: offerId },
      });
      
      if (!offer) {
        throw new Error('Offer not found');
      }
      
      // 2. Verify authorization: only maker or admin can cancel
      const isMaker = offer.makerWallet === walletAddress;
      if (!isMaker && !isAdmin) {
        throw new Error('Only the maker or an admin can cancel this offer');
      }
      
      // 3. Verify offer is cancelable (ACTIVE or ACCEPTED offers can be cancelled)
      // ACCEPTED offers have pending transactions but haven't been executed yet
      if (offer.status !== OfferStatus.ACTIVE && offer.status !== OfferStatus.ACCEPTED) {
        throw new Error(`Offer cannot be cancelled (status: ${offer.status})`);
      }
      
      // 4. Advance nonce to invalidate any pending transactions
      await this.noncePoolManager.advanceNonce(offer.nonceAccount);
      
      // 5. Update this offer as cancelled with tracking info
      await this.prisma.swapOffer.update({
        where: { id: offerId },
        data: {
          status: OfferStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: walletAddress,
        },
      });
      
      // 6. Cancel all OTHER offers using this nonce account (including both ACTIVE and ACCEPTED)
      // ACCEPTED offers also have pending transactions that would fail with consumed nonce
      await this.prisma.swapOffer.updateMany({
        where: {
          nonceAccount: offer.nonceAccount,
          id: { not: offerId },
          status: { in: [OfferStatus.ACTIVE, OfferStatus.ACCEPTED] },
        },
        data: {
          status: OfferStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: walletAddress,
        },
      });
      
      console.log('[OfferManager] Offer cancelled:', {
        offerId,
        cancelledBy: walletAddress,
        role: isAdmin ? 'admin' : 'maker',
      });
    } catch (error) {
      console.error('[OfferManager] Failed to cancel offer:', error);
      throw error;
    }
  }
  
  /**
   * Build transaction for an offer
   * 
   * For simple swaps (1-2 total cNFTs): builds single transaction
   * For bulk swaps (3+ total cNFTs): builds transaction group for Jito bundle
   */
  private async buildOfferTransaction(params: {
    offerId: number;
    makerWallet: string;
    takerWallet: string;
    offeredAssets: Array<{ type: AssetType; identifier: string }>;
    offeredSol: bigint;
    requestedAssets: Array<{ type: AssetType; identifier: string }>;
    requestedSol: bigint;
    platformFee: bigint;
    nonceAccount: string;
    authorizedAppId?: string; // For zero-fee swaps
  }): Promise<{ 
    serializedTransaction: string; 
    nonceValue: string;
    // Bulk swap fields (populated for 3+ cNFT swaps)
    isBulkSwap?: boolean;
    transactionGroup?: TransactionGroupResult;
  }> {
    console.log('[OfferManager] buildOfferTransaction params:', {
      makerWallet: params.makerWallet,
      takerWallet: params.takerWallet,
      offeredAssets: JSON.stringify(params.offeredAssets),
      requestedAssets: JSON.stringify(params.requestedAssets),
      nonceAccount: params.nonceAccount,
      authorizedAppId: params.authorizedAppId || 'none',
    });
    
    const inputs: TransactionBuildInputs = {
      makerPubkey: new PublicKey(params.makerWallet),
      takerPubkey: new PublicKey(params.takerWallet),
      makerAssets: params.offeredAssets.map((a) => ({
        type: a.type,
        identifier: a.identifier,
      })),
      makerSolLamports: params.offeredSol,
      takerAssets: params.requestedAssets.map((a) => ({
        type: a.type,
        identifier: a.identifier,
      })),
      takerSolLamports: params.requestedSol,
      platformFeeLamports: params.platformFee,
      nonceAccountPubkey: new PublicKey(params.nonceAccount),
      nonceAuthorityPubkey: this.platformAuthority.publicKey,
      swapId: `${params.offerId}`, // Use offer ID for tracking
      treasuryPDA: this.treasuryPDA,
      programId: this.programId,
      authorizedAppId: params.authorizedAppId ? new PublicKey(params.authorizedAppId) : undefined,
    };
    
    console.log('[OfferManager] TransactionBuildInputs makerAssets:', JSON.stringify(inputs.makerAssets));
    console.log('[OfferManager] TransactionBuildInputs takerAssets:', JSON.stringify(inputs.takerAssets));
    
    // Check if this is a bulk swap that needs transaction splitting
    const requiresBulkSwap = this.transactionGroupBuilder.requiresJitoBundle(inputs);
    
    if (requiresBulkSwap) {
      // Bulk swap: use TransactionGroupBuilder
      console.log('[OfferManager] Bulk swap detected - using TransactionGroupBuilder');
      
      // Validate inputs using group builder
      this.transactionGroupBuilder.validateInputs(inputs);
      
      // Build transaction group
      const groupResult = await this.transactionGroupBuilder.buildTransactionGroup(inputs);
      
      console.log('[OfferManager] Transaction group built:', {
        strategy: groupResult.strategy,
        transactionCount: groupResult.transactionCount,
        requiresJitoBundle: groupResult.requiresJitoBundle,
        totalSizeBytes: groupResult.totalSizeBytes,
      });
      
      // For bulk swaps, we return the first transaction but include the full group
      // The API layer will handle Jito bundle submission
      const firstTx = groupResult.transactions[0];
      
      if (!firstTx.transaction) {
        throw new Error('Failed to build first transaction in group');
      }
      
      return {
        serializedTransaction: firstTx.transaction.serializedTransaction,
        nonceValue: groupResult.nonceValue,
        isBulkSwap: true,
        transactionGroup: groupResult,
      };
    }
    
    // Simple swap: use standard TransactionBuilder
    console.log('[OfferManager] Simple swap - using standard TransactionBuilder');
    
    // Validate inputs
    this.transactionBuilder.validateInputs(inputs);
    
    // Build transaction
    const result = await this.transactionBuilder.buildSwapTransaction(inputs);
    
    return {
      serializedTransaction: result.serializedTransaction,
      nonceValue: result.nonceValue,
      isBulkSwap: false,
    };
  }
  
  /**
   * Check if error is caused by stale cNFT Merkle proof
   * This happens when the tree root changes between proof fetch and transaction execution
   */
  private isCnftProofStaleError(error: any): boolean {
    const message = error?.message || '';
    const logs = error?.logs || [];
    const stack = error?.stack || '';
    
    // Check for Merkle tree proof validation errors
    const staleProofIndicators = [
      'Invalid root recomputed from proof',
      'Error using concurrent merkle tree',
      'Merkle proof verification failed',
    ];
    
    return staleProofIndicators.some(indicator =>
      message.includes(indicator) ||
      logs.some((log: string) => log.includes(indicator)) ||
      stack.includes(indicator)
    );
  }
  
  /**
   * Ensure user exists in database
   */
  private async ensureUserExists(walletAddress: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { walletAddress },
    });
    
    if (!existing) {
      await this.prisma.user.create({
        data: {
          walletAddress,
          isSubsidized: false,
          swapStats: {} as any,
        },
      });
      console.log('[OfferManager] Created user:', walletAddress);
    }
  }
  
  /**
   * Get offer by ID
   */
  async getOffer(offerId: number): Promise<OfferSummary | null> {
    const offer = await this.prisma.swapOffer.findUnique({
      where: { id: offerId },
    });
    
    if (!offer) {
      return null;
    }
    
    // Extract SOL amounts from offer for fee display
    const offeredSol = offer.offeredSolLamports ? BigInt(offer.offeredSolLamports) : BigInt(0);
    const requestedSol = offer.requestedSolLamports ? BigInt(offer.requestedSolLamports) : BigInt(0);
    const feeBreakdown = this.feeCalculator.calculateFee(offeredSol, requestedSol);
    
    return {
      id: offer.id,
      makerWallet: offer.makerWallet,
      takerWallet: offer.takerWallet || undefined,
      offerType: offer.offerType,
      status: offer.status,
      offeredAssets: offer.offeredAssets as any[],
      requestedAssets: offer.requestedAssets as any[],
      platformFee: feeBreakdown,
      nonceAccount: offer.nonceAccount,
      expiresAt: offer.expiresAt,
      createdAt: offer.createdAt,
      serializedTransaction: offer.serializedTransaction || undefined,
    };
  }
  
  /**
   * List offers with filtering
   */
  async listOffers(filters: {
    status?: OfferStatus;
    makerWallet?: string;
    takerWallet?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ offers: OfferSummary[]; total: number }> {
    const where: any = {};
    
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.makerWallet) {
      where.makerWallet = filters.makerWallet;
    }
    if (filters.takerWallet) {
      where.takerWallet = filters.takerWallet;
    }
    
    const [offers, total] = await Promise.all([
      this.prisma.swapOffer.findMany({
        where,
        take: filters.limit || 50,
        skip: filters.offset || 0,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.swapOffer.count({ where }),
    ]);
    
    const summaries: OfferSummary[] = offers.map((offer) => {
      // Extract SOL amounts from offer for fee display
      const offeredSol = offer.offeredSolLamports ? BigInt(offer.offeredSolLamports) : BigInt(0);
      const requestedSol = offer.requestedSolLamports ? BigInt(offer.requestedSolLamports) : BigInt(0);
      const feeBreakdown = this.feeCalculator.calculateFee(offeredSol, requestedSol);
      
      return {
        id: offer.id,
        makerWallet: offer.makerWallet,
        takerWallet: offer.takerWallet || undefined,
        offerType: offer.offerType,
        status: offer.status,
        offeredAssets: offer.offeredAssets as any[],
        requestedAssets: offer.requestedAssets as any[],
        platformFee: feeBreakdown,
        nonceAccount: offer.nonceAccount,
        expiresAt: offer.expiresAt,
        createdAt: offer.createdAt,
        serializedTransaction: offer.serializedTransaction || undefined,
      };
    });
    
    return { offers: summaries, total };
  }
  
  /**
   * Create a counter-offer for an existing offer
   */
  async createCounterOffer(params: {
    parentOfferId: number;
    counterMakerWallet: string;
  }): Promise<OfferSummary> {
    console.log('[OfferManager] Creating counter-offer:', {
      parentOfferId: params.parentOfferId,
      counterMaker: params.counterMakerWallet,
    });
    
    try {
      // 1. Load parent offer
      const parentOffer = await this.prisma.swapOffer.findUnique({
        where: { id: params.parentOfferId },
      });
      
      if (!parentOffer) {
        throw new Error(`Parent offer ${params.parentOfferId} not found`);
      }
      
      // 2. Validate parent offer is active
      if (parentOffer.status !== OfferStatus.ACTIVE) {
        throw new Error(`Parent offer is not active (status: ${parentOffer.status})`);
      }
      
      // 3. Check expiration
      if (parentOffer.expiresAt < new Date()) {
        throw new Error('Parent offer has expired');
      }
      
      // 4. Ensure counter-maker user exists
      await this.ensureUserExists(params.counterMakerWallet);
      
      // 5. Counter-offer swaps the roles: parent's taker becomes counter's maker
      // The assets are reversed: what parent maker offered, counter maker now requests
      const offeredAssets = parentOffer.requestedAssets as Array<{ type: AssetType; identifier: string }>;
      const requestedAssets = parentOffer.offeredAssets as Array<{ type: AssetType; identifier: string }>;
      
      // 6. Validate counter-maker owns the assets they're offering (which were parent's requested assets)
      const validation = await this.assetValidator.validateAssets(
        params.counterMakerWallet,
        offeredAssets
      );
      
      const invalidAssets = validation.filter((v) => !v.isValid);
      if (invalidAssets.length > 0) {
        throw new Error(
          `Counter-maker does not own required assets: ${invalidAssets.map((a) => a.error).join(', ')}`
        );
      }
      
      // 7. Reuse the parent's nonce account
      const nonceAccount = parentOffer.nonceAccount;
      
      // 8. Calculate fee (same logic as parent)
      // Note: SOL amounts would need to be extracted from JSONB if stored
      const offeredSol = BigInt(0); // TODO: Extract from offeredAssets JSONB if SOL is included
      const requestedSol = BigInt(0); // TODO: Extract from requestedAssets JSONB if SOL is included
      const feeBreakdown = this.feeCalculator.calculateFee(offeredSol, requestedSol);
      const platformFee = feeBreakdown.feeLamports;
      
      // 9. Build transaction for counter-offer
      // Counter-maker is the new maker, parent maker becomes the taker
      // Use parent offer ID with "c" prefix for counter-offers (e.g., "c88" for counter to offer 88)
      const counterOfferId = `c${params.parentOfferId}`;
      const buildResult = await this.buildOfferTransaction({
        offerId: parseInt(counterOfferId.replace('c', ''), 10), // Extract parent ID for now (will be replaced with actual counter-offer ID later)
        makerWallet: params.counterMakerWallet,
        takerWallet: parentOffer.makerWallet, // Original maker is now taker
        offeredAssets,
        offeredSol,
        requestedAssets,
        requestedSol,
        platformFee,
        nonceAccount,
      });
      
      // 10. Calculate expiration (same as parent's remaining time or 7 days, whichever is shorter)
      const remainingTime = parentOffer.expiresAt.getTime() - Date.now();
      const defaultExpiration = 7 * 24 * 60 * 60 * 1000; // 7 days
      const expirationMs = Math.min(remainingTime, defaultExpiration);
      const expiresAt = new Date(Date.now() + expirationMs);
      
      // 11. Save counter-offer to database
      const counterOffer = await this.prisma.swapOffer.create({
        data: {
          offerType: OfferType.COUNTER,
          status: OfferStatus.ACTIVE,
          makerWallet: params.counterMakerWallet,
          takerWallet: parentOffer.makerWallet,
          offeredAssets: offeredAssets as any,
          requestedAssets: requestedAssets as any,
          platformFeeLamports: platformFee,
          nonceAccount,
          currentNonceValue: buildResult.nonceValue,
          serializedTransaction: buildResult.serializedTransaction,
          parentOfferId: params.parentOfferId,
          expiresAt,
        },
      });
      
      console.log('[OfferManager] Counter-offer created:', {
        counterId: counterOffer.id,
        parentId: params.parentOfferId,
      });
      
      return {
        id: counterOffer.id,
        makerWallet: counterOffer.makerWallet,
        takerWallet: counterOffer.takerWallet || undefined,
        offerType: counterOffer.offerType,
        status: counterOffer.status,
        offeredAssets: counterOffer.offeredAssets as any[],
        requestedAssets: counterOffer.requestedAssets as any[],
        platformFee: feeBreakdown,
        nonceAccount: counterOffer.nonceAccount,
        expiresAt: counterOffer.expiresAt,
        createdAt: counterOffer.createdAt,
        serializedTransaction: counterOffer.serializedTransaction || undefined,
      };
    } catch (error) {
      console.error('[OfferManager] Error creating counter-offer:', error);
      throw error;
    }
  }
  
  /**
   * Update an existing offer (change SOL amounts or assets)
   * Only the maker can update their own offer, and only while it's ACTIVE
   * 
   * @param offerId - The offer to update
   * @param makerWallet - The maker's wallet (must match offer maker)
   * @param updates - The fields to update
   */
  async updateOffer(params: {
    offerId: number;
    makerWallet: string;
    offeredAssets?: Array<{ type: AssetType; identifier: string }>;
    requestedAssets?: Array<{ type: AssetType; identifier: string }>;
    offeredSol?: bigint;
    requestedSol?: bigint;
  }): Promise<OfferSummary> {
    console.log('[OfferManager] Updating offer:', {
      offerId: params.offerId,
      maker: params.makerWallet,
      hasOfferedAssets: !!params.offeredAssets,
      hasRequestedAssets: !!params.requestedAssets,
      hasOfferedSol: params.offeredSol !== undefined,
      hasRequestedSol: params.requestedSol !== undefined,
    });
    
    try {
      // 1. Load offer
      const offer = await this.prisma.swapOffer.findUnique({
        where: { id: params.offerId },
      });
      
      if (!offer) {
        throw new Error(`Offer ${params.offerId} not found`);
      }
      
      // 2. Verify maker authorization
      if (offer.makerWallet !== params.makerWallet) {
        throw new Error('Only the maker can update this offer');
      }
      
      // 3. Verify offer is updateable (only ACTIVE offers)
      if (offer.status !== OfferStatus.ACTIVE) {
        throw new Error(`Offer cannot be updated (status: ${offer.status})`);
      }
      
      // 4. Check expiration
      if (offer.expiresAt < new Date()) {
        await this.prisma.swapOffer.update({
          where: { id: params.offerId },
          data: { status: OfferStatus.EXPIRED },
        });
        throw new Error('Offer has expired');
      }
      
      // 5. Merge updates with existing values
      const currentOfferedAssets = offer.offeredAssets as Array<{ type: AssetType; identifier: string }>;
      const currentRequestedAssets = offer.requestedAssets as Array<{ type: AssetType; identifier: string }>;
      
      const newOfferedAssets = params.offeredAssets ?? currentOfferedAssets;
      const newRequestedAssets = params.requestedAssets ?? currentRequestedAssets;
      const newOfferedSol = params.offeredSol ?? (offer.offeredSolLamports ? BigInt(offer.offeredSolLamports) : BigInt(0));
      const newRequestedSol = params.requestedSol ?? (offer.requestedSolLamports ? BigInt(offer.requestedSolLamports) : BigInt(0));
      
      // 6. Validate new asset counts
      if (newOfferedAssets.length > MAX_ASSETS_PER_SIDE) {
        throw new Error(`Too many offered assets (${newOfferedAssets.length}). Maximum is ${MAX_ASSETS_PER_SIDE}`);
      }
      if (newRequestedAssets.length > MAX_ASSETS_PER_SIDE) {
        throw new Error(`Too many requested assets (${newRequestedAssets.length}). Maximum is ${MAX_ASSETS_PER_SIDE}`);
      }
      
      // 7. Validate offer still has value
      const hasOfferedValue = newOfferedAssets.length > 0 || newOfferedSol > BigInt(0);
      const hasRequestedValue = newRequestedAssets.length > 0 || newRequestedSol > BigInt(0);
      
      if (!hasOfferedValue) {
        throw new Error('Maker must offer at least one asset or SOL');
      }
      if (!hasRequestedValue) {
        throw new Error('Maker must request at least one asset or SOL');
      }
      
      // 8. Check for duplicate assets
      const offeredIdentifiers = newOfferedAssets.map(a => a.identifier.toLowerCase());
      const offeredDuplicates = offeredIdentifiers.filter((id, idx) => offeredIdentifiers.indexOf(id) !== idx);
      if (offeredDuplicates.length > 0) {
        throw new Error(`Duplicate assets in offered list: ${[...new Set(offeredDuplicates)].join(', ')}`);
      }
      
      const requestedIdentifiers = newRequestedAssets.map(a => a.identifier.toLowerCase());
      const requestedDuplicates = requestedIdentifiers.filter((id, idx) => requestedIdentifiers.indexOf(id) !== idx);
      if (requestedDuplicates.length > 0) {
        throw new Error(`Duplicate assets in requested list: ${[...new Set(requestedDuplicates)].join(', ')}`);
      }
      
      // 9. Validate maker owns any NEW offered assets
      if (params.offeredAssets) {
        const validation = await this.assetValidator.validateAssets(
          params.makerWallet,
          newOfferedAssets
        );
        
        const invalidAssets = validation.filter((v) => !v.isValid);
        if (invalidAssets.length > 0) {
          throw new Error(
            `Maker does not own the following assets: ${invalidAssets.map((a) => a.error).join(', ')}`
          );
        }
      }
      
      // 10. Recalculate platform fee
      const feeBreakdown = this.feeCalculator.calculateFee(newOfferedSol, newRequestedSol);
      
      // 11. Atomically update offer with status check to prevent race conditions
      // First, lock the offer and verify it's still ACTIVE before proceeding
      const updatedOffer = await this.prisma.$transaction(async (tx) => {
        // Re-verify offer is still ACTIVE (prevents race condition)
        const currentOffer = await tx.swapOffer.findUnique({
          where: { id: params.offerId },
        });
        
        if (!currentOffer || currentOffer.status !== OfferStatus.ACTIVE) {
          throw new Error(`Offer cannot be updated (status changed to: ${currentOffer?.status || 'deleted'})`);
        }
        
        // Advance nonce to invalidate any previously built transactions
        // This ensures any signed transaction with old terms cannot be executed
        await this.noncePoolManager.advanceNonce(offer.nonceAccount);
        
        // Get fresh nonce value
        const currentNonceValue = await this.noncePoolManager.getCurrentNonce(offer.nonceAccount);
        
        // Update offer in database (with status check in WHERE for extra safety)
        const result = await tx.swapOffer.updateMany({
          where: { 
            id: params.offerId,
            status: OfferStatus.ACTIVE, // Only update if still ACTIVE
          },
          data: {
            offeredAssets: newOfferedAssets as any,
            requestedAssets: newRequestedAssets as any,
            offeredSolLamports: newOfferedSol > BigInt(0) ? newOfferedSol : null,
            requestedSolLamports: newRequestedSol > BigInt(0) ? newRequestedSol : null,
            platformFeeLamports: feeBreakdown.feeLamports,
            currentNonceValue,
            serializedTransaction: null, // Clear any cached transaction
          },
        });
        
        if (result.count === 0) {
          throw new Error('Offer was modified by another request. Please retry.');
        }
        
        // Increment updateCount separately (updateMany doesn't support increment)
        await tx.swapOffer.update({
          where: { id: params.offerId },
          data: { updateCount: { increment: 1 } },
        });
        
        // Fetch and return the updated offer
        return tx.swapOffer.findUnique({
          where: { id: params.offerId },
        });
      });
      
      if (!updatedOffer) {
        throw new Error('Failed to update offer');
      }
      
      console.log('[OfferManager] Offer updated:', {
        offerId: params.offerId,
        updateCount: updatedOffer.updateCount,
      });
      
      return {
        id: updatedOffer.id,
        makerWallet: updatedOffer.makerWallet,
        takerWallet: updatedOffer.takerWallet || undefined,
        offerType: updatedOffer.offerType,
        status: updatedOffer.status,
        offeredAssets: updatedOffer.offeredAssets as any[],
        requestedAssets: updatedOffer.requestedAssets as any[],
        platformFee: feeBreakdown,
        nonceAccount: updatedOffer.nonceAccount,
        expiresAt: updatedOffer.expiresAt,
        createdAt: updatedOffer.createdAt,
        serializedTransaction: undefined,
      };
    } catch (error) {
      console.error('[OfferManager] Failed to update offer:', error);
      throw error;
    }
  }
  
  /**
   * Confirm that a swap was successfully executed on-chain
   */
  async confirmSwap(params: {
    offerId: number;
    signature: string;
  }): Promise<void> {
    console.log('[OfferManager] Confirming swap:', {
      offerId: params.offerId,
      signature: params.signature,
    });
    
    try {
      // 1. Load offer
      const offer = await this.prisma.swapOffer.findUnique({
        where: { id: params.offerId },
      });
      
      if (!offer) {
        throw new Error(`Offer ${params.offerId} not found`);
      }
      
      // 2. Verify transaction on-chain
      try {
        const confirmation = await this.connection.confirmTransaction(
          params.signature,
          'confirmed'
        );
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
      } catch (error) {
        throw new Error(
          `Failed to confirm transaction ${params.signature}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
      
      // 3. Update offer and related data in a transaction
      await this.prisma.$transaction(async (tx) => {
        // 3a. Mark offer as filled
        await tx.swapOffer.update({
          where: { id: params.offerId },
          data: {
            status: OfferStatus.FILLED,
            transactionSignature: params.signature,
            filledAt: new Date(),
          },
        });
        
        // 3b. Cancel ALL offers using the same nonce account (ACTIVE and ACCEPTED)
        // CRITICAL: ACCEPTED offers also have serialized transactions using this nonce
        await tx.swapOffer.updateMany({
          where: {
            nonceAccount: offer.nonceAccount,
            status: { in: [OfferStatus.ACTIVE, OfferStatus.ACCEPTED] },
            id: { not: params.offerId },
          },
          data: {
            status: OfferStatus.CANCELLED,
            cancelledAt: new Date(),
          },
        });
        
        // 3c. Update user swap statistics
        const makerWallet = offer.makerWallet;
        const takerWallet = offer.takerWallet;
        
        // Update maker stats
        await tx.user.update({
          where: { walletAddress: makerWallet },
          data: {
            totalSwapsCompleted: { increment: 1 },
          },
        });
        
        // Update taker stats if taker is known
        if (takerWallet) {
          await tx.user.update({
            where: { walletAddress: takerWallet },
            data: {
              totalSwapsCompleted: { increment: 1 },
              totalFeesPaidLamports: { increment: offer.platformFeeLamports },
            },
          });
        }
        
        // 3d. Create swap transaction record
        await tx.swapTransaction.create({
          data: {
            offerId: params.offerId,
            signature: params.signature,
            makerWallet,
            takerWallet: takerWallet || '',
            platformFeeCollectedLamports: offer.platformFeeLamports,
            totalValueLamports: BigInt(0), // TODO: Calculate from assets
            executedAt: new Date(),
          },
        });
      });
      
      console.log('[OfferManager] Swap confirmed successfully:', {
        offerId: params.offerId,
        signature: params.signature,
      });
    } catch (error) {
      console.error('[OfferManager] Error confirming swap:', error);
      throw error;
    }
  }
}

/**
 * Create offer manager instance
 */
export function createOfferManager(
  connection: Connection,
  prisma: PrismaClient,
  noncePoolManager: NoncePoolManager,
  feeCalculator: FeeCalculator,
  assetValidator: AssetValidator,
  transactionBuilder: TransactionBuilder,
  platformAuthority: Keypair,
  treasuryPDA: PublicKey,
  programId: PublicKey
): OfferManager {
  return new OfferManager(
    connection,
    prisma,
    noncePoolManager,
    feeCalculator,
    assetValidator,
    transactionBuilder,
    platformAuthority,
    treasuryPDA,
    programId
  );
}

