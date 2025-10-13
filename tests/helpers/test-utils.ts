import { Keypair, PublicKey } from '@solana/web3.js';
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

