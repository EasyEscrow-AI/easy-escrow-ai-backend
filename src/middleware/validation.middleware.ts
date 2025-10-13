import { Request, Response, NextFunction } from 'express';
import { validateCreateAgreement, ValidationError } from '../models/validators/agreement.validator';
import { CreateAgreementDTO } from '../models/dto/agreement.dto';

/**
 * Validation Middleware
 * Handles request validation using validators
 */

/**
 * Middleware to validate agreement creation request
 */
export const validateAgreementCreation = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
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

    // Attach validated data to request for use in route handler
    req.body.validatedData = data;
    next();
  } catch (error) {
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

