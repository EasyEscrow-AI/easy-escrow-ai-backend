/**
 * Metrics Routes
 *
 * Exposes Prometheus metrics endpoint for scraping by monitoring systems.
 * Also provides additional observability endpoints for debugging and health checks.
 *
 * Endpoints:
 * - GET /metrics - Prometheus metrics in text format
 * - GET /metrics/health - Metrics service health check
 * - GET /metrics/json - Metrics in JSON format (for debugging)
 *
 * @see Task 16: Add Monitoring and Observability for Delegation Settlement
 */

import { Router, Request, Response } from 'express';
import { getDelegationMetricsService } from '../services/delegationMetrics.service';

const router = Router();

/**
 * GET /metrics
 *
 * Returns Prometheus metrics in text format.
 * This is the standard endpoint for Prometheus scraping.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const metricsService = getDelegationMetricsService();

    // Set the correct content type for Prometheus
    res.setHeader('Content-Type', metricsService.getContentType());

    // Return metrics in Prometheus format
    const metrics = await metricsService.getMetrics();
    res.send(metrics);
  } catch (error) {
    console.error('[Metrics] Error getting metrics:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /metrics/health
 *
 * Returns health status of the metrics service.
 * Useful for debugging metrics collection issues.
 */
router.get('/health', (_req: Request, res: Response) => {
  try {
    const metricsService = getDelegationMetricsService();
    const isInitialized = metricsService.isInitialized();

    const response = {
      status: isInitialized ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      metricsService: {
        initialized: isInitialized,
        contentType: metricsService.getContentType(),
      },
    };

    res.status(isInitialized ? 200 : 503).json(response);
  } catch (error) {
    console.error('[Metrics] Error checking metrics health:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /metrics/json
 *
 * Returns metrics in JSON format for debugging.
 * Not for production use - use /metrics for Prometheus scraping.
 */
router.get('/json', async (_req: Request, res: Response) => {
  try {
    const metricsService = getDelegationMetricsService();
    const registry = metricsService.getRegistry();

    // Get metrics as JSON (using registry's metricsJSON method)
    const metricsJson = await registry.getMetricsAsJSON();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      metricsCount: metricsJson.length,
      metrics: metricsJson,
    });
  } catch (error) {
    console.error('[Metrics] Error getting metrics as JSON:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
