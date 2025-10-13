import { PublicKey } from '@solana/web3.js';

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
 * Validate USDC amount (must be positive and within reasonable bounds)
 */
export const isValidUSDCAmount = (amount: number | string): boolean => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return !isNaN(numAmount) && numAmount > 0 && numAmount < 1e15; // Max 1 quadrillion USDC
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

