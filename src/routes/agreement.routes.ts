import { Router, Request, Response } from 'express';
import { validateAgreementCreation } from '../middleware/validation.middleware';
import { standardRateLimiter, strictRateLimiter, validateUSDCMintMiddleware, requiredIdempotency, optionalAdminAuth } from '../middleware';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { 
  createAgreement, 
  getAgreementById, 
  getAgreementDetailById,
  cancelAgreement,
  listAgreements,
  depositNftToEscrow,
  depositUsdcToEscrow,
  prepareDepositNftTransaction,
  prepareDepositUsdcTransaction
} from '../services/agreement.service';
import { CreateAgreementDTO, AgreementQueryDTO } from '../models/dto/agreement.dto';
import { AgreementStatus } from '../generated/prisma';
import { ValidationError } from '../services/solana.service';

const router = Router();

/**
 * POST /v1/agreements
 * Create a new agreement
 * Protected with strict rate limiting, USDC mint validation, and required idempotency
 */
router.post(
  '/v1/agreements',
  strictRateLimiter,
  requiredIdempotency,
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
      
      // Check if it's a validation error (from on-chain validation)
      if (error instanceof ValidationError) {
        res.status(422).json({
          success: false,
          error: 'Validation Error',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      
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
 * Get agreement by ID with detailed balances and deposit information
 */
router.get('/v1/agreements/:agreementId', standardRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { agreementId } = req.params;

    const agreement = await getAgreementDetailById(agreementId);

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

/**
 * POST /v1/agreements/:agreementId/cancel
 * Cancel an agreement
 * - Regular users: Only allows cancellation of expired agreements that haven't been settled
 * - Admin users: Can cancel any agreement (except settled/refunded) using x-admin-key header
 */
router.post(
  '/v1/agreements/:agreementId/cancel', 
  standardRateLimiter,
  optionalAdminAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;
      const isAdmin = req.isAdmin || false;

      const result = await cancelAgreement(agreementId, isAdmin);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error cancelling agreement:', error);
      
      // Handle specific error messages
      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel agreement';
      
      let statusCode = 500;
      if (errorMessage.includes('not found')) {
        statusCode = 404;
      } else if (
        errorMessage.includes('already cancelled') || 
        errorMessage.includes('Cannot cancel a settled') ||
        errorMessage.includes('already settled') ||
        errorMessage.includes('already refunded') ||
        errorMessage.includes('not expired') ||
        errorMessage.includes('has not expired')
      ) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /v1/agreements/:agreementId/deposit-nft/prepare
 * PRODUCTION ENDPOINT: Returns unsigned transaction for client-side signing
 * Client must sign with seller's wallet and submit to network
 */
router.post(
  '/v1/agreements/:agreementId/deposit-nft/prepare',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      console.log('[AgreementRoutes] POST /deposit-nft/prepare for:', agreementId);

      const result = await prepareDepositNftTransaction(agreementId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AgreementRoutes] Error preparing NFT deposit transaction:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to prepare NFT deposit transaction';
      
      let statusCode = 500;
      if (errorMessage.includes('not found')) {
        statusCode = 404;
      } else if (
        errorMessage.includes('Cannot deposit') || 
        errorMessage.includes('status is')
      ) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /v1/agreements/:agreementId/deposit-usdc/prepare
 * PRODUCTION ENDPOINT: Returns unsigned transaction for client-side signing
 * Client must sign with buyer's wallet and submit to network
 */
router.post(
  '/v1/agreements/:agreementId/deposit-usdc/prepare',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      console.log('[AgreementRoutes] POST /deposit-usdc/prepare for:', agreementId);

      const result = await prepareDepositUsdcTransaction(agreementId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AgreementRoutes] Error preparing USDC deposit transaction:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to prepare USDC deposit transaction';
      
      let statusCode = 500;
      if (errorMessage.includes('not found')) {
        statusCode = 404;
      } else if (
        errorMessage.includes('Cannot deposit') || 
        errorMessage.includes('status is') ||
        errorMessage.includes('No buyer')
      ) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /v1/agreements/:agreementId/deposit-nft
 * @deprecated Use /deposit-nft/prepare for production (client-side signing)
 * Deposit NFT into escrow by calling the on-chain deposit_nft instruction
 * This properly sets the seller_nft_deposited flag on-chain
 */
router.post(
  '/v1/agreements/:agreementId/deposit-nft',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      console.log('[AgreementRoutes] POST /deposit-nft for:', agreementId);

      const result = await depositNftToEscrow(agreementId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AgreementRoutes] Error depositing NFT:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to deposit NFT';
      
      let statusCode = 500;
      if (errorMessage.includes('not found')) {
        statusCode = 404;
      } else if (
        errorMessage.includes('Cannot deposit') || 
        errorMessage.includes('status is')
      ) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /v1/agreements/:agreementId/deposit-usdc
 * @deprecated Use /deposit-usdc/prepare for production (client-side signing)
 * Deposit USDC into escrow by calling the on-chain deposit_usdc instruction
 * This properly sets the buyer_usdc_deposited flag on-chain
 */
router.post(
  '/v1/agreements/:agreementId/deposit-usdc',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      console.log('[AgreementRoutes] POST /deposit-usdc for:', agreementId);

      const result = await depositUsdcToEscrow(agreementId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AgreementRoutes] Error depositing USDC:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to deposit USDC';
      
      let statusCode = 500;
      if (errorMessage.includes('not found')) {
        statusCode = 404;
      } else if (
        errorMessage.includes('Cannot deposit') || 
        errorMessage.includes('status is') ||
        errorMessage.includes('No buyer')
      ) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        error: statusCode === 404 ? 'Not Found' : statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;

