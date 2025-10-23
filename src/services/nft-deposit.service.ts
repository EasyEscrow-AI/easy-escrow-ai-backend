/**
 * NFT Deposit Service
 *
 * Handles detection and validation of NFT deposits to escrow accounts.
 * Monitors NFT token accounts, validates metadata, and updates database.
 */

import { PublicKey, AccountInfo, Context } from '@solana/web3.js';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { prisma } from '../config/database';
import { getSolanaService } from './solana.service';
import { DepositStatus, AgreementStatus } from '../generated/prisma';
import { getTransactionLogService, TransactionOperationType, TransactionStatusType } from './transaction-log.service';

/**
 * NFT token account data structure
 */
interface NftTokenAccountData {
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  state: number;
}

/**
 * NFT Deposit Result
 */
interface NftDepositResult {
  success: boolean;
  depositId?: string;
  mint?: string;
  status?: DepositStatus; // Added status field to track deposit state
  error?: string;
}

/**
 * NFT Metadata structure
 */
interface NftMetadata {
  mint: string;
  onChain?: {
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints: number;
    creators: any[];
  };
  offChain?: any;
  error?: string;
}

/**
 * Parse NFT token account data
 */
function parseNftTokenAccountData(data: Buffer): NftTokenAccountData | null {
  try {
    if (data.length !== AccountLayout.span) {
      console.error(
        `[NftDepositService] Invalid account data length: ${data.length}, expected: ${AccountLayout.span}`
      );
      return null;
    }

    const decoded = AccountLayout.decode(data);

    return {
      mint: new PublicKey(decoded.mint),
      owner: new PublicKey(decoded.owner),
      amount: decoded.amount,
      state: decoded.state,
    };
  } catch (error) {
    console.error('[NftDepositService] Error parsing NFT token account data:', error);
    return null;
  }
}

/**
 * NFT Deposit Service Class
 *
 * Handles NFT deposit detection, metadata validation, and database updates.
 */
export class NftDepositService {
  private solanaService: ReturnType<typeof getSolanaService>;

  constructor() {
    this.solanaService = getSolanaService();
    console.log('[NftDepositService] Initialized');
  }

  /**
   * Handle NFT account change
   * Called when a monitored NFT deposit account changes
   */
  async handleNftAccountChange(
    publicKey: string,
    accountInfo: AccountInfo<Buffer>,
    context: Context,
    agreementId: string
  ): Promise<NftDepositResult> {
    try {
      console.log(`[NftDepositService] Processing NFT account change for agreement: ${agreementId}`);
      console.log(`[NftDepositService] Account: ${publicKey}, Slot: ${context.slot}`);

      // Validate account owner is Token Program
      if (accountInfo.owner.toBase58() !== TOKEN_PROGRAM_ID.toBase58()) {
        console.error(`[NftDepositService] Invalid account owner: ${accountInfo.owner.toBase58()}`);
        return {
          success: false,
          error: 'Invalid account owner - not a token account',
        };
      }

      // Parse token account data
      const tokenAccountData = parseNftTokenAccountData(accountInfo.data);
      if (!tokenAccountData) {
        return {
          success: false,
          error: 'Failed to parse token account data',
        };
      }

      // Check if amount is 1 (NFTs have amount of 1)
      if (tokenAccountData.amount !== BigInt(1)) {
        console.warn(`[NftDepositService] Token amount is not 1: ${tokenAccountData.amount}`);
        // For NFTs, amount should be exactly 1
        if (tokenAccountData.amount === BigInt(0)) {
          console.log(`[NftDepositService] NFT not yet deposited (amount = 0)`);
          return {
            success: false,
            error: 'NFT not yet deposited',
          };
        }
      }

      // Check if deposit already exists
      const existingDeposit = await prisma.deposit.findFirst({
        where: {
          agreement: {
            id: agreementId,
          },
          type: 'NFT',
          status: {
            in: ['CONFIRMED', 'PENDING'],
          },
        },
      });

      if (existingDeposit) {
        console.log(`[NftDepositService] Deposit already exists for agreement: ${agreementId}`);

        // Update if status is PENDING
        if (existingDeposit.status === 'PENDING' && tokenAccountData.amount === BigInt(1)) {
          console.log(`[NftDepositService] Updating pending deposit to CONFIRMED`);
          await prisma.deposit.update({
            where: { id: existingDeposit.id },
            data: {
              status: 'CONFIRMED',
              confirmedAt: new Date(),
              blockHeight: BigInt(context.slot),
            },
          });

          // Create transaction log for confirmed NFT deposit
          try {
            const agreement = await prisma.agreement.findUnique({
              where: { id: agreementId },
              select: { agreementId: true },
            });
            
            if (agreement) {
              const transactionLogService = getTransactionLogService();
              // Pass slot from context to help find the exact transaction
              const txSignature = await this.solanaService.getRecentTransactionSignature(publicKey, context.slot);
              
              if (txSignature) {
                await transactionLogService.captureTransaction({
                  txId: txSignature,
                  operationType: TransactionOperationType.DEPOSIT_NFT,
                  agreementId: agreement.agreementId,
                  status: TransactionStatusType.CONFIRMED,
                  blockHeight: BigInt(context.slot),
                });
                console.log(`[NftDepositService] ✅ Transaction log created for NFT deposit: ${txSignature}`);
              } else {
                console.error(`[NftDepositService] ❌ Failed to retrieve transaction signature for NFT deposit at slot ${context.slot}`);
              }
            }
          } catch (logError) {
            console.error(`[NftDepositService] Error creating transaction log:`, logError);
            // Don't fail the deposit if transaction log creation fails
          }

          return {
            success: true,
            depositId: existingDeposit.id,
            mint: tokenAccountData.mint.toBase58(),
            status: 'CONFIRMED' as DepositStatus, // Include status
          };
        }

        return {
          success: true,
          depositId: existingDeposit.id,
          mint: tokenAccountData.mint.toBase58(),
          status: existingDeposit.status as DepositStatus, // Include status
        };
      }

      // Get agreement details
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId: agreementId },
        select: {
          id: true,
          agreementId: true,
          nftMint: true,
          seller: true,
          nftDepositAddr: true,
          status: true,
        },
      });

      if (!agreement) {
        console.error(`[NftDepositService] Agreement not found: ${agreementId}`);
        return {
          success: false,
          error: 'Agreement not found',
        };
      }

      const mintAddress = tokenAccountData.mint.toBase58();
      console.log(`[NftDepositService] Detected NFT deposit with mint: ${mintAddress}`);

      // Validate mint matches expected NFT
      const expectedMint = agreement.nftMint;
      if (mintAddress !== expectedMint) {
        console.error(
          `[NftDepositService] Mint mismatch: got ${mintAddress}, expected ${expectedMint}`
        );
        return {
          success: false,
          error: 'NFT mint does not match expected mint',
        };
      }

      // Fetch and validate NFT metadata
      let metadata: NftMetadata | null = null;
      try {
        metadata = await this.fetchNftMetadata(mintAddress);
        console.log(
          `[NftDepositService] Fetched NFT metadata:`,
          JSON.stringify(metadata, null, 2)
        );
      } catch (error) {
        console.warn(`[NftDepositService] Failed to fetch metadata for ${mintAddress}:`, error);
        // Continue anyway - metadata fetch is optional
      }

      // Determine deposit status based on amount
      const depositStatus: DepositStatus = tokenAccountData.amount === BigInt(1) ? 'CONFIRMED' : 'PENDING';

      // Create deposit record
      const deposit = await prisma.deposit.create({
        data: {
          agreementId: agreement.id,
          type: 'NFT',
          depositor: tokenAccountData.owner.toBase58(),
          amount: null, // NFTs don't have a USD amount
          tokenAccount: publicKey,
          status: depositStatus,
          blockHeight: BigInt(context.slot),
          confirmedAt: tokenAccountData.amount === BigInt(1) ? new Date() : null,
          nftMetadata: (metadata || { mint: mintAddress }) as any,
        },
      });

      console.log(`[NftDepositService] Created deposit record: ${deposit.id}`);

      // Create transaction log for confirmed NFT deposit
      if (depositStatus === 'CONFIRMED') {
        try {
          const transactionLogService = getTransactionLogService();
          // Pass slot from context to help find the exact transaction
          const txSignature = await this.solanaService.getRecentTransactionSignature(publicKey, context.slot);
          
          if (txSignature) {
            await transactionLogService.captureTransaction({
              txId: txSignature,
              operationType: TransactionOperationType.DEPOSIT_NFT,
              agreementId: agreement.agreementId,
              status: TransactionStatusType.CONFIRMED,
              blockHeight: BigInt(context.slot),
            });
            console.log(`[NftDepositService] ✅ Transaction log created for NFT deposit: ${txSignature}`);
          } else {
            console.error(`[NftDepositService] ❌ Failed to retrieve transaction signature for NFT deposit at slot ${context.slot}`);
          }
        } catch (logError) {
          console.error(`[NftDepositService] Error creating transaction log:`, logError);
          // Don't fail the deposit if transaction log creation fails
        }
      }

      // Update agreement status if NFT is now locked
      if (depositStatus === 'CONFIRMED') {
        await this.updateAgreementStatus(agreement.id, agreement.status);
      }

      return {
        success: true,
        depositId: deposit.id,
        mint: mintAddress,
        status: depositStatus, // Include status
      };
    } catch (error) {
      console.error(`[NftDepositService] Error handling NFT account change:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch NFT metadata from on-chain and off-chain sources
   */
  private async fetchNftMetadata(mintAddress: string): Promise<NftMetadata> {
    try {
      console.log(`[NftDepositService] Fetching metadata for NFT: ${mintAddress}`);

      // Try to get Metaplex metadata account
      const metadataAccount = await this.getMetaplexMetadataAccount(mintAddress);

      if (!metadataAccount) {
        console.log(`[NftDepositService] No Metaplex metadata found for ${mintAddress}`);
        return { mint: mintAddress };
      }

      // If we have a URI, fetch off-chain metadata
      if (metadataAccount.uri) {
        try {
          const offChainMetadata = await this.fetchOffChainMetadata(metadataAccount.uri);
          return {
            mint: mintAddress,
            onChain: metadataAccount,
            offChain: offChainMetadata,
          };
        } catch (error) {
          console.warn(
            `[NftDepositService] Failed to fetch off-chain metadata from ${metadataAccount.uri}:`,
            error
          );
          return {
            mint: mintAddress,
            onChain: metadataAccount,
          };
        }
      }

      return {
        mint: mintAddress,
        onChain: metadataAccount,
      };
    } catch (error) {
      console.error(`[NftDepositService] Error fetching NFT metadata:`, error);
      return { mint: mintAddress, error: 'Failed to fetch metadata' };
    }
  }

  /**
   * Get Metaplex metadata account
   * This is a simplified implementation - in production, use @metaplex-foundation/js
   */
  private async getMetaplexMetadataAccount(
    mintAddress: string
  ): Promise<{
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints: number;
    creators: any[];
  } | null> {
    try {
      // Derive metadata PDA (Program Derived Address)
      const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      const mint = new PublicKey(mintAddress);

      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        METADATA_PROGRAM_ID
      );

      console.log(`[NftDepositService] Metadata PDA: ${metadataPDA.toBase58()}`);

      // Fetch metadata account
      const accountInfo = await this.solanaService.getAccountInfo(metadataPDA.toBase58());

      if (!accountInfo) {
        console.log(`[NftDepositService] No metadata account found`);
        return null;
      }

      // Parse metadata (simplified - real implementation would use Metaplex deserializer)
      // For now, we'll return a basic structure
      console.log(
        `[NftDepositService] Found metadata account with ${accountInfo.data.length} bytes`
      );

      // This is a placeholder - in production, properly deserialize Metaplex metadata
      return {
        name: 'NFT', // Would parse from account data
        symbol: '',
        uri: '', // Would parse from account data
        sellerFeeBasisPoints: 0,
        creators: [],
      };
    } catch (error) {
      console.error('[NftDepositService] Error getting Metaplex metadata:', error);
      return null;
    }
  }

  /**
   * Fetch off-chain metadata from URI
   */
  private async fetchOffChainMetadata(uri: string): Promise<any> {
    try {
      console.log(`[NftDepositService] Fetching off-chain metadata from: ${uri}`);

      // Handle IPFS URIs
      let fetchUrl = uri;
      if (uri.startsWith('ipfs://')) {
        // Use public IPFS gateway
        fetchUrl = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }

      const response = await fetch(fetchUrl, {
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const metadata = await response.json();
      return metadata;
    } catch (error) {
      console.error('[NftDepositService] Error fetching off-chain metadata:', error);
      throw error;
    }
  }

  /**
   * Update agreement status based on deposit status
   */
  private async updateAgreementStatus(agreementId: string, currentStatus: string): Promise<void> {
    try {
      // Check if USDC is also deposited
      const usdcDeposit = await prisma.deposit.findFirst({
        where: {
          agreementId,
          type: 'USDC',
          status: 'CONFIRMED',
        },
      });

      let newStatus: AgreementStatus;
      if (usdcDeposit) {
        // Both USDC and NFT are locked
        newStatus = 'BOTH_LOCKED' as AgreementStatus;
      } else if (currentStatus === 'PENDING' || currentStatus === 'FUNDED') {
        // Only NFT is locked
        newStatus = 'NFT_LOCKED' as AgreementStatus;
      } else if (currentStatus === 'USDC_LOCKED') {
        // USDC was already locked, now NFT is also locked
        newStatus = 'BOTH_LOCKED' as AgreementStatus;
      } else {
        // Don't change status
        return;
      }

      await prisma.agreement.update({
        where: { id: agreementId },
        data: { status: newStatus },
      });

      console.log(`[NftDepositService] Updated agreement status to: ${newStatus}`);
    } catch (error) {
      console.error('[NftDepositService] Error updating agreement status:', error);
      throw error;
    }
  }

  /**
   * Verify NFT deposit for an agreement
   */
  async verifyNftDeposit(
    agreementId: string
  ): Promise<{ deposited: boolean; mint?: string; metadata?: any }> {
    try {
      const agreement = await prisma.agreement.findUnique({
        where: { id: agreementId },
        include: {
          deposits: {
            where: {
              type: 'NFT',
              status: 'CONFIRMED',
            },
          },
        },
      });

      if (!agreement) {
        return { deposited: false };
      }

      if (!agreement.nftDepositAddr) {
        return { deposited: false };
      }

      const deposit = agreement.deposits[0];
      if (deposit) {
        return {
          deposited: true,
          mint: agreement.nftMint,
          metadata: deposit.nftMetadata,
        };
      }

      // Check current state on-chain
      const accountInfo = await this.solanaService.getAccountInfo(agreement.nftDepositAddr);
      if (accountInfo) {
        const tokenData = parseNftTokenAccountData(accountInfo.data);
        if (tokenData && tokenData.amount === BigInt(1)) {
          return {
            deposited: true,
            mint: tokenData.mint.toBase58(),
          };
        }
      }

      return { deposited: false };
    } catch (error) {
      console.error('[NftDepositService] Error verifying NFT deposit:', error);
      return { deposited: false };
    }
  }

  /**
   * Validate NFT mint address
   */
  async validateNftMint(
    mintAddress: string
  ): Promise<{ valid: boolean; isNft: boolean; metadata?: any }> {
    try {
      const mint = new PublicKey(mintAddress);
      const accountInfo = await this.solanaService.getAccountInfo(mint.toBase58());

      if (!accountInfo) {
        return { valid: false, isNft: false };
      }

      // Check if it's a mint account (owner is Token Program)
      if (accountInfo.owner.toBase58() !== TOKEN_PROGRAM_ID.toBase58()) {
        return { valid: false, isNft: false };
      }

      // Try to fetch metadata to verify it's an NFT
      const metadata = await this.fetchNftMetadata(mintAddress);

      // NFTs typically have metadata and supply of 1
      const isNft = metadata && metadata.onChain !== undefined;

      return {
        valid: true,
        isNft,
        metadata: isNft ? metadata : undefined,
      };
    } catch (error) {
      console.error('[NftDepositService] Error validating NFT mint:', error);
      return { valid: false, isNft: false };
    }
  }
}

// Singleton instance
let nftDepositServiceInstance: NftDepositService | null = null;

/**
 * Get or create NFT deposit service singleton instance
 */
export function getNftDepositService(): NftDepositService {
  if (!nftDepositServiceInstance) {
    nftDepositServiceInstance = new NftDepositService();
  }
  return nftDepositServiceInstance;
}

/**
 * Reset NFT deposit service instance (useful for testing)
 */
export function resetNftDepositService(): void {
  nftDepositServiceInstance = null;
}

export default NftDepositService;

