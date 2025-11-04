/**
 * Swap Type Validation Utilities
 * 
 * Provides validation and helper functions for SOL-based swap types.
 * Used across API endpoints and services to ensure data integrity.
 */

import { SwapType } from '../generated/prisma';

/**
 * All valid swap types as strings (for API validation)
 */
export const VALID_SWAP_TYPES = [
  'NFT_FOR_SOL',
  'NFT_FOR_NFT_WITH_FEE',
  'NFT_FOR_NFT_PLUS_SOL',
] as const;

/**
 * Type guard for SwapType
 */
export type SwapTypeString = typeof VALID_SWAP_TYPES[number];

/**
 * Check if a string is a valid swap type
 * @param value - Value to check
 * @returns True if valid swap type
 */
export function isValidSwapType(value: any): value is SwapTypeString {
  return VALID_SWAP_TYPES.includes(value);
}

/**
 * Check if swap type requires SOL amount
 * @param swapType - Swap type to check
 * @returns True if SOL amount is required
 */
export function requiresSol(swapType: SwapType | SwapTypeString): boolean {
  return swapType === 'NFT_FOR_SOL' || swapType === 'NFT_FOR_NFT_PLUS_SOL';
}

/**
 * Check if swap type requires NFT B (buyer's NFT)
 * @param swapType - Swap type to check
 * @returns True if NFT B is required
 */
export function requiresNftB(swapType: SwapType | SwapTypeString): boolean {
  return swapType === 'NFT_FOR_NFT_WITH_FEE' || swapType === 'NFT_FOR_NFT_PLUS_SOL';
}

/**
 * Check if swap type requires separate fee payment
 * (as opposed to fee extracted from SOL amount)
 * @param swapType - Swap type to check
 * @returns True if separate fee payment required
 */
export function requiresSeparateFee(swapType: SwapType | SwapTypeString): boolean {
  return swapType === 'NFT_FOR_NFT_WITH_FEE';
}

/**
 * Validate swap parameters based on swap type
 * @param swapType - The swap type
 * @param params - Parameters to validate
 * @returns Validation result with error messages
 */
export function validateSwapParameters(
  swapType: SwapType | SwapTypeString,
  params: {
    solAmount?: number | string | null;
    nftBMint?: string | null;
  }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if SOL amount is required
  if (requiresSol(swapType)) {
    if (!params.solAmount || params.solAmount === '0') {
      errors.push(`SOL amount is required for ${swapType} swap type`);
    }
  } else {
    // NFT_FOR_NFT_WITH_FEE shouldn't have SOL amount
    if (params.solAmount && params.solAmount !== '0') {
      errors.push(`SOL amount should not be provided for ${swapType} swap type`);
    }
  }

  // Check if NFT B is required
  if (requiresNftB(swapType)) {
    if (!params.nftBMint) {
      errors.push(`NFT B mint address is required for ${swapType} swap type`);
    }
  } else {
    // NFT_FOR_SOL shouldn't have NFT B
    if (params.nftBMint) {
      errors.push(`NFT B mint should not be provided for ${swapType} swap type`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get human-readable description of swap type
 * @param swapType - Swap type
 * @returns Description string
 */
export function getSwapTypeDescription(swapType: SwapType | SwapTypeString): string {
  switch (swapType) {
    case 'NFT_FOR_SOL':
      return 'NFT <> SOL: Direct exchange of NFT for SOL';
    case 'NFT_FOR_NFT_WITH_FEE':
      return 'NFT <> NFT: Exchange with separate SOL fee payment';
    case 'NFT_FOR_NFT_PLUS_SOL':
      return 'NFT <> NFT+SOL: Exchange with SOL amount (fee extracted)';
    default:
      return 'Unknown swap type';
  }
}

/**
 * Get required fields for a swap type
 * @param swapType - Swap type
 * @returns Array of required field names
 */
export function getRequiredFields(swapType: SwapType | SwapTypeString): string[] {
  const baseFields = ['nftMint', 'seller', 'buyer', 'feeBps', 'expiry'];
  
  const additionalFields: string[] = [];
  
  if (requiresSol(swapType)) {
    additionalFields.push('solAmount');
  }
  
  if (requiresNftB(swapType)) {
    additionalFields.push('nftBMint');
  }
  
  return [...baseFields, ...additionalFields];
}

/**
 * Convert Prisma SwapType enum to API string format
 * @param swapType - Prisma SwapType enum value
 * @returns String representation
 */
export function swapTypeToString(swapType: SwapType): SwapTypeString {
  return swapType as SwapTypeString;
}

/**
 * Convert API string to Prisma SwapType enum
 * @param value - String value
 * @returns SwapType enum value
 * @throws Error if invalid swap type
 */
export function stringToSwapType(value: string): SwapType {
  if (!isValidSwapType(value)) {
    throw new Error(`Invalid swap type: ${value}. Must be one of: ${VALID_SWAP_TYPES.join(', ')}`);
  }
  return value as SwapType;
}

/**
 * Validation error class for swap type validation
 */
export class SwapTypeValidationError extends Error {
  public errors: string[];
  
  constructor(errors: string[]) {
    super(`Swap type validation failed: ${errors.join('; ')}`);
    this.name = 'SwapTypeValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, SwapTypeValidationError.prototype);
  }
}

/**
 * Validate and throw if invalid
 * @param swapType - Swap type to validate
 * @param params - Parameters to validate
 * @throws SwapTypeValidationError if validation fails
 */
export function validateSwapParametersOrThrow(
  swapType: SwapType | SwapTypeString,
  params: {
    solAmount?: number | string | null;
    nftBMint?: string | null;
  }
): void {
  const result = validateSwapParameters(swapType, params);
  if (!result.valid) {
    throw new SwapTypeValidationError(result.errors);
  }
}

