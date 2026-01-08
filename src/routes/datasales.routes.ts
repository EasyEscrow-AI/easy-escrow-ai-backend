/**
 * DataSales Settlement Layer Routes
 *
 * RESTful API endpoints for DataSales.ai digital asset escrow.
 * EasyEscrow provides the settlement layer - DataSales handles listings/UI.
 *
 * Flow:
 * 1. DataSales creates agreement → S3 bucket + PDA created
 * 2. Seller uploads files, Buyer deposits SOL (within time window)
 * 3. DataSales verifies data quality → approve/reject
 * 4. Settlement → SOL to seller, download access to buyer
 *
 * @see DataSales Settlement Layer Implementation Plan
 */

import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { standardRateLimiter, strictRateLimiter } from '../middleware';
import {
  requireDataSalesApiKey,
  requireDataSalesEnabled,
} from '../middleware/dataSalesAuth.middleware';
import { DataSalesManager, CreateAgreementInput } from '../services/dataSalesManager';
import { FileUploadRequest } from '../services/s3Service';
import { prisma } from '../config/database';
import { logger } from '../services/logger.service';

const router = Router();

// Initialize services
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

const dataSalesManager = new DataSalesManager(prisma, connection);

logger.info('[DataSales Routes] Initialized');

// ============================================
// Agreement Lifecycle Endpoints
// ============================================

/**
 * POST /api/datasales/agreements
 * Create a new DataSales agreement with S3 bucket
 *
 * Called by: DataSales backend
 * Auth: DataSales API key required
 */
router.post(
  '/api/datasales/agreements',
  requireDataSalesEnabled,
  requireDataSalesApiKey,
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        sellerWallet,
        buyerWallet,
        priceLamports,
        platformFeeBps,
        depositWindowHours,
        accessDurationHours,
        files,
      } = req.body;

      // Validate required fields
      if (!sellerWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'sellerWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(sellerWallet);
      } catch {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid sellerWallet address',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (buyerWallet) {
        try {
          new PublicKey(buyerWallet);
        } catch {
          res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'Invalid buyerWallet address',
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      if (!priceLamports || BigInt(priceLamports) <= 0n) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'priceLamports must be a positive number',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const input: CreateAgreementInput = {
        sellerWallet,
        buyerWallet,
        priceLamports: BigInt(priceLamports),
        platformFeeBps,
        depositWindowHours,
        accessDurationHours,
        files: files as FileUploadRequest[],
      };

      const result = await dataSalesManager.createAgreement(input);

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to create agreement:', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to create agreement. Please try again.',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/datasales/agreements/:id
 * Get agreement details
 *
 * Called by: DataSales backend, Seller, Buyer
 * Auth: DataSales API key OR wallet signature (future)
 */
router.get(
  '/api/datasales/agreements/:id',
  requireDataSalesEnabled,
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const agreement = await dataSalesManager.getAgreement(id);

      if (!agreement) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Agreement not found: ${id}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.json({
        success: true,
        data: {
          ...agreement,
          priceLamports: agreement.priceLamports.toString(),
          platformFeeLamports: agreement.platformFeeLamports.toString(),
          totalSizeBytes: agreement.totalSizeBytes?.toString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to get agreement:', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to retrieve agreement. Please try again.',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/datasales/agreements/:id/cancel
 * Cancel an agreement (refund SOL if deposited, delete S3 bucket)
 *
 * Called by: DataSales backend
 * Auth: DataSales API key required
 */
router.post(
  '/api/datasales/agreements/:id/cancel',
  requireDataSalesEnabled,
  requireDataSalesApiKey,
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      await dataSalesManager.cancelAgreement(id);

      res.json({
        success: true,
        message: 'Agreement cancelled successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to cancel agreement:', { error: error.message });
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : 'Bad Request',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ============================================
// Seller Endpoints
// ============================================

/**
 * GET /api/datasales/agreements/:id/upload-urls
 * Get presigned upload URLs for seller
 *
 * Called by: Seller (via DataSales frontend)
 */
router.get(
  '/api/datasales/agreements/:id/upload-urls',
  requireDataSalesEnabled,
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const files = req.query.files as string;

      if (!files) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'files query parameter is required (JSON array)',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      let parsedFiles: FileUploadRequest[];
      try {
        parsedFiles = JSON.parse(files);
      } catch {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid files format. Expected JSON array.',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const urls = await dataSalesManager.getUploadUrls(id, parsedFiles);

      res.json({
        success: true,
        data: { uploadUrls: urls },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to get upload URLs:', { error: error.message });
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : 'Bad Request',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/datasales/agreements/:id/confirm-upload
 * Confirm seller has uploaded files
 *
 * Called by: Seller (via DataSales frontend)
 */
router.post(
  '/api/datasales/agreements/:id/confirm-upload',
  requireDataSalesEnabled,
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { files, sellerWallet } = req.body;

      if (!files || !Array.isArray(files)) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'files array is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // TODO: Verify sellerWallet matches agreement and has valid signature

      await dataSalesManager.confirmUpload(id, files);

      res.json({
        success: true,
        message: 'Upload confirmed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to confirm upload:', { error: error.message });
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : 'Bad Request',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ============================================
// Buyer Endpoints
// ============================================

/**
 * POST /api/datasales/agreements/:id/deposit
 * Build SOL deposit transaction for buyer
 *
 * Called by: Buyer (via DataSales frontend)
 */
router.post(
  '/api/datasales/agreements/:id/deposit',
  requireDataSalesEnabled,
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { buyerWallet } = req.body;

      if (!buyerWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'buyerWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(buyerWallet);
      } catch {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid buyerWallet address',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await dataSalesManager.buildDepositTransaction(id, buyerWallet);

      res.json({
        success: true,
        data: { transaction: result },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to build deposit transaction:', {
        error: error.message,
      });
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : 'Bad Request',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/datasales/agreements/:id/confirm-deposit
 * Confirm buyer's SOL deposit
 *
 * Called by: Buyer (via DataSales frontend)
 */
router.post(
  '/api/datasales/agreements/:id/confirm-deposit',
  requireDataSalesEnabled,
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { txSignature, buyerWallet } = req.body;

      if (!txSignature) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'txSignature is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // TODO: Verify buyerWallet matches agreement (for specific buyer listings)

      await dataSalesManager.confirmDeposit(id, txSignature);

      res.json({
        success: true,
        message: 'Deposit confirmed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to confirm deposit:', { error: error.message });
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : 'Bad Request',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/datasales/agreements/:id/download-urls
 * Get presigned download URLs for buyer (after settlement)
 *
 * Called by: Buyer (via DataSales frontend)
 */
router.get(
  '/api/datasales/agreements/:id/download-urls',
  requireDataSalesEnabled,
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const buyerWallet = req.query.buyerWallet as string;

      if (!buyerWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'buyerWallet query parameter is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const urls = await dataSalesManager.getDownloadUrls(id, buyerWallet);

      res.json({
        success: true,
        data: { downloadUrls: urls },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to get download URLs:', { error: error.message });
      const statusCode = error.message.includes('not found')
        ? 404
        : error.message.includes('expired') || error.message.includes('settled')
          ? 403
          : 400;
      res.status(statusCode).json({
        success: false,
        error:
          statusCode === 404
            ? 'Not Found'
            : statusCode === 403
              ? 'Forbidden'
              : 'Bad Request',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ============================================
// DataSales Verification Endpoints (Protected)
// ============================================

/**
 * GET /api/datasales/agreements/:id/files
 * Get files with read URLs for DataSales verification
 *
 * Called by: DataSales backend (verification)
 * Auth: DataSales API key required
 */
router.get(
  '/api/datasales/agreements/:id/files',
  requireDataSalesEnabled,
  requireDataSalesApiKey,
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const files = await dataSalesManager.getFilesForVerification(id);

      res.json({
        success: true,
        data: { files },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to get files for verification:', {
        error: error.message,
      });
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/datasales/agreements/:id/approve
 * Approve data quality (DataSales verification)
 *
 * Called by: DataSales backend
 * Auth: DataSales API key required
 */
router.post(
  '/api/datasales/agreements/:id/approve',
  requireDataSalesEnabled,
  requireDataSalesApiKey,
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { verifierAddress } = req.body;

      await dataSalesManager.approve(id, verifierAddress || 'datasales-service');

      res.json({
        success: true,
        message: 'Agreement approved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to approve agreement:', { error: error.message });
      const statusCode = error.message.includes('not found')
        ? 404
        : error.message.includes('status')
          ? 400
          : 500;
      res.status(statusCode).json({
        success: false,
        error:
          statusCode === 404
            ? 'Not Found'
            : statusCode === 400
              ? 'Bad Request'
              : 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/datasales/agreements/:id/reject
 * Reject data quality (seller can re-upload within window)
 *
 * Called by: DataSales backend
 * Auth: DataSales API key required
 */
router.post(
  '/api/datasales/agreements/:id/reject',
  requireDataSalesEnabled,
  requireDataSalesApiKey,
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'reason is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await dataSalesManager.reject(id, reason);

      res.json({
        success: true,
        message: 'Agreement rejected. Seller can re-upload within the deposit window.',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to reject agreement:', { error: error.message });
      const statusCode = error.message.includes('not found')
        ? 404
        : error.message.includes('status')
          ? 400
          : 500;
      res.status(statusCode).json({
        success: false,
        error:
          statusCode === 404
            ? 'Not Found'
            : statusCode === 400
              ? 'Bad Request'
              : 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ============================================
// Settlement Endpoint
// ============================================

/**
 * POST /api/datasales/agreements/:id/settle
 * Execute settlement (SOL to seller, access to buyer)
 *
 * Called by: DataSales backend (after approval)
 * Auth: DataSales API key required
 */
router.post(
  '/api/datasales/agreements/:id/settle',
  requireDataSalesEnabled,
  requireDataSalesApiKey,
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const result = await dataSalesManager.settle(id);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to settle agreement:', { error: error.message });
      const statusCode = error.message.includes('not found')
        ? 404
        : error.message.includes('status')
          ? 400
          : 500;
      res.status(statusCode).json({
        success: false,
        error:
          statusCode === 404
            ? 'Not Found'
            : statusCode === 400
              ? 'Bad Request'
              : 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ============================================
// Query Endpoints
// ============================================

/**
 * GET /api/datasales/agreements
 * List agreements by seller or buyer wallet
 *
 * Query params: seller, buyer, status, limit, offset
 */
router.get(
  '/api/datasales/agreements',
  requireDataSalesEnabled,
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { seller, buyer, status, limit, offset } = req.query;

      if (!seller && !buyer) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Either seller or buyer query parameter is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      let agreements;
      if (seller) {
        agreements = await dataSalesManager.listBySeller(seller as string, {
          status: status as any,
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : undefined,
        });
      } else {
        agreements = await dataSalesManager.listByBuyer(buyer as string, {
          status: status as any,
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : undefined,
        });
      }

      // Convert BigInt to string for JSON serialization
      const serializedAgreements = agreements.map((a) => ({
        ...a,
        priceLamports: a.priceLamports.toString(),
        platformFeeLamports: a.platformFeeLamports.toString(),
        totalSizeBytes: a.totalSizeBytes?.toString(),
      }));

      res.json({
        success: true,
        data: { agreements: serializedAgreements },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('[DataSales] Failed to list agreements:', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to list agreements. Please try again.',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
