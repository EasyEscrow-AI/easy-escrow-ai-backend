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
    
    console.log('[OfferManager] Initialized');
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
      
      // 2. Validate maker's asset ownership
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
      
      // 3. Assign or get nonce account for maker
      const nonceAccount = await this.noncePoolManager.assignNonceToUser(input.makerWallet);
      
      // 4. Calculate platform fee
      const offeredSol = input.offeredSol || BigInt(0);
      const requestedSol = input.requestedSol || BigInt(0);
      const feeBreakdown = this.feeCalculator.calculateFee(offeredSol, requestedSol);
      const platformFee = input.customFee || feeBreakdown.feeLamports;
      
      // Validate custom fee if provided
      if (input.customFee && !this.feeCalculator.validateFee(input.customFee, offeredSol, requestedSol)) {
        throw new Error('Invalid custom fee');
      }
      
      // 5. Calculate expiration time
      const expiresAt = new Date(Date.now() + (input.expirationMs || 7 * 24 * 60 * 60 * 1000)); // 7 days default
      
      // 6. Get current nonce value (transaction will be built when offer is accepted)
      // NOTE: We don't build the transaction at create time because it needs BOTH
      // maker and taker signatures. The transaction is built when the offer is accepted.
      const currentNonceValue = await this.noncePoolManager.getCurrentNonce(nonceAccount);
      const serializedTransaction: string | undefined = undefined;
      
      // 7. Create offer in database
      const offer = await this.prisma.swapOffer.create({
        data: {
          makerWallet: input.makerWallet,
          takerWallet: input.takerWallet,
          offerType: OfferType.MAKER_OFFER,
          offeredAssets: input.offeredAssets as any,
          requestedAssets: input.requestedAssets as any,
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
  async acceptOffer(offerId: number, takerWallet: string): Promise<{ serializedTransaction: string }> {
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
      
      // 3. Ensure taker exists
      await this.ensureUserExists(takerWallet);
      
      // 4. Validate taker's asset ownership
      const requestedAssets = offer.requestedAssets as Array<{ type: AssetType; identifier: string }>;
      const takerAssetsValidation = await this.assetValidator.validateAssets(takerWallet, requestedAssets);
      
      const invalidAssets = takerAssetsValidation.filter((v) => !v.isValid);
      if (invalidAssets.length > 0) {
        throw new Error(
          `Taker does not own the following assets: ${invalidAssets.map((a) => a.error).join(', ')}`
        );
      }
      
      // 5. Calculate fee
      const offeredAssets = offer.offeredAssets as Array<{ type: AssetType; identifier: string }>;
      const offeredSol = BigInt(0); // TODO: Extract from offer
      const requestedSol = BigInt(0); // TODO: Extract from offer
      const feeBreakdown = this.feeCalculator.calculateFee(offeredSol, requestedSol);
      
      // 6. Build transaction
      const buildResult = await this.buildOfferTransaction({
        makerWallet: offer.makerWallet,
        takerWallet,
        offeredAssets,
        offeredSol,
        requestedAssets,
        requestedSol,
        platformFee: feeBreakdown.feeLamports,
        nonceAccount: offer.nonceAccount,
      });
      
      // 7. Offer remains ACTIVE until transaction is confirmed (then becomes FILLED)
      // No status update needed here - confirmSwap() will set it to FILLED
      console.log('[OfferManager] Offer accepted, transaction ready:', offerId);
      
      return {
        serializedTransaction: buildResult.serializedTransaction,
      };
    } catch (error) {
      console.error('[OfferManager] Failed to accept offer:', error);
      throw error;
    }
  }
  
  /**
   * Cancel an offer
   */
  async cancelOffer(offerId: number, walletAddress: string): Promise<void> {
    console.log('[OfferManager] Canceling offer:', { offerId, wallet: walletAddress });
    
    try {
      // 1. Load offer
      const offer = await this.prisma.swapOffer.findUnique({
        where: { id: offerId },
      });
      
      if (!offer) {
        throw new Error('Offer not found');
      }
      
      // 2. Verify only maker can cancel
      if (offer.makerWallet !== walletAddress) {
        throw new Error('Only the maker can cancel this offer');
      }
      
      // 3. Verify offer is cancelable (only ACTIVE offers can be cancelled)
      if (offer.status !== OfferStatus.ACTIVE) {
        throw new Error(`Offer cannot be cancelled (status: ${offer.status})`);
      }
      
      // 4. Advance nonce to invalidate any pending transactions
      await this.noncePoolManager.advanceNonce(offer.nonceAccount);
      
      // 5. Mark this offer and all others using the same nonce as cancelled
      await this.prisma.swapOffer.updateMany({
        where: {
          nonceAccount: offer.nonceAccount,
          status: OfferStatus.ACTIVE,
        },
        data: {
          status: OfferStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      
      console.log('[OfferManager] Offer cancelled:', offerId);
    } catch (error) {
      console.error('[OfferManager] Failed to cancel offer:', error);
      throw error;
    }
  }
  
  /**
   * Build transaction for an offer
   */
  private async buildOfferTransaction(params: {
    makerWallet: string;
    takerWallet: string;
    offeredAssets: Array<{ type: AssetType; identifier: string }>;
    offeredSol: bigint;
    requestedAssets: Array<{ type: AssetType; identifier: string }>;
    requestedSol: bigint;
    platformFee: bigint;
    nonceAccount: string;
  }): Promise<{ serializedTransaction: string; nonceValue: string }> {
    console.log('[OfferManager] buildOfferTransaction params:', {
      makerWallet: params.makerWallet,
      takerWallet: params.takerWallet,
      offeredAssets: JSON.stringify(params.offeredAssets),
      requestedAssets: JSON.stringify(params.requestedAssets),
      nonceAccount: params.nonceAccount,
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
      swapId: `swap-${Date.now()}`, // TODO: Generate proper swap ID
      treasuryPDA: this.treasuryPDA,
      programId: this.programId,
    };
    
    console.log('[OfferManager] TransactionBuildInputs makerAssets:', JSON.stringify(inputs.makerAssets));
    console.log('[OfferManager] TransactionBuildInputs takerAssets:', JSON.stringify(inputs.takerAssets));
    
    // Validate inputs
    this.transactionBuilder.validateInputs(inputs);
    
    // Build transaction
    const result = await this.transactionBuilder.buildSwapTransaction(inputs);
    
    return {
      serializedTransaction: result.serializedTransaction,
      nonceValue: result.nonceValue,
    };
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
    
    // Calculate fee for display
    const offeredSol = BigInt(0); // TODO: Extract from offer
    const requestedSol = BigInt(0); // TODO: Extract from offer
    const feeBreakdown = this.feeCalculator.calculateFee(offeredSol, requestedSol);
    
    return {
      id: offer.id,
      makerWallet: offer.makerWallet,
      offerType: offer.offerType,
      status: offer.status,
      offeredAssets: offer.offeredAssets as any[],
      requestedAssets: offer.requestedAssets as any[],
      platformFee: feeBreakdown,
      nonceAccount: offer.nonceAccount,
      expiresAt: offer.expiresAt,
      createdAt: offer.createdAt,
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
      const offeredSol = BigInt(0); // TODO: Extract from offer
      const requestedSol = BigInt(0); // TODO: Extract from offer
      const feeBreakdown = this.feeCalculator.calculateFee(offeredSol, requestedSol);
      
      return {
        id: offer.id,
        makerWallet: offer.makerWallet,
        offerType: offer.offerType,
        status: offer.status,
        offeredAssets: offer.offeredAssets as any[],
        requestedAssets: offer.requestedAssets as any[],
        platformFee: feeBreakdown,
        nonceAccount: offer.nonceAccount,
        expiresAt: offer.expiresAt,
        createdAt: offer.createdAt,
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
      const buildResult = await this.buildOfferTransaction({
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
        
        // 3b. Cancel all other active offers using the same nonce account
        await tx.swapOffer.updateMany({
          where: {
            nonceAccount: offer.nonceAccount,
            status: OfferStatus.ACTIVE,
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

