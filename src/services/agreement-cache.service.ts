/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PRESERVED FOR POTENTIAL FUTURE USE - Agreement Cache Service
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file implemented caching layer for agreement lookups to improve
 * performance and reduce database load.
 * 
 * MIGRATION CONTEXT:
 * - Implemented cache-aside pattern for agreement data
 * - Used Redis for caching with 30-minute TTL
 * - Supported lookups by agreement ID and escrow PDA
 * - Handled cache invalidation on agreement updates
 * - Superseded by atomic swap architecture (no agreements to cache)
 * 
 * DO NOT DELETE:
 * - Contains valuable caching patterns
 * - Shows how to implement cache-aside with Prisma
 * - May be needed if agreement-based features return
 * - Serves as reference for caching other entities
 * 
 * KEY METHODS (now disabled):
 * - getAgreementById: Cache-aside lookup by ID
 * - getAgreementByPda: Cache-aside lookup by PDA
 * - cacheAgreement: Store agreement in cache
 * - invalidateAgreement: Remove from cache on update
 * - getUserAgreements: Get user's agreements with caching
 * - warmupCache: Pre-populate cache with frequent agreements
 * 
 * DISABLED ON: 2025-12-02
 * RELATED FILES: agreement.service.ts, cache.service.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

// This file has been intentionally left empty after migration to atomic swaps
// Agreement caching is no longer needed
// Export empty object to prevent import errors
export {};
