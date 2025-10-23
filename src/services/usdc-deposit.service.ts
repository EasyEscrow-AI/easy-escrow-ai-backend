/**
 * USDC Deposit Service
 *
 * Handles detection and validation of USDC deposits to escrow accounts.
 * Monitors SPL token account changes, validates amounts, and updates database.
 */

import { PublicKey, AccountInfo, Context } from '@solana/web3.js';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { prisma } from '../config/database';
import { config } from '../config';
import { getSolanaService } from './solana.service';
import { Decimal } from '@prisma/client/runtime/library';
import { DepositStatus, AgreementStatus } from '../generated/prisma';
import { getTransactionLogService, TransactionOperationType, TransactionStatusType } from './transaction-log.service';

/**
 * Token account data structure
 */
interface TokenAccountData {
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
}

/**
 * USDC Deposit Result
 */
interface UsdcDepositResult {
  success: boolean;
  depositId?: string;
  amount?: string;
  status?: DepositStatus; // Added status field to track deposit state
  error?: string;
}

/**
 * Parse SPL token account data
 */
function parseTokenAccountData(data: Buffer): TokenAccountData | null {
  try {
    if (data.length !== AccountLayout.span) {
      console.error(
        `[UsdcDepositService] Invalid account data length: ${data.length}, expected: ${AccountLayout.span}`
      );
      return null;
    }

    const decoded = AccountLayout.decode(data);

    return {
      mint: new PublicKey(decoded.mint),
      owner: new PublicKey(decoded.owner),
      amount: decoded.amount,
    };
  } catch (error) {
    console.error('[UsdcDepositService] Error parsing token account data:', error);
    return null;
  }
}

/**
 * Convert USDC lamports to human-readable amount
 * USDC has 6 decimals on Solana
 */
function lamportsToUsdc(lamports: bigint): string {
  const USDC_DECIMALS = 6;
  const divisor = BigInt(10 ** USDC_DECIMALS);
  
  const wholePart = lamports / divisor;
  const fractionalPart = lamports % divisor;
  
  // Pad fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(USDC_DECIMALS, '0');
  
  return `${wholePart}.${fractionalStr}`;
}

/**
 * USDC Deposit Service Class
 *
 * Handles USDC deposit detection, validation, and database updates.
 */
export class UsdcDepositService {
  private solanaService: ReturnType<typeof getSolanaService>;
  private usdcMintAddress: PublicKey;

  constructor() {
    this.solanaService = getSolanaService();

    if (!config.usdc.mintAddress) {
      throw new Error('[UsdcDepositService] USDC mint address not configured');
    }

    this.usdcMintAddress = new PublicKey(config.usdc.mintAddress);
    console.log(`[UsdcDepositService] Initialized with USDC mint: ${this.usdcMintAddress.toBase58()}`);
  }

  /**
   * Handle USDC account change
   * Called when a monitored USDC deposit account changes
   */
  async handleUsdcAccountChange(
    publicKey: string,
    accountInfo: AccountInfo<Buffer>,
    context: Context,
    agreementId: string
  ): Promise<UsdcDepositResult> {
    try {
      console.log(`[UsdcDepositService] Processing USDC account change for agreement: ${agreementId}`);
      console.log(`[UsdcDepositService] Account: ${publicKey}, Slot: ${context.slot}`);

      // Validate account owner is Token Program
      if (accountInfo.owner.toBase58() !== TOKEN_PROGRAM_ID.toBase58()) {
        console.error(`[UsdcDepositService] Invalid account owner: ${accountInfo.owner.toBase58()}`);
        return {
          success: false,
          error: 'Invalid account owner - not a token account',
        };
      }

      // Parse token account data
      const tokenAccountData = parseTokenAccountData(accountInfo.data);
      if (!tokenAccountData) {
        return {
          success: false,
          error: 'Failed to parse token account data',
        };
      }

      // Validate mint is USDC
      if (tokenAccountData.mint.toBase58() !== this.usdcMintAddress.toBase58()) {
        console.error(
          `[UsdcDepositService] Invalid mint: ${tokenAccountData.mint.toBase58()}, expected: ${this.usdcMintAddress.toBase58()}`
        );
        return {
          success: false,
          error: 'Invalid mint - not USDC',
        };
      }

      // Check if deposit already exists
      const existingDeposit = await prisma.deposit.findFirst({
        where: {
          agreement: {
            id: agreementId,
          },
          type: 'USDC',
          status: {
            in: ['CONFIRMED', 'PENDING'],
          },
        },
      });

      if (existingDeposit && existingDeposit.status === 'CONFIRMED') {
        console.log(`[UsdcDepositService] Deposit already confirmed for agreement: ${agreementId}`);
        return {
          success: true,
          depositId: existingDeposit.id,
          amount: existingDeposit.amount?.toString(),
          status: existingDeposit.status as DepositStatus, // Include status
        };
      }

      // Get agreement details
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId: agreementId },
        select: {
          id: true,
          agreementId: true,
          price: true,
          buyer: true,
          usdcDepositAddr: true,
          status: true,
        },
      });

      if (!agreement) {
        console.error(`[UsdcDepositService] Agreement not found: ${agreementId}`);
        return {
          success: false,
          error: 'Agreement not found',
        };
      }

      // Convert token amount to USDC
      const depositAmount = lamportsToUsdc(tokenAccountData.amount);
      console.log(`[UsdcDepositService] Detected USDC deposit: ${depositAmount} USDC`);

      // Validate deposit amount matches expected price
      const expectedAmount = agreement.price.toString();
      const isValidAmount = this.validateAmount(depositAmount, expectedAmount);

      if (!isValidAmount) {
        console.warn(
          `[UsdcDepositService] Deposit amount ${depositAmount} does not match expected ${expectedAmount}`
        );
      }

      // Determine deposit status based on amount
      const depositStatus: DepositStatus = tokenAccountData.amount > 0 ? 'CONFIRMED' : 'PENDING';

      if (existingDeposit) {
        // Update existing deposit
        const updatedDeposit = await prisma.deposit.update({
          where: { id: existingDeposit.id },
          data: {
            amount: new Decimal(depositAmount),
            status: depositStatus,
            blockHeight: BigInt(context.slot),
            confirmedAt: tokenAccountData.amount > 0 ? new Date() : null,
          },
        });

        // Create transaction log for confirmed deposit (if not already logged)
        if (depositStatus === 'CONFIRMED' && isValidAmount && existingDeposit.status !== 'CONFIRMED') {
          try {
            const transactionLogService = getTransactionLogService();
            // Pass slot from context to help find the exact transaction
            const txSignature = await this.solanaService.getRecentTransactionSignature(publicKey, context.slot);
            
            if (txSignature) {
              await transactionLogService.captureTransaction({
                txId: txSignature,
                operationType: TransactionOperationType.DEPOSIT_USDC,
                agreementId: agreement.agreementId,
                status: TransactionStatusType.CONFIRMED,
                blockHeight: BigInt(context.slot),
              });
              console.log(`[UsdcDepositService] ✅ Transaction log created for USDC deposit: ${txSignature}`);
            } else {
              console.error(`[UsdcDepositService] ❌ Failed to retrieve transaction signature for USDC deposit at slot ${context.slot}`);
            }
          } catch (logError) {
            console.error(`[UsdcDepositService] Error creating transaction log:`, logError);
            // Don't fail the deposit if transaction log creation fails
          }
        }

        // Update agreement status only if deposit is confirmed
        if (depositStatus === 'CONFIRMED' && isValidAmount) {
          await this.updateAgreementStatus(agreement.id, agreement.status);
        }

        return {
          success: true,
          depositId: updatedDeposit.id,
          amount: depositAmount,
          status: depositStatus, // Include status
        };
      }

      // Create deposit record
      const deposit = await prisma.deposit.create({
        data: {
          agreementId: agreement.agreementId,
          type: 'USDC',
          depositor: tokenAccountData.owner.toBase58(),
          amount: new Decimal(depositAmount),
          tokenAccount: publicKey,
          status: depositStatus,
          blockHeight: BigInt(context.slot),
          confirmedAt: tokenAccountData.amount > 0 ? new Date() : null,
        },
      });

      console.log(`[UsdcDepositService] Created deposit record: ${deposit.id}`);

      // Create transaction log for confirmed deposit
      if (depositStatus === 'CONFIRMED' && isValidAmount) {
        try {
          const transactionLogService = getTransactionLogService();
          // Pass slot from context to help find the exact transaction
          const txSignature = await this.solanaService.getRecentTransactionSignature(publicKey, context.slot);
          
          if (txSignature) {
            await transactionLogService.captureTransaction({
              txId: txSignature,
              operationType: TransactionOperationType.DEPOSIT_USDC,
              agreementId: agreement.agreementId,
              status: TransactionStatusType.CONFIRMED,
              blockHeight: BigInt(context.slot),
            });
            console.log(`[UsdcDepositService] ✅ Transaction log created for USDC deposit: ${txSignature}`);
          } else {
            console.error(`[UsdcDepositService] ❌ Failed to retrieve transaction signature for USDC deposit at slot ${context.slot}`);
          }
        } catch (logError) {
          console.error(`[UsdcDepositService] Error creating transaction log:`, logError);
          // Don't fail the deposit if transaction log creation fails
        }
      }

      // Update agreement status if USDC is now locked
      if (depositStatus === 'CONFIRMED' && isValidAmount) {
        await this.updateAgreementStatus(agreement.id, agreement.status);
      }

      return {
        success: true,
        depositId: deposit.id,
        amount: depositAmount,
        status: depositStatus, // Include status
      };
    } catch (error) {
      console.error(`[UsdcDepositService] Error handling USDC account change:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate deposit amount matches expected amount
   */
  private validateAmount(depositAmount: string, expectedAmount: string): boolean {
    try {
      const deposit = parseFloat(depositAmount);
      const expected = parseFloat(expectedAmount);

      // Allow for tiny rounding differences
      const tolerance = 0.000001;
      const difference = Math.abs(deposit - expected);

      return difference <= tolerance;
    } catch (error) {
      console.error('[UsdcDepositService] Error validating amount:', error);
      return false;
    }
  }

  /**
   * Update agreement status based on deposit status
   */
  private async updateAgreementStatus(agreementId: string, currentStatus: string): Promise<void> {
    try {
      // Check if NFT is also deposited
      const nftDeposit = await prisma.deposit.findFirst({
        where: {
          agreementId,
          type: 'NFT',
          status: 'CONFIRMED',
        },
      });

      let newStatus: AgreementStatus;
      if (nftDeposit) {
        newStatus = 'BOTH_LOCKED' as AgreementStatus;
      } else if (currentStatus === 'PENDING' || currentStatus === 'FUNDED') {
        newStatus = 'USDC_LOCKED' as AgreementStatus;
      } else if (currentStatus === 'NFT_LOCKED') {
        newStatus = 'BOTH_LOCKED' as AgreementStatus;
      } else {
        return;
      }

      await prisma.agreement.update({
        where: { id: agreementId },
        data: { status: newStatus },
      });

      console.log(`[UsdcDepositService] Updated agreement status to: ${newStatus}`);
    } catch (error) {
      console.error('[UsdcDepositService] Error updating agreement status:', error);
      throw error;
    }
  }

  /**
   * Get USDC balance for an account
   */
  async getUsdcBalance(publicKey: string): Promise<string | null> {
    try {
      const accountInfo = await this.solanaService.getAccountInfo(publicKey);
      if (!accountInfo) {
        return null;
      }

      const tokenAccountData = parseTokenAccountData(accountInfo.data);
      if (!tokenAccountData) {
        return null;
      }

      if (tokenAccountData.mint.toBase58() !== this.usdcMintAddress.toBase58()) {
        console.error('[UsdcDepositService] Not a USDC account');
        return null;
      }

      return lamportsToUsdc(tokenAccountData.amount);
    } catch (error) {
      console.error('[UsdcDepositService] Error getting USDC balance:', error);
      return null;
    }
  }
}

// Singleton instance
let usdcDepositServiceInstance: UsdcDepositService | null = null;

/**
 * Get or create USDC deposit service singleton instance
 */
export function getUsdcDepositService(): UsdcDepositService {
  if (!usdcDepositServiceInstance) {
    usdcDepositServiceInstance = new UsdcDepositService();
  }
  return usdcDepositServiceInstance;
}

/**
 * Reset USDC deposit service instance (useful for testing)
 */
export function resetUsdcDepositService(): void {
  usdcDepositServiceInstance = null;
}

export default UsdcDepositService;
