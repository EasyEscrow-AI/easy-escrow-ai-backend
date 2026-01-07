/**
 * Direct Programmable NFT Transfer Service
 *
 * Builds pNFT transfer instructions using Token Metadata program's TransferV1,
 * bypassing the escrow program. pNFTs have frozen token accounts and require
 * Token Record PDAs for state tracking.
 *
 * Used with Jito bundles for atomic pNFT swaps:
 * - Transaction 1: SOL transfers (payment + fee)
 * - Transaction 2+: pNFT transfer(s) via Token Metadata TransferV1
 *
 * Key differences from standard NFT transfers:
 * 1. Token accounts are permanently frozen (must use Token Metadata)
 * 2. Requires Token Record PDAs (source and destination)
 * 3. May have Authorization Rules that block certain transfers
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_AUTH_RULES_PROGRAM_ID,
  findMetadataPda,
  findMasterEditionPda,
  findTokenRecordPda,
  PnftTransferResult,
  AuthorizationRulesResult,
} from '../types/pnft';

/**
 * Parameters for building a direct pNFT transfer instruction
 */
export interface DirectPnftTransferParams {
  /** pNFT mint address */
  mint: string;
  /** Current owner (must sign) */
  fromWallet: PublicKey;
  /** New owner */
  toWallet: PublicKey;
  /** Optional: Pre-fetched authorization rules from DAS API */
  authorizationRules?: string;
}

/**
 * Service for building direct pNFT transfer instructions
 */
export class DirectPnftService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
    console.log('[DirectPnftService] Initialized');
  }

  /**
   * Build a direct pNFT transfer instruction using Token Metadata TransferV1
   *
   * This creates a transfer instruction that calls Token Metadata directly,
   * handling the frozen token account and Token Record PDAs.
   */
  async buildTransferInstruction(
    params: DirectPnftTransferParams
  ): Promise<PnftTransferResult> {
    console.log('[DirectPnftService] Building transfer instruction:', {
      mint: params.mint,
      from: params.fromWallet.toBase58(),
      to: params.toWallet.toBase58(),
      hasAuthRules: !!params.authorizationRules,
    });

    const mintPubkey = new PublicKey(params.mint);

    // Derive all required accounts
    const sourceAta = await getAssociatedTokenAddress(mintPubkey, params.fromWallet);
    const destinationAta = await getAssociatedTokenAddress(mintPubkey, params.toWallet);
    const metadataAccount = findMetadataPda(mintPubkey);
    const masterEditionAccount = findMasterEditionPda(mintPubkey);
    const sourceTokenRecord = findTokenRecordPda(mintPubkey, sourceAta);
    const destinationTokenRecord = findTokenRecordPda(mintPubkey, destinationAta);

    console.log('[DirectPnftService] Derived accounts:', {
      sourceAta: sourceAta.toBase58(),
      destinationAta: destinationAta.toBase58(),
      metadata: metadataAccount.toBase58(),
      masterEdition: masterEditionAccount.toBase58(),
      sourceTokenRecord: sourceTokenRecord.toBase58(),
      destinationTokenRecord: destinationTokenRecord.toBase58(),
    });

    // Check if destination ATA exists, if not we need to create it
    const destinationAtaInfo = await this.connection.getAccountInfo(destinationAta);
    const needsAtaCreation = !destinationAtaInfo;

    // Build TransferV1 instruction manually
    // Token Metadata TransferV1 discriminator is [163, 52, 200, 231, 140, 3, 69, 186]
    const TRANSFER_V1_DISCRIMINATOR = Buffer.from([163, 52, 200, 231, 140, 3, 69, 186]);

    // Build instruction data
    // TransferV1 args: { amount: u64, authorization_data: Option<AuthorizationData> }
    // For pNFTs, amount is always 1 and we'll pass None for authorization_data
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(BigInt(1), 0); // amount = 1
    const authDataOption = Buffer.from([0]); // None for authorization_data

    const instructionData = Buffer.concat([
      TRANSFER_V1_DISCRIMINATOR,
      amountBuffer,
      authDataOption,
    ]);

    // Build the account keys
    // TransferV1 accounts (in order):
    // 0. token (source ATA) - writable
    // 1. token_owner (current owner) - signer
    // 2. destination (dest ATA) - writable
    // 3. destination_owner (new owner)
    // 4. mint - writable
    // 5. metadata - writable
    // 6. edition (optional, Master Edition for pNFTs)
    // 7. token_record (source) - writable
    // 8. destination_token_record - writable
    // 9. authority (same as token_owner for owner transfers) - signer
    // 10. payer - signer, writable
    // 11. system_program
    // 12. sysvar_instructions
    // 13. spl_token_program
    // 14. spl_ata_program (optional)
    // 15. authorization_rules_program (optional)
    // 16. authorization_rules (optional)

    const hasAuthRules = !!params.authorizationRules;
    const authRulesPubkey = hasAuthRules ? new PublicKey(params.authorizationRules!) : null;

    const keys = [
      { pubkey: sourceAta, isSigner: false, isWritable: true }, // token
      { pubkey: params.fromWallet, isSigner: true, isWritable: false }, // token_owner
      { pubkey: destinationAta, isSigner: false, isWritable: true }, // destination
      { pubkey: params.toWallet, isSigner: false, isWritable: false }, // destination_owner
      { pubkey: mintPubkey, isSigner: false, isWritable: false }, // mint
      { pubkey: metadataAccount, isSigner: false, isWritable: true }, // metadata
      { pubkey: masterEditionAccount, isSigner: false, isWritable: false }, // edition
      { pubkey: sourceTokenRecord, isSigner: false, isWritable: true }, // token_record
      { pubkey: destinationTokenRecord, isSigner: false, isWritable: true }, // destination_token_record
      { pubkey: params.fromWallet, isSigner: true, isWritable: false }, // authority
      { pubkey: params.fromWallet, isSigner: true, isWritable: true }, // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false }, // sysvar_instructions
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // spl_token_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // spl_ata_program
    ];

    // Add authorization rules accounts if present
    if (hasAuthRules && authRulesPubkey) {
      keys.push(
        { pubkey: TOKEN_AUTH_RULES_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: authRulesPubkey, isSigner: false, isWritable: false }
      );
    }

    const instruction = new TransactionInstruction({
      programId: TOKEN_METADATA_PROGRAM_ID,
      keys,
      data: instructionData,
    });

    // Estimate size: base instruction + accounts
    const estimatedSize = 200 + (keys.length * 32);

    console.log('[DirectPnftService] Transfer instruction built:', {
      accountCount: keys.length,
      dataSize: instructionData.length,
      estimatedSize,
      needsAtaCreation,
      hasAuthRules,
    });

    return {
      instruction,
      sourceAta,
      destinationAta,
      sourceTokenRecord,
      destinationTokenRecord,
      hasAuthorizationRules: hasAuthRules,
      estimatedSize,
      needsDestinationAta: needsAtaCreation,
    };
  }

  /**
   * Check if a pNFT transfer would be allowed by authorization rules
   *
   * This simulates the transfer to detect if auth rules would block it.
   */
  async checkAuthorizationRules(
    mint: string,
    fromWallet: PublicKey,
    toWallet: PublicKey,
    authorizationRules?: string
  ): Promise<AuthorizationRulesResult> {
    // If no auth rules, transfer is always allowed
    if (!authorizationRules) {
      return { allowed: true };
    }

    console.log('[DirectPnftService] Checking authorization rules:', {
      mint,
      from: fromWallet.toBase58(),
      to: toWallet.toBase58(),
      ruleSet: authorizationRules,
    });

    try {
      // Build and simulate the transfer
      const { instruction } = await this.buildTransferInstruction({
        mint,
        fromWallet,
        toWallet,
        authorizationRules,
      });

      // Create a minimal transaction for simulation
      const { Transaction } = await import('@solana/web3.js');
      const recentBlockhash = await this.connection.getLatestBlockhash();

      const tx = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: fromWallet,
      }).add(instruction);

      // Simulate
      const simulation = await this.connection.simulateTransaction(tx);

      if (simulation.value.err) {
        const errStr = JSON.stringify(simulation.value.err);

        // Check for common auth rule errors
        if (
          errStr.includes('AuthorizationRulesFailed') ||
          errStr.includes('0x6c') || // Custom error code for auth failure
          errStr.includes('Program Rule Violated')
        ) {
          return {
            allowed: false,
            ruleSet: authorizationRules,
            error:
              'This pNFT has authorization rules that block this transfer. ' +
              'The transfer may be restricted to certain marketplaces or programs.',
          };
        }

        // Other simulation error
        return {
          allowed: false,
          ruleSet: authorizationRules,
          error: `Transfer simulation failed: ${errStr}`,
        };
      }

      return { allowed: true, ruleSet: authorizationRules };
    } catch (error: any) {
      console.error('[DirectPnftService] Authorization check failed:', error);
      return {
        allowed: false,
        ruleSet: authorizationRules,
        error: `Failed to check authorization rules: ${error.message}`,
      };
    }
  }

  /**
   * Simulate a pNFT transfer to verify it would succeed
   */
  async simulateTransfer(
    params: DirectPnftTransferParams
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { instruction } = await this.buildTransferInstruction(params);

      // Create a minimal transaction for simulation
      const { Transaction } = await import('@solana/web3.js');
      const recentBlockhash = await this.connection.getLatestBlockhash();

      const tx = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: params.fromWallet,
      }).add(instruction);

      // Simulate
      const simulation = await this.connection.simulateTransaction(tx);

      if (simulation.value.err) {
        return {
          success: false,
          error: JSON.stringify(simulation.value.err),
        };
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * Create a DirectPnftService instance
 */
export function createDirectPnftService(connection: Connection): DirectPnftService {
  return new DirectPnftService(connection);
}
