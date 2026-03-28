import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionOrAdminAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { prisma } from '../config/database';

const router = Router();
const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const EXCHANGE_RATES: Record<string, { rate: number; source: string }> = {
  'USDC/USD': { rate: 1.0, source: 'peg' },
  'USDT/USD': { rate: 1.0, source: 'peg' },
  'EURC/EUR': { rate: 1.0, source: 'peg' },
  'USD/CHF': { rate: 0.88, source: 'indicative' },
  'USD/SGD': { rate: 1.34, source: 'indicative' },
  'USD/GBP': { rate: 0.79, source: 'indicative' },
  'USD/AED': { rate: 3.67, source: 'indicative' },
  'USD/EUR': { rate: 0.92, source: 'indicative' },
};

const SANCTIONED_REGIONS = ['RU', 'BY', 'KP', 'IR', 'SY', 'CU'];

router.get(
  '/api/v1/institution/exchange-rates',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
  async (_req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const now = new Date().toISOString();
      const data = Object.fromEntries(
        Object.entries(EXCHANGE_RATES).map(([pair, info]) => [pair, { ...info, updatedAt: now }])
      );
      res
        .status(200)
        .json({
          success: true,
          data,
          disclaimer: 'Indicative rates only. Actual settlement uses on-chain USDC at 1:1.',
          timestamp: now,
        });
    } catch (error: any) {
      res
        .status(500)
        .json({
          error: 'Internal Error',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
    }
  }
);

router.get(
  '/api/v1/institution/sanctioned-regions',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
  async (_req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      res
        .status(200)
        .json({
          success: true,
          data: SANCTIONED_REGIONS,
          source: 'OFAC, EU, UN consolidated',
          timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
      res
        .status(500)
        .json({
          error: 'Internal Error',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
    }
  }
);

router.get(
  '/api/v1/institution/corridors',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
  async (_req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const corridors = await prisma.institutionCorridor.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          code: true,
          name: true,
          sourceCountry: true,
          destCountry: true,
          compliance: true,
          description: true,
          riskLevel: true,
          riskReason: true,
          travelRuleThreshold: true,
          eddThreshold: true,
          reportingThreshold: true,
          minAmount: true,
          maxAmount: true,
          requiredDocuments: true,
          status: true,
        },
        orderBy: { code: 'asc' },
      });
      const formatted = corridors.map((c: any) => ({
        ...c,
        minAmount: Number(c.minAmount),
        maxAmount: Number(c.maxAmount),
        travelRuleThreshold: Number(c.travelRuleThreshold),
        eddThreshold: Number(c.eddThreshold),
        reportingThreshold: Number(c.reportingThreshold),
      }));
      res
        .status(200)
        .json({
          success: true,
          data: formatted,
          count: formatted.length,
          timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
      res
        .status(500)
        .json({
          error: 'Internal Error',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
    }
  }
);

export default router;
