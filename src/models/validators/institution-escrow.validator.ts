import { CreateInstitutionEscrowRequest } from '../dto/institution-escrow.dto';
import { ConditionType } from '../../types/institution-escrow';
import { isValidSolanaAddress, isValidTransactionSignature } from './solana.validator';

export interface ValidationError {
  field: string;
  message: string;
}

/** USDC amount limits for institution escrows */
export const INSTITUTION_ESCROW_LIMITS = {
  MIN_AMOUNT: 1, // $1 USDC
  MAX_AMOUNT: 1_000_000, // $1,000,000 USDC
  MIN_EXPIRY_HOURS: 1,
  MAX_EXPIRY_HOURS: 720, // 30 days
  DEFAULT_EXPIRY_HOURS: 72, // 3 days
} as const;

/** Corridor code format: two uppercase ISO-3166 alpha-2 codes separated by a dash */
const CORRIDOR_REGEX = /^[A-Z]{2}-[A-Z]{2}$/;

/**
 * Validate a Solana wallet address (base58, 32-44 chars).
 * Delegates to the shared solana validator.
 */
const isValidWallet = (address: string): boolean => {
  if (!address || typeof address !== 'string') return false;
  if (address.length < 32 || address.length > 44) return false;
  return isValidSolanaAddress(address);
};

/**
 * Validate institution escrow creation request.
 */
export const validateCreateInstitutionEscrow = (
  data: CreateInstitutionEscrowRequest
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // payerWallet
  if (!data.payerWallet) {
    errors.push({ field: 'payerWallet', message: 'Payer wallet address is required' });
  } else if (!isValidWallet(data.payerWallet)) {
    errors.push({ field: 'payerWallet', message: 'Invalid payer wallet address' });
  }

  // recipientWallet
  if (!data.recipientWallet) {
    errors.push({ field: 'recipientWallet', message: 'Recipient wallet address is required' });
  } else if (!isValidWallet(data.recipientWallet)) {
    errors.push({ field: 'recipientWallet', message: 'Invalid recipient wallet address' });
  }

  // Payer and recipient must differ
  if (data.payerWallet && data.recipientWallet && data.payerWallet === data.recipientWallet) {
    errors.push({
      field: 'recipientWallet',
      message: 'Recipient wallet must be different from payer wallet',
    });
  }

  // amount
  if (data.amount === undefined || data.amount === null) {
    errors.push({ field: 'amount', message: 'Amount is required' });
  } else if (typeof data.amount !== 'number' || !Number.isFinite(data.amount)) {
    errors.push({ field: 'amount', message: 'Amount must be a valid number' });
  } else if (data.amount < INSTITUTION_ESCROW_LIMITS.MIN_AMOUNT) {
    errors.push({
      field: 'amount',
      message: `Amount must be at least ${INSTITUTION_ESCROW_LIMITS.MIN_AMOUNT} USDC`,
    });
  } else if (data.amount > INSTITUTION_ESCROW_LIMITS.MAX_AMOUNT) {
    errors.push({
      field: 'amount',
      message: `Amount must not exceed ${INSTITUTION_ESCROW_LIMITS.MAX_AMOUNT.toLocaleString()} USDC`,
    });
  }

  // corridor
  if (!data.corridor) {
    errors.push({ field: 'corridor', message: 'Corridor is required' });
  } else if (!CORRIDOR_REGEX.test(data.corridor)) {
    errors.push({
      field: 'corridor',
      message: 'Corridor must be in XX-XX format (e.g. SG-CH)',
    });
  }

  // conditionType
  if (!data.conditionType) {
    errors.push({ field: 'conditionType', message: 'Condition type is required' });
  } else if (!Object.values(ConditionType).includes(data.conditionType)) {
    errors.push({
      field: 'conditionType',
      message: `Condition type must be one of: ${Object.values(ConditionType).join(', ')}`,
    });
  }

  // expiryHours (optional)
  if (data.expiryHours !== undefined && data.expiryHours !== null) {
    if (typeof data.expiryHours !== 'number' || !Number.isFinite(data.expiryHours)) {
      errors.push({ field: 'expiryHours', message: 'Expiry hours must be a valid number' });
    } else if (data.expiryHours < INSTITUTION_ESCROW_LIMITS.MIN_EXPIRY_HOURS) {
      errors.push({
        field: 'expiryHours',
        message: `Expiry must be at least ${INSTITUTION_ESCROW_LIMITS.MIN_EXPIRY_HOURS} hour(s)`,
      });
    } else if (data.expiryHours > INSTITUTION_ESCROW_LIMITS.MAX_EXPIRY_HOURS) {
      errors.push({
        field: 'expiryHours',
        message: `Expiry must not exceed ${INSTITUTION_ESCROW_LIMITS.MAX_EXPIRY_HOURS} hours (30 days)`,
      });
    }
  }

  // settlementAuthority
  if (!data.settlementAuthority) {
    errors.push({
      field: 'settlementAuthority',
      message: 'Settlement authority wallet is required',
    });
  } else if (!isValidWallet(data.settlementAuthority)) {
    errors.push({
      field: 'settlementAuthority',
      message: 'Invalid settlement authority wallet address',
    });
  }

  return errors;
};

/**
 * Validate a deposit recording request (tx signature).
 */
export const validateRecordDeposit = (data: { txSignature?: string }): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!data.txSignature) {
    errors.push({ field: 'txSignature', message: 'Transaction signature is required' });
  } else if (!isValidTransactionSignature(data.txSignature)) {
    errors.push({
      field: 'txSignature',
      message: 'Invalid transaction signature (must be base58, 87-88 characters)',
    });
  }

  return errors;
};

/**
 * Validate a release funds request.
 */
export const validateReleaseFunds = (data: { notes?: string }): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (data.notes !== undefined && typeof data.notes !== 'string') {
    errors.push({ field: 'notes', message: 'Notes must be a string' });
  } else if (data.notes && data.notes.length > 1000) {
    errors.push({ field: 'notes', message: 'Notes must not exceed 1000 characters' });
  }

  return errors;
};

/**
 * Validate a cancel escrow request.
 */
export const validateCancelEscrow = (data: { reason?: string }): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (data.reason !== undefined && typeof data.reason !== 'string') {
    errors.push({ field: 'reason', message: 'Reason must be a string' });
  } else if (data.reason && data.reason.length > 1000) {
    errors.push({ field: 'reason', message: 'Reason must not exceed 1000 characters' });
  }

  return errors;
};
