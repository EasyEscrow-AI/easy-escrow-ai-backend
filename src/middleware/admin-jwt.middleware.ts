import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export interface AdminAuthenticatedRequest extends Request {
  adminUser?: {
    adminId: string;
    email: string;
    role: string;
  };
  apiKeyFingerprint?: string;
}

interface AdminJwtPayload {
  adminId: string;
  email: string;
  role: string;
}

function getJwtSecret(): string {
  const secret = config.security.jwtSecret || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractAndVerifyAdminToken(req: Request): AdminJwtPayload | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as AdminJwtPayload;

    if (!decoded.adminId) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

function checkApiKey(req: AdminAuthenticatedRequest): boolean {
  const apiKey = (req.headers['x-api-key'] || req.headers['x-admin-key']) as string;

  if (!apiKey) {
    return false;
  }

  if (process.env.NODE_ENV === 'development' && apiKey === 'test-admin-key-dev') {
    console.warn('[Admin Auth] Dev-only API key bypass used — do not use in production');
    req.apiKeyFingerprint = 'dev-key';
    return true;
  }

  const adminKeys = process.env.ADMIN_API_KEYS?.split(',').map((k) => k.trim()) || [];

  const matched = adminKeys.some((key) => constantTimeCompare(apiKey, key));
  if (matched && apiKey.length >= 8) {
    req.apiKeyFingerprint = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  } else if (matched) {
    req.apiKeyFingerprint = 'api-key';
  }

  return matched;
}

export const requireAdminAuth = (
  req: AdminAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const payload = extractAndVerifyAdminToken(req);
    if (!payload) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Admin authentication required',
        code: 'ADMIN_AUTH_REQUIRED',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.adminUser = {
      adminId: payload.adminId,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate admin request',
      timestamp: new Date().toISOString(),
    });
  }
};

export const requireAdminOrApiKey = (
  req: AdminAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Try JWT first
    const payload = extractAndVerifyAdminToken(req);
    if (payload) {
      req.adminUser = {
        adminId: payload.adminId,
        email: payload.email,
        role: payload.role,
      };
      next();
      return;
    }

    // Fall back to API key (backward compat). req.adminUser stays undefined —
    // downstream handlers must guard for this when using the API key path.
    if (checkApiKey(req)) {
      next();
      return;
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin authentication required',
      code: 'ADMIN_AUTH_REQUIRED',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate admin request',
      timestamp: new Date().toISOString(),
    });
  }
};
