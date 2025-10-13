/**
 * Expiry and Cancellation Routes
 * 
 * API endpoints for managing agreement expiry, cancellation, and refunds
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
  getExpiryCancellationOrchestrator,
  OrchestratorEventType,
} from '../services/expiry-cancellation-orchestrator.service';

const router = Router();
const orchestrator = getExpiryCancellationOrchestrator();

/**
 * Validation middleware helper
 */
const validate = (req: Request, res: Response, next: Function) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

/**
 * GET /api/expiry-cancellation/status
 * Get orchestrator status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await orchestrator.getStatus();
    res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('Error getting orchestrator status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orchestrator status',
    });
  }
});

/**
 * GET /api/expiry-cancellation/health
 * Health check for expiry and cancellation services
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await orchestrator.healthCheck();
    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json({
      success: health.healthy,
      health,
    });
  } catch (error) {
    console.error('Error checking health:', error);
    res.status(503).json({
      success: false,
      error: 'Health check failed',
    });
  }
});

/**
 * POST /api/expiry-cancellation/check-expired
 * Manually trigger expiry check
 */
router.post('/check-expired', async (req: Request, res: Response) => {
  try {
    const services = orchestrator.getServices();
    const result = await services.expiry.performManualCheck();
    
    res.json({
      success: true,
      result: {
        checkedCount: result.checkedCount,
        expiredCount: result.expiredCount,
        expiredAgreementIds: result.expiredAgreementIds,
        errorCount: result.errors.length,
      },
    });
  } catch (error) {
    console.error('Error checking expired agreements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check expired agreements',
    });
  }
});

/**
 * GET /api/expiry-cancellation/expiring-soon
 * Get agreements that are about to expire
 */
router.get(
  '/expiring-soon',
  [
    query('withinMinutes').optional().isInt({ min: 1, max: 1440 }).toInt(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const withinMinutes = (req.query.withinMinutes as number) || 60;
      const services = orchestrator.getServices();
      const agreements = await services.expiry.getExpiringAgreements(withinMinutes);
      
      res.json({
        success: true,
        agreements,
        count: agreements.length,
        withinMinutes,
      });
    } catch (error) {
      console.error('Error getting expiring agreements:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get expiring agreements',
      });
    }
  }
);

/**
 * GET /api/expiry-cancellation/refund/calculate/:agreementId
 * Calculate refund for an agreement
 */
router.get(
  '/refund/calculate/:agreementId',
  [
    param('agreementId').notEmpty().trim(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { agreementId } = req.params;
      const services = orchestrator.getServices();
      const calculation = await services.refund.calculateRefunds(agreementId);
      
      res.json({
        success: true,
        calculation,
      });
    } catch (error) {
      console.error('Error calculating refund:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate refund',
      });
    }
  }
);

/**
 * POST /api/expiry-cancellation/refund/process/:agreementId
 * Process refund for an agreement
 */
router.post(
  '/refund/process/:agreementId',
  [
    param('agreementId').notEmpty().trim(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { agreementId } = req.params;
      const services = orchestrator.getServices();
      const result = await services.refund.processRefunds(agreementId);
      
      res.json({
        success: result.success,
        result,
      });
    } catch (error) {
      console.error('Error processing refund:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process refund',
      });
    }
  }
);

/**
 * GET /api/expiry-cancellation/refund/eligibility/:agreementId
 * Check refund eligibility for an agreement
 */
router.get(
  '/refund/eligibility/:agreementId',
  [
    param('agreementId').notEmpty().trim(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { agreementId } = req.params;
      const services = orchestrator.getServices();
      const eligibility = await services.refund.checkRefundEligibility(agreementId);
      
      res.json({
        success: true,
        eligibility,
      });
    } catch (error) {
      console.error('Error checking refund eligibility:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check refund eligibility',
      });
    }
  }
);

/**
 * POST /api/expiry-cancellation/cancellation/propose
 * Create a cancellation proposal
 */
router.post(
  '/cancellation/propose',
  [
    body('agreementId').notEmpty().trim(),
    body('proposer').notEmpty().trim(),
    body('reason').notEmpty().trim(),
    body('requiredSignatures').optional().isInt({ min: 1, max: 10 }).toInt(),
    body('expiryHours').optional().isInt({ min: 1, max: 168 }).toInt(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { agreementId, proposer, reason, requiredSignatures, expiryHours } = req.body;
      const services = orchestrator.getServices();
      
      const proposal = await services.cancellation.createCancellationProposal({
        agreementId,
        proposer,
        reason,
        requiredSignatures,
        expiryHours,
      });
      
      res.json({
        success: true,
        proposal,
      });
    } catch (error) {
      console.error('Error creating cancellation proposal:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create cancellation proposal',
      });
    }
  }
);

/**
 * POST /api/expiry-cancellation/cancellation/sign/:proposalId
 * Sign a cancellation proposal
 */
router.post(
  '/cancellation/sign/:proposalId',
  [
    param('proposalId').notEmpty().trim(),
    body('signer').notEmpty().trim(),
    body('signature').notEmpty().trim(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { proposalId } = req.params;
      const { signer, signature } = req.body;
      const services = orchestrator.getServices();
      
      const proposal = await services.cancellation.signProposal(proposalId, signer, signature);
      
      res.json({
        success: true,
        proposal,
      });
    } catch (error) {
      console.error('Error signing cancellation proposal:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sign cancellation proposal',
      });
    }
  }
);

/**
 * POST /api/expiry-cancellation/cancellation/execute/:proposalId
 * Execute an approved cancellation proposal
 */
router.post(
  '/cancellation/execute/:proposalId',
  [
    param('proposalId').notEmpty().trim(),
    body('executor').notEmpty().trim(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { proposalId } = req.params;
      const { executor } = req.body;
      const services = orchestrator.getServices();
      
      const result = await services.cancellation.executeProposal(proposalId, executor);
      
      res.json({
        success: result.success,
        result,
      });
    } catch (error) {
      console.error('Error executing cancellation proposal:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute cancellation proposal',
      });
    }
  }
);

/**
 * GET /api/expiry-cancellation/cancellation/proposal/:proposalId
 * Get cancellation proposal by ID
 */
router.get(
  '/cancellation/proposal/:proposalId',
  [
    param('proposalId').notEmpty().trim(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { proposalId } = req.params;
      const services = orchestrator.getServices();
      const proposal = services.cancellation.getProposal(proposalId);
      
      if (!proposal) {
        return res.status(404).json({
          success: false,
          error: 'Proposal not found',
        });
      }
      
      res.json({
        success: true,
        proposal,
      });
    } catch (error) {
      console.error('Error getting cancellation proposal:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cancellation proposal',
      });
    }
  }
);

/**
 * GET /api/expiry-cancellation/cancellation/proposals/pending
 * Get all pending cancellation proposals
 */
router.get('/cancellation/proposals/pending', async (req: Request, res: Response) => {
  try {
    const services = orchestrator.getServices();
    const proposals = services.cancellation.getPendingProposals();
    
    res.json({
      success: true,
      proposals,
      count: proposals.length,
    });
  } catch (error) {
    console.error('Error getting pending proposals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pending proposals',
    });
  }
});

/**
 * GET /api/expiry-cancellation/cancellation/proposals/agreement/:agreementId
 * Get cancellation proposals for an agreement
 */
router.get(
  '/cancellation/proposals/agreement/:agreementId',
  [
    param('agreementId').notEmpty().trim(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { agreementId } = req.params;
      const services = orchestrator.getServices();
      const proposals = services.cancellation.getProposalsForAgreement(agreementId);
      
      res.json({
        success: true,
        proposals,
        count: proposals.length,
      });
    } catch (error) {
      console.error('Error getting proposals for agreement:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get proposals for agreement',
      });
    }
  }
);

/**
 * POST /api/expiry-cancellation/status/update/:agreementId
 * Update agreement status
 */
router.post(
  '/status/update/:agreementId',
  [
    param('agreementId').notEmpty().trim(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { agreementId } = req.params;
      const services = orchestrator.getServices();
      const result = await services.statusUpdate.updateAgreementStatus(agreementId);
      
      res.json({
        success: result.success,
        result,
      });
    } catch (error) {
      console.error('Error updating agreement status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update agreement status',
      });
    }
  }
);

/**
 * POST /api/expiry-cancellation/process-expiry/:agreementId
 * Process agreement expiry (check expiry and handle refunds)
 */
router.post(
  '/process-expiry/:agreementId',
  [
    param('agreementId').notEmpty().trim(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { agreementId } = req.params;
      const result = await orchestrator.processAgreementExpiry(agreementId);
      
      res.json({
        success: result.errors.length === 0,
        result,
      });
    } catch (error) {
      console.error('Error processing agreement expiry:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process agreement expiry',
      });
    }
  }
);

/**
 * GET /api/expiry-cancellation/errors
 * Get recent errors
 */
router.get(
  '/errors',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const limit = (req.query.limit as number) || 10;
      const errors = orchestrator.getErrors(limit);
      
      res.json({
        success: true,
        errors,
        count: errors.length,
      });
    } catch (error) {
      console.error('Error getting errors:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get errors',
      });
    }
  }
);

export default router;

