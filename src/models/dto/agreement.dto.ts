import { Decimal } from '@prisma/client/runtime/library';
import { AgreementStatus, SwapType, FeePayer } from '../../generated/prisma';
import { ExpiryPreset } from '../validators/expiry.validator';

/**
 * DTO for creating a new agreement
 */
export interface CreateAgreementDTO {
  /**
   * Type of swap transaction. Determines required fields and fee structure.
   * - NFT_FOR_SOL: Direct NFT for SOL exchange (requires solAmount)
   * - NFT_FOR_NFT_WITH_FEE: NFT for NFT with separate SOL fee (requires nftBMint)
   * - NFT_FOR_NFT_PLUS_SOL: NFT for NFT + SOL with fee extracted (requires both)
   * 
   * Default: NFT_FOR_SOL (if not specified)
   */
  swapType?: SwapType;
  
  /**
   * Seller's NFT mint address (NFT A - always required).
   * 
   * Important: This is NOT "minting" (creating) an NFT.
   * The NFT must ALREADY EXIST in the seller's wallet.
   * Provide the mint address of the specific NFT to be traded.
   * 
   * Example: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
   */
  nftMint: string;
  
  /**
   * Buyer's NFT mint address (NFT B - required for NFT<>NFT swaps).
   * Only used when swapType is NFT_FOR_NFT_WITH_FEE or NFT_FOR_NFT_PLUS_SOL.
   * 
   * Example: "8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
   */
  nftBMint?: string;
  
  /**
   * SOL amount in lamports (1 SOL = 1,000,000,000 lamports).
   * Required for NFT_FOR_SOL and NFT_FOR_NFT_PLUS_SOL swap types.
   * 
   * BETA Limits: 0.01 SOL (10,000,000 lamports) to 15 SOL (15,000,000,000 lamports)
   * 
   * Example: "500000000" (0.5 SOL)
   */
  solAmount?: string | number;
  
  /**
   * @deprecated Use solAmount instead. Price field kept for backward compatibility.
   * Will be removed in future versions.
   */
  price?: string | number | Decimal;
  
  seller: string;
  buyer?: string;
  
  /**
   * Who pays the platform fee.
   * - BUYER: Buyer pays the fee (default)
   * - SELLER: Seller pays the fee
   */
  feePayer?: FeePayer;
  
  /**
   * Agreement expiry time. Supports multiple formats:
   * - ISO 8601 timestamp string (absolute time)
   * - Date object (absolute time)
   * - Duration in hours (number between 0.0833-24, where 0.0833 = 5 minutes)
   * - Preset string: '5m', '1h', '6h', '12h', '24h'
   * - Optional: If not provided, defaults to 5 minutes from creation
   * 
   * Examples:
   * - "2025-11-04T12:00:00Z" (absolute time)
   * - 12 (12 hours from now)
   * - "5m" (5 minutes from now - default)
   * - "6h" (6 hours from now)
   * - undefined (uses default: 5 minutes from now)
   * 
   * Constraints:
   * - Minimum: 5 minutes from creation
   * - Maximum: 24 hours from creation
   * - Default: 5 minutes (when not specified)
   */
  expiry?: Date | string | number | ExpiryPreset;
  
  /**
   * Optional: Explicit duration in hours (alternative to expiry)
   * If both expiry and expiryDurationHours are provided, expiry takes precedence
   */
  expiryDurationHours?: number;
  
  feeBps: number;
  honorRoyalties: boolean;
}

/**
 * DTO for agreement response
 */
export interface AgreementResponseDTO {
  agreementId: string;
  
  /**
   * Type of swap transaction
   */
  swapType?: SwapType;
  
  /**
   * Seller's NFT mint address (NFT A - always present).
   * This identifies which specific NFT the seller is trading.
   */
  nftMint: string;
  
  /**
   * Buyer's NFT mint address (NFT B - present for NFT<>NFT swaps).
   */
  nftBMint?: string;
  
  /**
   * SOL amount in lamports (present for SOL-based swaps).
   */
  solAmount?: string;
  
  /**
   * @deprecated Use solAmount instead. Kept for backward compatibility.
   */
  price?: string;
  
  seller: string;
  buyer?: string;
  
  /**
   * Who pays the platform fee
   */
  feePayer?: FeePayer;
  
  status: AgreementStatus;
  expiry: string;
  feeBps: number;
  honorRoyalties: boolean;
  escrowPda: string;
  
  /**
   * @deprecated USDC deposit address. No longer used for SOL-based swaps.
   */
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
  swapType: SwapType;
  depositAddresses: {
    /**
     * @deprecated USDC deposit address. No longer used for SOL-based swaps.
     * For SOL deposits, send directly to escrowPda.
     */
    usdc?: string;
    nft: string;
    nftB?: string; // For NFT<>NFT swaps
  };
  expiry: string;
  transactionId: string;
}

/**
 * DTO for agreement query filters
 */
export interface AgreementQueryDTO {
  status?: AgreementStatus;
  swapType?: SwapType;
  seller?: string;
  buyer?: string;
  
  /**
   * Filter by seller's NFT mint address (to find agreements for a specific NFT).
   */
  nftMint?: string;
  
  /**
   * Filter by buyer's NFT mint address (for NFT<>NFT swaps).
   */
  nftBMint?: string;
  
  page?: number;
  limit?: number;
}

/**
 * DTO for agreement balance information
 */
export interface AgreementBalanceDTO {
  agreementId: string;
  status: AgreementStatus;
  swapType: SwapType;
  balances: {
    /**
     * @deprecated Use solLocked instead
     */
    usdcLocked?: boolean;
    solLocked?: boolean;
    nftLocked: boolean;
    nftBLocked?: boolean; // For NFT<>NFT swaps
    /**
     * @deprecated Use expectedSolAmount instead
     */
    expectedUsdcAmount?: string;
    expectedSolAmount?: string;
  };
  deadline: string;
}

/**
 * DTO for deposit information
 */
export interface DepositInfoDTO {
  id: string;
  type: 'USDC' | 'NFT' | 'SOL' | 'NFT_BUYER';
  depositor: string;
  amount?: string; // For USDC/SOL deposits (in base units)
  tokenMint?: string; // For NFT deposits
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
    /**
     * @deprecated Use solLocked instead
     */
    usdcLocked?: boolean;
    solLocked?: boolean;
    nftLocked: boolean;
    nftBLocked?: boolean; // For NFT<>NFT swaps
    /**
     * @deprecated Use actualSolAmount instead
     */
    actualUsdcAmount?: string;
    actualSolAmount?: string;
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

