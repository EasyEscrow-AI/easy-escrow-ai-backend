import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getAdminAuthService } from '../../services/admin-auth.service';
import {
  requireAdminAuth,
  AdminAuthenticatedRequest,
} from '../../middleware/admin-jwt.middleware';

const router = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Rate limit exceeded', message: 'Too many login attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/admin/auth/login
router.post(
  '/api/admin/auth/login',
  loginRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Email and password are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const authService = getAdminAuthService();
      const result = await authService.login(email, password);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message?.includes('Too many login attempts') ? 429 : 401;
      res.status(status).json({
        error: status === 429 ? 'Rate Limit Exceeded' : 'Authentication Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// POST /api/admin/auth/refresh
router.post('/api/admin/auth/refresh', loginRateLimiter, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Refresh token is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const authService = getAdminAuthService();
    const tokens = await authService.refreshToken(refreshToken);

    res.status(200).json({
      success: true,
      data: tokens,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(401).json({
      error: 'Token Refresh Failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/admin/auth/logout
router.post(
  '/api/admin/auth/logout',
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Refresh token is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const authService = getAdminAuthService();
      await authService.logout(refreshToken);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Logout Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// GET /api/admin/auth/me
router.get(
  '/api/admin/auth/me',
  requireAdminAuth,
  async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const authService = getAdminAuthService();
      const profile = await authService.getProfile(req.adminUser!.adminId);

      res.status(200).json({
        success: true,
        data: profile,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(404).json({
        error: 'Not Found',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// PUT /api/admin/auth/password
router.put(
  '/api/admin/auth/password',
  requireAdminAuth,
  async (req: AdminAuthenticatedRequest, res: Response) => {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Old password and new password are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (newPassword.length < 12) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'New password must be at least 12 characters',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(newPassword)) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Password must contain uppercase, lowercase, digit, and special character (!@#$%^&*)',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const authService = getAdminAuthService();
      await authService.changePassword(req.adminUser!.adminId, oldPassword, newPassword);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message === 'Current password is incorrect' ? 400 : 500;
      res.status(status).json({
        error: status === 400 ? 'Validation Error' : 'Internal Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
