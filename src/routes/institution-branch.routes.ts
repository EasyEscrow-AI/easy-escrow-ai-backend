/**
 * Institution Branch Routes
 *
 * GET /api/v1/institution/branches -> List branches with accounts
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
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
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const branches = await prisma.institutionBranch.findMany({
        where: { clientId: req.institutionClient!.clientId },
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
        orderBy: { createdAt: 'asc' },
      });

      const data = branches.map((branch, index) => ({
        ...branch,
        riskLevel: riskScoreToLevel(branch.riskScore),
        isHeadquarters: index === 0,
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
