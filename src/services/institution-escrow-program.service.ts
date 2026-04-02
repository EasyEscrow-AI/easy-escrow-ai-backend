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
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import { createHash } from 'crypto';
import { config } from '../config';
import { getEscrowIdl } from '../utils/idl-loader';
import { loadAdminKeypair } from '../utils/loadAdminKeypair';
import { getCdpSettlementService } from './cdp-settlement.service';

// PDA seeds matching the Rust program
const INST_ESCROW_SEED = Buffer.from('inst_escrow');
const INST_VAULT_SEED = Buffer.from('inst_vault');

/**
 * Safely convert a decimal USDC amount to micro-USDC integer string
 * without floating-point multiplication.
 * Uses toFixed(6) as the rounding boundary to eliminate float drift,
 * then BigInt string math for exact conversion.
 * E.g. 599.99 → "599990000", 1000.50 → "1000500000", 0.123456 → "123456"
 */
function decimalToMicroUsdc(amount: number): string {
  if (amount < 0) throw new Error('Amount cannot be negative');
  const str = amount.toFixed(6); // rounds to 6 decimal places (USDC precision)
  const [whole, frac] = str.split('.');
  const fracPadded = (frac || '0').padEnd(6, '0').slice(0, 6);
  return (BigInt(whole) * BigInt(1_000_000) + BigInt(fracPadded)).toString();
}

// Map condition type strings to Anchor enum variants
const CONDITION_TYPE_MAP: Record<string, Record<string, Record<string, never>>> = {
  ADMIN_RELEASE: { adminRelease: {} },
  TIME_LOCK: { timeLock: {} },
  COMPLIANCE_CHECK: { complianceCheck: {} },
};

// SPL Memo program — used to embed the human-readable escrow code (EE-XXX-XXX) in transactions
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** AI analysis data needed for chain-of-custody memo digest */
export interface AiMemoData {
  recommendation: string;
  riskScore: number;
  factors: unknown;
}

/** Map numeric risk score (0-100) to human-readable level for on-chain memos */
export function riskScoreToMemoLevel(score: number): string {
  if (score >= 76) return 'blocked';
  if (score >= 51) return 'high-risk';
  if (score >= 26) return 'medium-risk';
  return 'low-risk';
}

/** Build compact AI decision fingerprint for SPL Memo (chain-of-custody audit trail) */
export function buildAiDigest(analysis: AiMemoData | null): string {
  if (!analysis) return 'ai=NONE';
  const riskLevel = riskScoreToMemoLevel(analysis.riskScore);
  const hash = createHash('sha256')
    .update(JSON.stringify({ r: analysis.recommendation, l: riskLevel, f: analysis.factors }))
    .digest('hex')
    .slice(0, 16);
  return `ai=${analysis.recommendation}:risk=${riskLevel}:sha=${hash}`;
}

function createMemoInstruction(text: string, signer?: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    keys: signer ? [{ pubkey: signer, isSigner: true, isWritable: false }] : [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(text, 'utf-8'),
  });
}

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

  /** Expose the shared Connection so callers don't create per-request instances */
  getConnection(): Connection {
    return this.connection;
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
    amountMicroUsdc: string;
    platformFeeMicroUsdc: string;
    conditionType: number | string;
    corridor: string;
    expiryTimestamp: number;
    memo?: string;
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

    // Construct BN directly from integer micro-USDC strings (avoids float precision loss)
    const amountBN = new BN(params.amountMicroUsdc);
    const feeBN = new BN(params.platformFeeMicroUsdc);
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
    if (params.memo) {
      transaction.add(createMemoInstruction(params.memo, params.authority));
    }

    return {
      transaction,
      escrowPda: escrowPda.toBase58(),
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build deposit transaction (signed by payer, not admin).
   * Fee is collected at deposit time: escrow amount goes to vault, platform fee goes to fee collector.
   */
  async buildDepositTransaction(params: {
    escrowId: string;
    payer: PublicKey;
    usdcMint: PublicKey;
    feeCollector: PublicKey;
    memo?: string;
    stealthPayer?: PublicKey;
  }): Promise<Transaction> {
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);
    const [vaultPda] = this.deriveVaultPda(escrowIdBytes);
    const escrowIdArray = Array.from(escrowIdBytes);

    const transaction = new Transaction();

    // When stealth payer is active: build combined tx with 3 steps:
    // 1. Create stealth ATA (if needed)
    // 2. SPL transfer: real payer ATA → stealth ATA (payer signs)
    // 3. Deposit: stealth ATA → vault (with stealth_payer param)
    // All in one transaction — payer signs once.
    const depositPayer = params.stealthPayer || params.payer;
    const realPayerAta = await getAssociatedTokenAddress(params.usdcMint, params.payer);
    let depositPayerAta: PublicKey;

    if (params.stealthPayer) {
      // Create stealth ATA if needed
      const stealthAta = await this.getOrCreateAta(
        params.usdcMint,
        params.stealthPayer,
        params.payer // real payer pays for ATA creation
      );
      depositPayerAta = stealthAta.address;
      if (stealthAta.instruction) {
        transaction.add(stealthAta.instruction);
      }

      // Transfer total deposit (amount + fee) from real payer to stealth ATA
      // We read the escrow state to get the amounts
      const escrowAccount = await this.connection.getAccountInfo(escrowPda);
      if (escrowAccount && escrowAccount.data.length >= 152) {
        const amount = escrowAccount.data.readBigUInt64LE(136);
        const fee = escrowAccount.data.readBigUInt64LE(144);
        const total = amount + fee;
        transaction.add(
          createTransferInstruction(
            realPayerAta,
            depositPayerAta,
            params.payer,
            Number(total)
          )
        );
      }
    } else {
      depositPayerAta = realPayerAta;
    }

    // Ensure fee collector ATA exists
    const feeCollectorAta = await this.getOrCreateAta(
      params.usdcMint,
      params.feeCollector,
      params.payer
    );
    if (feeCollectorAta.instruction) {
      transaction.add(feeCollectorAta.instruction);
    }

    const ix = await (this.program.methods as any)
      .depositInstitutionEscrow(escrowIdArray, params.stealthPayer || null)
      .accounts({
        payer: params.payer,
        payerTokenAccount: depositPayerAta,
        escrowState: escrowPda,
        tokenVault: vaultPda,
        feeCollectorTokenAccount: feeCollectorAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    transaction.add(ix);
    if (params.memo) {
      transaction.add(createMemoInstruction(params.memo, params.payer));
    }
    return transaction;
  }

  /**
   * Build release transaction.
   * Fee was collected at deposit time for new escrows, but release still passes
   * fee_collector for backward compatibility — any remaining vault balance after
   * the recipient transfer goes to fee collector (handles legacy escrows).
   */
  async buildReleaseTransaction(params: {
    escrowId: string;
    authority: PublicKey;
    recipientWallet: PublicKey;
    feeCollector: PublicKey;
    usdcMint: PublicKey;
    memo?: string;
    rentPayer?: PublicKey;
    stealthRecipient?: PublicKey;
  }): Promise<Transaction> {
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [escrowPda] = this.deriveEscrowStatePda(escrowIdBytes);
    const [vaultPda] = this.deriveVaultPda(escrowIdBytes);
    const escrowIdArray = Array.from(escrowIdBytes);

    const transaction = new Transaction();

    // Use rentPayer for ATA creation (defaults to authority for backward compat).
    // For CDP multi-sign, rentPayer is the admin so the CDP wallet doesn't pay rent.
    const ataPayer = params.rentPayer ?? params.authority;

    // Ensure recipient ATA exists
    const recipientAta = await this.getOrCreateAta(
      params.usdcMint,
      params.recipientWallet,
      ataPayer
    );
    if (recipientAta.instruction) {
      transaction.add(recipientAta.instruction);
    }

    // Ensure fee collector ATA exists (handles legacy escrows with fee still in vault)
    const feeCollectorAta = await this.getOrCreateAta(
      params.usdcMint,
      params.feeCollector,
      ataPayer
    );
    if (feeCollectorAta.instruction) {
      transaction.add(feeCollectorAta.instruction);
    }

    const ix = await (this.program.methods as any)
      .releaseInstitutionEscrow(escrowIdArray, params.stealthRecipient || null)
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
    if (params.memo) {
      transaction.add(createMemoInstruction(params.memo, params.authority));
    }

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
    memo?: string;
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

    const transaction = new Transaction().add(ix);
    if (params.memo) {
      transaction.add(createMemoInstruction(params.memo, params.caller));
    }
    return transaction;
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
    const isDevnet = process.env.NODE_ENV !== 'production';
    const txSignature = await this.connection.sendRawTransaction(rawTx, {
      skipPreflight: isDevnet,
      maxRetries: 3,
    });

    await this.connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    // Verify the transaction actually succeeded (confirmTransaction only checks inclusion, not success)
    const txResult = await this.connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (txResult?.meta?.err) {
      throw new Error(
        `Transaction ${txSignature} confirmed but failed on-chain: ${JSON.stringify(txResult.meta.err)}`
      );
    }

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
    escrowCode?: string;
  }): Promise<{ txSignature: string; escrowPda: string; vaultPda: string }> {
    // Convert decimal amounts to micro-USDC strings safely (no float multiplication)
    const amountMicroUsdc = decimalToMicroUsdc(params.amount);
    const platformFeeMicroUsdc = decimalToMicroUsdc(params.platformFee);
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
      escrowId: params.escrowId,
      authority: this.adminKeypair.publicKey,
      payerWallet: params.payerWallet,
      recipientWallet: params.recipientWallet,
      usdcMint: params.usdcMint,
      feeCollector: params.feeCollector,
      settlementAuthority: params.settlementAuthority,
      amountMicroUsdc,
      platformFeeMicroUsdc,
      conditionType: params.conditionType,
      corridor: params.corridor,
      expiryTimestamp: params.expiryTimestamp,
      memo: params.escrowCode ? `EasyEscrow:init:${params.escrowCode}` : undefined,
    });

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[InstitutionEscrowProgramService] Init escrow on-chain: ${params.escrowId}, tx: ${txSignature}`
    );

    return { txSignature, escrowPda: escrowPdaStr, vaultPda };
  }

  /**
   * Release escrow on-chain: build, sign, and submit release transaction.
   * For new escrows, fee was collected at deposit — vault only has recipient amount.
   * For legacy escrows, any remaining vault balance after recipient transfer goes to fee collector.
   */
  async releaseEscrowOnChain(params: {
    escrowId: string;
    recipientWallet: PublicKey;
    feeCollector: PublicKey;
    usdcMint: PublicKey;
    escrowCode?: string;
    aiDigest?: string;
    stealthRecipient?: PublicKey;
  }): Promise<string> {
    let memo: string | undefined;
    if (params.escrowCode) {
      memo = `EasyEscrow:release:${params.escrowCode}`;
      if (params.aiDigest) {
        memo += `:${params.aiDigest}`;
      }
    }

    const transaction = await this.buildReleaseTransaction({
      ...params,
      authority: this.adminKeypair.publicKey,
      memo,
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
    escrowCode?: string;
    cancelReason?: string;
  }): Promise<string> {
    // Map free-text reason to a bounded code for on-chain memo
    const REASON_CODES: Record<string, string> = {
      expired: 'expired', dispute: 'dispute', compliance: 'compliance',
      'client-request': 'client-request', fraud: 'fraud',
    };
    const reasonCode = params.cancelReason
      ? REASON_CODES[params.cancelReason.toLowerCase()] || 'other'
      : undefined;

    let memo: string | undefined;
    if (params.escrowCode) {
      memo = `EasyEscrow:cancel:${params.escrowCode}`;
      if (reasonCode) {
        memo += `:reason=${reasonCode}`;
      }
    }

    const transaction = await this.buildCancelTransaction({
      ...params,
      caller: this.adminKeypair.publicKey,
      memo,
    });

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[InstitutionEscrowProgramService] Cancel escrow on-chain: ${params.escrowId}, tx: ${txSignature}`
    );

    return txSignature;
  }

  /**
   * Release escrow with CDP as the settlement authority (multi-sign pattern).
   * 1. Build release tx with CDP pubkey as authority
   * 2. Admin partially signs as fee payer
   * 3. CDP signs as settlement authority (after policy check)
   * 4. Submit fully-signed tx to Solana RPC
   */
  async releaseEscrowWithCdp(params: {
    escrowId: string;
    cdpAuthorityPubkey: PublicKey;
    recipientWallet: PublicKey;
    feeCollector: PublicKey;
    usdcMint: PublicKey;
    escrowCode?: string;
    aiDigest?: string;
    stealthRecipient?: PublicKey;
  }): Promise<string> {
    let memo: string | undefined;
    if (params.escrowCode) {
      memo = `EasyEscrow:release:${params.escrowCode}`;
      if (params.aiDigest) {
        memo += `:${params.aiDigest}`;
      }
    }

    const transaction = await this.buildReleaseTransaction({
      ...params,
      authority: params.cdpAuthorityPubkey,
      rentPayer: this.adminKeypair.publicKey,
      memo,
    });

    // Admin partially signs as fee payer
    transaction.feePayer = this.adminKeypair.publicKey;
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      'confirmed'
    );
    transaction.recentBlockhash = blockhash;
    transaction.partialSign(this.adminKeypair);

    // Serialize with requireAllSignatures: false (CDP hasn't signed yet)
    const serialized = transaction.serialize({ requireAllSignatures: false });

    // Send to CDP for authority signature
    const cdpService = getCdpSettlementService();
    const signedBuffer = await cdpService.signTransaction(serialized);

    // Submit fully-signed transaction
    const isDevnet = process.env.NODE_ENV !== 'production';
    const txSignature = await this.connection.sendRawTransaction(signedBuffer, {
      skipPreflight: isDevnet,
      maxRetries: 3,
    });

    await this.connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    // Verify on-chain execution succeeded (confirmTransaction only waits for inclusion)
    const txResult = await this.connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (txResult?.meta?.err) {
      throw new Error(
        `CDP release transaction failed on-chain: ${JSON.stringify(txResult.meta.err)}`
      );
    }

    console.log(
      `[InstitutionEscrowProgramService] CDP release escrow on-chain: ${params.escrowId}, tx: ${txSignature}`
    );

    return txSignature;
  }

  /**
   * Cancel escrow with CDP as the settlement authority (multi-sign pattern).
   * Same pattern as releaseEscrowWithCdp: admin pays fees, CDP signs as caller (authority).
   */
  async cancelEscrowWithCdp(params: {
    escrowId: string;
    cdpCallerPubkey: PublicKey;
    payerWallet: PublicKey;
    usdcMint: PublicKey;
    escrowCode?: string;
    cancelReason?: string;
  }): Promise<string> {
    const REASON_CODES: Record<string, string> = {
      expired: 'expired', dispute: 'dispute', compliance: 'compliance',
      'client-request': 'client-request', fraud: 'fraud',
    };
    const reasonCode = params.cancelReason
      ? REASON_CODES[params.cancelReason.toLowerCase()] || 'other'
      : undefined;

    let memo: string | undefined;
    if (params.escrowCode) {
      memo = `EasyEscrow:cancel:${params.escrowCode}`;
      if (reasonCode) {
        memo += `:reason=${reasonCode}`;
      }
    }

    const transaction = await this.buildCancelTransaction({
      ...params,
      caller: params.cdpCallerPubkey,
      memo,
    });

    // Admin partially signs as fee payer
    transaction.feePayer = this.adminKeypair.publicKey;
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      'confirmed'
    );
    transaction.recentBlockhash = blockhash;
    transaction.partialSign(this.adminKeypair);

    // Serialize with requireAllSignatures: false
    const serialized = transaction.serialize({ requireAllSignatures: false });

    // Send to CDP for authority signature
    const cdpService = getCdpSettlementService();
    const signedBuffer = await cdpService.signTransaction(serialized);

    // Submit fully-signed transaction
    const isDevnet = process.env.NODE_ENV !== 'production';
    const txSignature = await this.connection.sendRawTransaction(signedBuffer, {
      skipPreflight: isDevnet,
      maxRetries: 3,
    });

    await this.connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    // Verify on-chain execution succeeded (confirmTransaction only waits for inclusion)
    const txResult = await this.connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (txResult?.meta?.err) {
      throw new Error(
        `CDP cancel transaction failed on-chain: ${JSON.stringify(txResult.meta.err)}`
      );
    }

    console.log(
      `[InstitutionEscrowProgramService] CDP cancel escrow on-chain: ${params.escrowId}, tx: ${txSignature}`
    );

    return txSignature;
  }

  /**
   * Direct USDC transfer (no escrow PDA) — admin signs as authority and fee payer.
   * Used for direct settlement mode escrows where funds are transferred without a vault.
   */
  async transferUsdcDirect(params: {
    recipientWallet: PublicKey;
    usdcMint: PublicKey;
    amount: number;
    platformFee: number;
    feeCollector: PublicKey;
    escrowCode?: string;
    aiDigest?: string;
  }): Promise<string> {
    const { recipientWallet, usdcMint, amount, platformFee, feeCollector, escrowCode, aiDigest } = params;
    const transaction = new Transaction();

    // Admin ATA (source of funds)
    const adminAta = await getAssociatedTokenAddress(usdcMint, this.adminKeypair.publicKey);

    // Recipient ATA (create if needed)
    const recipientAtaResult = await this.getOrCreateAta(usdcMint, recipientWallet, this.adminKeypair.publicKey);
    if (recipientAtaResult.instruction) {
      transaction.add(recipientAtaResult.instruction);
    }

    // Transfer net amount (amount - fee) to recipient
    const netAmountMicro = BigInt(decimalToMicroUsdc(amount)) - BigInt(decimalToMicroUsdc(platformFee));
    transaction.add(
      createTransferInstruction(adminAta, recipientAtaResult.address, this.adminKeypair.publicKey, netAmountMicro)
    );

    // Transfer fee to fee collector (if fee > 0)
    if (platformFee > 0) {
      const feeCollectorAtaResult = await this.getOrCreateAta(usdcMint, feeCollector, this.adminKeypair.publicKey);
      if (feeCollectorAtaResult.instruction) {
        transaction.add(feeCollectorAtaResult.instruction);
      }
      const feeMicro = BigInt(decimalToMicroUsdc(platformFee));
      transaction.add(
        createTransferInstruction(adminAta, feeCollectorAtaResult.address, this.adminKeypair.publicKey, feeMicro)
      );
    }

    // Add memo
    if (escrowCode) {
      let memo = `EasyEscrow:direct:${escrowCode}`;
      if (aiDigest) memo += `:${aiDigest}`;
      transaction.add(createMemoInstruction(memo, this.adminKeypair.publicKey));
    }

    const txSignature = await this.signAndSubmit(transaction);
    console.log(`[InstitutionEscrowProgramService] Direct USDC transfer: ${txSignature}`);
    return txSignature;
  }

  /**
   * Direct USDC transfer with CDP as the authority (multi-sign pattern).
   * CDP wallet holds the USDC and signs the transfer; admin pays fees.
   */
  async transferUsdcDirectWithCdp(params: {
    cdpAuthorityPubkey: PublicKey;
    recipientWallet: PublicKey;
    usdcMint: PublicKey;
    amount: number;
    platformFee: number;
    feeCollector: PublicKey;
    escrowCode?: string;
    aiDigest?: string;
  }): Promise<string> {
    const { cdpAuthorityPubkey, recipientWallet, usdcMint, amount, platformFee, feeCollector, escrowCode, aiDigest } = params;
    const transaction = new Transaction();

    // CDP ATA (source of funds — CDP wallet holds the USDC)
    const cdpAta = await getAssociatedTokenAddress(usdcMint, cdpAuthorityPubkey);

    // Recipient ATA (create if needed, admin pays rent)
    const recipientAtaResult = await this.getOrCreateAta(usdcMint, recipientWallet, this.adminKeypair.publicKey);
    if (recipientAtaResult.instruction) {
      transaction.add(recipientAtaResult.instruction);
    }

    // Transfer net amount from CDP ATA to recipient (CDP is the signer/authority)
    const netAmountMicro = BigInt(decimalToMicroUsdc(amount)) - BigInt(decimalToMicroUsdc(platformFee));
    transaction.add(
      createTransferInstruction(cdpAta, recipientAtaResult.address, cdpAuthorityPubkey, netAmountMicro)
    );

    // Transfer fee from CDP ATA to fee collector
    if (platformFee > 0) {
      const feeCollectorAtaResult = await this.getOrCreateAta(usdcMint, feeCollector, this.adminKeypair.publicKey);
      if (feeCollectorAtaResult.instruction) {
        transaction.add(feeCollectorAtaResult.instruction);
      }
      const feeMicro = BigInt(decimalToMicroUsdc(platformFee));
      transaction.add(
        createTransferInstruction(cdpAta, feeCollectorAtaResult.address, cdpAuthorityPubkey, feeMicro)
      );
    }

    // Add memo
    if (escrowCode) {
      let memo = `EasyEscrow:direct:${escrowCode}`;
      if (aiDigest) memo += `:${aiDigest}`;
      transaction.add(createMemoInstruction(memo, this.adminKeypair.publicKey));
    }

    // Admin partially signs as fee payer
    transaction.feePayer = this.adminKeypair.publicKey;
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.partialSign(this.adminKeypair);

    // CDP signs the transfer authority
    const serialized = transaction.serialize({ requireAllSignatures: false });
    const cdpService = getCdpSettlementService();
    const signedBuffer = await cdpService.signTransaction(serialized);

    // Submit
    const isDevnet = process.env.NODE_ENV !== 'production';
    const txSignature = await this.connection.sendRawTransaction(signedBuffer, {
      skipPreflight: isDevnet,
      maxRetries: 3,
    });

    await this.connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    const txResult = await this.connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (txResult?.meta?.err) {
      throw new Error(`CDP direct transfer failed on-chain: ${JSON.stringify(txResult.meta.err)}`);
    }

    console.log(`[InstitutionEscrowProgramService] CDP direct USDC transfer: ${txSignature}`);
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
