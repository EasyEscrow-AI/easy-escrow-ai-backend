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
  requireInstitutionOrAdminAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { validateAiAnalysis } from '../middleware/institution-escrow-validation.middleware';
import { getAiAnalysisService, EscrowAnalysisResult } from '../services/ai-analysis.service';
import { getCorridorAnalysisService } from '../services/corridor-analysis.service';
import { prisma } from '../config/database';
import { escrowWhere } from '../utils/uuid-conversion';

interface PreReleaseCheck {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

/**
 * Build deterministic pre-release verification checks for PENDING_RELEASE escrows.
 * Appended to analyze-escrow response so the frontend gets everything from one call.
 */
async function buildPreReleaseChecks(
  escrowIdOrCode: string,
  clientId: string,
  analysisResult: EscrowAnalysisResult
): Promise<PreReleaseCheck[] | null> {
  // Allow both escrow creator and counterparty (recipient) to access
  const base = escrowWhere(escrowIdOrCode);
  let whereClause: Record<string, unknown> = { ...base, clientId };

  const owned = await prisma.institutionEscrow.findFirst({
    where: whereClause,
    select: { escrowId: true },
  });
  if (!owned) {
    // Check counterparty access
    const esc = await prisma.institutionEscrow.findFirst({
      where: base,
      select: { escrowId: true, recipientWallet: true, payerWallet: true },
    });
    if (esc) {
      const client = await prisma.institutionClient.findUnique({
        where: { id: clientId },
        select: { primaryWallet: true, settledWallets: true },
      });
      const accounts = await prisma.institutionAccount.findMany({
        where: { clientId, isActive: true },
        select: { walletAddress: true },
      });
      const callerWallets = [
        client?.primaryWallet,
        ...(client?.settledWallets || []),
        ...accounts.map((a: { walletAddress: string }) => a.walletAddress),
      ].filter(Boolean);
      const isCounterparty = callerWallets.some(
        (w) => w === esc.recipientWallet || w === esc.payerWallet
      );
      if (isCounterparty) whereClause = base;
      else return null;
    } else {
      return null;
    }
  }

  const escrow = await prisma.institutionEscrow.findFirst({
    where: whereClause,
    include: {
      client: {
        select: { companyName: true, kycStatus: true, country: true },
      },
      files: {
        select: { id: true, fileName: true, documentType: true },
        orderBy: { uploadedAt: 'desc' as const },
      },
    },
  });
  if (!escrow || escrow.status !== 'PENDING_RELEASE') return null;

  // Resolve party names for sender/recipient display
  const payerName = (escrow as any).payerName || escrow.client.companyName || 'Unknown';
  const payerBranch = (escrow as any).payerBranchName || null;
  const payerAccount = (escrow as any).payerAccountLabel || null;
  const senderDetail = [payerName, payerBranch, payerAccount].filter(Boolean).join(' - ');

  let recipientDetail = 'Unknown';
  if ((escrow as any).recipientName) {
    recipientDetail = [(escrow as any).recipientName, (escrow as any).recipientBranchName, (escrow as any).recipientAccountLabel]
      .filter(Boolean)
      .join(' - ');
  }

  // Fetch corridor for compliance info
  const corridor = escrow.corridor
    ? await prisma.institutionCorridor.findUnique({
        where: { code: escrow.corridor },
        select: { compliance: true, riskLevel: true },
      })
    : null;

  const checks: PreReleaseCheck[] = [];

  // 1. Proof of Delivery
  const hasDocuments = escrow.files.length > 0;
  const docName = hasDocuments ? escrow.files[0].fileName : null;
  checks.push({
    key: 'proof_of_delivery',
    label: 'Proof of Delivery verified',
    passed: hasDocuments,
    detail: hasDocuments ? `Document ${docName} uploaded` : 'No documents uploaded',
  });

  // 2. Amount matches escrow
  const amount = Number(escrow.amount);
  checks.push({
    key: 'amount_confirmed',
    label: 'Amount matches escrow',
    passed: amount > 0,
    detail: `${amount.toLocaleString()} USDC confirmed`,
  });

  // 3. Sender identity verified
  const senderKyc = escrow.client.kycStatus === 'VERIFIED';
  checks.push({
    key: 'sender_verified',
    label: 'Sender identity verified',
    passed: senderKyc,
    detail: senderDetail,
  });

  // 4. Recipient identity verified
  const recipientKycSection = (analysisResult.sections as any)?.account_verifications;
  const recipientPassed = recipientKycSection?.risk !== 'blocked' && recipientKycSection?.risk !== 'high_risk';
  checks.push({
    key: 'recipient_verified',
    label: 'Recipient identity verified',
    passed: recipientPassed,
    detail: recipientDetail,
  });

  // 5. Corridor compliance
  const corridorSection = (analysisResult.sections as any)?.payment_corridor;
  const corridorPassed = corridorSection?.risk === 'low_risk' || corridorSection?.risk === 'medium_risk';
  checks.push({
    key: 'corridor_compliance',
    label: 'Corridor compliance passed',
    passed: corridorPassed,
    detail: `${escrow.corridor || 'Unknown'} — ${corridor?.compliance || 'Auto'}`,
  });

  // 6. Sanctions screening
  const overallPassed = analysisResult.risk !== 'blocked';
  checks.push({
    key: 'sanctions_screening',
    label: 'Sanctions screening clear',
    passed: overallPassed,
    detail: overallPassed ? 'OFAC, EU, UN — no matches' : 'Potential sanctions match detected',
  });

  return checks;
}

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
  requireInstitutionOrAdminAuth,
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

      // Enrich with pre-release verification checks for PENDING_RELEASE escrows
      const preReleaseChecks = await buildPreReleaseChecks(
        req.params.escrow_id, req.institutionClient!.clientId, result
      );

      res.status(200).json({
        success: true,
        data: { ...result, ...(preReleaseChecks && { preReleaseChecks }) },
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
  requireInstitutionOrAdminAuth,
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
  requireInstitutionOrAdminAuth,
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

      // Enrich with pre-release verification checks for PENDING_RELEASE escrows
      const preReleaseChecks = await buildPreReleaseChecks(
        req.body.escrowId, req.institutionClient!.clientId, result
      );

      res.status(200).json({
        success: true,
        data: { ...result, ...(preReleaseChecks && { preReleaseChecks }) },
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
  requireInstitutionOrAdminAuth,
  validateAiAnalysis,
  handleAnalyzeDocument
);

// GET /api/v1/ai/escrow-doc-analysis/:escrow_id (primary)
router.get(
  '/api/v1/ai/escrow-doc-analysis/:escrow_id',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
  validateEscrowIdParam,
  handleGetDocumentAnalysis
);

// Legacy aliases (backward compatibility)
router.post(
  '/api/v1/ai/analyze/:escrow_id',
  strictRateLimiter,
  requireInstitutionOrAdminAuth,
  validateAiAnalysis,
  handleAnalyzeDocument
);

router.get(
  '/api/v1/ai/analysis/:escrow_id',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
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
  requireInstitutionOrAdminAuth,
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
  requireInstitutionOrAdminAuth,
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
  requireInstitutionOrAdminAuth,
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
