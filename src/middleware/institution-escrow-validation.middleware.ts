/**
 * Institution Escrow Validation Middleware
 *
 * Express-validator chains for institution escrow endpoints.
 */

import { body, param, query } from 'express-validator';

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ESCROW_CODE_REGEX = /^EE-[A-Z0-9]{3,4}-[A-Z0-9]{3,4}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate that a value is either a UUID or an escrow code (EE-XXX-XXX) */
function isUuidOrEscrowCode(value: string) {
  if (UUID_REGEX.test(value) || ESCROW_CODE_REGEX.test(value)) return true;
  throw new Error('Must be a valid UUID or escrow code (EE-XXX-XXX)');
}
const CORRIDOR_REGEX = /^[A-Z]{2}-[A-Z]{2}$/;
const CONDITION_TYPES = ['ADMIN_RELEASE', 'TIME_LOCK', 'COMPLIANCE_CHECK'];
const SETTLEMENT_MODES = ['escrow', 'direct'];
const RELEASE_MODES = ['manual', 'ai'];
const VALID_RELEASE_CONDITIONS = [
  'legal_compliance',
  'invoice_amount_match',
  'client_info_match',
  'document_signature_verified',
];

/**
 * Validate create institution escrow request body
 */
export const validateCreateInstitutionEscrow = [
  body('payerWallet')
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('payerWallet must be a valid Solana address (base58, 32-44 chars)')
    .custom((value, { req }) => {
      if (value === req.body.recipientWallet) {
        throw new Error('payerWallet and recipientWallet must be different');
      }
      return true;
    }),
  body('recipientWallet')
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('recipientWallet must be a valid Solana address'),
  body('amount')
    .isFloat({ min: 1, max: 10000000 })
    .withMessage('amount must be between 1 and 10,000,000 USDC'),
  body('corridor')
    .isString()
    .matches(CORRIDOR_REGEX)
    .withMessage('corridor must be in format XX-XX (e.g. SG-CH)'),
  body('conditionType')
    .isString()
    .isIn(CONDITION_TYPES)
    .withMessage(`conditionType must be one of: ${CONDITION_TYPES.join(', ')}`),
  body('expiryHours')
    .optional()
    .isInt({ min: 1, max: 2160 })
    .withMessage('expiryHours must be between 1 and 2160 (90 days)'),
  body('settlementAuthority')
    .optional()
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('settlementAuthority must be a valid Solana address'),
  body('tokenMint')
    .optional()
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('tokenMint must be a valid Solana address (base58, 32-44 chars)'),
  body('settlementMode')
    .isString()
    .isIn(SETTLEMENT_MODES)
    .withMessage(`settlementMode must be one of: ${SETTLEMENT_MODES.join(', ')}`),
  body('releaseMode')
    .isString()
    .isIn(RELEASE_MODES)
    .withMessage(`releaseMode must be one of: ${RELEASE_MODES.join(', ')}`),
  body('approvalParties')
    .optional()
    .isArray()
    .withMessage('approvalParties must be an array of strings'),
  body('approvalParties.*')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each approvalParties entry must be a non-empty string (max 100 chars)'),
  body('releaseConditions')
    .optional()
    .isArray()
    .withMessage('releaseConditions must be an array of strings'),
  body('releaseConditions.*')
    .optional()
    .isString()
    .isIn(VALID_RELEASE_CONDITIONS)
    .withMessage(
      `Each releaseConditions entry must be one of: ${VALID_RELEASE_CONDITIONS.join(', ')}`
    ),
  body('approvalInstructions')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('approvalInstructions must be 2000 characters or less'),
];

/**
 * Validate save draft request body (only payerWallet required)
 */
export const validateSaveDraft = [
  body('payerWallet')
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('payerWallet must be a valid Solana address (base58, 32-44 chars)'),
  body('recipientWallet')
    .optional()
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('recipientWallet must be a valid Solana address')
    .custom((value, { req }) => {
      if (value && value === req.body.payerWallet) {
        throw new Error('recipientWallet must not equal payerWallet');
      }
      return true;
    }),
  body('amount')
    .optional()
    .isFloat({ min: 0, max: 10000000 })
    .withMessage('amount must be between 0 and 10,000,000 USDC'),
  body('corridor')
    .optional()
    .isString()
    .matches(CORRIDOR_REGEX)
    .withMessage('corridor must be in format XX-XX (e.g. SG-CH)'),
  body('conditionType')
    .optional()
    .isString()
    .isIn(CONDITION_TYPES)
    .withMessage(`conditionType must be one of: ${CONDITION_TYPES.join(', ')}`),
  body('settlementAuthority')
    .optional()
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('settlementAuthority must be a valid Solana address'),
  body('tokenMint')
    .optional()
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('tokenMint must be a valid Solana address (base58, 32-44 chars)'),
  body('settlementMode')
    .optional()
    .isString()
    .isIn(SETTLEMENT_MODES)
    .withMessage(`settlementMode must be one of: ${SETTLEMENT_MODES.join(', ')}`),
  body('releaseMode')
    .optional()
    .isString()
    .isIn(RELEASE_MODES)
    .withMessage(`releaseMode must be one of: ${RELEASE_MODES.join(', ')}`),
  body('approvalParties')
    .optional()
    .isArray()
    .withMessage('approvalParties must be an array of strings'),
  body('approvalParties.*')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each approvalParties entry must be a non-empty string (max 100 chars)'),
  body('releaseConditions')
    .optional()
    .isArray()
    .withMessage('releaseConditions must be an array of strings'),
  body('releaseConditions.*')
    .optional()
    .isString()
    .isIn(VALID_RELEASE_CONDITIONS)
    .withMessage(
      `Each releaseConditions entry must be one of: ${VALID_RELEASE_CONDITIONS.join(', ')}`
    ),
  body('approvalInstructions')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('approvalInstructions must be 2000 characters or less'),
];

/**
 * Validate update draft request body (all fields optional)
 */
export const validateUpdateDraft = [
  param('id').custom(isUuidOrEscrowCode),
  body('payerWallet')
    .optional()
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('payerWallet must be a valid Solana address'),
  body('recipientWallet')
    .optional()
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('recipientWallet must be a valid Solana address')
    .custom((value, { req }) => {
      if (value && req.body.payerWallet && value === req.body.payerWallet) {
        throw new Error('recipientWallet must not equal payerWallet');
      }
      return true;
    }),
  body('amount')
    .optional()
    .isFloat({ min: 0, max: 10000000 })
    .withMessage('amount must be between 0 and 10,000,000 USDC'),
  body('corridor')
    .optional()
    .isString()
    .matches(CORRIDOR_REGEX)
    .withMessage('corridor must be in format XX-XX (e.g. SG-CH)'),
  body('conditionType')
    .optional()
    .isString()
    .isIn(CONDITION_TYPES)
    .withMessage(`conditionType must be one of: ${CONDITION_TYPES.join(', ')}`),
  body('settlementAuthority')
    .optional()
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('settlementAuthority must be a valid Solana address'),
  body('tokenMint')
    .optional()
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('tokenMint must be a valid Solana address (base58, 32-44 chars)'),
  body('settlementMode')
    .optional()
    .isString()
    .isIn(SETTLEMENT_MODES)
    .withMessage(`settlementMode must be one of: ${SETTLEMENT_MODES.join(', ')}`),
  body('releaseMode')
    .optional()
    .isString()
    .isIn(RELEASE_MODES)
    .withMessage(`releaseMode must be one of: ${RELEASE_MODES.join(', ')}`),
  body('approvalParties')
    .optional()
    .isArray()
    .withMessage('approvalParties must be an array of strings'),
  body('approvalParties.*')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each approvalParties entry must be a non-empty string (max 100 chars)'),
  body('releaseConditions')
    .optional()
    .isArray()
    .withMessage('releaseConditions must be an array of strings'),
  body('releaseConditions.*')
    .optional()
    .isString()
    .isIn(VALID_RELEASE_CONDITIONS)
    .withMessage(
      `Each releaseConditions entry must be one of: ${VALID_RELEASE_CONDITIONS.join(', ')}`
    ),
  body('approvalInstructions')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('approvalInstructions must be 2000 characters or less'),
];

/**
 * Validate submit draft request
 */
export const validateSubmitDraft = [
  param('id').custom(isUuidOrEscrowCode),
  body('expiryHours')
    .optional()
    .isInt({ min: 1, max: 2160 })
    .withMessage('expiryHours must be between 1 and 2160 (90 days)'),
];

/**
 * Validate deposit recording
 */
export const validateRecordDeposit = [
  param('id').custom(isUuidOrEscrowCode),
  body('txSignature')
    .isString()
    .matches(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/)
    .withMessage('txSignature must be a valid base58 transaction signature (80-90 chars)'),
];

/**
 * Validate release funds request
 */
export const validateReleaseFunds = [
  param('id').custom(isUuidOrEscrowCode),
  body('notes')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('notes must be 500 characters or less'),
];

/**
 * Validate cancel escrow request
 */
export const validateCancelEscrow = [
  param('id').custom(isUuidOrEscrowCode),
  body('reason')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('reason must be 500 characters or less'),
];

/**
 * Validate AI analysis request
 */
export const validateAiAnalysis = [
  param('escrow_id').custom(isUuidOrEscrowCode),
  body('fileId').isUUID().withMessage('fileId must be a valid UUID'),
  body('context').optional().isObject().withMessage('context must be an object'),
  body('context.expectedAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('context.expectedAmount must be a positive number'),
  body('context.poNumber')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('context.poNumber must be 100 characters or less'),
];

/**
 * Validate list escrows query params
 */
export const validateListEscrows = [
  query('status')
    .optional()
    .isString()
    .isIn([
      'DRAFT',
      'CREATED',
      'FUNDED',
      'COMPLIANCE_HOLD',
      'RELEASING',
      'RELEASED',
      'INSUFFICIENT_FUNDS',
      'COMPLETE',
      'CANCELLING',
      'CANCELLED',
      'EXPIRED',
      'FAILED',
    ])
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
 * Validate allowlist operations
 */
export const validateAddToAllowlist = [
  body('wallet')
    .isString()
    .matches(SOLANA_ADDRESS_REGEX)
    .withMessage('wallet must be a valid Solana address'),
  body('clientId').isUUID().withMessage('clientId must be a valid UUID'),
];

/**
 * Validate pause escrow request
 */
export const validatePauseEscrow = [
  body('reason')
    .isString()
    .isLength({ min: 5, max: 500 })
    .withMessage('reason must be 5-500 characters'),
];

/**
 * Validate corridor configuration
 */
export const validateConfigureCorridor = [
  body('sourceCountry')
    .isString()
    .isLength({ min: 2, max: 2 })
    .isAlpha()
    .isUppercase()
    .withMessage('sourceCountry must be a 2-letter uppercase country code'),
  body('destCountry')
    .isString()
    .isLength({ min: 2, max: 2 })
    .isAlpha()
    .isUppercase()
    .withMessage('destCountry must be a 2-letter uppercase country code'),
  body('minAmount').isFloat({ min: 0 }).withMessage('minAmount must be non-negative'),
  body('maxAmount').isFloat({ min: 1 }).withMessage('maxAmount must be positive'),
  body('dailyLimit').isFloat({ min: 1 }).withMessage('dailyLimit must be positive'),
  body('monthlyLimit').isFloat({ min: 1 }).withMessage('monthlyLimit must be positive'),
  body('riskLevel')
    .isIn(['LOW', 'MEDIUM', 'HIGH'])
    .withMessage('riskLevel must be LOW, MEDIUM, or HIGH'),
  body('requiredDocuments').optional().isArray().withMessage('requiredDocuments must be an array'),
];
