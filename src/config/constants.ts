/**
 * Atomic Swap Constants
 * 
 * Centralized configuration for program IDs, fee collectors, and atomic swap settings
 * across different environments (local/staging/production).
 */

import { PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

/**
 * Solana Network Type
 */
export type SolanaNetwork = 'local' | 'staging' | 'production';

/**
 * Program ID Configuration
 */
export interface ProgramConfig {
  /** Current program ID based on environment */
  programId: PublicKey;
  /** Program ID as string */
  programIdString: string;
  /** Treasury wallet address (where fees are initially collected) */
  treasuryAddress: PublicKey;
  /** Treasury wallet address as string */
  treasuryAddressString: string;
  /** Fee collector address (cold storage for weekly transfers) */
  feeCollectorAddress: PublicKey;
  /** Fee collector address as string */
  feeCollectorAddressString: string;
  /** Current network */
  network: SolanaNetwork;
  /** Authority keypair path (for transaction signing) */
  authorityKeypairPath?: string;
  /** Deployer keypair path (for program upgrades) */
  deployerKeypairPath?: string;
}

/**
 * Load program ID from wallets directory
 */
function loadProgramIdFromKeypair(network: SolanaNetwork): string | null {
  try {
    const walletsDir = path.join(process.cwd(), 'wallets');
    let keypairPath: string;

    switch (network) {
      case 'staging':
        keypairPath = path.join(walletsDir, 'staging', 'escrow-program-keypair.json');
        break;
      case 'production':
        keypairPath = path.join(walletsDir, 'production', 'escrow-program-keypair.json');
        break;
      case 'local':
        // For local, we'll use environment variable or default
        return null;
      default:
        return null;
    }

    if (fs.existsSync(keypairPath)) {
      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      const publicKey = new PublicKey(keypairData).toBase58();
      console.log(`✅ Loaded ${network} program ID from keypair: ${publicKey}`);
      return publicKey;
    }

    return null;
  } catch (error) {
    console.warn(`⚠️  Could not load program ID from keypair for ${network}:`, error);
    return null;
  }
}

/**
 * Get current Solana network from environment
 */
export function getCurrentNetwork(): SolanaNetwork {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const solanaNetwork = process.env.SOLANA_NETWORK;

  // If SOLANA_NETWORK is explicitly set, use it
  if (solanaNetwork) {
    if (solanaNetwork === 'local' || solanaNetwork === 'localnet' || solanaNetwork === 'development') {
      return 'local';
    }
    if (solanaNetwork === 'staging' || solanaNetwork === 'devnet') {
      return 'staging';
    }
    if (solanaNetwork === 'production' || solanaNetwork === 'mainnet-beta' || solanaNetwork === 'mainnet') {
      return 'production';
    }
  }

  // Fallback to NODE_ENV
  if (nodeEnv === 'production') {
    return 'production';
  }
  if (nodeEnv === 'staging') {
    return 'staging';
  }
  return 'local';
}

/**
 * Get program ID for current environment
 */
export function getProgramId(): string {
  const network = getCurrentNetwork();

  switch (network) {
    case 'staging':
      // Try environment variable first, then keypair, then hardcoded known value
      return (
        process.env.STAGING_PROGRAM_ID ||
        loadProgramIdFromKeypair('staging') ||
        'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei' // Known staging program ID
      );

    case 'production':
      // Production program is already deployed, just needs upgrading with atomic swap functionality
      return (
        process.env.PRODUCTION_PROGRAM_ID ||
        loadProgramIdFromKeypair('production') ||
        '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx' // Known production program ID (already deployed)
      );

    case 'local':
    default:
      // For local development, allow dynamic program ID from test validator
      return (
        process.env.LOCAL_PROGRAM_ID ||
        process.env.ESCROW_PROGRAM_ID ||
        'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS' // Default localnet ID
      );
  }
}

/**
 * Get treasury wallet address for current environment
 * Treasury wallets temporarily hold platform fees before weekly reconciliation and transfer to cold storage
 */
export function getTreasuryAddress(): string {
  const network = getCurrentNetwork();
  const walletsDir = path.join(process.cwd(), 'wallets');

  switch (network) {
    case 'staging':
      // Try environment variable first, then load from keypair file
      if (process.env.DEVNET_STAGING_TREASURY_ADDRESS) {
        return process.env.DEVNET_STAGING_TREASURY_ADDRESS;
      }
      
      try {
        const treasuryPath = path.join(walletsDir, 'staging', 'staging-treasury.json');
        if (fs.existsSync(treasuryPath)) {
          const keypairData = JSON.parse(fs.readFileSync(treasuryPath, 'utf-8'));
          return new PublicKey(keypairData).toBase58();
        }
      } catch (error) {
        console.warn('⚠️  Could not load staging treasury from keypair file:', error);
      }
      
      // Hardcoded fallback (staging treasury public key)
      return 'AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu';

    case 'production':
      // Try environment variable first, then load from keypair file
      if (process.env.MAINNET_PRODUCTION_TREASURY_ADDRESS) {
        return process.env.MAINNET_PRODUCTION_TREASURY_ADDRESS;
      }
      
      try {
        const treasuryPath = path.join(walletsDir, 'production', 'production-treasury.json');
        if (fs.existsSync(treasuryPath)) {
          const keypairData = JSON.parse(fs.readFileSync(treasuryPath, 'utf-8'));
          return new PublicKey(keypairData).toBase58();
        }
      } catch (error) {
        console.warn('⚠️  Could not load production treasury from keypair file:', error);
      }

      // Hardcoded fallback (production treasury public key)
      return '9VN2bzjWoF1HsmyPrNtwXbBMxCYRNsFagC6pcfLmN7LA';

    case 'local':
    default:
      // For local, use staging treasury as fallback
      return (
        process.env.LOCAL_TREASURY_ADDRESS ||
        process.env.DEVNET_STAGING_TREASURY_ADDRESS ||
        'AScijLJ1ApcQftktBRN818b8LDH4JJovQ5qrGDHfHuPu' // Fallback to staging treasury
      );
  }
}

/**
 * Get fee collector address for current environment
 * This is the COLD STORAGE address where fees are ultimately stored after weekly reconciliation
 * 
 * NOTE: Platform fees now go to treasury wallet first (getTreasuryAddress),
 * then are moved to this cold storage collector weekly after prize distribution
 */
export function getFeeCollectorAddress(): string {
  const network = getCurrentNetwork();

  switch (network) {
    case 'staging':
      return (
        process.env.STAGING_FEE_COLLECTOR_ADDRESS ||
        process.env.DEVNET_STAGING_FEE_COLLECTOR_ADDRESS ||
        '8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ' // Known staging fee collector (cold storage)
      );

    case 'production':
      const prodCollector = process.env.MAINNET_PROD_FEE_COLLECTOR_ADDRESS;
      if (!prodCollector) {
        throw new Error(
          'MAINNET_PROD_FEE_COLLECTOR_ADDRESS must be set for production environment'
        );
      }
      return prodCollector;

    case 'local':
    default:
      // For local, allow any address or use a default test address
      return (
        process.env.LOCAL_FEE_COLLECTOR_ADDRESS ||
        process.env.PLATFORM_FEE_COLLECTOR_ADDRESS ||
        '8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ' // Fallback to staging for local testing
      );
  }
}

/**
 * Get platform authority keypair path for current environment
 */
export function getPlatformAuthorityPath(): string | undefined {
  const network = getCurrentNetwork();
  const walletsDir = path.join(process.cwd(), 'wallets');

  // If explicitly set via environment variable, use that
  if (process.env.PLATFORM_AUTHORITY_KEYPAIR_PATH) {
    return process.env.PLATFORM_AUTHORITY_KEYPAIR_PATH;
  }

  // Otherwise, use environment-specific default
  switch (network) {
    case 'staging':
      return path.join(walletsDir, 'staging', 'staging-admin.json');
    case 'production':
      return path.join(walletsDir, 'production', 'production-admin.json');
    case 'local':
    default:
      // For local, look for local admin or create a test keypair
      const localAdminPath = path.join(walletsDir, 'local', 'local-admin.json');
      if (fs.existsSync(localAdminPath)) {
        return localAdminPath;
      }
      return undefined; // Will be generated on first use
  }
}

/**
 * Get program deployer (upgrade authority) keypair path for current environment
 * Used for upgrading Solana programs
 */
export function getProgramDeployerPath(): string | undefined {
  const network = getCurrentNetwork();
  const walletsDir = path.join(process.cwd(), 'wallets');

  // If explicitly set via environment variable, use that
  if (process.env.PROGRAM_DEPLOYER_KEYPAIR_PATH) {
    return process.env.PROGRAM_DEPLOYER_KEYPAIR_PATH;
  }

  // Otherwise, use environment-specific default
  switch (network) {
    case 'staging':
      return path.join(walletsDir, 'staging', 'staging-deployer.json');
    case 'production':
      return path.join(walletsDir, 'production', 'production-deployer.json');
    case 'local':
    default:
      // For local, deployer is the same as authority
      const localAdminPath = path.join(walletsDir, 'local', 'local-admin.json');
      if (fs.existsSync(localAdminPath)) {
        return localAdminPath;
      }
      return undefined;
  }
}

/**
 * Get full program configuration for current environment
 */
export function getProgramConfig(): ProgramConfig {
  const programIdString = getProgramId();
  const treasuryAddressString = getTreasuryAddress();
  const feeCollectorAddressString = getFeeCollectorAddress();
  const network = getCurrentNetwork();

  return {
    programId: new PublicKey(programIdString),
    programIdString,
    treasuryAddress: new PublicKey(treasuryAddressString),
    treasuryAddressString,
    feeCollectorAddress: new PublicKey(feeCollectorAddressString),
    feeCollectorAddressString,
    network,
    authorityKeypairPath: getPlatformAuthorityPath(),
    deployerKeypairPath: getProgramDeployerPath(),
  };
}

/**
 * Validate program configuration
 * Ensures all required configuration is present and valid
 */
export function validateProgramConfig(): void {
  const config = getProgramConfig();

  // Validate program ID is not a placeholder
  const invalidIds = [
    '11111111111111111111111111111111',
    '00000000000000000000000000000000',
    'YOUR_PROGRAM_ID_HERE',
    'REPLACE_ME',
  ];

  if (invalidIds.includes(config.programIdString)) {
    throw new Error(
      `Invalid program ID: ${config.programIdString}. ` +
      `Please set ${config.network.toUpperCase()}_PROGRAM_ID environment variable.`
    );
  }

  // Validate treasury address
  if (invalidIds.includes(config.treasuryAddressString)) {
    throw new Error(
      `Invalid treasury address: ${config.treasuryAddressString}. ` +
      `Please set treasury address for ${config.network} environment.`
    );
  }

  // Validate fee collector address
  if (invalidIds.includes(config.feeCollectorAddressString)) {
    throw new Error(
      `Invalid fee collector address: ${config.feeCollectorAddressString}. ` +
      `Please set fee collector address for ${config.network} environment.`
    );
  }

  // For production, ensure fee collector is configured
  if (config.network === 'production') {
    if (!process.env.MAINNET_PROD_FEE_COLLECTOR_ADDRESS) {
      throw new Error(
        'Production environment requires explicit MAINNET_PROD_FEE_COLLECTOR_ADDRESS'
      );
    }
  }

  console.log('✅ Program configuration validated');
  console.log(`   Network: ${config.network}`);
  console.log(`   Program ID: ${config.programIdString}`);
  console.log(`   Treasury (Active Fee Collection): ${config.treasuryAddressString}`);
  console.log(`   Fee Collector (Cold Storage): ${config.feeCollectorAddressString}`);
  if (config.authorityKeypairPath) {
    console.log(`   Authority: ${config.authorityKeypairPath}`);
  }
  if (config.deployerKeypairPath) {
    console.log(`   Deployer (Upgrade Authority): ${config.deployerKeypairPath}`);
  }
}

/**
 * Known program IDs for each environment (for reference)
 */
export const KNOWN_PROGRAM_IDS = {
  staging: 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei',
  production: '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx', // Already deployed, needs upgrade
  local: 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS', // Default localnet
} as const;

/**
 * Known fee collector addresses for each environment (for reference)
 */
export const KNOWN_FEE_COLLECTORS = {
  staging: '8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ',
} as const;

// Export singleton instance
let _programConfig: ProgramConfig | null = null;

/**
 * Get cached program configuration
 * Initializes on first access and caches for subsequent calls
 */
export function getAtomicSwapProgramConfig(): ProgramConfig {
  if (!_programConfig) {
    _programConfig = getProgramConfig();
  }
  return _programConfig;
}

/**
 * Reset cached configuration (useful for testing)
 */
export function resetProgramConfig(): void {
  _programConfig = null;
}

export default {
  getProgramConfig: getAtomicSwapProgramConfig,
  getCurrentNetwork,
  getPlatformAuthorityPath,
  getProgramDeployerPath,
  getTreasuryAddress,
  getFeeCollectorAddress,
  validateProgramConfig,
  resetProgramConfig,
  KNOWN_PROGRAM_IDS,
  KNOWN_FEE_COLLECTORS,
};

