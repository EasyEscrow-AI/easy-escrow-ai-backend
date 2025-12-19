/**
 * Unified Swaps Routes
 *
 * RESTful API endpoints for the unified /api/swaps/* structure.
 * Consolidates offers and listings into a single API where listings
 * are a type of offer.
 *
 * @see Plan: C:\Users\samde\.claude\plans\reflective-juggling-squid.md
 * @see Tasks 9-12: API Restructuring
 */

import { Router, Request, Response } from 'express';
import { standardRateLimiter, strictRateLimiter, validateZeroFeeApiKey } from '../middleware';
import { requiredIdempotency } from '../middleware/idempotency.middleware';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { prisma } from '../config/database';
import bs58 from 'bs58';

// Services
import {
  UnifiedOfferService,
  createUnifiedOfferService,
} from '../services/unifiedOfferService';
import { OfferManager, createOfferManager } from '../services/offerManager';
import { ListingManager, createListingManager } from '../services/listingManager';
import {
  CnftOfferEscrowManager,
  createCnftOfferEscrowManager,
} from '../services/cnftOfferEscrowManager';
import { NoncePoolManager } from '../services/noncePoolManager';
import { FeeCalculator } from '../services/feeCalculator';
import { AssetValidator } from '../services/assetValidator';
import { TransactionBuilder } from '../services/transactionBuilder';
import { createCnftService } from '../services/cnftService';
import { DirectBubblegumService } from '../services/directBubblegumService';

// Types
import {
  UnifiedOfferFilters,
  UnifiedOfferType,
} from '../types/unified-offer.types';
import {
  normalizeOfferRequest,
  validateUnifiedRequest,
  getOfferTypeDescription,
} from '../utils/unifiedOfferNormalizer';

const router = Router();

// =============================================================================
// Service Initialization
// =============================================================================

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Load platform admin keypair
const adminPrivateKey =
  process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY ||
  process.env.MAINNET_PROD_ADMIN_PRIVATE_KEY;

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
} catch {
  try {
    const secretKey = bs58.decode(adminPrivateKey);
    platformAuthority = Keypair.fromSecretKey(secretKey);
  } catch {
    throw new Error(
      'Failed to parse admin private key. Expected JSON array [1,2,3,...] or base58 string.'
    );
  }
}

const programId = new PublicKey(
  process.env.ESCROW_PROGRAM_ID || 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei'
);

// Fee collector
const feeCollectorStr =
  process.env.FEE_COLLECTOR_ADDRESS || 'BjqwqoGpfDxcNfPgUKT73D2zKgHu4TfZMBgRHeyVe1VL';
const feeCollector = new PublicKey(feeCollectorStr);

// Treasury PDA (derived from program)
const [treasuryPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('treasury')],
  programId
);

// Initialize core services
const noncePoolManager = new NoncePoolManager(connection, prisma, platformAuthority);
const feeCalculator = new FeeCalculator();
const assetValidator = new AssetValidator(connection);
const transactionBuilder = new TransactionBuilder(connection, platformAuthority, treasuryPDA);

// Initialize managers (will be created lazily)
let offerManager: OfferManager | null = null;
let listingManager: ListingManager | null = null;
let cnftBidManager: CnftOfferEscrowManager | null = null;
let unifiedService: UnifiedOfferService | null = null;

/**
 * Get or create the unified offer service
 */
async function getUnifiedService(): Promise<UnifiedOfferService> {
  if (unifiedService) return unifiedService;

  // Create offer manager
  if (!offerManager) {
    offerManager = createOfferManager(
      connection,
      prisma,
      noncePoolManager,
      feeCalculator,
      assetValidator,
      transactionBuilder,
      platformAuthority,
      treasuryPDA,
      programId
    );
  }

  // Create listing manager
  if (!listingManager) {
    listingManager = createListingManager(
      connection,
      prisma,
      platformAuthority,
      programId,
      feeCollector
    );
  }

  // Create cNFT bid manager
  if (!cnftBidManager) {
    const cnftService = createCnftService(connection);
    const bubblegumService = new DirectBubblegumService(connection);
    cnftBidManager = createCnftOfferEscrowManager(
      connection,
      prisma,
      cnftService,
      bubblegumService,
      programId,
      feeCollector
    );
  }

  // Create unified service
  unifiedService = createUnifiedOfferService(
    connection,
    prisma,
    offerManager,
    listingManager,
    cnftBidManager
  );

  return unifiedService;
}

// =============================================================================
// Offer Endpoints - /api/swaps/offers/*
// =============================================================================

/**
 * POST /api/swaps/offers
 * Create a new offer (auto-detects type: listing, bid, atomic, bulk)
 */
router.post(
  '/api/swaps/offers',
  strictRateLimiter,
  validateZeroFeeApiKey,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request
      const validation = validateUnifiedRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: validation.errors.map((e) => e.message).join('; '),
          details: validation.errors,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const service = await getUnifiedService();
      const result = await service.createOffer(req.body);

      // Log the detected type
      console.log(
        `[Swaps Route] Created offer type: ${result.offer.offerType} (${getOfferTypeDescription(result.offer.offerType as any)})`
      );

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Swaps Route] Create offer error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create offer';
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/swaps/offers
 * List offers with optional filters
 */
router.get(
  '/api/swaps/offers',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filters: UnifiedOfferFilters = {
        type: req.query.type as UnifiedOfferType | undefined,
        status: req.query.status as any,
        maker: req.query.maker as string | undefined,
        taker: req.query.taker as string | undefined,
        wallet: req.query.wallet as string | undefined,
        assetId: req.query.assetId as string | undefined,
        includeExpired: req.query.includeExpired === 'true',
        sortBy: req.query.sortBy as 'createdAt' | 'expiresAt' | 'price' | undefined,
        sortOrder: req.query.sortOrder as 'asc' | 'desc' | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const service = await getUnifiedService();
      const result = await service.listOffers(filters);

      res.status(200).json(result);
    } catch (error) {
      console.error('[Swaps Route] List offers error:', error);
      const message = error instanceof Error ? error.message : 'Failed to list offers';
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/swaps/offers/:id
 * Get a single offer by ID
 */
router.get(
  '/api/swaps/offers/:id',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const service = await getUnifiedService();
      const offer = await service.getOffer(id);

      if (!offer) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Offer not found: ${id}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: { offer },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Swaps Route] Get offer error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get offer';
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/swaps/offers/:id/accept
 * Accept an offer (handles all types: listing buy, bid accept, swap accept)
 */
router.post(
  '/api/swaps/offers/:id/accept',
  strictRateLimiter,
  validateZeroFeeApiKey,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { wallet } = req.body;

      if (!wallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'wallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const service = await getUnifiedService();
      const result = await service.acceptOffer({ offerId: id, wallet });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Swaps Route] Accept offer error:', error);
      const message = error instanceof Error ? error.message : 'Failed to accept offer';
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/swaps/offers/:id/cancel
 * Cancel an offer
 */
router.post(
  '/api/swaps/offers/:id/cancel',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { wallet, isAdmin } = req.body;

      if (!wallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'wallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const service = await getUnifiedService();
      const result = await service.cancelOffer({
        offerId: id,
        wallet,
        isAdmin: isAdmin === true,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Swaps Route] Cancel offer error:', error);
      const message = error instanceof Error ? error.message : 'Failed to cancel offer';
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// =============================================================================
// Delegation Endpoints - /api/swaps/delegations/*
// =============================================================================

/**
 * GET /api/swaps/delegations/authority
 * Get the delegate authority public key
 */
router.get(
  '/api/swaps/delegations/authority',
  standardRateLimiter,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json({
        success: true,
        data: {
          delegateAuthority: platformAuthority.publicKey.toBase58(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Swaps Route] Get delegate authority error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get delegate authority';
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/swaps/delegations/:offerId/confirm
 * Confirm delegation for a listing
 */
router.post(
  '/api/swaps/delegations/:offerId/confirm',
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

      const service = await getUnifiedService();
      const offer = await service.confirmDelegation(offerId, signature);

      res.status(200).json({
        success: true,
        data: { offer },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Swaps Route] Confirm delegation error:', error);
      const message = error instanceof Error ? error.message : 'Failed to confirm delegation';
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/swaps/delegations/:offerId/revoke
 * Revoke delegation (cancel listing)
 */
router.post(
  '/api/swaps/delegations/:offerId/revoke',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { offerId } = req.params;
      const { seller } = req.body;

      if (!seller) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'seller wallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const service = await getUnifiedService();
      const result = await service.revokeDelegation(offerId, seller);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Swaps Route] Revoke delegation error:', error);
      const message = error instanceof Error ? error.message : 'Failed to revoke delegation';
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/swaps/delegations/:offerId/confirm-revoke
 * Confirm revocation after transaction is signed
 */
router.post(
  '/api/swaps/delegations/:offerId/confirm-revoke',
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

      const service = await getUnifiedService();
      const offer = await service.confirmRevocation(offerId, signature);

      res.status(200).json({
        success: true,
        data: { offer },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Swaps Route] Confirm revocation error:', error);
      const message = error instanceof Error ? error.message : 'Failed to confirm revocation';
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
