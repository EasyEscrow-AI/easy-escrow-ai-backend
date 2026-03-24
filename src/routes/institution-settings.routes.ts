/**
 * Institution Settings Routes
 *
 * GET    /api/v1/institution/settings                  → getSettings
 * PUT    /api/v1/institution/settings                  → updateSettings
 * PATCH  /api/v1/institution/settings                  → updateSettings (partial)
 * PUT    /api/v1/institution/settings/wallets          → updateWallets (legacy flat)
 * PUT    /api/v1/institution/settings/wallets/manage   → addOrUpdateWallet (new model)
 * GET    /api/v1/institution/settings/wallets/list     → listWallets
 * DELETE /api/v1/institution/settings/wallets/:id      → deleteWallet
 * POST   /api/v1/institution/api-keys                  → generateApiKey
 * DELETE /api/v1/institution/api-keys/:id              → revokeApiKey
 * GET    /api/v1/institution/api-keys                  → listApiKeys
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getInstitutionClientSettingsService } from '../services/institution-client-settings.service';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/v1/institution/settings
router.get(
  '/api/v1/institution/settings',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionClientSettingsService();
      const settings = await service.getSettings(req.institutionClient!.clientId);

      res.status(200).json({
        success: true,
        data: settings,
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

async function handleUpdateSettings(req: InstitutionAuthenticatedRequest, res: Response) {
  try {
    const service = getInstitutionClientSettingsService();
    const settings = await service.updateSettings(
      req.institutionClient!.clientId,
      req.body,
    );

    res.status(200).json({
      success: true,
      data: settings,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const isClientError = error.status >= 400 && error.status < 500
      || error.statusCode >= 400 && error.statusCode < 500
      || error.name === 'ValidationError';
    const status = isClientError ? (error.status || error.statusCode || 400) : 500;
    if (status === 500) {
      console.error('[Settings] Unexpected error:', error);
    }
    res.status(status).json({
      error: status < 500 ? 'Update Failed' : 'Internal Error',
      message: status < 500 ? error.message : 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    });
  }
}

// PUT /api/v1/institution/settings
router.put(
  '/api/v1/institution/settings',
  standardRateLimiter,
  requireInstitutionAuth,
  handleUpdateSettings,
);

// PATCH /api/v1/institution/settings — partial update (same logic as PUT)
router.patch(
  '/api/v1/institution/settings',
  standardRateLimiter,
  requireInstitutionAuth,
  handleUpdateSettings,
);

// PUT /api/v1/institution/settings/wallets
router.put(
  '/api/v1/institution/settings/wallets',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionClientSettingsService();
      const result = await service.updateWallets(
        req.institutionClient!.clientId,
        req.body,
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Wallet Update Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// PUT /api/v1/institution/settings/wallets/manage — Add or update a wallet
router.put(
  '/api/v1/institution/settings/wallets/manage',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionClientSettingsService();
      const wallet = await service.addOrUpdateWallet(
        req.institutionClient!.clientId,
        req.body,
      );

      res.status(200).json({
        success: true,
        data: wallet,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Wallet Update Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// GET /api/v1/institution/settings/wallets/list — List all wallets
router.get(
  '/api/v1/institution/settings/wallets/list',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionClientSettingsService();
      const wallets = await service.listWallets(req.institutionClient!.clientId);

      res.status(200).json({
        success: true,
        data: wallets,
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

// DELETE /api/v1/institution/settings/wallets/:id — Delete a wallet
router.delete(
  '/api/v1/institution/settings/wallets/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionClientSettingsService();
      await service.deleteWallet(
        req.institutionClient!.clientId,
        req.params.id,
      );

      res.status(200).json({
        success: true,
        message: 'Wallet deleted',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Wallet Deletion Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// POST /api/v1/institution/api-keys
router.post(
  '/api/v1/institution/api-keys',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const { name, permissions } = req.body;

      if (!name) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'name is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const service = getInstitutionClientSettingsService();
      const apiKey = await service.generateApiKey(
        req.institutionClient!.clientId,
        name,
        permissions || [],
      );

      res.status(201).json({
        success: true,
        data: apiKey,
        message: 'Store the key securely. It will not be shown again.',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'API Key Generation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// DELETE /api/v1/institution/api-keys/:id
router.delete(
  '/api/v1/institution/api-keys/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionClientSettingsService();
      await service.revokeApiKey(
        req.institutionClient!.clientId,
        req.params.id,
      );

      res.status(200).json({
        success: true,
        message: 'API key revoked',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Revocation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// GET /api/v1/institution/api-keys
router.get(
  '/api/v1/institution/api-keys',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionClientSettingsService();
      const keys = await service.listApiKeys(req.institutionClient!.clientId);

      res.status(200).json({
        success: true,
        data: keys,
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

export default router;
