/**
 * cNFT Listings Routes
 *
 * RESTful API endpoints for creating and managing cNFT listings with delegation.
 * Enables non-custodial marketplace listings where cNFTs remain in seller's wallet.
 *
 * @see docs/BUBBLEGUM_DELEGATION.md for architecture details
 */

import { Router, Request, Response } from 'express';
import { standardRateLimiter, strictRateLimiter } from '../middleware';
import { requiredIdempotency } from '../middleware/idempotency.middleware';
import { ListingManager, createListingManager } from '../services/listingManager';
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
        `Expected JSON array or Base58 string.`
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

const feeCollector = feeCollectorStr ? new PublicKey(feeCollectorStr) : undefined;

// Initialize listing manager with fee collector
const listingManager = createListingManager(connection, prisma, platformAuthority, programId, feeCollector);

/**
 * POST /api/listings
 * Create a new cNFT listing
 *
 * Request body:
 * - seller: string (wallet address)
 * - assetId: string (cNFT asset ID)
 * - priceLamports: string|number (price in lamports)
 * - durationSeconds?: number (listing duration, default 7 days)
 * - feeBps?: number (custom fee basis points, default 100 = 1%)
 *
 * Response:
 * - listing: Listing details
 * - transaction: Delegation transaction to sign
 * - fees: Fee breakdown
 */
router.post(
  '/api/listings',
  strictRateLimiter,
  requiredIdempotency, // Prevent duplicate listing creation
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { seller, assetId, priceLamports, durationSeconds, feeBps } = req.body;

      // Validate required fields
      if (!seller) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'seller is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!assetId) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'assetId is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!priceLamports) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'priceLamports is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(seller);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid seller wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Parse price
      let price: bigint;
      try {
        price = BigInt(priceLamports);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid priceLamports format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Create listing
      const result = await listingManager.createListing({
        seller,
        assetId,
        priceLamports: price,
        durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : undefined,
        feeBps: feeBps ? parseInt(feeBps, 10) : undefined,
      });

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error creating listing:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to create listing';

      // Handle validation errors
      if (
        errorMessage.includes('does not own') ||
        errorMessage.includes('already has an active listing') ||
        errorMessage.includes('already delegated')
      ) {
        res.status(422).json({
          success: false,
          error: 'Validation Error',
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
 * POST /api/listings/:id/confirm
 * Confirm a listing after delegation transaction is confirmed
 *
 * Request body:
 * - signature: string (delegation transaction signature)
 */
router.post(
  '/api/listings/:id/confirm',
  standardRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const listingId = req.params.id;
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

      const listing = await listingManager.confirmListing({
        listingId,
        signature,
      });

      res.status(200).json({
        success: true,
        data: {
          listing: {
            id: listing.id,
            listingId: listing.listingId,
            status: listing.status,
            delegationStatus: listing.delegationStatus,
            delegatedAt: listing.delegatedAt?.toISOString(),
            delegateTxId: listing.delegateTxId,
          },
          message: 'Listing confirmed and now active',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error confirming listing:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to confirm listing';

      if (errorMessage.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        errorMessage.includes('not pending') ||
        errorMessage.includes('not delegated') ||
        errorMessage.includes('failed')
      ) {
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
 * POST /api/listings/:id/cancel
 * Cancel a listing
 *
 * Request body:
 * - seller: string (must match listing seller)
 *
 * Response includes revoke transaction if delegation is active
 */
router.post(
  '/api/listings/:id/cancel',
  standardRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const listingId = req.params.id;
      const { seller } = req.body;

      if (!seller) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'seller is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await listingManager.cancelListing({
        listingId,
        seller,
      });

      res.status(200).json({
        success: true,
        data: {
          listing: result.listing,
          transaction: result.transaction || null,
          message: result.transaction
            ? 'Listing cancelled. Sign the revoke transaction to complete.'
            : 'Listing cancelled.',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error cancelling listing:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel listing';

      if (errorMessage.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (errorMessage.includes('Only the seller')) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (errorMessage.includes('cannot be cancelled')) {
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
 * POST /api/listings/:id/confirm-revoke
 * Confirm revoke transaction after cancellation
 *
 * Request body:
 * - signature: string (revoke transaction signature)
 */
router.post(
  '/api/listings/:id/confirm-revoke',
  standardRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const listingId = req.params.id;
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

      const listing = await listingManager.confirmRevoke(listingId, signature);

      res.status(200).json({
        success: true,
        data: {
          listing: {
            id: listing.id,
            listingId: listing.listingId,
            status: listing.status,
            delegationStatus: listing.delegationStatus,
            revokeTxId: listing.revokeTxId,
          },
          message: 'Delegation revoked successfully',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error confirming revoke:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to confirm revoke';

      if (errorMessage.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (errorMessage.includes('not cancelled') || errorMessage.includes('still delegated')) {
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
 * GET /api/listings/:id
 * Get a listing by ID
 */
router.get(
  '/api/listings/:id',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const listingId = req.params.id;

      const listing = await listingManager.getListing(listingId);

      if (!listing) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Listing ${listingId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          listing: {
            id: listing.id,
            listingId: listing.listingId,
            seller: listing.seller,
            assetId: listing.assetId,
            merkleTree: listing.merkleTree,
            priceLamports: listing.priceLamports.toString(),
            status: listing.status,
            delegationStatus: listing.delegationStatus,
            delegatePda: listing.delegatePda,
            delegatedAt: listing.delegatedAt?.toISOString(),
            expiresAt: listing.expiresAt.toISOString(),
            feeBps: listing.feeBps,
            buyer: listing.buyer,
            soldAt: listing.soldAt?.toISOString(),
            createdAt: listing.createdAt.toISOString(),
            metadata: listing.metadata,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error getting listing:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to get listing',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/listings
 * Get listings with optional filters
 *
 * Query params:
 * - seller: Filter by seller wallet
 * - status: Filter by status (PENDING, ACTIVE, SOLD, CANCELLED, EXPIRED)
 * - delegationStatus: Filter by delegation status
 * - includeExpired: Include expired listings (default: false)
 * - limit: Number of results (default: 20)
 * - offset: Pagination offset (default: 0)
 */
router.get(
  '/api/listings',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { seller, status, delegationStatus, includeExpired, limit, offset } = req.query;

      const result = await listingManager.getListings({
        seller: seller as string | undefined,
        status: status as any,
        delegationStatus: delegationStatus as any,
        includeExpired: includeExpired === 'true',
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.status(200).json({
        success: true,
        data: {
          listings: result.listings.map((listing) => ({
            id: listing.id,
            listingId: listing.listingId,
            seller: listing.seller,
            assetId: listing.assetId,
            priceLamports: listing.priceLamports.toString(),
            status: listing.status,
            delegationStatus: listing.delegationStatus,
            expiresAt: listing.expiresAt.toISOString(),
            createdAt: listing.createdAt.toISOString(),
            metadata: listing.metadata,
          })),
          total: result.total,
          limit: limit ? parseInt(limit as string, 10) : 20,
          offset: offset ? parseInt(offset as string, 10) : 0,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error listing listings:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to list listings',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/listings/seller/:wallet
 * Get active listings for a specific seller
 */
router.get(
  '/api/listings/seller/:wallet',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const seller = req.params.wallet;

      // Validate wallet
      try {
        new PublicKey(seller);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const listings = await listingManager.getSellerListings(seller);

      res.status(200).json({
        success: true,
        data: {
          listings: listings.map((listing) => ({
            id: listing.id,
            listingId: listing.listingId,
            assetId: listing.assetId,
            priceLamports: listing.priceLamports.toString(),
            status: listing.status,
            delegationStatus: listing.delegationStatus,
            expiresAt: listing.expiresAt.toISOString(),
            createdAt: listing.createdAt.toISOString(),
            metadata: listing.metadata,
          })),
          total: listings.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error getting seller listings:', error);

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to get seller listings',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/listings/:id/buy
 * Buy a listed cNFT (Task 5 - Primary)
 *
 * Builds an atomic transaction that:
 * 1. Transfers SOL from buyer to seller (price - fee)
 * 2. Transfers platform fee to fee collector
 * 3. Transfers cNFT from seller to buyer via marketplace delegate
 *
 * Request body:
 * - buyer: string (buyer wallet address)
 *
 * Response:
 * - listing: Listing details
 * - transaction: Buy transaction to sign
 * - costs: Cost breakdown
 */
router.post(
  '/api/listings/:id/buy',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const listingId = req.params.id;
      const { buyer } = req.body;

      if (!buyer) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'buyer is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(buyer);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid buyer wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await listingManager.buyListing({
        listingId,
        buyer,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error building buy transaction:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to build buy transaction';

      // Handle specific errors
      if (errorMessage.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        errorMessage.includes('expected ACTIVE') ||
        errorMessage.includes('expired') ||
        errorMessage.includes('revoked') ||
        errorMessage.includes('no longer owns') ||
        errorMessage.includes('Buyer cannot be')
      ) {
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
 * POST /api/listings/:id/confirm-purchase
 * Confirm a purchase after buyer has signed and submitted the transaction
 *
 * Request body:
 * - signature: string (transaction signature)
 * - buyer: string (buyer wallet address)
 */
router.post(
  '/api/listings/:id/confirm-purchase',
  standardRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const listingId = req.params.id;
      const { signature, buyer } = req.body;

      if (!signature) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'signature is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!buyer) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'buyer is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const listing = await listingManager.confirmPurchase({
        listingId,
        signature,
        buyer,
      });

      res.status(200).json({
        success: true,
        data: {
          listing: {
            id: listing.id,
            listingId: listing.listingId,
            status: listing.status,
            buyer: listing.buyer,
            soldAt: listing.soldAt?.toISOString(),
            settleTxId: listing.settleTxId,
          },
          message: 'Purchase confirmed. The cNFT is now in your wallet!',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error confirming purchase:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to confirm purchase';

      if (errorMessage.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        errorMessage.includes('expected ACTIVE') ||
        errorMessage.includes('still owned by')
      ) {
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
 * GET /api/listings/delegate-authority
 * Get the delegate authority public key for cNFT delegation
 * Note: This is the platform authority keypair's public key, not a PDA
 */
router.get(
  '/api/listings/delegate-authority',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const delegateAuthority = listingManager.getDelegateAuthority().toBase58();
    res.status(200).json({
      success: true,
      data: {
        delegateAuthority,
        // Keep for backwards compatibility
        marketplacePda: delegateAuthority,
        programId: programId.toBase58(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);

export default router;
export { listingManager };
