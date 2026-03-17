/**
 * Institution Escrow Receipt Routes
 *
 * GET /api/v1/institution-escrow/:escrowId/receipt       → HTML or PDF receipt (?format=pdf)
 * GET /api/v1/institution-escrow/:escrowId/receipt/data  → JSON receipt data
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getInstitutionReceiptService } from '../services/institution-receipt.service';

const router = Router();

const receiptRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Rate limit exceeded', message: 'Too many receipt requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /api/v1/institution-escrow/:escrowId/receipt
 *
 * Query params:
 *   ?format=pdf  → returns PDF (application/pdf)
 *   ?format=html → returns HTML (default)
 */
router.get(
  '/api/v1/institution-escrow/:escrowId/receipt',
  receiptRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const { escrowId } = req.params;
      const clientId = req.institutionClient!.clientId;
      const format = (req.query.format as string)?.toLowerCase() || 'html';

      const service = getInstitutionReceiptService();

      if (format === 'pdf') {
        const { buffer, filename } = await service.generatePDF(escrowId, clientId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length.toString());
        return res.send(buffer);
      }

      // Default: HTML
      const data = await service.getReceiptData(escrowId, clientId);
      const html = service.renderReceiptHTML(data);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: 'Escrow not found' });
      }
      console.error('Receipt generation error:', err);
      return res.status(500).json({ error: 'Failed to generate receipt' });
    }
  },
);

/**
 * GET /api/v1/institution-escrow/:escrowId/receipt/data
 * Returns the raw receipt data as JSON (for custom rendering)
 */
router.get(
  '/api/v1/institution-escrow/:escrowId/receipt/data',
  receiptRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const { escrowId } = req.params;
      const clientId = req.institutionClient!.clientId;

      const service = getInstitutionReceiptService();
      const data = await service.getReceiptData(escrowId, clientId);

      // Strip logo base64 from JSON response to keep payload small
      const { logoBase64, ...jsonData } = data;
      res.json(jsonData);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: 'Escrow not found' });
      }
      console.error('Receipt data error:', err);
      return res.status(500).json({ error: 'Failed to fetch receipt data' });
    }
  },
);

export default router;
