/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PRESERVED FOR POTENTIAL FUTURE USE - Agreement API Routes
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file contained all HTTP endpoints for the escrow agreement system.
 * 
 * MIGRATION CONTEXT:
 * - Provided REST API for agreement lifecycle management
 * - Supported SOL-based and NFT-based swaps with multiple swap types
 * - Included rate limiting, validation, and idempotency handling
 * - Integrated with agreement services for business logic
 * - Superseded by atomic swap API architecture
 * 
 * DO NOT DELETE:
 * - Contains valuable API design patterns
 * - Shows how to implement REST endpoints with validation
 * - Includes error handling and status code mapping
 * - May be needed if agreement-based features return
 * - Serves as reference for new API endpoints
 * 
 * KEY ENDPOINTS (now disabled):
 * - POST /v1/agreements: Create new agreement
 * - GET /v1/agreements/:id: Get agreement details
 * - GET /v1/agreements: List agreements with filters
 * - POST /v1/agreements/:id/cancel: Cancel agreement
 * - POST /v1/agreements/:id/deposit-nft/prepare: Prepare NFT deposit
 * - POST /v1/agreements/:id/deposit-sol/prepare: Prepare SOL deposit
 * - POST /v1/agreements/:id/deposit-seller-sol-fee/prepare: Prepare seller fee
 * - POST /v1/agreements/:id/deposit-nft-buyer/prepare: Prepare buyer NFT
 * - POST /v1/agreements/:id/validate-deposits: Manual deposit validation
 * - POST /v1/agreements/archive: Bulk archive agreements
 * - POST /v1/agreements/:id/extend-expiry: Extend agreement deadline
 * - DELETE /v1/agreements/:id: Delete agreement (test cleanup)
 * 
 * IMPORTANT PATTERNS PRESERVED:
 * - Rate limiting (strict for creates, standard for reads)
 * - Idempotency handling for creates
 * - USDC mint validation middleware
 * - Admin authentication for privileged operations
 * - Validation middleware for request data
 * - Error handling with appropriate status codes
 * - Client-side signing pattern for deposits
 * 
 * DISABLED ON: 2025-12-02
 * RELATED FILES: agreement.service.ts, agreement.dto.ts, validation.middleware.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router } from 'express';

const router = Router();

// All agreement routes have been disabled after migration to atomic swaps
// Export empty router to prevent import errors

export default router;
