/**
 * Idempotency Service
 *
 * Provides idempotency key validation, storage, and duplicate request detection
 * to prevent double-processing of critical operations like agreement creation and settlement.
 */

import { prisma } from '../config/database';
import crypto from 'crypto';

/**
 * Idempotency key record with response data
 */
export interface IdempotencyRecord {
  key: string;
  endpoint: string;
  requestHash: string;
  responseStatus: number;
  responseBody: any;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Idempotency check result
 */
export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  existingResponse?: {
    status: number;
    body: any;
  };
}

/**
 * Idempotency Service Configuration
 */
interface IdempotencyConfig {
  expirationHours?: number; // How long to keep idempotency keys (default: 24 hours)
  cleanupIntervalMinutes?: number; // How often to clean up expired keys (default: 60 minutes)
}

/**
 * Idempotency Service Class
 *
 * Handles idempotency key storage, validation, and duplicate detection
 */
export class IdempotencyService {
  private config: Required<IdempotencyConfig>;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config?: IdempotencyConfig) {
    this.config = {
      expirationHours: config?.expirationHours || 24,
      cleanupIntervalMinutes: config?.cleanupIntervalMinutes || 60,
    };
  }

  /**
   * Start the idempotency service (background cleanup)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[IdempotencyService] Service already running');
      return;
    }

    console.log('[IdempotencyService] Starting idempotency service...');
    
    // Start periodic cleanup of expired keys
    this.startCleanupTimer();
    
    this.isRunning = true;
    console.log('[IdempotencyService] Idempotency service started successfully');
  }

  /**
   * Stop the idempotency service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[IdempotencyService] Service not running');
      return;
    }

    console.log('[IdempotencyService] Stopping idempotency service...');
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.isRunning = false;
    console.log('[IdempotencyService] Idempotency service stopped');
  }

  /**
   * Generate a hash of the request body for duplicate detection
   */
  generateRequestHash(requestBody: any): string {
    const bodyString = JSON.stringify(requestBody);
    return crypto.createHash('sha256').update(bodyString).digest('hex');
  }

  /**
   * Validate idempotency key format
   */
  validateKeyFormat(key: string): boolean {
    // Key should be a non-empty string, typically a UUID or random string
    // At least 16 characters for security
    if (!key || typeof key !== 'string' || key.length < 16) {
      return false;
    }

    // Check for only alphanumeric, hyphens, and underscores
    const validKeyPattern = /^[a-zA-Z0-9_-]+$/;
    return validKeyPattern.test(key);
  }

  /**
   * Check if a request is a duplicate based on idempotency key
   */
  async checkIdempotency(
    idempotencyKey: string,
    endpoint: string,
    requestBody: any
  ): Promise<IdempotencyCheckResult> {
    try {
      // Generate request hash for content validation
      const requestHash = this.generateRequestHash(requestBody);

      // Look for existing idempotency key
      const existingRecord = await prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });

      if (!existingRecord) {
        // No duplicate - this is a new request
        return { isDuplicate: false };
      }

      // Check if key has expired
      if (new Date() > existingRecord.expiresAt) {
        // Expired key - treat as new request and delete old record
        await this.deleteIdempotencyKey(idempotencyKey);
        return { isDuplicate: false };
      }

      // Check if endpoint matches
      if (existingRecord.endpoint !== endpoint) {
        throw new Error(
          `Idempotency key was used for a different endpoint: ${existingRecord.endpoint}`
        );
      }

      // Check if request body matches
      if (existingRecord.requestHash !== requestHash) {
        throw new Error(
          'Idempotency key was used with different request body'
        );
      }

      // This is a duplicate request - return cached response
      console.log(`[IdempotencyService] Duplicate request detected for key: ${idempotencyKey}`);
      
      return {
        isDuplicate: true,
        existingResponse: {
          status: existingRecord.responseStatus,
          body: existingRecord.responseBody,
        },
      };
    } catch (error) {
      console.error('[IdempotencyService] Error checking idempotency:', error);
      throw error;
    }
  }

  /**
   * Store idempotency key with response data
   */
  async storeIdempotency(
    idempotencyKey: string,
    endpoint: string,
    requestBody: any,
    responseStatus: number,
    responseBody: any
  ): Promise<void> {
    try {
      const requestHash = this.generateRequestHash(requestBody);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.config.expirationHours);

      await prisma.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          endpoint,
          requestHash,
          responseStatus,
          responseBody,
          expiresAt,
        },
      });

      console.log(`[IdempotencyService] Stored idempotency key: ${idempotencyKey}`);
    } catch (error) {
      console.error('[IdempotencyService] Error storing idempotency key:', error);
      throw error;
    }
  }

  /**
   * Delete an idempotency key
   */
  async deleteIdempotencyKey(idempotencyKey: string): Promise<void> {
    try {
      await prisma.idempotencyKey.delete({
        where: { key: idempotencyKey },
      });
      
      console.log(`[IdempotencyService] Deleted idempotency key: ${idempotencyKey}`);
    } catch (error) {
      // Ignore if key doesn't exist
      if ((error as any)?.code === 'P2025') {
        return;
      }
      console.error('[IdempotencyService] Error deleting idempotency key:', error);
      throw error;
    }
  }

  /**
   * Start periodic cleanup of expired idempotency keys
   */
  private startCleanupTimer(): void {
    const intervalMs = this.config.cleanupIntervalMinutes * 60 * 1000;
    
    console.log(
      `[IdempotencyService] Starting cleanup timer (interval: ${this.config.cleanupIntervalMinutes} minutes)`
    );

    // Run cleanup immediately
    this.cleanupExpiredKeys();

    // Then run periodically
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredKeys();
    }, intervalMs);
  }

  /**
   * Clean up expired idempotency keys
   */
  private async cleanupExpiredKeys(): Promise<void> {
    try {
      console.log('[IdempotencyService] Running expired keys cleanup...');
      
      const result = await prisma.idempotencyKey.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        console.log(`[IdempotencyService] Cleaned up ${result.count} expired idempotency keys`);
      }
    } catch (error) {
      console.error('[IdempotencyService] Error cleaning up expired keys:', error);
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean;
    expirationHours: number;
    cleanupIntervalMinutes: number;
  } {
    return {
      isRunning: this.isRunning,
      expirationHours: this.config.expirationHours,
      cleanupIntervalMinutes: this.config.cleanupIntervalMinutes,
    };
  }
}

// Singleton instance
let idempotencyServiceInstance: IdempotencyService | null = null;

/**
 * Get or create idempotency service singleton instance
 */
export function getIdempotencyService(config?: IdempotencyConfig): IdempotencyService {
  if (!idempotencyServiceInstance) {
    idempotencyServiceInstance = new IdempotencyService(config);
  }
  return idempotencyServiceInstance;
}

/**
 * Reset idempotency service instance (useful for testing)
 */
export function resetIdempotencyService(): void {
  if (idempotencyServiceInstance) {
    idempotencyServiceInstance.stop().catch(console.error);
    idempotencyServiceInstance = null;
  }
}

export default IdempotencyService;

