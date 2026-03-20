import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireInstitutionAuth, InstitutionAuthenticatedRequest } from '../middleware/institution-jwt.middleware';
import { getInstitutionDirectPaymentService } from '../services/institution-direct-payment.service';

const router = Router();
const standardRateLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Rate limit exceeded', message: 'Too many requests' }, standardHeaders: true, legacyHeaders: false });

router.get('/api/v1/institution/direct-payments', standardRateLimiter, requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDirectPaymentService();
      const result = await service.list(req.institutionClient!.clientId, {
        status: req.query.status as string, corridor: req.query.corridor as string,
        from: req.query.from as string, to: req.query.to as string,
        limit: parseInt(req.query.limit as string) || 20, offset: parseInt(req.query.offset as string) || 0,
      });
      res.status(200).json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

router.get('/api/v1/institution/direct-payments/:id', standardRateLimiter, requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionDirectPaymentService();
      const payment = await service.getById(req.institutionClient!.clientId, req.params.id);
      res.status(200).json({ success: true, data: payment, timestamp: new Date().toISOString() });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: status === 404 ? 'Not Found' : 'Internal Error', message: error.message, timestamp: new Date().toISOString() });
    }
  });

export default router;
