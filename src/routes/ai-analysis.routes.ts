/**
 * AI Analysis Routes — "EasyEscrow AI"
 *
 * Escrow Analysis:
 * POST   /api/v1/ai/analyze-escrow/:escrow_id          → analyzeEscrow
 * GET    /api/v1/ai/escrow-analysis/:escrow_id          → getEscrowAnalysis
 *
 * Document Analysis:
 * POST   /api/v1/ai/analyze-escrow-doc/:escrow_id       → analyzeDocument (primary)
 * GET    /api/v1/ai/escrow-doc-analysis/:escrow_id      → getDocumentAnalysisResults (primary)
 *
 * Client Analysis:
 * POST   /api/v1/ai/analyze-client                      → analyzeClient
 * GET    /api/v1/ai/client-analysis                     → getClientAnalysis
 *
 * Legacy aliases (backward compatibility):
 * POST   /api/v1/ai/analyze/:escrow_id                  → analyzeDocument
 * GET    /api/v1/ai/analysis/:escrow_id                 → getDocumentAnalysisResults
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

// Legacy aliases (backward compatibility)
router.post(
  '/api/v1/ai/analyze/:escrow_id',
  strictRateLimiter,
  requireInstitutionAuth,
  validateAiAnalysis,
  handleAnalyzeDocument,
);

router.get(
  '/api/v1/ai/analysis/:escrow_id',
  standardRateLimiter,
  requireInstitutionAuth,
  validateEscrowIdParam,
  handleGetDocumentAnalysis,
);

// ─── Client Analysis ────────────────────────────────────────────

// POST /api/v1/ai/analyze-client — AI analysis of the authenticated client's profile
router.post(
  '/api/v1/ai/analyze-client',
  strictRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getAiAnalysisService();
      const result = await service.analyzeClient(
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
        error: 'Client Analysis Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// GET /api/v1/ai/client-analysis — get stored client analysis results
router.get(
  '/api/v1/ai/client-analysis',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getAiAnalysisService();
      const results = await service.getClientAnalysis(
        req.institutionClient!.clientId,
      );

      res.status(200).json({
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
