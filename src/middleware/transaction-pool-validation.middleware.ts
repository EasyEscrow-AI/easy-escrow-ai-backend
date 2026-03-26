/**
 * Transaction Pool Validation Middleware
 *
 * Express-validator chains for transaction pool endpoints.
 */

import { body, param, query } from 'express-validator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POOL_CODE_REGEX = /^TP-[A-Z0-9]{3,4}-[A-Z0-9]{3,4}$/;
const CORRIDOR_REGEX = /^[A-Z]{2}-[A-Z]{2}$/;
const SETTLEMENT_MODES = ['SEQUENTIAL', 'PARALLEL'];

/** Validate that a value is either a UUID or a pool code (TP-XXX-XXX) */
function isUuidOrPoolCode(value: string) {
  if (UUID_REGEX.test(value) || POOL_CODE_REGEX.test(value)) return true;
  throw new Error('Must be a valid UUID or pool code (TP-XXX-XXX)');
}

/**
 * Validate create pool request body
 */
export const validateCreatePool = [
  body('corridor')
    .optional()
    .isString()
    .matches(CORRIDOR_REGEX)
    .withMessage('corridor must be in format XX-XX (e.g. SG-CH)'),
  body('settlementMode')
    .optional()
    .isString()
    .isIn(SETTLEMENT_MODES)
    .withMessage(`settlementMode must be one of: ${SETTLEMENT_MODES.join(', ')}`),
  body('expiryHours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('expiryHours must be between 1 and 168 (7 days)'),
];

/**
 * Validate add member request body
 */
export const validateAddMember = [
  param('id').custom(isUuidOrPoolCode),
  body('escrowId')
    .isString()
    .custom((value: string) => {
      if (UUID_REGEX.test(value)) return true;
      // Also accept escrow codes (EE-XXX-XXX)
      if (/^EE-[A-Z0-9]{3,4}-[A-Z0-9]{3,4}$/.test(value)) return true;
      throw new Error('escrowId must be a valid UUID or escrow code (EE-XXX-XXX)');
    }),
];

/**
 * Validate remove member request
 */
export const validateRemoveMember = [
  param('id').custom(isUuidOrPoolCode),
  param('memberId').isUUID().withMessage('memberId must be a valid UUID'),
];

/**
 * Validate lock pool request
 */
export const validateLockPool = [param('id').custom(isUuidOrPoolCode)];

/**
 * Validate settle pool request
 */
export const validateSettlePool = [
  param('id').custom(isUuidOrPoolCode),
  body('notes')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('notes must be 500 characters or less'),
];

/**
 * Validate retry failed members request
 */
export const validateRetryFailedMembers = [param('id').custom(isUuidOrPoolCode)];

/**
 * Validate cancel pool request
 */
export const validateCancelPool = [
  param('id').custom(isUuidOrPoolCode),
  body('reason')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('reason must be 500 characters or less'),
];

/**
 * Validate get pool request
 */
export const validateGetPool = [param('id').custom(isUuidOrPoolCode)];

/**
 * Validate list pools query params
 */
export const validateListPools = [
  query('status')
    .optional()
    .isString()
    .isIn(['OPEN', 'LOCKED', 'SETTLING', 'SETTLED', 'PARTIAL_FAIL', 'FAILED', 'CANCELLED'])
    .withMessage('Invalid status filter'),
  query('corridor')
    .optional()
    .isString()
    .matches(CORRIDOR_REGEX)
    .withMessage('corridor must be in format XX-XX'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be non-negative'),
];

/**
 * Validate get pool audit request
 */
export const validateGetPoolAudit = [
  param('id').custom(isUuidOrPoolCode),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be non-negative'),
];

/**
 * Validate decrypt receipt request
 */
export const validateDecryptReceipt = [
  param('id').custom(isUuidOrPoolCode),
  param('escrowId')
    .isString()
    .custom((value: string) => {
      if (UUID_REGEX.test(value)) return true;
      if (/^EE-[A-Z0-9]{3,4}-[A-Z0-9]{3,4}$/.test(value)) return true;
      throw new Error('escrowId must be a valid UUID or escrow code (EE-XXX-XXX)');
    }),
];
