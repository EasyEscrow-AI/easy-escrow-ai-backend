/**
 * Shared Admin Keypair Loader
 *
 * Loads the platform admin keypair from environment variables based on NODE_ENV.
 * Used by escrow-program.service.ts.
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { logger } from '../services/logger.service';

/**
 * Get the environment variable name and value for the admin keypair
 * based on the current NODE_ENV.
 */
function getKeypairEnvConfig(): { envName: string; envValue: string | undefined } {
  const nodeEnv = process.env.NODE_ENV || 'development';

  switch (nodeEnv) {
    case 'staging':
      return {
        envName: 'DEVNET_STAGING_ADMIN_PRIVATE_KEY',
        envValue: process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY,
      };
    case 'production':
      return {
        envName: 'MAINNET_ADMIN_PRIVATE_KEY',
        envValue: process.env.MAINNET_ADMIN_PRIVATE_KEY,
      };
    case 'development':
    case 'test':
    default:
      return {
        envName: 'DEVNET_ADMIN_PRIVATE_KEY',
        envValue: process.env.DEVNET_ADMIN_PRIVATE_KEY,
      };
  }
}

/**
 * Load admin keypair from environment based on NODE_ENV.
 *
 * Supports multiple formats:
 * - JSON array: [1, 2, 3, ..., 64]
 * - Base58 string (Solana standard)
 * - Base64 string
 *
 * @param serviceName - Name of the calling service for logging (e.g., 'EscrowProgramService')
 * @returns Keypair instance
 * @throws Error if keypair is not configured or cannot be parsed
 */
export function loadAdminKeypair(serviceName: string = 'AdminKeypair'): Keypair {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const { envName, envValue } = getKeypairEnvConfig();

  if (!envValue) {
    throw new Error(
      `[${serviceName}] Admin keypair not configured for ${nodeEnv}. Set ${envName}`
    );
  }

  // Try JSON array format [1, 2, 3, ..., 64]
  if (envValue.startsWith('[')) {
    try {
      const parsed = JSON.parse(envValue);
      const secretKey = Uint8Array.from(parsed);
      const keypair = Keypair.fromSecretKey(secretKey);
      logger.info(
        `[${serviceName}] Loaded admin keypair from ${envName} (${nodeEnv}): ${keypair.publicKey.toString()}`
      );
      return keypair;
    } catch (error) {
      throw new Error(
        `[${serviceName}] Failed to parse JSON array keypair from ${envName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // Try Base58 format (Solana standard)
  try {
    const secretKey = bs58.decode(envValue);
    if (secretKey.length === 64) {
      const keypair = Keypair.fromSecretKey(secretKey);
      logger.info(
        `[${serviceName}] Loaded admin keypair from ${envName} (${nodeEnv}): ${keypair.publicKey.toString()}`
      );
      return keypair;
    }
  } catch (base58Error) {
    // Base58 decode failed, try Base64 next
    logger.debug?.(
      `[${serviceName}] Base58 decode failed for ${envName}, trying Base64: ${
        base58Error instanceof Error ? base58Error.message : 'Unknown error'
      }`
    );
  }

  // Try Base64 format
  try {
    const base64Key = Buffer.from(envValue, 'base64');
    if (base64Key.length === 64) {
      const keypair = Keypair.fromSecretKey(base64Key);
      logger.info(
        `[${serviceName}] Loaded admin keypair from ${envName} (${nodeEnv}): ${keypair.publicKey.toString()}`
      );
      return keypair;
    }
  } catch (base64Error) {
    throw new Error(
      `[${serviceName}] Failed to parse Base64 keypair from ${envName}: ${
        base64Error instanceof Error ? base64Error.message : 'Unknown error'
      }`
    );
  }

  // None of the formats matched
  throw new Error(
    `[${serviceName}] Unsupported keypair format in ${envName}. ` +
      `Expected JSON array [1,2,...,64], Base58 string (64 bytes), or Base64 string (64 bytes).`
  );
}
