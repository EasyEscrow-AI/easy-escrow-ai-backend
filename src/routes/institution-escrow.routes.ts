/**
 * Institution Escrow Routes
 *
 * POST   /api/v1/institution-escrow              → createEscrow
 * POST   /api/v1/institution-escrow/draft        → saveDraft
 * PUT    /api/v1/institution-escrow/:id/draft    → updateDraft
 * POST   /api/v1/institution-escrow/:id/submit   → submitDraft
 * GET    /api/v1/institution-escrow/:id/deposit-tx → getDepositTransaction
 * POST   /api/v1/institution-escrow/:id/deposit  → recordDeposit
 * POST   /api/v1/institution-escrow/:id/release  → releaseFunds
 * POST   /api/v1/institution-escrow/:id/cancel   → cancelEscrow
 * GET    /api/v1/institution-escrow/:id          → getEscrow
 * GET    /api/v1/institution-escrow              → listEscrows
 * GET    /api/v1/institution/corridors           → listCorridors
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { param, validationResult } from 'express-validator';
import {
  requireInstitutionAuth,
  requireSettlementAuthority,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import {
  validateCreateInstitutionEscrow,
  validateSaveDraft,
  validateUpdateDraft,
  validateSubmitDraft,
  validateRecordDeposit,
  validateReleaseFunds,
  validateCancelEscrow,
  validateListEscrows,
} from '../middleware/institution-escrow-validation.middleware';
import { requireNotPaused } from '../middleware/institution-escrow-pause.middleware';
import { getInstitutionEscrowService } from '../services/institution-escrow.service';

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

// POST /api/v1/institution-escrow
router.post(
  '/api/v1/institution-escrow',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateCreateInstitutionEscrow,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getInstitutionEscrowService();
      const result = await service.createEscrow({
        clientId: req.institutionClient!.clientId,
        payerWallet: req.body.payerWallet,
        recipientWallet: req.body.recipientWallet,
        amount: req.body.amount,
        corridor: req.body.corridor,
        conditionType: req.body.conditionType,
        expiryHours: req.body.expiryHours,
        settlementAuthority: req.body.settlementAuthority,
        tokenMint: req.body.tokenMint,
        settlementMode: req.body.settlementMode,
        releaseMode: req.body.releaseMode,
        approvalParties: req.body.approvalParties,
        releaseConditions: req.body.releaseConditions,
        approvalInstructions: req.body.approvalInstructions,
        actorEmail: req.institutionClient!.email,
      });

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('Compliance') ? 422 : 400;
      res.status(status).json({
        error: 'Escrow Creation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/v1/institution-escrow/draft
router.post(
  '/api/v1/institution-escrow/draft',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateSaveDraft,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getInstitutionEscrowService();
      const result = await service.saveDraft({
        clientId: req.institutionClient!.clientId,
        payerWallet: req.body.payerWallet,
        recipientWallet: req.body.recipientWallet,
        amount: req.body.amount,
        corridor: req.body.corridor,
        conditionType: req.body.conditionType,
        settlementAuthority: req.body.settlementAuthority,
        tokenMint: req.body.tokenMint,
        settlementMode: req.body.settlementMode,
        releaseMode: req.body.releaseMode,
        approvalParties: req.body.approvalParties,
        releaseConditions: req.body.releaseConditions,
        approvalInstructions: req.body.approvalInstructions,
        actorEmail: req.institutionClient!.email,
      });

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Draft Creation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// PUT /api/v1/institution-escrow/:id/draft
router.put(
  '/api/v1/institution-escrow/:id/draft',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateUpdateDraft,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getInstitutionEscrowService();
      const result = await service.updateDraft(req.institutionClient!.clientId, req.params.id, {
        payerWallet: req.body.payerWallet,
        recipientWallet: req.body.recipientWallet,
        amount: req.body.amount,
        corridor: req.body.corridor,
        conditionType: req.body.conditionType,
        settlementAuthority: req.body.settlementAuthority,
        tokenMint: req.body.tokenMint,
        settlementMode: req.body.settlementMode,
        releaseMode: req.body.releaseMode,
        approvalParties: req.body.approvalParties,
        releaseConditions: req.body.releaseConditions,
        approvalInstructions: req.body.approvalInstructions,
        actorEmail: req.institutionClient!.email,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Draft Update Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/v1/institution-escrow/:id/submit
router.post(
  '/api/v1/institution-escrow/:id/submit',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateSubmitDraft,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getInstitutionEscrowService();
      const result = await service.submitDraft(
        req.institutionClient!.clientId,
        req.params.id,
        req.body.expiryHours,
        req.institutionClient!.email
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('Compliance') ? 422 : 400;
      res.status(status).json({
        error: 'Draft Submission Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/institution-escrow/:id/deposit-tx
router.get(
  '/api/v1/institution-escrow/:id/deposit-tx',
  standardRateLimiter,
  param('id').notEmpty().withMessage('Escrow ID or code is required'),
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getInstitutionEscrowService();
      const result = await service.getDepositTransaction(
        req.institutionClient!.clientId,
        req.params.id
      );

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
        error: 'Deposit Transaction Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/v1/institution-escrow/:id/deposit
router.post(
  '/api/v1/institution-escrow/:id/deposit',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateRecordDeposit,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getInstitutionEscrowService();
      const result = await service.recordDeposit(
        req.institutionClient!.clientId,
        req.params.id,
        req.body.txSignature,
        req.institutionClient!.email
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('expired') ? 410 : 400;
      res.status(status).json({
        error: 'Deposit Recording Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/v1/institution-escrow/:id/release
router.post(
  '/api/v1/institution-escrow/:id/release',
  strictRateLimiter,
  requireInstitutionAuth,
  requireSettlementAuthority,
  requireNotPaused,
  validateReleaseFunds,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getInstitutionEscrowService();
      const result = await service.releaseFunds(
        req.institutionClient!.clientId,
        req.params.id,
        req.body.notes,
        req.institutionClient!.email
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Release Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/v1/institution-escrow/:id/cancel
router.post(
  '/api/v1/institution-escrow/:id/cancel',
  standardRateLimiter,
  requireInstitutionAuth,
  requireNotPaused,
  validateCancelEscrow,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getInstitutionEscrowService();
      const result = await service.cancelEscrow(
        req.institutionClient!.clientId,
        req.params.id,
        req.body.reason,
        req.institutionClient!.email
      );

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

// GET /api/v1/institution-escrow/:id
router.get(
  '/api/v1/institution-escrow/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionEscrowService();
      const escrow = await service.getEscrow(req.institutionClient!.clientId, req.params.id);

      res.status(200).json({
        success: true,
        data: escrow,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found')
        ? 404
        : error.message.includes('Access denied')
        ? 403
        : 400;
      res.status(status).json({
        error: 'Not Found',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/institution-escrow
router.get(
  '/api/v1/institution-escrow',
  standardRateLimiter,
  requireInstitutionAuth,
  validateListEscrows,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

    try {
      const service = getInstitutionEscrowService();
      const result = await service.listEscrows({
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

// ─── Corridor Configuration ────────────────────────────────────

// GET /api/v1/institution/corridors
router.get(
  '/api/v1/institution/corridors',
  standardRateLimiter,
  requireInstitutionAuth,
  async (_req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const { prisma } = await import('../config/database');

      const corridors = await prisma.institutionCorridor.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { code: 'asc' },
        select: {
          code: true,
          name: true,
          compliance: true,
          description: true,
          riskLevel: true,
          riskReason: true,
          travelRuleThreshold: true,
          eddThreshold: true,
          reportingThreshold: true,
        },
      });

      const formatted = corridors.map((c: any) => ({
        id: c.code.toLowerCase(),
        code: c.code,
        name: c.name || c.code,
        compliance: c.compliance || '',
        description: c.description || '',
        corridorRiskLevel: (c.riskLevel || 'MEDIUM').toLowerCase(),
        riskReason: c.riskReason || '',
        travelRuleThreshold: c.travelRuleThreshold ? Number(c.travelRuleThreshold) : 1000,
        eddThreshold: c.eddThreshold ? Number(c.eddThreshold) : 10000,
        reportingThreshold: c.reportingThreshold ? Number(c.reportingThreshold) : 15000,
      }));

      res.status(200).json({
        corridors: formatted,
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

// ─── Corridor Threshold Rules ──────────────────────────────────

// GET /api/v1/institution-escrow/corridors/:code/threshold-rules
router.get(
  '/api/v1/institution-escrow/corridors/:code/threshold-rules',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const { code } = req.params;

      const rules = await (
        await import('../config/database')
      ).prisma.corridorThresholdRule.findMany({
        where: { corridorCode: code, isActive: true },
        select: {
          ruleId: true,
          label: true,
          riskLevel: true,
          thresholdType: true,
          thresholdAmount: true,
          thresholdMax: true,
          currency: true,
          detailTemplate: true,
          regulationRef: true,
        },
        orderBy: { ruleId: 'asc' },
      });

      if (rules.length === 0) {
        // Check if corridor exists at all
        const corridor = await (
          await import('../config/database')
        ).prisma.institutionCorridor.findUnique({
          where: { code },
          select: { code: true },
        });
        if (!corridor) {
          res.status(404).json({
            error: 'Not Found',
            message: `Corridor ${code} not found`,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      const formatted = rules.map((r: any) => ({
        ruleId: r.ruleId,
        label: r.label,
        riskLevel: r.riskLevel,
        thresholdType: r.thresholdType,
        thresholdAmount: r.thresholdAmount ? Number(r.thresholdAmount) : null,
        thresholdMax: r.thresholdMax ? Number(r.thresholdMax) : null,
        currency: r.currency,
        detailTemplate: r.detailTemplate,
        regulationRef: r.regulationRef,
      }));

      res.status(200).json({
        success: true,
        corridorCode: code,
        rules: formatted,
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

export default router;
