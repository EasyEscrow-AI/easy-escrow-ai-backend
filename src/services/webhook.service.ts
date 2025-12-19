import { PrismaClient, WebhookEventType, WebhookDeliveryStatus } from '../generated/prisma';
import crypto from 'crypto';
import https from 'https';
import http from 'http';

// Webhook event payload interfaces
export interface BaseWebhookPayload {
  eventType: WebhookEventType;
  timestamp: string;
  agreementId: string;
}

export interface EscrowFundedPayload extends BaseWebhookPayload {
  eventType: 'ESCROW_FUNDED';
  price: string;
  seller: string;
  buyer: string;
  nftMint: string;
  escrowPda: string;
}

export interface EscrowAssetLockedPayload extends BaseWebhookPayload {
  eventType: 'ESCROW_ASSET_LOCKED';
  assetType: 'SOL' | 'NFT';
  depositor: string;
  amount?: string;
  tokenAccount?: string;
  txId: string;
}

export interface EscrowSettledPayload extends BaseWebhookPayload {
  eventType: 'ESCROW_SETTLED';
  nftMint: string;
  price: string;
  platformFee: string;
  creatorRoyalty?: string;
  sellerReceived: string;
  buyer: string;
  seller: string;
  settleTxId: string;
}

export interface EscrowExpiredPayload extends BaseWebhookPayload {
  eventType: 'ESCROW_EXPIRED';
  expiry: string;
  status: string;
}

export interface EscrowRefundedPayload extends BaseWebhookPayload {
  eventType: 'ESCROW_REFUNDED';
  cancelTxId: string;
  refundedTo: string;
}

export type WebhookPayload =
  | EscrowFundedPayload
  | EscrowAssetLockedPayload
  | EscrowSettledPayload
  | EscrowExpiredPayload
  | EscrowRefundedPayload;

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  enabled: boolean;
  createdBy?: string; // User/organization identifier
}

export class WebhookService {
  private prisma: PrismaClient;
  private webhookConfigs: Map<string, WebhookConfig>;
  private deliveryQueue: WebhookPayload[];
  private isProcessing: boolean;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
    this.webhookConfigs = new Map();
    this.deliveryQueue = [];
    this.isProcessing = false;
    
    // Load webhook configurations from environment or database
    this.loadWebhookConfigs();
  }

  /**
   * Load webhook configurations from environment variables
   * In a production system, this would load from a database table
   */
  private loadWebhookConfigs(): void {
    // Example: Load from environment variables
    // WEBHOOK_URL_1=https://example.com/webhook
    // WEBHOOK_SECRET_1=your-secret-key
    // WEBHOOK_EVENTS_1=ESCROW_FUNDED,ESCROW_SETTLED
    
    const webhookUrl = process.env.WEBHOOK_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const webhookEvents = process.env.WEBHOOK_EVENTS;

    if (webhookUrl && webhookSecret) {
      const events = webhookEvents
        ? webhookEvents.split(',').map(e => e.trim() as WebhookEventType)
        : Object.values(WebhookEventType);

      this.webhookConfigs.set('default', {
        id: 'default',
        url: webhookUrl,
        secret: webhookSecret,
        events,
        enabled: true,
      });

      console.log(`Loaded webhook configuration for URL: ${webhookUrl}`);
      console.log(`Listening for events: ${events.join(', ')}`);
    }
  }

  /**
   * Register a new webhook configuration
   */
  public registerWebhook(config: WebhookConfig): void {
    // Validate URL format
    try {
      new URL(config.url);
    } catch (error) {
      throw new Error(`Invalid webhook URL: ${config.url}`);
    }

    // Validate secret
    if (!config.secret || config.secret.length < 16) {
      throw new Error('Webhook secret must be at least 16 characters long');
    }

    this.webhookConfigs.set(config.id, config);
    console.log(`Registered webhook: ${config.id} -> ${config.url}`);
  }

  /**
   * Unregister a webhook configuration
   */
  public unregisterWebhook(id: string): boolean {
    return this.webhookConfigs.delete(id);
  }

  /**
   * Get all registered webhook configurations
   */
  public getWebhookConfigs(): WebhookConfig[] {
    return Array.from(this.webhookConfigs.values());
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   */
  public verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Publish a webhook event
   * This creates webhook delivery records and queues them for delivery
   */
  public async publishEvent(payload: WebhookPayload): Promise<void> {
    console.log(`Publishing webhook event: ${payload.eventType} for agreement ${payload.agreementId}`);

    // Find all webhook configs that listen to this event type
    const relevantConfigs = Array.from(this.webhookConfigs.values()).filter(
      (config) => config.enabled && config.events.includes(payload.eventType)
    );

    if (relevantConfigs.length === 0) {
      console.log(`No webhook configurations found for event: ${payload.eventType}`);
      return;
    }

    // Create webhook delivery records for each config
    for (const config of relevantConfigs) {
      const payloadString = JSON.stringify(payload);
      const signature = this.generateSignature(payloadString, config.secret);

      await this.prisma.webhook.create({
        data: {
          agreementId: payload.agreementId,
          eventType: payload.eventType,
          targetUrl: config.url,
          payload: payload as any,
          status: WebhookDeliveryStatus.PENDING,
          attempts: 0,
          maxAttempts: 5,
          signature,
          scheduledFor: new Date(),
        },
      });

      console.log(`Created webhook delivery record for ${config.url}`);
    }

    // Start processing queue if not already running
    this.startProcessing();
  }

  /**
   * Start processing the webhook delivery queue
   */
  private startProcessing(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.processQueue().finally(() => {
      this.isProcessing = false;
    });
  }

  /**
   * Process pending webhooks from the database
   */
  private async processQueue(): Promise<void> {
    try {
      // Fetch pending webhooks that are due for delivery
      const pendingWebhooks = await this.prisma.webhook.findMany({
        where: {
          status: {
            in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.RETRYING],
          },
          attempts: {
            lt: this.prisma.webhook.fields.maxAttempts,
          },
          scheduledFor: {
            lte: new Date(),
          },
        },
        orderBy: {
          scheduledFor: 'asc',
        },
        take: 10, // Process 10 at a time
      });

      console.log(`Processing ${pendingWebhooks.length} pending webhooks`);

      // Process each webhook
      for (const webhook of pendingWebhooks) {
        await this.deliverWebhook(webhook.id);
      }

      // If there are more webhooks to process, schedule next batch
      if (pendingWebhooks.length > 0) {
        setTimeout(() => this.processQueue(), 1000); // Process next batch after 1 second
      }
    } catch (error) {
      console.error('Error processing webhook queue:', error);
    }
  }

  /**
   * Deliver a single webhook with retry logic
   */
  private async deliverWebhook(webhookId: string): Promise<void> {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      console.error(`Webhook ${webhookId} not found`);
      return;
    }

    console.log(`Attempting delivery ${webhook.attempts + 1}/${webhook.maxAttempts} for webhook ${webhookId}`);

    try {
      const payloadString = JSON.stringify(webhook.payload);
      const url = new URL(webhook.targetUrl);

      // Make HTTP request with timeout
      const response = await this.makeHttpRequest(
        url,
        payloadString,
        webhook.signature || ''
      );

      // Success (2xx response)
      if (response.statusCode >= 200 && response.statusCode < 300) {
        await this.prisma.webhook.update({
          where: { id: webhookId },
          data: {
            status: WebhookDeliveryStatus.DELIVERED,
            attempts: webhook.attempts + 1,
            lastAttemptAt: new Date(),
            lastResponseCode: response.statusCode,
            lastResponseBody: response.body.substring(0, 1000), // Limit to 1000 chars
            deliveredAt: new Date(),
          },
        });

        console.log(`Successfully delivered webhook ${webhookId}`);
        return;
      }

      // Non-success response - retry
      throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to deliver webhook ${webhookId}:`, errorMessage);

      const newAttempts = webhook.attempts + 1;
      const shouldRetry = newAttempts < webhook.maxAttempts;

      if (shouldRetry) {
        // Calculate exponential backoff delay
        const backoffDelay = Math.min(
          1000 * Math.pow(2, newAttempts), // Exponential: 2s, 4s, 8s, 16s, 32s
          60000 // Max 60 seconds
        );
        const nextScheduledFor = new Date(Date.now() + backoffDelay);

        await this.prisma.webhook.update({
          where: { id: webhookId },
          data: {
            status: WebhookDeliveryStatus.RETRYING,
            attempts: newAttempts,
            lastAttemptAt: new Date(),
            lastResponseCode: 0,
            lastResponseBody: errorMessage.substring(0, 1000),
            scheduledFor: nextScheduledFor,
          },
        });

        console.log(`Scheduled retry for webhook ${webhookId} at ${nextScheduledFor.toISOString()}`);
      } else {
        // Max attempts reached - mark as failed
        await this.prisma.webhook.update({
          where: { id: webhookId },
          data: {
            status: WebhookDeliveryStatus.FAILED,
            attempts: newAttempts,
            lastAttemptAt: new Date(),
            lastResponseCode: 0,
            lastResponseBody: errorMessage.substring(0, 1000),
          },
        });

        console.error(`Webhook ${webhookId} failed after ${newAttempts} attempts`);
      }
    }
  }

  /**
   * Make HTTP request with timeout
   */
  private makeHttpRequest(
    url: URL,
    payload: string,
    signature: string
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const protocol = url.protocol === 'https:' ? https : http;
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-Webhook-Signature': signature,
          'User-Agent': 'EasyEscrow-Webhook/1.0',
        },
        timeout: 10000, // 10 second timeout
      };

      const req = protocol.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body,
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Retry a failed webhook delivery
   */
  public async retryWebhook(webhookId: string): Promise<void> {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found`);
    }

    // Reset webhook for retry
    await this.prisma.webhook.update({
      where: { id: webhookId },
      data: {
        status: WebhookDeliveryStatus.PENDING,
        scheduledFor: new Date(),
        attempts: 0, // Reset attempts
      },
    });

    console.log(`Reset webhook ${webhookId} for manual retry`);
    this.startProcessing();
  }

  /**
   * Get webhook delivery status
   */
  public async getWebhookStatus(webhookId: string) {
    return await this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });
  }

  /**
   * Get all webhooks for an agreement
   */
  public async getWebhooksForAgreement(agreementId: string) {
    return await this.prisma.webhook.findMany({
      where: { agreementId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Clean up old delivered webhooks (optional maintenance task)
   */
  public async cleanupOldWebhooks(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.prisma.webhook.deleteMany({
      where: {
        status: WebhookDeliveryStatus.DELIVERED,
        deliveredAt: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`Cleaned up ${result.count} old webhook records`);
    return result.count;
  }
}

// Export singleton instance
export const webhookService = new WebhookService();

