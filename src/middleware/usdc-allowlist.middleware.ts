import { Request, Response, NextFunction } from 'express';
import { PublicKey } from '@solana/web3.js';

/**
 * USDC Mint Allowlist Middleware (LEGACY - KEPT FOR FUTURE USDC SUPPORT)
 * 
 * Validates that only approved USDC mint addresses are accepted
 * 
 * NOTE: This middleware is currently not used in production (V2 uses SOL).
 * We're keeping it for potential future USDC support if we decide to re-enable
 * USDC-based escrows alongside SOL-based escrows.
 * 
 * @deprecated V2 uses SOL deposits, not USDC
 */

/**
 * Official USDC mint addresses for different Solana networks
 */
const USDC_MINTS = {
  mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  devnet: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
  testnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

/**
 * Get allowed USDC mint addresses based on environment
 */
const getAllowedUSDCMints = (): string[] => {
  const network = process.env.SOLANA_NETWORK || 'devnet';
  const customMints = process.env.ALLOWED_USDC_MINTS?.split(',') || [];
  
  const defaultMints: string[] = [];
  
  switch (network) {
    case 'mainnet-beta':
    case 'mainnet':
      defaultMints.push(USDC_MINTS.mainnet);
      break;
    case 'devnet':
      defaultMints.push(USDC_MINTS.devnet);
      break;
    case 'testnet':
      defaultMints.push(USDC_MINTS.testnet);
      break;
    default:
      // If unknown network, allow devnet mint
      defaultMints.push(USDC_MINTS.devnet);
  }
  
  // Combine default and custom mints
  return [...defaultMints, ...customMints.map(m => m.trim())];
};

/**
 * Validate that a mint address is in the allowlist
 */
export const validateUSDCMint = (mintAddress: string): boolean => {
  try {
    // Validate it's a valid Solana public key
    new PublicKey(mintAddress);
    
    const allowedMints = getAllowedUSDCMints();
    return allowedMints.includes(mintAddress);
  } catch (error) {
    return false;
  }
};

/**
 * Middleware to validate USDC mint in request body
 * Expects mint address in body.usdc_mint or body.usdcMint
 */
export const validateUSDCMintMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Get mint from various possible field names
    const usdcMint = req.body.usdc_mint || req.body.usdcMint || req.body.mint;
    
    // If no USDC mint in request, skip validation
    // (some endpoints may not require it)
    if (!usdcMint) {
      next();
      return;
    }
    
    // Validate the mint address
    if (!validateUSDCMint(usdcMint)) {
      res.status(400).json({
        error: 'Invalid USDC Mint',
        message: 'The provided USDC mint address is not in the allowlist',
        field: 'usdc_mint',
        allowedMints: getAllowedUSDCMints(),
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    next();
  } catch (error) {
    console.error('Error in USDC mint validation:', error);
    res.status(500).json({
      error: 'Validation Error',
      message: 'Failed to validate USDC mint address',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Get list of allowed USDC mints for API responses
 */
export const getAllowedMints = (): { network: string; mints: string[] } => {
  return {
    network: process.env.SOLANA_NETWORK || 'devnet',
    mints: getAllowedUSDCMints(),
  };
};

