import { Request, Response, NextFunction } from 'express';
import { validateCreateAgreement, ValidationError } from '../models/validators/agreement.validator';
import { CreateAgreementDTO } from '../models/dto/agreement.dto';
import { isValidNFTMintOnChain } from '../models/validators/solana.validator';
import { getSolanaService } from '../services/solana.service';

/**
 * Validation Middleware
 * Handles request validation using validators
 */

/**
 * Middleware to validate agreement creation request
 * CRITICAL FIX: Now includes on-chain NFT mint validation to prevent Error 3007
 */
export const validateAgreementCreation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data: CreateAgreementDTO = {
      nftMint: req.body.nft_mint || req.body.nftMint,
      price: req.body.price,
      seller: req.body.seller,
      buyer: req.body.buyer,
      expiry: req.body.expiry,
      feeBps: req.body.fee_bps !== undefined ? req.body.fee_bps : req.body.feeBps,
      honorRoyalties: req.body.honor_royalties !== undefined ? req.body.honor_royalties : req.body.honorRoyalties,
    };

    // Step 1: Basic validation (format checks)
    const errors = validateCreateAgreement(data);

    if (errors.length > 0) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: errors.map((e: ValidationError) => ({
          field: e.field,
          message: e.message,
        })),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Step 2: On-chain validation - CRITICAL FIX for Error 3007
    // Verify the NFT mint is actually a valid token mint owned by Token Program
    if (data.nftMint) {
      const solanaService = getSolanaService();
      const connection = solanaService.getConnection();
      const mintValidation = await isValidNFTMintOnChain(data.nftMint, connection);
      
      if (!mintValidation.valid) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid NFT mint',
          details: [
            {
              field: 'nftMint',
              message: mintValidation.error || 'Invalid NFT mint address'
            }
          ],
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    // Attach validated data to request for use in route handler
    req.body.validatedData = data;
    next();
  } catch (error) {
    console.error('[ValidationMiddleware] Error during validation:', error);
    res.status(500).json({
      error: 'Validation Error',
      message: 'Failed to validate request',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Generic error response handler
 */
export const handleValidationError = (
  res: Response,
  errors: ValidationError[]
): void => {
  res.status(400).json({
    error: 'Validation Error',
    message: 'Invalid request data',
    details: errors,
    timestamp: new Date().toISOString(),
  });
};

