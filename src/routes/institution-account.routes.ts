/**
 * Institution Account Routes
 *
 * GET    /api/v1/institution/account/profile              -> Client profile overview
 * POST   /api/v1/institution/accounts                     -> Create account
 * GET    /api/v1/institution/accounts                     -> List accounts (?branchId=&includeBalances=true)
 * GET    /api/v1/institution/accounts/:id                 -> Get account + balance
 * GET    /api/v1/institution/accounts/:id/transactions   -> Transaction history
 * PUT    /api/v1/institution/accounts/:id                 -> Update account
 * DELETE /api/v1/institution/accounts/:id                 -> Deactivate account
 * PUT    /api/v1/institution/accounts/:id/default         -> Set as default
 * GET    /api/v1/institution/accounts/:id/balance         -> Get cached balance
 * POST   /api/v1/institution/accounts/:id/refresh-balance -> Bust cache, re-fetch live
 * GET    /api/v1/institution/accounts/:id/settings        -> Get account settings
 * PATCH  /api/v1/institution/accounts/:id/settings        -> Update account settings
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getInstitutionAccountService } from '../services/institution-account.service';
import { logger } from '../services/logger.service';

const router = Router();

const VALID_ACCOUNT_TYPES = ['TREASURY', 'OPERATIONS', 'SETTLEMENT', 'COLLATERAL', 'GENERAL'];
const VALID_VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'SUSPENDED', 'REJECTED'];

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/v1/institution/account/profile — Client profile with settings + accounts overview
router.get(
  '/api/v1/institution/account/profile',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      const profile = await service.getClientProfile(req.institutionClient!.clientId);

      res.status(200).json({
        success: true,
        data: profile,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'Client not found' ? 404 : 500;
      logger.error('Profile fetch failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Internal Error',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Account creation failed', { error: message });
      res.status(400).json({
        error: 'Account Creation Failed',
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
      if (req.query.accountType) {
        if (!VALID_ACCOUNT_TYPES.includes(req.query.accountType as string)) {
          return res
            .status(400)
            .json({ error: 'Invalid accountType', timestamp: new Date().toISOString() });
        }
        filters.accountType = req.query.accountType;
      }
      if (req.query.verificationStatus) {
        if (!VALID_VERIFICATION_STATUSES.includes(req.query.verificationStatus as string)) {
          return res
            .status(400)
            .json({ error: 'Invalid verificationStatus', timestamp: new Date().toISOString() });
        }
        filters.verificationStatus = req.query.verificationStatus;
      }
      if (req.query.isActive !== undefined) filters.isActive = req.query.isActive === 'true';
      if (req.query.branchId) {
        const branchId = req.query.branchId as string;
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_RE.test(branchId)) {
          return res
            .status(400)
            .json({ error: 'Invalid branchId — must be a UUID', timestamp: new Date().toISOString() });
        }
        filters.branchId = branchId;
      }
      if (req.query.includeBalances !== undefined) {
        const val = req.query.includeBalances as string;
        if (val !== 'true' && val !== 'false') {
          return res
            .status(400)
            .json({ error: 'Invalid includeBalances — must be true or false', timestamp: new Date().toISOString() });
        }
        filters.includeBalances = val === 'true';
      }

      const accounts = await service.listAccounts(req.institutionClient!.clientId, filters);

      res.status(200).json({
        success: true,
        data: accounts,
        count: accounts.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Account list failed', { error: message });
      res.status(500).json({
        error: 'Internal Error',
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'Account not found' ? 404 : 500;
      logger.error('Account fetch failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Internal Error',
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'Account not found' ? 404 : 400;
      logger.error('Account update failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Update Failed',
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'Account not found' ? 404 : 400;
      logger.error('Account deactivation failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Deactivation Failed',
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (message ?? '').toLowerCase().includes('not found') ? 404 : 400;
      logger.error('Set default account failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Update Failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/institution/accounts/:id/transactions — Transaction history for this account
router.get(
  '/api/v1/institution/accounts/:id/transactions',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const transactions = await service.getAccountTransactions(
        req.institutionClient!.clientId,
        req.params.id,
        limit,
        offset
      );

      res.status(200).json({
        success: true,
        data: transactions,
        total: transactions.length,
        limit,
        offset,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'Account not found' ? 404 : 500;
      logger.error('Account transactions fetch failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Internal Error',
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'Account not found' ? 404 : 500;
      logger.error('Balance fetch failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Balance Fetch Failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/v1/institution/accounts/:id/refresh-balance — Bust cache and re-fetch live
router.post(
  '/api/v1/institution/accounts/:id/refresh-balance',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      const account = await service.refreshAccountBalance(
        req.institutionClient!.clientId,
        req.params.id
      );

      res.status(200).json({
        success: true,
        data: account,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'Account not found' ? 404 : 500;
      logger.error('Balance refresh failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Balance Refresh Failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/v1/institution/accounts/:id/settings — Get account settings (toggles + currency)
router.get(
  '/api/v1/institution/accounts/:id/settings',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      const settings = await service.getAccountSettings(
        req.institutionClient!.clientId,
        req.params.id
      );

      res.status(200).json({
        success: true,
        data: settings,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'Account not found' ? 404 : 500;
      logger.error('Account settings fetch failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Internal Error',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// PATCH /api/v1/institution/accounts/:id/settings — Update account settings
router.patch(
  '/api/v1/institution/accounts/:id/settings',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionAccountService();
      const updated = await service.updateAccountSettings(
        req.institutionClient!.clientId,
        req.params.id,
        req.body
      );

      res.status(200).json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === 'Account not found' ? 404 : 400;
      logger.error('Account settings update failed', { error: message });
      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Update Failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
