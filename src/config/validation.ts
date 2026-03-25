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
import {
  loadInstitutionEscrowConfig,
  type InstitutionEscrowConfig,
} from './institution-escrow.config';
import {
  loadPrivacyConfig,
  validatePrivacyConfig as validatePrivacyCfg,
} from '../services/privacy/privacy.config';

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
  console.log(
    `   Percentage fee: ${feeConfig.percentageFeeBps} BPS (${feeConfig.percentageFeeRate * 100}%)`
  );
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
  console.log(
    `   Default expiration: ${offerConfig.defaultExpirationMs / (24 * 60 * 60 * 1000)} days`
  );
  console.log(`   Max assets per side: ${offerConfig.maxAssetsPerSide}`);

  // Validate nonce pool configuration
  const nonceConfig = getNoncePoolConfig();
  console.log('✅ Nonce pool configuration valid');
  console.log(`   Pool size: ${nonceConfig.minPoolSize} - ${nonceConfig.maxPoolSize}`);
  console.log(`   Replenishment threshold: ${nonceConfig.replenishmentThreshold}`);
}

/**
 * Validates institution escrow configuration.
 * Only runs when INSTITUTION_ESCROW_ENABLED=true.
 * @throws {ConfigurationError} if required config is missing or invalid
 */
export function validateInstitutionEscrowConfig(cfg?: InstitutionEscrowConfig): void {
  const escrowConfig = cfg || loadInstitutionEscrowConfig();

  if (!escrowConfig.enabled) {
    return; // Skip validation when feature is disabled
  }

  console.log('\n🔍 Validating institution escrow configuration...');

  // USDC mint address must be set and look like a valid Solana address (base58, 32-44 chars)
  if (
    !escrowConfig.usdcMintAddress ||
    escrowConfig.usdcMintAddress.length < 32 ||
    escrowConfig.usdcMintAddress.length > 44
  ) {
    throw new ConfigurationError(
      'USDC_MINT_ADDRESS is required when INSTITUTION_ESCROW_ENABLED=true.\n' +
        'Must be a valid Solana public key (base58 encoded, 32-44 characters).'
    );
  }

  // JWT secret must be at least 32 characters
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32) {
    throw new ConfigurationError(
      'JWT_SECRET must be at least 32 characters when INSTITUTION_ESCROW_ENABLED=true.\n' +
        `Current length: ${jwtSecret.length}`
    );
  }

  // Min/max USDC validation
  if (escrowConfig.minUsdc <= 0) {
    throw new ConfigurationError('INSTITUTION_ESCROW_MIN_USDC must be greater than 0.');
  }

  if (escrowConfig.maxUsdc <= 0) {
    throw new ConfigurationError('INSTITUTION_ESCROW_MAX_USDC must be greater than 0.');
  }

  if (escrowConfig.minUsdc >= escrowConfig.maxUsdc) {
    throw new ConfigurationError(
      `INSTITUTION_ESCROW_MIN_USDC (${escrowConfig.minUsdc}) must be less than ` +
        `INSTITUTION_ESCROW_MAX_USDC (${escrowConfig.maxUsdc}).`
    );
  }

  if (escrowConfig.maxUsdc > 100_000_000) {
    throw new ConfigurationError(
      `INSTITUTION_ESCROW_MAX_USDC (${escrowConfig.maxUsdc}) exceeds safety limit of 100,000,000 USDC.`
    );
  }

  // Default expiry hours
  if (escrowConfig.defaultExpiryHours < 1 || escrowConfig.defaultExpiryHours > 720) {
    throw new ConfigurationError(
      `INSTITUTION_ESCROW_DEFAULT_EXPIRY_HOURS (${escrowConfig.defaultExpiryHours}) ` +
        'must be between 1 and 720 hours (30 days).'
    );
  }

  // AI: if Anthropic API key is set, validate it looks reasonable
  if (escrowConfig.ai.apiKey && escrowConfig.ai.apiKey.length < 10) {
    throw new ConfigurationError('ANTHROPIC_API_KEY appears invalid (too short).');
  }

  // DO Spaces: validate all-or-nothing (if any field is set, all must be set)
  const spacesFields = [
    escrowConfig.doSpaces.key,
    escrowConfig.doSpaces.secret,
    escrowConfig.doSpaces.endpoint,
    escrowConfig.doSpaces.bucket,
    escrowConfig.doSpaces.region,
  ];
  const spacesSet = spacesFields.filter((f) => f.length > 0);
  if (spacesSet.length > 0 && spacesSet.length < spacesFields.length) {
    throw new ConfigurationError(
      'DO Spaces configuration is incomplete. When any DO_SPACES_* variable is set, ' +
        'all must be provided: DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_ENDPOINT, ' +
        'DO_SPACES_BUCKET, DO_SPACES_REGION.'
    );
  }

  console.log('✅ Institution escrow configuration valid');
  console.log(`   USDC Mint: ${escrowConfig.usdcMintAddress}`);
  console.log(`   Limits: $${escrowConfig.minUsdc} - $${escrowConfig.maxUsdc} USDC`);
  console.log(`   Default expiry: ${escrowConfig.defaultExpiryHours} hours`);
  console.log(`   AI model: ${escrowConfig.ai.model}`);
  console.log(`   DO Spaces: ${spacesSet.length > 0 ? 'configured' : 'not configured'}`);
}

/**
 * Validates privacy configuration.
 * Only runs when PRIVACY_ENABLED is not explicitly 'false'.
 * @throws {ConfigurationError} if required config is missing
 */
export function validatePrivacyStartupConfig(): void {
  const privacyConfig = loadPrivacyConfig();

  if (!privacyConfig.enabled) {
    return;
  }

  console.log('\n🔍 Validating privacy configuration...');

  const errors = validatePrivacyCfg(privacyConfig);
  if (errors.length > 0) {
    throw new ConfigurationError(
      'Privacy configuration invalid:\n' + errors.map((e) => `  - ${e}`).join('\n')
    );
  }

  console.log('✅ Privacy configuration valid');
  console.log(`   Default level: ${privacyConfig.defaultPrivacyLevel}`);
  console.log(`   Jito default: ${privacyConfig.jitoDefault}`);
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

    // Validate institution escrow config (only when enabled)
    validateInstitutionEscrowConfig();

    // Validate privacy config (only when enabled)
    validatePrivacyStartupConfig();
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error('❌ Configuration Error:', error.message);
      throw error;
    }
    throw error;
  }
}
