/**
 * Institution Escrow Configuration
 *
 * Configuration for the institution escrow feature (USDC cross-border payments).
 * This feature is disabled by default and only loaded when INSTITUTION_ESCROW_ENABLED=true.
 */

export interface InstitutionEscrowConfig {
  /** Whether institution escrow feature is enabled */
  enabled: boolean;

  /** USDC SPL token mint address on Solana */
  usdcMintAddress: string;

  /** Minimum escrow amount in USDC (not micro-USDC) */
  minUsdc: number;

  /** Maximum escrow amount in USDC (not micro-USDC) */
  maxUsdc: number;

  /** Default escrow expiry in hours */
  defaultExpiryHours: number;

  /** JWT authentication settings */
  jwt: {
    /** Access token expiry (e.g., '15m', '1h') */
    accessTokenExpiry: string;
    /** Refresh token expiry (e.g., '7d', '30d') */
    refreshTokenExpiry: string;
  };

  /** AI analysis settings */
  ai: {
    /** Anthropic API key for Claude */
    apiKey: string;
    /** Claude model to use for analysis */
    model: string;
  };

  /** DigitalOcean Spaces settings for document uploads */
  doSpaces: {
    key: string;
    secret: string;
    endpoint: string;
    bucket: string;
    region: string;
  };

  /** API key for settlement authority operations */
  settlementAuthorityApiKey: string;

  /** CDP (Coinbase Developer Platform) wallet settings for independent settlement authority */
  cdp: {
    enabled: boolean;
    apiKeyId: string;
    apiKeySecret: string;
    walletSecret: string;
    accountName: string;
  };
}

/**
 * Load institution escrow configuration from environment variables
 */
export function loadInstitutionEscrowConfig(): InstitutionEscrowConfig {
  const enabled = process.env.INSTITUTION_ESCROW_ENABLED?.toLowerCase() === 'true';

  return {
    enabled,
    usdcMintAddress: process.env.USDC_MINT_ADDRESS || '',
    minUsdc: parseFloat(process.env.INSTITUTION_ESCROW_MIN_USDC || '100'),
    maxUsdc: parseFloat(process.env.INSTITUTION_ESCROW_MAX_USDC || '1000000'),
    defaultExpiryHours: parseInt(process.env.INSTITUTION_ESCROW_DEFAULT_EXPIRY_HOURS || '72', 10),
    jwt: {
      accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '1h',
      refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
    },
    ai: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.AI_ANALYSIS_MODEL || 'claude-sonnet-4-20250514',
    },
    doSpaces: {
      key: process.env.DO_SPACES_KEY || '',
      secret: process.env.DO_SPACES_SECRET || '',
      endpoint: process.env.DO_SPACES_ENDPOINT || '',
      bucket: process.env.DO_SPACES_BUCKET || process.env.DO_SPACES_BUCKET_NAME || '',
      region: process.env.DO_SPACES_REGION || '',
    },
    settlementAuthorityApiKey: process.env.SETTLEMENT_AUTHORITY_API_KEY || '',
    cdp: {
      enabled: process.env.CDP_ENABLED?.toLowerCase() === 'true',
      apiKeyId: process.env.CDP_API_KEY_ID || '',
      apiKeySecret: process.env.CDP_API_KEY_SECRET || '',
      walletSecret: process.env.CDP_WALLET_SECRET || '',
      accountName: process.env.CDP_ACCOUNT_NAME || 'easyescrow-settlement-devnet',
    },
  };
}

/** Cached config instance */
let _institutionEscrowConfig: InstitutionEscrowConfig | null = null;

/**
 * Get institution escrow configuration (cached after first call)
 */
export function getInstitutionEscrowConfig(): InstitutionEscrowConfig {
  if (!_institutionEscrowConfig) {
    _institutionEscrowConfig = loadInstitutionEscrowConfig();
  }
  return _institutionEscrowConfig;
}

/**
 * Reset cached configuration (useful for testing)
 */
export function resetInstitutionEscrowConfig(): void {
  _institutionEscrowConfig = null;
}

/**
 * Validate CDP configuration when CDP_ENABLED=true.
 * Throws at startup if required credentials are missing.
 */
export function validateCdpConfig(cfg: InstitutionEscrowConfig): void {
  if (!cfg.cdp.enabled) return;
  const missing: string[] = [];
  if (!cfg.cdp.apiKeyId) missing.push('CDP_API_KEY_ID');
  if (!cfg.cdp.apiKeySecret) missing.push('CDP_API_KEY_SECRET');
  if (!cfg.cdp.walletSecret) missing.push('CDP_WALLET_SECRET');
  if (missing.length > 0) {
    throw new Error(
      `CDP_ENABLED=true but required credentials are missing: ${missing.join(', ')}. ` +
        'Set these environment variables or disable CDP with CDP_ENABLED=false.'
    );
  }
}

export const institutionEscrowConfig = {
  get: getInstitutionEscrowConfig,
  load: loadInstitutionEscrowConfig,
  reset: resetInstitutionEscrowConfig,
};

/** Protocol-level fee constraints — admin settings cannot exceed these */
export const PROTOCOL_FEE_LIMITS = {
  /** Absolute minimum fee in USDC */
  MIN_FEE_USDC: 0.2,
  /** Absolute maximum fee in USDC */
  MAX_FEE_USDC: 20.0,
  /** Minimum allowed feeBps setting */
  MIN_FEE_BPS: 1,
  /** Maximum allowed feeBps setting */
  MAX_FEE_BPS: 500,
} as const;
