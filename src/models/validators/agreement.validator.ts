import { CreateAgreementDTO } from '../dto/agreement.dto';
import {
  isValidSolanaAddress,
  isValidUSDCAmount,
  isValidFeeBps,
  isValidNFTMint,
  ESCROW_LIMITS,
} from './solana.validator';
import { validateExpiry, EXPIRY_CONSTANTS } from './expiry.validator';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate agreement creation data with enhanced expiry validation
 */
export const validateCreateAgreement = (
  data: CreateAgreementDTO
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate NFT mint
  if (!data.nftMint) {
    errors.push({ field: 'nftMint', message: 'NFT mint address is required' });
  } else if (!isValidNFTMint(data.nftMint)) {
    errors.push({ field: 'nftMint', message: 'Invalid NFT mint address' });
  }

  // Validate price
  if (!data.price && data.price !== 0) {
    errors.push({ field: 'price', message: 'Price is required' });
  } else if (!isValidUSDCAmount(data.price)) {
    errors.push({ 
      field: 'price', 
      message: `Price must be between $${ESCROW_LIMITS.MIN_USDC.toFixed(2)} and $${ESCROW_LIMITS.MAX_USDC.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (BETA limits)` 
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
  if (!data.expiry && !data.expiryDurationHours) {
    errors.push({ 
      field: 'expiry', 
      message: 'Expiry date or duration is required' 
    });
  } else {
    // Prioritize expiry over expiryDurationHours if both provided
    const expiryInput = data.expiry || data.expiryDurationHours;
    
    if (expiryInput !== undefined) {
      const validation = validateExpiry(expiryInput as Date | string | number);
      
      if (!validation.valid) {
        errors.push({ 
          field: 'expiry', 
          message: validation.error || 'Invalid expiry value'
        });
      }
    }
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

  return errors;
};

/**
 * Check if validation passed
 */
export const isValidAgreement = (data: CreateAgreementDTO): boolean => {
  return validateCreateAgreement(data).length === 0;
};

