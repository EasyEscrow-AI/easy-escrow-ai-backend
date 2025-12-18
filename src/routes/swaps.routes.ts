/**
 * Two-Phase Swap Routes
 *
 * RESTful API endpoints for creating and managing two-phase swaps with
 * lock/settle architecture for cNFT and bulk asset exchanges.
 *
 * Lock Phase Flow:
 * 1. POST /swaps - Create swap intent (status: CREATED)
 * 2. POST /swaps/:id/accept - Party B accepts (status: ACCEPTED)
 * 3. POST /swaps/:id/lock - Party A locks (status: PARTY_A_LOCKED)
 * 4. POST /swaps/:id/lock - Party B locks (status: FULLY_LOCKED)
 *
 * @see .taskmaster/tasks/task_009_cnft-delegation-swap.txt
 */

import { Router, Request, Response } from 'express';
import { standardRateLimiter, strictRateLimiter } from '../middleware';
import { requiredIdempotency } from '../middleware/idempotency.middleware';
import { Connection, PublicKey } from '@solana/web3.js';
import { prisma } from '../config/database';
import {
  createTwoPhaseSwapLockService,
  TwoPhaseSwapLockService,
} from '../services/twoPhaseSwapLockService';
import { SwapAsset } from '../services/swapStateMachine';
import { TwoPhaseSwapStatus } from '../generated/prisma';

const router = Router();

// =============================================================================
// Service Initialization
// =============================================================================

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Get program ID
const programIdStr =
  process.env.ESCROW_PROGRAM_ID ||
  process.env.STAGING_PROGRAM_ID ||
  process.env.PRODUCTION_PROGRAM_ID;

if (!programIdStr) {
  throw new Error('Program ID environment variable is required');
}
const programId = new PublicKey(programIdStr);

// Get fee collector
const feeCollectorStr =
  process.env.DEVNET_STAGING_FEE_COLLECTOR_ADDRESS ||
  process.env.MAINNET_PROD_FEE_COLLECTOR_ADDRESS;

if (!feeCollectorStr) {
  throw new Error('Fee collector address environment variable is required');
}
const feeCollector = new PublicKey(feeCollectorStr);

// Initialize service
const lockService = createTwoPhaseSwapLockService(
  connection,
  prisma,
  programId,
  feeCollector
);

console.log('[SwapsRoutes] Two-Phase Swap Routes initialized');
console.log('[SwapsRoutes] Program ID:', programId.toBase58());
console.log('[SwapsRoutes] Fee Collector:', feeCollector.toBase58());

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Transform API asset format to internal SwapAsset format
 */
function transformAssets(assets: any[]): SwapAsset[] {
  return assets.map((asset) => {
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
}

/**
 * Serialize swap data for API response (handle BigInt)
 */
function serializeSwap(swap: any): any {
  return {
    ...swap,
    solAmountA: swap.solAmountA?.toString() || null,
    solAmountB: swap.solAmountB?.toString() || null,
    platformFeeLamports: swap.platformFeeLamports?.toString() || '0',
    createdAt: swap.createdAt?.toISOString(),
    updatedAt: swap.updatedAt?.toISOString(),
    expiresAt: swap.expiresAt?.toISOString(),
    lockConfirmedA: swap.lockConfirmedA?.toISOString() || null,
    lockConfirmedB: swap.lockConfirmedB?.toISOString() || null,
    settledAt: swap.settledAt?.toISOString() || null,
    failedAt: swap.failedAt?.toISOString() || null,
    cancelledAt: swap.cancelledAt?.toISOString() || null,
  };
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/swaps
 * Create a new two-phase swap intent
 *
 * Request body:
 * - partyA: string - Initiator wallet address
 * - partyB?: string - Counterparty wallet address (optional for open swaps)
 * - assetsA: Array<{mint, isCompressed?, isCoreNft?}> - Party A's assets
 * - assetsB: Array<{mint, isCompressed?, isCoreNft?}> - Party B's assets
 * - solAmountA?: string - SOL from Party A (lamports)
 * - solAmountB?: string - SOL from Party B (lamports)
 * - lockTimeoutSeconds?: number - Lock phase timeout (default 30 min)
 */
router.post(
  '/api/swaps',
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

      // Transform assets
      const transformedAssetsA = transformAssets(assetsA);
      const transformedAssetsB = transformAssets(assetsB);

      // Create swap
      const result = await lockService.createSwap({
        partyA,
        partyB,
        assetsA: transformedAssetsA,
        assetsB: transformedAssetsB,
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
          swap: serializeSwap(result.swap),
          swapId: result.swapId,
          message: 'Swap created. Waiting for Party B to accept.',
          nextAction: 'Party B should call POST /api/swaps/:id/accept',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SwapsRoutes] Create swap error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create swap';

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
 * GET /api/swaps
 * List two-phase swaps with optional filters
 *
 * Query params:
 * - wallet: Filter by party wallet address
 * - status: Filter by status
 * - limit: Max results (default 20)
 * - offset: Pagination offset
 */
router.get(
  '/api/swaps',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { wallet, status, limit = '20', offset = '0' } = req.query;

      // Build filter
      let swaps;
      if (wallet) {
        // Validate wallet address
        try {
          new PublicKey(wallet as string);
        } catch (error) {
          res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'Invalid wallet address format',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const statusFilter = status
          ? (status as TwoPhaseSwapStatus)
          : undefined;
        swaps = await lockService.getSwapsForWallet(
          wallet as string,
          statusFilter
        );
      } else {
        // Get all swaps (admin use)
        const result = await lockService
          .getStateMachine()
          .getSwapsByParty('', { limit: parseInt(limit as string, 10) });
        swaps = result.swaps;
      }

      res.status(200).json({
        success: true,
        data: {
          swaps: swaps.map(serializeSwap),
          total: swaps.length,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SwapsRoutes] List swaps error:', error);
      const message = error instanceof Error ? error.message : 'Failed to list swaps';

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
 * GET /api/swaps/:id
 * Get a specific two-phase swap by ID
 */
router.get(
  '/api/swaps/:id',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const swap = await lockService.getSwap(id);

      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Swap ${id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Derive PDAs for reference
      const [delegatePDA] = lockService.deriveDelegatePDA(id);
      const [solVaultA] = lockService.deriveSolVaultPDA(id, 'A');
      const [solVaultB] = lockService.deriveSolVaultPDA(id, 'B');

      res.status(200).json({
        success: true,
        data: {
          swap: serializeSwap(swap),
          pdas: {
            delegatePDA: delegatePDA.toBase58(),
            solVaultA: solVaultA.toBase58(),
            solVaultB: solVaultB.toBase58(),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SwapsRoutes] Get swap error:', error);
      const message = error instanceof Error ? error.message : 'Failed to get swap';

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
 * POST /api/swaps/:id/accept
 * Accept a two-phase swap (Party B accepts Party A's proposal)
 *
 * Request body:
 * - partyB: string - Wallet address of the accepting party
 */
router.post(
  '/api/swaps/:id/accept',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { partyB } = req.body;

      // Validate required fields
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
      const result = await lockService.acceptSwap({ swapId: id, partyB });

      // Build lock instructions for Party A
      const lockTxResult = await lockService.buildLockTransaction({
        swapId: id,
        walletAddress: result.swap.partyA,
        party: 'A',
      });

      res.status(200).json({
        success: true,
        data: {
          swap: serializeSwap(result.swap),
          lockTransaction: {
            serialized: lockTxResult.serializedTransaction,
            requiredSigners: lockTxResult.requiredSigners,
            delegatePDA: lockTxResult.delegatePDA.toBase58(),
            solVaultPDA: lockTxResult.solVaultPDA.toBase58(),
            lockedAssets: lockTxResult.lockedAssets,
            solAmountEscrowed: lockTxResult.solAmountEscrowed.toString(),
            estimatedSize: lockTxResult.estimatedSize,
          },
          message: 'Swap accepted. Party A should now lock their assets.',
          nextAction: 'Party A should sign and submit the lock transaction',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SwapsRoutes] Accept swap error:', error);
      const message = error instanceof Error ? error.message : 'Failed to accept swap';

      // Handle specific error types
      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (message.includes('designated') || message.includes('not a party')) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (message.includes('expired')) {
        res.status(400).json({
          success: false,
          error: 'Expired',
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
 * POST /api/swaps/:id/lock
 * Lock assets for a two-phase swap
 *
 * Request body:
 * - walletAddress: string - Wallet address of the locking party
 *
 * Returns lock transaction for the appropriate party.
 * After Party A locks, returns lock transaction for Party B.
 */
router.post(
  '/api/swaps/:id/lock',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { walletAddress } = req.body;

      // Validate required fields
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

      // Get swap to determine which party is locking
      const swap = await lockService.getSwap(id);
      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Swap ${id} not found`,
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
          message: `Wallet ${walletAddress} is not a party to this swap`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Validate state for the party
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
      const lockTxResult = await lockService.buildLockTransaction({
        swapId: id,
        walletAddress,
        party,
      });

      // Transition to LOCKING state if not already
      if (
        swap.status === TwoPhaseSwapStatus.ACCEPTED ||
        swap.status === TwoPhaseSwapStatus.PARTY_A_LOCKED
      ) {
        await lockService.startLock(id, party, walletAddress);
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
            estimatedSize: lockTxResult.estimatedSize,
          },
          message: `Lock transaction built for Party ${party}. Sign and submit to lock assets.`,
          nextAction: 'Sign and submit the lock transaction, then call POST /api/swaps/:id/confirm-lock',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SwapsRoutes] Lock error:', error);
      const message = error instanceof Error ? error.message : 'Failed to build lock transaction';

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (message.includes('Invalid') || message.includes('state')) {
        res.status(400).json({
          success: false,
          error: 'Invalid State',
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
 * POST /api/swaps/:id/confirm-lock
 * Confirm a lock transaction was executed on-chain
 *
 * Request body:
 * - walletAddress: string - Wallet that executed the lock
 * - signature: string - Transaction signature
 */
router.post(
  '/api/swaps/:id/confirm-lock',
  strictRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { walletAddress, signature } = req.body;

      // Validate required fields
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
      const swap = await lockService.getSwap(id);
      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Swap ${id} not found`,
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
          message: `Wallet ${walletAddress} is not a party to this swap`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Confirm lock
      const result = await lockService.confirmLock({
        swapId: id,
        signature,
        party,
        walletAddress,
      });

      // Build response
      const responseData: any = {
        swap: serializeSwap(result.swap),
        fullyLocked: result.fullyLocked,
        message: result.fullyLocked
          ? 'Both parties locked. Ready for settlement.'
          : `Party ${party} lock confirmed. Waiting for Party ${party === 'A' ? 'B' : 'A'}.`,
      };

      // If Party A just locked, build lock tx for Party B
      if (result.nextAction === 'LOCK_PARTY_B' && swap.partyB) {
        const partyBLockTx = await lockService.buildLockTransaction({
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
        responseData.nextAction = 'Party B should sign and submit the lock transaction';
      } else if (result.nextAction === 'READY_FOR_SETTLEMENT') {
        responseData.nextAction = 'Call POST /api/swaps/:id/settle to begin settlement';
      }

      res.status(200).json({
        success: true,
        data: responseData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SwapsRoutes] Confirm lock error:', error);
      const message = error instanceof Error ? error.message : 'Failed to confirm lock';

      if (message.includes('not found') || message.includes('failed')) {
        res.status(400).json({
          success: false,
          error: 'Transaction Error',
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
 * POST /api/swaps/:id/cancel
 * Cancel a two-phase swap
 *
 * Request body:
 * - walletAddress: string - Wallet requesting cancellation
 * - reason?: string - Optional cancellation reason
 */
router.post(
  '/api/swaps/:id/cancel',
  standardRateLimiter,
  requiredIdempotency,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { walletAddress, reason } = req.body;

      // Validate required fields
      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'walletAddress is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Cancel swap
      const swap = await lockService.cancelSwap(id, walletAddress, reason);

      res.status(200).json({
        success: true,
        data: {
          swap: serializeSwap(swap),
          message: 'Swap cancelled successfully',
          // Note: If assets were locked, they need to be released separately
          note:
            swap.lockTxA || swap.lockTxB
              ? 'Locked assets need to be released. Contact support if needed.'
              : undefined,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SwapsRoutes] Cancel swap error:', error);
      const message = error instanceof Error ? error.message : 'Failed to cancel swap';

      if (message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (message.includes('cannot cancel') || message.includes('not authorized')) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
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
 * GET /api/swaps/:id/delegation-status
 * Check delegation status for cNFT assets in a swap
 */
router.get(
  '/api/swaps/:id/delegation-status',
  standardRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const swap = await lockService.getSwap(id);
      if (!swap) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Swap ${id} not found`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check delegation status for all cNFT assets
      const [delegatePDA] = lockService.deriveDelegatePDA(id);
      const delegationService = lockService.getDelegationService();

      const delegationStatus: Record<string, any> = {};

      // Check Party A assets
      for (const asset of swap.assetsA) {
        if (asset.type === 'CNFT') {
          try {
            const status = await delegationService.getDelegationStatus(asset.identifier);
            const isDelegatedToSwap =
              status.delegate === delegatePDA.toBase58();
            delegationStatus[asset.identifier] = {
              party: 'A',
              ...status,
              isDelegatedToSwap,
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
            const isDelegatedToSwap =
              status.delegate === delegatePDA.toBase58();
            delegationStatus[asset.identifier] = {
              party: 'B',
              ...status,
              isDelegatedToSwap,
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
          swapId: id,
          swapStatus: swap.status,
          delegatePDA: delegatePDA.toBase58(),
          delegationStatus,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SwapsRoutes] Get delegation status error:', error);
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

export default router;
export { lockService };
