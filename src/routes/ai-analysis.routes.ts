/**
 * AI Analysis Routes — "EasyEscrow AI"
 *
 * POST   /api/v1/ai/analyze-escrow-doc/:escrow_id    → analyzeDocument
 * GET    /api/v1/ai/escrow-doc-analysis/:escrow_id   → getAnalysisResults
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { param, validationResult } from 'express-validator';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { validateAiAnalysis } from '../middleware/institution-escrow-validation.middleware';
import { getAiAnalysisService } from '../services/ai-analysis.service';

// Param-only validation for GET routes (no body required)
const validateEscrowIdParam = [
  param('escrow_id').isUUID().withMessage('Escrow ID must be a valid UUID'),
];

const router = Router();

const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Rate limit exceeded', message: 'Too many AI analysis requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Shared Handlers ────────────────────────────────────────────

async function handleAnalyzeDocument(req: InstitutionAuthenticatedRequest, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'Validation Error',
      details: errors.array(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const service = getAiAnalysisService();
    const result = await service.analyzeDocument({
      escrowId: req.params.escrow_id,
      fileId: req.body.fileId,
      clientId: req.institutionClient!.clientId,
      context: req.body.context,
    });

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const status = error.message.includes('rate limit') ? 429
      : error.message.includes('not found') ? 404
      : error.message.includes('not configured') ? 503
      : 500;
    res.status(status).json({
      error: 'Analysis Failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

async function handleGetDocumentAnalysis(req: InstitutionAuthenticatedRequest, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'Validation Error',
      details: errors.array(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const service = getAiAnalysisService();
    const results = await service.getAnalysisResults(
      req.params.escrow_id,
      req.institutionClient!.clientId,
    );

    res.status(200).json({
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      error: status === 404 ? 'Not Found' : 'Internal Error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Escrow Analysis ────────────────────────────────────────────

// POST /api/v1/ai/analyze-escrow/:escrow_id — full AI analysis of escrow details
router.post(
  '/api/v1/ai/analyze-escrow/:escrow_id',
  strictRateLimiter,
  requireInstitutionAuth,
  validateEscrowIdParam,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation Error', details: errors.array(), timestamp: new Date().toISOString() });
      return;
    }

    try {
      const service = getAiAnalysisService();
      const result = await service.analyzeEscrow(
        req.params.escrow_id,
        req.institutionClient!.clientId,
        { anonymize: true },
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('rate limit') ? 429
        : error.message.includes('not found') ? 404
        : error.message.includes('not configured') ? 503
        : 500;
      res.status(status).json({
        error: 'Escrow Analysis Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// GET /api/v1/ai/escrow-analysis/:escrow_id — get stored escrow analysis results
router.get(
  '/api/v1/ai/escrow-analysis/:escrow_id',
  standardRateLimiter,
  requireInstitutionAuth,
  validateEscrowIdParam,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation Error', details: errors.array(), timestamp: new Date().toISOString() });
      return;
    }

    try {
      const service = getAiAnalysisService();
      const results = await service.getEscrowAnalysis(
        req.params.escrow_id,
        req.institutionClient!.clientId,
      );

      res.status(200).json({
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 500;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Internal Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// ─── Document Analysis ──────────────────────────────────────────

// POST /api/v1/ai/analyze-escrow-doc/:escrow_id (primary)
router.post(
  '/api/v1/ai/analyze-escrow-doc/:escrow_id',
  strictRateLimiter,
  requireInstitutionAuth,
  validateAiAnalysis,
  handleAnalyzeDocument,
);

// GET /api/v1/ai/escrow-doc-analysis/:escrow_id (primary)
router.get(
  '/api/v1/ai/escrow-doc-analysis/:escrow_id',
  standardRateLimiter,
  requireInstitutionAuth,
  validateEscrowIdParam,
  handleGetDocumentAnalysis,
);

export default router;
