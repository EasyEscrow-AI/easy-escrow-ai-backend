/**
 * Institution Escrow Admin Routes
 *
 * POST   /api/admin/institution-escrow/allowlist          → addToAllowlist
 * DELETE /api/admin/institution-escrow/allowlist/:wallet   → removeFromAllowlist
 * GET    /api/admin/institution-escrow/allowlist           → listAllowlist
 * POST   /api/admin/institution-escrow/corridors           → configureCorridor
 * GET    /api/admin/institution-escrow/corridors            → listCorridors
 * POST   /api/admin/institution-escrow/pause               → pauseEscrowOperations
 * POST   /api/admin/institution-escrow/unpause             → unpauseEscrowOperations
 * GET    /api/admin/institution-escrow/pause               → getPauseStatus
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { validationResult } from 'express-validator';
import {
  requireAdminOrApiKey,
  AdminAuthenticatedRequest,
} from '../../middleware/admin-jwt.middleware';
import { getAllowlistService } from '../../services/allowlist.service';
import {
  validateAddToAllowlist,
  validateConfigureCorridor,
  validatePauseEscrow,
} from '../../middleware/institution-escrow-validation.middleware';
import { getInstitutionEscrowPauseService } from '../../services/institution-escrow-pause.service';
import { prisma } from '../../config/database';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/admin/institution-escrow/allowlist
router.post(
  '/api/admin/institution-escrow/allowlist',
  standardRateLimiter,
  requireAdminOrApiKey,
  validateAddToAllowlist,
  async (req: Request, res: Response) => {
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
      const service = getAllowlistService();
      await service.addToAllowlist(req.body.wallet, req.body.clientId);

      res.status(201).json({
        success: true,
        message: `Wallet ${req.body.wallet} added to allowlist`,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Failed to add to allowlist',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// DELETE /api/admin/institution-escrow/allowlist/:wallet
router.delete(
  '/api/admin/institution-escrow/allowlist/:wallet',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: Request, res: Response) => {
    try {
      const service = getAllowlistService();
      await service.removeFromAllowlist(req.params.wallet);

      res.status(200).json({
        success: true,
        message: `Wallet ${req.params.wallet} removed from allowlist`,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Failed to remove from allowlist',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/admin/institution-escrow/allowlist
router.get(
  '/api/admin/institution-escrow/allowlist',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (_req: Request, res: Response) => {
    try {
      const service = getAllowlistService();
      const wallets = await service.listAllowlist();

      res.status(200).json({
        success: true,
        data: wallets,
        count: wallets.length,
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

// POST /api/admin/institution-escrow/corridors
router.post(
  '/api/admin/institution-escrow/corridors',
  standardRateLimiter,
  requireAdminOrApiKey,
  validateConfigureCorridor,
  async (req: Request, res: Response) => {
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
      const code = `${req.body.sourceCountry}-${req.body.destCountry}`;

      const corridor = await prisma.institutionCorridor.upsert({
        where: { code },
        create: {
          code,
          sourceCountry: req.body.sourceCountry,
          destCountry: req.body.destCountry,
          minAmount: req.body.minAmount,
          maxAmount: req.body.maxAmount,
          dailyLimit: req.body.dailyLimit,
          monthlyLimit: req.body.monthlyLimit,
          requiredDocuments: req.body.requiredDocuments || [],
          riskLevel: req.body.riskLevel,
        },
        update: {
          minAmount: req.body.minAmount,
          maxAmount: req.body.maxAmount,
          dailyLimit: req.body.dailyLimit,
          monthlyLimit: req.body.monthlyLimit,
          requiredDocuments: req.body.requiredDocuments || [],
          riskLevel: req.body.riskLevel,
        },
      });

      res.status(201).json({
        success: true,
        data: corridor,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Corridor Configuration Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/admin/institution-escrow/corridors
router.get(
  '/api/admin/institution-escrow/corridors',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (_req: Request, res: Response) => {
    try {
      const corridors = await prisma.institutionCorridor.findMany({
        orderBy: { code: 'asc' },
      });

      res.status(200).json({
        success: true,
        data: corridors,
        count: corridors.length,
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

// POST /api/admin/institution-escrow/pause
router.post(
  '/api/admin/institution-escrow/pause',
  standardRateLimiter,
  requireAdminOrApiKey,
  validatePauseEscrow,
  async (req: AdminAuthenticatedRequest, res: Response) => {
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
      const pauseService = getInstitutionEscrowPauseService();
      const adminIdentifier = req.adminUser?.adminId || req.apiKeyFingerprint;
      if (!adminIdentifier) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot determine admin identity for audit trail',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const state = await pauseService.pause(req.body.reason, adminIdentifier);

      res.status(201).json({
        success: true,
        data: state,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error.code === 'ALREADY_PAUSED') {
        res.status(409).json({
          error: 'Already Paused',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      res.status(500).json({
        error: 'Internal Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/admin/institution-escrow/unpause
router.post(
  '/api/admin/institution-escrow/unpause',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const pauseService = getInstitutionEscrowPauseService();
      const adminIdentifier = req.adminUser?.adminId || req.apiKeyFingerprint;
      if (!adminIdentifier) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot determine admin identity for audit trail',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      await pauseService.unpause(adminIdentifier);

      res.status(200).json({
        success: true,
        message: 'Institution escrow operations resumed',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error.code === 'NOT_PAUSED') {
        res.status(409).json({
          error: 'Not Paused',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      res.status(500).json({
        error: 'Internal Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/admin/institution-escrow/pause
router.get(
  '/api/admin/institution-escrow/pause',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (_req: Request, res: Response) => {
    try {
      const pauseService = getInstitutionEscrowPauseService();
      const state = await pauseService.getStatus();

      res.status(200).json({
        success: true,
        data: state,
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

// ─── Corridor Management ─────────────────────────────────────────────

// PATCH /api/admin/institution-escrow/corridors/:code
router.patch(
  '/api/admin/institution-escrow/corridors/:code',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: Request, res: Response) => {
    try {
      const { code } = req.params;

      const corridor = await prisma.institutionCorridor.findUnique({
        where: { code },
      });

      if (!corridor) {
        res.status(404).json({
          error: 'Not Found',
          message: `Corridor ${code} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const allowedFields: Record<string, boolean> = {
        minAmount: true, maxAmount: true, dailyLimit: true, monthlyLimit: true,
        requiredDocuments: true, riskLevel: true, status: true, name: true,
        compliance: true, description: true, riskReason: true,
        travelRuleThreshold: true, eddThreshold: true, reportingThreshold: true,
      };

      const data: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (allowedFields[key]) data[key] = value;
      }

      if (Object.keys(data).length === 0) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'No valid fields to update',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const updated = await prisma.institutionCorridor.update({
        where: { code },
        data,
      });

      res.status(200).json({
        success: true,
        data: updated,
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

// ─── Client Settings (Admin) ────────────────────────────────────────

// GET /api/admin/institution-escrow/clients/:clientId/settings
router.get(
  '/api/admin/institution-escrow/clients/:clientId/settings',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;

      const settings = await prisma.institutionClientSettings.findUnique({
        where: { clientId },
      });

      if (!settings) {
        res.status(404).json({
          error: 'Not Found',
          message: `Settings not found for client ${clientId}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: settings,
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

// PATCH /api/admin/institution-escrow/clients/:clientId/settings
router.patch(
  '/api/admin/institution-escrow/clients/:clientId/settings',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;

      const existing = await prisma.institutionClientSettings.findUnique({
        where: { clientId },
      });

      if (!existing) {
        res.status(404).json({
          error: 'Not Found',
          message: `Settings not found for client ${clientId}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const allowedFields: Record<string, boolean> = {
        defaultCorridor: true, defaultCurrency: true, timezone: true,
        autoApproveThreshold: true, manualReviewThreshold: true,
        autoTravelRule: true, aiAutoRelease: true, riskTolerance: true,
        defaultToken: true, emailNotifications: true, feeBps: true,
        minFeeUsdc: true, maxFeeUsdc: true,
      };

      const data: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (allowedFields[key]) data[key] = value;
      }

      const updated = await prisma.institutionClientSettings.update({
        where: { clientId },
        data,
      });

      res.status(200).json({
        success: true,
        data: updated,
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

// ─── Client Status (Admin) ──────────────────────────────────────────

// GET /api/admin/institution-escrow/clients/:clientId/status
router.get(
  '/api/admin/institution-escrow/clients/:clientId/status',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;

      const client = await prisma.institutionClient.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          companyName: true,
          status: true,
          kycStatus: true,
          tier: true,
          isArchived: true,
          riskRating: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!client) {
        res.status(404).json({
          error: 'Not Found',
          message: `Client ${clientId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: client,
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

// PATCH /api/admin/institution-escrow/clients/:clientId/status
router.patch(
  '/api/admin/institution-escrow/clients/:clientId/status',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const { clientId } = req.params;

      const client = await prisma.institutionClient.findUnique({
        where: { id: clientId },
      });

      if (!client) {
        res.status(404).json({
          error: 'Not Found',
          message: `Client ${clientId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const allowedFields: Record<string, boolean> = {
        status: true, kycStatus: true, tier: true, isArchived: true, riskRating: true,
      };

      const data: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (allowedFields[key]) data[key] = value;
      }

      if (Object.keys(data).length === 0) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'No valid fields to update',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const updated = await prisma.institutionClient.update({
        where: { id: clientId },
        data,
        select: {
          id: true,
          companyName: true,
          status: true,
          kycStatus: true,
          tier: true,
          isArchived: true,
          riskRating: true,
          updatedAt: true,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
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

// ─── Account Toggles (Admin) ────────────────────────────────────────

// GET /api/admin/institution-escrow/accounts/:accountId/toggles
router.get(
  '/api/admin/institution-escrow/accounts/:accountId/toggles',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: Request, res: Response) => {
    try {
      const { accountId } = req.params;

      const account = await prisma.institutionAccount.findUnique({
        where: { id: accountId },
        select: {
          id: true,
          name: true,
          label: true,
          isActive: true,
          isDefault: true,
          approvalMode: true,
          approvalThreshold: true,
          whitelistEnforced: true,
          notifyOnEscrowCreated: true,
          notifyOnEscrowFunded: true,
          notifyOnEscrowReleased: true,
          notifyOnComplianceAlert: true,
          verificationStatus: true,
        },
      });

      if (!account) {
        res.status(404).json({
          error: 'Not Found',
          message: `Account ${accountId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: account,
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

// PATCH /api/admin/institution-escrow/accounts/:accountId/toggles
router.patch(
  '/api/admin/institution-escrow/accounts/:accountId/toggles',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const { accountId } = req.params;

      const account = await prisma.institutionAccount.findUnique({
        where: { id: accountId },
      });

      if (!account) {
        res.status(404).json({
          error: 'Not Found',
          message: `Account ${accountId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const allowedFields: Record<string, boolean> = {
        isActive: true, isDefault: true, approvalMode: true,
        approvalThreshold: true, whitelistEnforced: true,
        notifyOnEscrowCreated: true, notifyOnEscrowFunded: true,
        notifyOnEscrowReleased: true, notifyOnComplianceAlert: true,
        verificationStatus: true, verificationNotes: true,
      };

      const data: Record<string, any> = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (allowedFields[key]) data[key] = value;
      }

      if (Object.keys(data).length === 0) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'No valid fields to update',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const updated = await prisma.institutionAccount.update({
        where: { id: accountId },
        data,
        select: {
          id: true,
          name: true,
          label: true,
          isActive: true,
          isDefault: true,
          approvalMode: true,
          approvalThreshold: true,
          whitelistEnforced: true,
          notifyOnEscrowCreated: true,
          notifyOnEscrowFunded: true,
          notifyOnEscrowReleased: true,
          notifyOnComplianceAlert: true,
          verificationStatus: true,
          updatedAt: true,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
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

// ─── Feature Flags (Admin) ──────────────────────────────────────────

// GET /api/admin/institution-escrow/feature-flags
router.get(
  '/api/admin/institution-escrow/feature-flags',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (_req: Request, res: Response) => {
    try {
      const flags = {
        institutionEscrowEnabled: process.env.INSTITUTION_ESCROW_ENABLED === 'true',
        privacyEnabled: process.env.PRIVACY_ENABLED !== 'false',
        jitoBundlesEnabled: (() => {
          const disable = process.env.DISABLE_JITO_BUNDLES?.toLowerCase();
          if (disable === 'true' || disable === '1') return false;
          const nodeEnv = process.env.NODE_ENV || 'development';
          const network = process.env.SOLANA_NETWORK || 'devnet';
          return nodeEnv === 'production' || network === 'mainnet-beta';
        })(),
        aiAnalysisEnabled: !!process.env.ANTHROPIC_API_KEY,
        cdpSettlementEnabled: !!process.env.CDP_API_KEY_NAME,
      };

      res.status(200).json({
        success: true,
        data: flags,
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

// PATCH /api/admin/institution-escrow/feature-flags
router.patch(
  '/api/admin/institution-escrow/feature-flags',
  standardRateLimiter,
  requireAdminOrApiKey,
  async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const allowedFlags: Record<string, string> = {
        institutionEscrowEnabled: 'INSTITUTION_ESCROW_ENABLED',
        privacyEnabled: 'PRIVACY_ENABLED',
        disableJitoBundles: 'DISABLE_JITO_BUNDLES',
      };

      const updated: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(req.body)) {
        const envVar = allowedFlags[key];
        if (envVar && typeof value === 'boolean') {
          process.env[envVar] = String(value);
          updated[key] = value;
        }
      }

      if (Object.keys(updated).length === 0) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'No valid feature flags to update. Allowed: ' + Object.keys(allowedFlags).join(', '),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const adminId = req.adminUser?.adminId || req.apiKeyFingerprint || 'unknown';
      console.log(`[Admin] Feature flags updated by ${adminId}:`, updated);

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Feature flags updated (runtime only — will reset on restart)',
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
