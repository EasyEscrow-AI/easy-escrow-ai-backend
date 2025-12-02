/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PRESERVED FOR POTENTIAL FUTURE USE - Original Agreement Service
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file contains the core business logic for the escrow agreement system.
 * 
 * MIGRATION CONTEXT:
 * - Handled agreement lifecycle: creation, deposits, settlement, cancellation
 * - Managed SOL-based and NFT-based swaps with various swap types
 * - Integrated with Solana blockchain via EscrowProgramService
 * - Superseded by atomic swap architecture with simpler transaction model
 * - Code is preserved for potential future feature restoration
 * 
 * DO NOT DELETE:
 * - Contains complex business logic for multi-party escrow
 * - Includes deposit tracking, expiry management, fee calculations
 * - May be needed if agreement-based escrow is reintroduced
 * - Serves as reference for implementing similar features
 * 
 * KEY FUNCTIONS (now disabled):
 * - createAgreement: Initialize escrow with deposits and expiry
 * - getAgreementById: Retrieve agreement details
 * - listAgreements: Query agreements with filters
 * - depositNftToEscrow: Deposit seller's NFT
 * - depositSolToEscrow: Deposit buyer's SOL
 * - cancelAgreement: Cancel and refund expired agreements
 * - extendAgreementExpiry: Extend agreement deadline
 * - archiveAgreements: Archive completed agreements
 * 
 * DISABLED ON: 2025-12-02
 * RELATED FILES: agreement.dto.ts, settlement.service.ts, monitoring-orchestrator.service.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

// This file has been intentionally left empty after migration to atomic swaps
// All agreement business logic is no longer used
// Export empty object to prevent import errors
export {};
