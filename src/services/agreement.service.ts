import { PrismaClient, Agreement, AgreementStatus, Deposit } from '../generated/prisma';
import { 
  CreateAgreementDTO, 
  CreateAgreementResponseDTO, 
  AgreementResponseDTO, 
  AgreementQueryDTO,
  AgreementDetailResponseDTO,
  DepositInfoDTO,
  CancelAgreementResponseDTO
} from '../models/dto/agreement.dto';
import { initializeEscrow } from './solana.service';
import { getMonitoringOrchestrator } from './monitoring-orchestrator.service';
import { getTransactionLogService, TransactionOperationType, TransactionStatusType } from './transaction-log.service';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

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
        expiry: new Date(data.expiry),
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
    throw new Error(`Failed to create agreement: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
          orderBy: { detectedAt: 'asc' }
        },
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
const mapAgreementToDTO = (agreement: Agreement): AgreementResponseDTO => {
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
    createdAt: agreement.createdAt.toISOString(),
    updatedAt: agreement.updatedAt.toISOString(),
  };
};

/**
 * Map Agreement with deposits to detailed DTO
 */
const mapAgreementToDetailDTO = (agreement: Agreement & { deposits: Deposit[] }): AgreementDetailResponseDTO => {
  const baseDTO = mapAgreementToDTO(agreement);
  
  // Map deposits
  const deposits: DepositInfoDTO[] = agreement.deposits.map(deposit => ({
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
  const usdcDeposit = agreement.deposits.find(d => d.type === 'USDC' && d.status === 'CONFIRMED');
  const nftDeposit = agreement.deposits.find(d => d.type === 'NFT' && d.status === 'CONFIRMED');

  const balances = {
    usdcLocked: !!usdcDeposit,
    nftLocked: !!nftDeposit,
    actualUsdcAmount: usdcDeposit?.amount?.toString(),
  };

  // Check expiry and cancellation eligibility
  const now = new Date();
  const isExpired = now > agreement.expiry;
  const canBeCancelled = isExpired && 
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
  agreementId: string
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

    // Check if expired
    const now = new Date();
    if (now <= agreement.expiry) {
      throw new Error('Agreement has not expired yet. Cannot cancel before expiry.');
    }

    // TODO: Implement on-chain cancellation once Solana program is deployed
    // For now, we'll just update the database status
    // const cancelResult = await cancelEscrowOnChain(agreement.escrowPda);

    // Update agreement status
    const updatedAgreement = await prisma.agreement.update({
      where: { agreementId },
      data: {
        status: AgreementStatus.CANCELLED,
        cancelledAt: now,
        // cancelTxId: cancelResult.transactionId, // Will be set when on-chain cancel is implemented
      },
    });

    return {
      agreementId: updatedAgreement.agreementId,
      status: updatedAgreement.status,
      cancelledAt: updatedAgreement.cancelledAt!.toISOString(),
      transactionId: updatedAgreement.cancelTxId || undefined,
      message: 'Agreement cancelled successfully. Assets will be returned to their respective owners.',
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

