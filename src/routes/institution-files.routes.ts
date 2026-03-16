/**
 * Institution Files Routes
 *
 * POST   /api/v1/institution/files        → uploadFile
 * GET    /api/v1/institution/files        → listFiles
 * GET    /api/v1/institution/files/:id    → getFileUrl
 * DELETE /api/v1/institution/files/:id    → deleteFile
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import {
  getInstitutionFileService,
  institutionFileUpload,
} from '../services/institution-file.service';

const router = Router();

const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/v1/institution/files
router.post(
  '/api/v1/institution/files',
  standardRateLimiter,
  requireInstitutionAuth,
  institutionFileUpload.single('file'),
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'No file provided. Upload a file with field name "file".',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const documentType = req.body.documentType || 'OTHER';
      const escrowId = req.body.escrowId;

      const service = getInstitutionFileService();
      const file = await service.uploadFile(
        req.institutionClient!.clientId,
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
        documentType,
        escrowId,
      );

      res.status(201).json({
        success: true,
        data: file,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('Invalid file type') ? 415 : 400;
      res.status(status).json({
        error: 'Upload Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// GET /api/v1/institution/files
router.get(
  '/api/v1/institution/files',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionFileService();
      const files = await service.listFiles(
        req.institutionClient!.clientId,
        req.query.escrowId as string | undefined,
      );

      res.status(200).json({
        success: true,
        data: files,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Internal Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// GET /api/v1/institution/files/:id
router.get(
  '/api/v1/institution/files/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionFileService();
      const result = await service.getFileUrl(
        req.params.id,
        req.institutionClient!.clientId,
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: 'File Not Found',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// DELETE /api/v1/institution/files/:id
router.delete(
  '/api/v1/institution/files/:id',
  standardRateLimiter,
  requireInstitutionAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const service = getInstitutionFileService();
      await service.deleteFile(
        req.params.id,
        req.institutionClient!.clientId,
      );

      res.status(200).json({
        success: true,
        message: 'File deleted',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: 'Delete Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
