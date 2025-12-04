import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * Extended Request interface with zero-fee authorization data
 */
export interface ZeroFeeAuthorizedRequest extends Request {
  authorizedApp?: {
    id: string;
    name: string;
    zeroFeeEnabled: boolean;
    rateLimitPerDay: number;
    totalSwaps: number;
  };
  isZeroFeeAuthorized: boolean;
}

/**
 * Middleware to validate API key for zero-fee swap authorization
 * 
 * Checks the X-Atomic-Swap-API-Key header and validates it against the database.
 * If valid and zero-fee is enabled, sets req.isZeroFeeAuthorized = true.
 * 
 * This middleware is NON-BLOCKING - it doesn't reject requests with invalid keys,
 * it simply sets the authorization flag. The atomic swap service will use this
 * flag to determine whether to sign with the backend's authorized key.
 */
export const validateZeroFeeApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const request = req as ZeroFeeAuthorizedRequest;
  
  // Initialize as not authorized
  request.isZeroFeeAuthorized = false;
  request.authorizedApp = undefined;

  try {
    // Get API key from header
    const apiKey = req.headers['x-atomic-swap-api-key'] as string;

    if (!apiKey) {
      // No API key provided - continue without authorization
      return next();
    }

    // Hash the API key (stored as SHA256 hash in database)
    const hashedKey = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');

    // Look up the API key in database
    const authorizedApp = await prisma.authorizedApp.findUnique({
      where: { apiKey: hashedKey },
      select: {
        id: true,
        name: true,
        active: true,
        zeroFeeEnabled: true,
        rateLimitPerDay: true,
        totalSwaps: true,
        lastUsedAt: true,
      },
    });

    if (!authorizedApp) {
      // Invalid API key - log and continue without authorization
      logger.warn({
        message: 'Invalid zero-fee API key attempt',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return next();
    }

    if (!authorizedApp.active) {
      // App is disabled - log and continue without authorization
      logger.warn({
        message: 'Disabled app attempted zero-fee swap',
        appId: authorizedApp.id,
        appName: authorizedApp.name,
        ip: req.ip,
      });
      return next();
    }

    if (!authorizedApp.zeroFeeEnabled) {
      // Zero-fee not enabled for this app - continue without authorization
      logger.info({
        message: 'App has valid key but zero-fee not enabled',
        appId: authorizedApp.id,
        appName: authorizedApp.name,
      });
      return next();
    }

    // Check rate limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const swapsToday = await prisma.zeroFeeSwapLog.count({
      where: {
        authorizedAppId: authorizedApp.id,
        executedAt: {
          gte: today,
        },
      },
    });

    if (swapsToday >= authorizedApp.rateLimitPerDay) {
      // Rate limit exceeded - log and continue without authorization
      logger.warn({
        message: 'Zero-fee rate limit exceeded',
        appId: authorizedApp.id,
        appName: authorizedApp.name,
        swapsToday,
        limit: authorizedApp.rateLimitPerDay,
      });
      return next();
    }

    // All checks passed - authorize zero-fee swap
    request.isZeroFeeAuthorized = true;
    request.authorizedApp = {
      id: authorizedApp.id,
      name: authorizedApp.name,
      zeroFeeEnabled: authorizedApp.zeroFeeEnabled,
      rateLimitPerDay: authorizedApp.rateLimitPerDay,
      totalSwaps: authorizedApp.totalSwaps,
    };

    // Update last used timestamp (non-blocking)
    prisma.authorizedApp.update({
      where: { id: authorizedApp.id },
      data: { lastUsedAt: new Date() },
    }).catch(error => {
      logger.error({
        message: 'Failed to update lastUsedAt for authorized app',
        appId: authorizedApp.id,
        error: error.message,
      });
    });

    logger.info({
      message: 'Zero-fee authorization granted',
      appId: authorizedApp.id,
      appName: authorizedApp.name,
      swapsToday,
      limit: authorizedApp.rateLimitPerDay,
    });

    next();
  } catch (error) {
    // On error, log and continue without authorization (fail-safe)
    logger.error({
      message: 'Error in zero-fee API key validation',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    next();
  }
};

/**
 * Helper function to generate a new API key
 * Returns both the plain key (to give to the partner) and the hashed key (to store in DB)
 */
export function generateApiKey(): { plainKey: string; hashedKey: string } {
  const plainKey = crypto.randomBytes(32).toString('hex');
  const hashedKey = crypto.createHash('sha256').update(plainKey).digest('hex');
  
  return { plainKey, hashedKey };
}

