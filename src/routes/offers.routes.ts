/**
 * Atomic Swap Offers Routes
 * 
 * RESTful API endpoints for creating, managing, and executing atomic swap offers.
 * Supports NFT↔NFT, NFT↔SOL, and cNFT swaps with durable nonce-based transactions.
 */

import { Router, Request, Response } from 'express';
import { standardRateLimiter, strictRateLimiter, validateZeroFeeApiKey, ZeroFeeAuthorizedRequest } from '../middleware';
import { requiredIdempotency } from '../middleware/idempotency.middleware';
import { AssetType } from '../services/assetValidator';
import { OfferManager } from '../services/offerManager';
import { NoncePoolManager } from '../services/noncePoolManager';
import { FeeCalculator } from '../services/feeCalculator';
import { AssetValidator } from '../services/assetValidator';
import { TransactionBuilder } from '../services/transactionBuilder';
import { HealthCheckService } from '../services/health-check.service';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { prisma, checkDatabaseHealth } from '../config/database';
import { checkRedisHealth } from '../config/redis';
import { getIdempotencyService } from '../services';
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

// Derive Treasury PDA (114-byte structure with locked withdrawals)
// Must be derived before creating TransactionBuilder so ALT can be configured
const [treasuryPDA, treasuryBump] = PublicKey.findProgramAddressSync(
  [Buffer.from('main_treasury'), platformAuthority.publicKey.toBuffer()],
  programId
);
console.log('[OffersRoutes] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('[OffersRoutes] Treasury PDA Derivation:');
console.log('[OffersRoutes]   Seeds: main_treasury');
console.log('[OffersRoutes]   Authority:', platformAuthority.publicKey.toBase58());
console.log('[OffersRoutes]   Program ID:', programId.toBase58());
console.log('[OffersRoutes]   Treasury PDA:', treasuryPDA.toBase58());
console.log('[OffersRoutes]   Bump:', treasuryBump);
console.log('[OffersRoutes] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Create transaction builder with ALT support
const transactionBuilder = new TransactionBuilder(
  connection,
  platformAuthority,
  treasuryPDA // Pass treasury PDA to enable ALT service
);

const offerManager = new OfferManager(
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

// Initialize health check service
const healthCheckService = new HealthCheckService(
  connection,
  noncePoolManager,
  getIdempotencyService(),
  checkDatabaseHealth,
  checkRedisHealth,
  programId,
  platformAuthority.publicKey,
  {
    cacheTTL: 30, // 30 seconds
    feePayerMinBalance: 1_000_000_000, // 1 SOL (admin wallet that pays for all transactions)
    rpcTimeout: 5000, // 5 seconds
    rpcSlowThreshold: 2000, // 2 seconds
  }
);

// Initialize nonce pool on startup
noncePoolManager.initialize().catch((error) => {
  console.error('[NoncePoolManager] Failed to initialize nonce pool:', error);
  console.error('[NoncePoolManager] Atomic swap features will be unavailable');
});

/**
 * POST /api/offers
 * Create a new swap offer (direct or open)
 */
router.post(
  '/api/offers',
  strictRateLimiter,
  validateZeroFeeApiKey, // Check for zero-fee authorization
  requiredIdempotency, // Prevent duplicate offer creation on retry
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

      // Validate mint addresses before transformation
      const validateMintAddresses = (assets: any[], arrayName: string) => {
        assets.forEach((asset, index) => {
          if (!asset.mint) {
            throw new Error(`Asset ${index} in ${arrayName} is missing 'mint' field`);
          }
          
          // Validate that mint is a valid Solana address format
          try {
            new PublicKey(asset.mint);
          } catch (error) {
            throw new Error(`Invalid mint address format in ${arrayName}[${index}]: ${asset.mint}`);
          }
        });
      };
      
      // Validate mint addresses early
      validateMintAddresses(offeredAssets, 'offeredAssets');
      validateMintAddresses(requestedAssets, 'requestedAssets');
      
      // Zero-fee authorization check
      const zeroFeeRequest = req as ZeroFeeAuthorizedRequest;
      const requestsZeroFee = customFee !== undefined && BigInt(customFee) === BigInt(0);
      
      if (requestsZeroFee && !zeroFeeRequest.isZeroFeeAuthorized) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Zero-fee swaps require valid API key authorization',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      
      // Transform asset format from API format to internal format
      // API format: { mint, isCompressed, isCoreNft?, merkleTree?, amount?, assetType? }
      // Internal format: { identifier, type }
      const transformAssets = (assets: any[], arrayName: string) => {
        return assets.map((asset, index) => {
          console.log(`[Offers Route] Transforming ${arrayName}[${index}]:`, JSON.stringify(asset));
          
          // EXPLICIT DEBUG: Log isCoreNft flag type and value
          console.log(`[Offers Route] ${arrayName}[${index}] isCoreNft debug:`, {
            rawValue: asset.isCoreNft,
            typeOf: typeof asset.isCoreNft,
            isTruthy: !!asset.isCoreNft,
            isCompressed: asset.isCompressed,
          });
          
          if (!asset.mint) {
            console.error(`[Offers Route] Missing mint in ${arrayName}[${index}]:`, asset);
            throw new Error(`Asset ${index} in ${arrayName} is missing 'mint' field`);
          }
          
          // Determine asset type: Core NFT > cNFT > SPL NFT
          let assetType = AssetType.NFT;
          if (asset.isCoreNft) {
            assetType = AssetType.CORE_NFT;
            console.log(`[Offers Route] *** ${arrayName}[${index}] detected as CORE NFT ***`);
          } else if (asset.isCompressed) {
            assetType = AssetType.CNFT;
            console.log(`[Offers Route] *** ${arrayName}[${index}] detected as CNFT ***`);
          } else {
            console.log(`[Offers Route] *** ${arrayName}[${index}] detected as SPL NFT ***`);
          }
          
          const transformed = {
            identifier: asset.mint,
            type: assetType,
          };
          
          console.log(`[Offers Route] Transformed to:`, JSON.stringify(transformed));
          console.log(`[Offers Route] AssetType.CORE_NFT value:`, AssetType.CORE_NFT);
          return transformed;
        });
      };

      const transformedOfferedAssets = transformAssets(offeredAssets, 'offeredAssets');
      const transformedRequestedAssets = transformAssets(requestedAssets, 'requestedAssets');

      // Create offer
      const offer = await offerManager.createOffer({
        makerWallet,
        takerWallet: takerWallet || undefined,
        offeredAssets: transformedOfferedAssets,
        requestedAssets: transformedRequestedAssets,
        offeredSol: offeredSol ? BigInt(offeredSol) : undefined,
        requestedSol: requestedSol ? BigInt(requestedSol) : undefined,
        customFee: customFee ? BigInt(customFee) : undefined,
      });

      res.status(201).json({
        success: true,
        data: {
          offer: {
            id: offer.id.toString(),
            status: offer.status,
            makerWallet: offer.makerWallet,
            takerWallet: offer.takerWallet || null,
            offeredAssets: offer.offeredAssets,
            requestedAssets: offer.requestedAssets,
            offeredSol: offeredSol?.toString() || '0',
            requestedSol: requestedSol?.toString() || '0',
            createdAt: offer.createdAt.toISOString(),
          },
          // Transaction will be built when offer is accepted (needs both signatures)
          transaction: {
            nonceAccount: offer.nonceAccount,
            message: 'Transaction will be built when offer is accepted',
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error creating offer:', error);

      // Handle validation errors with 422 status
      const errorMessage = error instanceof Error ? error.message : 'Failed to create offer';
      
      // Check if this is a validation error based on specific patterns
      // Use precise matching to avoid misclassifying server/infrastructure errors
      const isValidationError = 
        // Asset ownership validation
        errorMessage.includes('does not own') ||
        // On-chain asset validation
        errorMessage.includes('not found on-chain') ||
        // Mint address validation (be specific to avoid "Failed to mint transaction")
        errorMessage.includes('Invalid mint address') ||
        errorMessage.includes('invalid mint address') ||
        // Explicit validation errors
        (errorMessage.includes('validation') && !errorMessage.includes('RPC')) ||
        (errorMessage.includes('Validation') && !errorMessage.includes('RPC')) ||
        // Missing required fields (be specific)
        (errorMessage.includes('required') && !errorMessage.includes('connection')) ||
        // Token account errors (specific to asset validation)
        errorMessage.includes('Token account') ||
        errorMessage.includes('token account') ||
        // Frozen assets
        errorMessage.includes('frozen') ||
        errorMessage.includes('Frozen') ||
        // Asset amount validation
        errorMessage.includes('Invalid token amount') ||
        errorMessage.includes('expected 1, got');
      
      if (isValidationError) {
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
  requiredIdempotency, // Prevent duplicate counter-offer creation on retry
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
  validateZeroFeeApiKey, // Check for zero-fee authorization
  requiredIdempotency, // CRITICAL: Prevent duplicate nonce consumption on retry
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

      // Check if zero-fee is authorized and get platform authority public key
      const zeroFeeRequest = req as ZeroFeeAuthorizedRequest;
      const authorizedAppId = zeroFeeRequest.isZeroFeeAuthorized 
        ? platformAuthority.publicKey.toBase58()
        : undefined;

      const result = await offerManager.acceptOffer(offerId, takerWallet, authorizedAppId);

      // Result now includes both serializedTransaction and updatedOffer
      if (!result.offer) {
        throw new Error('Offer not returned from acceptOffer');
      }

      res.status(200).json({
        success: true,
        data: {
          offer: {
            id: result.offer.id.toString(),
            status: result.offer.status,
            makerWallet: result.offer.makerWallet,
            takerWallet: result.offer.takerWallet || takerWallet,
            offeredAssets: result.offer.offeredAssets,
            requestedAssets: result.offer.requestedAssets,
            offeredSol: result.offer.offeredSolLamports?.toString() || '0',
            requestedSol: result.offer.requestedSolLamports?.toString() || '0',
          },
          transaction: {
            serialized: result.serializedTransaction,
            nonceAccount: result.offer.nonceAccount,
          },
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
 * POST /api/offers/:id/rebuild-transaction
 * Rebuild transaction for an already-accepted offer with fresh cNFT proofs
 * Used when cNFT proofs become stale between transaction building and execution
 */
router.post(
  '/api/offers/:id/rebuild-transaction',
  standardRateLimiter,
  validateZeroFeeApiKey, // Check for zero-fee authorization for rebuilds
  requiredIdempotency, // CRITICAL: Prevent duplicate rebuilds
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

      // Check if zero-fee is authorized (for zero-fee swaps that need rebuilding)
      const zeroFeeRequest = req as ZeroFeeAuthorizedRequest;
      const authorizedAppId = zeroFeeRequest.isZeroFeeAuthorized 
        ? platformAuthority.publicKey.toBase58()
        : undefined;

      const result = await offerManager.rebuildTransaction(offerId, authorizedAppId);

      res.status(200).json({
        success: true,
        data: {
          offer: {
            id: result.offer.id.toString(),
            status: result.offer.status,
            makerWallet: result.offer.makerWallet,
            takerWallet: result.offer.takerWallet,
            offeredAssets: result.offer.offeredAssets,
            requestedAssets: result.offer.requestedAssets,
            offeredSol: result.offer.offeredSolLamports?.toString() || '0',
            requestedSol: result.offer.requestedSolLamports?.toString() || '0',
          },
          transaction: {
            serialized: result.serializedTransaction,
            nonceAccount: result.offer.nonceAccount,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error rebuilding transaction:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to rebuild transaction';

      // Check for not found or invalid state errors
      if (errorMessage.includes('not found') || errorMessage.includes('only rebuild')) {
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
  requiredIdempotency, // CRITICAL: Prevent multiple nonce advances on retry
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
  validateZeroFeeApiKey, // Check for zero-fee authorization for audit logging
  requiredIdempotency, // CRITICAL: Prevent double-marking offer as FILLED on retry
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

      // Log zero-fee swap for audit if authorized
      const zeroFeeRequest = req as ZeroFeeAuthorizedRequest;
      if (zeroFeeRequest.isZeroFeeAuthorized && zeroFeeRequest.authorizedApp) {
        try {
          // Re-fetch offer from database to get SOL amounts
          const dbOffer = await prisma.swapOffer.findUnique({
            where: { id: offerId },
            select: {
              makerWallet: true,
              takerWallet: true,
              offeredSolLamports: true,
              requestedSolLamports: true,
            },
          });

          if (dbOffer) {
            // Calculate total swap value for audit purposes
            // For accurate audit trail, we log the combined SOL value from both sides
            // of the swap. This represents the total SOL volume and would be used to
            // calculate what the fee WOULD have been if not waived (1% of total SOL value).
            // Example: Maker offers 5 SOL + NFT, Taker offers 2 SOL + NFT → totalValue = 7 SOL
            const totalValueLamports = (dbOffer.offeredSolLamports || BigInt(0)) + 
                                       (dbOffer.requestedSolLamports || BigInt(0));

            // Log the zero-fee swap
            await prisma.zeroFeeSwapLog.create({
              data: {
                authorizedAppId: zeroFeeRequest.authorizedApp.id,
                swapSignature: signature,
                makerWallet: dbOffer.makerWallet,
                takerWallet: dbOffer.takerWallet || '',
                platformFeeBps: 0, // Zero fee
                totalValueLamports,
                backendSigner: platformAuthority.publicKey.toBase58(),
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
              },
            });

            // Update total swaps count for the app
            await prisma.authorizedApp.update({
              where: { id: zeroFeeRequest.authorizedApp.id },
              data: {
                totalSwaps: { increment: 1 },
              },
            });

            console.log('[Zero-Fee Audit] Logged swap:', {
              app: zeroFeeRequest.authorizedApp.name,
              signature,
              maker: dbOffer.makerWallet,
              taker: dbOffer.takerWallet,
            });
          }
        } catch (logError) {
          // Non-blocking error - log but don't fail the request
          console.error('[Zero-Fee Audit] Failed to log swap:', logError);
        }
      }

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
export { noncePoolManager, offerManager, healthCheckService };

