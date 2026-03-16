/**
 * Institution Escrow Admin Routes
 *
 * POST   /api/admin/institution-escrow/allowlist          → addToAllowlist
 * DELETE /api/admin/institution-escrow/allowlist/:wallet   → removeFromAllowlist
 * GET    /api/admin/institution-escrow/allowlist           → listAllowlist
 * POST   /api/admin/institution-escrow/corridors           → configureCorridor
 * GET    /api/admin/institution-escrow/corridors            → listCorridors
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { validationResult } from 'express-validator';
import { authenticateAdmin } from '../../middleware/auth.middleware';
import { getAllowlistService } from '../../services/allowlist.service';
import {
  validateAddToAllowlist,
  validateConfigureCorridor,
} from '../../middleware/institution-escrow-validation.middleware';
import { PrismaClient } from '../../generated/prisma';

const router = Router();
const prisma = new PrismaClient();

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
  authenticateAdmin,
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
  },
);

// DELETE /api/admin/institution-escrow/allowlist/:wallet
router.delete(
  '/api/admin/institution-escrow/allowlist/:wallet',
  standardRateLimiter,
  authenticateAdmin,
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
  },
);

// GET /api/admin/institution-escrow/allowlist
router.get(
  '/api/admin/institution-escrow/allowlist',
  standardRateLimiter,
  authenticateAdmin,
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
  },
);

// POST /api/admin/institution-escrow/corridors
router.post(
  '/api/admin/institution-escrow/corridors',
  standardRateLimiter,
  authenticateAdmin,
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
  },
);

// GET /api/admin/institution-escrow/corridors
router.get(
  '/api/admin/institution-escrow/corridors',
  standardRateLimiter,
  authenticateAdmin,
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
  },
);

export default router;
