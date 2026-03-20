/**
 * Institution Clients Routes
 *
 * GET    /api/v1/institution/clients/:id/profile  → getPublicProfile
 * GET    /api/v1/institution/clients/search       → searchClients
 * GET    /api/v1/institution/clients              → listClients
 * PUT    /api/v1/institution/clients/:id/archive  → archiveClient (self-only)
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { prisma } from '../config/database';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public profile fields (non-sensitive)
const PUBLIC_PROFILE_SELECT = {
  id: true,
  companyName: true,
  legalName: true,
  industry: true,
  jurisdiction: true,
  entityType: true,
  websiteUrl: true,
  tier: true,
  isRegulatedEntity: true,
  country: true,
  city: true,
  status: true,
  isArchived: true,
  createdAt: true,
} as const;

// Shared visibility filter: active, non-archived clients
function getVisibilityFilter(includeArchived = false) {
  const where: any = { status: 'ACTIVE' };
  if (!includeArchived) {
    where.isArchived = false;
  }
  return where;
}

// GET /api/v1/institution/clients/search?q=...&industry=...&country=...
router.get(
  '/api/v1/institution/clients/search',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const { q, industry, country } = req.query;

      const where: any = getVisibilityFilter();

      if (q && typeof q === 'string') {
        where.OR = [
          { companyName: { contains: q, mode: 'insensitive' } },
          { legalName: { contains: q, mode: 'insensitive' } },
          { tradingName: { contains: q, mode: 'insensitive' } },
        ];
      }

      if (industry && typeof industry === 'string') {
        where.industry = { equals: industry, mode: 'insensitive' };
      }

      if (country && typeof country === 'string') {
        where.country = { equals: country, mode: 'insensitive' };
      }

      const clients = await prisma.institutionClient.findMany({
        where,
        select: PUBLIC_PROFILE_SELECT,
        orderBy: { companyName: 'asc' },
        take: 50,
      });

      res.status(200).json({
        success: true,
        data: clients,
        count: clients.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Search Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// GET /api/v1/institution/clients — List clients (paginated)
router.get(
  '/api/v1/institution/clients',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const skip = (page - 1) * limit;
      const includeArchived = req.query.includeArchived === 'true';

      const where = getVisibilityFilter(includeArchived);

      const [clients, total] = await Promise.all([
        prisma.institutionClient.findMany({
          where,
          select: PUBLIC_PROFILE_SELECT,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.institutionClient.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: clients,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'List Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Country name → ISO code mapping (common countries)
const COUNTRY_CODE_MAP: Record<string, string> = {
  'switzerland': 'CH', 'singapore': 'SG', 'united states': 'US',
  'united kingdom': 'GB', 'united arab emirates': 'AE', 'hong kong': 'HK',
  'germany': 'DE', 'france': 'FR', 'japan': 'JP', 'australia': 'AU',
  'canada': 'CA', 'brazil': 'BR', 'india': 'IN', 'china': 'CN',
  'south korea': 'KR', 'mexico': 'MX', 'philippines': 'PH',
  'british virgin islands': 'VG', 'cayman islands': 'KY',
};

// GET /api/v1/institution/clients/:id/profile — Enriched public profile
router.get(
  '/api/v1/institution/clients/:id/profile',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const client = await prisma.institutionClient.findFirst({
        where: { id: req.params.id, ...getVisibilityFilter() },
        select: {
          ...PUBLIC_PROFILE_SELECT,
          registrationNumber: true,
          riskRating: true,
        },
      });

      if (!client) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Client not found',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const [escrowStats, directPaymentCount, latestAnalysis, latestActivity, activeEscrows, completedEscrows] = await Promise.all([
        prisma.institutionEscrow.aggregate({
          where: { clientId: req.params.id },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.directPayment.count({
          where: { clientId: req.params.id, status: 'completed' },
        }),
        prisma.institutionAiAnalysis.findFirst({
          where: { clientId: req.params.id },
          orderBy: { createdAt: 'desc' },
          select: { riskScore: true },
        }),
        prisma.institutionEscrow.findFirst({
          where: { clientId: req.params.id },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        prisma.institutionEscrow.count({
          where: {
            clientId: req.params.id,
            status: { in: ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'RELEASING'] },
          },
        }),
        prisma.institutionEscrow.count({
          where: {
            clientId: req.params.id,
            status: { in: ['COMPLETE', 'RELEASED'] },
          },
        }),
      ]);

      const countryCode = client.country
        ? COUNTRY_CODE_MAP[client.country.toLowerCase()] || client.country
        : null;

      res.status(200).json({
        success: true,
        data: {
          ...client,
          countryCode,
          totalVolume: Number(escrowStats._sum.amount || 0),
          activeEscrows,
          completedPayments: completedEscrows + directPaymentCount,
          riskScore: latestAnalysis?.riskScore ?? null,
          lastActivity: latestActivity?.updatedAt ?? client.createdAt,
        },
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

// PUT /api/v1/institution/clients/:id/archive — Archive/unarchive (self-only)
router.put(
  '/api/v1/institution/clients/:id/archive',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const { archive } = req.body;

      if (typeof archive !== 'boolean') {
        res.status(400).json({
          error: 'Validation Error',
          message: 'archive (boolean) is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Self-only: clients can only archive/unarchive themselves
      if (req.institutionClient!.clientId !== req.params.id) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only archive/unarchive your own account',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const client = await prisma.institutionClient.findUnique({
        where: { id: req.params.id },
      });

      if (!client) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Client not found',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const updated = await prisma.institutionClient.update({
        where: { id: req.params.id },
        data: { isArchived: archive },
        select: { id: true, companyName: true, isArchived: true },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: archive ? 'Client archived' : 'Client unarchived',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Archive Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
