/**
 * Institution Notification Routes
 *
 * GET    /api/v1/institution-notifications           → listNotifications
 * POST   /api/v1/institution-notifications/read-all  → markAllAsRead
 * POST   /api/v1/institution-notifications/:id/read  → markAsRead
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getInstitutionNotificationService } from '../services/institution-notification.service';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/v1/institution-notifications
router.get(
  '/api/v1/institution-notifications',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionNotificationService();
      const result = await service.listNotifications(req.institutionClient!.clientId, {
        unreadOnly: req.query.unreadOnly === 'true',
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
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

// POST /api/v1/institution-notifications/read-all
router.post(
  '/api/v1/institution-notifications/read-all',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionNotificationService();
      const result = await service.markAllAsRead(req.institutionClient!.clientId);

      res.status(200).json({
        success: true,
        data: result,
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

// POST /api/v1/institution-notifications/:id/read
router.post(
  '/api/v1/institution-notifications/:id/read',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionNotificationService();
      const notification = await service.markAsRead(req.institutionClient!.clientId, req.params.id);

      res.status(200).json({
        success: true,
        data: notification,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.statusCode || (
        error.message?.includes('not found') ? 404
        : error.message?.includes('Access denied') ? 403
        : 400
      );
      res.status(status).json({
        error: 'Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
