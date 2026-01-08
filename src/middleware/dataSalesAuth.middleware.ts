/**
 * DataSales Authentication Middleware
 *
 * Protects DataSales settlement endpoints that should only be called by DataSales backend.
 * Uses API key authentication for service-to-service calls.
 *
 * Protected endpoints:
 * - POST /api/datasales/agreements/:id/approve
 * - POST /api/datasales/agreements/:id/reject
 * - POST /api/datasales/agreements/:id/settle
 * - GET /api/datasales/agreements/:id/files (verification read access)
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../services/logger.service';

/**
 * Require DataSales API key for protected endpoints
 *
 * Validates the X-DataSales-API-Key header against DATASALES_API_KEY env var.
 * Uses constant-time comparison to prevent timing attacks.
 */
export const requireDataSalesApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Get API key from header
    const providedKey = req.headers['x-datasales-api-key'] as string;

    // Get expected API key from environment
    const expectedKey = process.env.DATASALES_API_KEY;

    // Check if DataSales integration is enabled
    const isEnabled = process.env.DATASALES_ENABLED !== 'false';
    if (!isEnabled) {
      logger.warn('[DataSales Auth] DataSales integration is disabled');
      res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: 'DataSales integration is not enabled',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!expectedKey) {
      logger.error('[DataSales Auth] DATASALES_API_KEY not configured in environment');
      res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'DataSales API authentication not configured',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!providedKey) {
      logger.warn('[DataSales Auth] Missing API key in request', {
        path: req.path,
        ip: req.ip,
      });
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'DataSales API key required. Use X-DataSales-API-Key header.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Use constant-time comparison to prevent timing attacks
    const providedKeyBuffer = Buffer.from(providedKey);
    const expectedKeyBuffer = Buffer.from(expectedKey);

    if (providedKeyBuffer.length !== expectedKeyBuffer.length) {
      logger.warn('[DataSales Auth] Invalid API key length', {
        path: req.path,
        ip: req.ip,
      });
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Invalid DataSales API key',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const isValid = crypto.timingSafeEqual(providedKeyBuffer, expectedKeyBuffer);

    if (!isValid) {
      logger.warn('[DataSales Auth] Invalid API key provided', {
        path: req.path,
        ip: req.ip,
      });
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Invalid DataSales API key',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // API key is valid, mark request as DataSales authenticated
    (req as any).isDataSalesAuthenticated = true;

    logger.debug('[DataSales Auth] Request authenticated', {
      path: req.path,
    });

    next();
  } catch (error) {
    logger.error('[DataSales Auth] Error validating API key:', { error });
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Authentication error',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Check if DataSales integration is enabled
 * Returns 503 if disabled
 */
export const requireDataSalesEnabled = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isEnabled = process.env.DATASALES_ENABLED !== 'false';

  if (!isEnabled) {
    res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'DataSales integration is not enabled',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
};

/**
 * Generate a secure API key for DataSales
 * Usage: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export function generateDataSalesApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
