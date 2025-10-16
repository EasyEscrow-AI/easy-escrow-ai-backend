/**
 * Configuration Validation
 * 
 * Validates required environment variables and prevents runtime errors
 * from misconfiguration.
 */

import { config } from './index';

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Validates that the escrow program ID is set and valid
 * @throws {ConfigurationError} if program ID is missing or invalid
 */
export function validateEscrowProgramId(): string {
  const programId = config.solana?.escrowProgramId;

  if (!programId) {
    throw new ConfigurationError(
      'ESCROW_PROGRAM_ID environment variable is required but not set.\n' +
      'This must be set to the deployed Solana program address.\n' +
      'Example: ESCROW_PROGRAM_ID=7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV'
    );
  }

  // Validate it's a valid base58 public key (44 characters for Solana)
  if (programId.length < 32 || programId.length > 44) {
    throw new ConfigurationError(
      `Invalid ESCROW_PROGRAM_ID: "${programId}"\n` +
      'Must be a valid Solana public key (base58 encoded, 32-44 characters)'
    );
  }

  // Prevent using default/placeholder values
  const invalidIds = [
    '11111111111111111111111111111111', // System program
    '00000000000000000000000000000000', // Null
    'YOUR_PROGRAM_ID_HERE',
    'REPLACE_ME',
  ];

  if (invalidIds.includes(programId)) {
    throw new ConfigurationError(
      `ESCROW_PROGRAM_ID is set to a placeholder value: "${programId}"\n` +
      'You must set it to your actual deployed program address.\n' +
      'Deploy your program first, then set ESCROW_PROGRAM_ID to the deployment address.'
    );
  }

  return programId;
}

/**
 * Validates all critical Solana configuration
 * @throws {ConfigurationError} if any required config is missing
 */
export function validateSolanaConfig(): void {
  // Validate program ID
  validateEscrowProgramId();

  // Validate RPC URL
  if (!config.solana?.rpcUrl) {
    throw new ConfigurationError('SOLANA_RPC_URL is required');
  }

  // Validate network
  const validNetworks = ['localnet', 'devnet', 'testnet', 'mainnet-beta'];
  if (!config.solana?.network || !validNetworks.includes(config.solana.network)) {
    throw new ConfigurationError(
      `SOLANA_NETWORK must be one of: ${validNetworks.join(', ')}\n` +
      `Got: ${config.solana?.network || 'undefined'}`
    );
  }
}

/**
 * Validates configuration on application startup
 * Call this before starting the server
 */
export function validateConfig(): void {
  console.log('🔍 Validating configuration...');

  try {
    validateSolanaConfig();
    console.log('✅ Solana configuration valid');
    console.log(`   Program ID: ${config.solana?.escrowProgramId}`);
    console.log(`   Network: ${config.solana?.network}`);
    console.log(`   RPC: ${config.solana?.rpcUrl}`);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error('❌ Configuration Error:', error.message);
      throw error;
    }
    throw error;
  }
}

