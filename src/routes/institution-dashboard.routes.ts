import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionOrAdminAuth,
  getEffectiveClientId,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getInstitutionDashboardService } from '../services/institution-dashboard.service';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/api/v1/institution/dashboard/metrics', standardRateLimiter, requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDashboardService();
      const clientId = getEffectiveClientId(req);
      const metrics = await service.getMetrics(clientId);
      res.status(200).json({ success: true, data: metrics, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/dashboard/cashflow', standardRateLimiter, requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDashboardService();
      const clientId = getEffectiveClientId(req);
      const period = (req.query.period as string) || '7d';
      const cashflow = await service.getCashflow(clientId, period);
      res.status(200).json({ success: true, data: cashflow, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/dashboard/pending-actions', standardRateLimiter, requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDashboardService();
      const clientId = getEffectiveClientId(req);
      const actions = await service.getPendingActions(clientId);
      res.status(200).json({ success: true, data: actions, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/dashboard/recent-direct', standardRateLimiter, requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDashboardService();
      const clientId = getEffectiveClientId(req);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
      const payments = await service.getRecentDirect(clientId, limit);
      res.status(200).json({ success: true, data: payments, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/dashboard/branch-activity', standardRateLimiter, requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDashboardService();
      const clientId = getEffectiveClientId(req);
      const activity = await service.getBranchActivity(clientId);
      res.status(200).json({ success: true, data: activity, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/dashboard/corridor-activity', standardRateLimiter, requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDashboardService();
      const clientId = getEffectiveClientId(req);
      const activity = await service.getCorridorActivity(clientId);
      res.status(200).json({ success: true, data: activity, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/dashboard/compliance', standardRateLimiter, requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDashboardService();
      const clientId = getEffectiveClientId(req);
      const scorecard = await service.getComplianceScorecard(clientId);
      res.status(200).json({ success: true, data: scorecard, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/dashboard/sanctions', standardRateLimiter, requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDashboardService();
      const clientId = getEffectiveClientId(req);
      const sanctions = await service.getSanctions(clientId);
      res.status(200).json({ success: true, data: sanctions, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

export default router;
