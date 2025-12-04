/**
 * Admin Routes for Authorized Apps Management
 * 
 * Endpoints for managing API keys for zero-fee swap authorization.
 * These endpoints should be protected by admin authentication.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { generateApiKey } from '../../middleware/zero-fee-auth.middleware';
import { standardRateLimiter } from '../../middleware';

const router = Router();

/**
 * POST /api/admin/authorized-apps
 * Create a new authorized app and generate API key
 */
router.post(
  '/api/admin/authorized-apps',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        name,
        description,
        zeroFeeEnabled = true,
        rateLimitPerDay = 1000,
      } = req.body;

      // Validate required fields
      if (!name || typeof name !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'App name is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Generate API key
      const { plainKey, hashedKey } = generateApiKey();

      // Create authorized app in database
      const authorizedApp = await prisma.authorizedApp.create({
        data: {
          name,
          description: description || null,
          apiKey: hashedKey,
          zeroFeeEnabled,
          rateLimitPerDay,
        },
      });

      // Return the plain key ONLY ONCE (it won't be retrievable again)
      res.status(201).json({
        success: true,
        data: {
          app: {
            id: authorizedApp.id,
            name: authorizedApp.name,
            description: authorizedApp.description,
            active: authorizedApp.active,
            zeroFeeEnabled: authorizedApp.zeroFeeEnabled,
            rateLimitPerDay: authorizedApp.rateLimitPerDay,
            createdAt: authorizedApp.createdAt.toISOString(),
          },
          // ⚠️ CRITICAL: This API key is shown ONLY ONCE
          apiKey: plainKey,
          warning: 'Store this API key securely. It cannot be retrieved again.',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Error creating authorized app:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to create authorized app',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/admin/authorized-apps
 * List all authorized apps (without API keys)
 */
router.get(
  '/api/admin/authorized-apps',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        active,
        zeroFeeEnabled,
        limit = '50',
        offset = '0',
      } = req.query;

      // Build where clause
      const where: any = {};
      if (active !== undefined) {
        where.active = active === 'true';
      }
      if (zeroFeeEnabled !== undefined) {
        where.zeroFeeEnabled = zeroFeeEnabled === 'true';
      }

      const [apps, total] = await Promise.all([
        prisma.authorizedApp.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            active: true,
            zeroFeeEnabled: true,
            rateLimitPerDay: true,
            totalSwaps: true,
            lastUsedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit as string, 10),
          skip: parseInt(offset as string, 10),
        }),
        prisma.authorizedApp.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          apps: apps.map((app) => ({
            ...app,
            lastUsedAt: app.lastUsedAt?.toISOString() || null,
            createdAt: app.createdAt.toISOString(),
            updatedAt: app.updatedAt.toISOString(),
          })),
          total,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Error listing authorized apps:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to list authorized apps',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/admin/authorized-apps/:id
 * Get detailed information about a specific authorized app
 */
router.get(
  '/api/admin/authorized-apps/:id',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const app = await prisma.authorizedApp.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          description: true,
          active: true,
          zeroFeeEnabled: true,
          rateLimitPerDay: true,
          totalSwaps: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
          zeroFeeSwapLogs: {
            select: {
              id: true,
              swapSignature: true,
              makerWallet: true,
              takerWallet: true,
              totalValueLamports: true,
              executedAt: true,
            },
            orderBy: { executedAt: 'desc' },
            take: 10, // Last 10 swaps
          },
        },
      });

      if (!app) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Authorized app ${id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          ...app,
          lastUsedAt: app.lastUsedAt?.toISOString() || null,
          createdAt: app.createdAt.toISOString(),
          updatedAt: app.updatedAt.toISOString(),
          zeroFeeSwapLogs: app.zeroFeeSwapLogs.map((log) => ({
            ...log,
            totalValueLamports: log.totalValueLamports.toString(),
            executedAt: log.executedAt.toISOString(),
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Error getting authorized app:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to get authorized app',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * PATCH /api/admin/authorized-apps/:id
 * Update authorized app settings
 */
router.patch(
  '/api/admin/authorized-apps/:id',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        active,
        zeroFeeEnabled,
        rateLimitPerDay,
      } = req.body;

      // Build update data
      const data: any = {};
      if (name !== undefined) data.name = name;
      if (description !== undefined) data.description = description;
      if (active !== undefined) data.active = active;
      if (zeroFeeEnabled !== undefined) data.zeroFeeEnabled = zeroFeeEnabled;
      if (rateLimitPerDay !== undefined) data.rateLimitPerDay = rateLimitPerDay;

      if (Object.keys(data).length === 0) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'No fields to update',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const app = await prisma.authorizedApp.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          description: true,
          active: true,
          zeroFeeEnabled: true,
          rateLimitPerDay: true,
          totalSwaps: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          ...app,
          lastUsedAt: app.lastUsedAt?.toISOString() || null,
          createdAt: app.createdAt.toISOString(),
          updatedAt: app.updatedAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Error updating authorized app:', error);

      if (error instanceof Error && error.message.includes('Record to update not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Authorized app ${req.params.id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to update authorized app',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/admin/authorized-apps/:id/regenerate-key
 * Regenerate API key for an existing app
 */
router.post(
  '/api/admin/authorized-apps/:id/regenerate-key',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Generate new API key
      const { plainKey, hashedKey } = generateApiKey();

      // Update app with new key
      const app = await prisma.authorizedApp.update({
        where: { id },
        data: { apiKey: hashedKey },
        select: {
          id: true,
          name: true,
          description: true,
          active: true,
          zeroFeeEnabled: true,
          rateLimitPerDay: true,
          updatedAt: true,
        },
      });

      // Return the new plain key ONLY ONCE
      res.status(200).json({
        success: true,
        data: {
          app: {
            ...app,
            updatedAt: app.updatedAt.toISOString(),
          },
          // ⚠️ CRITICAL: This new API key is shown ONLY ONCE
          apiKey: plainKey,
          warning: 'Store this new API key securely. The old key is now invalid.',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Error regenerating API key:', error);

      if (error instanceof Error && error.message.includes('Record to update not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Authorized app ${req.params.id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to regenerate API key',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /api/admin/authorized-apps/:id
 * Delete an authorized app (and all its swap logs)
 */
router.delete(
  '/api/admin/authorized-apps/:id',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      await prisma.authorizedApp.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        data: {
          message: `Authorized app ${id} deleted successfully`,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Error deleting authorized app:', error);

      if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Authorized app ${req.params.id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to delete authorized app',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/admin/authorized-apps/:id/logs
 * Get zero-fee swap logs for a specific app
 */
router.get(
  '/api/admin/authorized-apps/:id/logs',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        limit = '50',
        offset = '0',
        startDate,
        endDate,
      } = req.query;

      // Build where clause
      const where: any = { authorizedAppId: id };
      if (startDate || endDate) {
        where.executedAt = {};
        if (startDate) where.executedAt.gte = new Date(startDate as string);
        if (endDate) where.executedAt.lte = new Date(endDate as string);
      }

      const [logs, total] = await Promise.all([
        prisma.zeroFeeSwapLog.findMany({
          where,
          orderBy: { executedAt: 'desc' },
          take: parseInt(limit as string, 10),
          skip: parseInt(offset as string, 10),
        }),
        prisma.zeroFeeSwapLog.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          logs: logs.map((log) => ({
            ...log,
            totalValueLamports: log.totalValueLamports.toString(),
            executedAt: log.executedAt.toISOString(),
          })),
          total,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Error getting swap logs:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to get swap logs',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;

