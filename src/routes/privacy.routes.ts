/**
 * Privacy Routes
 *
 * API endpoints for stealth address management and stealth payment operations.
 * All endpoints require institution JWT authentication.
 */

import { Router, Response, NextFunction } from 'express';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getStealthAddressService } from '../services/privacy/stealth-address.service';
import { isPrivacyEnabled } from '../utils/featureFlags';
import rateLimit from 'express-rate-limit';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests', message: 'Rate limit exceeded' },
});

const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests', message: 'Rate limit exceeded' },
});

/**
 * Middleware to check if privacy feature is enabled
 */
function requirePrivacyEnabled(
  _req: InstitutionAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!isPrivacyEnabled()) {
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Privacy features are not enabled',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  next();
}

// POST /api/v1/privacy/meta-address — Generate & register stealth meta-address
router.post(
  '/api/v1/privacy/meta-address',
  standardRateLimiter,
  requireInstitutionAuth,
  requirePrivacyEnabled,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      // Validate label if provided
      if (req.body.label !== undefined) {
        if (typeof req.body.label !== 'string' || req.body.label.trim().length === 0) {
          res.status(400).json({
            error: 'Validation Error',
            message: 'label must be a non-empty string',
            timestamp: new Date().toISOString(),
          });
          return;
        }
        if (req.body.label.length > 100) {
          res.status(400).json({
            error: 'Validation Error',
            message: 'label must be at most 100 characters',
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      const service = getStealthAddressService();
      const result = await service.registerMetaAddress(
        req.institutionClient!.clientId,
        req.body.label?.trim()
      );

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Meta-Address Registration Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/privacy/meta-address/:clientId — Get meta-addresses for a client
router.get(
  '/api/v1/privacy/meta-address/:clientId',
  standardRateLimiter,
  requireInstitutionAuth,
  requirePrivacyEnabled,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      // Clients can only view their own meta-addresses
      if (req.params.clientId !== req.institutionClient!.clientId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot access meta-addresses of another client',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const service = getStealthAddressService();
      const metaAddresses = await service.getMetaAddresses(req.params.clientId);

      res.status(200).json({
        success: true,
        data: metaAddresses,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Failed to get meta-addresses',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// DELETE /api/v1/privacy/meta-address/:id — Deactivate a meta-address
router.delete(
  '/api/v1/privacy/meta-address/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  requirePrivacyEnabled,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getStealthAddressService();
      await service.deactivateMetaAddress(req.institutionClient!.clientId, req.params.id);

      res.status(200).json({
        success: true,
        message: 'Meta-address deactivated',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: 'Deactivation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/v1/privacy/scan — Scan for incoming stealth payments
router.post(
  '/api/v1/privacy/scan',
  standardRateLimiter,
  requireInstitutionAuth,
  requirePrivacyEnabled,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getStealthAddressService();
      const payments = await service.scanPayments(req.institutionClient!.clientId, req.body.status);

      res.status(200).json({
        success: true,
        data: payments,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Scan Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/v1/privacy/sweep/:paymentId — Sweep stealth address to destination wallet
router.post(
  '/api/v1/privacy/sweep/:paymentId',
  strictRateLimiter,
  requireInstitutionAuth,
  requirePrivacyEnabled,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      if (!req.body.destinationWallet) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'destinationWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const service = getStealthAddressService();
      const result = await service.sweepPayment(
        req.institutionClient!.clientId,
        req.params.paymentId,
        req.body.destinationWallet
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Sweep Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/privacy/payments — List stealth payments
router.get(
  '/api/v1/privacy/payments',
  standardRateLimiter,
  requireInstitutionAuth,
  requirePrivacyEnabled,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getStealthAddressService();
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const result = await service.listPayments(req.institutionClient!.clientId, {
        limit,
        offset,
        status: req.query.status as any,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Failed to list payments',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/privacy/payments/:id — Get payment details
router.get(
  '/api/v1/privacy/payments/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  requirePrivacyEnabled,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getStealthAddressService();
      const payment = await service.getPayment(req.institutionClient!.clientId, req.params.id);

      res.status(200).json({
        success: true,
        data: payment,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: 'Payment Not Found',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
