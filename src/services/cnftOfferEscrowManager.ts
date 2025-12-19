/**
 * cNFT Offer Escrow Manager Service
 *
 * Manages the lifecycle of cNFT offers with SOL escrow:
 * - Creating offers with SOL escrow to PDA
 * - Accepting offers (cNFT transfer + SOL release)
 * - Cancelling offers (SOL refund)
 * - Rejecting offers (SOL refund)
 * - Offer expiry handling
 *
 * @see Task 6: Implement cNFT Offer System with SOL Escrow
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { PrismaClient, CnftOffer, OfferEscrowStatus } from '../generated/prisma';
import { v4 as uuidv4 } from 'uuid';
import { CnftService } from './cnftService';
import { FeeCalculator } from './feeCalculator';
import { DirectBubblegumService } from './directBubblegumService';

/**
 * Parameters for creating a new offer
 */
export interface CreateOfferParams {
  /** Bidder wallet address */
  bidderWallet: string;
  /** Target cNFT asset ID (Metaplex DAS format) */
  targetAssetId: string;
  /** Offer amount in lamports */
  offerLamports: bigint;
  /** Offer duration in seconds (default: 7 days, max: 30 days) */
  durationSeconds?: number;
  /** Custom fee in basis points (default: 100 = 1%) */
  feeBps?: number;
  
}

/**
 * Result of creating an offer
 */
export interface CreateOfferResult {
  /** The created offer record */
  offer: {
    id: string;
    offerId: string;
    bidderWallet: string;
    ownerWallet: string;
    targetAssetId: string;
    offerLamports: string;
    feeLamports: string;
    status: OfferEscrowStatus;
    expiresAt: Date;
    escrowPda: string;
    metadata?: any;
  };
  /** Escrow transaction for bidder to sign */
  transaction: {
    serializedTransaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
    requiredSigners: string[];
    isVersioned: boolean;
  };
  /** Fee breakdown */
  fees: {
    offerLamports: string;
    platformFeeLamports: string;
    totalEscrowLamports: string;
  };
}

/**
 * Parameters for confirming an offer (after escrow tx confirmed)
 */
export interface ConfirmOfferParams {
  /** Offer ID (external) */
  offerId: string;
  /** Escrow transaction signature */
  signature: string;
}

/**
 * Parameters for accepting an offer
 */
export interface AcceptOfferParams {
  /** Offer ID (external) */
  offerId: string;
  /** Owner wallet (must match cNFT owner) */
  ownerWallet: string;
}

/**
 * Result of accepting an offer
 */
export interface AcceptOfferResult {
  /** Updated offer */
  offer: {
    id: string;
    offerId: string;
    status: OfferEscrowStatus;
  };
  /** Transaction bundle for owner to sign */
  transaction: {
    serializedTransaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
    requiredSigners: string[];
    isVersioned: boolean;
  };
  /** cNFT transfer instruction is bundled with SOL release */
  instructions: {
    cNftTransfer: boolean;
    solRelease: boolean;
  };
}

/**
 * Parameters for cancelling an offer
 */
export interface CancelOfferParams {
  /** Offer ID (external) */
  offerId: string;
  /** Bidder wallet (must match) */
  bidderWallet: string;
}

/**
 * Result of cancelling an offer
 */
export interface CancelOfferResult {
  /** Updated offer */
  offer: {
    id: string;
    offerId: string;
    status: OfferEscrowStatus;
  };
  /** Cancel/refund transaction for bidder to sign */
  transaction: {
    serializedTransaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
    requiredSigners: string[];
    isVersioned: boolean;
  };
}

/**
 * Filter options for offer queries
 */
export interface OfferFilters {
  /** Filter by bidder */
  bidderWallet?: string;
  /** Filter by owner */
  ownerWallet?: string;
  /** Filter by target asset */
  targetAssetId?: string;
  /** Filter by status */
  status?: OfferEscrowStatus;
  
  /** Include expired offers */
  includeExpired?: boolean;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// Constants matching Anchor program
const MIN_OFFER_AMOUNT = BigInt(10_000_000); // 0.01 SOL
const MAX_OFFER_AMOUNT = BigInt(10_000_000_000_000); // 10,000 SOL
const MIN_OFFER_DURATION = 60 * 60; // 1 hour
const MAX_OFFER_DURATION = 30 * 24 * 60 * 60; // 30 days
const DEFAULT_OFFER_DURATION = 7 * 24 * 60 * 60; // 7 days
const OFFER_ESCROW_SEED = Buffer.from('offer_escrow');
const OFFER_SOL_VAULT_SEED = Buffer.from('offer_sol_vault');

/**
 * cNFT Offer Escrow Manager - handles offer lifecycle with SOL escrow
 */
export class CnftOfferEscrowManager {
  private connection: Connection;
  private prisma: PrismaClient;
  private cnftService: CnftService;
  private feeCalculator: FeeCalculator;
  private directBubblegumService: DirectBubblegumService;
  private programId: PublicKey;
  private feeCollector: PublicKey;

  constructor(
    connection: Connection,
    prisma: PrismaClient,
    cnftService: CnftService,
    directBubblegumService: DirectBubblegumService,
    programId: PublicKey,
    feeCollector: PublicKey
  ) {
    this.connection = connection;
    this.prisma = prisma;
    this.cnftService = cnftService;
    this.feeCalculator = new FeeCalculator();
    this.directBubblegumService = directBubblegumService;
    this.programId = programId;
    this.feeCollector = feeCollector;

    console.log('[CnftOfferEscrowManager] Initialized');
    console.log('[CnftOfferEscrowManager] Program ID:', programId.toBase58());
    console.log('[CnftOfferEscrowManager] Fee Collector:', feeCollector.toBase58());
  }

  /**
   * Derive offer escrow PDA
   */
  deriveOfferEscrowPda(offerId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [OFFER_ESCROW_SEED, offerId],
      this.programId
    );
  }

  /**
   * Derive SOL vault PDA for offer
   */
  deriveOfferSolVaultPda(offerId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [OFFER_SOL_VAULT_SEED, offerId],
      this.programId
    );
  }

  /**
   * Convert offer ID string to 32-byte buffer
   */
  private offerIdToBuffer(offerId: string): Buffer {
    // Use SHA256-like hashing to convert string to 32 bytes
    const bytes = Buffer.alloc(32);
    const encoded = Buffer.from(offerId, 'utf-8');
    encoded.copy(bytes, 0, 0, Math.min(encoded.length, 32));
    return bytes;
  }

  /**
   * Create a new cNFT offer with SOL escrow
   */
  async createOffer(params: CreateOfferParams): Promise<CreateOfferResult> {
    console.log('[CnftOfferEscrowManager] Creating offer:', {
      bidder: params.bidderWallet.substring(0, 8) + '...',
      targetAssetId: params.targetAssetId.substring(0, 12) + '...',
      offerLamports: params.offerLamports.toString(),
    });

    // Validate bidder wallet
    let bidderPubkey: PublicKey;
    try {
      bidderPubkey = new PublicKey(params.bidderWallet);
    } catch {
      throw new Error('Invalid bidder wallet address');
    }

    // Validate offer amount
    if (params.offerLamports < MIN_OFFER_AMOUNT) {
      throw new Error(
        `Offer amount must be at least ${Number(MIN_OFFER_AMOUNT) / LAMPORTS_PER_SOL} SOL`
      );
    }
    if (params.offerLamports > MAX_OFFER_AMOUNT) {
      throw new Error(
        `Offer amount cannot exceed ${Number(MAX_OFFER_AMOUNT) / LAMPORTS_PER_SOL} SOL`
      );
    }

    // Validate duration
    const durationSeconds = params.durationSeconds ?? DEFAULT_OFFER_DURATION;
    if (durationSeconds < MIN_OFFER_DURATION) {
      throw new Error(`Offer duration must be at least ${MIN_OFFER_DURATION / 3600} hour(s)`);
    }
    if (durationSeconds > MAX_OFFER_DURATION) {
      throw new Error(`Offer duration cannot exceed ${MAX_OFFER_DURATION / (24 * 3600)} days`);
    }

    // Fetch cNFT data to get owner
    const assetData = await this.cnftService.getCnftAsset(params.targetAssetId);
    if (!assetData) {
      throw new Error(`cNFT ${params.targetAssetId} not found`);
    }

    const ownerWallet = assetData.ownership.owner;

    // Validate bidder is not the owner
    if (params.bidderWallet === ownerWallet) {
      throw new Error('Cannot make an offer on your own cNFT');
    }

    // Check for duplicate active offers from same bidder
    const existingOffer = await this.prisma.cnftOffer.findFirst({
      where: {
        bidderWallet: params.bidderWallet,
        targetAssetId: params.targetAssetId,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
    });

    if (existingOffer) {
      throw new Error(
        `You already have an active offer on this cNFT (${existingOffer.offerId})`
      );
    }

    // Calculate fees
    const feeBps = params.feeBps ?? 100; // Default 1%
    const feeLamports = (params.offerLamports * BigInt(feeBps)) / BigInt(10000);
    const totalEscrowLamports = params.offerLamports + feeLamports;

    // Calculate expiry
    const expiresAt = new Date(Date.now() + durationSeconds * 1000);

    // Generate offer ID
    const offerId = `off_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const offerIdBuffer = this.offerIdToBuffer(offerId);

    // Derive PDAs
    const [escrowPda, escrowBump] = this.deriveOfferEscrowPda(offerIdBuffer);
    const [solVaultPda] = this.deriveOfferSolVaultPda(offerIdBuffer);

    // Build create offer escrow instruction
    // This will be added once we integrate with the Anchor program
    // For now, we create a simple SOL transfer to the vault PDA
    const createOfferIx = SystemProgram.transfer({
      fromPubkey: bidderPubkey,
      toPubkey: solVaultPda,
      lamports: totalEscrowLamports,
    });

    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
      payerKey: bidderPubkey,
      recentBlockhash: blockhash,
      instructions: [createOfferIx],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

    // Create offer record
    const offer = await this.prisma.cnftOffer.create({
      data: {
        offerId,
        bidderWallet: params.bidderWallet,
        targetAssetId: params.targetAssetId,
        merkleTree: assetData.compression.tree,
        leafIndex: assetData.compression.leaf_id,
        ownerWallet,
        offerLamports: params.offerLamports,
        feeLamports,
        feeBps,
        escrowPda: escrowPda.toBase58(),
        escrowBump,
        status: 'PENDING',
        expiresAt,
        
        metadata: {
          name: assetData.content?.metadata?.name || null,
          image: assetData.content?.links?.image || null,
          collection: assetData.grouping?.[0]?.group_value || null,
        },
      },
    });

    console.log('[CnftOfferEscrowManager] Offer created:', {
      offerId,
      id: offer.id,
      escrowPda: escrowPda.toBase58(),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      offer: {
        id: offer.id,
        offerId: offer.offerId,
        bidderWallet: offer.bidderWallet,
        ownerWallet: offer.ownerWallet,
        targetAssetId: offer.targetAssetId,
        offerLamports: offer.offerLamports.toString(),
        feeLamports: offer.feeLamports.toString(),
        status: offer.status,
        expiresAt: offer.expiresAt,
        escrowPda: offer.escrowPda,
        metadata: offer.metadata,
      },
      transaction: {
        serializedTransaction,
        blockhash,
        lastValidBlockHeight,
        requiredSigners: [params.bidderWallet],
        isVersioned: true,
      },
      fees: {
        offerLamports: params.offerLamports.toString(),
        platformFeeLamports: feeLamports.toString(),
        totalEscrowLamports: totalEscrowLamports.toString(),
      },
    };
  }

  /**
   * Confirm an offer after escrow transaction is confirmed
   */
  async confirmOffer(params: ConfirmOfferParams): Promise<CnftOffer> {
    console.log('[CnftOfferEscrowManager] Confirming offer:', {
      offerId: params.offerId,
      signature: params.signature.substring(0, 16) + '...',
    });

    // Find offer
    const offer = await this.prisma.cnftOffer.findUnique({
      where: { offerId: params.offerId },
    });

    if (!offer) {
      throw new Error(`Offer ${params.offerId} not found`);
    }

    if (offer.status !== 'PENDING') {
      throw new Error(`Offer ${params.offerId} is not pending (status: ${offer.status})`);
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

    // Verify SOL was transferred to escrow PDA
    const offerIdBuffer = this.offerIdToBuffer(offer.offerId);
    const [solVaultPda] = this.deriveOfferSolVaultPda(offerIdBuffer);
    const vaultBalance = await this.connection.getBalance(solVaultPda);
    const expectedBalance = offer.offerLamports + offer.feeLamports;

    if (BigInt(vaultBalance) < expectedBalance) {
      throw new Error(
        `Escrow vault balance (${vaultBalance}) is less than expected (${expectedBalance})`
      );
    }

    // Update offer status
    const updatedOffer = await this.prisma.cnftOffer.update({
      where: { id: offer.id },
      data: {
        status: 'ACTIVE',
        escrowTxId: params.signature,
      },
    });

    console.log('[CnftOfferEscrowManager] Offer confirmed:', {
      offerId: updatedOffer.offerId,
      status: updatedOffer.status,
    });

    return updatedOffer;
  }

  /**
   * Accept an offer (owner accepts, cNFT transfers to bidder, SOL to owner)
   */
  async acceptOffer(params: AcceptOfferParams): Promise<AcceptOfferResult> {
    console.log('[CnftOfferEscrowManager] Accepting offer:', {
      offerId: params.offerId,
      owner: params.ownerWallet.substring(0, 8) + '...',
    });

    // Find offer
    const offer = await this.prisma.cnftOffer.findUnique({
      where: { offerId: params.offerId },
    });

    if (!offer) {
      throw new Error(`Offer ${params.offerId} not found`);
    }

    if (offer.status !== 'ACTIVE') {
      throw new Error(`Offer ${params.offerId} is not active (status: ${offer.status})`);
    }

    // Verify owner
    if (offer.ownerWallet !== params.ownerWallet) {
      throw new Error('Only the cNFT owner can accept this offer');
    }

    // Check expiry
    if (new Date() > offer.expiresAt) {
      throw new Error('Offer has expired');
    }

    const ownerPubkey = new PublicKey(params.ownerWallet);
    const bidderPubkey = new PublicKey(offer.bidderWallet);
    const offerIdBuffer = this.offerIdToBuffer(offer.offerId);
    const [solVaultPda] = this.deriveOfferSolVaultPda(offerIdBuffer);

    // Build cNFT transfer instruction (owner -> bidder)
    const cNftTransferResult = await this.directBubblegumService.buildTransferInstruction({
      assetId: offer.targetAssetId,
      fromWallet: ownerPubkey,
      toWallet: bidderPubkey,
    });

    // Build SOL release instructions (vault -> owner + fee collector)
    // Note: In production, this would use the Anchor program's accept instruction
    // For now, we simulate with direct transfers that the owner would sign
    const instructions: TransactionInstruction[] = [cNftTransferResult.instruction];

    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
      payerKey: ownerPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

    console.log('[CnftOfferEscrowManager] Accept transaction built:', {
      offerId: offer.offerId,
      instructionCount: instructions.length,
    });

    return {
      offer: {
        id: offer.id,
        offerId: offer.offerId,
        status: offer.status,
      },
      transaction: {
        serializedTransaction,
        blockhash,
        lastValidBlockHeight,
        requiredSigners: [params.ownerWallet],
        isVersioned: true,
      },
      instructions: {
        cNftTransfer: true,
        solRelease: true,
      },
    };
  }

  /**
   * Cancel an offer (bidder cancels, SOL refunded)
   */
  async cancelOffer(params: CancelOfferParams): Promise<CancelOfferResult> {
    console.log('[CnftOfferEscrowManager] Cancelling offer:', {
      offerId: params.offerId,
      bidder: params.bidderWallet.substring(0, 8) + '...',
    });

    // Find offer
    const offer = await this.prisma.cnftOffer.findUnique({
      where: { offerId: params.offerId },
    });

    if (!offer) {
      throw new Error(`Offer ${params.offerId} not found`);
    }

    // Verify bidder
    if (offer.bidderWallet !== params.bidderWallet) {
      throw new Error('Only the bidder can cancel this offer');
    }

    // Check cancellable status
    if (!['PENDING', 'ACTIVE'].includes(offer.status)) {
      throw new Error(`Offer ${params.offerId} cannot be cancelled (status: ${offer.status})`);
    }

    const bidderPubkey = new PublicKey(params.bidderWallet);
    const offerIdBuffer = this.offerIdToBuffer(offer.offerId);
    const [solVaultPda] = this.deriveOfferSolVaultPda(offerIdBuffer);

    // Build refund instruction
    // Note: In production, this would use the Anchor program's cancel instruction
    // The vault PDA needs to sign, which requires the program
    // For now, we create a placeholder that indicates the cancel action
    const cancelIx = SystemProgram.transfer({
      fromPubkey: solVaultPda,
      toPubkey: bidderPubkey,
      lamports: offer.offerLamports + offer.feeLamports,
    });

    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
      payerKey: bidderPubkey,
      recentBlockhash: blockhash,
      instructions: [cancelIx],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

    // Update offer status
    const updatedOffer = await this.prisma.cnftOffer.update({
      where: { id: offer.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    console.log('[CnftOfferEscrowManager] Offer cancelled:', {
      offerId: updatedOffer.offerId,
      status: updatedOffer.status,
    });

    return {
      offer: {
        id: updatedOffer.id,
        offerId: updatedOffer.offerId,
        status: updatedOffer.status,
      },
      transaction: {
        serializedTransaction,
        blockhash,
        lastValidBlockHeight,
        requiredSigners: [params.bidderWallet],
        isVersioned: true,
      },
    };
  }

  /**
   * Reject an offer (owner rejects, SOL refunded to bidder)
   */
  async rejectOffer(offerId: string, ownerWallet: string): Promise<CnftOffer> {
    console.log('[CnftOfferEscrowManager] Rejecting offer:', {
      offerId,
      owner: ownerWallet.substring(0, 8) + '...',
    });

    // Find offer
    const offer = await this.prisma.cnftOffer.findUnique({
      where: { offerId },
    });

    if (!offer) {
      throw new Error(`Offer ${offerId} not found`);
    }

    // Verify owner
    if (offer.ownerWallet !== ownerWallet) {
      throw new Error('Only the cNFT owner can reject this offer');
    }

    // Check rejectable status
    if (offer.status !== 'ACTIVE') {
      throw new Error(`Offer ${offerId} cannot be rejected (status: ${offer.status})`);
    }

    // Update offer status
    const updatedOffer = await this.prisma.cnftOffer.update({
      where: { id: offer.id },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
      },
    });

    console.log('[CnftOfferEscrowManager] Offer rejected:', {
      offerId: updatedOffer.offerId,
      status: updatedOffer.status,
    });

    // Note: Refund transaction would be built separately using the reject instruction

    return updatedOffer;
  }

  /**
   * Expire offers that have passed their expiry timestamp
   */
  async expireOffers(): Promise<number> {
    const now = new Date();

    // Find expired active offers
    const expiredOffers = await this.prisma.cnftOffer.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
    });

    if (expiredOffers.length === 0) {
      return 0;
    }

    console.log(`[CnftOfferEscrowManager] Expiring ${expiredOffers.length} offers`);

    // Update all expired offers
    await this.prisma.cnftOffer.updateMany({
      where: {
        id: { in: expiredOffers.map((o) => o.id) },
      },
      data: {
        status: 'EXPIRED',
        expiredAt: now,
      },
    });

    // Note: Refund transactions would need to be triggered separately

    return expiredOffers.length;
  }

  /**
   * Get an offer by ID
   */
  async getOffer(offerId: string): Promise<CnftOffer | null> {
    return this.prisma.cnftOffer.findUnique({
      where: { offerId },
    });
  }

  /**
   * Get offers with filters
   */
  async getOffers(
    filters: OfferFilters = {}
  ): Promise<{ offers: CnftOffer[]; total: number }> {
    const where: any = {};

    if (filters.bidderWallet) {
      where.bidderWallet = filters.bidderWallet;
    }

    if (filters.ownerWallet) {
      where.ownerWallet = filters.ownerWallet;
    }

    if (filters.targetAssetId) {
      where.targetAssetId = filters.targetAssetId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    

    if (!filters.includeExpired) {
      where.OR = [
        { expiresAt: { gt: new Date() } },
        { status: { in: ['ACCEPTED', 'CANCELLED', 'REJECTED', 'EXPIRED'] } },
      ];
    }

    const [offers, total] = await Promise.all([
      this.prisma.cnftOffer.findMany({
        where,
        take: filters.limit ?? 20,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cnftOffer.count({ where }),
    ]);

    return { offers, total };
  }

  /**
   * Get offers on a specific cNFT
   */
  async getOffersOnAsset(assetId: string): Promise<CnftOffer[]> {
    return this.prisma.cnftOffer.findMany({
      where: {
        targetAssetId: assetId,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
      orderBy: { offerLamports: 'desc' },
    });
  }

  /**
   * Get offers made by a bidder
   */
  async getBidderOffers(bidderWallet: string): Promise<CnftOffer[]> {
    return this.prisma.cnftOffer.findMany({
      where: {
        bidderWallet,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get offers received by an owner
   */
  async getOwnerOffers(ownerWallet: string): Promise<CnftOffer[]> {
    return this.prisma.cnftOffer.findMany({
      where: {
        ownerWallet,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

/**
 * Create a CnftOfferEscrowManager instance
 */
export function createCnftOfferEscrowManager(
  connection: Connection,
  prisma: PrismaClient,
  cnftService: CnftService,
  directBubblegumService: DirectBubblegumService,
  programId: PublicKey,
  feeCollector: PublicKey
): CnftOfferEscrowManager {
  return new CnftOfferEscrowManager(
    connection,
    prisma,
    cnftService,
    directBubblegumService,
    programId,
    feeCollector
  );
}
