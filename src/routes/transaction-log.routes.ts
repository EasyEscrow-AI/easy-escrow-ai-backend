/**
 * Transaction Log Routes
 * 
 * API endpoints for querying and searching transaction logs.
 */

import { Router, Request, Response } from 'express';
import { getTransactionLogService } from '../services/transaction-log.service';
import {
  TransactionLogQueryDTO,
  TransactionLogResponseDTO,
  TransactionLogListResponseDTO,
  TransactionStatsResponseDTO,
  AgreementTransactionsResponseDTO,
} from '../models/dto/transaction-log.dto';
import { TransactionLog } from '../generated/prisma';

const router = Router();

/**
 * Helper function to map TransactionLog to DTO
 */
function mapTransactionLogToDTO(log: any): TransactionLogResponseDTO {
  return {
    id: log.id,
    txId: log.txId,
    operationType: log.operationType,
    agreementId: log.agreementId || undefined,
    status: log.status,
    blockHeight: log.blockHeight?.toString(),
    slot: log.slot?.toString(),
    errorMessage: log.errorMessage || undefined,
    timestamp: log.timestamp.toISOString(),
    explorerUrl: log.explorerUrl,
  };
}

/**
 * GET /v1/transactions
 * 
 * Alias for GET /v1/transactions/logs - List all transaction logs
 * This provides backward compatibility and a cleaner endpoint
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query: TransactionLogQueryDTO = {
      agreementId: req.query.agreementId as string,
      operationType: req.query.operationType as string,
      status: req.query.status as string,
      txId: req.query.txId as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      sortBy: (req.query.sortBy as 'timestamp' | 'blockHeight') || 'timestamp',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const transactionLogService = getTransactionLogService();

    const result = await transactionLogService.searchTransactionLogs({
      agreementId: query.agreementId,
      operationType: query.operationType,
      status: query.status,
      txId: query.txId,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const response: TransactionLogListResponseDTO = {
      logs: result.logs.map(mapTransactionLogToDTO),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.offset + result.logs.length < result.total,
    };

    res.json(response);
  } catch (error) {
    console.error('Error searching transaction logs:', error);
    res.status(500).json({
      error: 'Failed to search transaction logs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/transactions/logs
 * 
 * Search and filter transaction logs (alternative endpoint)
 * 
 * Query parameters:
 * - agreementId: Filter by agreement ID
 * - operationType: Filter by operation type (INIT_ESCROW, DEPOSIT_USDC, DEPOSIT_NFT, SETTLE, CANCEL, etc.)
 * - status: Filter by status (PENDING, CONFIRMED, FAILED, FINALIZED)
 * - txId: Filter by transaction ID (partial match)
 * - dateFrom: Filter by date range start (ISO 8601)
 * - dateTo: Filter by date range end (ISO 8601)
 * - limit: Number of results (default 50, max 100)
 * - offset: Pagination offset (default 0)
 * - sortBy: Sort field (timestamp or blockHeight, default timestamp)
 * - sortOrder: Sort order (asc or desc, default desc)
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const query: TransactionLogQueryDTO = {
      agreementId: req.query.agreementId as string,
      operationType: req.query.operationType as string,
      status: req.query.status as string,
      txId: req.query.txId as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      sortBy: (req.query.sortBy as 'timestamp' | 'blockHeight') || 'timestamp',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const transactionLogService = getTransactionLogService();

    const result = await transactionLogService.searchTransactionLogs({
      agreementId: query.agreementId,
      operationType: query.operationType,
      status: query.status,
      txId: query.txId,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const response: TransactionLogListResponseDTO = {
      logs: result.logs.map(mapTransactionLogToDTO),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.offset + result.logs.length < result.total,
    };

    res.json(response);
  } catch (error) {
    console.error('Error searching transaction logs:', error);
    res.status(500).json({
      error: 'Failed to search transaction logs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/transactions/logs/:txId
 * 
 * Get a specific transaction log by transaction ID
 */
router.get('/logs/:txId', async (req: Request, res: Response) => {
  try {
    const { txId } = req.params;

    const transactionLogService = getTransactionLogService();
    const log = await transactionLogService.getTransactionById(txId);

    if (!log) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: `No transaction log found for txId: ${txId}`,
      });
    }

    const response: TransactionLogResponseDTO = mapTransactionLogToDTO(log);

    res.json(response);
  } catch (error) {
    console.error('Error getting transaction log:', error);
    res.status(500).json({
      error: 'Failed to get transaction log',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/transactions/agreements/:agreementId
 * 
 * Get all transactions for a specific agreement with statistics
 */
router.get('/agreements/:agreementId', async (req: Request, res: Response) => {
  try {
    const { agreementId } = req.params;

    const transactionLogService = getTransactionLogService();

    // Get transactions and stats in parallel
    const [transactions, stats] = await Promise.all([
      transactionLogService.getTransactionsByAgreement(agreementId),
      transactionLogService.getAgreementTransactionStats(agreementId),
    ]);

    const response: AgreementTransactionsResponseDTO = {
      agreementId,
      transactions: transactions.map(mapTransactionLogToDTO),
      stats: {
        totalTransactions: stats.totalTransactions,
        byOperationType: stats.byOperationType,
        byStatus: stats.byStatus,
        firstTransaction: stats.firstTransaction?.toISOString(),
        lastTransaction: stats.lastTransaction?.toISOString(),
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting agreement transactions:', error);
    res.status(500).json({
      error: 'Failed to get agreement transactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/transactions/stats/:agreementId
 * 
 * Get transaction statistics for a specific agreement
 */
router.get('/stats/:agreementId', async (req: Request, res: Response) => {
  try {
    const { agreementId } = req.params;

    const transactionLogService = getTransactionLogService();
    const stats = await transactionLogService.getAgreementTransactionStats(agreementId);

    const response: TransactionStatsResponseDTO = {
      agreementId,
      totalTransactions: stats.totalTransactions,
      byOperationType: stats.byOperationType,
      byStatus: stats.byStatus,
      firstTransaction: stats.firstTransaction?.toISOString(),
      lastTransaction: stats.lastTransaction?.toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting transaction stats:', error);
    res.status(500).json({
      error: 'Failed to get transaction stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /v1/transactions/failed
 * 
 * Get recent failed transactions for debugging
 * 
 * Query parameters:
 * - limit: Number of results (default 10, max 50)
 */
router.get('/failed', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(
      req.query.limit ? parseInt(req.query.limit as string) : 10,
      50
    );

    const transactionLogService = getTransactionLogService();
    const failedTransactions = await transactionLogService.getRecentFailedTransactions(limit);

    const response = {
      count: failedTransactions.length,
      transactions: failedTransactions.map(mapTransactionLogToDTO),
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting failed transactions:', error);
    res.status(500).json({
      error: 'Failed to get failed transactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

