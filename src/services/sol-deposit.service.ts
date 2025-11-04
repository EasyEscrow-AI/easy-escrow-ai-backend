/**
 * SOL Deposit Service
 *
 * Handles detection and validation of SOL deposits to escrow PDAs.
 * Monitors escrow account SOL balance changes, validates amounts, and updates database.
 */

import { PublicKey, AccountInfo, Context, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { prisma } from '../config/database';
import { getSolanaService } from './solana.service';
import { Decimal } from '@prisma/client/runtime/library';
import { DepositStatus, AgreementStatus } from '../generated/prisma';
import { getTransactionLogService, TransactionOperationType, TransactionStatusType } from './transaction-log.service';

/**
 * SOL Deposit Result
 */
interface SolDepositResult {
  success: boolean;
  depositId?: string;
  amount?: string;
  status?: DepositStatus;
  error?: string;
}

/**
 * Convert lamports to SOL
 */
function lamportsToSol(lamports: bigint): string {
  const wholePart = lamports / BigInt(LAMPORTS_PER_SOL);
  const fractionalPart = lamports % BigInt(LAMPORTS_PER_SOL);
  
  // Pad fractional part with leading zeros (9 decimals for SOL)
  const fractionalStr = fractionalPart.toString().padStart(9, '0');
  
  return `${wholePart}.${fractionalStr}`;
}

/**
 * SOL Deposit Service Class
 *
 * Handles SOL deposit detection, validation, and database updates for v2 escrow.
 */
export class SolDepositService {
  private solanaService: ReturnType<typeof getSolanaService>;

  constructor() {
    this.solanaService = getSolanaService();
    console.log(`[SolDepositService] Initialized for v2 SOL-based escrow`);
  }

  /**
   * Handle SOL account change on escrow PDA
   * Called when the escrow PDA's SOL balance changes
   */
  async handleSolAccountChange(
    publicKey: string,
    accountInfo: AccountInfo<Buffer>,
    context: Context,
    agreementId: string
  ): Promise<SolDepositResult> {
    try {
      console.log(`[SolDepositService] Processing SOL account change for agreement: ${agreementId}`);
      console.log(`[SolDepositService] Escrow PDA: ${publicKey}, Slot: ${context.slot}`);

      // Get agreement from database
      const agreement = await prisma.agreement.findFirst({
        where: { agreementId },
        include: { deposits: true },
      });

      if (!agreement) {
        return {
          success: false,
          error: 'Agreement not found',
        };
      }

      // Validate this is a SOL-based swap type
      if (
        agreement.swapType !== 'NFT_FOR_SOL' &&
        agreement.swapType !== 'NFT_FOR_NFT_PLUS_SOL'
      ) {
        console.log(`[SolDepositService] Skipping: Agreement ${agreementId} is not a SOL-based swap (${agreement.swapType})`);
        return {
          success: false,
          error: 'Not a SOL-based swap type',
        };
      }

      // Check if SOL deposit already exists
      const existingDeposit = await prisma.deposit.findFirst({
        where: {
          agreementId,
          type: 'SOL',
          status: {
            in: ['CONFIRMED', 'PENDING'],
          },
        },
      });

      if (existingDeposit) {
        console.log(`[SolDepositService] SOL deposit already recorded for agreement: ${agreementId}`);
        return {
          success: true,
          depositId: existingDeposit.id,
          amount: existingDeposit.amount?.toString(),
          status: existingDeposit.status,
        };
      }

      // Get SOL balance (account lamports)
      const solBalance = BigInt(accountInfo.lamports);
      // Note: agreement.solAmount is already stored in lamports
      const expectedAmount = agreement.solAmount ? BigInt(agreement.solAmount.toString()) : BigInt(0);

      console.log(`[SolDepositService] Escrow PDA balance: ${solBalance} lamports (${Number(solBalance) / LAMPORTS_PER_SOL} SOL)`);
      console.log(`[SolDepositService] Expected amount: ${expectedAmount} lamports (${Number(expectedAmount) / LAMPORTS_PER_SOL} SOL)`);

      // Check if sufficient SOL has been deposited
      // Note: PDA might have rent-exempt amount + deposit, so we check if balance >= expected
      if (solBalance < expectedAmount) {
        console.log(`[SolDepositService] Insufficient SOL deposited. Current: ${solBalance}, Expected: ${expectedAmount}`);
        return {
          success: false,
          error: 'Insufficient SOL balance',
        };
      }

      // Record SOL deposit
      const solAmount = lamportsToSol(expectedAmount);
      const deposit = await prisma.deposit.create({
        data: {
          agreementId,
          type: 'SOL',
          depositor: agreement.buyer || 'unknown', // Buyer pays SOL
          amount: new Decimal(solAmount),
          status: DepositStatus.CONFIRMED,
          detectedAt: new Date(),
          confirmedAt: new Date(),
        },
      });

      console.log(`[SolDepositService] ✅ SOL deposit recorded: ${deposit.id}, Amount: ${solAmount} SOL`);

      // Update agreement status based on what's been deposited
      const nftDeposit = agreement.deposits.find(
        (d) => d.type === 'NFT' && d.status === DepositStatus.CONFIRMED
      );

      let newStatus: AgreementStatus = agreement.status;

      if (nftDeposit) {
        // Both NFT and SOL deposited
        newStatus = AgreementStatus.BOTH_LOCKED;
        console.log(`[SolDepositService] Both NFT and SOL deposited, updating status to BOTH_LOCKED`);
      } else {
        // Only SOL deposited
        newStatus = AgreementStatus.USDC_LOCKED; // Reusing USDC_LOCKED for SOL (buyer funds locked)
        console.log(`[SolDepositService] SOL deposited, updating status to USDC_LOCKED (buyer funds locked)`);
      }

      // Update agreement status
      await prisma.agreement.update({
        where: { id: agreement.id },
        data: {
          status: newStatus,
          updatedAt: new Date(),
        },
      });

      console.log(`[SolDepositService] Agreement ${agreementId} status updated to: ${newStatus}`);

      // Log transaction (if we can find the tx signature)
      // Note: In production, the client submits the transaction, so we might not have the txId here
      // The transaction log is typically created when the client confirms the deposit via API
      // For now, we skip logging here and let the API endpoint handle it

      return {
        success: true,
        depositId: deposit.id,
        amount: solAmount,
        status: DepositStatus.CONFIRMED,
      };
    } catch (error) {
      console.error('[SolDepositService] Error processing SOL deposit:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate SOL deposit by checking escrow PDA balance
   * Used for manual verification or polling-based detection
   */
  async validateSolDeposit(agreementId: string): Promise<SolDepositResult> {
    try {
      console.log(`[SolDepositService] Validating SOL deposit for agreement: ${agreementId}`);

      // Get agreement
      const agreement = await prisma.agreement.findFirst({
        where: { agreementId },
        include: { deposits: true },
      });

      if (!agreement) {
        return {
          success: false,
          error: 'Agreement not found',
        };
      }

      // Check if deposit already recorded
      const existingDeposit = agreement.deposits.find(
        (d) => d.type === 'SOL' && d.status === DepositStatus.CONFIRMED
      );

      if (existingDeposit) {
        return {
          success: true,
          depositId: existingDeposit.id,
          amount: existingDeposit.amount?.toString(),
          status: existingDeposit.status,
        };
      }

      // Fetch escrow PDA account
      const escrowPda = new PublicKey(agreement.escrowPda);
      const accountInfo = await this.solanaService.getConnection().getAccountInfo(escrowPda);

      if (!accountInfo) {
        return {
          success: false,
          error: 'Escrow PDA account not found',
        };
      }

      // Process the account change (triggers deposit recording)
      return await this.handleSolAccountChange(
        escrowPda.toBase58(),
        accountInfo,
        { slot: 0 } as Context, // Slot not available in manual validation
        agreementId
      );
    } catch (error) {
      console.error('[SolDepositService] Error validating SOL deposit:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
let solDepositServiceInstance: SolDepositService | null = null;

/**
 * Get or create SOL deposit service singleton instance
 */
export function getSolDepositService(): SolDepositService {
  if (!solDepositServiceInstance) {
    solDepositServiceInstance = new SolDepositService();
  }
  return solDepositServiceInstance;
}

/**
 * Reset SOL deposit service instance (useful for testing)
 */
export function resetSolDepositService(): void {
  solDepositServiceInstance = null;
}

export default SolDepositService;

