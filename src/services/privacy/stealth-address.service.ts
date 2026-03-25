/**
 * Stealth Address Service
 *
 * Manages the lifecycle of stealth meta-addresses and stealth payments:
 * - Meta-address registration (generate + encrypt + store)
 * - Stealth payment creation (derive address, create record)
 * - Scanning for incoming stealth payments
 * - Sweeping stealth addresses to destination wallets
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { PrismaClient } from '../../generated/prisma';
import { config } from '../../config';
import {
  generateMetaAddress,
  deriveStealthAddress,
  deriveSpendingKey,
  sendTokensFromStealth,
} from './stealth-adapter';
import { encryptKey, decryptKey } from './stealth-key-manager';
import { isPrivacyEnabled } from '../../utils/featureFlags';
import {
  StealthMetaAddress,
  StealthPaymentResult,
  StealthPaymentStatus,
  SweepResult,
  ScanResult,
} from './privacy.types';

const prisma = new PrismaClient();

export interface CreateStealthPaymentParams {
  metaAddressId: string;
  escrowId?: string;
  tokenMint: string;
  amountRaw: bigint;
}

export interface RegisterMetaAddressResult {
  id: string;
  scanPublicKey: string;
  spendPublicKey: string;
  label: string | null;
}

export class StealthAddressService {
  /**
   * Register a new stealth meta-address for an institution client.
   * Generates scan + spend keypairs, encrypts private keys, and stores in DB.
   */
  async registerMetaAddress(clientId: string, label?: string): Promise<RegisterMetaAddressResult> {
    if (!isPrivacyEnabled()) {
      throw new Error('Privacy features are not enabled');
    }

    const keys = await generateMetaAddress();

    const encryptedScanKey = encryptKey(keys.scan.secretKey);
    const encryptedSpendKey = encryptKey(keys.spend.secretKey);

    const record = await prisma.stealthMetaAddress.create({
      data: {
        institutionClientId: clientId,
        label: label || null,
        scanPublicKey: keys.scan.publicKey,
        spendPublicKey: keys.spend.publicKey,
        encryptedScanKey,
        encryptedSpendKey,
      },
    });

    return {
      id: record.id,
      scanPublicKey: record.scanPublicKey,
      spendPublicKey: record.spendPublicKey,
      label: record.label,
    };
  }

  /**
   * Get active meta-addresses for a client.
   */
  async getMetaAddresses(clientId: string) {
    if (!isPrivacyEnabled()) {
      throw new Error('Privacy features are not enabled');
    }

    const records = await prisma.stealthMetaAddress.findMany({
      where: { institutionClientId: clientId, isActive: true },
      select: {
        id: true,
        scanPublicKey: true,
        spendPublicKey: true,
        label: true,
        viewingKeyShared: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records;
  }

  /**
   * Find a meta-address linked to a wallet via InstitutionAccount.
   * Used for auto-lookup when releasing to a recipient wallet.
   * Returns the meta-address ID, or null if none found.
   */
  async findMetaAddressForWallet(walletAddress: string): Promise<string | null> {
    // Look up the account that owns this wallet, check if it has a stealth meta-address
    const account = await prisma.institutionAccount.findFirst({
      where: { walletAddress, isActive: true, stealthMetaAddressId: { not: null } },
      select: { stealthMetaAddressId: true },
    });

    if (account?.stealthMetaAddressId) {
      // Verify the meta-address is still active
      const meta = await prisma.stealthMetaAddress.findFirst({
        where: { id: account.stealthMetaAddressId, isActive: true },
        select: { id: true },
      });
      return meta?.id || null;
    }

    // Fallback: find any active meta-address for a client that owns this wallet
    const client = await prisma.institutionClient.findFirst({
      where: {
        OR: [{ primaryWallet: walletAddress }, { settledWallets: { has: walletAddress } }],
      },
      select: { id: true },
    });

    if (client) {
      const meta = await prisma.stealthMetaAddress.findFirst({
        where: { institutionClientId: client.id, isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      return meta?.id || null;
    }

    return null;
  }

  /**
   * Get a specific meta-address by ID with ownership check.
   */
  async getMetaAddress(clientId: string, metaAddressId: string) {
    const record = await prisma.stealthMetaAddress.findUnique({
      where: { id: metaAddressId },
    });

    if (!record || record.institutionClientId !== clientId) {
      throw new Error('Meta-address not found');
    }

    return record;
  }

  /**
   * Deactivate a meta-address (soft delete).
   */
  async deactivateMetaAddress(clientId: string, metaAddressId: string): Promise<void> {
    if (!isPrivacyEnabled()) {
      throw new Error('Privacy features are not enabled');
    }

    const record = await prisma.stealthMetaAddress.findUnique({
      where: { id: metaAddressId },
    });

    if (!record || record.institutionClientId !== clientId) {
      throw new Error('Meta-address not found');
    }

    await prisma.stealthMetaAddress.update({
      where: { id: metaAddressId },
      data: { isActive: false },
    });
  }

  /**
   * Create a stealth payment record.
   * Derives a one-time stealth address from the meta-address.
   */
  async createStealthPayment(
    params: CreateStealthPaymentParams
  ): Promise<{ stealthPaymentId: string; stealthAddress: string; ephemeralPublicKey: string }> {
    if (!isPrivacyEnabled()) {
      throw new Error('Privacy features are not enabled');
    }

    const metaAddress = await prisma.stealthMetaAddress.findUnique({
      where: { id: params.metaAddressId },
    });

    if (!metaAddress || !metaAddress.isActive) {
      throw new Error('Meta-address not found or inactive');
    }

    // Derive one-time stealth address
    const stealthResult = await deriveStealthAddress({
      scanPublicKey: metaAddress.scanPublicKey,
      spendPublicKey: metaAddress.spendPublicKey,
    });

    // Create payment record
    const payment = await prisma.stealthPayment.create({
      data: {
        metaAddressId: params.metaAddressId,
        stealthAddress: stealthResult.stealthAddress,
        ephemeralPublicKey: stealthResult.ephemeralPublicKey,
        escrowId: params.escrowId || null,
        tokenMint: params.tokenMint,
        amountRaw: params.amountRaw,
        status: 'PENDING',
      },
    });

    return {
      stealthPaymentId: payment.id,
      stealthAddress: stealthResult.stealthAddress,
      ephemeralPublicKey: stealthResult.ephemeralPublicKey,
    };
  }

  /**
   * Confirm a stealth payment (after on-chain transaction succeeds).
   */
  async confirmStealthPayment(paymentId: string, releaseTxSignature: string): Promise<void> {
    await prisma.stealthPayment.update({
      where: { id: paymentId },
      data: {
        status: 'CONFIRMED',
        releaseTxSignature,
        confirmedAt: new Date(),
      },
    });
  }

  /**
   * Mark a stealth payment as failed.
   */
  async failStealthPayment(paymentId: string): Promise<void> {
    await prisma.stealthPayment.update({
      where: { id: paymentId },
      data: { status: 'FAILED' },
    });
  }

  /**
   * Scan for incoming stealth payments for a client.
   * Returns all payments associated with the client's meta-addresses.
   */
  async scanPayments(clientId: string, status?: StealthPaymentStatus): Promise<ScanResult[]> {
    if (!isPrivacyEnabled()) {
      throw new Error('Privacy features are not enabled');
    }

    const where: any = {
      metaAddress: {
        institutionClientId: clientId,
      },
    };

    if (status) {
      where.status = status;
    }

    const payments = await prisma.stealthPayment.findMany({
      where,
      select: {
        id: true,
        stealthAddress: true,
        amountRaw: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((p) => ({
      paymentId: p.id,
      stealthAddress: p.stealthAddress,
      amount: p.amountRaw.toString(),
      status: p.status as StealthPaymentStatus,
      createdAt: p.createdAt,
    }));
  }

  /**
   * Get stealth payments for a client with pagination.
   */
  async listPayments(
    clientId: string,
    options: { limit?: number; offset?: number; status?: StealthPaymentStatus } = {}
  ) {
    if (!isPrivacyEnabled()) {
      throw new Error('Privacy features are not enabled');
    }

    const { limit = 20, offset = 0, status } = options;

    const where: any = {
      metaAddress: {
        institutionClientId: clientId,
      },
    };

    if (status) {
      where.status = status;
    }

    const [payments, total] = await Promise.all([
      prisma.stealthPayment.findMany({
        where,
        include: {
          metaAddress: {
            select: { label: true, scanPublicKey: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.stealthPayment.count({ where }),
    ]);

    return {
      payments: payments.map((p) => ({
        id: p.id,
        metaAddressId: p.metaAddressId,
        metaAddressLabel: p.metaAddress.label,
        stealthAddress: p.stealthAddress,
        ephemeralPublicKey: p.ephemeralPublicKey,
        escrowId: p.escrowId,
        tokenMint: p.tokenMint,
        amount: p.amountRaw.toString(),
        status: p.status,
        releaseTxSignature: p.releaseTxSignature,
        sweepTxSignature: p.sweepTxSignature,
        createdAt: p.createdAt,
        confirmedAt: p.confirmedAt,
        sweptAt: p.sweptAt,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get a single stealth payment by ID with ownership verification.
   */
  async getPayment(clientId: string, paymentId: string) {
    if (!isPrivacyEnabled()) {
      throw new Error('Privacy features are not enabled');
    }

    const payment = await prisma.stealthPayment.findUnique({
      where: { id: paymentId },
      include: {
        metaAddress: {
          select: {
            institutionClientId: true,
            label: true,
            scanPublicKey: true,
          },
        },
      },
    });

    if (!payment || payment.metaAddress.institutionClientId !== clientId) {
      throw new Error('Payment not found');
    }

    return {
      id: payment.id,
      metaAddressId: payment.metaAddressId,
      metaAddressLabel: payment.metaAddress.label,
      stealthAddress: payment.stealthAddress,
      ephemeralPublicKey: payment.ephemeralPublicKey,
      escrowId: payment.escrowId,
      tokenMint: payment.tokenMint,
      amount: payment.amountRaw.toString(),
      status: payment.status,
      releaseTxSignature: payment.releaseTxSignature,
      sweepTxSignature: payment.sweepTxSignature,
      createdAt: payment.createdAt,
      confirmedAt: payment.confirmedAt,
      sweptAt: payment.sweptAt,
    };
  }

  /**
   * Sweep funds from a stealth address to a destination wallet.
   * Decrypts the scanning + spending keys, derives the stealth keypair,
   * and transfers all tokens to the destination.
   */
  async sweepPayment(
    clientId: string,
    paymentId: string,
    destinationWallet: string
  ): Promise<SweepResult> {
    if (!isPrivacyEnabled()) {
      throw new Error('Privacy features are not enabled');
    }

    const payment = await prisma.stealthPayment.findUnique({
      where: { id: paymentId },
      include: { metaAddress: true },
    });

    if (!payment || payment.metaAddress.institutionClientId !== clientId) {
      throw new Error('Payment not found');
    }

    if (payment.status !== 'CONFIRMED') {
      throw new Error(`Cannot sweep: payment status is ${payment.status}, expected CONFIRMED`);
    }

    // Decrypt keys
    const scanSecretKey = decryptKey(payment.metaAddress.encryptedScanKey);
    const spendSecretKey = decryptKey(payment.metaAddress.encryptedSpendKey);

    // Derive the scalar spending key for the stealth address
    const scalarKey = await deriveSpendingKey(
      scanSecretKey,
      spendSecretKey,
      payment.ephemeralPublicKey
    );

    // Sweep tokens from stealth address to destination wallet
    const connection = new Connection(config.solana.rpcUrl, 'confirmed');
    const tokenMint = new PublicKey(payment.tokenMint);
    const destination = new PublicKey(destinationWallet);

    const amount = Number(payment.amountRaw);
    const txSignature = await sendTokensFromStealth({
      connection,
      scalarKey,
      tokenMint,
      destination,
      amount,
    });

    // Update payment record
    await prisma.stealthPayment.update({
      where: { id: paymentId },
      data: {
        status: 'SWEPT',
        sweepTxSignature: txSignature,
        sweptAt: new Date(),
      },
    });

    return {
      txSignature,
      destinationWallet,
      amount: amount.toString(),
    };
  }
}

let instance: StealthAddressService | null = null;
export function getStealthAddressService(): StealthAddressService {
  if (!instance) {
    instance = new StealthAddressService();
  }
  return instance;
}
