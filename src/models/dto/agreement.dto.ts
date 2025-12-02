/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PRESERVED FOR POTENTIAL FUTURE USE - Original Agreement DTOs
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file contains the Data Transfer Objects (DTOs) for the original
 * escrow agreement system that was active before the atomic swap pivot.
 * 
 * MIGRATION CONTEXT:
 * - This code was part of the V2 escrow agreement system (SOL-based)
 * - Superseded by atomic swap architecture which uses different models
 * - Code is preserved for potential future feature restoration
 * - All agreement-related functionality has been disabled
 * 
 * DO NOT DELETE:
 * - Contains valuable business logic and data structures
 * - May be needed if agreement-based escrow is reintroduced
 * - Serves as reference for new feature development
 * 
 * DISABLED ON: 2025-12-02
 * RELATED FILES: agreement.validator.ts, agreement.service.ts
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * // COMMENTED OUT CODE BEGINS BELOW
 *
 * import { Decimal } from '@prisma/client/runtime/library';
 * import { AgreementStatus, SwapType, FeePayer } from '../../generated/prisma';
 * import { ExpiryPreset } from '../validators/expiry.validator';
 *
 * // All interface definitions have been commented out
 * // See git history for full code
 * // Key interfaces that were defined:
 * // - CreateAgreementDTO
 * // - AgreementResponseDTO
 * // - CreateAgreementResponseDTO
 * // - AgreementQueryDTO
 * // - AgreementBalanceDTO
 * // - DepositInfoDTO
 * // - AgreementDetailResponseDTO
 * // - CancelAgreementResponseDTO
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// This file has been intentionally left empty after migration to atomic swaps
// All agreement-related DTOs are no longer used
// Export empty object to prevent import errors
export {};
