/**
 * Institution Search Routes
 *
 * GET /api/v1/institution/search?q=...&categories=...&limit=...  → sitewide search
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { query, validationResult } from 'express-validator';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getInstitutionSearchService } from '../services/institution-search.service';

const router = Router();

const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate limit exceeded', message: 'Too many search requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const VALID_CATEGORIES = ['escrow', 'client', 'account', 'notification'];

const validateSearch = [
  query('q')
    .isString()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Search query must be 2–200 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('limit must be between 1 and 10'),
  query('categories')
    .optional()
    .isString()
    .withMessage('categories must be a comma-separated string'),
];

// GET /api/v1/institution/search
router.get(
  '/api/v1/institution/search',
  searchRateLimiter,
  requireInstitutionAuth,
  validateSearch,
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
      const q = (req.query.q as string).trim();
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      let categories: string[] | undefined;
      if (req.query.categories && typeof req.query.categories === 'string') {
        categories = req.query.categories
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter((c) => VALID_CATEGORIES.includes(c));
        if (categories.length === 0) categories = undefined;
      }

      const service = getInstitutionSearchService();
      const result = await service.search({
        clientId: req.institutionClient!.clientId,
        query: q,
        limit,
        categories,
      });

      res.status(200).json({
        success: true,
        data: result,
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

export default router;
