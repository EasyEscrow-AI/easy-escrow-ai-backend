import { PrismaClient, Agreement, AgreementStatus } from '../generated/prisma';
import { CreateAgreementDTO, CreateAgreementResponseDTO, AgreementResponseDTO, AgreementQueryDTO } from '../models/dto/agreement.dto';
import { initializeEscrow } from './solana.service';
import { getMonitoringOrchestrator } from './monitoring-orchestrator.service';
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

