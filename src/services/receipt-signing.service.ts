/**
 * Receipt Signing Service
 *
 * Provides cryptographic signing functionality for settlement receipts
 * using HMAC-SHA256 to create tamper-proof signatures
 */

import crypto from 'crypto';
import { config } from '../config';

/**
 * Receipt data structure for signing
 */
export interface ReceiptData {
  agreementId: string;
  nftMint: string;
  price: string;
  platformFee: string;
  creatorRoyalty?: string;
  buyer: string;
  seller: string;
  escrowTxId: string;
  settlementTxId: string;
  createdAt: string;
  settledAt: string;
}

/**
 * Receipt Signing Service Class
 */
export class ReceiptSigningService {
  private signingKey: string;

  constructor(signingKey?: string) {
    // Use provided key or fall back to environment variable or a default for development
    this.signingKey = signingKey || 
      process.env.RECEIPT_SIGNING_KEY || 
      config.security?.receiptSigningKey ||
      this.generateDefaultKey();

    // Warn only if no key is provided from any source
    if (!signingKey && !process.env.RECEIPT_SIGNING_KEY && !config.security?.receiptSigningKey) {
      console.warn('[ReceiptSigningService] Using default signing key. Set RECEIPT_SIGNING_KEY env var for production!');
    }
  }

  /**
   * Generate a default signing key for development
   * In production, this should NEVER be used
   */
  private generateDefaultKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a deterministic hash from receipt data
   * This creates a canonical string representation that can be verified later
   */
  generateReceiptHash(receiptData: ReceiptData): string {
    // Create a canonical string representation
    // Order is important for deterministic hash generation
    const canonicalData = [
      receiptData.agreementId,
      receiptData.nftMint,
      receiptData.price,
      receiptData.platformFee,
      receiptData.creatorRoyalty || '0',
      receiptData.buyer,
      receiptData.seller,
      receiptData.escrowTxId,
      receiptData.settlementTxId,
      receiptData.createdAt,
      receiptData.settledAt,
    ].join('|');

    // Generate SHA-256 hash of canonical data
    const hash = crypto
      .createHash('sha256')
      .update(canonicalData)
      .digest('hex');

    return hash;
  }

  /**
   * Sign a receipt hash with the server's private key
   * Uses HMAC-SHA256 for cryptographic signing
   */
  signReceiptHash(receiptHash: string): string {
    const signature = crypto
      .createHmac('sha256', this.signingKey)
      .update(receiptHash)
      .digest('hex');

    return signature;
  }

  /**
   * Verify a receipt signature
   * Returns true if the signature is valid for the given hash
   */
  verifySignature(receiptHash: string, signature: string): boolean {
    try {
      const expectedSignature = this.signReceiptHash(receiptHash);
      
      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(signature, 'hex')
      );
    } catch (error) {
      console.error('[ReceiptSigningService] Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Generate hash and signature for receipt data in one call
   * This is the primary method used when generating new receipts
   */
  generateHashAndSignature(receiptData: ReceiptData): {
    receiptHash: string;
    signature: string;
  } {
    const receiptHash = this.generateReceiptHash(receiptData);
    const signature = this.signReceiptHash(receiptHash);

    return {
      receiptHash,
      signature,
    };
  }

  /**
   * Verify a complete receipt by regenerating the hash and checking the signature
   */
  verifyReceipt(receiptData: ReceiptData, signature: string): {
    isValid: boolean;
    receiptHash: string;
  } {
    const receiptHash = this.generateReceiptHash(receiptData);
    const isValid = this.verifySignature(receiptHash, signature);

    return {
      isValid,
      receiptHash,
    };
  }
}

// Singleton instance
let receiptSigningServiceInstance: ReceiptSigningService | null = null;

/**
 * Get or create receipt signing service singleton instance
 */
export function getReceiptSigningService(signingKey?: string): ReceiptSigningService {
  if (!receiptSigningServiceInstance) {
    receiptSigningServiceInstance = new ReceiptSigningService(signingKey);
  }
  return receiptSigningServiceInstance;
}

/**
 * Reset receipt signing service instance (useful for testing)
 */
export function resetReceiptSigningService(): void {
  receiptSigningServiceInstance = null;
}

export default ReceiptSigningService;

