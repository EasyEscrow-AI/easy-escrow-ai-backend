/**
 * Configuration Validation
 * 
 * Validates required environment variables and prevents runtime errors
 * from misconfiguration.
 */

import { config } from './index';
import { validateProgramConfig } from './constants';
import { getFeeConfig, getCNFTIndexerConfig, getSwapOfferConfig } from './atomicSwap.config';
import { getNoncePoolConfig } from './noncePool.config';

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
 * Validates atomic swap configuration
 * @throws {ConfigurationError} if any atomic swap config is invalid
 */
export function validateAtomicSwapConfig(): void {
  // Validate program configuration (program ID, fee collector, network)
  validateProgramConfig();
  
  // Validate fee configuration
  const feeConfig = getFeeConfig();
  console.log('✅ Fee configuration valid');
  console.log(`   Flat fee: ${feeConfig.flatFeeSol} SOL`);
  console.log(`   Percentage fee: ${feeConfig.percentageFeeBps} BPS (${feeConfig.percentageFeeRate * 100}%)`);
  console.log(`   Max fee: ${feeConfig.maxFeeSol} SOL`);
  
  // Validate cNFT indexer configuration
  const cnftConfig = getCNFTIndexerConfig();
  console.log('✅ cNFT Indexer configuration valid');
  console.log(`   API URL: ${cnftConfig.apiUrl}`);
  console.log(`   Timeout: ${cnftConfig.timeoutMs}ms`);
  console.log(`   Caching: ${cnftConfig.enableCaching ? 'enabled' : 'disabled'}`);
  
  // Validate swap offer configuration
  const offerConfig = getSwapOfferConfig();
  console.log('✅ Swap offer configuration valid');
  console.log(`   Default expiration: ${offerConfig.defaultExpirationMs / (24 * 60 * 60 * 1000)} days`);
  console.log(`   Max assets per side: ${offerConfig.maxAssetsPerSide}`);
  
  // Validate nonce pool configuration
  const nonceConfig = getNoncePoolConfig();
  console.log('✅ Nonce pool configuration valid');
  console.log(`   Pool size: ${nonceConfig.minPoolSize} - ${nonceConfig.maxPoolSize}`);
  console.log(`   Replenishment threshold: ${nonceConfig.replenishmentThreshold}`);
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
    
    console.log('\n🔍 Validating atomic swap configuration...');
    validateAtomicSwapConfig();
    console.log('✅ All atomic swap configurations valid');
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error('❌ Configuration Error:', error.message);
      throw error;
    }
    throw error;
  }
}

