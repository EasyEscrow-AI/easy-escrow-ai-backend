/**
 * Transaction Log Service
 * 
 * Captures and stores transaction IDs (txids) from blockchain operations
 * throughout the escrow lifecycle (init, deposits, settle, cancel).
 * Provides log aggregation and search capabilities for debugging and receipts.
 */

import { PrismaClient, TransactionLog } from '../generated/prisma';
import { Connection, PublicKey } from '@solana/web3.js';

const prisma = new PrismaClient();

/**
 * Operation types for transaction logging
 */
export enum TransactionOperationType {
  INIT_ESCROW = 'INIT_ESCROW',
  DEPOSIT_USDC = 'DEPOSIT_USDC',
  DEPOSIT_NFT = 'DEPOSIT_NFT',
  SETTLE = 'SETTLE',
  CANCEL = 'CANCEL',
  REFUND = 'REFUND',
  OTHER = 'OTHER',
}

/**
 * Transaction status types
 */
export enum TransactionStatusType {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  FINALIZED = 'FINALIZED',
}

/**
 * Transaction log input data
 */
export interface CreateTransactionLogInput {
  txId: string;
  operationType: TransactionOperationType | string;
  agreementId?: string;
  status?: TransactionStatusType | string;
  blockHeight?: bigint | number;
  slot?: bigint | number;
  errorMessage?: string;
}

/**
 * Transaction log query filters
 */
export interface TransactionLogQuery {
  agreementId?: string;
  operationType?: TransactionOperationType | string;
  status?: TransactionStatusType | string;
  txId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'blockHeight';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Transaction log with extended information
 */
export interface TransactionLogWithDetails extends TransactionLog {
  explorerUrl?: string;
}

/**
 * Transaction Log Service Class
 * 
 * Provides methods for capturing, storing, and querying transaction logs.
 */
export class TransactionLogService {
  private connection?: Connection;
  private explorerBaseUrl: string;

  constructor(connection?: Connection, explorerBaseUrl?: string) {
    this.connection = connection;
    this.explorerBaseUrl = explorerBaseUrl || 'https://explorer.solana.com/tx';
  }

  /**
   * Capture and store a transaction log
   */
  async captureTransaction(input: CreateTransactionLogInput): Promise<TransactionLog> {
    try {
      console.log('[TransactionLogService] Capturing transaction:', {
        txId: input.txId,
        operationType: input.operationType,
        agreementId: input.agreementId,
      });

      // Check if transaction already exists
      const existing = await prisma.transactionLog.findUnique({
        where: { txId: input.txId },
      });

      if (existing) {
        console.log('[TransactionLogService] Transaction already logged:', input.txId);
        return existing;
      }

      // Create new transaction log
      const transactionLog = await prisma.transactionLog.create({
        data: {
          txId: input.txId,
          operationType: input.operationType,
          agreementId: input.agreementId || null,
          status: input.status || TransactionStatusType.PENDING,
          blockHeight: input.blockHeight ? BigInt(input.blockHeight) : null,
          slot: input.slot ? BigInt(input.slot) : null,
          errorMessage: input.errorMessage || null,
          timestamp: new Date(),
        },
      });

      console.log('[TransactionLogService] Transaction logged successfully:', transactionLog.id);

      // If connection is available, fetch additional details asynchronously
      if (this.connection && !input.blockHeight) {
        this.enrichTransactionData(transactionLog.txId).catch((error) => {
          console.error('[TransactionLogService] Error enriching transaction data:', error);
        });
      }

      return transactionLog;
    } catch (error) {
      console.error('[TransactionLogService] Error capturing transaction:', error);
      throw new Error(`Failed to capture transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enrich transaction data by fetching blockchain information
   */
  private async enrichTransactionData(txId: string): Promise<void> {
    try {
      if (!this.connection) {
        return;
      }

      // Skip mock transaction IDs
      if (txId.includes('_tx_') || txId.startsWith('mock_')) {
        return;
      }

      console.log('[TransactionLogService] Enriching transaction data:', txId);

      // Fetch transaction details from blockchain
      const transaction = await this.connection.getTransaction(txId, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });

      if (transaction) {
        await prisma.transactionLog.update({
          where: { txId },
          data: {
            // In Solana, slot is the equivalent of block height
            blockHeight: transaction.slot ? BigInt(transaction.slot) : null,
            slot: transaction.slot ? BigInt(transaction.slot) : null,
            status: transaction.meta?.err ? TransactionStatusType.FAILED : TransactionStatusType.CONFIRMED,
            errorMessage: transaction.meta?.err ? JSON.stringify(transaction.meta.err) : null,
          },
        });

        console.log('[TransactionLogService] Transaction enriched successfully:', txId);
      }
    } catch (error) {
      console.error('[TransactionLogService] Error enriching transaction data:', error);
      // Don't throw error - enrichment is optional
    }
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    txId: string,
    status: TransactionStatusType | string,
    errorMessage?: string
  ): Promise<TransactionLog> {
    try {
      const transactionLog = await prisma.transactionLog.update({
        where: { txId },
        data: {
          status,
          errorMessage: errorMessage || null,
        },
      });

      console.log('[TransactionLogService] Transaction status updated:', {
        txId,
        status,
      });

      return transactionLog;
    } catch (error) {
      console.error('[TransactionLogService] Error updating transaction status:', error);
      throw new Error(`Failed to update transaction status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(txId: string): Promise<TransactionLogWithDetails | null> {
    try {
      const transactionLog = await prisma.transactionLog.findUnique({
        where: { txId },
      });

      if (!transactionLog) {
        return null;
      }

      return this.addExplorerUrl(transactionLog);
    } catch (error) {
      console.error('[TransactionLogService] Error getting transaction:', error);
      throw new Error(`Failed to get transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get transactions for an agreement
   */
  async getTransactionsByAgreement(agreementId: string): Promise<TransactionLogWithDetails[]> {
    try {
      const transactionLogs = await prisma.transactionLog.findMany({
        where: { agreementId },
        orderBy: { timestamp: 'asc' },
      });

      return transactionLogs.map((log) => this.addExplorerUrl(log));
    } catch (error) {
      console.error('[TransactionLogService] Error getting transactions by agreement:', error);
      throw new Error(`Failed to get transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search transaction logs with filters
   */
  async searchTransactionLogs(query: TransactionLogQuery): Promise<{
    logs: TransactionLogWithDetails[];
    total: number;
    limit: number;
    offset: number;
  }> {
    try {
      const limit = Math.min(query.limit || 50, 100); // Max 100
      const offset = query.offset || 0;

      // Build where clause
      const where: any = {};

      if (query.agreementId) {
        where.agreementId = query.agreementId;
      }

      if (query.operationType) {
        where.operationType = query.operationType;
      }

      if (query.status) {
        where.status = query.status;
      }

      if (query.txId) {
        where.txId = { contains: query.txId };
      }

      if (query.dateFrom || query.dateTo) {
        where.timestamp = {};
        if (query.dateFrom) {
          where.timestamp.gte = query.dateFrom;
        }
        if (query.dateTo) {
          where.timestamp.lte = query.dateTo;
        }
      }

      // Build order by
      const orderBy: any = {};
      orderBy[query.sortBy || 'timestamp'] = query.sortOrder || 'desc';

      // Execute query
      const [logs, total] = await Promise.all([
        prisma.transactionLog.findMany({
          where,
          orderBy,
          take: limit,
          skip: offset,
        }),
        prisma.transactionLog.count({ where }),
      ]);

      return {
        logs: logs.map((log) => this.addExplorerUrl(log)),
        total,
        limit,
        offset,
      };
    } catch (error) {
      console.error('[TransactionLogService] Error searching transaction logs:', error);
      throw new Error(`Failed to search transaction logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get transaction statistics for an agreement
   */
  async getAgreementTransactionStats(agreementId: string): Promise<{
    totalTransactions: number;
    byOperationType: Record<string, number>;
    byStatus: Record<string, number>;
    firstTransaction?: Date;
    lastTransaction?: Date;
  }> {
    try {
      const logs = await prisma.transactionLog.findMany({
        where: { agreementId },
        orderBy: { timestamp: 'asc' },
      });

      if (logs.length === 0) {
        return {
          totalTransactions: 0,
          byOperationType: {},
          byStatus: {},
        };
      }

      // Count by operation type
      const byOperationType: Record<string, number> = {};
      logs.forEach((log) => {
        byOperationType[log.operationType] = (byOperationType[log.operationType] || 0) + 1;
      });

      // Count by status
      const byStatus: Record<string, number> = {};
      logs.forEach((log) => {
        byStatus[log.status] = (byStatus[log.status] || 0) + 1;
      });

      return {
        totalTransactions: logs.length,
        byOperationType,
        byStatus,
        firstTransaction: logs[0].timestamp,
        lastTransaction: logs[logs.length - 1].timestamp,
      };
    } catch (error) {
      console.error('[TransactionLogService] Error getting transaction stats:', error);
      throw new Error(`Failed to get transaction stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete old transaction logs (cleanup)
   */
  async cleanupOldLogs(olderThanDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await prisma.transactionLog.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
        },
      });

      console.log(`[TransactionLogService] Cleaned up ${result.count} old transaction logs`);

      return result.count;
    } catch (error) {
      console.error('[TransactionLogService] Error cleaning up old logs:', error);
      throw new Error(`Failed to cleanup old logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add explorer URL to transaction log
   */
  private addExplorerUrl(log: TransactionLog): TransactionLogWithDetails {
    return {
      ...log,
      explorerUrl: `${this.explorerBaseUrl}/${log.txId}`,
    };
  }

  /**
   * Get recent failed transactions
   */
  async getRecentFailedTransactions(limit: number = 10): Promise<TransactionLogWithDetails[]> {
    try {
      const logs = await prisma.transactionLog.findMany({
        where: {
          status: TransactionStatusType.FAILED,
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return logs.map((log) => this.addExplorerUrl(log));
    } catch (error) {
      console.error('[TransactionLogService] Error getting failed transactions:', error);
      throw new Error(`Failed to get failed transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Singleton instance
let transactionLogServiceInstance: TransactionLogService | null = null;

/**
 * Get or create transaction log service singleton instance
 */
export function getTransactionLogService(
  connection?: Connection,
  explorerBaseUrl?: string
): TransactionLogService {
  if (!transactionLogServiceInstance) {
    transactionLogServiceInstance = new TransactionLogService(connection, explorerBaseUrl);
  }
  return transactionLogServiceInstance;
}

/**
 * Reset transaction log service instance (useful for testing)
 */
export function resetTransactionLogService(): void {
  transactionLogServiceInstance = null;
}

export default TransactionLogService;

