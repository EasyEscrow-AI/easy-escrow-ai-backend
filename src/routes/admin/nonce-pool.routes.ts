/**
 * Admin Routes for Nonce Pool Management
 * 
 * Provides administrative endpoints for:
 * - Viewing pool statistics
 * - Manually triggering reclamation
 * - Closing expired nonces to reclaim rent
 * 
 * ⚠️ These endpoints should be protected by admin authentication in production
 */

import { Router, Request, Response } from 'express';
import { noncePoolManager } from '../offers.routes';

const router = Router();

/**
 * GET /admin/nonce-pool/stats
 * 
 * Get current nonce pool statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await noncePoolManager.getPoolStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        summary: {
          utilizationRate: stats.total > 0 
            ? `${((stats.inUse / stats.total) * 100).toFixed(1)}%` 
            : '0%',
          availableRate: stats.total > 0 
            ? `${((stats.available / stats.total) * 100).toFixed(1)}%` 
            : '0%',
          expiredRate: stats.total > 0 
            ? `${((stats.expired / stats.total) * 100).toFixed(1)}%` 
            : '0%',
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin/NoncePool] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get nonce pool statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /admin/nonce-pool/reclaim
 * 
 * Manually trigger reclamation of expired nonces back to the available pool.
 * This advances the nonce (to invalidate old transactions) and returns it to AVAILABLE.
 * 
 * Query params:
 * - batchSize: Maximum number to reclaim (default: 10)
 */
router.post('/reclaim', async (req: Request, res: Response) => {
  try {
    const batchSize = parseInt(req.query.batchSize as string) || 10;
    
    console.log(`[Admin/NoncePool] Manual reclamation triggered (batch size: ${batchSize})`);
    
    const result = await noncePoolManager.reclaimExpiredNonces(batchSize);
    
    res.json({
      success: true,
      data: {
        reclaimed: result.reclaimed,
        failed: result.failed,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
      message: `Reclaimed ${result.reclaimed} nonce account(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin/NoncePool] Error during reclamation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reclaim nonces',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /admin/nonce-pool/close-expired
 * 
 * Close expired nonce accounts and reclaim the rent SOL.
 * Use this to permanently remove stale nonces and recover ~0.00144 SOL per account.
 * 
 * ⚠️ This is destructive - closed nonces cannot be recovered.
 * 
 * Query params:
 * - batchSize: Maximum number to close (default: 5)
 */
router.post('/close-expired', async (req: Request, res: Response) => {
  try {
    const batchSize = parseInt(req.query.batchSize as string) || 5;
    
    console.log(`[Admin/NoncePool] Close expired nonces triggered (batch size: ${batchSize})`);
    
    const result = await noncePoolManager.closeExpiredNonces(batchSize);
    
    res.json({
      success: true,
      data: {
        closed: result.closed,
        solReclaimed: result.solReclaimed,
        solReclaimedDisplay: `${result.solReclaimed.toFixed(6)} SOL`,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
      message: `Closed ${result.closed} nonce account(s), reclaimed ${result.solReclaimed.toFixed(6)} SOL`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin/NoncePool] Error closing expired nonces:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to close expired nonces',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /admin/nonce-pool/cleanup
 * 
 * Run the full cleanup cycle:
 * 1. Mark old IN_USE nonces as EXPIRED
 * 2. Reclaim EXPIRED nonces back to AVAILABLE
 */
router.post('/cleanup', async (_req: Request, res: Response) => {
  try {
    console.log('[Admin/NoncePool] Manual cleanup triggered');
    
    const result = await noncePoolManager.cleanup();
    
    res.json({
      success: true,
      data: {
        marked: result.marked,
        reclaimed: result.reclaimed,
        failed: result.failed,
      },
      message: `Marked ${result.marked} as expired, reclaimed ${result.reclaimed} to pool${result.failed > 0 ? `, ${result.failed} failed` : ''}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin/NoncePool] Error during cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run cleanup',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

