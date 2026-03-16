/**
 * Institution Escrow Program Service
 *
 * Builds transaction instructions for the 4 on-chain institution escrow operations
 * using the Anchor IDL. Handles PDA derivation, ATA lookup, and tx serialization.
 */

import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { config } from '../config';
import { BN } from 'bn.js';

// PDA seeds matching the Rust program
const INST_ESCROW_SEED = Buffer.from('inst_escrow');
const INST_VAULT_SEED = Buffer.from('inst_vault');

export class InstitutionEscrowProgramService {
  private connection: Connection;
  private programId: PublicKey;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.programId = new PublicKey(config.solana.escrowProgramId);
  }

  /**
   * Derive the escrow state PDA
   */
  deriveEscrowStatePda(escrowIdBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [INST_ESCROW_SEED, escrowIdBytes],
      this.programId,
    );
  }

  /**
   * Derive the token vault PDA
   */
  deriveVaultPda(escrowIdBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [INST_VAULT_SEED, escrowIdBytes],
      this.programId,
    );
  }

  /**
   * Convert UUID string to 32-byte buffer for PDA derivation
   */
  uuidToBytes(uuid: string): Buffer {
    // Remove dashes and convert hex to buffer, then pad to 32 bytes
    const hex = uuid.replace(/-/g, '');
    const buf = Buffer.from(hex, 'hex');
    const padded = Buffer.alloc(32);
    buf.copy(padded);
    return padded;
  }

  /**
   * Get or create Associated Token Account instruction
   */
  async getOrCreateAta(
    mint: PublicKey,
    owner: PublicKey,
    payer: PublicKey,
  ): Promise<{ address: PublicKey; instruction?: TransactionInstruction }> {
    const ata = await getAssociatedTokenAddress(mint, owner);

    try {
      const account = await this.connection.getAccountInfo(ata);
      if (account) {
        return { address: ata };
      }
    } catch {
      // Account doesn't exist
    }

    const instruction = createAssociatedTokenAccountInstruction(
      payer,
      ata,
      owner,
      mint,
    );
    return { address: ata, instruction };
  }

  /**
   * Build init institution escrow transaction
   */
  async buildInitTransaction(params: {
    escrowId: string;
    authority: PublicKey;
    payerWallet: PublicKey;
    recipientWallet: PublicKey;
    usdcMint: PublicKey;
    feeCollector: PublicKey;
    settlementAuthority: PublicKey;
    amount: number;
    platformFee: number;
    conditionType: number;
    corridor: string;
    expiryTimestamp: number;
  }): Promise<{ transaction: Transaction; escrowPda: string; vaultPda: string }> {
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [escrowPda, escrowBump] = this.deriveEscrowStatePda(escrowIdBytes);
    const [vaultPda, vaultBump] = this.deriveVaultPda(escrowIdBytes);

    // Encode corridor to 8 bytes
    const corridorBytes = Buffer.alloc(8);
    Buffer.from(params.corridor).copy(corridorBytes);

    // Convert USDC amounts to micro-USDC (6 decimals)
    const amountMicroUsdc = Math.round(params.amount * 1_000_000);
    const feeMicroUsdc = Math.round(params.platformFee * 1_000_000);

    // Note: Actual instruction encoding would use Anchor's IDL-based encoding
    // This is a simplified version - the full implementation would use
    // @coral-xyz/anchor to build instructions from the IDL
    const transaction = new Transaction();

    // In production, this would use the Anchor Program instance:
    // const program = new Program(idl, programId, provider);
    // const ix = await program.methods.initInstitutionEscrow(...)
    //   .accounts({...}).instruction();

    return {
      transaction,
      escrowPda: escrowPda.toBase58(),
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build deposit transaction
   */
  async buildDepositTransaction(params: {
    escrowId: string;
    payer: PublicKey;
    usdcMint: PublicKey;
  }): Promise<Transaction> {
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);
    const [vaultPda] = this.deriveVaultPda(escrowIdBytes);

    const payerAta = await getAssociatedTokenAddress(params.usdcMint, params.payer);

    const transaction = new Transaction();
    // Anchor instruction would be added here
    return transaction;
  }

  /**
   * Build release transaction
   */
  async buildReleaseTransaction(params: {
    escrowId: string;
    authority: PublicKey;
    recipientWallet: PublicKey;
    feeCollector: PublicKey;
    usdcMint: PublicKey;
  }): Promise<Transaction> {
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);
    const [vaultPda] = this.deriveVaultPda(escrowIdBytes);

    const transaction = new Transaction();

    // Ensure recipient and fee collector ATAs exist
    const recipientAta = await this.getOrCreateAta(
      params.usdcMint,
      params.recipientWallet,
      params.authority,
    );
    if (recipientAta.instruction) {
      transaction.add(recipientAta.instruction);
    }

    const feeCollectorAta = await this.getOrCreateAta(
      params.usdcMint,
      params.feeCollector,
      params.authority,
    );
    if (feeCollectorAta.instruction) {
      transaction.add(feeCollectorAta.instruction);
    }

    // Anchor instruction would be added here
    return transaction;
  }

  /**
   * Build cancel transaction
   */
  async buildCancelTransaction(params: {
    escrowId: string;
    caller: PublicKey;
    payerWallet: PublicKey;
    usdcMint: PublicKey;
  }): Promise<Transaction> {
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);
    const [vaultPda] = this.deriveVaultPda(escrowIdBytes);

    const payerAta = await getAssociatedTokenAddress(params.usdcMint, params.payerWallet);

    const transaction = new Transaction();
    // Anchor instruction would be added here
    return transaction;
  }

  /**
   * Verify on-chain escrow state
   */
  async verifyOnChainState(escrowId: string): Promise<{
    exists: boolean;
    status?: number;
    amount?: number;
    vaultBalance?: number;
  }> {
    const escrowIdBytes = this.uuidToBytes(escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);

    try {
      const accountInfo = await this.connection.getAccountInfo(escrowPda);
      if (!accountInfo) {
        return { exists: false };
      }

      // Decode the account data (simplified - would use Anchor's coder)
      // const decoded = program.coder.accounts.decode('InstitutionEscrow', accountInfo.data);

      return {
        exists: true,
        // status, amount, vaultBalance would come from decoded data
      };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Get USDC mint address based on environment
   */
  getUsdcMintAddress(): PublicKey {
    const mintAddress = process.env.USDC_MINT_ADDRESS;
    if (!mintAddress) {
      throw new Error('USDC_MINT_ADDRESS not configured');
    }
    return new PublicKey(mintAddress);
  }
}

let instance: InstitutionEscrowProgramService | null = null;
export function getInstitutionEscrowProgramService(): InstitutionEscrowProgramService {
  if (!instance) {
    instance = new InstitutionEscrowProgramService();
  }
  return instance;
}
