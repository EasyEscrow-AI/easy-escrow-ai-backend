import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireInstitutionOrAdminAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getInstitutionTransferService } from '../services/institution-transfer.service';
import { logger } from '../services/logger.service';

const router = Router();

const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Rate limit exceeded', message: 'Too many transfer requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/v1/institution/accounts/transfer/prepare
 * Validate the transfer, build a Solana transaction, and return it partially signed.
 * The frontend must sign with the account owner's wallet, submit to Solana,
 * then call /submit with the txSignature.
 */
router.post(
  '/api/v1/institution/accounts/transfer/prepare',
  strictRateLimiter,
  requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const clientId = req.institutionClient!.clientId;
      const {
        fromAccountId,
        toAccountId,
        tokenSymbol,
        amount,
        walletSignature,
        signerPublicKey,
        timestamp,
        note,
      } = req.body;

      // Input presence checks
      const missing: string[] = [];
      if (!fromAccountId) missing.push('fromAccountId');
      if (!toAccountId) missing.push('toAccountId');
      if (!tokenSymbol) missing.push('tokenSymbol');
      if (amount === undefined || amount === null) missing.push('amount');
      if (!walletSignature) missing.push('walletSignature');
      if (!signerPublicKey) missing.push('signerPublicKey');
      if (!timestamp) missing.push('timestamp');
      if (missing.length > 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Missing required fields: ${missing.join(', ')}`,
          timestamp: new Date().toISOString(),
        });
      }

      if (typeof amount !== 'number' || isNaN(amount)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'amount must be a number',
          timestamp: new Date().toISOString(),
        });
      }

      const VALID_TOKENS = ['USDC', 'EURC', 'USDT', 'PYUSD'];
      if (!VALID_TOKENS.includes(tokenSymbol.toUpperCase())) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `tokenSymbol must be one of: ${VALID_TOKENS.join(', ')}`,
          timestamp: new Date().toISOString(),
        });
      }

      const service = getInstitutionTransferService();
      const result = await service.prepareTransfer(clientId, {
        fromAccountId,
        toAccountId,
        tokenSymbol,
        amount,
        walletSignature,
        signerPublicKey,
        timestamp,
        note,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as any)?.status || 500;
      logger.error('Transfer prepare failed', { error: message });
      res.status(status).json({
        error: status === 500 ? 'Internal Error' : 'Transfer Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/v1/institution/accounts/transfer/submit
 * After signing and submitting the transaction to Solana,
 * call this endpoint with the transferCode and txSignature to finalize.
 */
router.post(
  '/api/v1/institution/accounts/transfer/submit',
  strictRateLimiter,
  requireInstitutionOrAdminAuth,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    try {
      const clientId = req.institutionClient!.clientId;
      const { transferCode, txSignature } = req.body;

      if (!transferCode || !txSignature) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Missing required fields: transferCode, txSignature',
          timestamp: new Date().toISOString(),
        });
      }

      const service = getInstitutionTransferService();
      const result = await service.submitTransfer(clientId, { transferCode, txSignature });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as any)?.status || 500;
      logger.error('Transfer submit failed', { error: message });
      res.status(status).json({
        error: status === 500 ? 'Internal Error' : 'Transfer Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
