/**
 * Receipt Service
 *
 * Handles generation, storage, and retrieval of settlement receipts
 * with cryptographic signatures for tamper-proof transaction records
 */

import { prisma } from '../config/database';
import { getReceiptSigningService } from './receipt-signing.service';
import { ReceiptDTO, CreateReceiptDTO, ReceiptQueryDTO, ReceiptVerificationDTO } from '../models/dto/receipt.dto';
import { Receipt } from '../generated/prisma';

/**
 * Receipt generation result
 */
export interface ReceiptGenerationResult {
  success: boolean;
  receipt?: ReceiptDTO;
  error?: string;
}

/**
 * Receipt Service Class
 */
export class ReceiptService {
  private signingService: ReturnType<typeof getReceiptSigningService>;

  constructor() {
    this.signingService = getReceiptSigningService();
    console.log('[ReceiptService] Initialized');
  }

  /**
   * Generate a settlement receipt from settlement data
   * This is typically called automatically after a successful settlement
   */
  async generateReceipt(receiptData: CreateReceiptDTO): Promise<ReceiptGenerationResult> {
    try {
      console.log(`[ReceiptService] Generating receipt for agreement: ${receiptData.agreementId}`);

      // Check if receipt already exists for this agreement
      const existingReceipt = await prisma.receipt.findUnique({
        where: { agreementId: receiptData.agreementId },
      });

      if (existingReceipt) {
        console.log(`[ReceiptService] Receipt already exists for agreement: ${receiptData.agreementId}`);
        return {
          success: true,
          receipt: this.mapReceiptToDTO(existingReceipt),
        };
      }

      // Normalize dates to ISO strings
      const createdAt = typeof receiptData.createdAt === 'string' 
        ? receiptData.createdAt 
        : receiptData.createdAt.toISOString();
      
      const settledAt = typeof receiptData.settledAt === 'string'
        ? receiptData.settledAt
        : receiptData.settledAt.toISOString();

      // Generate hash and signature
      const { receiptHash, signature } = this.signingService.generateHashAndSignature({
        agreementId: receiptData.agreementId,
        nftMint: receiptData.nftMint,
        price: receiptData.price,
        platformFee: receiptData.platformFee,
        creatorRoyalty: receiptData.creatorRoyalty,
        buyer: receiptData.buyer,
        seller: receiptData.seller,
        escrowTxId: receiptData.escrowTxId,
        settlementTxId: receiptData.settlementTxId,
        createdAt,
        settledAt,
      });

      console.log(`[ReceiptService] Generated receipt hash: ${receiptHash}`);

      // Store receipt in database
      const receipt = await prisma.receipt.create({
        data: {
          agreementId: receiptData.agreementId,
          nftMint: receiptData.nftMint,
          price: receiptData.price,
          platformFee: receiptData.platformFee,
          creatorRoyalty: receiptData.creatorRoyalty || null,
          buyer: receiptData.buyer,
          seller: receiptData.seller,
          escrowTxId: receiptData.escrowTxId,
          settlementTxId: receiptData.settlementTxId,
          receiptHash,
          signature,
          createdAt: new Date(createdAt),
          settledAt: new Date(settledAt),
          generatedAt: new Date(),
        },
      });

      console.log(`[ReceiptService] Receipt generated successfully: ${receipt.id}`);

      return {
        success: true,
        receipt: this.mapReceiptToDTO(receipt),
      };
    } catch (error) {
      console.error('[ReceiptService] Error generating receipt:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate receipt',
      };
    }
  }

  /**
   * Get receipt by ID
   */
  async getReceiptById(receiptId: string): Promise<ReceiptDTO | null> {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id: receiptId },
      });

      if (!receipt) {
        return null;
      }

      return this.mapReceiptToDTO(receipt);
    } catch (error) {
      console.error('[ReceiptService] Error getting receipt by ID:', error);
      throw error;
    }
  }

  /**
   * Get receipt by agreement ID
   */
  async getReceiptByAgreementId(agreementId: string): Promise<ReceiptDTO | null> {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { agreementId },
      });

      if (!receipt) {
        return null;
      }

      return this.mapReceiptToDTO(receipt);
    } catch (error) {
      console.error('[ReceiptService] Error getting receipt by agreement ID:', error);
      throw error;
    }
  }

  /**
   * Get receipt by hash
   */
  async getReceiptByHash(receiptHash: string): Promise<ReceiptDTO | null> {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { receiptHash },
      });

      if (!receipt) {
        return null;
      }

      return this.mapReceiptToDTO(receipt);
    } catch (error) {
      console.error('[ReceiptService] Error getting receipt by hash:', error);
      throw error;
    }
  }

  /**
   * List receipts with filters and pagination
   */
  async listReceipts(query: ReceiptQueryDTO): Promise<{
    receipts: ReceiptDTO[];
    page: number;
    limit: number;
    total: number;
  }> {
    try {
      const page = query.page || 1;
      const limit = Math.min(query.limit || 20, 100); // Max 100 per page
      const skip = (page - 1) * limit;

      // Build filter conditions
      const where: any = {};

      if (query.agreementId) {
        where.agreementId = query.agreementId;
      }

      if (query.buyer) {
        where.buyer = query.buyer;
      }

      if (query.seller) {
        where.seller = query.seller;
      }

      if (query.nftMint) {
        where.nftMint = query.nftMint;
      }

      // Date range filter
      if (query.startDate || query.endDate) {
        where.generatedAt = {};
        
        if (query.startDate) {
          where.generatedAt.gte = new Date(query.startDate);
        }
        
        if (query.endDate) {
          where.generatedAt.lte = new Date(query.endDate);
        }
      }

      // Execute queries
      const [receipts, total] = await Promise.all([
        prisma.receipt.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            generatedAt: 'desc',
          },
        }),
        prisma.receipt.count({ where }),
      ]);

      return {
        receipts: receipts.map((receipt) => this.mapReceiptToDTO(receipt)),
        page,
        limit,
        total,
      };
    } catch (error) {
      console.error('[ReceiptService] Error listing receipts:', error);
      throw error;
    }
  }

  /**
   * Verify a receipt's signature
   */
  async verifyReceipt(receiptId: string): Promise<ReceiptVerificationDTO> {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id: receiptId },
      });

      if (!receipt) {
        throw new Error('Receipt not found');
      }

      // Verify the signature
      const verification = this.signingService.verifyReceipt(
        {
          agreementId: receipt.agreementId,
          nftMint: receipt.nftMint,
          price: receipt.price.toString(),
          platformFee: receipt.platformFee.toString(),
          creatorRoyalty: receipt.creatorRoyalty?.toString(),
          buyer: receipt.buyer,
          seller: receipt.seller,
          escrowTxId: receipt.escrowTxId,
          settlementTxId: receipt.settlementTxId,
          createdAt: receipt.createdAt.toISOString(),
          settledAt: receipt.settledAt.toISOString(),
        },
        receipt.signature
      );

      // Also verify the hash matches what's stored
      const hashMatches = verification.receiptHash === receipt.receiptHash;

      return {
        receiptHash: receipt.receiptHash,
        signature: receipt.signature,
        isValid: verification.isValid && hashMatches,
      };
    } catch (error) {
      console.error('[ReceiptService] Error verifying receipt:', error);
      throw error;
    }
  }

  /**
   * Map database receipt to DTO
   */
  private mapReceiptToDTO(receipt: Receipt): ReceiptDTO {
    return {
      id: receipt.id,
      agreementId: receipt.agreementId,
      nftMint: receipt.nftMint,
      price: receipt.price.toString(),
      platformFee: receipt.platformFee.toString(),
      creatorRoyalty: receipt.creatorRoyalty?.toString(),
      buyer: receipt.buyer,
      seller: receipt.seller,
      escrowTxId: receipt.escrowTxId,
      settlementTxId: receipt.settlementTxId,
      receiptHash: receipt.receiptHash,
      signature: receipt.signature,
      createdAt: receipt.createdAt.toISOString(),
      settledAt: receipt.settledAt.toISOString(),
      generatedAt: receipt.generatedAt.toISOString(),
    };
  }
}

// Singleton instance
let receiptServiceInstance: ReceiptService | null = null;

/**
 * Get or create receipt service singleton instance
 */
export function getReceiptService(): ReceiptService {
  if (!receiptServiceInstance) {
    receiptServiceInstance = new ReceiptService();
  }
  return receiptServiceInstance;
}

/**
 * Reset receipt service instance (useful for testing)
 */
export function resetReceiptService(): void {
  receiptServiceInstance = null;
}

export default ReceiptService;

