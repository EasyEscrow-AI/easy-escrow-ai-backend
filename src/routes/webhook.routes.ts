import { Router, Request, Response, NextFunction } from 'express';
import { webhookService } from '../services/webhook.service';
import { param, query, validationResult } from 'express-validator';

const router = Router();

// Validation middleware helper
const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: errors.array(),
    });
  }
  next();
};

/**
 * GET /api/webhooks/:agreementId
 * Get all webhooks for an agreement
 */
router.get(
  '/webhooks/:agreementId',
  [
    param('agreementId').isString().notEmpty().withMessage('Agreement ID is required'),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { agreementId } = req.params;

      const webhooks = await webhookService.getWebhooksForAgreement(agreementId);

      res.status(200).json({
        success: true,
        agreementId,
        count: webhooks.length,
        webhooks: webhooks.map(w => ({
          id: w.id,
          eventType: w.eventType,
          targetUrl: w.targetUrl,
          status: w.status,
          attempts: w.attempts,
          maxAttempts: w.maxAttempts,
          lastAttemptAt: w.lastAttemptAt,
          lastResponseCode: w.lastResponseCode,
          deliveredAt: w.deliveredAt,
          createdAt: w.createdAt,
          scheduledFor: w.scheduledFor,
        })),
      });
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch webhooks',
      });
    }
  }
);

/**
 * GET /api/webhooks/status/:webhookId
 * Get webhook delivery status
 */
router.get(
  '/webhooks/status/:webhookId',
  [
    param('webhookId').isUUID().withMessage('Valid webhook ID is required'),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { webhookId } = req.params;

      const webhook = await webhookService.getWebhookStatus(webhookId);

      if (!webhook) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found',
        });
      }

      res.status(200).json({
        success: true,
        webhook: {
          id: webhook.id,
          agreementId: webhook.agreementId,
          eventType: webhook.eventType,
          targetUrl: webhook.targetUrl,
          status: webhook.status,
          attempts: webhook.attempts,
          maxAttempts: webhook.maxAttempts,
          lastAttemptAt: webhook.lastAttemptAt,
          lastResponseCode: webhook.lastResponseCode,
          lastResponseBody: webhook.lastResponseBody,
          deliveredAt: webhook.deliveredAt,
          createdAt: webhook.createdAt,
          scheduledFor: webhook.scheduledFor,
          payload: webhook.payload,
        },
      });
    } catch (error) {
      console.error('Error fetching webhook status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch webhook status',
      });
    }
  }
);

/**
 * POST /api/webhooks/retry/:webhookId
 * Manually retry a failed webhook delivery
 */
router.post(
  '/webhooks/retry/:webhookId',
  [
    param('webhookId').isUUID().withMessage('Valid webhook ID is required'),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const { webhookId } = req.params;

      // Verify webhook exists
      const webhook = await webhookService.getWebhookStatus(webhookId);
      if (!webhook) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found',
        });
      }

      // Retry webhook
      await webhookService.retryWebhook(webhookId);

      res.status(200).json({
        success: true,
        message: 'Webhook retry initiated',
        webhookId,
      });
    } catch (error) {
      console.error('Error retrying webhook:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry webhook',
      });
    }
  }
);

/**
 * GET /api/webhooks/config
 * Get current webhook configurations
 */
router.get('/webhooks/config', async (req: Request, res: Response) => {
  try {
    const configs = webhookService.getWebhookConfigs();

    res.status(200).json({
      success: true,
      count: configs.length,
      configs: configs.map(c => ({
        id: c.id,
        url: c.url,
        events: c.events,
        enabled: c.enabled,
        // Don't expose the secret
      })),
    });
  } catch (error) {
    console.error('Error fetching webhook configs:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch webhook configs',
    });
  }
});

/**
 * POST /api/webhooks/cleanup
 * Clean up old delivered webhooks
 */
router.post(
  '/webhooks/cleanup',
  [
    query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
    validate,
  ],
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;

      const count = await webhookService.cleanupOldWebhooks(days);

      res.status(200).json({
        success: true,
        message: `Cleaned up ${count} old webhook records`,
        deletedCount: count,
        daysOld: days,
      });
    } catch (error) {
      console.error('Error cleaning up webhooks:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clean up webhooks',
      });
    }
  }
);

export default router;

