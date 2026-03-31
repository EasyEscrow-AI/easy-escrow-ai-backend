import crypto from 'crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { prisma } from '../config/database';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';
import { config } from '../config';
import { loadAdminKeypair } from '../utils/loadAdminKeypair';
import { getEffectiveMint } from '../utils/token-env-mapping';
import { isValidSolanaAddress } from '../models/validators/solana.validator';
import { logger } from './logger.service';
import type { PrismaClient } from '../generated/prisma';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const SIGNATURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function decimalToSmallestUnit(amount: number, decimals: number): bigint {
  if (amount < 0) throw new Error('Amount cannot be negative');
  const str = amount.toFixed(decimals);
  const [whole, frac] = str.split('.');
  const fracPadded = (frac || '0').padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded);
}

export class InstitutionTransferService {
  private prisma: PrismaClient;
  private connection: Connection;
  private adminKeypair: Keypair;

  constructor() {
    this.prisma = prisma;
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.adminKeypair = loadAdminKeypair('InstitutionTransferService');
  }

  generateTransferCode(): string {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const bytes = crypto.randomBytes(6);
    let code = 'TXF-';
    for (let i = 0; i < 6; i++) {
      if (i === 3) code += '-';
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

  async transfer(
    clientId: string,
    params: {
      fromAccountId: string;
      toAccountId: string;
      tokenSymbol: string;
      amount: number;
      walletSignature: string;
      signerPublicKey: string;
      timestamp: string;
      note?: string;
    }
  ) {
    const {
      fromAccountId,
      toAccountId,
      tokenSymbol,
      amount,
      walletSignature,
      signerPublicKey,
      timestamp,
      note,
    } = params;

    // Basic validation
    if (fromAccountId === toAccountId) {
      throw Object.assign(new Error('Source and destination accounts must be different'), {
        status: 400,
      });
    }
    if (amount <= 0) {
      throw Object.assign(new Error('Amount must be greater than zero'), { status: 400 });
    }
    if (!isValidSolanaAddress(signerPublicKey)) {
      throw Object.assign(new Error('Invalid signer public key'), { status: 400 });
    }

    // Load both accounts in parallel
    const [fromAccount, toAccount] = await Promise.all([
      this.prisma.institutionAccount.findUnique({ where: { id: fromAccountId } }),
      this.prisma.institutionAccount.findUnique({ where: { id: toAccountId } }),
    ]);

    if (!fromAccount) {
      throw Object.assign(new Error(`Source account not found: ${fromAccountId}`), { status: 404 });
    }
    if (!toAccount) {
      throw Object.assign(new Error(`Destination account not found: ${toAccountId}`), {
        status: 404,
      });
    }

    // Ownership check
    if (fromAccount.clientId !== clientId) {
      throw Object.assign(new Error('Source account does not belong to your institution'), {
        status: 403,
      });
    }
    if (toAccount.clientId !== clientId) {
      throw Object.assign(new Error('Destination account does not belong to your institution'), {
        status: 403,
      });
    }

    // Verification + active check
    if (fromAccount.verificationStatus !== 'VERIFIED' || !fromAccount.isActive) {
      throw Object.assign(new Error('Source account is not verified or active'), { status: 400 });
    }
    if (toAccount.verificationStatus !== 'VERIFIED' || !toAccount.isActive) {
      throw Object.assign(new Error('Destination account is not verified or active'), {
        status: 400,
      });
    }

    // Validate signer is an institution wallet
    const institutionWallet = await this.prisma.institutionWallet.findFirst({
      where: { clientId, address: signerPublicKey },
    });
    if (!institutionWallet) {
      throw Object.assign(new Error('Signer public key is not associated with your institution'), {
        status: 403,
      });
    }

    // Resolve token mint
    const normalizedSymbol = tokenSymbol.toUpperCase();
    const approvedToken = await this.prisma.institutionApprovedToken.findFirst({
      where: { symbol: normalizedSymbol, isActive: true },
    });
    if (!approvedToken) {
      throw Object.assign(new Error(`Token ${normalizedSymbol} is not supported`), { status: 400 });
    }
    const mintAddress = getEffectiveMint(approvedToken.symbol, approvedToken.mintAddress);
    if (!isValidSolanaAddress(mintAddress)) {
      throw Object.assign(new Error(`Token ${normalizedSymbol} mint address is not configured`), {
        status: 400,
      });
    }

    // Verify wallet signature
    const fromLabel = fromAccount.label || fromAccount.name;
    const toLabel = toAccount.label || toAccount.name;
    this.verifyWalletSignature(walletSignature, signerPublicKey, {
      fromLabel,
      toLabel,
      amount,
      tokenSymbol: normalizedSymbol,
      timestamp,
    });

    // Idempotency: check for pending transfer with same params in last 60 seconds
    const recentDuplicate = await this.prisma.institutionTransfer.findFirst({
      where: {
        clientId,
        fromAccountId,
        toAccountId,
        tokenSymbol: normalizedSymbol,
        amount,
        status: 'pending',
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recentDuplicate) {
      throw Object.assign(
        new Error(`Transfer already in progress (${recentDuplicate.transferCode})`),
        { status: 409 }
      );
    }

    // Check on-chain balance
    const fromPubkey = new PublicKey(fromAccount.walletAddress);
    const mint = new PublicKey(mintAddress);
    const sourceBalance = await this.getTokenBalance(fromPubkey, mint, approvedToken.decimals);
    if (sourceBalance < amount) {
      throw Object.assign(
        new Error(
          `Insufficient ${normalizedSymbol} balance: have ${sourceBalance.toFixed(
            approvedToken.decimals
          )}, need ${amount}`
        ),
        { status: 400 }
      );
    }

    // Create transfer record
    const transferCode = this.generateTransferCode();
    const transfer = await this.prisma.institutionTransfer.create({
      data: {
        transferCode,
        clientId,
        fromAccountId,
        toAccountId,
        tokenSymbol: normalizedSymbol,
        amount,
        signerPublicKey,
        status: 'pending',
        note: note || null,
      },
    });

    // Execute on-chain transfer
    let txSignature: string;
    try {
      txSignature = await this.executeOnChainTransfer(
        fromPubkey,
        new PublicKey(toAccount.walletAddress),
        mint,
        decimalToSmallestUnit(amount, approvedToken.decimals),
        transferCode
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.prisma.institutionTransfer.update({
        where: { id: transfer.id },
        data: { status: 'failed', failureReason: reason },
      });
      await this.createAuditLog(clientId, transfer.id, 'TRANSFER_FAILED', signerPublicKey, {
        transferCode,
        fromAccountId,
        toAccountId,
        tokenSymbol: normalizedSymbol,
        amount,
        reason,
      });
      throw Object.assign(new Error(`On-chain transfer failed: ${reason}`), { status: 400 });
    }

    // Mark completed
    await this.prisma.institutionTransfer.update({
      where: { id: transfer.id },
      data: { status: 'completed', txSignature },
    });

    // Audit log
    await this.createAuditLog(clientId, transfer.id, 'TRANSFER_COMPLETED', signerPublicKey, {
      transferCode,
      fromAccountId,
      fromLabel,
      toAccountId,
      toLabel,
      tokenSymbol: normalizedSymbol,
      amount,
      txSignature,
    });

    return {
      id: transferCode,
      fromAccountId,
      fromAccountLabel: fromLabel,
      toAccountId,
      toAccountLabel: toLabel,
      tokenSymbol: normalizedSymbol,
      amount,
      txSignature,
      status: 'completed' as const,
      createdAt: transfer.createdAt.toISOString(),
    };
  }

  private verifyWalletSignature(
    signatureBase64: string,
    signerPublicKey: string,
    params: {
      fromLabel: string;
      toLabel: string;
      amount: number;
      tokenSymbol: string;
      timestamp: string;
    }
  ): void {
    let signatureBytes: Uint8Array;
    try {
      signatureBytes = Uint8Array.from(Buffer.from(signatureBase64, 'base64'));
    } catch {
      throw Object.assign(new Error('Invalid wallet signature encoding'), { status: 400 });
    }

    if (signatureBytes.length !== 64) {
      throw Object.assign(new Error('Invalid wallet signature length'), { status: 400 });
    }

    // Validate the provided timestamp is within the allowed window
    const tsDate = new Date(params.timestamp);
    if (isNaN(tsDate.getTime())) {
      throw Object.assign(new Error('Invalid timestamp format'), { status: 400 });
    }
    const age = Math.abs(Date.now() - tsDate.getTime());
    if (age > SIGNATURE_WINDOW_MS) {
      throw Object.assign(new Error('Signature timestamp expired (must be within 5 minutes)'), {
        status: 400,
      });
    }

    // Reconstruct the exact message using the provided timestamp and verify
    const pubkeyBytes = bs58.decode(signerPublicKey);
    const message = this.buildSignatureMessage(params, params.timestamp);
    const messageBytes = new TextEncoder().encode(message);

    if (!nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes)) {
      throw Object.assign(new Error('Wallet signature verification failed'), { status: 400 });
    }
  }

  private buildSignatureMessage(
    params: { fromLabel: string; toLabel: string; amount: number; tokenSymbol: string },
    timestamp: string
  ): string {
    return [
      'EasyEscrow Internal Transfer',
      `From: ${params.fromLabel}`,
      `To: ${params.toLabel}`,
      `Amount: ${params.amount} ${params.tokenSymbol}`,
      `Timestamp: ${timestamp}`,
    ].join('\n');
  }

  private async getTokenBalance(
    owner: PublicKey,
    mint: PublicKey,
    decimals: number
  ): Promise<number> {
    try {
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(owner, { mint });
      let total = 0;
      for (const { account } of tokenAccounts.value) {
        const amount = account.data.readBigUInt64LE(64);
        total += Number(amount) / 10 ** decimals;
      }
      return total;
    } catch {
      return 0;
    }
  }

  private async getOrCreateAta(
    mint: PublicKey,
    owner: PublicKey,
    payer: PublicKey
  ): Promise<{ address: PublicKey; instruction?: TransactionInstruction }> {
    const ata = await getAssociatedTokenAddress(mint, owner);
    try {
      const account = await this.connection.getAccountInfo(ata);
      if (account) return { address: ata };
    } catch {
      // Account doesn't exist
    }
    const instruction = createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
    return { address: ata, instruction };
  }

  private async executeOnChainTransfer(
    fromWallet: PublicKey,
    toWallet: PublicKey,
    mint: PublicKey,
    amountSmallest: bigint,
    transferCode: string
  ): Promise<string> {
    const transaction = new Transaction();

    // Source ATA (must exist since we verified balance)
    const sourceAta = await getAssociatedTokenAddress(mint, fromWallet);

    // Destination ATA (create if needed)
    const destAtaResult = await this.getOrCreateAta(mint, toWallet, this.adminKeypair.publicKey);
    if (destAtaResult.instruction) {
      transaction.add(destAtaResult.instruction);
    }

    // SPL transfer — admin is the authority (custodial model)
    transaction.add(
      createTransferInstruction(
        sourceAta,
        destAtaResult.address,
        this.adminKeypair.publicKey,
        amountSmallest
      )
    );

    // Memo
    transaction.add(
      new TransactionInstruction({
        keys: [{ pubkey: this.adminKeypair.publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(`EasyEscrow:transfer:${transferCode}`, 'utf-8'),
      })
    );

    // Sign and submit
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

    // Verify on-chain success
    const txResult = await this.connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (txResult?.meta?.err) {
      throw new Error(
        `Transaction confirmed but failed on-chain: ${JSON.stringify(txResult.meta.err)}`
      );
    }

    logger.info('Internal transfer submitted', { transferCode, txSignature });
    return txSignature;
  }

  private async createAuditLog(
    clientId: string,
    transferId: string,
    action: string,
    actor: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.prisma.institutionAuditLog.create({
        data: { clientId, action, actor, details: details as any },
      });
    } catch (err) {
      logger.error('Failed to create transfer audit log', {
        transferId,
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

let _instance: InstitutionTransferService | null = null;

export function getInstitutionTransferService(): InstitutionTransferService {
  if (!_instance) {
    _instance = new InstitutionTransferService();
  }
  return _instance;
}
