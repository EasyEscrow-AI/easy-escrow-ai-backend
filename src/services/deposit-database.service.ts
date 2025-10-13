/**
 * Deposit Database Service
 * 
 * Centralized service for database operations related to deposits.
 * Handles atomic updates, audit trails, and transaction logging.
 */

import { prisma } from '../config/database';
import { Prisma, DepositType, DepositStatus, AgreementStatus } from '../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Deposit creation data
 */
interface CreateDepositData {
  agreementId: string;
  type: DepositType;
  depositor: string;
  amount?: string | null;
  tokenAccount: string;
  txId?: string | null;
  blockHeight?: bigint;
  nftMetadata?: any;
}

/**
 * Deposit update result
 */
interface DepositUpdateResult {
  success: boolean;
  depositId?: string;
  agreementStatus?: string;
  error?: string;
}

/**
 * Transaction log data
 */
interface TransactionLogData {
  agreementId: string;
  txId: string;
  operationType: 'init' | 'deposit' | 'settle' | 'cancel';
  status: 'success' | 'failed' | 'pending';
  blockHeight?: bigint;
  slot?: bigint;
  errorMessage?: string;
}

/**
 * Deposit Database Service Class
 * 
 * Provides atomic database operations for deposit tracking and agreement updates.
 * Ensures data consistency and maintains audit trails.
 */
export class DepositDatabaseService {
  constructor() {
    console.log('[DepositDatabaseService] Initialized');
  }

  /**
   * Create deposit record atomically
   */
  public async createDeposit(data: CreateDepositData): Promise<DepositUpdateResult> {
    try {
      console.log(`[DepositDatabaseService] Creating deposit for agreement: ${data.agreementId}`);
      
      const result = await prisma.$transaction(async (tx) => {
        // Check if agreement exists
        const agreement = await tx.agreement.findUnique({
          where: { id: data.agreementId },
          select: { 
            id: true, 
            status: true,
            agreementId: true,
          },
        });

        if (!agreement) {
          throw new Error(`Agreement not found: ${data.agreementId}`);
        }

        // Check if deposit already exists
        const existingDeposit = await tx.deposit.findFirst({
          where: {
            agreementId: data.agreementId,
            type: data.type,
            status: {
              in: ['CONFIRMED', 'PENDING'],
            },
          },
        });

        if (existingDeposit) {
          return {
            deposit: existingDeposit,
            agreement,
            isNew: false,
          };
        }

        // Create deposit
        const deposit = await tx.deposit.create({
          data: {
            agreementId: data.agreementId,
            type: data.type,
            depositor: data.depositor,
            amount: data.amount ? new Decimal(data.amount) : null,
            tokenAccount: data.tokenAccount,
            status: 'PENDING',
            txId: data.txId,
            blockHeight: data.blockHeight,
            nftMetadata: data.nftMetadata,
          },
        });

        return {
          deposit,
          agreement,
          isNew: true,
        };
      });

      return {
        success: true,
        depositId: result.deposit.id,
        agreementStatus: result.agreement.status,
      };
    } catch (error) {
      console.error('[DepositDatabaseService] Error creating deposit:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create transaction log entry
   */
  public async createTransactionLog(data: TransactionLogData): Promise<void> {
    try {
      await prisma.transactionLog.create({
        data: {
          agreementId: data.agreementId,
          txId: data.txId,
          operationType: data.operationType,
          status: data.status,
          blockHeight: data.blockHeight,
          slot: data.slot,
          errorMessage: data.errorMessage,
        },
      });

      console.log(`[DepositDatabaseService] Created transaction log for ${data.txId}`);
    } catch (error) {
      console.error('[DepositDatabaseService] Error creating transaction log:', error);
    }
  }
}

// Singleton instance
let depositDatabaseServiceInstance: DepositDatabaseService | null = null;

/**
 * Get or create deposit database service singleton instance
 */
export function getDepositDatabaseService(): DepositDatabaseService {
  if (!depositDatabaseServiceInstance) {
    depositDatabaseServiceInstance = new DepositDatabaseService();
  }
  return depositDatabaseServiceInstance;
}

/**
 * Reset deposit database service instance (useful for testing)
 */
export function resetDepositDatabaseService(): void {
  depositDatabaseServiceInstance = null;
}

export default DepositDatabaseService;
