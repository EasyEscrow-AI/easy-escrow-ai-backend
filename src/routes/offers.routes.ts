/**
 * Atomic Swap Offers Routes
 * 
 * RESTful API endpoints for creating, managing, and executing atomic swap offers.
 * Supports NFT↔NFT, NFT↔SOL, and cNFT swaps with durable nonce-based transactions.
 */

import { Router, Request, Response } from 'express';
import { standardRateLimiter, strictRateLimiter } from '../middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { OfferManager } from '../services/offerManager';
import { NoncePoolManager } from '../services/noncePoolManager';
import { FeeCalculator } from '../services/feeCalculator';
import { AssetValidator } from '../services/assetValidator';
import { TransactionBuilder } from '../services/transactionBuilder';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { prisma } from '../config/database';
import bs58 from 'bs58';

const router = Router();

// Initialize services
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Load platform admin keypair for runtime operations (NOT the deployer/upgrade authority!)
// This should be DEVNET_STAGING_ADMIN_PRIVATE_KEY or MAINNET_PROD_ADMIN_PRIVATE_KEY
const adminPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY || 
                        process.env.MAINNET_PROD_ADMIN_PRIVATE_KEY;

if (!adminPrivateKey) {
  throw new Error(
    'Admin private key environment variable is required. ' +
    'Use DEVNET_STAGING_ADMIN_PRIVATE_KEY for staging or MAINNET_PROD_ADMIN_PRIVATE_KEY for production. ' +
    'DO NOT use PLATFORM_AUTHORITY_PRIVATE_KEY (that is the deployer/upgrade authority and should never be on the server).'
  );
}

// Parse the admin private key - supports both JSON array and base58 formats
let platformAuthority: Keypair;
try {
  // Try JSON array format first: [1,2,3,...]
  const secretKeyArray = JSON.parse(adminPrivateKey);
  platformAuthority = Keypair.fromSecretKey(Buffer.from(secretKeyArray));
} catch (jsonError) {
  // If JSON parsing fails, try base58 format
  try {
    const secretKeyBytes = bs58.decode(adminPrivateKey);
    platformAuthority = Keypair.fromSecretKey(secretKeyBytes);
  } catch (base58Error) {
    throw new Error(
      `Failed to load admin keypair. Invalid format. ` +
      `Expected either:\n` +
      `1. JSON array format: [1,2,3,...] (from keypair file)\n` +
      `2. Base58 string format (from 'solana-keygen' output)\n` +
      `JSON parse error: ${jsonError}\n` +
      `Base58 decode error: ${base58Error}`
    );
  }
}

// Initialize core services
const noncePoolManager = new NoncePoolManager(connection, prisma, platformAuthority);
const feeCalculator = new FeeCalculator();
const assetValidator = new AssetValidator(connection, {
  heliusApiKey: process.env.HELIUS_API_KEY || '',
});

// Get program ID based on environment
const programIdStr = process.env.ESCROW_PROGRAM_ID || 
                      process.env.STAGING_PROGRAM_ID || 
                      process.env.PRODUCTION_PROGRAM_ID;
if (!programIdStr) {
  throw new Error(
    'Program ID environment variable is required. ' +
    'Use ESCROW_PROGRAM_ID (recommended), STAGING_PROGRAM_ID, or PRODUCTION_PROGRAM_ID.'
  );
}
const programId = new PublicKey(programIdStr);

// Get fee collector address (we send fees directly to a wallet, not a treasury PDA)
const feeCollectorStr = process.env.DEVNET_STAGING_FEE_COLLECTOR_ADDRESS ||
                        process.env.MAINNET_PROD_FEE_COLLECTOR_ADDRESS;
if (!feeCollectorStr) {
  throw new Error(
    'Fee collector address environment variable is required. ' +
    'Use DEVNET_STAGING_FEE_COLLECTOR_ADDRESS for staging or MAINNET_PROD_FEE_COLLECTOR_ADDRESS for production.'
  );
}
const feeCollector = new PublicKey(feeCollectorStr);

const transactionBuilder = new TransactionBuilder(
  connection,
  platformAuthority
);

const offerManager = new OfferManager(
  connection,
  prisma,
  noncePoolManager,
  feeCalculator,
  assetValidator,
  transactionBuilder,
  platformAuthority,
  feeCollector,
  programId
);

// Initialize nonce pool on startup
noncePoolManager.initialize().catch((error) => {
  console.error('Failed to initialize nonce pool:', error);
});

/**
 * POST /api/offers
 * Create a new swap offer (direct or open)
 */
router.post(
  '/api/offers',
  strictRateLimiter,
  idempotencyMiddleware, // Prevent duplicate offer creation on retry
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        makerWallet,
        takerWallet,
        offeredAssets,
        requestedAssets,
        offeredSol,
        requestedSol,
        customFee,
      } = req.body;

      // Validate required fields
      if (!makerWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'makerWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet addresses
      try {
        new PublicKey(makerWallet);
        if (takerWallet) {
          new PublicKey(takerWallet);
        }
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate arrays
      if (!Array.isArray(offeredAssets) || !Array.isArray(requestedAssets)) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'offeredAssets and requestedAssets must be arrays',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Create offer
      const offer = await offerManager.createOffer({
        makerWallet,
        takerWallet: takerWallet || undefined,
        offeredAssets,
        requestedAssets,
        offeredSol: offeredSol ? BigInt(offeredSol) : undefined,
        requestedSol: requestedSol ? BigInt(requestedSol) : undefined,
        customFee: customFee ? BigInt(customFee) : undefined,
      });

      res.status(201).json({
        success: true,
        data: {
          ...offer,
          platformFee: {
            ...offer.platformFee,
            feeLamports: offer.platformFee.feeLamports.toString(),
            totalSwapValueLamports: offer.platformFee.totalSwapValueLamports.toString(),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error creating offer:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to create offer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers
 * List swap offers with optional filters
 */
router.get(
  '/api/offers',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        status,
        makerWallet,
        takerWallet,
        limit = '10',
        offset = '0',
      } = req.query;

      const result = await offerManager.listOffers({
        status: status as any,
        makerWallet: makerWallet as string | undefined,
        takerWallet: takerWallet as string | undefined,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });

      res.status(200).json({
        success: true,
        data: {
          offers: result.offers.map((offer) => ({
            ...offer,
            platformFee: {
              ...offer.platformFee,
              feeLamports: offer.platformFee.feeLamports.toString(),
              totalSwapValueLamports: offer.platformFee.totalSwapValueLamports.toString(),
            },
          })),
          total: result.total,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error listing offers:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to list offers',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers/:id
 * Get detailed information about a specific offer
 */
router.get(
  '/api/offers/:id',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const offerId = parseInt(req.params.id, 10);

      if (isNaN(offerId)) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid offer ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const offer = await offerManager.getOffer(offerId);

      if (!offer) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Offer ${offerId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          ...offer,
          platformFee: {
            ...offer.platformFee,
            feeLamports: offer.platformFee.feeLamports.toString(),
            totalSwapValueLamports: offer.platformFee.totalSwapValueLamports.toString(),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error getting offer:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to get offer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/:id/counter
 * Create a counter-offer for an existing offer
 */
router.post(
  '/api/offers/:id/counter',
  strictRateLimiter,
  idempotencyMiddleware, // Prevent duplicate counter-offer creation on retry
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parentOfferId = parseInt(req.params.id, 10);
      const { counterMakerWallet } = req.body;

      if (isNaN(parentOfferId)) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid offer ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!counterMakerWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'counterMakerWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(counterMakerWallet);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check if parent offer exists
      const parentOffer = await offerManager.getOffer(parentOfferId);
      if (!parentOffer) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Parent offer ${parentOfferId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const counterOffer = await offerManager.createCounterOffer({
        parentOfferId,
        counterMakerWallet,
      });

      res.status(201).json({
        success: true,
        data: {
          ...counterOffer,
          platformFee: {
            ...counterOffer.platformFee,
            feeLamports: counterOffer.platformFee.feeLamports.toString(),
            totalSwapValueLamports: counterOffer.platformFee.totalSwapValueLamports.toString(),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error creating counter-offer:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to create counter-offer';

      // Check for specific error types
      if (errorMessage.includes('not active')) {
        res.status(400).json({
          success: false,
          error: 'Invalid Request',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/:id/accept
 * Accept an offer and receive the serialized transaction to sign
 */
router.post(
  '/api/offers/:id/accept',
  standardRateLimiter,
  idempotencyMiddleware, // CRITICAL: Prevent duplicate nonce consumption on retry
  async (req: Request, res: Response): Promise<void> => {
    try {
      const offerId = parseInt(req.params.id, 10);
      const { takerWallet } = req.body;

      if (isNaN(offerId)) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid offer ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!takerWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'takerWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(takerWallet);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await offerManager.acceptOffer(offerId, takerWallet);

      res.status(200).json({
        success: true,
        data: {
          serializedTransaction: result.serializedTransaction,
          message: 'Sign this transaction with your wallet and submit it to the network. Then call /api/offers/:id/confirm with the transaction signature.',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error accepting offer:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to accept offer';

      // Check for authorization errors
      if (errorMessage.includes('designated taker') || errorMessage.includes('Only')) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check for not found or invalid state errors
      if (errorMessage.includes('not found') || errorMessage.includes('not active') || errorMessage.includes('expired')) {
        res.status(400).json({
          success: false,
          error: 'Invalid Request',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/:id/cancel
 * Cancel an active offer (advances nonce to invalidate transaction)
 */
router.post(
  '/api/offers/:id/cancel',
  standardRateLimiter,
  idempotencyMiddleware, // CRITICAL: Prevent multiple nonce advances on retry
  async (req: Request, res: Response): Promise<void> => {
    try {
      const offerId = parseInt(req.params.id, 10);
      const { walletAddress } = req.body;

      if (isNaN(offerId)) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid offer ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'walletAddress is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await offerManager.cancelOffer(offerId, walletAddress);

      res.status(200).json({
        success: true,
        data: {
          message: `Offer ${offerId} cancelled successfully`,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error cancelling offer:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel offer';

      // Check for authorization errors
      if (errorMessage.includes('Only maker')) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check for invalid state errors
      if (errorMessage.includes('not active')) {
        res.status(400).json({
          success: false,
          error: 'Invalid Request',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/:id/confirm
 * Confirm that a swap transaction was successfully executed on-chain
 */
router.post(
  '/api/offers/:id/confirm',
  standardRateLimiter,
  idempotencyMiddleware, // CRITICAL: Prevent double-marking offer as FILLED on retry
  async (req: Request, res: Response): Promise<void> => {
    try {
      const offerId = parseInt(req.params.id, 10);
      const { signature } = req.body;

      if (isNaN(offerId)) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid offer ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!signature || typeof signature !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Valid transaction signature is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check if offer exists
      const offer = await offerManager.getOffer(offerId);
      if (!offer) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Offer ${offerId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await offerManager.confirmSwap({
        offerId,
        signature,
      });

      res.status(200).json({
        success: true,
        data: {
          message: `Swap confirmed successfully`,
          signature,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error confirming swap:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to confirm swap';

      // Check for transaction errors
      if (errorMessage.includes('Transaction failed') || errorMessage.includes('not found')) {
        res.status(400).json({
          success: false,
          error: 'Transaction Error',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;

