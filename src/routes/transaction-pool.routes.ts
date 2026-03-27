/**
 * Transaction Pool Routes
 *
 * CRUD and settlement endpoints for transaction pools.
 * All endpoints require institution JWT authentication.
 * Gated by TRANSACTION_POOLS_ENABLED feature flag.
 *
 * POST   /api/v1/institution/pools                         → Create pool
 * GET    /api/v1/institution/pools                         → List pools
 * GET    /api/v1/institution/pools/:id                     → Get pool detail
 * POST   /api/v1/institution/pools/:id/add                 → Add escrow to pool
 * DELETE /api/v1/institution/pools/:id/members/:memberId   → Remove member
 * POST   /api/v1/institution/pools/:id/lock                → Lock pool
 * POST   /api/v1/institution/pools/:id/settle              → Settle pool
 * POST   /api/v1/institution/pools/:id/retry               → Retry failed members
 * POST   /api/v1/institution/pools/:id/cancel              → Cancel pool
 * GET    /api/v1/institution/pools/:id/audit               → Get pool audit log
 * GET    /api/v1/institution/pools/:id/receipt/:escrowId   → Decrypt receipt
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { validationResult } from 'express-validator';
import {
  requireInstitutionAuth,
  requireSettlementAuthority,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { requireNotPaused } from '../middleware/institution-escrow-pause.middleware';
import {
  validateCreatePool,
  validateAddMember,
  validateRemoveMember,
  validateLockPool,
  validateSettlePool,
  validateRetryFailedMembers,
  validateCancelPool,
  validateGetPool,
  validateListPools,
  validateGetPoolAudit,
  validateDecryptReceipt,
} from '../middleware/transaction-pool-validation.middleware';
import { getTransactionPoolService } from '../services/transaction-pool.service';
import { isTransactionPoolsEnabled } from '../utils/featureFlags';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Feature flag guard middleware */
function requirePoolsEnabled(req: Request, res: Response, next: Function): void {
  if (!isTransactionPoolsEnabled()) {
    res.status(404).json({
      error: 'Not Found',
      message: 'Transaction pools are not enabled',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  next();
}

function handleValidation(req: any, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'Validation Error',
      details: errors.array(),
      timestamp: new Date().toISOString(),
    });
    return true;
  }
  return false;
}

// Apply feature flag guard to all routes
router.use(requirePoolsEnabled);

// ─── POST /api/v1/institution/pools ─────────────────────────────

router.post(
  '/api/v1/institution/pools',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateCreatePool,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.createPool({
        clientId: req.institutionClient!.clientId,
        corridor: req.body.corridor,
        settlementMode: req.body.settlementMode,
        expiryHours: req.body.expiryHours,
        actorEmail: req.institutionClient!.email,
      });

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Pool Creation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── GET /api/v1/institution/pools ──────────────────────────────

router.get(
  '/api/v1/institution/pools',
  standardRateLimiter,
  requireInstitutionAuth,
  validateListPools,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.listPools({
        clientId: req.institutionClient!.clientId,
        status: req.query.status as string | undefined,
        corridor: req.query.corridor as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── GET /api/v1/institution/pools/:id ──────────────────────────

router.get(
  '/api/v1/institution/pools/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  validateGetPool,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.getPool({
        clientId: req.institutionClient!.clientId,
        poolIdOrCode: req.params.id,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found')
        ? 404
        : error.message.includes('Access denied')
        ? 403
        : 400;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : 'Bad Request',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── POST /api/v1/institution/pools/:id/add ─────────────────────

router.post(
  '/api/v1/institution/pools/:id/add',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateAddMember,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.addMember({
        clientId: req.institutionClient!.clientId,
        poolIdOrCode: req.params.id,
        escrowId: req.body.escrowId,
        actorEmail: req.institutionClient!.email,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: 'Add Member Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── DELETE /api/v1/institution/pools/:id/members/:memberId ─────

router.delete(
  '/api/v1/institution/pools/:id/members/:memberId',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateRemoveMember,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.removeMember({
        clientId: req.institutionClient!.clientId,
        poolIdOrCode: req.params.id,
        memberId: req.params.memberId,
        actorEmail: req.institutionClient!.email,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: 'Remove Member Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── POST /api/v1/institution/pools/:id/lock ────────────────────

router.post(
  '/api/v1/institution/pools/:id/lock',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateLockPool,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.lockPool({
        clientId: req.institutionClient!.clientId,
        poolIdOrCode: req.params.id,
        actorEmail: req.institutionClient!.email,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Lock Pool Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── POST /api/v1/institution/pools/:id/settle ──────────────────

router.post(
  '/api/v1/institution/pools/:id/settle',
  strictRateLimiter,
  requireInstitutionAuth,
  requireSettlementAuthority,
  requireNotPaused,
  validateSettlePool,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.settlePool({
        clientId: req.institutionClient!.clientId,
        poolIdOrCode: req.params.id,
        notes: req.body.notes,
        actorEmail: req.institutionClient!.email,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Settlement Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── POST /api/v1/institution/pools/:id/retry ───────────────────

router.post(
  '/api/v1/institution/pools/:id/retry',
  strictRateLimiter,
  requireInstitutionAuth,
  requireSettlementAuthority,
  requireNotPaused,
  validateRetryFailedMembers,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.retryFailedMembers({
        clientId: req.institutionClient!.clientId,
        poolIdOrCode: req.params.id,
        actorEmail: req.institutionClient!.email,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Retry Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── POST /api/v1/institution/pools/:id/cancel ──────────────────

router.post(
  '/api/v1/institution/pools/:id/cancel',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateCancelPool,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.cancelPool({
        clientId: req.institutionClient!.clientId,
        poolIdOrCode: req.params.id,
        reason: req.body.reason,
        actorEmail: req.institutionClient!.email,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Cancellation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── GET /api/v1/institution/pools/:id/audit ────────────────────

router.get(
  '/api/v1/institution/pools/:id/audit',
  standardRateLimiter,
  requireInstitutionAuth,
  validateGetPoolAudit,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.getPoolAudit({
        clientId: req.institutionClient!.clientId,
        poolIdOrCode: req.params.id,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found')
        ? 404
        : error.message.includes('Access denied')
        ? 403
        : 500;
      const errorLabel = status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : 'Internal Error';
      res.status(status).json({
        error: errorLabel,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── GET /api/v1/institution/pools/:id/receipt/:escrowId ────────

router.get(
  '/api/v1/institution/pools/:id/receipt/:escrowId',
  standardRateLimiter,
  requireInstitutionAuth,
  validateDecryptReceipt,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getTransactionPoolService();
      const result = await service.decryptReceipt(
        req.institutionClient!.clientId,
        req.params.id,
        req.params.escrowId
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Decrypt Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
