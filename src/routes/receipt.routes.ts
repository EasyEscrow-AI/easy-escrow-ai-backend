/**
 * Receipt Routes
 *
 * API endpoints for retrieving and verifying settlement receipts
 */

import { Router, Request, Response } from 'express';
import { standardRateLimiter } from '../middleware';
import { getReceiptService } from '../services/receipt.service';
import { ReceiptQueryDTO } from '../models/dto/receipt.dto';

const router = Router();

/**
 * GET /v1/receipts/:id
 * Get a specific receipt by ID
 */
router.get('/v1/receipts/:id', standardRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const receiptService = getReceiptService();

    const receipt = await receiptService.getReceiptById(id);

    if (!receipt) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Receipt not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: receipt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ReceiptRoutes] Error getting receipt:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to get receipt',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /v1/receipts
 * List receipts with optional filters
 * Query parameters:
 * - agreement_id: Filter by agreement ID
 * - buyer: Filter by buyer address
 * - seller: Filter by seller address
 * - nft_mint: Filter by NFT mint address
 * - start_date: Filter by start date (ISO string)
 * - end_date: Filter by end date (ISO string)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 */
router.get('/v1/receipts', standardRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const query: ReceiptQueryDTO = {
      agreementId: req.query.agreement_id as string | undefined,
      buyer: req.query.buyer as string | undefined,
      seller: req.query.seller as string | undefined,
      nftMint: req.query.nft_mint as string | undefined,
      startDate: req.query.start_date as string | undefined,
      endDate: req.query.end_date as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const receiptService = getReceiptService();
    const result = await receiptService.listReceipts(query);

    res.status(200).json({
      success: true,
      data: result.receipts,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.ceil(result.total / result.limit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ReceiptRoutes] Error listing receipts:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to list receipts',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /v1/receipts/agreement/:agreementId
 * Get receipt by agreement ID
 */
router.get(
  '/v1/receipts/agreement/:agreementId',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;
      const receiptService = getReceiptService();

      const receipt = await receiptService.getReceiptByAgreementId(agreementId);

      if (!receipt) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Receipt not found for this agreement',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: receipt,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[ReceiptRoutes] Error getting receipt by agreement:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to get receipt',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /v1/receipts/hash/:hash
 * Get receipt by hash
 */
router.get('/v1/receipts/hash/:hash', standardRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { hash } = req.params;
    const receiptService = getReceiptService();

    const receipt = await receiptService.getReceiptByHash(hash);

    if (!receipt) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Receipt not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: receipt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ReceiptRoutes] Error getting receipt by hash:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to get receipt',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /v1/receipts/:id/verify
 * Verify a receipt's cryptographic signature
 */
router.post('/v1/receipts/:id/verify', standardRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const receiptService = getReceiptService();

    const verification = await receiptService.verifyReceipt(id);

    res.status(200).json({
      success: true,
      data: verification,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ReceiptRoutes] Error verifying receipt:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to verify receipt';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
      message: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

