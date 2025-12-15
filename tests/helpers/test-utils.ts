import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

/**
 * Generate test keypair
 */
export const generateTestKeypair = (): Keypair => {
  return Keypair.generate();
};

/**
 * Generate test public key
 */
export const generateTestPublicKey = (): PublicKey => {
  return Keypair.generate().publicKey;
};

/**
 * Generate test BN value
 */
export const generateTestBN = (value: number): anchor.BN => {
  return new anchor.BN(value);
};

/**
 * Wait for specified milliseconds
 */
export const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Generate test timestamp (current time + offset in seconds)
 */
export const generateTestTimestamp = (offsetSeconds: number = 0): Date => {
  return new Date(Date.now() + offsetSeconds * 1000);
};

/**
 * Generate test agreement ID
 */
export const generateTestAgreementId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `TEST-${timestamp}-${random}`.toUpperCase();
};

/**
 * Generate test Solana address
 */
export const generateTestSolanaAddress = (): string => {
  return Keypair.generate().publicKey.toString();
};

/**
 * Assert error message contains text
 */
export const assertErrorContains = (error: unknown, text: string): boolean => {
  if (error instanceof Error) {
    return error.message.includes(text);
  }
  return false;
};

/**
 * Mock environment variables
 */
export const mockEnvVars = (vars: Record<string, string>): void => {
  Object.entries(vars).forEach(([key, value]) => {
    process.env[key] = value;
  });
};

/**
 * Restore environment variables
 */
export const restoreEnvVars = (originalVars: Record<string, string | undefined>): void => {
  Object.entries(originalVars).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
};

/**
 * Convert USDC amount to lamports (6 decimals)
 */
export const usdcToLamports = (amount: number): number => {
  return amount * 1_000_000;
};

/**
 * Convert lamports to USDC (6 decimals)
 */
export const lamportsToUsdc = (lamports: number): number => {
  return lamports / 1_000_000;
};

/**
 * Convert SOL to lamports
 */
export const solToLamports = (sol: number): number => {
  return sol * 1_000_000_000;
};

/**
 * Confirm a transaction and check for errors
 * 
 * IMPORTANT: connection.confirmTransaction() returns success even if the program
 * instruction fails! You MUST check confirmation.value.err to detect program errors.
 * 
 * @param connection - Solana connection
 * @param signature - Transaction signature to confirm
 * @param commitment - Commitment level (default: 'confirmed')
 * @throws Error if transaction failed (either confirmation timeout or program error)
 */
export const confirmTransactionAndCheckError = async (
  connection: Connection,
  signature: string,
  commitment: 'confirmed' | 'finalized' = 'confirmed'
): Promise<void> => {
  const confirmation = await connection.confirmTransaction(signature, commitment);
  
  // CRITICAL: Check for program errors!
  // A transaction can be "confirmed" (included in a block) but still have failed
  if (confirmation.value.err) {
    const errorJson = JSON.stringify(confirmation.value.err);
    
    // Parse error to give a better message
    let errorMessage = `Transaction failed: ${errorJson}`;
    const err = confirmation.value.err as any;
    
    // Check for custom program error (InstructionError with Custom code)
    if (err.InstructionError) {
      const [instructionIndex, errorDetail] = err.InstructionError;
      if (errorDetail?.Custom !== undefined) {
        // Map of known error codes from escrow program
        const errorCodes: { [key: number]: string } = {
          0: 'Unauthorized',
          1: 'InvalidFee',
          2: 'FeeTooHigh',
          3: 'MakerAssetOwnershipFailed',
          4: 'TakerAssetOwnershipFailed',
          5: 'InsufficientMakerBalance',
          6: 'InsufficientTakerBalance',
          7: 'InvalidTokenAccount',
          8: 'InvalidMerkleProof',
          9: 'TooManyAssets',
          10: 'InvalidSwapId',
          11: 'ArithmeticOverflow',
          12: 'ProgramPaused',
          13: 'AlreadyPaused',
          14: 'NotPaused',
          15: 'WithdrawalTooFrequent',
          16: 'InsufficientTreasuryBalance',
          17: 'UnauthorizedWithdrawalDestination',
          18: 'InvalidCnftProof',
          19: 'MissingBubblegumProgram',
          20: 'MissingMerkleTree',
          21: 'StaleProof',
          22: 'ConflictingAssetFlags',
          23: 'UnauthorizedZeroFeeSwap',
          24: 'MissingCoreAsset',
          25: 'MissingMplCoreProgram',
          26: 'InvalidMplCoreProgram',
        };
        
        const errorName = errorCodes[errorDetail.Custom] || `Unknown error code ${errorDetail.Custom}`;
        errorMessage = `Program error: Instruction #${instructionIndex + 1} failed with custom error code ${errorDetail.Custom} (${errorName})`;
      }
    }
    
    throw new Error(errorMessage);
  }
};

