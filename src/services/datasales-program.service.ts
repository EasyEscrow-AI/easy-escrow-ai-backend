/**
 * DataSales Program Service
 *
 * Builds transactions for DataSales escrow on-chain instructions.
 * Handles PDA derivation, instruction building, and transaction serialization.
 */

import {
  PublicKey,
  Connection,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Keypair,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { config } from '../config';
import { getProgramConfig, getCurrentNetwork } from '../config/constants';
import { logger } from './logger.service';
import fs from 'fs';

// PDA Seeds (must match Rust program)
const DATASALES_ESCROW_SEED = Buffer.from('datasales_escrow');
const DATASALES_VAULT_SEED = Buffer.from('datasales_vault');

/**
 * Input for creating a DataSales escrow
 */
export interface CreateDataSalesEscrowInput {
  agreementId: string; // UUID string
  sellerWallet: string;
  buyerWallet?: string; // Optional for open listings
  priceLamports: bigint;
  platformFeeLamports: bigint;
  depositWindowEnd: number; // Unix timestamp
  accessDurationSeconds: number;
}

/**
 * Input for buyer SOL deposit
 */
export interface DepositSolInput {
  agreementId: string;
  buyerWallet: string;
}

/**
 * Input for confirming seller deposit
 */
export interface ConfirmSellerDepositInput {
  agreementId: string;
}

/**
 * Input for approving data
 */
export interface ApproveDataInput {
  agreementId: string;
}

/**
 * Input for settling DataSales escrow
 */
export interface SettleDataSalesInput {
  agreementId: string;
  sellerWallet: string;
}

/**
 * Input for cancelling DataSales escrow
 */
export interface CancelDataSalesInput {
  agreementId: string;
  buyerWallet?: string; // For refund if deposited
}

/**
 * Built transaction result
 */
export interface BuiltTransaction {
  serializedTransaction: string; // Base64
  requiredSigners: string[];
  escrowPda: string;
  escrowBump: number;
  vaultPda: string;
}

/**
 * DataSales Program Service
 */
export class DataSalesProgramService {
  private connection: Connection;
  private programId: PublicKey;
  private platformAuthority: Keypair;
  private feeCollector: PublicKey;
  private program: anchor.Program | null = null;

  constructor() {
    const programConfig = getProgramConfig();
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.programId = programConfig.programId;
    this.feeCollector = programConfig.treasuryAddress; // Use treasury as fee collector

    // Load platform authority keypair
    const authorityPath = programConfig.authorityKeypairPath;
    if (!authorityPath || !fs.existsSync(authorityPath)) {
      throw new Error(`Platform authority keypair not found at: ${authorityPath}`);
    }
    const keypairData = JSON.parse(fs.readFileSync(authorityPath, 'utf-8'));
    this.platformAuthority = Keypair.fromSecretKey(new Uint8Array(keypairData));

    logger.info('[DataSales Program] Initialized', {
      programId: this.programId.toBase58(),
      feeCollector: this.feeCollector.toBase58(),
      authority: this.platformAuthority.publicKey.toBase58(),
    });
  }

  /**
   * Get or create Anchor program instance
   */
  private getProgram(): anchor.Program {
    if (this.program) return this.program;

    const network = getCurrentNetwork();
    const isProduction = network === 'production';

    const idl = isProduction
      ? require('../generated/anchor/escrow-idl-production.json')
      : require('../generated/anchor/escrow-idl-staging.json');

    // Validate program ID matches IDL
    const idlProgramId = new PublicKey(idl.address);
    if (!this.programId.equals(idlProgramId)) {
      throw new Error(
        `Program ID mismatch!\n` +
          `  Expected (from IDL): ${idlProgramId.toBase58()}\n` +
          `  Received (from config): ${this.programId.toBase58()}`
      );
    }

    const wallet = new anchor.Wallet(this.platformAuthority);
    const provider = new anchor.AnchorProvider(this.connection, wallet, {
      commitment: 'confirmed',
    });
    this.program = new anchor.Program(idl as anchor.Idl, provider);
    return this.program;
  }

  /**
   * Convert UUID string to 32-byte buffer
   */
  private uuidToBuffer(uuid: string): Buffer {
    // Remove dashes and convert to buffer
    const hex = uuid.replace(/-/g, '');
    const buffer = Buffer.alloc(32);
    Buffer.from(hex, 'hex').copy(buffer);
    return buffer;
  }

  /**
   * Derive DataSales escrow PDA
   */
  deriveEscrowPda(agreementId: string): { pda: PublicKey; bump: number } {
    const agreementIdBuffer = this.uuidToBuffer(agreementId);
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [DATASALES_ESCROW_SEED, agreementIdBuffer],
      this.programId
    );
    return { pda, bump };
  }

  /**
   * Derive SOL vault PDA
   */
  deriveVaultPda(agreementId: string): { pda: PublicKey; bump: number } {
    const agreementIdBuffer = this.uuidToBuffer(agreementId);
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [DATASALES_VAULT_SEED, agreementIdBuffer],
      this.programId
    );
    return { pda, bump };
  }

  /**
   * Build create DataSales escrow transaction
   */
  async buildCreateEscrowTransaction(
    input: CreateDataSalesEscrowInput
  ): Promise<BuiltTransaction> {
    const program = this.getProgram();
    const agreementIdBuffer = this.uuidToBuffer(input.agreementId);
    const { pda: escrowPda, bump: escrowBump } = this.deriveEscrowPda(input.agreementId);
    const { pda: vaultPda } = this.deriveVaultPda(input.agreementId);

    const sellerPubkey = new PublicKey(input.sellerWallet);
    const buyerPubkey = input.buyerWallet ? new PublicKey(input.buyerWallet) : null;

    // Build instruction
    const accounts: any = {
      authority: this.platformAuthority.publicKey,
      seller: sellerPubkey,
      buyer: buyerPubkey || this.programId, // Use program ID as placeholder if no buyer
      feeCollector: this.feeCollector,
      datasalesEscrow: escrowPda,
      solVault: vaultPda,
      systemProgram: SystemProgram.programId,
    };

    const instruction = await program.methods
      .createDatasalesEscrow(
        Array.from(agreementIdBuffer),
        new anchor.BN(input.priceLamports.toString()),
        new anchor.BN(input.platformFeeLamports.toString()),
        new anchor.BN(input.depositWindowEnd),
        new anchor.BN(input.accessDurationSeconds)
      )
      .accounts(accounts)
      .instruction();

    // Build transaction
    const transaction = new Transaction();
    transaction.feePayer = this.platformAuthority.publicKey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.add(instruction);

    // Sign with authority
    transaction.partialSign(this.platformAuthority);

    // Serialize
    const serialized = transaction.serialize({ requireAllSignatures: false });

    return {
      serializedTransaction: serialized.toString('base64'),
      requiredSigners: [this.platformAuthority.publicKey.toBase58()],
      escrowPda: escrowPda.toBase58(),
      escrowBump,
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build buyer deposit SOL transaction
   */
  async buildDepositSolTransaction(input: DepositSolInput): Promise<BuiltTransaction> {
    const program = this.getProgram();
    const agreementIdBuffer = this.uuidToBuffer(input.agreementId);
    const { pda: escrowPda, bump: escrowBump } = this.deriveEscrowPda(input.agreementId);
    const { pda: vaultPda } = this.deriveVaultPda(input.agreementId);
    const buyerPubkey = new PublicKey(input.buyerWallet);

    const accounts: any = {
      buyer: buyerPubkey,
      datasalesEscrow: escrowPda,
      solVault: vaultPda,
      systemProgram: SystemProgram.programId,
    };

    const instruction = await program.methods
      .depositDatasalesSol(Array.from(agreementIdBuffer))
      .accounts(accounts)
      .instruction();

    // Build transaction - buyer pays fee and signs
    const transaction = new Transaction();
    transaction.feePayer = buyerPubkey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.add(instruction);

    // Serialize (buyer will sign)
    const serialized = transaction.serialize({ requireAllSignatures: false });

    return {
      serializedTransaction: serialized.toString('base64'),
      requiredSigners: [buyerPubkey.toBase58()],
      escrowPda: escrowPda.toBase58(),
      escrowBump,
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build confirm seller deposit transaction
   */
  async buildConfirmSellerDepositTransaction(
    input: ConfirmSellerDepositInput
  ): Promise<BuiltTransaction> {
    const program = this.getProgram();
    const agreementIdBuffer = this.uuidToBuffer(input.agreementId);
    const { pda: escrowPda, bump: escrowBump } = this.deriveEscrowPda(input.agreementId);
    const { pda: vaultPda } = this.deriveVaultPda(input.agreementId);

    const accounts: any = {
      authority: this.platformAuthority.publicKey,
      datasalesEscrow: escrowPda,
    };

    const instruction = await program.methods
      .confirmDatasalesSellerDeposit(Array.from(agreementIdBuffer))
      .accounts(accounts)
      .instruction();

    // Build transaction
    const transaction = new Transaction();
    transaction.feePayer = this.platformAuthority.publicKey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.add(instruction);

    // Sign with authority
    transaction.partialSign(this.platformAuthority);

    // Serialize
    const serialized = transaction.serialize({ requireAllSignatures: false });

    return {
      serializedTransaction: serialized.toString('base64'),
      requiredSigners: [this.platformAuthority.publicKey.toBase58()],
      escrowPda: escrowPda.toBase58(),
      escrowBump,
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build approve data transaction
   */
  async buildApproveDataTransaction(input: ApproveDataInput): Promise<BuiltTransaction> {
    const program = this.getProgram();
    const agreementIdBuffer = this.uuidToBuffer(input.agreementId);
    const { pda: escrowPda, bump: escrowBump } = this.deriveEscrowPda(input.agreementId);
    const { pda: vaultPda } = this.deriveVaultPda(input.agreementId);

    const accounts: any = {
      authority: this.platformAuthority.publicKey,
      datasalesEscrow: escrowPda,
    };

    const instruction = await program.methods
      .approveDatasalesData(Array.from(agreementIdBuffer))
      .accounts(accounts)
      .instruction();

    // Build transaction
    const transaction = new Transaction();
    transaction.feePayer = this.platformAuthority.publicKey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.add(instruction);

    // Sign with authority
    transaction.partialSign(this.platformAuthority);

    // Serialize
    const serialized = transaction.serialize({ requireAllSignatures: false });

    return {
      serializedTransaction: serialized.toString('base64'),
      requiredSigners: [this.platformAuthority.publicKey.toBase58()],
      escrowPda: escrowPda.toBase58(),
      escrowBump,
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build settle DataSales escrow transaction
   */
  async buildSettleTransaction(input: SettleDataSalesInput): Promise<BuiltTransaction> {
    const program = this.getProgram();
    const agreementIdBuffer = this.uuidToBuffer(input.agreementId);
    const { pda: escrowPda, bump: escrowBump } = this.deriveEscrowPda(input.agreementId);
    const { pda: vaultPda } = this.deriveVaultPda(input.agreementId);
    const sellerPubkey = new PublicKey(input.sellerWallet);

    const accounts: any = {
      authority: this.platformAuthority.publicKey,
      seller: sellerPubkey,
      datasalesEscrow: escrowPda,
      solVault: vaultPda,
      feeCollector: this.feeCollector,
      systemProgram: SystemProgram.programId,
    };

    const instruction = await program.methods
      .settleDatasalesEscrow(Array.from(agreementIdBuffer))
      .accounts(accounts)
      .instruction();

    // Build transaction
    const transaction = new Transaction();
    transaction.feePayer = this.platformAuthority.publicKey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.add(instruction);

    // Sign with authority
    transaction.partialSign(this.platformAuthority);

    // Serialize
    const serialized = transaction.serialize({ requireAllSignatures: false });

    return {
      serializedTransaction: serialized.toString('base64'),
      requiredSigners: [this.platformAuthority.publicKey.toBase58()],
      escrowPda: escrowPda.toBase58(),
      escrowBump,
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build cancel DataSales escrow transaction
   */
  async buildCancelTransaction(input: CancelDataSalesInput): Promise<BuiltTransaction> {
    const program = this.getProgram();
    const agreementIdBuffer = this.uuidToBuffer(input.agreementId);
    const { pda: escrowPda, bump: escrowBump } = this.deriveEscrowPda(input.agreementId);
    const { pda: vaultPda } = this.deriveVaultPda(input.agreementId);

    // For refund, we need buyer wallet; use program ID as placeholder if no buyer
    const buyerPubkey = input.buyerWallet
      ? new PublicKey(input.buyerWallet)
      : this.programId;

    const accounts: any = {
      authority: this.platformAuthority.publicKey,
      buyer: buyerPubkey,
      datasalesEscrow: escrowPda,
      solVault: vaultPda,
      systemProgram: SystemProgram.programId,
    };

    const instruction = await program.methods
      .cancelDatasalesEscrow(Array.from(agreementIdBuffer))
      .accounts(accounts)
      .instruction();

    // Build transaction
    const transaction = new Transaction();
    transaction.feePayer = this.platformAuthority.publicKey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.add(instruction);

    // Sign with authority
    transaction.partialSign(this.platformAuthority);

    // Serialize
    const serialized = transaction.serialize({ requireAllSignatures: false });

    return {
      serializedTransaction: serialized.toString('base64'),
      requiredSigners: [this.platformAuthority.publicKey.toBase58()],
      escrowPda: escrowPda.toBase58(),
      escrowBump,
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build close DataSales escrow account transaction
   */
  async buildCloseEscrowTransaction(agreementId: string): Promise<BuiltTransaction> {
    const program = this.getProgram();
    const agreementIdBuffer = this.uuidToBuffer(agreementId);
    const { pda: escrowPda, bump: escrowBump } = this.deriveEscrowPda(agreementId);
    const { pda: vaultPda } = this.deriveVaultPda(agreementId);

    const accounts: any = {
      authority: this.platformAuthority.publicKey,
      datasalesEscrow: escrowPda,
      systemProgram: SystemProgram.programId,
    };

    const instruction = await program.methods
      .closeDatasalesEscrow(Array.from(agreementIdBuffer))
      .accounts(accounts)
      .instruction();

    // Build transaction
    const transaction = new Transaction();
    transaction.feePayer = this.platformAuthority.publicKey;
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.add(instruction);

    // Sign with authority
    transaction.partialSign(this.platformAuthority);

    // Serialize
    const serialized = transaction.serialize({ requireAllSignatures: false });

    return {
      serializedTransaction: serialized.toString('base64'),
      requiredSigners: [this.platformAuthority.publicKey.toBase58()],
      escrowPda: escrowPda.toBase58(),
      escrowBump,
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Send and confirm a transaction
   */
  async sendAndConfirmTransaction(serializedTx: string): Promise<string> {
    const transaction = Transaction.from(Buffer.from(serializedTx, 'base64'));

    const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await this.connection.confirmTransaction(signature, 'confirmed');

    return signature;
  }

  /**
   * Get escrow account data
   */
  async getEscrowAccount(agreementId: string): Promise<any | null> {
    const program = this.getProgram();
    const { pda: escrowPda } = this.deriveEscrowPda(agreementId);

    try {
      // Use 'as any' until IDL is regenerated with DataSales accounts
      const account = await (program.account as any).dataSalesEscrow?.fetch(escrowPda);
      return account || null;
    } catch (error) {
      // Account doesn't exist
      return null;
    }
  }
}

// Singleton instance
let _dataSalesProgramService: DataSalesProgramService | null = null;

/**
 * Get DataSales Program Service singleton
 */
export function getDataSalesProgramService(): DataSalesProgramService {
  if (!_dataSalesProgramService) {
    _dataSalesProgramService = new DataSalesProgramService();
  }
  return _dataSalesProgramService;
}

/**
 * Reset singleton (for testing)
 */
export function resetDataSalesProgramService(): void {
  _dataSalesProgramService = null;
}
