import { Agreement, AgreementStatus, Deposit } from '../generated/prisma';
import {
  CreateAgreementDTO,
  CreateAgreementResponseDTO,
  AgreementResponseDTO,
  AgreementQueryDTO,
  AgreementDetailResponseDTO,
  DepositInfoDTO,
  CancelAgreementResponseDTO,
} from '../models/dto/agreement.dto';
import { initializeEscrow, getSolanaService } from './solana.service';
import { getMonitoringOrchestrator } from './monitoring-orchestrator.service';
import {
  getTransactionLogService,
  TransactionOperationType,
  TransactionStatusType,
} from './transaction-log.service';
import { Decimal } from '@prisma/client/runtime/library';
import { PublicKey } from '@solana/web3.js';
import { EscrowProgramService } from './escrow-program.service';
import { config } from '../config';
import { prisma } from '../config/database';

/**
 * Agreement Service
 * Handles all business logic related to agreements
 */

/**
 * Create a new agreement
 */
export const createAgreement = async (
  data: CreateAgreementDTO
): Promise<CreateAgreementResponseDTO> => {
  try {
    // 0. Ensure USDC accounts exist for both parties (platform pays if needed)
    // Only if both seller and buyer are specified (buyer can be optional for some escrow types)
    if (data.buyer) {
      console.log('[AgreementService] Ensuring USDC accounts exist...');
      const { ensureUSDCAccountsExist } = await import('./usdc-account.service');
      const connection = getSolanaService().getConnection();
      const usdcMint = new PublicKey(process.env.USDC_MINT_ADDRESS!);

      try {
        await ensureUSDCAccountsExist(
          connection,
          new PublicKey(data.seller),
          new PublicKey(data.buyer),
          usdcMint
        );
        console.log('[AgreementService] ✅ USDC accounts verified/created');
      } catch (accountError) {
        console.error('[AgreementService] ❌ Failed to setup USDC accounts:', accountError);

        // Fail fast with clear error message
        // If USDC accounts can't be created, escrow initialization will fail anyway
        // Better to fail here with the root cause than continue and get a generic error
        const errorMessage =
          accountError instanceof Error
            ? accountError.message
            : 'Unknown error creating USDC accounts';

        throw new Error(
          `Failed to create USDC token accounts: ${errorMessage}. ` +
            `Both seller and buyer must have USDC token accounts for escrow. ` +
            `Platform attempted to create them but failed. Check wallet addresses and network connectivity.`
        );
      }
    } else {
      console.log('[AgreementService] Buyer not specified, skipping USDC account verification');
    }

    // 1. Initialize escrow on-chain
    const escrowResult = await initializeEscrow({
      nftMint: data.nftMint,
      price: data.price,
      seller: data.seller,
      buyer: data.buyer,
      expiry: new Date(data.expiry),
      feeBps: data.feeBps,
      honorRoyalties: data.honorRoyalties,
    });

    console.log('[AgreementService] Escrow Result:', JSON.stringify(escrowResult, null, 2));

    // IMPORTANT: Add the same 60-second buffer to DB expiry that was added on-chain
    // This ensures DB expiry matches on-chain expiry exactly, preventing race conditions
    // where DB thinks agreement is expired but on-chain still has time remaining
    const EXPIRY_BUFFER_SECONDS = 60;
    const bufferedExpiry = new Date(new Date(data.expiry).getTime() + EXPIRY_BUFFER_SECONDS * 1000);

    // 2. Store agreement in database
    const agreement = await prisma.agreement.create({
      data: {
        agreementId: generateAgreementId(),
        escrowPda: escrowResult.escrowPda,
        nftMint: data.nftMint,
        seller: data.seller,
        buyer: data.buyer || null,
        price: new Decimal(data.price.toString()),
        feeBps: data.feeBps,
        honorRoyalties: data.honorRoyalties,
        status: AgreementStatus.PENDING,
        expiry: bufferedExpiry, // Use buffered expiry to match on-chain state
        usdcDepositAddr: escrowResult.depositAddresses.usdc,
        nftDepositAddr: escrowResult.depositAddresses.nft,
        initTxId: escrowResult.transactionId,
      },
    });

    // 2a. Log the initialization transaction
    try {
      const transactionLogService = getTransactionLogService();
      await transactionLogService.captureTransaction({
        txId: escrowResult.transactionId,
        operationType: TransactionOperationType.INIT_ESCROW,
        agreementId: agreement.agreementId,
        status: TransactionStatusType.CONFIRMED,
      });
    } catch (logError) {
      // Log error but don't fail the agreement creation
      console.error('Failed to log init transaction:', logError);
    }

    // 3. Trigger monitoring reload to start monitoring this agreement
    try {
      const orchestrator = getMonitoringOrchestrator();
      if (orchestrator.isServiceRunning()) {
        await orchestrator.reloadAgreements();
        console.log(`Started monitoring for agreement: ${agreement.agreementId}`);
      }
    } catch (monitoringError) {
      // Log error but don't fail the agreement creation
      console.error('Failed to trigger monitoring reload:', monitoringError);
    }

    // 4. Return response
    return {
      agreementId: agreement.agreementId,
      escrowPda: agreement.escrowPda,
      depositAddresses: {
        usdc: agreement.usdcDepositAddr!,
        nft: agreement.nftDepositAddr!,
      },
      expiry: agreement.expiry.toISOString(),
      transactionId: agreement.initTxId!,
    };
  } catch (error) {
    console.error('Error creating agreement:', error);
    throw new Error(
      `Failed to create agreement: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Get agreement by ID
 */
export const getAgreementById = async (
  agreementId: string
): Promise<AgreementResponseDTO | null> => {
  try {
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
      include: {
        receipt: true, // Include receipt to get receiptId
      },
    });

    if (!agreement) {
      return null;
    }

    return mapAgreementToDTO(agreement);
  } catch (error) {
    console.error('Error getting agreement:', error);
    throw new Error('Failed to get agreement');
  }
};

/**
 * Get detailed agreement by ID with deposits and balances
 */
export const getAgreementDetailById = async (
  agreementId: string
): Promise<AgreementDetailResponseDTO | null> => {
  try {
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
      include: {
        deposits: {
          orderBy: { detectedAt: 'asc' },
        },
        receipt: true, // Include receipt to get receiptId
      },
    });

    if (!agreement) {
      return null;
    }

    return mapAgreementToDetailDTO(agreement);
  } catch (error) {
    console.error('Error getting detailed agreement:', error);
    throw new Error('Failed to get agreement details');
  }
};

/**
 * List agreements with filters
 */
export const listAgreements = async (
  filters: AgreementQueryDTO
): Promise<{ agreements: AgreementResponseDTO[]; total: number; page: number; limit: number }> => {
  try {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.seller) {
      where.seller = filters.seller;
    }
    if (filters.buyer) {
      where.buyer = filters.buyer;
    }
    if (filters.nftMint) {
      where.nftMint = filters.nftMint;
    }

    const [agreements, total] = await Promise.all([
      prisma.agreement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.agreement.count({ where }),
    ]);

    return {
      agreements: agreements.map(mapAgreementToDTO),
      total,
      page,
      limit,
    };
  } catch (error) {
    console.error('Error listing agreements:', error);
    throw new Error('Failed to list agreements');
  }
};

/**
 * Update agreement status
 */
export const updateAgreementStatus = async (
  agreementId: string,
  status: AgreementStatus
): Promise<Agreement> => {
  try {
    const agreement = await prisma.agreement.update({
      where: { agreementId },
      data: { status },
    });

    return agreement;
  } catch (error) {
    console.error('Error updating agreement status:', error);
    throw new Error('Failed to update agreement status');
  }
};

/**
 * Delete agreement
 */
export const deleteAgreement = async (agreementId: string): Promise<void> => {
  try {
    await prisma.agreement.delete({
      where: { agreementId },
    });
  } catch (error) {
    console.error('Error deleting agreement:', error);
    throw new Error('Failed to delete agreement');
  }
};

/**
 * Check if agreement is expired
 */
export const isAgreementExpired = (agreement: Agreement): boolean => {
  return new Date() > agreement.expiry;
};

/**
 * Generate unique agreement ID
 */
const generateAgreementId = (): string => {
  // Generate a unique ID with timestamp and random string
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `AGR-${timestamp}-${random}`.toUpperCase();
};

/**
 * Map Agreement model to DTO
 */
const mapAgreementToDTO = (agreement: any): AgreementResponseDTO => {
  return {
    agreementId: agreement.agreementId,
    nftMint: agreement.nftMint,
    price: agreement.price.toString(),
    seller: agreement.seller,
    buyer: agreement.buyer || undefined,
    status: agreement.status,
    expiry: agreement.expiry.toISOString(),
    feeBps: agreement.feeBps,
    honorRoyalties: agreement.honorRoyalties,
    escrowPda: agreement.escrowPda,
    usdcDepositAddr: agreement.usdcDepositAddr || undefined,
    nftDepositAddr: agreement.nftDepositAddr || undefined,
    initTxId: agreement.initTxId || undefined,
    settleTxId: agreement.settleTxId || undefined,
    cancelTxId: agreement.cancelTxId || undefined,
    receiptId: agreement.receipt?.id ?? null,
    createdAt: agreement.createdAt.toISOString(),
    updatedAt: agreement.updatedAt.toISOString(),
    settledAt: agreement.settledAt?.toISOString(),
    cancelledAt: agreement.cancelledAt?.toISOString(),
  };
};

/**
 * Map Agreement with deposits to detailed DTO
 */
const mapAgreementToDetailDTO = (agreement: any): AgreementDetailResponseDTO => {
  const baseDTO = mapAgreementToDTO(agreement);

  // Map deposits
  const deposits: DepositInfoDTO[] = agreement.deposits.map((deposit: any) => ({
    id: deposit.id,
    type: deposit.type,
    depositor: deposit.depositor,
    amount: deposit.amount?.toString(),
    status: deposit.status,
    txId: deposit.txId || undefined,
    detectedAt: deposit.detectedAt.toISOString(),
    confirmedAt: deposit.confirmedAt?.toISOString(),
  }));

  // Calculate balances
  const usdcDeposit = agreement.deposits.find(
    (d: any) => d.type === 'USDC' && d.status === 'CONFIRMED'
  );
  const nftDeposit = agreement.deposits.find(
    (d: any) => d.type === 'NFT' && d.status === 'CONFIRMED'
  );

  const balances = {
    usdcLocked: !!usdcDeposit,
    nftLocked: !!nftDeposit,
    actualUsdcAmount: usdcDeposit?.amount?.toString(),
  };

  // Check expiry and cancellation eligibility
  const now = new Date();
  const isExpired = now > agreement.expiry;
  const canBeCancelled =
    isExpired &&
    (agreement.status === AgreementStatus.PENDING ||
      agreement.status === AgreementStatus.USDC_LOCKED ||
      agreement.status === AgreementStatus.NFT_LOCKED ||
      agreement.status === AgreementStatus.BOTH_LOCKED);

  return {
    ...baseDTO,
    deposits,
    balances,
    isExpired,
    canBeCancelled,
    cancelledAt: agreement.cancelledAt?.toISOString(),
    settledAt: agreement.settledAt?.toISOString(),
  };
};

/**
 * Cancel an agreement (only if expired and not already settled/cancelled)
 */
export const cancelAgreement = async (
  agreementId: string,
  isAdminOverride: boolean = false
): Promise<CancelAgreementResponseDTO> => {
  try {
    // Get agreement with current status
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
    });

    if (!agreement) {
      throw new Error('Agreement not found');
    }

    // Check if already cancelled or settled
    if (agreement.status === AgreementStatus.CANCELLED) {
      throw new Error('Agreement is already cancelled');
    }

    if (agreement.status === AgreementStatus.SETTLED) {
      throw new Error('Cannot cancel a settled agreement');
    }

    if (agreement.status === AgreementStatus.REFUNDED) {
      throw new Error('Agreement is already refunded');
    }

    // Check if expired (unless admin override is enabled)
    const now = new Date();
    if (!isAdminOverride && now <= agreement.expiry) {
      throw new Error('Agreement has not expired yet. Cannot cancel before expiry.');
    }

    // Execute on-chain cancellation
    let cancelTxId: string | undefined;
    try {
      console.log('[AgreementService] Executing on-chain cancellation...');
      
      const escrowService = new EscrowProgramService();
      const escrowPda = new PublicKey(agreement.escrowPda);
      const seller = new PublicKey(agreement.seller);
      const nftMint = new PublicKey(agreement.nftMint);
      
      // Get buyer (use seller if buyer not set)
      const buyer = agreement.buyer 
        ? new PublicKey(agreement.buyer)
        : seller;
      
      // Get USDC mint from config
      const usdcMintAddress = config.usdc?.mintAddress;
      if (!usdcMintAddress) {
        throw new Error('USDC_MINT_ADDRESS not configured');
      }
      const usdcMint = new PublicKey(usdcMintAddress);
      
      // Choose appropriate cancellation method based on actual expiry time
      // Check if the agreement has actually expired (time-based, not status-based)
      const isExpired = now > agreement.expiry;
      
      if (isExpired) {
        console.log('[AgreementService] Using cancelIfExpired for time-expired agreement');
        cancelTxId = await escrowService.cancelIfExpired(
          escrowPda,
          buyer,
          seller,
          nftMint,
          usdcMint
        );
      } else {
        console.log('[AgreementService] Using adminCancel for non-expired cancellation');
        cancelTxId = await escrowService.adminCancel(
          escrowPda,
          buyer,
          seller,
          nftMint,
          usdcMint
        );
      }
      
      console.log('[AgreementService] On-chain cancellation successful:', cancelTxId);
    } catch (error) {
      console.error('[AgreementService] On-chain cancellation failed:', error);
      // Continue with database update even if on-chain fails
      // This allows graceful degradation
    }

    // Update agreement status
    const updatedAgreement = await prisma.agreement.update({
      where: { agreementId },
      data: {
        status: AgreementStatus.CANCELLED,
        cancelledAt: now,
        cancelTxId: cancelTxId,
      },
    });

    return {
      agreementId: updatedAgreement.agreementId,
      status: updatedAgreement.status,
      cancelledAt: updatedAgreement.cancelledAt!.toISOString(),
      transactionId: updatedAgreement.cancelTxId || undefined,
      message:
        'Agreement cancelled successfully. Assets will be returned to their respective owners.',
    };
  } catch (error) {
    console.error('Error cancelling agreement:', error);
    throw error;
  }
};

/**
 * Cleanup expired agreements
 */
export const cleanupExpiredAgreements = async (): Promise<number> => {
  try {
    const result = await prisma.agreement.updateMany({
      where: {
        expiry: { lt: new Date() },
        status: AgreementStatus.PENDING,
      },
      data: {
        status: AgreementStatus.EXPIRED,
      },
    });

    return result.count;
  } catch (error) {
    console.error('Error cleaning up expired agreements:', error);
    throw new Error('Failed to cleanup expired agreements');
  }
};

/**
 * Build unsigned deposit NFT transaction (PRODUCTION)
 * Client signs and submits this transaction with their wallet
 */
export const prepareDepositNftTransaction = async (
  agreementId: string
): Promise<{ transaction: string; message: string }> => {
  try {
    console.log('[AgreementService] prepareDepositNftTransaction called for:', agreementId);

    // 1. Get agreement from database
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
    });

    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // 2. Validate status - allow NFT deposit when PENDING or USDC_LOCKED
    const allowedStatuses: AgreementStatus[] = [
      AgreementStatus.PENDING,
      AgreementStatus.USDC_LOCKED,
    ];
    if (!allowedStatuses.includes(agreement.status)) {
      throw new Error(
        `Cannot deposit NFT: Agreement status is ${agreement.status}. Must be PENDING or USDC_LOCKED.`
      );
    }

    // 3. Build unsigned transaction
    const escrowService = new EscrowProgramService();
    const escrowPda = new PublicKey(agreement.escrowPda);
    const seller = new PublicKey(agreement.seller);
    const nftMint = new PublicKey(agreement.nftMint);

    const result = await escrowService.buildDepositNftTransaction(escrowPda, seller, nftMint);

    console.log('[AgreementService] Unsigned NFT deposit transaction prepared');

    return result;
  } catch (error) {
    console.error('[AgreementService] prepareDepositNftTransaction error:', error);
    throw error;
  }
};

/**
 * Build unsigned deposit USDC transaction (PRODUCTION)
 * Client signs and submits this transaction with their wallet
 */
export const prepareDepositUsdcTransaction = async (
  agreementId: string
): Promise<{ transaction: string; message: string }> => {
  try {
    console.log('[AgreementService] prepareDepositUsdcTransaction called for:', agreementId);

    // 1. Get agreement from database
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
    });

    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // 2. Validate status - allow USDC deposit when PENDING or NFT_LOCKED
    const allowedStatuses: AgreementStatus[] = [
      AgreementStatus.PENDING,
      AgreementStatus.NFT_LOCKED,
    ];
    if (!allowedStatuses.includes(agreement.status)) {
      throw new Error(
        `Cannot deposit USDC: Agreement status is ${agreement.status}. Must be PENDING or NFT_LOCKED.`
      );
    }

    if (!agreement.buyer) {
      throw new Error('Cannot deposit USDC: No buyer assigned');
    }

    // 3. Build unsigned transaction
    const escrowService = new EscrowProgramService();
    const escrowPda = new PublicKey(agreement.escrowPda);
    const buyer = new PublicKey(agreement.buyer);
    const usdcMint = new PublicKey(process.env.USDC_MINT_ADDRESS || '');

    if (!process.env.USDC_MINT_ADDRESS) {
      throw new Error('USDC_MINT_ADDRESS not configured');
    }

    const result = await escrowService.buildDepositUsdcTransaction(escrowPda, buyer, usdcMint);

    console.log('[AgreementService] Unsigned USDC deposit transaction prepared');

    return result;
  } catch (error) {
    console.error('[AgreementService] prepareDepositUsdcTransaction error:', error);
    throw error;
  }
};

/**
 * Deposit NFT into escrow
 * Calls the on-chain deposit_nft instruction
 * @deprecated Use prepareDepositNftTransaction for production (client-side signing)
 */
export const depositNftToEscrow = async (
  agreementId: string
): Promise<{ transactionId: string }> => {
  try {
    console.log('[AgreementService] depositNftToEscrow called for:', agreementId);

    // 1. Get agreement from database
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
      include: { deposits: true },
    });

    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // 2. Validate status - allow NFT deposit when PENDING or USDC_LOCKED
    const allowedStatuses: AgreementStatus[] = [
      AgreementStatus.PENDING,
      AgreementStatus.USDC_LOCKED,
    ];
    if (!allowedStatuses.includes(agreement.status)) {
      throw new Error(
        `Cannot deposit NFT: Agreement status is ${agreement.status}. Must be PENDING or USDC_LOCKED.`
      );
    }

    // 3. Call on-chain deposit_nft instruction
    const escrowService = new EscrowProgramService();
    const escrowPda = new PublicKey(agreement.escrowPda);
    const seller = new PublicKey(agreement.seller);
    const nftMint = new PublicKey(agreement.nftMint);

    const txId = await escrowService.depositNft(escrowPda, seller, nftMint);

    console.log('[AgreementService] NFT deposit transaction:', txId);

    // 4. Log transaction
    const txLogService = getTransactionLogService();
    await txLogService.captureTransaction({
      txId,
      agreementId,
      operationType: TransactionOperationType.DEPOSIT_NFT,
      status: TransactionStatusType.CONFIRMED,
    });

    return { transactionId: txId };
  } catch (error) {
    console.error('[AgreementService] depositNftToEscrow error:', error);

    // Log failure (optional - can skip if txId doesn't exist)
    if (error instanceof Error && error.message) {
      const txLogService = getTransactionLogService();
      try {
        await txLogService.captureTransaction({
          txId: `failed-nft-${Date.now()}`,
          agreementId,
          operationType: TransactionOperationType.DEPOSIT_NFT,
          status: TransactionStatusType.FAILED,
          errorMessage: error.message,
        });
      } catch (logError) {
        // Ignore logging errors
        console.error('[AgreementService] Failed to log NFT deposit error:', logError);
      }
    }

    throw error;
  }
};

/**
 * Deposit USDC into escrow
 * Calls the on-chain deposit_usdc instruction
 */
export const depositUsdcToEscrow = async (
  agreementId: string
): Promise<{ transactionId: string }> => {
  try {
    console.log('[AgreementService] depositUsdcToEscrow called for:', agreementId);

    // 1. Get agreement from database
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
      include: { deposits: true },
    });

    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // 2. Validate status - allow USDC deposit when PENDING or NFT_LOCKED
    const allowedStatuses: AgreementStatus[] = [
      AgreementStatus.PENDING,
      AgreementStatus.NFT_LOCKED,
    ];
    if (!allowedStatuses.includes(agreement.status)) {
      throw new Error(
        `Cannot deposit USDC: Agreement status is ${agreement.status}. Must be PENDING or NFT_LOCKED.`
      );
    }

    if (!agreement.buyer) {
      throw new Error('Cannot deposit USDC: No buyer assigned');
    }

    // 3. Call on-chain deposit_usdc instruction
    const escrowService = new EscrowProgramService();
    const escrowPda = new PublicKey(agreement.escrowPda);
    const buyer = new PublicKey(agreement.buyer);
    const usdcMint = new PublicKey(process.env.USDC_MINT_ADDRESS || '');

    if (!process.env.USDC_MINT_ADDRESS) {
      throw new Error('USDC_MINT_ADDRESS not configured');
    }

    const txId = await escrowService.depositUsdc(escrowPda, buyer, usdcMint);

    console.log('[AgreementService] USDC deposit transaction:', txId);

    // 4. Log transaction
    const txLogService = getTransactionLogService();
    await txLogService.captureTransaction({
      txId,
      agreementId,
      operationType: TransactionOperationType.DEPOSIT_USDC,
      status: TransactionStatusType.CONFIRMED,
    });

    return { transactionId: txId };
  } catch (error) {
    console.error('[AgreementService] depositUsdcToEscrow error:', error);

    // Log failure (optional - can skip if txId doesn't exist)
    if (error instanceof Error && error.message) {
      const txLogService = getTransactionLogService();
      try {
        await txLogService.captureTransaction({
          txId: `failed-usdc-${Date.now()}`,
          agreementId,
          operationType: TransactionOperationType.DEPOSIT_USDC,
          status: TransactionStatusType.FAILED,
          errorMessage: error.message,
        });
      } catch (logError) {
        // Ignore logging errors
        console.error('[AgreementService] Failed to log USDC deposit error:', logError);
      }
    }

    throw error;
  }
};

/**
 * Archive agreements (admin-only, for test cleanup)
 * @param agreementIds - Array of agreement IDs to archive
 * @param reason - Reason for archiving (e.g., "E2E test cleanup")
 * @returns Count of archived agreements
 */
export const archiveAgreements = async (
  agreementIds: string[],
  reason: string = 'Manual archive'
): Promise<{ count: number; archived: string[] }> => {
  if (agreementIds.length === 0) {
    return { count: 0, archived: [] };
  }

  console.log(`[AgreementService] Archiving ${agreementIds.length} agreements...`);
  console.log(`[AgreementService] Reason: ${reason}`);

  const result = await prisma.agreement.updateMany({
    where: {
      agreementId: {
        in: agreementIds,
      },
    },
    data: {
      status: AgreementStatus.ARCHIVED,
      archivedAt: new Date(),
      archiveReason: reason,
    },
  });

  console.log(`[AgreementService] ✅ Archived ${result.count} agreement(s)`);

  if (result.count < agreementIds.length) {
    const notFound = agreementIds.length - result.count;
    console.log(
      `[AgreementService] ℹ️  ${notFound} agreement(s) not found (may have been deleted or already archived)`
    );
  }

  return {
    count: result.count,
    archived: agreementIds.slice(0, result.count),
  };
};