/**
 * Institution Account Routes
 *
 * POST   /api/v1/institution/accounts           -> Create account
 * GET    /api/v1/institution/accounts           -> List accounts (with filters)
 * GET    /api/v1/institution/accounts/:id       -> Get account + balance
 * PUT    /api/v1/institution/accounts/:id       -> Update account
 * DELETE /api/v1/institution/accounts/:id       -> Deactivate account
 * PUT    /api/v1/institution/accounts/:id/default -> Set as default
 * GET    /api/v1/institution/accounts/:id/balance -> Get live balance
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getInstitutionAccountService } from '../services/institution-account.service';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/v1/institution/accounts
router.post(
  '/api/v1/institution/accounts',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      const account = await service.createAccount(req.institutionClient!.clientId, req.body);

      res.status(201).json({
        success: true,
        data: account,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Account Creation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/institution/accounts
router.get(
  '/api/v1/institution/accounts',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();

      const filters: any = {};
      if (req.query.accountType) filters.accountType = req.query.accountType;
      if (req.query.verificationStatus) filters.verificationStatus = req.query.verificationStatus;
      if (req.query.isActive !== undefined) filters.isActive = req.query.isActive === 'true';

      const accounts = await service.listAccounts(req.institutionClient!.clientId, filters);

      res.status(200).json({
        success: true,
        data: accounts,
        count: accounts.length,
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

// GET /api/v1/institution/accounts/:id
router.get(
  '/api/v1/institution/accounts/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      const account = await service.getAccount(req.institutionClient!.clientId, req.params.id);

      res.status(200).json({
        success: true,
        data: account,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message === 'Account not found' ? 404 : 500;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Internal Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// PUT /api/v1/institution/accounts/:id
router.put(
  '/api/v1/institution/accounts/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      const account = await service.updateAccount(
        req.institutionClient!.clientId,
        req.params.id,
        req.body
      );

      res.status(200).json({
        success: true,
        data: account,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message === 'Account not found' ? 404 : 400;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Update Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// DELETE /api/v1/institution/accounts/:id
router.delete(
  '/api/v1/institution/accounts/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      await service.deleteAccount(req.institutionClient!.clientId, req.params.id);

      res.status(200).json({
        success: true,
        message: 'Account deactivated',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message === 'Account not found' ? 404 : 400;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Deactivation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// PUT /api/v1/institution/accounts/:id/default
router.put(
  '/api/v1/institution/accounts/:id/default',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      const account = await service.setDefaultAccount(
        req.institutionClient!.clientId,
        req.params.id
      );

      res.status(200).json({
        success: true,
        data: account,
        message: 'Default account updated',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Update Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/institution/accounts/:id/balance
router.get(
  '/api/v1/institution/accounts/:id/balance',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();

      // Verify account belongs to client
      const account = await service.getAccount(req.institutionClient!.clientId, req.params.id);

      res.status(200).json({
        success: true,
        data: account.balance,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message === 'Account not found' ? 404 : 500;
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Balance Fetch Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
