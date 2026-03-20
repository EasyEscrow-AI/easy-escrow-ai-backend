import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireInstitutionAuth, InstitutionAuthenticatedRequest } from '../middleware/institution-jwt.middleware';
import { getInstitutionReportsService } from '../services/institution-reports.service';

const router = Router();
const standardRateLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Rate limit exceeded', message: 'Too many requests' }, standardHeaders: true, legacyHeaders: false });

router.get('/api/v1/institution/reports/compliance', standardRateLimiter, requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionReportsService();
      const result = await service.getComplianceReport(req.institutionClient!.clientId, {
        from: req.query.from as string, to: req.query.to as string,
        limit: parseInt(req.query.limit as string) || 50, offset: parseInt(req.query.offset as string) || 0,
      });
      res.status(200).json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/reports/audit', standardRateLimiter, requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionReportsService();
      const result = await service.getAuditLog(req.institutionClient!.clientId, {
        action: req.query.action as string, escrowId: req.query.escrowId as string,
        from: req.query.from as string, to: req.query.to as string,
        limit: parseInt(req.query.limit as string) || 50, offset: parseInt(req.query.offset as string) || 0,
      });
      res.status(200).json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/reports/receipts', standardRateLimiter, requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionReportsService();
      const result = await service.getReceipts(req.institutionClient!.clientId, {
        from: req.query.from as string, to: req.query.to as string, type: req.query.type as string,
        limit: parseInt(req.query.limit as string) || 50, offset: parseInt(req.query.offset as string) || 0,
      });
      res.status(200).json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/reports/escrow-log', standardRateLimiter, requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionReportsService();
      const result = await service.getEscrowLog(req.institutionClient!.clientId, {
        escrowId: req.query.escrowId as string, from: req.query.from as string, to: req.query.to as string,
        limit: parseInt(req.query.limit as string) || 50, offset: parseInt(req.query.offset as string) || 0,
      });
      res.status(200).json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

export default router;
