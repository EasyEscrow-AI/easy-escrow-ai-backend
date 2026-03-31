import { Connection, PublicKey } from '@solana/web3.js';
import { Decimal } from '@prisma/client/runtime/library';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

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
    if (!/^\d+(\.\d+)?$/.test(amount.trim())) return false;
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
 * Validate NFT mint address (Solana public key) - Synchronous check only
 * Note: This only validates the address format.
 * Use isValidNFTMintOnChain() for full validation including on-chain checks.
 */
export const isValidNFTMint = (mint: string): boolean => {
  return isValidSolanaAddress(mint);
};

/**
 * Validate NFT mint address on-chain - CRITICAL FIX for Error 3007
 * 
 * Verifies that the provided address is:
 * 1. A valid Solana address
 * 2. An existing on-chain account
 * 3. Owned by the Token Program (not System Program or other programs)
 * 4. A valid token mint account
 * 
 * This prevents the "AccountOwnedByWrongProgram" error (3007) that occurs
 * when users pass wallet addresses or system accounts instead of NFT mint addresses.
 * 
 * @param mint - The NFT mint address to validate
 * @param connection - Solana RPC connection
 * @returns Promise<{valid: boolean, error?: string}>
 */
export const isValidNFTMintOnChain = async (
  mint: string,
  connection: Connection
): Promise<{ valid: boolean; error?: string }> => {
  try {
    // First check format
    if (!isValidSolanaAddress(mint)) {
      return { valid: false, error: 'Invalid address format' };
    }

    const mintPubkey = new PublicKey(mint);
    
    // Fetch account info from blockchain
    const accountInfo = await connection.getAccountInfo(mintPubkey);
    
    // Check if account exists
    if (!accountInfo) {
      return { valid: false, error: 'NFT mint account does not exist on-chain' };
    }
    
    // CRITICAL CHECK: Verify account is owned by Token Program
    // This prevents Error 3007 "AccountOwnedByWrongProgram"
    if (!accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
      return {
        valid: false,
        error: `Invalid NFT mint: account is owned by ${accountInfo.owner.toBase58()}, expected Token Program (${TOKEN_PROGRAM_ID.toBase58()}). You may have provided a wallet address instead of an NFT mint address.`
      };
    }
    
    // Verify it's a valid mint account (mint accounts are 82 bytes)
    if (accountInfo.data.length !== 82) {
      return { valid: false, error: 'Invalid mint account: incorrect data length' };
    }
    
    return { valid: true };
    
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate NFT mint: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

