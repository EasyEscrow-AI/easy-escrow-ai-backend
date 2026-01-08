/**
 * DataSales Manager Service
 *
 * Settlement layer for DataSales.ai - manages the lifecycle of digital asset escrow:
 * - Creating agreements with S3 bucket + SOL escrow PDA
 * - Seller uploads (presigned URLs)
 * - Buyer deposits (SOL to PDA)
 * - DataSales verification (approve/reject)
 * - Settlement execution
 * - Access control for downloads
 *
 * @see DataSales Settlement Layer Implementation Plan
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PrismaClient, DataSalesAgreement, DataSalesStatus } from '../generated/prisma';
import { v4 as uuidv4 } from 'uuid';
import { S3Service, PresignedUrl, FileUploadRequest } from './s3Service';
import { FeeCalculator } from './feeCalculator';
import { logger } from './logger.service';
import {
  DataSalesProgramService,
  getDataSalesProgramService,
} from './datasales-program.service';

// ============================================
// Types
// ============================================

/**
 * Input for creating a new DataSales agreement
 */
export interface CreateAgreementInput {
  /** Seller wallet address */
  sellerWallet: string;
  /** Buyer wallet address (optional for open listings) */
  buyerWallet?: string;
  /** Price in lamports */
  priceLamports: bigint;
  /** Platform fee in basis points (default: 250 = 2.5%) */
  platformFeeBps?: number;
  /** Deposit window duration in hours (default: 72 = 3 days) */
  depositWindowHours?: number;
  /** Access duration in hours after settlement (default: 168 = 7 days) */
  accessDurationHours?: number;
  /** Initial files to generate upload URLs for */
  files?: FileUploadRequest[];
}

/**
 * Result of creating an agreement
 */
export interface CreateAgreementResult {
  agreement: {
    id: string;
    agreementId: string;
    sellerWallet: string;
    buyerWallet: string | null;
    priceLamports: string;
    platformFeeLamports: string;
    status: DataSalesStatus;
    depositWindowEndsAt: Date;
    accessDurationHours: number;
    s3BucketName: string;
  };
  /** Presigned upload URLs for seller */
  uploadUrls: PresignedUrl[];
  /** Payment details for buyer */
  payment: {
    priceLamports: string;
    platformFeeLamports: string;
    totalLamports: string;
    solVaultPda: string;
  };
}

/**
 * File metadata for confirming upload
 */
export interface UploadedFile {
  key: string;
  name: string;
  size: number;
  contentType: string;
  sha256: string;
}

/**
 * File with read URL for DataSales verification
 */
export interface FileWithReadUrl {
  key: string;
  name: string;
  size: number;
  contentType: string;
  sha256: string;
  downloadUrl: string;
  downloadUrlExpiresAt: Date;
}

/**
 * Result of settlement
 */
export interface SettleResult {
  agreement: {
    id: string;
    agreementId: string;
    status: DataSalesStatus;
    settledAt: Date;
    accessExpiresAt: Date;
  };
  /** Download URLs for buyer */
  downloadUrls: PresignedUrl[];
  /** Settlement transaction signature */
  settleTxSignature: string;
}

// ============================================
// Service Implementation
// ============================================

export class DataSalesManager {
  private prisma: PrismaClient;
  private s3Service: S3Service;
  private connection: Connection;
  private feeCalculator: FeeCalculator;
  private programService: DataSalesProgramService;

  constructor(
    prisma: PrismaClient,
    connection: Connection,
    s3Service?: S3Service,
    feeCalculator?: FeeCalculator,
    programService?: DataSalesProgramService
  ) {
    this.prisma = prisma;
    this.connection = connection;
    this.s3Service = s3Service || S3Service.getInstance();
    this.feeCalculator = feeCalculator || new FeeCalculator();
    this.programService = programService || getDataSalesProgramService();
  }

  // ============================================
  // Agreement Lifecycle
  // ============================================

  /**
   * Create a new DataSales agreement
   */
  async createAgreement(input: CreateAgreementInput): Promise<CreateAgreementResult> {
    const agreementId = uuidv4();
    const {
      sellerWallet,
      buyerWallet,
      priceLamports,
      platformFeeBps = 250,
      depositWindowHours = 72,
      accessDurationHours = 168,
      files = [],
    } = input;

    // Validate inputs
    if (!sellerWallet) {
      throw new Error('Seller wallet is required');
    }
    if (priceLamports <= 0n) {
      throw new Error('Price must be greater than 0');
    }

    // Calculate platform fee
    const platformFeeLamports = (priceLamports * BigInt(platformFeeBps)) / 10000n;

    // Generate bucket name
    const s3BucketName = this.s3Service.generateBucketName(agreementId);

    // Calculate deposit window end time
    const depositWindowEndsAt = new Date(Date.now() + depositWindowHours * 60 * 60 * 1000);

    // Derive PDA addresses (placeholder - will be implemented with Solana program)
    const escrowPda = this.deriveEscrowPda(agreementId);
    const solVaultPda = this.deriveSolVaultPda(agreementId);

    // Create S3 bucket
    await this.s3Service.createBucket(s3BucketName);

    // Generate upload URLs if files specified
    let uploadUrls: PresignedUrl[] = [];
    if (files.length > 0) {
      uploadUrls = await this.s3Service.generateUploadUrls(s3BucketName, files);
    }

    // Create database record
    const agreement = await this.prisma.dataSalesAgreement.create({
      data: {
        agreementId,
        sellerWallet,
        buyerWallet: buyerWallet || null,
        priceLamports,
        platformFeeLamports,
        platformFeeBps,
        depositWindowEndsAt,
        accessDurationHours,
        s3BucketName,
        s3Region: process.env.AWS_S3_REGION || 'us-east-1',
        escrowPda,
        solVaultPda,
        status: DataSalesStatus.PENDING_DEPOSITS,
      },
    });

    logger.info(`DataSales agreement created: ${agreementId}`, {
      sellerWallet,
      buyerWallet,
      priceLamports: priceLamports.toString(),
      s3BucketName,
    });

    return {
      agreement: {
        id: agreement.id,
        agreementId: agreement.agreementId,
        sellerWallet: agreement.sellerWallet,
        buyerWallet: agreement.buyerWallet,
        priceLamports: agreement.priceLamports.toString(),
        platformFeeLamports: agreement.platformFeeLamports.toString(),
        status: agreement.status,
        depositWindowEndsAt: agreement.depositWindowEndsAt,
        accessDurationHours: agreement.accessDurationHours,
        s3BucketName: agreement.s3BucketName,
      },
      uploadUrls,
      payment: {
        priceLamports: priceLamports.toString(),
        platformFeeLamports: platformFeeLamports.toString(),
        totalLamports: (priceLamports + platformFeeLamports).toString(),
        solVaultPda,
      },
    };
  }

  /**
   * Get agreement by ID
   */
  async getAgreement(agreementId: string): Promise<DataSalesAgreement | null> {
    return this.prisma.dataSalesAgreement.findUnique({
      where: { agreementId },
    });
  }

  /**
   * Cancel an agreement (refund SOL if buyer deposited, delete S3 bucket)
   */
  async cancelAgreement(agreementId: string): Promise<void> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // Can only cancel if not already settled/archived
    if (
      agreement.status === DataSalesStatus.SETTLED ||
      agreement.status === DataSalesStatus.ARCHIVED
    ) {
      throw new Error(`Cannot cancel agreement in status: ${agreement.status}`);
    }

    // Execute on-chain cancellation (refunds SOL if buyer deposited)
    if (agreement.buyerDepositedAt && agreement.buyerWallet) {
      logger.info(`Executing on-chain cancellation with refund for agreement: ${agreementId}`);
      const cancelTx = await this.programService.buildCancelTransaction({
        agreementId,
        buyerWallet: agreement.buyerWallet,
      });
      await this.programService.sendAndConfirmTransaction(cancelTx.serializedTransaction);
    } else {
      // If no buyer deposit, just cancel on-chain state
      const cancelTx = await this.programService.buildCancelTransaction({ agreementId });
      await this.programService.sendAndConfirmTransaction(cancelTx.serializedTransaction);
    }

    // Delete S3 bucket
    try {
      await this.s3Service.deleteBucket(agreement.s3BucketName);
    } catch (error) {
      logger.warn(`Failed to delete S3 bucket for cancelled agreement: ${agreementId}`, { error });
    }

    // Update status
    await this.prisma.dataSalesAgreement.update({
      where: { agreementId },
      data: {
        status: DataSalesStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    logger.info(`DataSales agreement cancelled: ${agreementId}`);
  }

  // ============================================
  // Seller Actions
  // ============================================

  /**
   * Get presigned upload URLs for seller
   */
  async getUploadUrls(agreementId: string, files: FileUploadRequest[]): Promise<PresignedUrl[]> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // Check if deposit window is still open
    if (new Date() > agreement.depositWindowEndsAt) {
      throw new Error('Deposit window has closed');
    }

    // Check status allows upload
    const uploadAllowedStatuses: DataSalesStatus[] = [
      DataSalesStatus.PENDING_DEPOSITS,
      DataSalesStatus.SOL_LOCKED,
      DataSalesStatus.BOTH_LOCKED,
    ];
    if (!uploadAllowedStatuses.includes(agreement.status)) {
      throw new Error(`Cannot upload files in status: ${agreement.status}`);
    }

    return this.s3Service.generateUploadUrls(agreement.s3BucketName, files);
  }

  /**
   * Confirm that seller has uploaded files
   */
  async confirmUpload(agreementId: string, files: UploadedFile[]): Promise<void> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // Verify files exist in S3
    const s3Objects = await this.s3Service.listObjects(agreement.s3BucketName);
    const uploadedKeys = new Set(s3Objects.map((obj) => obj.key));

    for (const file of files) {
      if (!uploadedKeys.has(file.key)) {
        throw new Error(`File not found in S3: ${file.key}`);
      }
    }

    // Calculate total size
    const totalSizeBytes = files.reduce((sum, f) => sum + BigInt(f.size), 0n);

    // Determine new status
    let newStatus = agreement.status;
    if (agreement.status === DataSalesStatus.PENDING_DEPOSITS) {
      newStatus = DataSalesStatus.DATA_LOCKED;
    } else if (agreement.status === DataSalesStatus.SOL_LOCKED) {
      newStatus = DataSalesStatus.BOTH_LOCKED;
    }

    // Update agreement
    await this.prisma.dataSalesAgreement.update({
      where: { agreementId },
      data: {
        files: files as any,
        totalSizeBytes,
        sellerDepositedAt: new Date(),
        status: newStatus,
        // Clear rejection if re-uploading after rejection
        rejectionReason: null,
      },
    });

    logger.info(`Seller upload confirmed for agreement: ${agreementId}`, {
      fileCount: files.length,
      totalSizeBytes: totalSizeBytes.toString(),
      newStatus,
    });
  }

  // ============================================
  // Buyer Actions
  // ============================================

  /**
   * Build SOL deposit transaction for buyer
   */
  async buildDepositTransaction(
    agreementId: string,
    buyerWallet: string
  ): Promise<{
    serializedTransaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
  }> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // Check if buyer is allowed (for specific buyer listings)
    if (agreement.buyerWallet && agreement.buyerWallet !== buyerWallet) {
      throw new Error('This listing is reserved for a specific buyer');
    }

    // Check if deposit window is still open
    if (new Date() > agreement.depositWindowEndsAt) {
      throw new Error('Deposit window has closed');
    }

    // Check status allows deposit
    const depositAllowedStatuses: DataSalesStatus[] = [
      DataSalesStatus.PENDING_DEPOSITS,
      DataSalesStatus.DATA_LOCKED,
    ];
    if (!depositAllowedStatuses.includes(agreement.status)) {
      throw new Error(`Cannot deposit SOL in status: ${agreement.status}`);
    }

    // Build deposit transaction using program service
    const result = await this.programService.buildDepositSolTransaction({
      agreementId,
      buyerWallet,
    });

    // Get blockhash info
    const blockhash = await this.connection.getLatestBlockhash();

    logger.info(`Built deposit transaction for agreement: ${agreementId}`, {
      buyerWallet,
      amount: (agreement.priceLamports + agreement.platformFeeLamports).toString(),
      escrowPda: result.escrowPda,
    });

    return {
      serializedTransaction: result.serializedTransaction,
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    };
  }

  /**
   * Confirm buyer's SOL deposit
   */
  async confirmDeposit(agreementId: string, txSignature: string): Promise<void> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // TODO: Verify transaction on-chain

    // Determine new status
    let newStatus = agreement.status;
    if (agreement.status === DataSalesStatus.PENDING_DEPOSITS) {
      newStatus = DataSalesStatus.SOL_LOCKED;
    } else if (agreement.status === DataSalesStatus.DATA_LOCKED) {
      newStatus = DataSalesStatus.BOTH_LOCKED;
    }

    // Update agreement
    await this.prisma.dataSalesAgreement.update({
      where: { agreementId },
      data: {
        buyerDepositedAt: new Date(),
        buyerDepositTxId: txSignature,
        status: newStatus,
      },
    });

    logger.info(`Buyer deposit confirmed for agreement: ${agreementId}`, {
      txSignature,
      newStatus,
    });
  }

  /**
   * Get download URLs for buyer (only after settlement)
   */
  async getDownloadUrls(agreementId: string, buyerWallet: string): Promise<PresignedUrl[]> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // Verify buyer
    if (agreement.buyerWallet && agreement.buyerWallet !== buyerWallet) {
      throw new Error('Not authorized to access this agreement');
    }

    // Check status
    if (agreement.status !== DataSalesStatus.SETTLED) {
      throw new Error('Agreement has not been settled yet');
    }

    // Check access expiry
    if (agreement.accessExpiresAt && new Date() > agreement.accessExpiresAt) {
      throw new Error('Access period has expired');
    }

    // Get file keys
    const files = (agreement.files as unknown as UploadedFile[]) || [];
    const keys = files.map((f) => f.key);

    // Calculate remaining access time
    const remainingSeconds = agreement.accessExpiresAt
      ? Math.floor((agreement.accessExpiresAt.getTime() - Date.now()) / 1000)
      : 86400; // Default 24 hours

    // Generate download URLs (limited to remaining access time)
    const expiresIn = Math.min(remainingSeconds, 86400); // Max 24 hours per URL
    return this.s3Service.generateDownloadUrls(agreement.s3BucketName, keys, expiresIn);
  }

  // ============================================
  // DataSales Verification
  // ============================================

  /**
   * Get files with read URLs for DataSales verification
   */
  async getFilesForVerification(agreementId: string): Promise<FileWithReadUrl[]> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    const files = (agreement.files as unknown as UploadedFile[]) || [];
    if (files.length === 0) {
      return [];
    }

    // Generate download URLs for verification (1 hour expiry)
    const keys = files.map((f) => f.key);
    const urls = await this.s3Service.generateDownloadUrls(agreement.s3BucketName, keys, 3600);

    // Map URLs to files
    const urlMap = new Map(urls.map((u) => [u.key, u]));

    return files.map((file) => {
      const url = urlMap.get(file.key);
      return {
        ...file,
        downloadUrl: url?.url || '',
        downloadUrlExpiresAt: url?.expiresAt || new Date(),
      };
    });
  }

  /**
   * Approve data quality (DataSales only)
   */
  async approve(agreementId: string, verifierAddress: string): Promise<void> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // Must be in BOTH_LOCKED status
    if (agreement.status !== DataSalesStatus.BOTH_LOCKED) {
      throw new Error(`Cannot approve in status: ${agreement.status}. Must be BOTH_LOCKED.`);
    }

    // Update to APPROVED
    await this.prisma.dataSalesAgreement.update({
      where: { agreementId },
      data: {
        status: DataSalesStatus.APPROVED,
        verifiedAt: new Date(),
        verifiedBy: verifierAddress,
        rejectionReason: null,
      },
    });

    logger.info(`DataSales agreement approved: ${agreementId}`, { verifierAddress });
  }

  /**
   * Reject data quality (seller can re-upload within window)
   */
  async reject(agreementId: string, reason: string): Promise<void> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // Must be in BOTH_LOCKED status
    if (agreement.status !== DataSalesStatus.BOTH_LOCKED) {
      throw new Error(`Cannot reject in status: ${agreement.status}. Must be BOTH_LOCKED.`);
    }

    // Update - stays in BOTH_LOCKED but with rejection reason
    // Seller can re-upload within window
    await this.prisma.dataSalesAgreement.update({
      where: { agreementId },
      data: {
        rejectionReason: reason,
        rejectionCount: { increment: 1 },
        verifiedAt: null,
        verifiedBy: null,
      },
    });

    logger.info(`DataSales agreement rejected: ${agreementId}`, { reason });
  }

  // ============================================
  // Settlement
  // ============================================

  /**
   * Execute settlement (DataSales only, after approval)
   */
  async settle(agreementId: string): Promise<SettleResult> {
    const agreement = await this.getAgreement(agreementId);
    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // Must be in APPROVED status
    if (agreement.status !== DataSalesStatus.APPROVED) {
      throw new Error(`Cannot settle in status: ${agreement.status}. Must be APPROVED.`);
    }

    // Build and send on-chain settlement transaction
    const settleTx = await this.programService.buildSettleTransaction({
      agreementId,
      sellerWallet: agreement.sellerWallet,
    });

    // Send and confirm transaction
    const settleTxSignature = await this.programService.sendAndConfirmTransaction(
      settleTx.serializedTransaction
    );

    // Calculate access expiry
    const accessExpiresAt = new Date(
      Date.now() + agreement.accessDurationHours * 60 * 60 * 1000
    );

    // Update agreement
    const updatedAgreement = await this.prisma.dataSalesAgreement.update({
      where: { agreementId },
      data: {
        status: DataSalesStatus.SETTLED,
        settledAt: new Date(),
        settleTxSignature,
        accessExpiresAt,
      },
    });

    // Generate download URLs for buyer
    const files = (agreement.files as unknown as UploadedFile[]) || [];
    const keys = files.map((f) => f.key);
    const accessDurationSeconds = agreement.accessDurationHours * 60 * 60;
    const downloadUrls = await this.s3Service.generateDownloadUrls(
      agreement.s3BucketName,
      keys,
      Math.min(accessDurationSeconds, 86400) // Max 24 hours per URL
    );

    logger.info(`DataSales agreement settled: ${agreementId}`, {
      sellerWallet: agreement.sellerWallet,
      buyerWallet: agreement.buyerWallet,
      priceLamports: agreement.priceLamports.toString(),
      accessExpiresAt,
      txSignature: settleTxSignature,
    });

    return {
      agreement: {
        id: updatedAgreement.id,
        agreementId: updatedAgreement.agreementId,
        status: updatedAgreement.status,
        settledAt: updatedAgreement.settledAt!,
        accessExpiresAt: updatedAgreement.accessExpiresAt!,
      },
      downloadUrls,
      settleTxSignature,
    };
  }

  // ============================================
  // Query Methods
  // ============================================

  /**
   * List agreements by seller wallet
   */
  async listBySeller(
    sellerWallet: string,
    options?: { status?: DataSalesStatus; limit?: number; offset?: number }
  ): Promise<DataSalesAgreement[]> {
    return this.prisma.dataSalesAgreement.findMany({
      where: {
        sellerWallet,
        ...(options?.status && { status: options.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    });
  }

  /**
   * List agreements by buyer wallet
   */
  async listByBuyer(
    buyerWallet: string,
    options?: { status?: DataSalesStatus; limit?: number; offset?: number }
  ): Promise<DataSalesAgreement[]> {
    return this.prisma.dataSalesAgreement.findMany({
      where: {
        buyerWallet,
        ...(options?.status && { status: options.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    });
  }

  /**
   * Find expired agreements (for timeout job)
   */
  async findExpiredDeposits(): Promise<DataSalesAgreement[]> {
    return this.prisma.dataSalesAgreement.findMany({
      where: {
        status: {
          in: [
            DataSalesStatus.PENDING_DEPOSITS,
            DataSalesStatus.DATA_LOCKED,
            DataSalesStatus.SOL_LOCKED,
          ],
        },
        depositWindowEndsAt: {
          lt: new Date(),
        },
      },
    });
  }

  /**
   * Find agreements with expired access (for cleanup job)
   */
  async findExpiredAccess(): Promise<DataSalesAgreement[]> {
    return this.prisma.dataSalesAgreement.findMany({
      where: {
        status: DataSalesStatus.SETTLED,
        accessExpiresAt: {
          lt: new Date(),
        },
      },
    });
  }

  // ============================================
  // PDA Derivation
  // ============================================

  private deriveEscrowPda(agreementId: string): string {
    const { pda } = this.programService.deriveEscrowPda(agreementId);
    return pda.toBase58();
  }

  private deriveSolVaultPda(agreementId: string): string {
    const { pda } = this.programService.deriveVaultPda(agreementId);
    return pda.toBase58();
  }

  private deriveEscrowPdaWithBump(agreementId: string): { pda: string; bump: number } {
    const { pda, bump } = this.programService.deriveEscrowPda(agreementId);
    return { pda: pda.toBase58(), bump };
  }
}
