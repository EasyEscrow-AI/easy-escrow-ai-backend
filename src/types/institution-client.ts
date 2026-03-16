/**
 * Institution Client Type Definitions
 *
 * Types for institution client accounts, authentication,
 * and settings management.
 */

export enum ClientTier {
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE',
}

export enum ClientStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

/**
 * Database record for an institution client.
 */
export interface InstitutionClientRecord {
  id: string;
  email: string;
  companyName: string;
  tier: ClientTier;
  status: ClientStatus;
  kycStatus: string;
  jurisdiction: string | null;
  primaryWallet: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

/**
 * Client-level settings for the institution escrow platform.
 */
export interface ClientSettings {
  clientId: string;
  defaultCorridor: string | null;
  defaultCurrency: string;
  notificationEmail: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  settlementAuthorityWallet: string | null;
  timezone: string;
  /** USDC amount below which escrows are auto-approved */
  autoApproveThreshold: number | null;
}

/**
 * JWT payload for institution client authentication.
 */
export interface JwtPayload {
  clientId: string;
  email: string;
  tier: ClientTier;
  iat: number;
  exp: number;
}

/**
 * Token pair returned after successful authentication.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Token lifetime in seconds */
  expiresIn: number;
}
