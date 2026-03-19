/**
 * Institution Escrow Type Definitions
 *
 * Types for the institution-grade USDC escrow system supporting
 * cross-border payments with compliance checks, corridor limits,
 * and risk assessment.
 */

/**
 * Lifecycle status of an institution escrow.
 *
 * Flow: CREATED -> FUNDED -> RELEASING -> RELEASED -> COMPLETE (happy path)
 *       CREATED -> FUNDED -> COMPLIANCE_HOLD -> RELEASING -> RELEASED -> COMPLETE
 *       CREATED -> FUNDED -> RELEASING -> INSUFFICIENT_FUNDS (balance check fails)
 *       INSUFFICIENT_FUNDS -> RELEASING (retry after funding)
 *       CREATED -> FUNDED -> CANCELLING -> CANCELLED
 *       DRAFT -> CANCELLED (discard draft)
 *       CREATED -> EXPIRED (timeout)
 *       Any -> FAILED (unrecoverable error)
 */
export enum InstitutionEscrowStatus {
  DRAFT = 'DRAFT',
  CREATED = 'CREATED',
  FUNDED = 'FUNDED',
  COMPLIANCE_HOLD = 'COMPLIANCE_HOLD',
  RELEASING = 'RELEASING',
  RELEASED = 'RELEASED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  COMPLETE = 'COMPLETE',
  CANCELLING = 'CANCELLING',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

/**
 * Condition that must be met before funds can be released.
 */
export enum ConditionType {
  /** Manual release by settlement authority */
  ADMIN_RELEASE = 'ADMIN_RELEASE',
  /** Automatic release after time-lock period */
  TIME_LOCK = 'TIME_LOCK',
  /** Release pending compliance/KYC check */
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
}

/**
 * Database record for an institution escrow.
 */
export interface InstitutionEscrowRecord {
  id: string;
  clientId: string;
  /** UUID used for on-chain PDA derivation */
  escrowId: string;
  /** Human-readable escrow code: EE-XXXX-XXXX */
  escrowCode: string;
  payerWallet: string;
  recipientWallet: string;
  usdcMint: string;
  /** Amount in USDC (6 decimal precision) */
  amount: number;
  platformFee: number;
  /** Corridor code, e.g. 'SG-CH' */
  corridor: string;
  conditionType: ConditionType;
  status: InstitutionEscrowStatus;
  settlementAuthority: string;
  riskScore: number | null;
  escrowPda: string | null;
  vaultPda: string | null;
  nonceAccount: string | null;
  depositTxSignature: string | null;
  releaseTxSignature: string | null;
  cancelTxSignature: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  fundedAt: Date | null;
}

/**
 * Allowlisted wallet entry for institution escrow participation.
 */
export interface AllowlistEntry {
  wallet: string;
  clientId: string;
  kycVerified: boolean;
  addedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for a payment corridor (source country -> destination country).
 */
export interface CorridorConfig {
  id: string;
  sourceCountry: string;
  destCountry: string;
  /** Corridor code, e.g. 'SG-CH' */
  code: string;
  minAmount: number;
  maxAmount: number;
  dailyLimit: number;
  monthlyLimit: number;
  requiredDocuments: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  active: boolean;
}

/**
 * Result of a compliance check on an escrow operation.
 */
export interface ComplianceResult {
  passed: boolean;
  flags: string[];
  reasons: string[];
  riskScore: number;
  corridorValid: boolean;
  walletsAllowlisted: boolean;
  limitsWithinRange: boolean;
}

/**
 * Risk assessment output for an escrow operation.
 */
export interface RiskAssessment {
  /** Risk score from 0 (no risk) to 100 (maximum risk) */
  score: number;
  factors: { name: string; weight: number; value: number }[];
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
  details: string;
}
