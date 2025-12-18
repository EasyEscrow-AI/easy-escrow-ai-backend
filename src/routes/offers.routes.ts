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
// cNFT offer escrow imports
import {
  createCnftOfferEscrowManager,
  CreateOfferParams as CnftOfferParams,
  OfferFilters as CnftOfferFilters,
} from '../services/cnftOfferEscrowManager';
import { createCnftService } from '../services/cnftService';
import { DirectBubblegumService } from '../services/directBubblegumService';
import {
  createTwoPhaseSwapLockService,
  TwoPhaseSwapLockService,
} from '../services/twoPhaseSwapLockService';
import {
  createTwoPhaseSwapSettleService,
  TwoPhaseSwapSettleService,
} from '../services/twoPhaseSwapSettleService';
import {
  createSwapRecoveryService,
  SwapRecoveryService,
  RecoveryErrorCode,
} from '../services/swapRecoveryService';
import {
  createSwapStateMachine,
} from '../services/swapStateMachine';
import { TwoPhaseSwapStatus } from '../generated/prisma';

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

// Initialize cNFT offer escrow services
const cnftService = createCnftService(connection);
const directBubblegumService = new DirectBubblegumService(connection);
const cnftOfferManager = createCnftOfferEscrowManager(
  connection,
  prisma,
  cnftService,
  directBubblegumService,
  programId,
  feeCollector
);
console.log('[OffersRoutes] cNFT Offer Escrow Manager initialized');

// Initialize two-phase swap lock service for complex/bulk swaps
const twoPhaseSwapLockService = createTwoPhaseSwapLockService(
  connection,
  prisma,
  programId,
  feeCollector
);
console.log('[OffersRoutes] Two-Phase Swap Lock Service initialized');

// Initialize two-phase swap settle service for settlement execution
const twoPhaseSwapSettleService = createTwoPhaseSwapSettleService(
  connection,
  prisma,
  programId,
  feeCollector,
  platformAuthority // Backend signer for settlement transactions
);
console.log('[OffersRoutes] Two-Phase Swap Settle Service initialized');

// Initialize swap recovery service for admin recovery operations
const swapStateMachine = createSwapStateMachine(prisma);
const swapRecoveryService = createSwapRecoveryService({
  prisma,
  stateMachine: swapStateMachine,
  delegationRevoker: {
    revokeDelegation: async (assetId: string) => {
      // Use the delegation service to revoke
      // TODO: Implement actual revocation via cnftDelegationService when available
      console.log(`[SwapRecovery] Revoke delegation requested for asset: ${assetId}`);
      return { success: true, signature: `revoke-${assetId}-${Date.now()}` };
    },
  },
  solReturner: {
    returnEscrowedSol: async (vaultPda: string, toWallet: string, amount: bigint) => {
      // Use the settlement service to return SOL
      // TODO: Implement actual SOL return via twoPhaseSwapSettleService when available
      console.log(`[SwapRecovery] Return SOL requested: ${amount} lamports to ${toWallet}`);
      return { success: true, signature: `return-sol-${toWallet}-${Date.now()}` };
    },
  },
  settlementExecutor: {
    executeSettlementChunk: async (swapId: string, chunkIndex: number) => {
      // Use the settlement service to execute remaining chunks via startSettlement
      // The settle service will resume from currentSettleIndex automatically
      try {
        const result = await twoPhaseSwapSettleService.startSettlement({
          swapId,
          triggeredBy: 'recovery-service',
        });
        // Return success for the requested chunk if overall settlement succeeded
        return {
          success: result.success,
          signature: result.chunkResults[chunkIndex]?.signature || `chunk-${chunkIndex}`,
        };
      } catch (error) {
        console.error(`[SwapRecovery] Chunk execution failed:`, error);
        return { success: false };
      }
    },
  },
  alertService: {
    sendAlert: async (type: string, swapId: string, message: string) => {
      // Log alerts for now - integrate with alerting service later
      console.log(`[SwapRecovery] ALERT [${type}] Swap ${swapId}: ${message}`);
    },
  },
  config: {
    maxRetries: 3,
    stuckThresholdMinutes: 10,
    lockTimeoutMinutes: 30,
  },
});
console.log('[OffersRoutes] Swap Recovery Service initialized');

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

      // Build response based on whether this is a bulk swap
      const responseData: any = {
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
      };

      // Add bulk swap info if this is a multi-transaction swap
      if (result.isBulkSwap && result.transactionGroup) {
        responseData.bulkSwap = {
          isBulkSwap: true,
          strategy: result.transactionGroup.strategy,
          transactionCount: result.transactionGroup.transactionCount,
          requiresJitoBundle: result.transactionGroup.requiresJitoBundle,
          totalSizeBytes: result.transactionGroup.totalSizeBytes,
          // Include all transactions for the frontend to handle
          transactions: result.transactionGroup.transactions.map((tx) => ({
            index: tx.index,
            serialized: tx.transaction?.serializedTransaction || null,
            serializedTransaction: tx.transaction?.serializedTransaction || null, // Alias for compatibility
            requiredSigners: tx.transaction?.requiredSigners || [],
            // Convert BigInt values to strings for JSON serialization
            assets: {
              makerAssets: tx.assets.makerAssets,
              takerAssets: tx.assets.takerAssets,
              makerSolLamports: tx.assets.makerSolLamports.toString(),
              takerSolLamports: tx.assets.takerSolLamports.toString(),
              platformFeeLamports: tx.assets.platformFeeLamports.toString(),
            },
            purpose: tx.purpose,
            isVersioned: tx.isVersioned,
          })),
          // Include tip info if Jito bundle is required
          tipInfo: result.transactionGroup.requiresJitoBundle ? {
            tipAccountIndex: result.transactionGroup.transactionCount - 1, // Tip in last tx
            note: 'Jito tip should be added to the last transaction before signing',
          } : undefined,
        };
      }

      res.status(200).json({
        success: true,
        data: responseData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error accepting offer:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to accept offer';

      // Check for stale proof errors - return user-friendly message
      if (errorMessage.includes('Stale Merkle proof') || 
          errorMessage.includes('DAS API is unable to provide fresh proofs')) {
        res.status(503).json({
          success: false,
          error: 'Service Temporarily Unavailable',
          message: errorMessage,
          errorCode: 'STALE_CNFT_PROOF',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check for authorization errors (including private sales)
      if (errorMessage.includes('designated taker') || 
          errorMessage.includes('private sale') ||
          errorMessage.includes('Only the designated taker')) {
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
 * GET /api/offers/:id/bundle-status
 * Get the bundle execution status for a bulk swap offer
 * Returns bundle status, transaction signatures, and retry info
 */
router.get(
  '/api/offers/:id/bundle-status',
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

      // Fetch offer with bundle info
      const offer = await prisma.swapOffer.findUnique({
        where: { id: offerId },
        select: {
          id: true,
          status: true,
          bundleStatus: true,
          isBulkSwap: true,
          transactionCount: true,
          transactionSignature: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
        },
      });

      if (!offer) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Offer ${offerId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Parse transaction signature(s) if stored
      let signatures: string[] = [];
      if (offer.transactionSignature) {
        try {
          // Try parsing as JSON array first
          signatures = JSON.parse(offer.transactionSignature);
        } catch {
          // Single signature string
          signatures = [offer.transactionSignature];
        }
      }

      res.status(200).json({
        success: true,
        data: {
          offerId: offer.id,
          offerStatus: offer.status,
          isBulkSwap: offer.isBulkSwap || false,
          bundle: {
            status: offer.bundleStatus || 'N/A',
            transactionCount: offer.transactionCount || 1,
            signatures,
          },
          timing: {
            created: offer.createdAt?.toISOString(),
            updated: offer.updatedAt?.toISOString(),
            expires: offer.expiresAt?.toISOString(),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching bundle status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to fetch bundle status',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/:id/retry-bundle
 * Retry a failed bundle execution with fresh proofs
 * Only works for offers with bundleStatus = 'Failed' or 'Timeout'
 */
router.post(
  '/api/offers/:id/retry-bundle',
  strictRateLimiter,
  requiredIdempotency,
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

      // Fetch offer
      const offer = await prisma.swapOffer.findUnique({
        where: { id: offerId },
      });

      if (!offer) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Offer ${offerId} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check if bundle can be retried
      const retryableStatuses = ['Failed', 'Timeout'];
      if (!retryableStatuses.includes(offer.bundleStatus || '')) {
        res.status(400).json({
          success: false,
          error: 'Invalid State',
          message: `Cannot retry bundle with status '${offer.bundleStatus}'. Only 'Failed' or 'Timeout' bundles can be retried.`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Rebuild transaction with fresh proofs
      console.log(`[Bundle Retry] Rebuilding offer ${offerId} with fresh proofs`);
      const result = await offerManager.rebuildTransaction(offerId);

      // Update bundle status to pending
      await prisma.swapOffer.update({
        where: { id: offerId },
        data: {
          bundleStatus: 'Pending',
        },
      });

      res.status(200).json({
        success: true,
        message: 'Bundle transaction rebuilt with fresh proofs. Ready for re-execution.',
        data: {
          offerId: offerId,
          newBundleStatus: 'Pending',
          transaction: {
            serialized: result.serializedTransaction,
            nonceAccount: result.offer.nonceAccount,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error retrying bundle:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to retry bundle',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * PUT /api/offers/:id
 * Update an existing offer (change SOL amounts or assets)
 * Only the maker can update, and only while offer is ACTIVE
 */
router.put(
  '/api/offers/:id',
  strictRateLimiter,
  requiredIdempotency, // Prevent duplicate updates on retry
  async (req: Request, res: Response): Promise<void> => {
    try {
      const offerId = parseInt(req.params.id, 10);
      const {
        makerWallet,
        offeredAssets,
        requestedAssets,
        offeredSol,
        requestedSol,
      } = req.body;

      if (isNaN(offerId)) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid offer ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!makerWallet) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'makerWallet is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(makerWallet);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Transform assets if provided
      const transformAssets = (assets: any[]): Array<{ type: AssetType; identifier: string }> => {
        return assets.map((asset) => ({
          identifier: asset.mint,
          type: asset.isCoreNft ? AssetType.CORE_NFT : 
                asset.isCompressed ? AssetType.CNFT : AssetType.NFT,
        }));
      };

      const result = await offerManager.updateOffer({
        offerId,
        makerWallet,
        offeredAssets: offeredAssets ? transformAssets(offeredAssets) : undefined,
        requestedAssets: requestedAssets ? transformAssets(requestedAssets) : undefined,
        offeredSol: offeredSol !== undefined ? BigInt(offeredSol) : undefined,
        requestedSol: requestedSol !== undefined ? BigInt(requestedSol) : undefined,
      });

      res.status(200).json({
        success: true,
        data: {
          offer: {
            id: result.id.toString(),
            status: result.status,
            makerWallet: result.makerWallet,
            takerWallet: result.takerWallet || null,
            offeredAssets: result.offeredAssets,
            requestedAssets: result.requestedAssets,
            platformFee: {
              ...result.platformFee,
              feeLamports: result.platformFee.feeLamports.toString(),
              totalSwapValueLamports: result.platformFee.totalSwapValueLamports.toString(),
            },
            expiresAt: result.expiresAt.toISOString(),
          },
          message: 'Offer updated successfully',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error updating offer:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to update offer';

      // Check for authorization errors
      if (errorMessage.includes('Only the maker')) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check for invalid state/validation errors
      if (errorMessage.includes('cannot be updated') || 
          errorMessage.includes('not found') ||
          errorMessage.includes('expired') ||
          errorMessage.includes('Duplicate') ||
          errorMessage.includes('does not own')) {
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
 * Cancel an active/accepted offer (advances nonce to invalidate transaction)
 * Maker or Admin can cancel
 */
router.post(
  '/api/offers/:id/cancel',
  standardRateLimiter,
  requiredIdempotency, // CRITICAL: Prevent multiple nonce advances on retry
  async (req: Request, res: Response): Promise<void> => {
    try {
      const offerId = parseInt(req.params.id, 10);
      const { walletAddress, isAdmin } = req.body;

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

      // Validate admin claim - only platform authority can claim admin
      let verifiedAdmin = false;
      if (isAdmin) {
        // For now, admin is verified by matching the platform authority
        // In production, this should be enhanced with proper admin authentication
        verifiedAdmin = walletAddress === platformAuthority.publicKey.toBase58();
        if (!verifiedAdmin) {
          console.warn('[Cancel] Unauthorized admin claim from:', walletAddress);
        }
      }

      await offerManager.cancelOffer(offerId, walletAddress, verifiedAdmin);

      res.status(200).json({
        success: true,
        data: {
          message: `Offer ${offerId} cancelled successfully`,
          cancelledBy: walletAddress,
          role: verifiedAdmin ? 'admin' : 'maker',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error cancelling offer:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel offer';

      // Check for authorization errors
      if (errorMessage.includes('Only the maker or an admin can cancel')) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check for invalid state errors
      if (errorMessage.includes('cannot be cancelled') || errorMessage.includes('not found')) {
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
 * DELETE /api/offers/:id
 * Cancel an offer (RESTful alias for POST /api/offers/:id/cancel)
 * Accepts walletAddress and isAdmin in query params or body
 */
router.delete(
  '/api/offers/:id',
  standardRateLimiter,
  requiredIdempotency, // CRITICAL: Prevent multiple nonce advances on retry
  async (req: Request, res: Response): Promise<void> => {
    try {
      const offerId = parseInt(req.params.id, 10);
      // Accept walletAddress from query params (DELETE convention) or body
      const walletAddress = (req.query.walletAddress as string) || req.body?.walletAddress;
      const isAdmin = req.query.isAdmin === 'true' || req.body?.isAdmin;

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
          message: 'walletAddress is required (query param or body)',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate admin claim
      let verifiedAdmin = false;
      if (isAdmin) {
        verifiedAdmin = walletAddress === platformAuthority.publicKey.toBase58();
      }

      await offerManager.cancelOffer(offerId, walletAddress, verifiedAdmin);

      res.status(200).json({
        success: true,
        data: {
          message: `Offer ${offerId} cancelled successfully`,
          cancelledBy: walletAddress,
          role: verifiedAdmin ? 'admin' : 'maker',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error cancelling offer (DELETE):', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel offer';

      if (errorMessage.includes('Only the maker or an admin can cancel')) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (errorMessage.includes('cannot be cancelled') || errorMessage.includes('not found')) {
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

/**
 * GET /api/offers/metrics/bundles
 * Get bundle execution metrics for monitoring
 * Returns success rates, average times, and recent failures
 */
router.get(
  '/api/offers/metrics/bundles',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Get bundle statistics from last 24 hours
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const bundleStats = await prisma.swapOffer.groupBy({
        by: ['bundleStatus'],
        where: {
          isBulkSwap: true,
          createdAt: { gte: since },
        },
        _count: true,
      });

      const totalBundles = bundleStats.reduce((sum, s) => sum + s._count, 0);
      const landedBundles = bundleStats.find(s => s.bundleStatus === 'Landed')?._count || 0;
      const failedBundles = bundleStats.find(s => s.bundleStatus === 'Failed')?._count || 0;
      const timeoutBundles = bundleStats.find(s => s.bundleStatus === 'Timeout')?._count || 0;
      const pendingBundles = bundleStats.find(s => s.bundleStatus === 'Pending')?._count || 0;

      // Get recent failures for debugging
      const recentFailures = await prisma.swapOffer.findMany({
        where: {
          isBulkSwap: true,
          bundleStatus: { in: ['Failed', 'Timeout'] },
          createdAt: { gte: since },
        },
        select: {
          id: true,
          bundleStatus: true,
          createdAt: true,
          makerWallet: true,
          takerWallet: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      // Calculate success rate
      const completedBundles = landedBundles + failedBundles + timeoutBundles;
      const successRate = completedBundles > 0 
        ? ((landedBundles / completedBundles) * 100).toFixed(1)
        : 'N/A';

      res.status(200).json({
        success: true,
        data: {
          period: '24h',
          totals: {
            total: totalBundles,
            landed: landedBundles,
            failed: failedBundles,
            timeout: timeoutBundles,
            pending: pendingBundles,
          },
          rates: {
            successRate: `${successRate}%`,
            failureRate: completedBundles > 0 
              ? `${(((failedBundles + timeoutBundles) / completedBundles) * 100).toFixed(1)}%`
              : 'N/A',
          },
        recentFailures: recentFailures.map(f => ({
          offerId: f.id,
          status: f.bundleStatus,
          createdAt: f.createdAt?.toISOString(),
          maker: f.makerWallet ? f.makerWallet.substring(0, 8) + '...' : 'N/A',
          taker: f.takerWallet ? f.takerWallet.substring(0, 8) + '...' : 'N/A',
        })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching bundle metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to fetch metrics',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ==========================================
// cNFT OFFER ESCROW ENDPOINTS
// Routes for cNFT offers with SOL escrow
// Uses /api/offers/cnft/* path structure
// ==========================================

/**
 * POST /api/offers/cnft
 * Create a new cNFT offer with SOL escrow
 *
 * Bidder deposits SOL to a PDA to make an offer on a cNFT.
 * The SOL is held in escrow until the offer is accepted, cancelled, rejected, or expired.
 */
router.post(
  '/api/offers/cnft',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { bidderWallet, targetAssetId, offerLamports, durationSeconds, feeBps, listingId } = req.body;

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
      const params: CnftOfferParams = {
        bidderWallet,
        targetAssetId,
        offerLamports: offerAmount,
        durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : undefined,
        feeBps: feeBps ? parseInt(feeBps, 10) : undefined,
        listingId,
      };

      const result = await cnftOfferManager.createOffer(params);

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[OffersRoutes] Create cNFT offer error:', error);
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
 * GET /api/offers/cnft
 * List cNFT offers with optional filters
 */
router.get(
  '/api/offers/cnft',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { bidderWallet, ownerWallet, targetAssetId, status, listingId, includeExpired, limit, offset } =
        req.query;

      const filters: CnftOfferFilters = {};

      if (bidderWallet) filters.bidderWallet = bidderWallet as string;
      if (ownerWallet) filters.ownerWallet = ownerWallet as string;
      if (targetAssetId) filters.targetAssetId = targetAssetId as string;
      if (status) filters.status = status as any;
      if (listingId) filters.listingId = listingId as string;
      if (includeExpired === 'true') filters.includeExpired = true;
      if (limit) filters.limit = parseInt(limit as string, 10);
      if (offset) filters.offset = parseInt(offset as string, 10);

      const { offers, total } = await cnftOfferManager.getOffers(filters);

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
      console.error('[OffersRoutes] List cNFT offers error:', error);
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
 * GET /api/offers/cnft/asset/:assetId
 * Get all offers on a specific cNFT
 */
router.get(
  '/api/offers/cnft/asset/:assetId',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { assetId } = req.params;

      const offers = await cnftOfferManager.getOffersOnAsset(assetId);

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
      console.error('[OffersRoutes] Get cNFT asset offers error:', error);
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
 * GET /api/offers/cnft/bidder/:wallet
 * Get all cNFT offers made by a bidder
 */
router.get(
  '/api/offers/cnft/bidder/:wallet',
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

      const offers = await cnftOfferManager.getBidderOffers(wallet);

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
      console.error('[OffersRoutes] Get cNFT bidder offers error:', error);
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
 * GET /api/offers/cnft/owner/:wallet
 * Get all cNFT offers received by an owner
 */
router.get(
  '/api/offers/cnft/owner/:wallet',
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

      const offers = await cnftOfferManager.getOwnerOffers(wallet);

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
      console.error('[OffersRoutes] Get cNFT owner offers error:', error);
      res.status(500).json({
        success: false,
        error: 'Server Error',
        message: error.message || 'Failed to get owner offers',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers/cnft/:offerId
 * Get a specific cNFT offer by ID
 */
router.get(
  '/api/offers/cnft/:offerId',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { offerId } = req.params;

      const offer = await cnftOfferManager.getOffer(offerId);

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
      console.error('[OffersRoutes] Get cNFT offer error:', error);
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
 * POST /api/offers/cnft/:offerId/confirm
 * Confirm a cNFT offer after escrow transaction is confirmed on-chain
 */
router.post(
  '/api/offers/cnft/:offerId/confirm',
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

      const offer = await cnftOfferManager.confirmOffer({ offerId, signature });

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
      console.error('[OffersRoutes] Confirm cNFT offer error:', error);
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
 * POST /api/offers/cnft/:offerId/accept
 * Accept a cNFT offer (owner accepts, cNFT transfers to bidder, SOL to owner)
 */
router.post(
  '/api/offers/cnft/:offerId/accept',
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

      const result = await cnftOfferManager.acceptOffer({ offerId, ownerWallet });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[OffersRoutes] Accept cNFT offer error:', error);
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
 * POST /api/offers/cnft/:offerId/cancel
 * Cancel a cNFT offer (bidder cancels, SOL refunded)
 */
router.post(
  '/api/offers/cnft/:offerId/cancel',
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

      const result = await cnftOfferManager.cancelOffer({ offerId, bidderWallet });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[OffersRoutes] Cancel cNFT offer error:', error);
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
 * POST /api/offers/cnft/:offerId/reject
 * Reject a cNFT offer (owner rejects, SOL refunded to bidder)
 */
router.post(
  '/api/offers/cnft/:offerId/reject',
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

      const offer = await cnftOfferManager.rejectOffer(offerId, ownerWallet);

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
      console.error('[OffersRoutes] Reject cNFT offer error:', error);
      res.status(error.message?.includes('not found') ? 404 : 422).json({
        success: false,
        error: 'Offer Reject Failed',
        message: error.message || 'Failed to reject offer',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// =============================================================================
// Two-Phase Swap Routes (for bulk/complex swaps)
// =============================================================================
//
// These endpoints handle swaps that require a lock/settle pattern:
// - Bulk swaps with 3+ cNFTs per side
// - Complex multi-asset swaps
//
// The backend automatically uses two-phase when needed. Responses include
// `executionStrategy: "two-phase"` to indicate lock phase is required.
// =============================================================================

/**
 * Helper to serialize two-phase swap data for API response (handle BigInt)
 */
function serializeTwoPhaseSwap(swap: any): any {
  return {
    ...swap,
    solAmountA: swap.solAmountA?.toString() || null,
    solAmountB: swap.solAmountB?.toString() || null,
    platformFeeLamports: swap.platformFeeLamports?.toString() || '0',
    createdAt: swap.createdAt?.toISOString?.() || swap.createdAt,
    updatedAt: swap.updatedAt?.toISOString?.() || swap.updatedAt,
    expiresAt: swap.expiresAt?.toISOString?.() || swap.expiresAt,
    lockConfirmedA: swap.lockConfirmedA?.toISOString?.() || swap.lockConfirmedA || null,
    lockConfirmedB: swap.lockConfirmedB?.toISOString?.() || swap.lockConfirmedB || null,
    settledAt: swap.settledAt?.toISOString?.() || swap.settledAt || null,
    failedAt: swap.failedAt?.toISOString?.() || swap.failedAt || null,
    cancelledAt: swap.cancelledAt?.toISOString?.() || swap.cancelledAt || null,
  };
}

/**
 * Determine execution strategy based on swap parameters
 * - Atomic: Simple swaps (1-2 assets, single cNFT↔SOL)
 * - Two-phase: Complex swaps (3+ cNFTs, bulk assets)
 */
function determineExecutionStrategy(assetsA: any[], assetsB: any[]): 'atomic' | 'two-phase' {
  const cnftCountA = assetsA.filter((a: any) => a.isCompressed || a.type === 'CNFT').length;
  const cnftCountB = assetsB.filter((a: any) => a.isCompressed || a.type === 'CNFT').length;
  const totalAssets = assetsA.length + assetsB.length;

  // Use two-phase for:
  // - 3+ cNFTs on either side
  // - 5+ total assets
  if (cnftCountA >= 3 || cnftCountB >= 3 || totalAssets >= 5) {
    return 'two-phase';
  }

  return 'atomic';
}

/**
 * POST /api/offers/bulk
 * Create a bulk/complex swap offer (uses two-phase lock/settle)
 *
 * For simpler swaps, use POST /api/offers which auto-detects strategy.
 *
 * Request body:
 * - partyA: string - Initiator wallet address
 * - partyB?: string - Counterparty wallet (optional for open offers)
 * - assetsA: Array<{mint, isCompressed?, isCoreNft?}> - Party A's assets
 * - assetsB: Array<{mint, isCompressed?, isCoreNft?}> - Party B's assets
 * - solAmountA?: string - SOL from Party A (lamports)
 * - solAmountB?: string - SOL from Party B (lamports)
 */
router.post(
  '/api/offers/bulk',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        partyA,
        partyB,
        assetsA = [],
        assetsB = [],
        solAmountA,
        solAmountB,
        lockTimeoutSeconds,
        platformFeeLamports,
      } = req.body;

      // Validate required fields
      if (!partyA) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'partyA is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet addresses
      try {
        new PublicKey(partyA);
        if (partyB) {
          new PublicKey(partyB);
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

      // Validate at least one side has assets or SOL
      if (assetsA.length === 0 && !solAmountA) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Party A must offer at least one asset or SOL',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (assetsB.length === 0 && !solAmountB) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Party B must offer at least one asset or SOL',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Transform assets to internal format
      const transformAssets = (assets: any[]) =>
        assets.map((asset: any) => {
          let type: 'NFT' | 'CNFT' | 'CORE_NFT' = 'NFT';
          if (asset.isCoreNft || asset.type === 'CORE_NFT') {
            type = 'CORE_NFT';
          } else if (asset.isCompressed || asset.type === 'CNFT') {
            type = 'CNFT';
          }
          return {
            type,
            identifier: asset.mint || asset.identifier || asset.assetId,
            metadata: asset.metadata,
          };
        });

      // Create two-phase swap
      const result = await twoPhaseSwapLockService.createSwap({
        partyA,
        partyB,
        assetsA: transformAssets(assetsA),
        assetsB: transformAssets(assetsB),
        solAmountA: solAmountA ? BigInt(solAmountA) : undefined,
        solAmountB: solAmountB ? BigInt(solAmountB) : undefined,
        lockTimeoutSeconds: lockTimeoutSeconds
          ? parseInt(lockTimeoutSeconds, 10)
          : undefined,
        platformFeeLamports: platformFeeLamports
          ? BigInt(platformFeeLamports)
          : undefined,
      });

      res.status(201).json({
        success: true,
        data: {
          offer: serializeTwoPhaseSwap(result.swap),
          offerId: result.swapId,
          executionStrategy: 'two-phase',
          requiresLockPhase: true,
          message: 'Bulk offer created. Waiting for acceptance.',
          nextAction: 'Counterparty should call POST /api/offers/bulk/:id/accept',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Create bulk offer error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create offer';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers/bulk/:id
 * Get a bulk swap offer by ID
 */
router.get(
  '/api/offers/bulk/:id',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const swap = await twoPhaseSwapLockService.getSwap(id);

      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Bulk offer ${id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Derive PDAs for reference
      const [delegatePDA] = twoPhaseSwapLockService.deriveDelegatePDA(id);
      const [solVaultA] = twoPhaseSwapLockService.deriveSolVaultPDA(id, 'A');
      const [solVaultB] = twoPhaseSwapLockService.deriveSolVaultPDA(id, 'B');

      res.status(200).json({
        success: true,
        data: {
          offer: serializeTwoPhaseSwap(swap),
          executionStrategy: 'two-phase',
          pdas: {
            delegatePDA: delegatePDA.toBase58(),
            solVaultA: solVaultA.toBase58(),
            solVaultB: solVaultB.toBase58(),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Get bulk offer error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get offer';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/bulk/:id/accept
 * Accept a bulk swap offer
 *
 * Request body:
 * - partyB: string - Wallet address of the accepting party
 */
router.post(
  '/api/offers/bulk/:id/accept',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { partyB } = req.body;

      if (!partyB) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'partyB wallet address is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(partyB);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Accept swap
      const result = await twoPhaseSwapLockService.acceptSwap({ swapId: id, partyB });

      // Build lock instructions for Party A
      const lockTxResult = await twoPhaseSwapLockService.buildLockTransaction({
        swapId: id,
        walletAddress: result.swap.partyA,
        party: 'A',
      });

      res.status(200).json({
        success: true,
        data: {
          offer: serializeTwoPhaseSwap(result.swap),
          lockTransaction: {
            serialized: lockTxResult.serializedTransaction,
            requiredSigners: lockTxResult.requiredSigners,
            delegatePDA: lockTxResult.delegatePDA.toBase58(),
            solVaultPDA: lockTxResult.solVaultPDA.toBase58(),
            lockedAssets: lockTxResult.lockedAssets,
            solAmountEscrowed: lockTxResult.solAmountEscrowed.toString(),
          },
          message: 'Offer accepted. Party A should now lock their assets.',
          nextAction: 'Party A signs and submits the lock transaction',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Accept bulk offer error:', error);
      const message = error instanceof Error ? error.message : 'Failed to accept offer';

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/bulk/:id/lock
 * Build lock transaction for a bulk swap
 *
 * Request body:
 * - walletAddress: string - Wallet of the party locking assets
 */
router.post(
  '/api/offers/bulk/:id/lock',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { walletAddress } = req.body;

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'walletAddress is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate wallet address
      try {
        new PublicKey(walletAddress);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Get swap to determine party
      const swap = await twoPhaseSwapLockService.getSwap(id);
      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Bulk offer ${id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Determine party
      let party: 'A' | 'B';
      if (swap.partyA === walletAddress) {
        party = 'A';
      } else if (swap.partyB === walletAddress) {
        party = 'B';
      } else {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Wallet ${walletAddress} is not a party to this offer`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate state
      const validStates: Record<'A' | 'B', TwoPhaseSwapStatus[]> = {
        A: [TwoPhaseSwapStatus.ACCEPTED, TwoPhaseSwapStatus.LOCKING_PARTY_A],
        B: [TwoPhaseSwapStatus.PARTY_A_LOCKED, TwoPhaseSwapStatus.LOCKING_PARTY_B],
      };

      if (!validStates[party].includes(swap.status)) {
        res.status(400).json({
          success: false,
          error: 'Invalid State',
          message: `Cannot lock as Party ${party} in state ${swap.status}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Build lock transaction
      const lockTxResult = await twoPhaseSwapLockService.buildLockTransaction({
        swapId: id,
        walletAddress,
        party,
      });

      // Transition to LOCKING state
      if (
        swap.status === TwoPhaseSwapStatus.ACCEPTED ||
        swap.status === TwoPhaseSwapStatus.PARTY_A_LOCKED
      ) {
        await twoPhaseSwapLockService.startLock(id, party, walletAddress);
      }

      res.status(200).json({
        success: true,
        data: {
          party,
          lockTransaction: {
            serialized: lockTxResult.serializedTransaction,
            requiredSigners: lockTxResult.requiredSigners,
            delegatePDA: lockTxResult.delegatePDA.toBase58(),
            solVaultPDA: lockTxResult.solVaultPDA.toBase58(),
            lockedAssets: lockTxResult.lockedAssets,
            solAmountEscrowed: lockTxResult.solAmountEscrowed.toString(),
          },
          message: `Lock transaction built for Party ${party}. Sign and submit.`,
          nextAction: 'Sign and submit, then call POST /api/offers/bulk/:id/confirm-lock',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Lock error:', error);
      const message = error instanceof Error ? error.message : 'Failed to build lock transaction';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/bulk/:id/confirm-lock
 * Confirm a lock transaction was executed on-chain
 *
 * Request body:
 * - walletAddress: string - Wallet that executed the lock
 * - signature: string - Transaction signature
 */
router.post(
  '/api/offers/bulk/:id/confirm-lock',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { walletAddress, signature } = req.body;

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'walletAddress is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!signature) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'signature is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Get swap to determine party
      const swap = await twoPhaseSwapLockService.getSwap(id);
      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Bulk offer ${id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Determine party
      let party: 'A' | 'B';
      if (swap.partyA === walletAddress) {
        party = 'A';
      } else if (swap.partyB === walletAddress) {
        party = 'B';
      } else {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: `Wallet ${walletAddress} is not a party to this offer`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Confirm lock
      const result = await twoPhaseSwapLockService.confirmLock({
        swapId: id,
        signature,
        party,
        walletAddress,
      });

      // Build response
      const responseData: any = {
        offer: serializeTwoPhaseSwap(result.swap),
        fullyLocked: result.fullyLocked,
        message: result.fullyLocked
          ? 'Both parties locked. Ready for settlement.'
          : `Party ${party} lock confirmed. Waiting for Party ${party === 'A' ? 'B' : 'A'}.`,
      };

      // If Party A just locked, include lock tx for Party B
      if (result.nextAction === 'LOCK_PARTY_B' && swap.partyB) {
        const partyBLockTx = await twoPhaseSwapLockService.buildLockTransaction({
          swapId: id,
          walletAddress: swap.partyB,
          party: 'B',
        });

        responseData.lockTransaction = {
          serialized: partyBLockTx.serializedTransaction,
          requiredSigners: partyBLockTx.requiredSigners,
          delegatePDA: partyBLockTx.delegatePDA.toBase58(),
          solVaultPDA: partyBLockTx.solVaultPDA.toBase58(),
          lockedAssets: partyBLockTx.lockedAssets,
          solAmountEscrowed: partyBLockTx.solAmountEscrowed.toString(),
        };
        responseData.nextAction = 'Party B signs and submits lock transaction';
      } else if (result.nextAction === 'READY_FOR_SETTLEMENT') {
        responseData.nextAction = 'Call POST /api/offers/bulk/:id/settle';
      }

      res.status(200).json({
        success: true,
        data: responseData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Confirm lock error:', error);
      const message = error instanceof Error ? error.message : 'Failed to confirm lock';

      res.status(400).json({
        success: false,
        error: 'Confirmation Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/bulk/:id/cancel
 * Cancel a bulk swap offer
 *
 * Request body:
 * - walletAddress: string - Wallet requesting cancellation
 * - reason?: string - Optional cancellation reason
 */
router.post(
  '/api/offers/bulk/:id/cancel',
  standardRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { walletAddress, reason } = req.body;

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'walletAddress is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const swap = await twoPhaseSwapLockService.cancelSwap(id, walletAddress, reason);

      res.status(200).json({
        success: true,
        data: {
          offer: serializeTwoPhaseSwap(swap),
          message: 'Offer cancelled successfully',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Cancel bulk offer error:', error);
      const message = error instanceof Error ? error.message : 'Failed to cancel offer';

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers/bulk/:id/delegation-status
 * Check delegation status for cNFT assets in a bulk offer
 */
router.get(
  '/api/offers/bulk/:id/delegation-status',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const swap = await twoPhaseSwapLockService.getSwap(id);
      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Bulk offer ${id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check delegation status for cNFT assets
      const [delegatePDA] = twoPhaseSwapLockService.deriveDelegatePDA(id);
      const delegationService = twoPhaseSwapLockService.getDelegationService();

      const delegationStatus: Record<string, any> = {};

      // Check Party A assets
      for (const asset of swap.assetsA) {
        if (asset.type === 'CNFT') {
          try {
            const status = await delegationService.getDelegationStatus(asset.identifier);
            delegationStatus[asset.identifier] = {
              party: 'A',
              ...status,
              isDelegatedToOffer: status.delegate === delegatePDA.toBase58(),
            };
          } catch (error: any) {
            delegationStatus[asset.identifier] = {
              party: 'A',
              error: error.message,
            };
          }
        }
      }

      // Check Party B assets
      for (const asset of swap.assetsB) {
        if (asset.type === 'CNFT') {
          try {
            const status = await delegationService.getDelegationStatus(asset.identifier);
            delegationStatus[asset.identifier] = {
              party: 'B',
              ...status,
              isDelegatedToOffer: status.delegate === delegatePDA.toBase58(),
            };
          } catch (error: any) {
            delegationStatus[asset.identifier] = {
              party: 'B',
              error: error.message,
            };
          }
        }
      }

      res.status(200).json({
        success: true,
        data: {
          offerId: id,
          offerStatus: swap.status,
          delegatePDA: delegatePDA.toBase58(),
          delegationStatus,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Get delegation status error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get delegation status';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// =============================================================================
// Two-Phase Swap Settlement Endpoints (Task 10)
// =============================================================================

/**
 * POST /api/offers/bulk/:id/settle
 * Start settlement for a fully-locked bulk swap
 *
 * This endpoint triggers the settlement phase for a swap that has
 * both parties locked. The backend will execute transfers in chunks.
 *
 * Request body:
 * - triggeredBy: string - Wallet address triggering settlement (or 'system')
 */
router.post(
  '/api/offers/bulk/:id/settle',
  standardRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { triggeredBy = 'system' } = req.body;

      console.log('[OffersRoutes] Starting settlement:', { swapId: id, triggeredBy });

      // Execute settlement
      const result = await twoPhaseSwapSettleService.startSettlement({
        swapId: id,
        triggeredBy,
      });

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: 'Settlement Failed',
          message: result.error || 'Settlement failed',
          data: {
            offer: serializeTwoPhaseSwap(result.swap),
            chunkResults: result.chunkResults.map((r) => ({
              chunkIndex: r.chunkIndex,
              success: r.success,
              signature: r.signature || null,
              error: r.error,
              retryCount: r.retryCount,
            })),
            executionTimeMs: result.executionTimeMs,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          offer: serializeTwoPhaseSwap(result.swap),
          message: 'Settlement completed successfully',
          chunkResults: result.chunkResults.map((r) => ({
            chunkIndex: r.chunkIndex,
            success: r.success,
            signature: r.signature,
            retryCount: r.retryCount,
          })),
          executionTimeMs: result.executionTimeMs,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Settlement error:', error);
      const message = error instanceof Error ? error.message : 'Failed to execute settlement';

      // Check for specific error types
      if (message.includes('not ready for settlement') || message.includes('FULLY_LOCKED')) {
        res.status(400).json({
          success: false,
          error: 'Invalid State',
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Settlement Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers/bulk/:id/settlement-progress
 * Get current settlement progress for a swap
 *
 * Clients can poll this endpoint to track settlement progress.
 */
router.get(
  '/api/offers/bulk/:id/settlement-progress',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const progress = await twoPhaseSwapSettleService.getSettlementProgress(id);

      res.status(200).json({
        success: true,
        data: {
          swapId: progress.swapId,
          status: progress.status,
          progress: {
            currentChunk: progress.currentChunk,
            totalChunks: progress.totalChunks,
            percentComplete: progress.percentComplete,
            estimatedTimeRemainingMs: progress.estimatedTimeRemainingMs,
          },
          completedTxs: progress.completedTxs,
          error: progress.error,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Get settlement progress error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get settlement progress';

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers/bulk/:id/settlement-chunks
 * Preview settlement chunks for a swap (before settlement starts)
 *
 * This endpoint shows how the settlement will be chunked without
 * actually executing it. Useful for UI display and estimation.
 */
router.get(
  '/api/offers/bulk/:id/settlement-chunks',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Get swap data
      const swap = await twoPhaseSwapLockService.getSwap(id);
      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Bulk offer ${id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Calculate chunks (preview)
      const chunkResult = await twoPhaseSwapSettleService.calculateSettlementChunks(swap);

      res.status(200).json({
        success: true,
        data: {
          swapId: id,
          currentStatus: swap.status,
          isReadyForSettlement: swap.status === TwoPhaseSwapStatus.FULLY_LOCKED,
          settlement: {
            strategy: chunkResult.strategy,
            totalChunks: chunkResult.totalChunks,
            totalAssets: chunkResult.totalAssets,
            chunks: chunkResult.chunks.map((chunk) => ({
              index: chunk.index,
              purpose: chunk.purpose,
              estimatedSize: chunk.estimatedSize,
              assets: chunk.assets.map((a) => ({
                assetId: a.assetId,
                type: a.type,
                from: a.from,
                to: a.to,
                fromParty: a.fromParty,
              })),
              solTransfers: chunk.solTransfers.map((s) => ({
                from: s.from,
                to: s.to,
                amount: s.amount.toString(),
                type: s.type,
                fromParty: s.fromParty,
              })),
            })),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Get settlement chunks error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get settlement chunks';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers/bulk/ready-for-settlement
 * List swaps that are ready for settlement (FULLY_LOCKED status)
 *
 * Query params:
 * - limit: number - Maximum number of results (default 10, max 50)
 */
router.get(
  '/api/offers/bulk/ready-for-settlement',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      const swaps = await twoPhaseSwapSettleService.getSwapsReadyForSettlement(limit);

      res.status(200).json({
        success: true,
        data: {
          count: swaps.length,
          swaps: swaps.map((swap) => serializeTwoPhaseSwap(swap)),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Get swaps ready for settlement error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get swaps';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers/bulk/in-settlement
 * List swaps currently in settlement (SETTLING or PARTIAL_SETTLE status)
 *
 * Query params:
 * - limit: number - Maximum number of results (default 10, max 50)
 */
router.get(
  '/api/offers/bulk/in-settlement',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      const swaps = await twoPhaseSwapSettleService.getSwapsInSettlement(limit);

      res.status(200).json({
        success: true,
        data: {
          count: swaps.length,
          swaps: swaps.map((swap) => ({
            ...serializeTwoPhaseSwap(swap),
            progress: {
              currentChunk: swap.currentSettleIndex,
              totalChunks: swap.totalSettleTxs,
              percentComplete: swap.totalSettleTxs > 0
                ? Math.round((swap.currentSettleIndex / swap.totalSettleTxs) * 100)
                : 0,
            },
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Get swaps in settlement error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get swaps';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// =============================================================================
// ADMIN SWAP RECOVERY ENDPOINTS (Task 11)
// =============================================================================

/**
 * GET /api/offers/admin/recovery/stuck
 * Get list of stuck two-phase swaps that may need recovery
 *
 * Authorization: Requires admin key (X-Admin-Key header)
 */
router.get(
  '/api/offers/admin/recovery/stuck',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Simple admin key check (should be moved to proper middleware)
      const adminKey = req.headers['x-admin-key'];
      if (adminKey !== process.env.ADMIN_API_KEY) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid X-Admin-Key header required',
        });
        return;
      }

      const stuckSwaps = await swapRecoveryService.findStuckSwaps();

      res.status(200).json({
        success: true,
        data: {
          count: stuckSwaps.length,
          swaps: stuckSwaps.map((swap) => ({
            id: swap.id,
            status: swap.status,
            partyA: swap.partyA,
            partyB: swap.partyB,
            updatedAt: swap.updatedAt,
            stuckMinutes: Math.round(
              (Date.now() - swap.updatedAt.getTime()) / 60000
            ),
            currentSettleIndex: swap.currentSettleIndex,
            totalSettleTxs: swap.totalSettleTxs,
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Get stuck swaps error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get stuck swaps';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/admin/recovery/expired
 * Process all expired swaps (revoke delegations, return assets)
 *
 * Authorization: Requires admin key (X-Admin-Key header)
 */
router.post(
  '/api/offers/admin/recovery/expired',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const adminKey = req.headers['x-admin-key'];
      if (adminKey !== process.env.ADMIN_API_KEY) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid X-Admin-Key header required',
        });
        return;
      }

      const results = await swapRecoveryService.processExpiredSwaps();

      res.status(200).json({
        success: true,
        data: {
          processed: results.processed,
          failed: results.failed,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Process expired swaps error:', error);
      const message = error instanceof Error ? error.message : 'Failed to process expired swaps';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/admin/recovery/:swapId/retry
 * Retry settlement for a failed swap
 *
 * Authorization: Requires admin key (X-Admin-Key header)
 */
router.post(
  '/api/offers/admin/recovery/:swapId/retry',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const adminKey = req.headers['x-admin-key'];
      if (adminKey !== process.env.ADMIN_API_KEY) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid X-Admin-Key header required',
        });
        return;
      }

      const { swapId } = req.params;

      if (!swapId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'swapId is required',
        });
        return;
      }

      console.log(`[OffersRoutes] Admin retry settlement for swap: ${swapId}`);

      const result = await swapRecoveryService.adminRetrySettlement(swapId);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            swapId: result.swapId,
            finalState: result.finalState,
            chunksRecovered: result.chunksRecovered,
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Recovery Failed',
          code: result.errorCode,
          message: result.errorMessage,
          swapId: result.swapId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('[OffersRoutes] Admin retry settlement error:', error);
      const message = error instanceof Error ? error.message : 'Failed to retry settlement';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/offers/admin/recovery/:swapId/rollback
 * Rollback a failed swap (revoke all delegations, return all escrowed assets)
 *
 * Authorization: Requires admin key (X-Admin-Key header)
 */
router.post(
  '/api/offers/admin/recovery/:swapId/rollback',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const adminKey = req.headers['x-admin-key'];
      if (adminKey !== process.env.ADMIN_API_KEY) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid X-Admin-Key header required',
        });
        return;
      }

      const { swapId } = req.params;

      if (!swapId) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'swapId is required',
        });
        return;
      }

      console.log(`[OffersRoutes] Admin rollback for swap: ${swapId}`);

      const result = await swapRecoveryService.adminRollback(swapId);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            swapId: result.swapId,
            assetsReturned: result.assetsReturned,
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Rollback Failed',
          code: result.errorCode,
          message: result.errorMessage,
          swapId: result.swapId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('[OffersRoutes] Admin rollback error:', error);
      const message = error instanceof Error ? error.message : 'Failed to rollback swap';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/offers/admin/recovery/:swapId
 * Get recovery status and details for a specific swap
 *
 * Authorization: Requires admin key (X-Admin-Key header)
 */
router.get(
  '/api/offers/admin/recovery/:swapId',
  strictRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const adminKey = req.headers['x-admin-key'];
      if (adminKey !== process.env.ADMIN_API_KEY) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Valid X-Admin-Key header required',
        });
        return;
      }

      const { swapId } = req.params;

      const swap = await swapStateMachine.getSwap(swapId);

      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Swap ${swapId} not found`,
        });
        return;
      }

      // Determine recovery options based on current state
      const recoveryOptions: string[] = [];

      if (swap.status === TwoPhaseSwapStatus.FAILED) {
        recoveryOptions.push('retry', 'rollback');
      } else if (
        swap.status === TwoPhaseSwapStatus.PARTIAL_SETTLE ||
        swap.status === TwoPhaseSwapStatus.SETTLING
      ) {
        recoveryOptions.push('retry');
      } else if (
        swap.status === TwoPhaseSwapStatus.PARTY_A_LOCKED ||
        swap.status === TwoPhaseSwapStatus.LOCKING_PARTY_B
      ) {
        if (swap.expiresAt < new Date()) {
          recoveryOptions.push('expire');
        }
      }

      res.status(200).json({
        success: true,
        data: {
          swapId: swap.id,
          status: swap.status,
          partyA: swap.partyA,
          partyB: swap.partyB,
          expiresAt: swap.expiresAt,
          isExpired: swap.expiresAt < new Date(),
          createdAt: swap.createdAt,
          updatedAt: swap.updatedAt,
          lockStatus: {
            partyALocked: !!swap.lockTxA,
            partyBLocked: !!swap.lockTxB,
          },
          settlementProgress: {
            currentChunk: swap.currentSettleIndex,
            totalChunks: swap.totalSettleTxs,
            completedTxs: swap.settleTxs.length,
            percentComplete: swap.totalSettleTxs > 0
              ? Math.round((swap.currentSettleIndex / swap.totalSettleTxs) * 100)
              : 0,
          },
          error: swap.errorMessage
            ? {
                message: swap.errorMessage,
                code: swap.errorCode,
                failedAt: swap.failedAt,
              }
            : null,
          recoveryOptions,
          stateHistory: swap.stateHistory.slice(-5), // Last 5 transitions
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[OffersRoutes] Get swap recovery status error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get swap status';

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
export {
  noncePoolManager,
  offerManager,
  healthCheckService,
  cnftOfferManager,
  twoPhaseSwapLockService,
  twoPhaseSwapSettleService,
  swapRecoveryService,
};
