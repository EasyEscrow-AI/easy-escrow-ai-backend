/**
 * Institution Escrow Program Service
 *
 * Builds and submits transaction instructions for the 4 on-chain institution escrow operations
 * using the Anchor IDL. Handles PDA derivation, ATA lookup, tx serialization, and signing.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmRawTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import { config } from '../config';
import { getEscrowIdl } from '../utils/idl-loader';
import { loadAdminKeypair } from '../utils/loadAdminKeypair';

// PDA seeds matching the Rust program
const INST_ESCROW_SEED = Buffer.from('inst_escrow');
const INST_VAULT_SEED = Buffer.from('inst_vault');

// Map condition type strings to Anchor enum variants
const CONDITION_TYPE_MAP: Record<string, Record<string, Record<string, never>>> = {
  ADMIN_RELEASE: { adminRelease: {} },
  TIME_LOCK: { timeLock: {} },
  COMPLIANCE_CHECK: { complianceCheck: {} },
};

export class InstitutionEscrowProgramService {
  private connection: Connection;
  private programId: PublicKey;
  private provider: AnchorProvider;
  private program: Program;
  private adminKeypair: Keypair;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.programId = new PublicKey(config.solana.escrowProgramId);

    // Load admin keypair for signing transactions
    this.adminKeypair = loadAdminKeypair('InstitutionEscrowProgramService');

    // Create Anchor provider and program (same pattern as EscrowProgramService)
    const wallet = new Wallet(this.adminKeypair);
    this.provider = new AnchorProvider(this.connection, wallet, { commitment: 'confirmed' });
    const escrowIdl = getEscrowIdl();
    this.program = new Program(escrowIdl as any, this.provider);

    console.log(
      '[InstitutionEscrowProgramService] Initialized with program:',
      this.program.programId.toString()
    );
  }

  get adminPublicKey(): PublicKey {
    return this.adminKeypair.publicKey;
  }

  /**
   * Derive the escrow state PDA
   */
  deriveEscrowStatePda(escrowIdBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([INST_ESCROW_SEED, escrowIdBytes], this.programId);
  }

  /**
   * Derive the token vault PDA
   */
  deriveVaultPda(escrowIdBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([INST_VAULT_SEED, escrowIdBytes], this.programId);
  }

  /**
   * Convert UUID string to 32-byte buffer for PDA derivation
   */
  uuidToBytes(uuid: string): Buffer {
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
    payer: PublicKey
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

    const instruction = createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
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
    conditionType: number | string;
    corridor: string;
    expiryTimestamp: number;
  }): Promise<{ transaction: Transaction; escrowPda: string; vaultPda: string }> {
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);
    const [vaultPda] = this.deriveVaultPda(escrowIdBytes);

    // Encode escrow ID as u8 array for instruction arg
    const escrowIdArray = Array.from(escrowIdBytes);

    // Encode corridor to 8 bytes
    const corridorBuf = Buffer.alloc(8);
    Buffer.from(params.corridor).copy(corridorBuf);
    const corridorArray = Array.from(corridorBuf);

    // Convert USDC amounts to micro-USDC (6 decimals)
    const amountBN = new BN(Math.round(params.amount * 1_000_000));
    const feeBN = new BN(Math.round(params.platformFee * 1_000_000));
    const expiryBN = new BN(params.expiryTimestamp);

    // Map condition type to Anchor enum variant
    let conditionTypeEnum: Record<string, Record<string, never>>;
    if (typeof params.conditionType === 'string') {
      conditionTypeEnum = CONDITION_TYPE_MAP[params.conditionType] || { adminRelease: {} };
    } else {
      const typeNames = ['ADMIN_RELEASE', 'TIME_LOCK', 'COMPLIANCE_CHECK'];
      const typeName = typeNames[params.conditionType] || 'ADMIN_RELEASE';
      conditionTypeEnum = CONDITION_TYPE_MAP[typeName];
    }

    const ix = await (this.program.methods as any)
      .initInstitutionEscrow(
        escrowIdArray,
        amountBN,
        feeBN,
        conditionTypeEnum,
        corridorArray,
        expiryBN
      )
      .accounts({
        authority: params.authority,
        payerWallet: params.payerWallet,
        recipientWallet: params.recipientWallet,
        escrowState: escrowPda,
        tokenVault: vaultPda,
        usdcMint: params.usdcMint,
        feeCollector: params.feeCollector,
        settlementAuthority: params.settlementAuthority,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    const transaction = new Transaction().add(ix);

    return {
      transaction,
      escrowPda: escrowPda.toBase58(),
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build deposit transaction (signed by payer, not admin)
   */
  async buildDepositTransaction(params: {
    escrowId: string;
    payer: PublicKey;
    usdcMint: PublicKey;
  }): Promise<Transaction> {
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);
    const [vaultPda] = this.deriveVaultPda(escrowIdBytes);
    const escrowIdArray = Array.from(escrowIdBytes);

    const payerAta = await getAssociatedTokenAddress(params.usdcMint, params.payer);

    const ix = await (this.program.methods as any)
      .depositInstitutionEscrow(escrowIdArray)
      .accounts({
        payer: params.payer,
        payerTokenAccount: payerAta,
        escrowState: escrowPda,
        tokenVault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    return new Transaction().add(ix);
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
    const escrowIdArray = Array.from(escrowIdBytes);

    const transaction = new Transaction();

    // Ensure recipient and fee collector ATAs exist
    const recipientAta = await this.getOrCreateAta(
      params.usdcMint,
      params.recipientWallet,
      params.authority
    );
    if (recipientAta.instruction) {
      transaction.add(recipientAta.instruction);
    }

    const feeCollectorAta = await this.getOrCreateAta(
      params.usdcMint,
      params.feeCollector,
      params.authority
    );
    if (feeCollectorAta.instruction) {
      transaction.add(feeCollectorAta.instruction);
    }

    const ix = await (this.program.methods as any)
      .releaseInstitutionEscrow(escrowIdArray)
      .accounts({
        authority: params.authority,
        escrowState: escrowPda,
        tokenVault: vaultPda,
        recipientTokenAccount: recipientAta.address,
        feeCollectorTokenAccount: feeCollectorAta.address,
        rentReceiver: params.authority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    transaction.add(ix);

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
    const escrowIdArray = Array.from(escrowIdBytes);

    const payerAta = await getAssociatedTokenAddress(params.usdcMint, params.payerWallet);

    const ix = await (this.program.methods as any)
      .cancelInstitutionEscrow(escrowIdArray)
      .accounts({
        caller: params.caller,
        escrowState: escrowPda,
        tokenVault: vaultPda,
        payerTokenAccount: payerAta,
        rentReceiver: params.caller,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    return new Transaction().add(ix);
  }

  /**
   * Sign and submit a transaction using the admin keypair
   */
  private async signAndSubmit(transaction: Transaction): Promise<string> {
    transaction.feePayer = this.adminKeypair.publicKey;
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      'confirmed'
    );
    transaction.recentBlockhash = blockhash;
    transaction.sign(this.adminKeypair);

    const rawTx = transaction.serialize();
    const txSignature = await this.connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    await this.connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    return txSignature;
  }

  /**
   * Initialize escrow on-chain: build, sign, and submit init transaction
   */
  async initEscrowOnChain(params: {
    escrowId: string;
    payerWallet: PublicKey;
    recipientWallet: PublicKey;
    usdcMint: PublicKey;
    feeCollector: PublicKey;
    settlementAuthority: PublicKey;
    amount: number;
    platformFee: number;
    conditionType: number | string;
    corridor: string;
    expiryTimestamp: number;
  }): Promise<{ txSignature: string; escrowPda: string; vaultPda: string }> {
    // Idempotency guard: check if PDA already exists
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);
    const existing = await this.connection.getAccountInfo(escrowPda);
    if (existing) {
      console.log(
        `[InstitutionEscrowProgramService] PDA already exists for ${params.escrowId}, skipping init`
      );
      const [vaultPdaKey] = this.deriveVaultPda(escrowIdBytes);
      return {
        txSignature: 'already-initialized',
        escrowPda: escrowPda.toBase58(),
        vaultPda: vaultPdaKey.toBase58(),
      };
    }

    const {
      transaction,
      escrowPda: escrowPdaStr,
      vaultPda,
    } = await this.buildInitTransaction({
      ...params,
      authority: this.adminKeypair.publicKey,
    });

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[InstitutionEscrowProgramService] Init escrow on-chain: ${params.escrowId}, tx: ${txSignature}`
    );

    return { txSignature, escrowPda: escrowPdaStr, vaultPda };
  }

  /**
   * Release escrow on-chain: build, sign, and submit release transaction
   */
  async releaseEscrowOnChain(params: {
    escrowId: string;
    recipientWallet: PublicKey;
    feeCollector: PublicKey;
    usdcMint: PublicKey;
  }): Promise<string> {
    const transaction = await this.buildReleaseTransaction({
      ...params,
      authority: this.adminKeypair.publicKey,
    });

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[InstitutionEscrowProgramService] Release escrow on-chain: ${params.escrowId}, tx: ${txSignature}`
    );

    return txSignature;
  }

  /**
   * Cancel escrow on-chain: build, sign, and submit cancel transaction
   */
  async cancelEscrowOnChain(params: {
    escrowId: string;
    payerWallet: PublicKey;
    usdcMint: PublicKey;
  }): Promise<string> {
    const transaction = await this.buildCancelTransaction({
      ...params,
      caller: this.adminKeypair.publicKey,
    });

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[InstitutionEscrowProgramService] Cancel escrow on-chain: ${params.escrowId}, tx: ${txSignature}`
    );

    return txSignature;
  }

  /**
   * Verify on-chain escrow state using Anchor account decoding
   */
  async verifyOnChainState(escrowId: string): Promise<{
    exists: boolean;
    status?: number;
    amount?: number;
    payer?: string;
    recipient?: string;
    vaultBalance?: number;
  }> {
    const escrowIdBytes = this.uuidToBytes(escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);

    try {
      const decoded = await (this.program.account as any).institutionEscrow.fetchNullable(
        escrowPda
      );
      if (!decoded) {
        return { exists: false };
      }

      // Determine numeric status from Anchor enum
      let status: number | undefined;
      if (decoded.status) {
        if ('created' in decoded.status) status = 0;
        else if ('funded' in decoded.status) status = 1;
        else if ('released' in decoded.status) status = 2;
        else if ('cancelled' in decoded.status) status = 3;
        else if ('expired' in decoded.status) status = 4;
      }

      return {
        exists: true,
        status,
        amount: decoded.amount ? Number(decoded.amount) : undefined,
        payer: decoded.payer?.toBase58(),
        recipient: decoded.recipient?.toBase58(),
      };
    } catch (err) {
      console.warn('[InstitutionEscrowProgramService] verifyOnChainState error:', err);
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
