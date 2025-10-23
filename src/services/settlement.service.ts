/**
 * Settlement Service
 *
 * Detects when both NFT and USDC are locked, validates the agreement,
 * and executes atomic settlement on-chain with platform fees and optional royalties.
 */

import { PublicKey, Transaction, SystemProgram, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, transfer, getAccount, createTransferInstruction } from '@solana/spl-token';
import { prisma } from '../config/database';
import { config } from '../config';
import { getSolanaService } from './solana.service';
import { getEscrowProgramService } from './escrow-program.service';
import { getIdempotencyService } from './idempotency.service';
import { WebhookEventsService } from './webhook-events.service';
import { getReceiptService } from './receipt.service';
import { getTransactionLogService, TransactionOperationType, TransactionStatusType } from './transaction-log.service';
import { Decimal } from '@prisma/client/runtime/library';
import { AgreementStatus } from '../generated/prisma';

/**
 * Settlement configuration
 */
interface SettlementConfig {
  pollingInterval?: number; // Milliseconds between settlement checks
  maxRetries?: number; // Max retries for failed settlements
  retryDelayMs?: number; // Delay between retries
  platformFeeCollectorAddress?: string; // Platform fee collection wallet
}

/**
 * Settlement execution result
 */
interface SettlementResult {
  success: boolean;
  agreementId?: string;
  transactionId?: string;
  platformFee?: string;
  creatorRoyalty?: string;
  sellerReceived?: string;
  error?: string;
}

/**
 * Platform fee calculation result
 */
interface FeeCalculation {
  platformFee: Decimal;
  creatorRoyalty: Decimal;
  sellerReceived: Decimal;
  totalDeductions: Decimal;
}

/**
 * NFT Metadata for royalty calculation
 */
interface NftMetadata {
  sellerFeeBasisPoints?: number; // Creator royalty in basis points
  creators?: Array<{
    address: string;
    share: number; // Share percentage (0-100)
    verified: boolean;
  }>;
}

/**
 * Settlement Service Class
 *
 * Monitors for locked agreements and executes atomic settlements with fee calculations.
 */
export class SettlementService {
  private solanaService: ReturnType<typeof getSolanaService>;
  private isRunning: boolean = false;
  private config: Required<SettlementConfig>;
  private settlementTimer?: NodeJS.Timeout;

  constructor(settlementConfig?: SettlementConfig) {
    this.solanaService = getSolanaService();

    this.config = {
      pollingInterval: settlementConfig?.pollingInterval || 15000, // 15 seconds
      maxRetries: settlementConfig?.maxRetries || 3,
      retryDelayMs: settlementConfig?.retryDelayMs || 2000,
      platformFeeCollectorAddress: settlementConfig?.platformFeeCollectorAddress || 
        config.platform?.feeCollectorAddress || 
        '11111111111111111111111111111111', // Fallback address
    };

    console.log('[SettlementService] Initialized');
  }

  /**
   * Start the settlement service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[SettlementService] Service already running');
      return;
    }

    console.log('[SettlementService] Starting settlement service...');

    try {
      // Start settlement monitoring
      this.startSettlementMonitoring();

      this.isRunning = true;
      console.log('[SettlementService] Settlement service started successfully');
    } catch (error) {
      console.error('[SettlementService] Failed to start settlement service:', error);
      throw error;
    }
  }

  /**
   * Stop the settlement service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[SettlementService] Service not running');
      return;
    }

    console.log('[SettlementService] Stopping settlement service...');

    try {
      // Stop settlement monitoring
      if (this.settlementTimer) {
        clearInterval(this.settlementTimer);
        this.settlementTimer = undefined;
      }

      this.isRunning = false;
      console.log('[SettlementService] Settlement service stopped');
    } catch (error) {
      console.error('[SettlementService] Error stopping settlement service:', error);
      throw error;
    }
  }

  /**
   * Start monitoring for agreements ready to settle
   */
  private startSettlementMonitoring(): void {
    console.log(
      `[SettlementService] Starting settlement monitoring (interval: ${this.config.pollingInterval}ms)`
    );

    // Run immediately
    this.checkAndSettleAgreements();

    // Then run periodically
    this.settlementTimer = setInterval(async () => {
      await this.checkAndSettleAgreements();
    }, this.config.pollingInterval);
  }

  /**
   * Check for agreements ready to settle and execute settlements
   */
  private async checkAndSettleAgreements(): Promise<void> {
    try {
      console.log('[SettlementService] Checking for agreements ready to settle...');

      // Find agreements with both assets locked
      const readyAgreements = await prisma.agreement.findMany({
        where: {
          status: AgreementStatus.BOTH_LOCKED,
          expiry: {
            gt: new Date(), // Not expired
          },
        },
        include: {
          deposits: true,
        },
      });

      console.log(
        `[SettlementService] Found ${readyAgreements.length} agreements ready to settle`
      );

      // Process each agreement
      for (const agreement of readyAgreements) {
        try {
          console.log(
            `[SettlementService] Processing settlement for agreement: ${agreement.agreementId}`
          );

          // Validate expiration before settlement
          if (!this.validateNotExpired(agreement)) {
            console.log(
              `[SettlementService] Agreement ${agreement.agreementId} has expired, marking as EXPIRED`
            );
            await this.markAgreementExpired(agreement.id);
            continue;
          }

          // Execute settlement
          const result = await this.executeSettlement(agreement);

          if (result.success) {
            console.log(
              `[SettlementService] Successfully settled agreement ${agreement.agreementId}`
            );
          } else {
            console.error(
              `[SettlementService] Failed to settle agreement ${agreement.agreementId}: ${result.error}`
            );
          }
        } catch (error) {
          console.error(
            `[SettlementService] Error processing agreement ${agreement.agreementId}:`,
            error
          );
          // Continue processing other agreements
        }
      }
    } catch (error) {
      console.error('[SettlementService] Error checking agreements:', error);
    }
  }

  /**
   * Validate that an agreement has not expired
   */
  private validateNotExpired(agreement: any): boolean {
    const now = new Date();
    const bufferTimeMs = 60000; // 1 minute buffer

    // Check if current time is before expiry (with buffer)
    const isValid = now.getTime() < agreement.expiry.getTime() - bufferTimeMs;

    if (!isValid) {
      console.log(
        `[SettlementService] Agreement ${agreement.agreementId} validation failed: expired at ${agreement.expiry.toISOString()}`
      );
    }

    return isValid;
  }

  /**
   * Mark an agreement as expired
   */
  private async markAgreementExpired(agreementId: string): Promise<void> {
    await prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: AgreementStatus.EXPIRED,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Execute settlement for an agreement
   */
  async executeSettlement(agreement: any): Promise<SettlementResult> {
    console.log(`[SettlementService] Executing settlement for agreement ${agreement.agreementId}`);

    try {
      // 0. Check idempotency to prevent double-settlement
      const idempotencyKey = `settlement_${agreement.agreementId}`;
      const idempotencyService = getIdempotencyService();
      
      const idempotencyCheck = await idempotencyService.checkIdempotency(
        idempotencyKey,
        'SETTLEMENT',
        { agreementId: agreement.agreementId, operation: 'settle' }
      );

      if (idempotencyCheck.isDuplicate) {
        console.log(
          `[SettlementService] Settlement already processed for agreement ${agreement.agreementId}, skipping`
        );
        
        // Return the cached result
        if (idempotencyCheck.existingResponse?.body) {
          return idempotencyCheck.existingResponse.body as SettlementResult;
        }
        
        // If no cached result, query the database for the actual settlement
        const existingSettlement = await prisma.settlement.findUnique({
          where: { agreementId: agreement.id },
        });

        if (existingSettlement) {
          // Return success with settlement details from database
          return {
            success: true,
            agreementId: agreement.agreementId,
            transactionId: existingSettlement.settleTxId,
            platformFee: existingSettlement.platformFee.toString(),
            creatorRoyalty: existingSettlement.creatorRoyalty?.toString() || '0',
            sellerReceived: existingSettlement.sellerReceived.toString(),
          };
        }

        // If settlement doesn't exist in database, this shouldn't happen
        // but return a clear success response
        console.warn(
          `[SettlementService] Idempotency key exists but no settlement found in database for ${agreement.agreementId}`
        );
        return {
          success: true,
          agreementId: agreement.agreementId,
        };
      }

      // 1. Calculate fees
      const feeCalculation = await this.calculateFees(agreement);

      console.log(`[SettlementService] Fee calculation:`, {
        platformFee: feeCalculation.platformFee.toString(),
        creatorRoyalty: feeCalculation.creatorRoyalty.toString(),
        sellerReceived: feeCalculation.sellerReceived.toString(),
      });

      // 2. Execute on-chain settlement
      const settlementTxId = await this.executeOnChainSettlement(agreement, feeCalculation);

      console.log(`[SettlementService] Settlement transaction: ${settlementTxId}`);

      // 3. Get block height for the transaction
      const blockHeight = await this.getTransactionBlockHeight(settlementTxId);

      // 3a. Log the settlement transaction
      try {
        const transactionLogService = getTransactionLogService();
        await transactionLogService.captureTransaction({
          txId: settlementTxId,
          operationType: TransactionOperationType.SETTLE,
          agreementId: agreement.agreementId,
          status: TransactionStatusType.CONFIRMED,
          blockHeight: blockHeight || undefined,
        });
      } catch (logError) {
        // Log error but don't fail the settlement
        console.error('[SettlementService] Failed to log settlement transaction:', logError);
      }

      // 4. Create settlement record
      await prisma.settlement.create({
        data: {
          agreementId: agreement.id,
          nftMint: agreement.nftMint,
          price: agreement.price,
          platformFee: feeCalculation.platformFee,
          creatorRoyalty: feeCalculation.creatorRoyalty.gt(0) ? feeCalculation.creatorRoyalty : null,
          sellerReceived: feeCalculation.sellerReceived,
          settleTxId: settlementTxId,
          blockHeight: blockHeight || BigInt(0),
          buyer: agreement.buyer!,
          seller: agreement.seller,
          feeCollector: this.config.platformFeeCollectorAddress,
          royaltyRecipient: feeCalculation.creatorRoyalty.gt(0) ? await this.getCreatorAddress(agreement) : null,
          settledAt: new Date(),
        },
      });

      // 5. Update agreement status
      await prisma.agreement.update({
        where: { id: agreement.id },
        data: {
          status: AgreementStatus.SETTLED,
          settleTxId: settlementTxId,
          settledAt: new Date(),
          updatedAt: new Date(),
        },
      });

      console.log(`[SettlementService] Settlement completed successfully for ${agreement.agreementId}`);

      const settlementResult: SettlementResult = {
        success: true,
        agreementId: agreement.agreementId,
        transactionId: settlementTxId,
        platformFee: feeCalculation.platformFee.toString(),
        creatorRoyalty: feeCalculation.creatorRoyalty.toString(),
        sellerReceived: feeCalculation.sellerReceived.toString(),
      };

      // Store idempotency key for this successful settlement
      await idempotencyService.storeIdempotency(
        idempotencyKey,
        'SETTLEMENT',
        { agreementId: agreement.agreementId, operation: 'settle' },
        200,
        settlementResult
      ).catch((error) => {
        console.error('[SettlementService] Error storing idempotency key:', error);
        // Don't fail settlement if idempotency storage fails
      });

      // 6. Generate settlement receipt with all transaction IDs
      // Declare variables outside try block for catch block access
      let transactions: any[] = [];
      let depositNftTx: any = undefined;
      let depositUsdcTx: any = undefined;
      
      try {
        const receiptService = getReceiptService();
        
        // Log warning if initTxId is missing
        if (!agreement.initTxId) {
          console.warn(`[SettlementService] Agreement ${agreement.agreementId} has no initTxId - receipt will have empty escrowTxId`);
        }
        
        // Fetch all transaction IDs from transaction log for complete audit trail
        console.log(`[SettlementService] Fetching transaction logs for agreement ${agreement.agreementId}`);
        transactions = await prisma.transactionLog.findMany({
          where: { agreementId: agreement.agreementId },
          orderBy: { timestamp: 'asc' },
        });

        // Extract deposit transaction IDs
        depositNftTx = transactions.find(tx => 
          tx.operationType === 'DEPOSIT_NFT' || tx.operationType === 'deposit'
        );
        depositUsdcTx = transactions.find(tx => 
          tx.operationType === 'DEPOSIT_USDC' || tx.operationType === 'deposit'
        );

        console.log(`[SettlementService] Found transaction logs:`, {
          total: transactions.length,
          depositNft: depositNftTx?.txId || 'not found',
          depositUsdc: depositUsdcTx?.txId || 'not found',
          settlement: settlementTxId,
        });
        
        const receiptResult = await receiptService.generateReceipt({
          agreementId: agreement.agreementId,
          nftMint: agreement.nftMint,
          price: agreement.price.toString(),
          platformFee: feeCalculation.platformFee.toString(),
          creatorRoyalty: feeCalculation.creatorRoyalty.gt(0) ? feeCalculation.creatorRoyalty.toString() : undefined,
          buyer: agreement.buyer!,
          seller: agreement.seller,
          escrowTxId: agreement.initTxId || '',
          depositNftTxId: depositNftTx?.txId,     // NEW: NFT deposit transaction
          depositUsdcTxId: depositUsdcTx?.txId,   // NEW: USDC deposit transaction
          settlementTxId: settlementTxId,
          createdAt: agreement.createdAt,
          settledAt: new Date(),
        });

        if (receiptResult.success) {
          console.log(`[SettlementService] ✅ Receipt generated successfully: ${receiptResult.receipt?.id}`);
          // Note: Agreement-Receipt relation is automatically established via Receipt.agreementId
        } else {
          // Enhanced error logging for receipt generation failures
          console.error('═'.repeat(80));
          console.error('[SettlementService] ❌ RECEIPT GENERATION FAILED');
          console.error('═'.repeat(80));
          console.error(`[SettlementService] Agreement ID: ${agreement.agreementId}`);
          console.error(`[SettlementService] NFT Mint: ${agreement.nftMint}`);
          console.error(`[SettlementService] Price: ${agreement.price.toString()}`);
          console.error(`[SettlementService] Error: ${receiptResult.error}`);
          console.error('[SettlementService] Transaction IDs:');
          console.error(`[SettlementService]   • Escrow (init): ${agreement.initTxId || 'NULL'}`);
          console.error(`[SettlementService]   • Deposit NFT: ${depositNftTx?.txId || 'NULL'}`);
          console.error(`[SettlementService]   • Deposit USDC: ${depositUsdcTx?.txId || 'NULL'}`);
          console.error(`[SettlementService]   • Settlement: ${settlementTxId}`);
          console.error(`[SettlementService] Total transaction logs found: ${transactions.length}`);
          console.error('═'.repeat(80));
          // Don't fail the settlement if receipt generation fails
        }
      } catch (receiptError: any) {
        // Enhanced error logging for exceptions during receipt generation
        console.error('═'.repeat(80));
        console.error('[SettlementService] ❌ EXCEPTION IN RECEIPT GENERATION');
        console.error('═'.repeat(80));
        console.error(`[SettlementService] Agreement ID: ${agreement.agreementId}`);
        console.error(`[SettlementService] NFT Mint: ${agreement.nftMint}`);
        console.error(`[SettlementService] Error Type: ${receiptError?.constructor?.name || 'Unknown'}`);
        console.error(`[SettlementService] Error Message: ${receiptError?.message || receiptError}`);
        console.error(`[SettlementService] Error Stack:`);
        console.error(receiptError?.stack || 'No stack trace available');
        console.error('[SettlementService] Transaction IDs:');
        console.error(`[SettlementService]   • Escrow (init): ${agreement.initTxId || 'NULL'}`);
        console.error(`[SettlementService]   • Deposit NFT: ${depositNftTx?.txId || 'NULL'}`);
        console.error(`[SettlementService]   • Deposit USDC: ${depositUsdcTx?.txId || 'NULL'}`);
        console.error(`[SettlementService]   • Settlement: ${settlementTxId}`);
        console.error(`[SettlementService] Total transaction logs found: ${transactions.length}`);
        console.error('═'.repeat(80));
        // Don't fail the settlement if receipt generation fails
      }

      // 7. Publish webhook event for settlement
      try {
        await WebhookEventsService.publishEscrowSettled({
          agreementId: agreement.agreementId,
          nftMint: agreement.nftMint,
          price: agreement.price.toString(),
          platformFee: feeCalculation.platformFee.toString(),
          creatorRoyalty: feeCalculation.creatorRoyalty.gt(0) ? feeCalculation.creatorRoyalty.toString() : undefined,
          sellerReceived: feeCalculation.sellerReceived.toString(),
          buyer: agreement.buyer!,
          seller: agreement.seller,
          settleTxId: settlementTxId,
        });
      } catch (webhookError) {
        // Log webhook error but don't fail the settlement
        console.error('[SettlementService] Failed to publish webhook event:', webhookError);
      }

      return settlementResult;
    } catch (error) {
      console.error(`[SettlementService] Error executing settlement:`, error);

      const errorResult: SettlementResult = {
        success: false,
        agreementId: agreement.agreementId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      // Store idempotency key even for failed settlements to prevent retries within the idempotency window
      const idempotencyKey = `settlement_${agreement.agreementId}`;
      const idempotencyService = getIdempotencyService();
      
      await idempotencyService.storeIdempotency(
        idempotencyKey,
        'SETTLEMENT',
        { agreementId: agreement.agreementId, operation: 'settle' },
        500,
        errorResult
      ).catch((storeError) => {
        console.error('[SettlementService] Error storing failed settlement idempotency:', storeError);
        // Ignore storage errors
      });

      return errorResult;
    }
  }

  /**
   * Calculate platform fees and creator royalties
   */
  private async calculateFees(agreement: any): Promise<FeeCalculation> {
    const price = new Decimal(agreement.price.toString());
    const feeBps = agreement.feeBps;
    const honorRoyalties = agreement.honorRoyalties;

    // Calculate platform fee (in basis points)
    // 1 bps = 0.01% = 0.0001
    const platformFee = price.mul(feeBps).div(10000);

    let creatorRoyalty = new Decimal(0);

    // Calculate creator royalty if enabled
    if (honorRoyalties) {
      try {
        const nftMetadata = await this.fetchNftMetadata(agreement.nftMint);
        if (nftMetadata && nftMetadata.sellerFeeBasisPoints) {
          // Creator royalty as percentage of price
          creatorRoyalty = price.mul(nftMetadata.sellerFeeBasisPoints).div(10000);
        }
      } catch (error) {
        console.error('[SettlementService] Error fetching NFT metadata:', error);
        // Continue without royalties if metadata fetch fails
      }
    }

    // Calculate amount seller receives
    const totalDeductions = platformFee.add(creatorRoyalty);
    const sellerReceived = price.sub(totalDeductions);

    // Ensure seller receives at least 0
    if (sellerReceived.lt(0)) {
      throw new Error('Fees exceed price, settlement cannot proceed');
    }

    return {
      platformFee,
      creatorRoyalty,
      sellerReceived,
      totalDeductions,
    };
  }

  /**
   * Execute on-chain settlement instruction
   */
  private async executeOnChainSettlement(
    agreement: any,
    feeCalculation: FeeCalculation
  ): Promise<string> {
    console.log('[SettlementService] Calling on-chain settlement instruction...');

    try {
      // Get escrow program service
      const escrowProgramService = getEscrowProgramService();
      
      // Parse public keys
      const escrowPda = new PublicKey(agreement.escrowPda);
      const seller = new PublicKey(agreement.seller);
      const buyer = new PublicKey(agreement.buyer!);
      const nftMint = new PublicKey(agreement.nftMint);
      const feeCollector = new PublicKey(this.config.platformFeeCollectorAddress);

      // Get USDC mint address from config
      const usdcMintStr = config.usdc?.mintAddress || 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'; // Devnet USDC
      const usdcMint = new PublicKey(usdcMintStr);

      console.log('[SettlementService] Settlement parties:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        buyer: buyer.toString(),
        nftMint: nftMint.toString(),
        usdcMint: usdcMint.toString(),
        feeCollector: feeCollector.toString(),
        platformFee: feeCalculation.platformFee.toString(),
        creatorRoyalty: feeCalculation.creatorRoyalty.toString(),
        sellerReceived: feeCalculation.sellerReceived.toString(),
      });

        // Call Anchor program settle instruction with fee distribution
        console.log('[SettlementService] 🔗 Calling Anchor program settle() instruction with fee distribution...');
        const platformFeeBps = agreement.feeBps ?? 100; // Default to 100 bps (1%) if not specified (use nullish coalescing to allow 0)
      const txId = await escrowProgramService.settle(
        escrowPda,
        seller,
        buyer,
        nftMint,
        usdcMint,
        feeCollector,
        platformFeeBps
      );

      console.log('[SettlementService] ✅ Settlement transaction confirmed:', txId);
      console.log('[SettlementService] Settlement completed with fee distribution:');
      console.log('[SettlementService]   ✅ NFT transferred from escrow to buyer');
      console.log('[SettlementService]   ✅ USDC transferred to seller (minus fee)');
      console.log('[SettlementService]   ✅ Platform fee transferred to fee collector');
      console.log(`[SettlementService]   Explorer: https://explorer.solana.com/tx/${txId}?cluster=devnet`);

      return txId;
    } catch (error) {
      console.error('[SettlementService] Error executing on-chain settlement:', error);
      throw error;
    }
  }

  /**
   * Fetch NFT metadata for royalty information
   */
  private async fetchNftMetadata(nftMint: string): Promise<NftMetadata | null> {
    try {
      console.log(`[SettlementService] Fetching NFT metadata for ${nftMint}`);

      // TODO: Implement actual Metaplex metadata fetching
      // For now, return mock metadata
      
      // In production, this would:
      // 1. Derive Metaplex metadata PDA
      // 2. Fetch metadata account
      // 3. Parse metadata including creator royalty info
      // 4. Return structured metadata

      const mockMetadata: NftMetadata = {
        sellerFeeBasisPoints: 500, // 5% creator royalty
        creators: [
          {
            address: '11111111111111111111111111111111',
            share: 100,
            verified: true,
          },
        ],
      };

      console.log('[SettlementService] NFT metadata:', mockMetadata);

      return mockMetadata;
    } catch (error) {
      console.error('[SettlementService] Error fetching NFT metadata:', error);
      return null;
    }
  }

  /**
   * Get creator address for royalty payment
   */
  private async getCreatorAddress(agreement: any): Promise<string | null> {
    try {
      const metadata = await this.fetchNftMetadata(agreement.nftMint);
      
      if (metadata && metadata.creators && metadata.creators.length > 0) {
        // Return first verified creator
        const creator = metadata.creators.find((c) => c.verified);
        return creator?.address || metadata.creators[0].address;
      }

      return null;
    } catch (error) {
      console.error('[SettlementService] Error getting creator address:', error);
      return null;
    }
  }

  /**
   * Get block height for a transaction
   */
  private async getTransactionBlockHeight(txId: string): Promise<bigint | null> {
    try {
      // For mock transactions, return a mock block height
      if (txId.startsWith('settle_tx_')) {
        return BigInt(Date.now());
      }

      const connection = this.solanaService.getConnection();
      const transaction = await connection.getTransaction(txId, {
        maxSupportedTransactionVersion: 0,
      });

      if (transaction && transaction.slot) {
        return BigInt(transaction.slot);
      }

      return null;
    } catch (error) {
      console.error('[SettlementService] Error getting transaction block height:', error);
      return null;
    }
  }

  /**
   * Manually trigger settlement for a specific agreement
   */
  async settleAgreement(agreementId: string): Promise<SettlementResult> {
    try {
      console.log(`[SettlementService] Manual settlement triggered for ${agreementId}`);

      const agreement = await prisma.agreement.findUnique({
        where: { agreementId },
        include: {
          deposits: true,
        },
      });

      if (!agreement) {
        return {
          success: false,
          error: 'Agreement not found',
        };
      }

      if (agreement.status !== AgreementStatus.BOTH_LOCKED) {
        return {
          success: false,
          error: `Agreement is not ready for settlement (status: ${agreement.status})`,
        };
      }

      if (!this.validateNotExpired(agreement)) {
        return {
          success: false,
          error: 'Agreement has expired',
        };
      }

      return await this.executeSettlement(agreement);
    } catch (error) {
      console.error('[SettlementService] Error in manual settlement:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean;
    pollingInterval: number;
    platformFeeCollector: string;
  } {
    return {
      isRunning: this.isRunning,
      pollingInterval: this.config.pollingInterval,
      platformFeeCollector: this.config.platformFeeCollectorAddress,
    };
  }
}

// Singleton instance
let settlementServiceInstance: SettlementService | null = null;

/**
 * Get or create settlement service singleton instance
 */
export function getSettlementService(config?: SettlementConfig): SettlementService {
  if (!settlementServiceInstance) {
    settlementServiceInstance = new SettlementService(config);
  }
  return settlementServiceInstance;
}

/**
 * Reset settlement service instance (useful for testing)
 */
export function resetSettlementService(): void {
  if (settlementServiceInstance) {
    settlementServiceInstance.stop().catch(console.error);
    settlementServiceInstance = null;
  }
}

export default SettlementService;

