import { Router, Request, Response } from 'express';
import { validateAgreementCreation } from '../middleware/validation.middleware';
import { standardRateLimiter, strictRateLimiter, validateUSDCMintMiddleware } from '../middleware';
import { createAgreement, getAgreementById, listAgreements } from '../services/agreement.service';
import { CreateAgreementDTO, AgreementQueryDTO } from '../models/dto/agreement.dto';
import { AgreementStatus } from '../generated/prisma';

const router = Router();

/**
 * POST /v1/agreements
 * Create a new agreement
 * Protected with strict rate limiting and USDC mint validation
 */
router.post(
  '/v1/agreements',
  strictRateLimiter,
  validateUSDCMintMiddleware,
  validateAgreementCreation,
  async (req: Request, res: Response): Promise<void> => {
  try {
    const data: CreateAgreementDTO = req.body.validatedData;

    const agreement = await createAgreement(data);

      res.status(201).json({
        success: true,
        data: agreement,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error creating agreement:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to create agreement',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /v1/agreements/:agreementId
 * Get agreement by ID
 */
router.get('/v1/agreements/:agreementId', standardRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { agreementId } = req.params;

    const agreement = await getAgreementById(agreementId);

    if (!agreement) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Agreement not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: agreement,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting agreement:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to get agreement',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /v1/agreements
 * List agreements with filters
 */
router.get('/v1/agreements', standardRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const filters: AgreementQueryDTO = {
      status: req.query.status as AgreementStatus | undefined,
      seller: req.query.seller as string | undefined,
      buyer: req.query.buyer as string | undefined,
      nftMint: req.query.nft_mint as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = await listAgreements(filters);

    res.status(200).json({
      success: true,
      data: result.agreements,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.ceil(result.total / result.limit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error listing agreements:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to list agreements',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

