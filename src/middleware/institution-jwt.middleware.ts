import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface InstitutionAuthenticatedRequest extends Request {
  institutionClient?: {
    clientId: string;
    email: string;
    tier: string;
  };
  adminUser?: {
    adminId: string;
    email: string;
    role: string;
  };
}

interface InstitutionJwtPayload {
  clientId: string;
  email: string;
  tier: string;
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
  return secret;
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Extracts and verifies a Bearer token from the Authorization header.
 * Returns the decoded payload on success, or sends an error response and returns null.
 */
function extractAndVerifyToken(req: Request, res: Response): InstitutionJwtPayload | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No authentication token provided',
      code: 'TOKEN_MISSING',
      timestamp: new Date().toISOString(),
    });
    return null;
  }

  const token = authHeader.slice(7);

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as InstitutionJwtPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token has expired',
        code: 'TOKEN_EXPIRED',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authentication token',
        code: 'TOKEN_INVALID',
        timestamp: new Date().toISOString(),
      });
    }
    return null;
  }
}

/**
 * Requires a valid institution JWT token.
 * Attaches decoded payload to req.institutionClient.
 */
export const requireInstitutionAuth = (
  req: InstitutionAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const payload = extractAndVerifyToken(req, res);
    if (!payload) return;

    req.institutionClient = {
      clientId: payload.clientId,
      email: payload.email,
      tier: payload.tier,
    };

    next();
  } catch (error) {
    console.error('Institution authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate request',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Optional institution JWT authentication.
 * Attaches decoded payload if a valid token is present, but allows
 * unauthenticated requests to proceed.
 */
export const optionalInstitutionAuth = (
  req: InstitutionAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.institutionClient = undefined;
      next();
      return;
    }

    const token = authHeader.slice(7);
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as InstitutionJwtPayload;

    req.institutionClient = {
      clientId: decoded.clientId,
      email: decoded.email,
      tier: decoded.tier,
    };

    next();
  } catch (error) {
    // Don't fail on optional auth errors
    req.institutionClient = undefined;
    next();
  }
};

/**
 * Accepts either a valid institution JWT or admin JWT.
 * - Institution JWT: populates req.institutionClient with clientId/email/tier
 * - Admin JWT: populates req.adminUser with adminId/email/role.
 *   If the admin provides a ?clientId query param, req.institutionClient is
 *   also populated so downstream handlers work unchanged.
 */
export const requireInstitutionOrAdminAuth = (
  req: InstitutionAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
        code: 'TOKEN_MISSING',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const token = authHeader.slice(7);

    let decoded: any;
    try {
      const secret = getJwtSecret();
      decoded = jwt.verify(token, secret);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication token has expired',
          code: 'TOKEN_EXPIRED',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid authentication token',
          code: 'TOKEN_INVALID',
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    // Institution JWT path (has clientId)
    if (decoded.clientId) {
      req.institutionClient = {
        clientId: decoded.clientId,
        email: decoded.email,
        tier: decoded.tier,
      };
      next();
      return;
    }

    // Admin JWT path (has adminId)
    if (decoded.adminId) {
      req.adminUser = {
        adminId: decoded.adminId,
        email: decoded.email,
        role: decoded.role,
      };

      // Admin can scope to a specific client via ?clientId query param
      const clientId = req.query.clientId as string | undefined;
      if (clientId) {
        req.institutionClient = {
          clientId,
          email: decoded.email,
          tier: 'admin',
        };
      }

      next();
      return;
    }

    // Token has neither clientId nor adminId
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authentication token',
      code: 'TOKEN_INVALID',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate request',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Requires a valid settlement authority key.
 * Must be used after requireInstitutionAuth (expects req.institutionClient to be set).
 * Validates the X-Settlement-Authority-Key header against SETTLEMENT_AUTHORITY_API_KEY.
 */
export const requireSettlementAuthority = (
  req: InstitutionAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.institutionClient) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required before settlement authority check',
        code: 'AUTH_REQUIRED',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const settlementKey = req.headers['x-settlement-authority-key'] as string;

    if (!settlementKey) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid settlement authority key',
        code: 'SETTLEMENT_UNAUTHORIZED',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const expectedKey = process.env.SETTLEMENT_AUTHORITY_API_KEY;

    if (!expectedKey) {
      console.error('SETTLEMENT_AUTHORITY_API_KEY environment variable is not configured');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Settlement authority is not configured',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!constantTimeCompare(settlementKey, expectedKey)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid settlement authority key',
        code: 'SETTLEMENT_UNAUTHORIZED',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Settlement authority authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify settlement authority',
      timestamp: new Date().toISOString(),
    });
  }
};
