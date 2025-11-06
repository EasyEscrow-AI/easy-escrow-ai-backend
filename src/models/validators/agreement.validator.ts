import { CreateAgreementDTO } from '../dto/agreement.dto';
import {
  isValidSolanaAddress,
  isValidUSDCAmount,
  isValidFeeBps,
  isValidNFTMint,
  ESCROW_LIMITS,
} from './solana.validator';
import { validateExpiry, EXPIRY_CONSTANTS } from './expiry.validator';
import { SwapType, FeePayer } from '../../generated/prisma';
import { 
  validateSwapParametersOrThrow,
  SwapTypeValidationError 
} from '../../utils/swap-type-validator';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * SOL amount limits (in lamports)
 */
export const SOL_LIMITS = {
  MIN: 10_000_000, // 0.01 SOL
  MAX: 15_000_000_000, // 15 SOL
};

/**
 * Validate SOL amount (in lamports)
 */
export const isValidSolAmount = (amount: string | number | undefined): boolean => {
  if (amount === undefined || amount === null) return false;
  
  const amountNum = typeof amount === 'string' ? parseInt(amount, 10) : amount;
  
  if (isNaN(amountNum)) return false;
  if (amountNum < SOL_LIMITS.MIN) return false;
  if (amountNum > SOL_LIMITS.MAX) return false;
  
  return true;
};

/**
 * Validate agreement creation data with SOL-based swap support
 */
export const validateCreateAgreement = (
  data: CreateAgreementDTO
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Default to NFT_FOR_SOL if not specified
  const swapType = data.swapType || SwapType.NFT_FOR_SOL;

  // Validate swap type
  if (data.swapType && !Object.values(SwapType).includes(data.swapType)) {
    errors.push({ 
      field: 'swapType', 
      message: `Invalid swap type. Must be one of: ${Object.values(SwapType).join(', ')}` 
    });
  }

  // Validate seller's NFT mint (NFT A - always required)
  if (!data.nftMint) {
    errors.push({ field: 'nftMint', message: 'Seller NFT mint address is required' });
  } else if (!isValidNFTMint(data.nftMint)) {
    errors.push({ field: 'nftMint', message: 'Invalid seller NFT mint address' });
  }

  // Validate buyer's NFT mint (NFT B - required for NFT<>NFT swaps)
  if (swapType === SwapType.NFT_FOR_NFT_WITH_FEE || swapType === SwapType.NFT_FOR_NFT_PLUS_SOL) {
    if (!data.nftBMint) {
      errors.push({ 
        field: 'nftBMint', 
        message: `Buyer NFT mint is required for ${swapType} swap type` 
      });
    } else if (!isValidNFTMint(data.nftBMint)) {
      errors.push({ field: 'nftBMint', message: 'Invalid buyer NFT mint address' });
    }
  }

  // Validate SOL amount (required for certain swap types)
  if (swapType === SwapType.NFT_FOR_SOL || swapType === SwapType.NFT_FOR_NFT_PLUS_SOL) {
    if (!data.solAmount && data.solAmount !== 0) {
      errors.push({ 
        field: 'solAmount', 
        message: `SOL amount is required for ${swapType} swap type` 
      });
    } else if (!isValidSolAmount(data.solAmount)) {
      const minSol = SOL_LIMITS.MIN / 1_000_000_000;
      const maxSol = SOL_LIMITS.MAX / 1_000_000_000;
      errors.push({ 
        field: 'solAmount', 
        message: `SOL amount must be between ${minSol} SOL and ${maxSol} SOL (BETA limits)` 
      });
    }
  }

  // For NFT_FOR_NFT_WITH_FEE, solAmount must be exactly 5_000_000 lamports (0.005 SOL)
  // This is the BUYER's portion of the dual flat fee (seller pays same amount)
  if (swapType === SwapType.NFT_FOR_NFT_WITH_FEE) {
    const REQUIRED_FEE_PER_PARTY = 5_000_000; // 0.005 SOL
    
    if (!data.solAmount && data.solAmount !== 0) {
      errors.push({ 
        field: 'solAmount', 
        message: `Fee amount is required for NFT_FOR_NFT_WITH_FEE swap type. Must be exactly ${REQUIRED_FEE_PER_PARTY} lamports (0.005 SOL) per party.` 
      });
    } else {
      const solAmountNum = typeof data.solAmount === 'string' 
        ? parseInt(data.solAmount, 10) 
        : data.solAmount;
      
      if (solAmountNum !== REQUIRED_FEE_PER_PARTY) {
        errors.push({ 
          field: 'solAmount', 
          message: `For NFT_FOR_NFT_WITH_FEE, solAmount must be exactly ${REQUIRED_FEE_PER_PARTY} lamports (0.005 SOL). This is the fee per party (both buyer and seller pay this amount).` 
        });
      }
    }
  }

  // Backward compatibility: Check for deprecated price field
  if (data.price && !data.solAmount) {
    errors.push({
      field: 'price',
      message: 'Price field is deprecated. Use solAmount (in lamports) instead.'
    });
  }

  // Validate fee payer (optional, defaults to BUYER)
  if (data.feePayer && !Object.values(FeePayer).includes(data.feePayer)) {
    errors.push({ 
      field: 'feePayer', 
      message: `Invalid fee payer. Must be either ${FeePayer.BUYER} or ${FeePayer.SELLER}` 
    });
  }

  // Validate seller
  if (!data.seller) {
    errors.push({ field: 'seller', message: 'Seller address is required' });
  } else if (!isValidSolanaAddress(data.seller)) {
    errors.push({ field: 'seller', message: 'Invalid seller address' });
  }

  // Validate buyer (if provided)
  if (data.buyer && !isValidSolanaAddress(data.buyer)) {
    errors.push({ field: 'buyer', message: 'Invalid buyer address' });
  }

  // Validate expiry with enhanced custom duration support
  // If neither expiry nor expiryDurationHours provided, default to 5 minutes (handled by validateExpiry)
  // Prioritize expiry over expiryDurationHours if both provided
  const expiryInput = data.expiry || data.expiryDurationHours;
  
  // validateExpiry now handles undefined and applies default (5 minutes)
  const validation = validateExpiry(expiryInput as Date | string | number | undefined);
  
  if (!validation.valid) {
    errors.push({ 
      field: 'expiry', 
      message: validation.error || 'Invalid expiry value'
    });
  }

  // Validate fee BPS
  if (data.feeBps === undefined || data.feeBps === null) {
    errors.push({ field: 'feeBps', message: 'Fee basis points is required' });
  } else if (!isValidFeeBps(data.feeBps)) {
    errors.push({ 
      field: 'feeBps', 
      message: 'Fee basis points must be between 0 and 10000' 
    });
  }

  // Validate honorRoyalties
  if (typeof data.honorRoyalties !== 'boolean') {
    errors.push({ 
      field: 'honorRoyalties', 
      message: 'honorRoyalties must be a boolean' 
    });
  }

  // Use comprehensive swap type validation from utility
  try {
    validateSwapParametersOrThrow(swapType, {
      solAmount: data.solAmount,
      nftBMint: data.nftBMint,
    });
  } catch (error) {
    if (error instanceof SwapTypeValidationError) {
      // Add all validation errors to the errors array
      error.errors.forEach((errMsg) => {
        errors.push({
          field: 'swapType',
          message: errMsg,
        });
      });
    }
  }

  return errors;
};

/**
 * Check if validation passed
 */
export const isValidAgreement = (data: CreateAgreementDTO): boolean => {
  return validateCreateAgreement(data).length === 0;
};

