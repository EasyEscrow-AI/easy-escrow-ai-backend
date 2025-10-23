import { Decimal } from '@prisma/client/runtime/library';
import { AgreementStatus } from '../../generated/prisma';

/**
 * DTO for creating a new agreement
 */
export interface CreateAgreementDTO {
  /**
   * The NFT's mint address (unique identifier).
   * 
   * Important: This is NOT "minting" (creating) an NFT.
   * The NFT must ALREADY EXIST in the seller's wallet.
   * Provide the mint address of the specific NFT to be traded.
   * 
   * Example: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
   */
  nftMint: string;
  
  price: string | number | Decimal;
  seller: string;
  buyer?: string;
  expiry: Date | string;
  feeBps: number;
  honorRoyalties: boolean;
}

/**
 * DTO for agreement response
 */
export interface AgreementResponseDTO {
  agreementId: string;
  
  /**
   * The NFT's mint address (unique identifier of the NFT being traded).
   * This identifies which specific NFT is part of this agreement.
   */
  nftMint: string;
  
  price: string;
  seller: string;
  buyer?: string;
  status: AgreementStatus;
  expiry: string;
  feeBps: number;
  honorRoyalties: boolean;
  escrowPda: string;
  usdcDepositAddr?: string;
  nftDepositAddr?: string;
  initTxId?: string;        // Escrow initialization transaction
  settleTxId?: string;      // Settlement transaction (when status = SETTLED)
  cancelTxId?: string;      // Cancellation transaction (when status = CANCELLED)
  receiptId?: string;       // Receipt ID (when status = SETTLED and receipt generated)
  createdAt: string;
  updatedAt: string;
  settledAt?: string;       // Timestamp when settled
  cancelledAt?: string;     // Timestamp when cancelled
}

/**
 * DTO for agreement creation response
 */
export interface CreateAgreementResponseDTO {
  agreementId: string;
  escrowPda: string;
  depositAddresses: {
    usdc: string;
    nft: string;
  };
  expiry: string;
  transactionId: string;
}

/**
 * DTO for agreement query filters
 */
export interface AgreementQueryDTO {
  status?: AgreementStatus;
  seller?: string;
  buyer?: string;
  
  /**
   * Filter by NFT mint address (to find agreements for a specific NFT).
   */
  nftMint?: string;
  
  page?: number;
  limit?: number;
}

/**
 * DTO for agreement balance information
 */
export interface AgreementBalanceDTO {
  agreementId: string;
  status: AgreementStatus;
  balances: {
    usdcLocked: boolean;
    nftLocked: boolean;
    expectedUsdcAmount: string;
  };
  deadline: string;
}

/**
 * DTO for deposit information
 */
export interface DepositInfoDTO {
  id: string;
  type: 'USDC' | 'NFT';
  depositor: string;
  amount?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  txId?: string;
  detectedAt: string;
  confirmedAt?: string;
}

/**
 * Enhanced DTO for detailed agreement response with balances and deposits
 */
export interface AgreementDetailResponseDTO extends AgreementResponseDTO {
  deposits: DepositInfoDTO[];
  balances: {
    usdcLocked: boolean;
    nftLocked: boolean;
    actualUsdcAmount?: string;
  };
  isExpired: boolean;
  canBeCancelled: boolean;
  cancelledAt?: string;
  settledAt?: string;
}

/**
 * DTO for agreement cancellation response
 */
export interface CancelAgreementResponseDTO {
  agreementId: string;
  status: AgreementStatus;
  cancelledAt: string;
  transactionId?: string;
  message: string;
}

