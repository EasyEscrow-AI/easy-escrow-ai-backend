import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { prisma } from '../config/database';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true, legacyHeaders: false,
});

router.get('/api/v1/institution/branches', standardRateLimiter, requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const branches = await prisma.institutionBranch.findMany({
        where: { clientId: req.institutionClient!.clientId },
        include: {
          accounts: {
            where: { isActive: true },
            select: {
              id: true, name: true, label: true, accountType: true,
              walletAddress: true, chain: true, verificationStatus: true, isDefault: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      res.status(200).json({ success: true, data: branches, count: branches.length, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

export default router;
