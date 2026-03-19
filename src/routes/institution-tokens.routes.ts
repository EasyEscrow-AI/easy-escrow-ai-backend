/**
 * Institution Approved Token Routes
 *
 * GET /api/v1/institution/tokens  → List AMINA-approved tokens (public)
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getTokenWhitelistService } from '../services/institution-token-whitelist.service';

const router = Router();

const tokensRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /api/v1/institution/tokens
 * Public endpoint — lists all active AMINA-approved tokens for the portal dropdown
 */
router.get(
  '/api/v1/institution/tokens',
  tokensRateLimiter,
  async (_req: Request, res: Response) => {
    try {
      const service = getTokenWhitelistService();
      const tokens = await service.listApprovedTokens();

      res.json({
        success: true,
        data: tokens.map((t) => ({
          symbol: t.symbol,
          name: t.name,
          mintAddress: t.mintAddress,
          decimals: t.decimals,
          issuer: t.issuer,
          jurisdiction: t.jurisdiction,
          chain: t.chain,
          isDefault: t.isDefault,
          aminaApproved: t.aminaApproved,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('Token list error:', err);
      res.status(500).json({
        error: 'Failed to fetch approved tokens',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
