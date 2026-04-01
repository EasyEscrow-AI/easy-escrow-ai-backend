/**
 * Pool Vault Program Service
 *
 * Builds and submits transaction instructions for the on-chain pool vault operations
 * using the Anchor IDL. Handles PDA derivation, ATA lookup, tx serialization,
 * receipt encryption/decryption, and signing.
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
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
} from '@solana/spl-token';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import { config } from '../config';
import { getEscrowIdl } from '../utils/idl-loader';
import { loadAdminKeypair } from '../utils/loadAdminKeypair';
import type { ReceiptPlaintext } from '../types/transaction-pool';

// PDA seeds matching the Rust program (pool_vault.rs constants)
const POOL_STATE_SEED = Buffer.from('pool_vault');
const POOL_VAULT_SEED = Buffer.from('pool_vault_token');
const POOL_RECEIPT_SEED = Buffer.from('pool_receipt');

// SPL Memo program for embedding pool codes in transactions
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// On-chain receipt payload fixed size (512 bytes)
const RECEIPT_PAYLOAD_SIZE = 512;

/**
 * Safely convert a decimal USDC amount to micro-USDC integer string
 * without floating-point multiplication.
 * E.g. 1000.50 -> "1000500000", 0.123456 -> "123456"
 */
function decimalToMicroUsdc(amount: number): string {
  const str = amount.toFixed(6);
  const [whole, frac] = str.split('.');
  return (BigInt(whole) * BigInt(1_000_000) + BigInt(frac)).toString();
}

/**
 * Encrypt a receipt plaintext into a fixed 512-byte payload using AES-256-GCM.
 *
 * Layout: [12 IV][16 tag][2 ciphertext-length uint16BE][482 ciphertext zero-padded]
 */
export function encryptReceiptPayload(params: ReceiptPlaintext, aesKey: Buffer): Buffer {
  const plaintext = Buffer.from(JSON.stringify(params), 'utf-8');

  if (plaintext.length > 480) {
    throw new Error(`Receipt plaintext too large: ${plaintext.length} bytes (max 480)`);
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Build fixed-size payload
  const payload = Buffer.alloc(RECEIPT_PAYLOAD_SIZE);
  let offset = 0;

  // 12 bytes IV
  iv.copy(payload, offset);
  offset += 12;

  // 16 bytes auth tag
  tag.copy(payload, offset);
  offset += 16;

  // 2 bytes ciphertext length (uint16BE)
  payload.writeUInt16BE(encrypted.length, offset);
  offset += 2;

  // 482 bytes ciphertext (zero-padded)
  encrypted.copy(payload, offset);
  // Remaining bytes are already zero from Buffer.alloc

  return payload;
}

/**
 * Decrypt a fixed 512-byte receipt payload encrypted with AES-256-GCM.
 *
 * Reads ciphertext length at offset 28, extracts exact ciphertext, and decrypts.
 */
export function decryptReceiptPayload(encryptedPayload: Buffer, aesKey: Buffer): ReceiptPlaintext {
  if (encryptedPayload.length !== RECEIPT_PAYLOAD_SIZE) {
    throw new Error(
      `Invalid receipt payload size: ${encryptedPayload.length}, expected ${RECEIPT_PAYLOAD_SIZE}`
    );
  }

  let offset = 0;

  // Read 12 bytes IV
  const iv = encryptedPayload.subarray(offset, offset + 12);
  offset += 12;

  // Read 16 bytes auth tag
  const tag = encryptedPayload.subarray(offset, offset + 16);
  offset += 16;

  // Read 2 bytes ciphertext length
  const ciphertextLength = encryptedPayload.readUInt16BE(offset);
  offset += 2;

  // Extract exact ciphertext
  const ciphertext = encryptedPayload.subarray(offset, offset + ciphertextLength);

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf-8')) as ReceiptPlaintext;
}

/**
 * Compute a SHA-256 commitment hash of a receipt plaintext.
 */
export function computeCommitmentHash(params: ReceiptPlaintext): Buffer {
  return createHash('sha256').update(JSON.stringify(params)).digest();
}

function createMemoInstruction(text: string, signer?: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    keys: signer ? [{ pubkey: signer, isSigner: true, isWritable: false }] : [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(text, 'utf-8'),
  });
}

export class PoolVaultProgramService {
  private connection: Connection;
  private programId: PublicKey;
  private provider: AnchorProvider;
  private program: Program;
  private adminKeypair: Keypair;
  private aesKey: Buffer;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.programId = new PublicKey(config.solana.escrowProgramId);

    // Load admin keypair for signing transactions
    this.adminKeypair = loadAdminKeypair('PoolVaultProgramService');

    // Create Anchor provider and program
    const wallet = new Wallet(this.adminKeypair);
    this.provider = new AnchorProvider(this.connection, wallet, { commitment: 'confirmed' });
    const escrowIdl = getEscrowIdl();
    this.program = new Program(escrowIdl as any, this.provider);

    // Load AES key for receipt encryption
    const aesKeyHex = process.env.POOL_RECEIPT_ENCRYPTION_KEY;
    if (!aesKeyHex || !/^[0-9a-fA-F]{64}$/.test(aesKeyHex)) {
      throw new Error('POOL_RECEIPT_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    }
    this.aesKey = Buffer.from(aesKeyHex, 'hex');

    console.log(
      '[PoolVaultProgramService] Initialized with program:',
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

  // ─── PDA Derivation ─────────────────────────────────────────────

  /**
   * Derive the pool state PDA
   */
  derivePoolStatePda(poolIdBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([POOL_STATE_SEED, poolIdBytes], this.programId);
  }

  /**
   * Derive the pool vault PDA
   */
  derivePoolVaultPda(poolIdBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([POOL_VAULT_SEED, poolIdBytes], this.programId);
  }

  /**
   * Derive the pool receipt PDA for a specific escrow
   */
  derivePoolReceiptPda(poolIdBytes: Buffer, escrowIdBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [POOL_RECEIPT_SEED, poolIdBytes, escrowIdBytes],
      this.programId
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────

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
   * Get USDC mint address based on environment
   */
  getUsdcMintAddress(): PublicKey {
    const mintAddress = process.env.USDC_MINT_ADDRESS;
    if (!mintAddress) {
      throw new Error('USDC_MINT_ADDRESS not configured');
    }
    return new PublicKey(mintAddress);
  }

  /**
   * Safely convert a decimal USDC amount to micro-USDC string
   */
  decimalToMicroUsdc(amount: number): string {
    return decimalToMicroUsdc(amount);
  }

  // ─── Transaction Signing ────────────────────────────────────────

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

    const timeoutMs = parseInt(process.env.TX_CONFIRMATION_TIMEOUT_MS || '30000', 10);
    const confirmPromise = this.connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Transaction confirmation timed out after ${timeoutMs}ms: ${txSignature}`)),
        timeoutMs
      )
    );
    const result = await Promise.race([confirmPromise, timeoutPromise]);
    if (result?.value?.err) {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(result.value.err)}, tx: ${txSignature}`);
    }

    return txSignature;
  }

  // ─── On-Chain Operations ────────────────────────────────────────

  /**
   * Initialize pool vault on-chain: build, sign, and submit init transaction
   */
  async initPoolVaultOnChain(params: {
    poolId: string;
    usdcMint: PublicKey;
    feeCollector: PublicKey;
    corridor: string;
    expiryTimestamp: number;
    poolCode?: string;
  }): Promise<{ txSignature: string; poolStatePda: string; vaultPda: string }> {
    const poolIdBytes = this.uuidToBytes(params.poolId);
    const [poolStatePda] = this.derivePoolStatePda(poolIdBytes);
    const [vaultPda] = this.derivePoolVaultPda(poolIdBytes);

    // Idempotency guard: check if PDA already exists
    const existing = await this.connection.getAccountInfo(poolStatePda);
    if (existing) {
      console.log(
        `[PoolVaultProgramService] PDA already exists for ${params.poolId}, skipping init`
      );
      return {
        txSignature: 'already-initialized',
        poolStatePda: poolStatePda.toBase58(),
        vaultPda: vaultPda.toBase58(),
      };
    }

    const poolIdArray = Array.from(poolIdBytes);

    // Encode corridor to 8 bytes
    const corridorBuf = Buffer.alloc(8);
    Buffer.from(params.corridor || '').copy(corridorBuf);
    const corridorArray = Array.from(corridorBuf);

    const ix = await (this.program.methods as any)
      .initPoolVault(poolIdArray, corridorArray, new BN(params.expiryTimestamp))
      .accounts({
        authority: this.adminKeypair.publicKey,
        poolVault: poolStatePda,
        mint: params.usdcMint,
        vaultTokenAccount: vaultPda,
        feeCollector: params.feeCollector,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const transaction = new Transaction().add(ix);
    if (params.poolCode) {
      transaction.add(
        createMemoInstruction(
          `EasyEscrow:pool:init:${params.poolCode}`,
          this.adminKeypair.publicKey
        )
      );
    }

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[PoolVaultProgramService] Init pool vault on-chain: ${params.poolId}, tx: ${txSignature}`
    );

    return {
      txSignature,
      poolStatePda: poolStatePda.toBase58(),
      vaultPda: vaultPda.toBase58(),
    };
  }

  /**
   * Build deposit-to-pool transaction (signed by payer, not admin)
   */
  async buildDepositToPoolTx(params: {
    poolId: string;
    payer: PublicKey;
    usdcMint: PublicKey;
    memo?: string;
  }): Promise<Transaction> {
    const poolIdBytes = this.uuidToBytes(params.poolId);
    const [poolStatePda] = this.derivePoolStatePda(poolIdBytes);
    const [vaultPda] = this.derivePoolVaultPda(poolIdBytes);
    const poolIdArray = Array.from(poolIdBytes);

    const payerAta = await getAssociatedTokenAddress(params.usdcMint, params.payer);

    const ix = await (this.program.methods as any)
      .depositToPool(poolIdArray)
      .accounts({
        depositor: params.payer,
        depositorTokenAccount: payerAta,
        poolVault: poolStatePda,
        vaultTokenAccount: vaultPda,
        mint: params.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const transaction = new Transaction().add(ix);
    if (params.memo) {
      transaction.add(createMemoInstruction(params.memo, params.payer));
    }
    return transaction;
  }

  /**
   * Release pool member on-chain: transfers USDC from pool vault to recipient
   */
  async releasePoolMemberOnChain(params: {
    poolId: string;
    escrowId: string;
    recipientWallet: PublicKey;
    usdcMint: PublicKey;
    amountMicroUsdc: string;
    commitmentHash: Buffer;
    encryptedReceipt: Buffer;
    poolCode?: string;
    escrowCode?: string;
  }): Promise<{ txSignature: string; receiptPda: string }> {
    const poolIdBytes = this.uuidToBytes(params.poolId);
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [poolStatePda] = this.derivePoolStatePda(poolIdBytes);
    const [vaultPda] = this.derivePoolVaultPda(poolIdBytes);
    const [receiptPda] = this.derivePoolReceiptPda(poolIdBytes, escrowIdBytes);

    const poolIdArray = Array.from(poolIdBytes);
    const escrowIdArray = Array.from(escrowIdBytes);
    const amountBN = new BN(params.amountMicroUsdc);
    const commitmentArray = Array.from(params.commitmentHash);
    const receiptArray = Array.from(params.encryptedReceipt);

    // Generate 16-byte receipt ID (unique per receipt PDA)
    const receiptId = Array.from(randomBytes(16));

    const transaction = new Transaction();

    // Ensure recipient ATA exists
    const recipientAta = await this.getOrCreateAta(
      params.usdcMint,
      params.recipientWallet,
      this.adminKeypair.publicKey
    );
    if (recipientAta.instruction) {
      transaction.add(recipientAta.instruction);
    }

    const ix = await (this.program.methods as any)
      .releasePoolMember(poolIdArray, escrowIdArray, amountBN, receiptId, commitmentArray, receiptArray)
      .accounts({
        authority: this.adminKeypair.publicKey,
        poolVault: poolStatePda,
        vaultTokenAccount: vaultPda,
        recipientTokenAccount: recipientAta.address,
        mint: params.usdcMint,
        poolReceipt: receiptPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    transaction.add(ix);

    // Memo for audit trail
    if (params.poolCode) {
      const memoText = params.escrowCode
        ? `EasyEscrow:pool:release:${params.poolCode}:${params.escrowCode}`
        : `EasyEscrow:pool:release:${params.poolCode}`;
      transaction.add(createMemoInstruction(memoText, this.adminKeypair.publicKey));
    }

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[PoolVaultProgramService] Release pool member on-chain: pool=${params.poolId}, escrow=${params.escrowId}, tx: ${txSignature}`
    );

    return {
      txSignature,
      receiptPda: receiptPda.toBase58(),
    };
  }

  /**
   * Release pool fees on-chain after all members are settled
   */
  async releasePoolFeesOnChain(params: {
    poolId: string;
    feeCollector: PublicKey;
    usdcMint: PublicKey;
    poolCode?: string;
  }): Promise<string> {
    const poolIdBytes = this.uuidToBytes(params.poolId);
    const [poolStatePda] = this.derivePoolStatePda(poolIdBytes);
    const [vaultPda] = this.derivePoolVaultPda(poolIdBytes);
    const poolIdArray = Array.from(poolIdBytes);

    const transaction = new Transaction();

    const feeCollectorAta = await this.getOrCreateAta(
      params.usdcMint,
      params.feeCollector,
      this.adminKeypair.publicKey
    );
    if (feeCollectorAta.instruction) {
      transaction.add(feeCollectorAta.instruction);
    }

    const ix = await (this.program.methods as any)
      .releasePoolFees(poolIdArray)
      .accounts({
        authority: this.adminKeypair.publicKey,
        poolVault: poolStatePda,
        vaultTokenAccount: vaultPda,
        feeCollectorTokenAccount: feeCollectorAta.address,
        mint: params.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    transaction.add(ix);

    if (params.poolCode) {
      transaction.add(
        createMemoInstruction(
          `EasyEscrow:pool:fees:${params.poolCode}`,
          this.adminKeypair.publicKey
        )
      );
    }

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[PoolVaultProgramService] Release pool fees on-chain: ${params.poolId}, tx: ${txSignature}`
    );

    return txSignature;
  }

  /**
   * Cancel a pool member on-chain: refund USDC from vault back to payer
   * Maps to the Rust cancel_pool_vault instruction (refunds one member's deposit)
   */
  async cancelPoolMemberOnChain(params: {
    poolId: string;
    refundAmountMicroUsdc: string;
    payerWallet: PublicKey;
    usdcMint: PublicKey;
    poolCode?: string;
    escrowCode?: string;
  }): Promise<string> {
    const poolIdBytes = this.uuidToBytes(params.poolId);
    const [poolStatePda] = this.derivePoolStatePda(poolIdBytes);
    const [vaultPda] = this.derivePoolVaultPda(poolIdBytes);
    const poolIdArray = Array.from(poolIdBytes);
    const amountBN = new BN(params.refundAmountMicroUsdc);

    const payerAta = await getAssociatedTokenAddress(params.usdcMint, params.payerWallet);

    const ix = await (this.program.methods as any)
      .cancelPoolVault(poolIdArray, amountBN)
      .accounts({
        authority: this.adminKeypair.publicKey,
        poolVault: poolStatePda,
        vaultTokenAccount: vaultPda,
        refundTokenAccount: payerAta,
        mint: params.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const transaction = new Transaction().add(ix);

    if (params.poolCode) {
      const reason = params.escrowCode ? `:${params.escrowCode}` : '';
      transaction.add(
        createMemoInstruction(
          `EasyEscrow:pool:cancel:${params.poolCode}${reason}`,
          this.adminKeypair.publicKey
        )
      );
    }

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[PoolVaultProgramService] Cancel pool member on-chain: pool=${params.poolId}, tx: ${txSignature}`
    );

    return txSignature;
  }

  /**
   * Close the pool vault on-chain after all members are settled or cancelled
   */
  async closePoolVaultOnChain(params: { poolId: string; poolCode?: string }): Promise<string> {
    const poolIdBytes = this.uuidToBytes(params.poolId);
    const [poolStatePda] = this.derivePoolStatePda(poolIdBytes);
    const [vaultPda] = this.derivePoolVaultPda(poolIdBytes);
    const poolIdArray = Array.from(poolIdBytes);

    const ix = await (this.program.methods as any)
      .closePoolVault(poolIdArray)
      .accounts({
        authority: this.adminKeypair.publicKey,
        poolVault: poolStatePda,
        vaultTokenAccount: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const transaction = new Transaction().add(ix);

    if (params.poolCode) {
      transaction.add(
        createMemoInstruction(
          `EasyEscrow:pool:close:${params.poolCode}`,
          this.adminKeypair.publicKey
        )
      );
    }

    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[PoolVaultProgramService] Close pool vault on-chain: ${params.poolId}, tx: ${txSignature}`
    );

    return txSignature;
  }

  /**
   * Close a pool receipt PDA on-chain (reclaim rent)
   */
  async closePoolReceiptOnChain(params: { poolId: string; escrowId: string }): Promise<string> {
    const poolIdBytes = this.uuidToBytes(params.poolId);
    const escrowIdBytes = this.uuidToBytes(params.escrowId);
    const [poolStatePda] = this.derivePoolStatePda(poolIdBytes);
    const [receiptPda] = this.derivePoolReceiptPda(poolIdBytes, escrowIdBytes);
    const poolIdArray = Array.from(poolIdBytes);
    const escrowIdArray = Array.from(escrowIdBytes);

    const ix = await (this.program.methods as any)
      .closePoolReceipt(poolIdArray, escrowIdArray)
      .accounts({
        authority: this.adminKeypair.publicKey,
        poolVault: poolStatePda,
        poolReceipt: receiptPda,
      })
      .instruction();

    const transaction = new Transaction().add(ix);
    const txSignature = await this.signAndSubmit(transaction);

    console.log(
      `[PoolVaultProgramService] Close pool receipt on-chain: pool=${params.poolId}, escrow=${params.escrowId}, tx: ${txSignature}`
    );

    return txSignature;
  }

  // ─── On-Chain Queries ───────────────────────────────────────────

  /**
   * Fetch on-chain pool receipt data
   */
  async fetchPoolReceipt(
    poolId: string,
    escrowId: string
  ): Promise<{
    exists: boolean;
    commitmentHash?: string;
    encryptedPayload?: Buffer;
  }> {
    const poolIdBytes = this.uuidToBytes(poolId);
    const escrowIdBytes = this.uuidToBytes(escrowId);
    const [receiptPda] = this.derivePoolReceiptPda(poolIdBytes, escrowIdBytes);

    try {
      const decoded = await (this.program.account as any).poolReceipt.fetchNullable(receiptPda);
      if (!decoded) {
        return { exists: false };
      }

      return {
        exists: true,
        commitmentHash: Buffer.from(decoded.commitmentHash).toString('hex'),
        encryptedPayload: Buffer.from(decoded.encryptedPayload),
      };
    } catch (err) {
      console.warn('[PoolVaultProgramService] fetchPoolReceipt error:', err);
      return { exists: false };
    }
  }

  /**
   * Verify on-chain pool state using Anchor account decoding
   */
  async verifyPoolOnChainState(poolId: string): Promise<{
    exists: boolean;
    status?: number;
    memberCount?: number;
    settledCount?: number;
    vaultBalance?: number;
  }> {
    const poolIdBytes = this.uuidToBytes(poolId);
    const [poolStatePda] = this.derivePoolStatePda(poolIdBytes);

    try {
      const decoded = await (this.program.account as any).poolVault.fetchNullable(poolStatePda);
      if (!decoded) {
        return { exists: false };
      }

      let status: number | undefined;
      if (decoded.status) {
        if ('open' in decoded.status) status = 0;
        else if ('locked' in decoded.status) status = 1;
        else if ('settling' in decoded.status) status = 2;
        else if ('settled' in decoded.status) status = 3;
        else if ('cancelled' in decoded.status) status = 4;
      }

      return {
        exists: true,
        status,
        memberCount: decoded.memberCount ? Number(decoded.memberCount) : undefined,
        settledCount: decoded.settledCount ? Number(decoded.settledCount) : undefined,
      };
    } catch (err) {
      console.warn('[PoolVaultProgramService] verifyPoolOnChainState error:', err);
      return { exists: false };
    }
  }

  // ─── Instance Encryption Helpers ────────────────────────────────

  /**
   * Encrypt a receipt using the service's AES key
   */
  encryptReceipt(params: ReceiptPlaintext): Buffer {
    return encryptReceiptPayload(params, this.aesKey);
  }

  /**
   * Decrypt a receipt using the service's AES key
   */
  decryptReceipt(encryptedPayload: Buffer): ReceiptPlaintext {
    return decryptReceiptPayload(encryptedPayload, this.aesKey);
  }

  /**
   * Compute commitment hash
   */
  computeCommitment(params: ReceiptPlaintext): Buffer {
    return computeCommitmentHash(params);
  }
}

let instance: PoolVaultProgramService | null = null;
export function getPoolVaultProgramService(): PoolVaultProgramService {
  if (!instance) {
    instance = new PoolVaultProgramService();
  }
  return instance;
}
