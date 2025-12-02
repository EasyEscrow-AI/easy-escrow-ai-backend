/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PRESERVED FOR POTENTIAL FUTURE USE - Original Agreement Validators
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file contains validation logic for the original escrow agreement system.
 * 
 * MIGRATION CONTEXT:
 * - Validated CreateAgreementDTO data before agreement creation
 * - Included SOL amount validation, swap type validation, and expiry validation
 * - Superseded by atomic swap validation logic
 * - Code is preserved for potential future feature restoration
 * 
 * DO NOT DELETE:
 * - Contains important validation patterns and business rules
 * - May be needed if agreement-based escrow is reintroduced
 * - Serves as reference for new validation logic
 * 
 * DISABLED ON: 2025-12-02
 * RELATED FILES: agreement.dto.ts, agreement.service.ts
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * // COMMENTED OUT CODE BEGINS BELOW
 *
 * import { CreateAgreementDTO } from '../dto/agreement.dto';
 * import {
 *   isValidSolanaAddress,
 *   isValidUSDCAmount,
 *   isValidFeeBps,
 *   isValidNFTMint,
 *   ESCROW_LIMITS,
 * } from './solana.validator';
 * import { validateExpiry, EXPIRY_CONSTANTS } from './expiry.validator';
 * import { SwapType, FeePayer } from '../../generated/prisma';
 * import { 
 *   validateSwapParametersOrThrow,
 *   SwapTypeValidationError 
 * } from '../../utils/swap-type-validator';
 *
 * // Key exports that were defined:
 * // - ValidationError interface
 * // - SOL_LIMITS constants
 * // - isValidSolAmount function
 * // - validateCreateAgreement function
 * // - isValidAgreement function
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// This file has been intentionally left empty after migration to atomic swaps
// All agreement validation logic is no longer used
// Export empty object to prevent import errors
export {};
