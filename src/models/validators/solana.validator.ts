import { PublicKey } from '@solana/web3.js';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Validate if a string is a valid Solana public key
 */
export const isValidSolanaAddress = (address: string): boolean => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate if a string is a valid Solana transaction signature
 */
export const isValidTransactionSignature = (signature: string): boolean => {
  // Solana transaction signatures are base58-encoded and typically 88 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;
  return base58Regex.test(signature);
};

/**
 * BETA Launch Limits: $1.00 minimum, $10,000.00 maximum
 * These limits will be reassessed after BETA period
 */
export const ESCROW_LIMITS = {
  MIN_USDC: 1.0,      // $1.00 minimum
  MAX_USDC: 3000.0,   // $3,000.00 maximum
} as const;

/**
 * Validate USDC amount (must be positive and within BETA launch bounds)
 * BETA Limits: $1.00 - $10,000.00
 */
export const isValidUSDCAmount = (amount: number | string | Decimal): boolean => {
  let numAmount: number;
  
  if (amount instanceof Decimal) {
    numAmount = amount.toNumber();
  } else if (typeof amount === 'string') {
    numAmount = parseFloat(amount);
  } else {
    numAmount = amount;
  }
  
  return !isNaN(numAmount) && 
         numAmount >= ESCROW_LIMITS.MIN_USDC && 
         numAmount <= ESCROW_LIMITS.MAX_USDC;
};

/**
 * Validate fee basis points (0-10000)
 */
export const isValidFeeBps = (bps: number): boolean => {
  return Number.isInteger(bps) && bps >= 0 && bps <= 10000;
};

/**
 * Validate expiry timestamp (must be in the future)
 */
export const isValidExpiry = (expiry: Date | string): boolean => {
  const expiryDate = typeof expiry === 'string' ? new Date(expiry) : expiry;
  const now = new Date();
  return expiryDate > now;
};

/**
 * Validate NFT mint address (Solana public key)
 */
export const isValidNFTMint = (mint: string): boolean => {
  return isValidSolanaAddress(mint);
};

