/**
 * Institution Bootstrap Routes
 *
 * GET /api/v1/institution/bootstrap → Returns all app data needed after login
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getInstitutionBootstrapService } from '../services/institution-bootstrap.service';

const router = Router();

const bootstrapRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/v1/institution/bootstrap
router.get(
  '/api/v1/institution/bootstrap',
  bootstrapRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionBootstrapService();
      const data = await service.getBootstrapData(req.institutionClient!.clientId);

      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = /client not found/i.test(error.message) ? 404 : 500;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Internal Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
