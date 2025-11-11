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
  depositSolToEscrow,
  prepareDepositNftTransaction,
  prepareDepositBuyerNftTransaction,
  prepareDepositUsdcTransaction,
  prepareDepositSolTransaction,
  prepareDepositSellerSolFeeTransaction,
  archiveAgreements,
  extendAgreementExpiry
} from '../services/agreement.service';
import { CreateAgreementDTO, AgreementQueryDTO } from '../models/dto/agreement.dto';
import { AgreementStatus } from '../generated/prisma';
import { ValidationError } from '../services/solana.service';
import { prisma } from '../config/database';

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
      if (error instanceof Error && error.name === 'ValidationError') {
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
 * List agreements with filters (supports SOL-based swap types)
 */
router.get('/v1/agreements', standardRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const filters: AgreementQueryDTO = {
      status: req.query.status as AgreementStatus | undefined,
      swapType: req.query.swap_type as any, // SwapType from Prisma
      seller: req.query.seller as string | undefined,
      buyer: req.query.buyer as string | undefined,
      nftMint: req.query.nft_mint as string | undefined,
      nftBMint: req.query.nft_b_mint as string | undefined,
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
 * - Anyone can cancel anytime (before or after expiry) as long as not settled/refunded
 * - Before expiry: Backend uses adminCancel method (signed with admin key)
 * - After expiry: Backend uses cancelIfExpired method
 * - Admin users can optionally use x-admin-key header (same behavior, just explicit)
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
 * POST /v1/agreements/:agreementId/deposit-nft-buyer/prepare
 * PRODUCTION ENDPOINT: Returns unsigned transaction for client-side signing
 * Client must sign with buyer's wallet and submit to network
 * For NFT_FOR_NFT_WITH_FEE and NFT_FOR_NFT_PLUS_SOL swap types (buyer deposits NFT B)
 */
router.post(
  '/v1/agreements/:agreementId/deposit-nft-buyer/prepare',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      console.log('[AgreementRoutes] POST /deposit-nft-buyer/prepare for:', agreementId);

      const result = await prepareDepositBuyerNftTransaction(agreementId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AgreementRoutes] Error preparing buyer NFT deposit transaction:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      let statusCode = 500;
      if (
        errorMessage.includes('not found') || 
        errorMessage.includes('does not exist')
      ) {
        statusCode = 404;
      } else if (
        errorMessage.includes('Cannot deposit') ||
        errorMessage.includes('Invalid') ||
        errorMessage.includes('No buyer') ||
        errorMessage.includes('swap type')
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

/**
 * POST /v1/agreements/:agreementId/deposit-sol/prepare
 * PRODUCTION ENDPOINT: Returns unsigned transaction for client-side signing
 * Client must sign with buyer's wallet and submit to network
 * For NFT_FOR_SOL and NFT_FOR_NFT_PLUS_SOL swap types
 */
router.post(
  '/v1/agreements/:agreementId/deposit-sol/prepare',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      console.log('[AgreementRoutes] POST /deposit-sol/prepare for:', agreementId);

      const result = await prepareDepositSolTransaction(agreementId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AgreementRoutes] Error preparing SOL deposit transaction:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Determine status code based on error message
      let statusCode = 500;
      if (
        errorMessage.includes('not found') || 
        errorMessage.includes('does not exist')
      ) {
        statusCode = 404;
      } else if (
        errorMessage.includes('Cannot deposit') ||
        errorMessage.includes('Invalid') ||
        errorMessage.includes('No buyer') ||
        errorMessage.includes('swap type')
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
 * POST /v1/agreements/:agreementId/deposit-seller-sol-fee/prepare
 * PRODUCTION ENDPOINT: Returns unsigned transaction for client-side signing
 * Client must sign with seller's wallet and submit to network
 * For NFT_FOR_NFT_WITH_FEE swap type - seller pays 0.005 SOL
 */
router.post(
  '/v1/agreements/:agreementId/deposit-seller-sol-fee/prepare',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      console.log('[AgreementRoutes] POST /deposit-seller-sol-fee/prepare for:', agreementId);

      const result = await prepareDepositSellerSolFeeTransaction(agreementId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AgreementRoutes] Error preparing seller SOL fee deposit transaction:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Determine status code based on error message
      let statusCode = 500;
      if (
        errorMessage.includes('not found') || 
        errorMessage.includes('does not exist')
      ) {
        statusCode = 404;
      } else if (
        errorMessage.includes('Cannot deposit') ||
        errorMessage.includes('Invalid') ||
        errorMessage.includes('swap type')
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
 * POST /v1/agreements/:agreementId/deposit-sol
 * @deprecated Use /deposit-sol/prepare for production (client-side signing)
 * Deposit SOL into escrow by calling the on-chain deposit_sol instruction
 * This properly sets the buyer_sol_deposited flag on-chain
 */
router.post(
  '/v1/agreements/:agreementId/deposit-sol',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      console.log('[AgreementRoutes] POST /deposit-sol for:', agreementId);

      const result = await depositSolToEscrow(agreementId);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AgreementRoutes] Error depositing SOL:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Determine status code based on error message
      let statusCode = 500;
      if (
        errorMessage.includes('not found') || 
        errorMessage.includes('does not exist')
      ) {
        statusCode = 404;
      } else if (
        errorMessage.includes('Cannot deposit') ||
        errorMessage.includes('Invalid') ||
        errorMessage.includes('No buyer') ||
        errorMessage.includes('swap type')
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
 * POST /v1/agreements/:agreementId/validate-deposits
 * Manually validate deposits by checking on-chain balances
 * Useful for triggering detection when WebSocket subscriptions are slow
 */
router.post(
  '/v1/agreements/:agreementId/validate-deposits',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      console.log('[AgreementRoutes] POST /validate-deposits for:', agreementId);

      // Get agreement to determine swap type
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
        include: { deposits: true },
      });

      if (!agreement) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Agreement not found',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const results: any = {
        agreementId,
        swapType: agreement.swapType,
        validations: {},
      };

      // Validate SOL deposits for SOL-based swaps
      if (agreement.swapType === 'NFT_FOR_SOL' || agreement.swapType === 'NFT_FOR_NFT_PLUS_SOL') {
        const { getSolDepositService } = await import('../services/sol-deposit.service');
        const solDepositService = getSolDepositService();
        
        const solResult = await solDepositService.validateSolDeposit(agreementId);
        results.validations.sol = solResult;
        
        if (solResult.success) {
          console.log(`[AgreementRoutes] SOL deposit validated: ${solResult.amount} SOL`);
        }
      }

      // Refresh agreement status
      const updatedAgreement = await prisma.agreement.findUnique({
        where: { agreementId },
      });

      results.currentStatus = updatedAgreement?.status;

      res.status(200).json({
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AgreementRoutes] Error validating deposits:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /v1/agreements/archive
 * Archive multiple agreements (admin-only, for test cleanup)
 * Optional admin authentication
 */
router.post(
  '/v1/agreements/archive',
  standardRateLimiter,
  optionalAdminAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementIds, reason } = req.body;

      // Validate input
      if (!agreementIds || !Array.isArray(agreementIds) || agreementIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'agreementIds must be a non-empty array',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Limit to 100 agreements per request to prevent abuse
      if (agreementIds.length > 100) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Cannot archive more than 100 agreements at once',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate that all IDs are strings
      if (!agreementIds.every((id: any) => typeof id === 'string')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'All agreement IDs must be strings',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const archiveReason = reason || 'Manual archive via API';

      console.log(`[ArchiveRoute] Archiving ${agreementIds.length} agreements`);
      console.log(`[ArchiveRoute] Reason: ${archiveReason}`);

      const result = await archiveAgreements(agreementIds, archiveReason);

      res.status(200).json({
        success: true,
        data: {
          archived: result.count,
          agreementIds: result.archived,
          reason: archiveReason,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error archiving agreements:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to archive agreements',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /v1/agreements/:agreementId/extend-expiry
 * Extend agreement expiry before expiration
 * 
 * Supports:
 * - Duration in hours (number 1-24)
 * - Preset strings ('1h', '6h', '12h', '24h')
 * - Absolute timestamp (ISO 8601)
 * 
 * Constraints:
 * - Agreement must not be expired, settled, cancelled, or refunded
 * - New expiry must not exceed 24 hours from now
 * - Only seller or buyer can extend (if requesterAddress provided)
 */
router.post(
  '/v1/agreements/:agreementId/extend-expiry',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;
      const { extension, requesterAddress } = req.body;

      // Validate required field
      if (!extension) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Extension duration is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Extend expiry
      const result = await extendAgreementExpiry(agreementId, extension, requesterAddress);

      res.status(200).json({
        success: true,
        data: {
          agreementId: result.agreementId,
          oldExpiry: result.oldExpiry.toISOString(),
          newExpiry: result.newExpiry.toISOString(),
          extensionHours: result.extensionHours,
          message: `Successfully extended expiry by ${result.extensionHours.toFixed(1)} hours`,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error extending expiry:', error);

      // Handle ValidationError with 400 status
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: error.message,
          details: error.details,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Generic error
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to extend expiry',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /v1/agreements/:agreementId
 * Delete an agreement (primarily for test cleanup)
 * No rate limiting for internal test cleanup
 */
router.delete(
  '/v1/agreements/:agreementId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { agreementId } = req.params;

      // Import delete function dynamically to avoid circular dependency
      const { deleteAgreement } = await import('../services/agreement.service');
      
      await deleteAgreement(agreementId);

      res.status(200).json({
        success: true,
        message: 'Agreement deleted successfully',
        data: { agreementId },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error deleting agreement:', error);

      // Handle not found
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Generic error
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to delete agreement',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;

