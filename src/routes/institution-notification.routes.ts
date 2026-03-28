/**
 * Institution Notification Routes
 *
 * GET    /api/v1/institution-notifications           → listNotifications
 * POST   /api/v1/institution-notifications/read-all  → markAllAsRead
 * POST   /api/v1/institution-notifications/:id/read  → markAsRead
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { param, query, validationResult } from 'express-validator';
import {
  requireInstitutionOrAdminAuth,
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

const validateListNotifications = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('offset must be non-negative'),
  query('unreadOnly')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('unreadOnly must be true or false'),
];

const validateNotificationId = [
  param('id').isUUID().withMessage('Notification ID must be a valid UUID'),
];

function handleValidation(req: any, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'Validation Error',
      details: errors.array(),
      timestamp: new Date().toISOString(),
    });
    return true;
  }
  return false;
}

// GET /api/v1/institution-notifications
router.get(
  '/api/v1/institution-notifications',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
  validateListNotifications,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

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
  requireInstitutionOrAdminAuth,
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
  requireInstitutionOrAdminAuth,
  validateNotificationId,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    if (handleValidation(req, res)) return;

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
        : 500
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
