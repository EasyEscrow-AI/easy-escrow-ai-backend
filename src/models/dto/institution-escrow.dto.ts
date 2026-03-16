import {
  InstitutionEscrowRecord,
  InstitutionEscrowStatus,
  ConditionType,
} from '../../types/institution-escrow';

/**
 * Request DTO for creating an institution escrow.
 */
export interface CreateInstitutionEscrowRequest {
  payerWallet: string;
  recipientWallet: string;
  /** USDC amount (6 decimal precision) */
  amount: number;
  /** Corridor code, e.g. 'SG-CH' */
  corridor: string;
  conditionType: ConditionType;
  /** Hours until escrow expires (default: 72) */
  expiryHours?: number;
  /** Wallet authorized to release funds */
  settlementAuthority: string;
}

/**
 * Response DTO after creating an institution escrow.
 */
export interface CreateInstitutionEscrowResponse {
  escrow: InstitutionEscrowRecord;
  /** Base64-encoded serialized transaction for client signing */
  transaction: string;
}

/**
 * Request DTO for recording a deposit against an escrow.
 */
export interface RecordDepositRequest {
  /** On-chain transaction signature (base58) */
  txSignature: string;
}

/**
 * Request DTO for releasing escrow funds.
 */
export interface ReleaseFundsRequest {
  notes?: string;
}

/**
 * Request DTO for cancelling an escrow.
 */
export interface CancelEscrowRequest {
  reason?: string;
}

/**
 * Response DTO for a single institution escrow.
 */
export interface InstitutionEscrowResponse extends InstitutionEscrowRecord {}

/**
 * Query parameters for listing institution escrows.
 */
export interface ListEscrowsQuery {
  status?: InstitutionEscrowStatus;
  corridor?: string;
  limit?: number;
  offset?: number;
}
