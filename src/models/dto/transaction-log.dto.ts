/**
 * Transaction Log DTOs
 * 
 * Data Transfer Objects for transaction logging API endpoints.
 */

/**
 * Transaction log response DTO
 */
export interface TransactionLogResponseDTO {
  id: string;
  txId: string;
  operationType: string;
  agreementId?: string;
  status: string;
  blockHeight?: string;
  slot?: string;
  errorMessage?: string;
  timestamp: string;
  explorerUrl?: string;
}

/**
 * Transaction log query request DTO
 */
export interface TransactionLogQueryDTO {
  agreementId?: string;
  operationType?: string;
  status?: string;
  txId?: string;
  dateFrom?: string; // ISO 8601 date string
  dateTo?: string;   // ISO 8601 date string
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'blockHeight';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Transaction log list response DTO
 */
export interface TransactionLogListResponseDTO {
  logs: TransactionLogResponseDTO[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Transaction statistics response DTO
 */
export interface TransactionStatsResponseDTO {
  agreementId: string;
  totalTransactions: number;
  byOperationType: Record<string, number>;
  byStatus: Record<string, number>;
  firstTransaction?: string;
  lastTransaction?: string;
}

/**
 * Agreement transactions response DTO
 */
export interface AgreementTransactionsResponseDTO {
  agreementId: string;
  transactions: TransactionLogResponseDTO[];
  stats: Omit<TransactionStatsResponseDTO, 'agreementId'>;
}

/**
 * Create transaction log request DTO (for manual logging)
 */
export interface CreateTransactionLogDTO {
  txId: string;
  operationType: string;
  agreementId?: string;
  status?: string;
  blockHeight?: number;
  slot?: number;
  errorMessage?: string;
}

