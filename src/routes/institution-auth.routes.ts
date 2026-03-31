/**
 * Institution Auth Routes
 *
 * POST   /api/v1/institution/auth/register   → register
 * POST   /api/v1/institution/auth/login      → login
 * POST   /api/v1/institution/auth/refresh    → refreshToken
 * POST   /api/v1/institution/auth/logout     → logout (requires auth)
 * GET    /api/v1/institution/auth/me         → getProfile (requires auth)
 * PUT    /api/v1/institution/auth/password   → changePassword (requires auth)
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { validationResult } from 'express-validator';
import { getInstitutionAuthService } from '../services/institution-auth.service';
import {
  requireInstitutionOrAdminAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';

const router = Router();

// Rate limiter for auth endpoints: 15 requests per 15 minutes (production), 100 in staging/dev
const isProduction = process.env.NODE_ENV === 'production';
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 15 : 100,
  message: { error: 'Too many attempts', message: 'Please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Standard rate limiter for authenticated endpoints
const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

function handleValidationErrors(req: Request, res: Response): boolean {
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

// POST /api/v1/institution/auth/register
router.post(
  '/api/v1/institution/auth/register',
  authRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email, password, companyName } = req.body;

      if (!email || !password || !companyName) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'email, password, and companyName are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const authService = getInstitutionAuthService();
      const result = await authService.register(email, password, companyName);

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('already registered') ? 409 : 400;
      res.status(status).json({
        error: 'Registration Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// POST /api/v1/institution/auth/login
router.post(
  '/api/v1/institution/auth/login',
  authRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'email and password are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const authService = getInstitutionAuthService();
      const result = await authService.login(
        email,
        password,
        req.ip || undefined,
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('rate limit') ? 429 : 401;
      res.status(status).json({
        error: 'Authentication Failed',
        message: error.message,
        code: error.message.includes('rate limit') ? 'RATE_LIMITED' : 'AUTH_FAILED',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// POST /api/v1/institution/auth/refresh
router.post(
  '/api/v1/institution/auth/refresh',
  async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'refreshToken is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const authService = getInstitutionAuthService();
      const result = await authService.refreshToken(refreshToken);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(401).json({
        error: 'Token Refresh Failed',
        message: error.message,
        code: error.code || 'REFRESH_FAILED',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// POST /api/v1/institution/auth/logout
router.post(
  '/api/v1/institution/auth/logout',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'refreshToken is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const authService = getInstitutionAuthService();
      await authService.logout(refreshToken);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Logout Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// GET /api/v1/institution/auth/me
router.get(
  '/api/v1/institution/auth/me',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const authService = getInstitutionAuthService();
      const profile = await authService.getProfile(
        req.institutionClient!.clientId,
      );

      res.status(200).json({
        success: true,
        data: profile,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(404).json({
        error: 'Profile Not Found',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// PUT /api/v1/institution/auth/password
router.put(
  '/api/v1/institution/auth/password',
  standardRateLimiter,
  requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'oldPassword and newPassword are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const authService = getInstitutionAuthService();
      await authService.changePassword(
        req.institutionClient!.clientId,
        oldPassword,
        newPassword,
      );

      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        error: 'Password Change Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
