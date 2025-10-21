/**
 * Health Check Routes
 * 
 * Provides detailed health check endpoints for monitoring system status,
 * including RPC connection health and performance metrics.
 */

import { Router, Request, Response } from 'express';
import { getSolanaService } from '../services/solana.service';

const router = Router();

/**
 * GET /health/rpc
 * 
 * Returns detailed RPC endpoint status including:
 * - Primary and fallback endpoint health
 * - Response times and latency
 * - Success rates and failure counts
 * - Failover status
 */
router.get('/rpc', async (_req: Request, res: Response) => {
  try {
    const solanaService = getSolanaService();
    const rpcStatus = solanaService.getRpcStatus();
    
    // Calculate success rates
    const primarySuccessRate = rpcStatus.primary.totalRequests > 0
      ? ((rpcStatus.primary.successfulRequests / rpcStatus.primary.totalRequests) * 100).toFixed(2)
      : 'N/A';
    
    const fallbackSuccessRate = rpcStatus.fallback && rpcStatus.fallback.totalRequests > 0
      ? ((rpcStatus.fallback.successfulRequests / rpcStatus.fallback.totalRequests) * 100).toFixed(2)
      : 'N/A';
    
    // Determine overall health
    const isHealthy = rpcStatus.primary.isHealthy || (rpcStatus.fallback?.isHealthy ?? false);
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      usingFallback: rpcStatus.usingFallback,
      primary: {
        url: maskApiKey(rpcStatus.primary.url),
        healthy: rpcStatus.primary.isHealthy,
        lastCheck: rpcStatus.primary.lastCheck,
        responseTime: rpcStatus.primary.lastResponseTime 
          ? `${rpcStatus.primary.lastResponseTime}ms` 
          : null,
        totalRequests: rpcStatus.primary.totalRequests,
        successfulRequests: rpcStatus.primary.successfulRequests,
        failureCount: rpcStatus.primary.failureCount,
        successRate: `${primarySuccessRate}%`,
      },
      fallback: rpcStatus.fallback ? {
        url: maskApiKey(rpcStatus.fallback.url),
        healthy: rpcStatus.fallback.isHealthy,
        lastCheck: rpcStatus.fallback.lastCheck,
        responseTime: rpcStatus.fallback.lastResponseTime 
          ? `${rpcStatus.fallback.lastResponseTime}ms` 
          : null,
        totalRequests: rpcStatus.fallback.totalRequests,
        successfulRequests: rpcStatus.fallback.successfulRequests,
        failureCount: rpcStatus.fallback.failureCount,
        successRate: `${fallbackSuccessRate}%`,
      } : null,
    });
  } catch (error) {
    console.error('[Health Check] Error getting RPC status:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Mask API keys in URLs for security
 * @param url - The URL that may contain an API key
 * @returns URL with masked API key
 */
function maskApiKey(url: string): string {
  try {
    const urlObj = new URL(url);
    const apiKey = urlObj.searchParams.get('api-key');
    
    if (apiKey && apiKey.length > 8) {
      // Show first 4 and last 4 characters of API key
      const masked = `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
      urlObj.searchParams.set('api-key', masked);
      return urlObj.toString();
    }
    
    return url;
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}

export default router;

