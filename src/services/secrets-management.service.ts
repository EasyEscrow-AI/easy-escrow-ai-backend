/**
 * Secrets Management Service
 * 
 * Handles secure loading and management of keypairs and secrets from environment variables.
 * Ensures no secrets are hardcoded and provides validation for required secrets.
 * 
 * Security Features:
 * - Loads secrets only from environment variables
 * - Validates secret format and presence
 * - Provides secure in-memory storage
 * - Implements proper error handling
 * - Supports multiple secret formats (JSON, Base64, raw)
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Secret types supported by the service
 */
export enum SecretType {
  KEYPAIR = 'keypair',
  API_KEY = 'api_key',
  JWT_SECRET = 'jwt_secret',
  SIGNING_KEY = 'signing_key',
  WEBHOOK_SECRET = 'webhook_secret',
}

/**
 * Secret validation result
 */
export interface SecretValidationResult {
  valid: boolean;
  secretName: string;
  present: boolean;
  formatValid?: boolean;
  error?: string;
}

/**
 * Keypair configuration for loading from environment
 */
export interface KeypairConfig {
  envVarName: string;
  required: boolean;
  description: string;
}

/**
 * Secrets Management Service Class
 * 
 * Provides secure loading and validation of secrets from environment variables.
 * Never stores secrets in code or commits them to the repository.
 */
export class SecretsManagementService {
  private keypairs: Map<string, Keypair> = new Map();
  private secrets: Map<string, string> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize the secrets management service
   * Loads and validates all required secrets from environment variables
   */
  public async initialize(): Promise<void> {
    console.log('[SecretsManagementService] Initializing secrets management...');

    try {
      // Load API secrets
      this.loadApiSecrets();

      // Load Solana keypairs
      await this.loadSolanaKeypairs();

      // Load webhook secrets
      this.loadWebhookSecrets();

      this.initialized = true;
      console.log('[SecretsManagementService] Secrets management initialized successfully');
    } catch (error) {
      console.error('[SecretsManagementService] Failed to initialize:', error);
      throw new Error(`Secrets initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load API-related secrets (JWT, API keys, signing keys)
   */
  private loadApiSecrets(): void {
    console.log('[SecretsManagementService] Loading API secrets...');

    const apiSecrets = [
      { key: 'JWT_SECRET', required: false, description: 'JWT signing secret' },
      { key: 'API_KEY_SECRET', required: false, description: 'API key secret' },
      { key: 'RECEIPT_SIGNING_KEY', required: true, description: 'Receipt signing key' },
    ];

    for (const secret of apiSecrets) {
      const value = process.env[secret.key];
      
      if (!value && secret.required) {
        throw new Error(`Required secret ${secret.key} (${secret.description}) is not set in environment variables`);
      }

      if (value) {
        this.secrets.set(secret.key, value);
        console.log(`[SecretsManagementService] ✓ Loaded ${secret.description}`);
      } else {
        console.warn(`[SecretsManagementService] ⚠ Optional secret ${secret.key} not set`);
      }
    }
  }

  /**
   * Load Solana keypairs from environment variables
   * Supports multiple formats: JSON array, Base64, Base58
   */
  private async loadSolanaKeypairs(): Promise<void> {
    console.log('[SecretsManagementService] Loading Solana keypairs...');

    const keypairConfigs: KeypairConfig[] = [
      {
        envVarName: 'AUTHORITY_KEYPAIR',
        required: true,
        description: 'Authority keypair for signing transactions',
      },
      {
        envVarName: 'PLATFORM_KEYPAIR',
        required: false,
        description: 'Platform fee collector keypair',
      },
      {
        envVarName: 'BACKUP_KEYPAIR',
        required: false,
        description: 'Backup authority keypair',
      },
    ];

    for (const config of keypairConfigs) {
      try {
        const keypair = this.loadKeypairFromEnv(config.envVarName);
        
        if (keypair) {
          this.keypairs.set(config.envVarName, keypair);
          console.log(`[SecretsManagementService] ✓ Loaded ${config.description} (${keypair.publicKey.toBase58()})`);
        } else if (config.required) {
          throw new Error(`Required keypair ${config.envVarName} (${config.description}) is not set`);
        } else {
          console.warn(`[SecretsManagementService] ⚠ Optional keypair ${config.envVarName} not set`);
        }
      } catch (error) {
        const errorMsg = `Failed to load keypair ${config.envVarName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        
        if (config.required) {
          throw new Error(errorMsg);
        } else {
          console.warn(`[SecretsManagementService] ${errorMsg}`);
        }
      }
    }
  }

  /**
   * Load webhook secrets
   */
  private loadWebhookSecrets(): void {
    console.log('[SecretsManagementService] Loading webhook secrets...');

    const webhookSecret = process.env.WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.warn('[SecretsManagementService] ⚠ WEBHOOK_SECRET not set - webhooks will not be secure');
    } else {
      this.secrets.set('WEBHOOK_SECRET', webhookSecret);
      console.log('[SecretsManagementService] ✓ Loaded webhook secret');
    }
  }

  /**
   * Load a keypair from environment variable
   * Supports JSON array, Base64, and Base58 formats
   */
  private loadKeypairFromEnv(envVarName: string): Keypair | null {
    const envValue = process.env[envVarName];

    if (!envValue) {
      return null;
    }

    try {
      // Try JSON array format [1, 2, 3, ..., 64]
      if (envValue.startsWith('[')) {
        const secretKey = Uint8Array.from(JSON.parse(envValue));
        return Keypair.fromSecretKey(secretKey);
      }

      // Try Base58 format (common for Solana CLI)
      try {
        const secretKey = bs58.decode(envValue);
        if (secretKey.length === 64) {
          return Keypair.fromSecretKey(secretKey);
        }
      } catch {
        // Not Base58, continue to next format
      }

      // Try Base64 format
      try {
        const secretKey = Buffer.from(envValue, 'base64');
        if (secretKey.length === 64) {
          return Keypair.fromSecretKey(secretKey);
        }
      } catch {
        // Not Base64
      }

      throw new Error(`Unsupported keypair format for ${envVarName}. Supported formats: JSON array, Base58, Base64`);
    } catch (error) {
      throw new Error(`Failed to parse keypair from ${envVarName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a keypair by environment variable name
   */
  public getKeypair(envVarName: string): Keypair | null {
    if (!this.initialized) {
      throw new Error('SecretsManagementService not initialized. Call initialize() first.');
    }

    return this.keypairs.get(envVarName) || null;
  }

  /**
   * Get a secret by key
   */
  public getSecret(key: string): string | null {
    if (!this.initialized) {
      throw new Error('SecretsManagementService not initialized. Call initialize() first.');
    }

    return this.secrets.get(key) || null;
  }

  /**
   * Check if a keypair exists
   */
  public hasKeypair(envVarName: string): boolean {
    return this.keypairs.has(envVarName);
  }

  /**
   * Check if a secret exists
   */
  public hasSecret(key: string): boolean {
    return this.secrets.has(key);
  }

  /**
   * Validate all required secrets are present
   */
  public validateSecrets(): SecretValidationResult[] {
    const results: SecretValidationResult[] = [];

    // Validate required secrets
    const requiredSecrets = [
      { name: 'RECEIPT_SIGNING_KEY', type: SecretType.SIGNING_KEY },
      { name: 'AUTHORITY_KEYPAIR', type: SecretType.KEYPAIR },
    ];

    for (const required of requiredSecrets) {
      const present = required.type === SecretType.KEYPAIR
        ? this.hasKeypair(required.name)
        : this.hasSecret(required.name);

      results.push({
        valid: present,
        secretName: required.name,
        present,
        formatValid: present,
        error: present ? undefined : `Required secret ${required.name} is missing`,
      });
    }

    return results;
  }

  /**
   * Get environment variable configuration guide
   */
  public static getConfigurationGuide(): string {
    return `
Secrets Management Configuration Guide
========================================

Required Environment Variables:
-------------------------------
1. AUTHORITY_KEYPAIR (Required)
   - Description: Authority keypair for signing transactions
   - Format: JSON array [1,2,3,...,64] or Base58 or Base64
   - Example: AUTHORITY_KEYPAIR='[1,2,3,...,64]'

2. RECEIPT_SIGNING_KEY (Required)
   - Description: Key for signing receipt tokens
   - Format: Any string (minimum 32 characters recommended)
   - Example: RECEIPT_SIGNING_KEY='your-secure-random-string-here'

Optional Environment Variables:
-------------------------------
1. PLATFORM_KEYPAIR (Optional)
   - Description: Platform fee collector keypair
   - Format: JSON array [1,2,3,...,64] or Base58 or Base64

2. BACKUP_KEYPAIR (Optional)
   - Description: Backup authority keypair
   - Format: JSON array [1,2,3,...,64] or Base58 or Base64

3. WEBHOOK_SECRET (Optional)
   - Description: Secret for validating webhook signatures
   - Format: Any string
   - Example: WEBHOOK_SECRET='your-webhook-secret'

4. JWT_SECRET (Optional)
   - Description: Secret for JWT token signing
   - Format: Any string
   - Example: JWT_SECRET='your-jwt-secret'

5. API_KEY_SECRET (Optional)
   - Description: Secret for API key generation
   - Format: Any string
   - Example: API_KEY_SECRET='your-api-key-secret'

Security Best Practices:
-----------------------
1. NEVER commit secrets to the repository
2. Use environment variables or secret management systems
3. Rotate secrets regularly
4. Use strong, random values for all secrets
5. Limit access to production secrets
6. Monitor and audit secret usage
7. Use different secrets for each environment (dev, staging, prod)

Generating a Solana Keypair:
----------------------------
# Using Solana CLI
solana-keygen new --outfile keypair.json --no-bip39-passphrase

# Get the JSON array format
cat keypair.json

# Get Base58 format
solana-keygen pubkey keypair.json --output base58

# IMPORTANT: Delete the keypair.json file after setting the environment variable
rm keypair.json
`;
  }

  /**
   * Clear all secrets from memory (useful for testing or shutdown)
   */
  public clearSecrets(): void {
    this.keypairs.clear();
    this.secrets.clear();
    this.initialized = false;
    console.log('[SecretsManagementService] All secrets cleared from memory');
  }

  /**
   * Get initialization status
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let secretsManagementServiceInstance: SecretsManagementService | null = null;

/**
 * Get or create SecretsManagementService singleton instance
 */
export function getSecretsManagementService(): SecretsManagementService {
  if (!secretsManagementServiceInstance) {
    secretsManagementServiceInstance = new SecretsManagementService();
  }
  return secretsManagementServiceInstance;
}

/**
 * Reset SecretsManagementService instance (useful for testing)
 */
export function resetSecretsManagementService(): void {
  if (secretsManagementServiceInstance) {
    secretsManagementServiceInstance.clearSecrets();
    secretsManagementServiceInstance = null;
  }
}

export default SecretsManagementService;

