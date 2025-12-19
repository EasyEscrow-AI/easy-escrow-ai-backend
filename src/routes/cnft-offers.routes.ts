/**
 * cNFT Offer Escrow Routes
 *
 * RESTful API endpoints for creating and managing cNFT offers with SOL escrow.
 * Bidders can make offers on cNFTs with their SOL escrowed to a PDA.
 *
 * @see Task 6: Implement cNFT Offer System with SOL Escrow
 */

import { Router, Request, Response } from 'express';
import { standardRateLimiter, strictRateLimiter } from '../middleware';
import { requiredIdempotency } from '../middleware/idempotency.middleware';
import {
  CnftOfferEscrowManager,
  createCnftOfferEscrowManager,
  CreateOfferParams,
  OfferFilters,
} from '../services/cnftOfferEscrowManager';
import { createCnftService } from '../services/cnftService';
import { DirectBubblegumService } from '../services/directBubblegumService';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { prisma } from '../config/database';
import bs58 from 'bs58';

const router = Router();

// Initialize services
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Load platform admin keypair
const adminPrivateKey =
  process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY || process.env.MAINNET_PROD_ADMIN_PRIVATE_KEY;

if (!adminPrivateKey) {
  throw new Error(
    'Admin private key environment variable is required. ' +
      'Use DEVNET_STAGING_ADMIN_PRIVATE_KEY for staging or MAINNET_PROD_ADMIN_PRIVATE_KEY for production.'
  );
}

// Parse the admin private key
let platformAuthority: Keypair;
try {
  const secretKeyArray = JSON.parse(adminPrivateKey);
  platformAuthority = Keypair.fromSecretKey(Buffer.from(secretKeyArray));
} catch (jsonError) {
  try {
    const secretKeyBytes = bs58.decode(adminPrivateKey);
    platformAuthority = Keypair.fromSecretKey(secretKeyBytes);
  } catch (base58Error) {
    throw new Error(
      `Failed to load admin keypair. Invalid format. ` +
        `Expected either JSON array format or Base58 string format.`
    );
  }
}

// Get program ID
const programIdStr =
  process.env.ESCROW_PROGRAM_ID ||
  process.env.STAGING_PROGRAM_ID ||
  process.env.PRODUCTION_PROGRAM_ID;
if (!programIdStr) {
  throw new Error('Program ID environment variable is required.');
}
const programId = new PublicKey(programIdStr);

// Get fee collector address
const feeCollectorStr =
  process.env.DEVNET_STAGING_FEE_COLLECTOR_ADDRESS ||
  process.env.MAINNET_PROD_FEE_COLLECTOR_ADDRESS;
if (!feeCollectorStr) {
  throw new Error('Fee collector address environment variable is required.');
}
const feeCollector = new PublicKey(feeCollectorStr);

// Initialize cNFT service
const cnftService = createCnftService(connection);

// Initialize DirectBubblegumService
const directBubblegumService = new DirectBubblegumService(connection);

// Initialize offer escrow manager
const offerManager = createCnftOfferEscrowManager(
  connection,
  prisma,
  cnftService,
  directBubblegumService,
  programId,
  feeCollector
);

console.log('[CnftOfferRoutes] Initialized');
console.log('[CnftOfferRoutes] Program ID:', programId.toBase58());
console.log('[CnftOfferRoutes] Fee Collector:', feeCollector.toBase58());

/**
 * POST /api/cnft-offers
 * Create a new cNFT offer with SOL escrow
 */
router.post(
  '/api/cnft-offers',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { bidderWallet, targetAssetId, offerLamports, durationSeconds, feeBps } =
        req.body;
      // REMOVED: listingId - Easy Escrow is pure offer infrastructure

      // Validate required fields
      if (!bidderWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'bidderWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!targetAssetId) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'targetAssetId is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!offerLamports) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'offerLamports is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(bidderWallet);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid bidderWallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Parse offer amount
      let offerAmount: bigint;
      try {
        offerAmount = BigInt(offerLamports);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid offerLamports format - must be a valid integer',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Create offer
      const params: CreateOfferParams = {
        bidderWallet,
        targetAssetId,
        offerLamports: offerAmount,
        durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : undefined,
        feeBps: feeBps ? parseInt(feeBps, 10) : undefined,
        // REMOVED: listingId - Easy Escrow is pure offer infrastructure
      };

      const result = await offerManager.createOffer(params);

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] Create offer error:', error);
      res.status(error.message?.includes('not found') ? 404 : 422).json({
        success: false,
        error: 'Offer Creation Failed',
        message: error.message || 'Failed to create offer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/cnft-offers/:offerId/confirm
 * Confirm an offer after escrow transaction is confirmed on-chain
 */
router.post(
  '/api/cnft-offers/:offerId/confirm',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { offerId } = req.params;
      const { signature } = req.body;

      if (!signature) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'signature is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const offer = await offerManager.confirmOffer({ offerId, signature });

      res.status(200).json({
        success: true,
        data: {
          offer: {
            id: offer.id,
            offerId: offer.offerId,
            status: offer.status,
            escrowTxId: offer.escrowTxId,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] Confirm offer error:', error);
      res.status(error.message?.includes('not found') ? 404 : 422).json({
        success: false,
        error: 'Offer Confirmation Failed',
        message: error.message || 'Failed to confirm offer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/cnft-offers/:offerId/accept
 * Accept an offer (owner accepts, cNFT transfers to bidder, SOL to owner)
 */
router.post(
  '/api/cnft-offers/:offerId/accept',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { offerId } = req.params;
      const { ownerWallet } = req.body;

      if (!ownerWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'ownerWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(ownerWallet);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid ownerWallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await offerManager.acceptOffer({ offerId, ownerWallet });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] Accept offer error:', error);
      res.status(error.message?.includes('not found') ? 404 : 422).json({
        success: false,
        error: 'Offer Accept Failed',
        message: error.message || 'Failed to accept offer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/cnft-offers/:offerId/cancel
 * Cancel an offer (bidder cancels, SOL refunded)
 */
router.post(
  '/api/cnft-offers/:offerId/cancel',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { offerId } = req.params;
      const { bidderWallet } = req.body;

      if (!bidderWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'bidderWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(bidderWallet);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid bidderWallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await offerManager.cancelOffer({ offerId, bidderWallet });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] Cancel offer error:', error);
      res.status(error.message?.includes('not found') ? 404 : 422).json({
        success: false,
        error: 'Offer Cancel Failed',
        message: error.message || 'Failed to cancel offer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/cnft-offers/:offerId/reject
 * Reject an offer (owner rejects, SOL refunded to bidder)
 */
router.post(
  '/api/cnft-offers/:offerId/reject',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { offerId } = req.params;
      const { ownerWallet } = req.body;

      if (!ownerWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'ownerWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(ownerWallet);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid ownerWallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const offer = await offerManager.rejectOffer(offerId, ownerWallet);

      res.status(200).json({
        success: true,
        data: {
          offer: {
            id: offer.id,
            offerId: offer.offerId,
            status: offer.status,
            rejectedAt: offer.rejectedAt,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] Reject offer error:', error);
      res.status(error.message?.includes('not found') ? 404 : 422).json({
        success: false,
        error: 'Offer Reject Failed',
        message: error.message || 'Failed to reject offer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/cnft-offers/:offerId
 * Get a specific offer by ID
 */
router.get(
  '/api/cnft-offers/:offerId',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { offerId } = req.params;

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
          offer: {
            ...offer,
            offerLamports: offer.offerLamports.toString(),
            feeLamports: offer.feeLamports.toString(),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] Get offer error:', error);
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message: error.message || 'Failed to get offer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/cnft-offers
 * List offers with optional filters
 */
router.get(
  '/api/cnft-offers',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { bidderWallet, ownerWallet, targetAssetId, status, includeExpired, limit, offset } =
        req.query;
      // REMOVED: listingId - Easy Escrow is pure offer infrastructure

      const filters: OfferFilters = {};

      if (bidderWallet) filters.bidderWallet = bidderWallet as string;
      if (ownerWallet) filters.ownerWallet = ownerWallet as string;
      if (targetAssetId) filters.targetAssetId = targetAssetId as string;
      if (status) filters.status = status as any;
      // REMOVED: listingId filter
      if (includeExpired === 'true') filters.includeExpired = true;
      if (limit) filters.limit = parseInt(limit as string, 10);
      if (offset) filters.offset = parseInt(offset as string, 10);

      const { offers, total } = await offerManager.getOffers(filters);

      res.status(200).json({
        success: true,
        data: {
          offers: offers.map((o) => ({
            ...o,
            offerLamports: o.offerLamports.toString(),
            feeLamports: o.feeLamports.toString(),
          })),
          total,
          limit: filters.limit ?? 20,
          offset: filters.offset ?? 0,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] List offers error:', error);
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message: error.message || 'Failed to list offers',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/cnft-offers/asset/:assetId
 * Get all offers on a specific cNFT
 */
router.get(
  '/api/cnft-offers/asset/:assetId',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { assetId } = req.params;

      const offers = await offerManager.getOffersOnAsset(assetId);

      res.status(200).json({
        success: true,
        data: {
          offers: offers.map((o) => ({
            ...o,
            offerLamports: o.offerLamports.toString(),
            feeLamports: o.feeLamports.toString(),
          })),
          count: offers.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] Get asset offers error:', error);
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message: error.message || 'Failed to get asset offers',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/cnft-offers/bidder/:wallet
 * Get all offers made by a bidder
 */
router.get(
  '/api/cnft-offers/bidder/:wallet',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet } = req.params;

      // Validate wallet address
      try {
        new PublicKey(wallet);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const offers = await offerManager.getBidderOffers(wallet);

      res.status(200).json({
        success: true,
        data: {
          offers: offers.map((o) => ({
            ...o,
            offerLamports: o.offerLamports.toString(),
            feeLamports: o.feeLamports.toString(),
          })),
          count: offers.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] Get bidder offers error:', error);
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message: error.message || 'Failed to get bidder offers',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/cnft-offers/owner/:wallet
 * Get all offers received by an owner
 */
router.get(
  '/api/cnft-offers/owner/:wallet',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet } = req.params;

      // Validate wallet address
      try {
        new PublicKey(wallet);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const offers = await offerManager.getOwnerOffers(wallet);

      res.status(200).json({
        success: true,
        data: {
          offers: offers.map((o) => ({
            ...o,
            offerLamports: o.offerLamports.toString(),
            feeLamports: o.feeLamports.toString(),
          })),
          count: offers.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CnftOfferRoutes] Get owner offers error:', error);
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message: error.message || 'Failed to get owner offers',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
