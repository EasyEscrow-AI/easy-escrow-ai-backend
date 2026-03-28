/**
 * Institution Branch Routes
 *
 * GET /api/v1/institution/branches -> List branches with optional filters
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionOrAdminAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { prisma } from '../config/database';
import { logger } from '../services/logger.service';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

function riskScoreToLevel(score: number): 'low' | 'medium' | 'high' {
  if (score <= 20) return 'low';
  if (score <= 50) return 'medium';
  return 'high';
}

router.get(
  '/api/v1/institution/branches',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const { riskLevel, isHeadquarters, isActive } = req.query;

      const where: any = { clientId: req.institutionClient!.clientId };

      // Filter by risk level → map to riskScore range
      if (typeof riskLevel === 'string') {
        const level = riskLevel.toLowerCase();
        if (level === 'low') where.riskScore = { lte: 20 };
        else if (level === 'medium') where.riskScore = { gt: 20, lte: 50 };
        else if (level === 'high') where.riskScore = { gt: 50 };
        else if (level === 'blocked') where.complianceStatus = 'BLOCKED';
      }

      if (typeof isHeadquarters === 'string') {
        where.isHeadquarters = isHeadquarters === 'true';
      }

      if (typeof isActive === 'string') {
        where.isActive = isActive === 'true';
      }

      const branches = await prisma.institutionBranch.findMany({
        where,
        include: {
          accounts: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              label: true,
              accountType: true,
              walletAddress: true,
              chain: true,
              verificationStatus: true,
              isDefault: true,
            },
          },
        },
        orderBy: [{ isHeadquarters: 'desc' }, { createdAt: 'asc' }],
      });

      const data = branches.map((branch) => ({
        id: branch.id,
        clientId: branch.clientId,
        name: branch.name,
        label: branch.label ?? branch.name,
        city: branch.city,
        country: branch.country,
        countryCode: branch.countryCode,
        address: branch.address,
        timezone: branch.timezone,
        riskLevel: riskScoreToLevel(branch.riskScore),
        complianceStatus: branch.complianceStatus,
        complianceNote: branch.complianceNote,
        isSanctioned: branch.isSanctioned,
        sanctionReason: branch.sanctionReason,
        regulatoryBody: branch.regulatoryBody,
        isHeadquarters: branch.isHeadquarters,
        isActive: branch.isActive,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
        accounts: branch.accounts,
      }));

      res.status(200).json({
        success: true,
        data,
        count: data.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Branch list failed', { error: message });
      res.status(500).json({
        error: 'Internal Error',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
