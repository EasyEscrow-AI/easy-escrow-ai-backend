/**
 * AI Analysis Routes — "EasyEscrow AI"
 *
 * Escrow Analysis:
 * POST   /api/v1/ai/analyze-escrow/:escrow_id          → analyzeEscrow (param-based, UUID only)
 * POST   /api/v1/institution/ai/analyze-escrow          → analyzeEscrow (body-based, UUID or escrow code)
 * GET    /api/v1/ai/escrow-analysis/:escrow_id          → getEscrowAnalysis
 *
 * Corridor Analysis:
 * GET    /api/v1/institution/ai/analyze-corridor        → analyzeCorridor
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
import { body, param, query, validationResult } from 'express-validator';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { validateAiAnalysis } from '../middleware/institution-escrow-validation.middleware';
import { getAiAnalysisService } from '../services/ai-analysis.service';
import { getCorridorAnalysisService } from '../services/corridor-analysis.service';

// Param-only validation for GET routes (no body required)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESCROW_CODE_REGEX = /^EE-[A-Z0-9]{3,4}-[A-Z0-9]{3,4}$/;
const validateEscrowIdParam = [
  param('escrow_id').custom((value: string) => {
    if (UUID_REGEX.test(value) || ESCROW_CODE_REGEX.test(value)) return true;
    throw new Error('Must be a valid UUID or escrow code (EE-XXX-XXX)');
  }),
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
    const status = error.message.includes('rate limit')
      ? 429
      : error.message.includes('not found')
      ? 404
      : error.message.includes('not configured')
      ? 503
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
      req.institutionClient!.clientId
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
      res
        .status(400)
        .json({
          error: 'Validation Error',
          details: errors.array(),
          timestamp: new Date().toISOString(),
        });
      return;
    }

    try {
      const service = getAiAnalysisService();
      const tier = req.body?.tier;
      const result =
        tier === 'fast'
          ? await service.analyzeEscrowFast(req.params.escrow_id, req.institutionClient!.clientId, {
              anonymize: true,
            })
          : await service.analyzeEscrow(req.params.escrow_id, req.institutionClient!.clientId, {
              anonymize: true,
            });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('rate limit')
        ? 429
        : error.message.includes('not found')
        ? 404
        : error.message.includes('not configured')
        ? 503
        : 500;
      res.status(status).json({
        error: 'Escrow Analysis Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
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
      res
        .status(400)
        .json({
          error: 'Validation Error',
          details: errors.array(),
          timestamp: new Date().toISOString(),
        });
      return;
    }

    try {
      const service = getAiAnalysisService();
      const results = await service.getEscrowAnalysis(
        req.params.escrow_id,
        req.institutionClient!.clientId
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
);

// POST /api/v1/institution/ai/analyze-escrow — body-based escrow analysis (accepts UUID or escrow code)
const validateEscrowIdBody = [
  body('escrowId')
    .isString()
    .matches(
      /^(EE-[A-Z0-9]{3}-[A-Z0-9]{3}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
    )
    .withMessage('escrowId must be a valid UUID or escrow code (EE-XXX-XXX)'),
  body('tier').optional().isIn(['fast', 'full']).withMessage('tier must be "fast" or "full"'),
];

router.post(
  '/api/v1/institution/ai/analyze-escrow',
  strictRateLimiter,
  requireInstitutionAuth,
  validateEscrowIdBody,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res
        .status(400)
        .json({
          error: 'Validation Error',
          details: errors.array(),
          timestamp: new Date().toISOString(),
        });
      return;
    }

    try {
      const service = getAiAnalysisService();
      const tier = req.body.tier;
      const result =
        tier === 'fast'
          ? await service.analyzeEscrowFast(req.body.escrowId, req.institutionClient!.clientId, {
              anonymize: true,
            })
          : await service.analyzeEscrow(req.body.escrowId, req.institutionClient!.clientId, {
              anonymize: true,
            });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('rate limit')
        ? 429
        : error.message.includes('not found')
        ? 404
        : error.message.includes('not configured')
        ? 503
        : 500;
      res.status(status).json({
        error: 'Escrow Analysis Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ─── Document Analysis ──────────────────────────────────────────

// POST /api/v1/ai/analyze-escrow-doc/:escrow_id (primary)
router.post(
  '/api/v1/ai/analyze-escrow-doc/:escrow_id',
  strictRateLimiter,
  requireInstitutionAuth,
  validateAiAnalysis,
  handleAnalyzeDocument
);

// GET /api/v1/ai/escrow-doc-analysis/:escrow_id (primary)
router.get(
  '/api/v1/ai/escrow-doc-analysis/:escrow_id',
  standardRateLimiter,
  requireInstitutionAuth,
  validateEscrowIdParam,
  handleGetDocumentAnalysis
);

// Legacy aliases (backward compatibility)
router.post(
  '/api/v1/ai/analyze/:escrow_id',
  strictRateLimiter,
  requireInstitutionAuth,
  validateAiAnalysis,
  handleAnalyzeDocument
);

router.get(
  '/api/v1/ai/analysis/:escrow_id',
  standardRateLimiter,
  requireInstitutionAuth,
  validateEscrowIdParam,
  handleGetDocumentAnalysis
);

// ─── Corridor Analysis ──────────────────────────────────────────

const validateCorridorAnalysis = [
  query('fromCountry')
    .isString()
    .isLength({ min: 2, max: 2 })
    .isAlpha()
    .isUppercase()
    .withMessage('fromCountry must be a 2-letter uppercase country code'),
  query('toCountry')
    .isString()
    .isLength({ min: 2, max: 2 })
    .isAlpha()
    .isUppercase()
    .withMessage('toCountry must be a 2-letter uppercase country code'),
  query('amount').optional().isFloat({ min: 1 }).withMessage('amount must be a positive number'),
  query('currency')
    .optional()
    .isString()
    .isIn(['USDC', 'USDT'])
    .withMessage('currency must be USDC or USDT'),
];

// GET /api/v1/institution/ai/analyze-corridor
router.get(
  '/api/v1/institution/ai/analyze-corridor',
  standardRateLimiter,
  requireInstitutionAuth,
  validateCorridorAnalysis,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
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
      const service = getCorridorAnalysisService();
      const result = await service.analyzeCorridor({
        fromCountry: req.query.fromCountry as string,
        toCountry: req.query.toCountry as string,
        amount: req.query.amount ? parseFloat(req.query.amount as string) : undefined,
        currency: (req.query.currency as string) || 'USDC',
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found')
        ? 404
        : error.message.includes('not supported')
        ? 404
        : 500;
      res.status(status).json({
        error: 'Corridor Analysis Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
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
      const result = await service.analyzeClient(req.institutionClient!.clientId, {
        anonymize: true,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('rate limit')
        ? 429
        : error.message.includes('not found')
        ? 404
        : error.message.includes('not configured')
        ? 503
        : 500;
      res.status(status).json({
        error: 'Client Analysis Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/ai/client-analysis — get stored client analysis results
router.get(
  '/api/v1/ai/client-analysis',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getAiAnalysisService();
      const results = await service.getClientAnalysis(req.institutionClient!.clientId);

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
  }
);

export default router;
