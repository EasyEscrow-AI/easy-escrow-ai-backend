import { Agreement, AgreementStatus, Deposit, SwapType, FeePayer } from '../generated/prisma';
import {
  CreateAgreementDTO,
  CreateAgreementResponseDTO,
  AgreementResponseDTO,
  AgreementQueryDTO,
  AgreementDetailResponseDTO,
  DepositInfoDTO,
  CancelAgreementResponseDTO,
} from '../models/dto/agreement.dto';
import { initializeEscrow, getSolanaService, ValidationError } from './solana.service';
import { getMonitoringOrchestrator } from './monitoring-orchestrator.service';
import {
  getTransactionLogService,
  TransactionOperationType,
  TransactionStatusType,
} from './transaction-log.service';
import { Decimal } from '@prisma/client/runtime/library';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { EscrowProgramService } from './escrow-program.service';
import { config } from '../config';
import { prisma } from '../config/database';
import { validateExpiry } from '../models/validators/expiry.validator';
import BN from 'bn.js';

/**
 * Agreement Service
 * Handles all business logic related to agreements
 */

/**
 * Create a new agreement using SOL-based escrow v2
 */
export const createAgreement = async (
  data: CreateAgreementDTO
): Promise<CreateAgreementResponseDTO> => {
  try {
    // Default to NFT_FOR_SOL if not specified
    const swapType = data.swapType || SwapType.NFT_FOR_SOL;
    const feePayer = data.feePayer ?? FeePayer.BUYER; // Use nullish coalescing to ensure always has value

    console.log('[AgreementService] Creating agreement with swap type:', swapType);

    // 1. Parse and validate expiry (supports multiple formats: timestamp, duration, preset)
    const expiryInput = data.expiry || data.expiryDurationHours;
    
    if (!expiryInput) {
      throw new ValidationError(
        'Expiry is required. Provide either "expiry" or "expiryDurationHours".',
        { data }
      );
    }
    
    const expiryValidation = validateExpiry(expiryInput);
    
    if (!expiryValidation.valid || !expiryValidation.expiryDate) {
      throw new ValidationError(
        expiryValidation.error || 'Invalid expiry value',
        { expiry: expiryInput }
      );
    }

    const expiryDate = expiryValidation.expiryDate;
    console.log(`[AgreementService] Parsed expiry: ${expiryDate.toISOString()} (${expiryValidation.durationHours?.toFixed(1)} hours from now)`);

    // 2. Generate unique escrow ID
    const escrowId = new BN(Date.now());

    // 3. Convert expiry to Unix timestamp with 60-second buffer
    const EXPIRY_BUFFER_SECONDS = 60;
    const expiryTimestamp = Math.floor(expiryDate.getTime() / 1000) + EXPIRY_BUFFER_SECONDS;
    const bufferedExpiry = new Date(expiryDate.getTime() + EXPIRY_BUFFER_SECONDS * 1000);

    // 4. Prepare swap-specific parameters
    let solAmount: BN | undefined;
    let nftBMint: PublicKey | undefined;

    // Convert SOL amount to lamports if provided
    if (data.solAmount !== undefined) {
      const solAmountNum = typeof data.solAmount === 'string' 
        ? parseInt(data.solAmount, 10) 
        : data.solAmount;
      solAmount = new BN(solAmountNum);
      console.log(`[AgreementService] SOL amount: ${solAmount.toString()} lamports`);
    }

    // Parse buyer's NFT mint if provided (for NFT<>NFT swaps)
    if (data.nftBMint) {
      nftBMint = new PublicKey(data.nftBMint);
      console.log(`[AgreementService] Buyer NFT (NFT B): ${nftBMint.toString()}`);
    }

    // 5. Initialize escrow on-chain using v2 method
    const escrowProgramService = new EscrowProgramService();
    const escrowResult = await escrowProgramService.initAgreementV2({
      escrowId,
      buyer: new PublicKey(data.buyer || data.seller), // Use seller as fallback if no buyer specified
      seller: new PublicKey(data.seller),
      nftMint: new PublicKey(data.nftMint),
      swapType: swapType as 'NFT_FOR_SOL' | 'NFT_FOR_NFT_WITH_FEE' | 'NFT_FOR_NFT_PLUS_SOL',
      solAmount,
      nftBMint,
      expiryTimestamp: new BN(expiryTimestamp),
      platformFeeBps: data.feeBps,
      feePayer: feePayer as 'BUYER' | 'SELLER',
    });

    console.log('[AgreementService] V2 Escrow Result:', {
      pda: escrowResult.pda.toString(),
      txId: escrowResult.txId,
      swapType,
    });

    // 6. Derive NFT deposit addresses (ATAs)
    const sellerNftAta = await getAssociatedTokenAddress(
      new PublicKey(data.nftMint),
      escrowResult.pda,
      true // allowOwnerOffCurve for PDAs
    );

    let buyerNftAta: PublicKey | undefined;
    if (nftBMint) {
      buyerNftAta = await getAssociatedTokenAddress(
        nftBMint,
        escrowResult.pda,
        true // allowOwnerOffCurve for PDAs
      );
    }

    // 7. Store agreement in database with SOL fields
    const agreement = await prisma.agreement.create({
      data: {
        agreementId: generateAgreementId(),
        escrowPda: escrowResult.pda.toString(),
        nftMint: data.nftMint,
        seller: data.seller,
        buyer: data.buyer || null,
        
        // SOL-based fields
        swapType: swapType,
        solAmount: solAmount ? new Decimal(solAmount.toString()) : null,
        nftBMint: data.nftBMint || null,
        feePayer: feePayer,
        
        // Legacy field for backward compatibility (deprecated)
        // Price is required in schema, so default to 0 if not provided and no solAmount
        price: data.price ? new Decimal(data.price.toString()) : (solAmount ? new Decimal(solAmount.toString()) : new Decimal('0')),
        
        feeBps: data.feeBps,
        honorRoyalties: data.honorRoyalties,
        status: AgreementStatus.PENDING,
        expiry: bufferedExpiry,
        
        // Deposit addresses
        usdcDepositAddr: null, // No longer used for SOL swaps
        nftDepositAddr: sellerNftAta.toString(),
        
        initTxId: escrowResult.txId,
      },
    });

    console.log(`[AgreementService] ✅ Agreement created: ${agreement.agreementId}`);

    // 8. Log the initialization transaction
    try {
      const transactionLogService = getTransactionLogService();
      await transactionLogService.captureTransaction({
        txId: escrowResult.txId,
        operationType: TransactionOperationType.INIT_ESCROW,
        agreementId: agreement.agreementId,
        status: TransactionStatusType.CONFIRMED,
      });
    } catch (logError) {
      console.error('[AgreementService] Failed to log init transaction:', logError);
    }

    // 9. Trigger monitoring reload to start monitoring this agreement
    try {
      const orchestrator = getMonitoringOrchestrator();
      if (orchestrator.isServiceRunning()) {
        await orchestrator.reloadAgreements();
        console.log(`[AgreementService] Started monitoring for agreement: ${agreement.agreementId}`);
      }
    } catch (monitoringError) {
      console.error('[AgreementService] Failed to trigger monitoring reload:', monitoringError);
    }

    // 10. Return response
    return {
      agreementId: agreement.agreementId,
      escrowPda: agreement.escrowPda,
      swapType: agreement.swapType!,
      depositAddresses: {
        usdc: undefined, // Deprecated - SOL sent directly to escrowPda
        nft: agreement.nftDepositAddr!,
        nftB: buyerNftAta?.toString(), // For NFT<>NFT swaps
      },
      expiry: agreement.expiry.toISOString(),
      transactionId: agreement.initTxId!,
    };
  } catch (error) {
    console.error('[AgreementService] Error creating agreement:', error);
    
    // Re-throw ValidationError without wrapping to preserve prototype chain
    if (error instanceof ValidationError) {
      throw error;
    }
    
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

    // Standard filters
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.seller) {
      where.seller = filters.seller;
    }
    if (filters.buyer) {
      where.buyer = filters.buyer;
    }
    
    // SOL-based filters
    if (filters.swapType) {
      where.swapType = filters.swapType;
    }
    if (filters.nftMint) {
      where.nftMint = filters.nftMint;
    }
    if (filters.nftBMint) {
      where.nftBMint = filters.nftBMint;
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
    
    // SOL-based fields
    swapType: agreement.swapType || undefined,
    nftMint: agreement.nftMint,
    nftBMint: agreement.nftBMint || undefined,
    solAmount: agreement.solAmount?.toString() || undefined,
    feePayer: agreement.feePayer || undefined,
    
    // Deprecated USDC field (backward compatibility)
    price: agreement.price?.toString() || undefined,
    
    seller: agreement.seller,
    buyer: agreement.buyer || undefined,
    status: agreement.status,
    expiry: agreement.expiry.toISOString(),
    feeBps: agreement.feeBps,
    honorRoyalties: agreement.honorRoyalties,
    escrowPda: agreement.escrowPda,
    
    // Deprecated USDC deposit address
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

  // Map deposits with SOL and NFT_BUYER support
  const deposits: DepositInfoDTO[] = agreement.deposits.map((deposit: any) => ({
    id: deposit.id,
    type: deposit.type,
    depositor: deposit.depositor,
    amount: deposit.amount?.toString(),
    tokenMint: deposit.tokenAccount ? undefined : deposit.nftMetadata?.mint, // For NFT deposits
    status: deposit.status,
    txId: deposit.txId || undefined,
    detectedAt: deposit.detectedAt.toISOString(),
    confirmedAt: deposit.confirmedAt?.toISOString(),
  }));

  // Calculate balances for SOL-based swaps
  const solDeposit = agreement.deposits.find(
    (d: any) => d.type === 'SOL' && d.status === 'CONFIRMED'
  );
  const nftDeposit = agreement.deposits.find(
    (d: any) => d.type === 'NFT' && d.status === 'CONFIRMED'
  );
  const nftBDeposit = agreement.deposits.find(
    (d: any) => d.type === 'NFT_BUYER' && d.status === 'CONFIRMED'
  );
  
  // Legacy USDC deposit for backward compatibility
  const usdcDeposit = agreement.deposits.find(
    (d: any) => d.type === 'USDC' && d.status === 'CONFIRMED'
  );

  const balances = {
    // SOL-based balances
    solLocked: !!solDeposit,
    nftLocked: !!nftDeposit,
    nftBLocked: !!nftBDeposit,
    actualSolAmount: solDeposit?.amount?.toString(),
    
    // Deprecated USDC balances (backward compatibility)
    usdcLocked: !!usdcDeposit,
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

    // Detect v1 vs v2 based on presence of swapType field
    const isV2 = agreement.swapType !== null;

    let result;
    if (isV2) {
      console.log('[AgreementService] Detected v2 agreement, using depositSellerNft instruction');
      result = await escrowService.buildDepositSellerNftTransaction(escrowPda, seller, nftMint);
    } else {
      console.log('[AgreementService] Detected v1 agreement, using depositNft instruction');
      result = await escrowService.buildDepositNftTransaction(escrowPda, seller, nftMint);
    }

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

    // 3. Call on-chain deposit_nft instruction (v1 or v2)
    const escrowService = new EscrowProgramService();
    const escrowPda = new PublicKey(agreement.escrowPda);
    const seller = new PublicKey(agreement.seller);
    const nftMint = new PublicKey(agreement.nftMint);

    // Detect v1 vs v2 based on presence of swapType field
    const isV2 = agreement.swapType !== null;

    let txId;
    if (isV2) {
      console.log('[AgreementService] Detected v2 agreement, calling depositSellerNft');
      txId = await escrowService.depositSellerNft(escrowPda, seller, nftMint);
    } else {
      console.log('[AgreementService] Detected v1 agreement, calling depositNft');
      txId = await escrowService.depositNft(escrowPda, seller, nftMint);
    }

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
 * Build unsigned deposit SOL transaction (PRODUCTION)
 * Client signs and submits this transaction with their wallet
 */
export const prepareDepositSolTransaction = async (
  agreementId: string
): Promise<{ transaction: string; message: string }> => {
  try {
    console.log('[AgreementService] prepareDepositSolTransaction called for:', agreementId);

    // 1. Get agreement from database
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
    });

    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // 2. Validate agreement has buyer
    if (!agreement.buyer) {
      throw new Error('Cannot deposit SOL: No buyer assigned to agreement');
    }

    // 3. Validate swap type supports SOL
    if (
      agreement.swapType !== 'NFT_FOR_SOL' &&
      agreement.swapType !== 'NFT_FOR_NFT_PLUS_SOL'
    ) {
      throw new Error(
        `Cannot deposit SOL: Agreement swap type is ${agreement.swapType}. ` +
          `SOL deposits only allowed for NFT_FOR_SOL and NFT_FOR_NFT_PLUS_SOL swaps.`
      );
    }

    // 4. Validate status - allow SOL deposit when PENDING or NFT_LOCKED (seller deposited)
    const allowedStatuses: AgreementStatus[] = [
      AgreementStatus.PENDING,
      AgreementStatus.NFT_LOCKED,
    ];
    if (!allowedStatuses.includes(agreement.status)) {
      throw new Error(
        `Cannot deposit SOL: Agreement status is ${agreement.status}. Must be PENDING or NFT_LOCKED.`
      );
    }

    // 5. Validate solAmount exists
    if (!agreement.solAmount) {
      throw new Error('Cannot deposit SOL: Agreement has no solAmount specified');
    }

    // 6. Build unsigned transaction
    const escrowService = new EscrowProgramService();
    const escrowPda = new PublicKey(agreement.escrowPda);
    const buyer = new PublicKey(agreement.buyer);
    // Convert Prisma Decimal to string before passing to BN
    const solAmount = new BN(agreement.solAmount.toString());

    const result = await escrowService.buildDepositSolTransaction(escrowPda, buyer, solAmount);

    console.log('[AgreementService] Unsigned SOL deposit transaction prepared');

    return result;
  } catch (error) {
    console.error('[AgreementService] prepareDepositSolTransaction error:', error);
    throw error;
  }
};

/**
 * Deposit SOL to escrow (server-side signing)
 * @deprecated Use prepareDepositSolTransaction for production (client-side signing)
 */
export const depositSolToEscrow = async (
  agreementId: string
): Promise<{ transactionId: string }> => {
  try {
    console.log('[AgreementService] depositSolToEscrow called for:', agreementId);

    // 1. Get agreement from database
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
      include: { deposits: true },
    });

    if (!agreement) {
      throw new Error(`Agreement not found: ${agreementId}`);
    }

    // 2. Validate buyer exists
    if (!agreement.buyer) {
      throw new Error('Cannot deposit SOL: No buyer assigned');
    }

    // 3. Validate swap type
    if (
      agreement.swapType !== 'NFT_FOR_SOL' &&
      agreement.swapType !== 'NFT_FOR_NFT_PLUS_SOL'
    ) {
      throw new Error(
        `Cannot deposit SOL: Agreement swap type is ${agreement.swapType}`
      );
    }

    // 4. Validate status
    const allowedStatuses: AgreementStatus[] = [
      AgreementStatus.PENDING,
      AgreementStatus.NFT_LOCKED,
    ];
    if (!allowedStatuses.includes(agreement.status)) {
      throw new Error(
        `Cannot deposit SOL: Agreement status is ${agreement.status}. Must be PENDING or NFT_LOCKED.`
      );
    }

    // 5. Validate solAmount exists
    if (!agreement.solAmount) {
      throw new Error('Cannot deposit SOL: Agreement has no solAmount specified');
    }

    // 6. Call on-chain deposit_sol instruction
    const escrowService = new EscrowProgramService();
    const escrowPda = new PublicKey(agreement.escrowPda);
    const buyer = new PublicKey(agreement.buyer);
    // Convert Prisma Decimal to string before passing to BN
    const solAmount = new BN(agreement.solAmount.toString());

    const txId = await escrowService.depositSol(escrowPda, buyer, solAmount);

    console.log('[AgreementService] SOL deposit transaction:', txId);

    // 6. Log transaction
    const txLogService = getTransactionLogService();
    await txLogService.captureTransaction({
      txId,
      agreementId,
      operationType: 'DEPOSIT_SOL' as any, // Add to TransactionOperationType enum
      status: TransactionStatusType.CONFIRMED,
    });

    return { transactionId: txId };
  } catch (error: any) {
    console.error('[AgreementService] depositSolToEscrow error:', error);

    // Log failure (optional)
    if (error instanceof Error && error.message) {
      const txLogService = getTransactionLogService();
      try {
        await txLogService.captureTransaction({
          txId: `failed-sol-${Date.now()}`,
          agreementId,
          operationType: 'DEPOSIT_SOL' as any,
          status: TransactionStatusType.FAILED,
          errorMessage: error.message,
        });
      } catch (logError) {
        // Ignore logging errors
        console.error('[AgreementService] Failed to log SOL deposit error:', logError);
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

/**
 * Extend agreement expiry
 */
export const extendAgreementExpiry = async (
  agreementId: string,
  extension: number | string | Date,
  requesterAddress?: string
): Promise<{
  agreementId: string;
  oldExpiry: Date;
  newExpiry: Date;
  extensionHours: number;
}> => {
  try {
    // 1. Fetch the agreement
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
    });

    if (!agreement) {
      throw new ValidationError('Agreement not found', { agreementId });
    }

    // 2. Validate agreement state
    if (agreement.status === AgreementStatus.SETTLED) {
      throw new ValidationError('Cannot extend expiry of settled agreement', {
        agreementId,
        status: agreement.status,
      });
    }

    if (agreement.status === AgreementStatus.CANCELLED) {
      throw new ValidationError('Cannot extend expiry of cancelled agreement', {
        agreementId,
        status: agreement.status,
      });
    }

    if (agreement.status === AgreementStatus.EXPIRED) {
      throw new ValidationError('Cannot extend expiry of expired agreement', {
        agreementId,
        status: agreement.status,
      });
    }

    if (agreement.status === AgreementStatus.REFUNDED) {
      throw new ValidationError('Cannot extend expiry of refunded agreement', {
        agreementId,
        status: agreement.status,
      });
    }

    // 3. Check if agreement already expired
    const now = new Date();
    if (agreement.expiry <= now) {
      throw new ValidationError('Agreement has already expired', {
        agreementId,
        expiry: agreement.expiry.toISOString(),
      });
    }

    // 4. Validate authorization (if requester provided)
    if (requesterAddress) {
      const isAuthorized =
        requesterAddress === agreement.seller ||
        (agreement.buyer && requesterAddress === agreement.buyer);

      if (!isAuthorized) {
        throw new ValidationError('Not authorized to extend this agreement', {
          agreementId,
          requester: requesterAddress,
        });
      }
    }

    // 5. Calculate new expiry based on extension type
    let newExpiry: Date;
    let extensionHours: number;

    if (typeof extension === 'number') {
      // Extension in hours from current expiry
      extensionHours = extension;
      
      // Validate extension is positive
      if (extensionHours <= 0) {
        throw new ValidationError(
          'Extension duration must be positive (cannot shorten expiry)',
          { extension: extensionHours }
        );
      }
      
      newExpiry = new Date(agreement.expiry.getTime() + extensionHours * 60 * 60 * 1000);
    } else if (typeof extension === 'string' && ['1h', '6h', '12h', '24h'].includes(extension)) {
      // Preset extension
      const { presetToDuration } = await import('../models/validators/expiry.validator');
      const durationMs = presetToDuration(extension as any);
      extensionHours = durationMs / (60 * 60 * 1000);
      newExpiry = new Date(agreement.expiry.getTime() + durationMs);
    } else if (extension instanceof Date || typeof extension === 'string') {
      // Absolute new expiry time - validate it's a valid date first
      newExpiry = extension instanceof Date ? extension : new Date(extension);
      
      // FIX BUG 2: Check for invalid date
      if (isNaN(newExpiry.getTime())) {
        throw new ValidationError(
          'Invalid date format for expiry extension',
          { extension }
        );
      }
      
      extensionHours = (newExpiry.getTime() - agreement.expiry.getTime()) / (60 * 60 * 1000);
      
      // FIX BUG 1: Ensure new expiry is actually later than current expiry
      if (newExpiry <= agreement.expiry) {
        throw new ValidationError(
          'New expiry must be later than current expiry (cannot shorten agreement)',
          { 
            currentExpiry: agreement.expiry.toISOString(),
            requestedExpiry: newExpiry.toISOString()
          }
        );
      }
    } else {
      throw new ValidationError('Invalid extension format', { extension });
    }

    // 6. Validate new expiry constraints
    const { validateExpiryTimestamp, EXPIRY_CONSTANTS } = await import(
      '../models/validators/expiry.validator'
    );

    // New expiry must be in the future
    if (newExpiry <= now) {
      throw new ValidationError('New expiry must be in the future', {
        newExpiry: newExpiry.toISOString(),
      });
    }

    // New expiry must not exceed 24 hours from now
    const maxExpiry = new Date(now.getTime() + EXPIRY_CONSTANTS.MAX_DURATION_MS);
    if (newExpiry > maxExpiry) {
      throw new ValidationError(
        `New expiry cannot exceed ${EXPIRY_CONSTANTS.MAX_DURATION_HOURS} hours from now`,
        {
          newExpiry: newExpiry.toISOString(),
          maxExpiry: maxExpiry.toISOString(),
        }
      );
    }

    // 7. Update agreement expiry in database (with same 60-second buffer)
    const EXPIRY_BUFFER_SECONDS = 60;
    const bufferedNewExpiry = new Date(newExpiry.getTime() + EXPIRY_BUFFER_SECONDS * 1000);

    const updatedAgreement = await prisma.agreement.update({
      where: { agreementId },
      data: {
        expiry: bufferedNewExpiry,
        updatedAt: now,
      },
    });

    console.log(
      `[AgreementService] ✅ Extended expiry for agreement ${agreementId}: ` +
        `${agreement.expiry.toISOString()} → ${updatedAgreement.expiry.toISOString()} ` +
        `(+${extensionHours.toFixed(1)} hours)`
    );

    return {
      agreementId: updatedAgreement.agreementId,
      oldExpiry: agreement.expiry,
      newExpiry: updatedAgreement.expiry,
      extensionHours,
    };
  } catch (error) {
    console.error('Error extending agreement expiry:', error);

    // Re-throw ValidationError without wrapping
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new Error(
      `Failed to extend agreement expiry: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};