/**
 * Pool Decoy Service
 *
 * Injects chaff (decoy) members into transaction pools at creation time to
 * bootstrap the anonymity set. Decoys create encrypted receipt PDAs on-chain
 * (same AES-256-GCM format) that are indistinguishable from real receipts.
 * No USDC is moved — receipt-only mode.
 *
 * Controlled by POOL_DECOY_ENABLED=true env var.
 */

import { randomBytes, randomUUID } from 'crypto';
import { Keypair } from '@solana/web3.js';
import { prisma } from '../config/database';
import { getPoolVaultProgramService, encryptReceiptPayload, computeCommitmentHash } from './pool-vault-program.service';
import type { ReceiptPlaintext } from '../types/transaction-pool';

const LOG_PREFIX = '[PoolDecoyService]';

// Config from env with defaults
const MIN_DECOY_COUNT = parseInt(process.env.POOL_MIN_DECOY_COUNT || '3');
const MAX_DECOY_COUNT = parseInt(process.env.POOL_MAX_DECOY_COUNT || '5');
const AMOUNT_MIN = 50;
const AMOUNT_MAX = 5000;
const CORRIDORS = ['SG-CH', 'CH-US', 'US-SG', 'SG-US', 'CH-SG', 'US-CH'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAmount(): string {
  const whole = randomInt(AMOUNT_MIN, AMOUNT_MAX);
  const cents = randomInt(0, 99);
  return `${whole}.${cents.toString().padStart(2, '0')}0000`;
}

function generateEscrowCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg1 = Array.from({ length: 3 }, () => chars[randomInt(0, chars.length - 1)]).join('');
  const seg2 = Array.from({ length: 3 }, () => chars[randomInt(0, chars.length - 1)]).join('');
  return `EE-${seg1}-${seg2}`;
}

function fakeTxSignature(): string {
  // Generate a 64-byte random signature encoded as base58-like string
  return Array.from(randomBytes(64))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export class PoolDecoyService {
  /**
   * Inject decoy members into a newly created pool.
   * Creates encrypted receipt PDAs on-chain (receipt-only, no USDC movement).
   *
   * @returns number of decoys successfully injected
   */
  async injectDecoys(
    poolId: string,
    poolCode: string,
    corridor: string | null
  ): Promise<number> {
    const decoyCount = randomInt(MIN_DECOY_COUNT, MAX_DECOY_COUNT);
    let injected = 0;

    console.log(`${LOG_PREFIX} Injecting ${decoyCount} decoy members for pool ${poolCode}`);

    const pvService = getPoolVaultProgramService();

    for (let i = 0; i < decoyCount; i++) {
      try {
        const decoyEscrowId = randomUUID();
        const decoyEscrowCode = generateEscrowCode();
        const decoyAmount = randomAmount();
        const decoyCorridor = corridor || CORRIDORS[randomInt(0, CORRIDORS.length - 1)];
        const payerWallet = Keypair.generate().publicKey.toBase58();
        const recipientWallet = Keypair.generate().publicKey.toBase58();

        // Build receipt plaintext (indistinguishable from real receipts when encrypted)
        const receiptPlaintext: ReceiptPlaintext = {
          poolId,
          poolCode,
          escrowId: decoyEscrowId,
          escrowCode: decoyEscrowCode,
          amount: decoyAmount,
          corridor: decoyCorridor,
          payerWallet,
          recipientWallet,
          releaseTxSignature: fakeTxSignature(),
          settledAt: new Date().toISOString(),
        };

        // Encrypt and compute commitment hash (same as real receipts)
        const commitment = computeCommitmentHash(receiptPlaintext);
        const encrypted = pvService.encryptReceipt(receiptPlaintext);

        // Create on-chain receipt PDA (amount=0, receipt-only)
        const result = await pvService.releasePoolMemberOnChain({
          poolId,
          escrowId: decoyEscrowId,
          recipientWallet: Keypair.generate().publicKey, // dummy recipient for ATA
          usdcMint: pvService.getUsdcMintAddress(),
          amountMicroUsdc: '0',
          commitmentHash: commitment,
          encryptedReceipt: encrypted,
          poolCode,
        });

        // Store decoy member in DB (escrowId is a fake UUID, no real escrow record)
        await prisma.transactionPoolMember.create({
          data: {
            poolId,
            escrowId: `decoy-${decoyEscrowId}`,
            status: 'SETTLED',
            amount: parseFloat(decoyAmount),
            platformFee: 0,
            corridor: decoyCorridor,
            isDecoy: true,
            receiptPda: result.receiptPda,
            commitmentHash: commitment.toString('hex'),
            releasedAt: new Date(),
            sequenceNumber: -(i + 1), // negative sequence to distinguish from real members
          },
        });

        injected++;
        console.log(`${LOG_PREFIX}   Decoy ${i + 1}/${decoyCount}: ${decoyEscrowCode} → receipt ${result.receiptPda.slice(0, 12)}...`);
      } catch (err) {
        console.warn(`${LOG_PREFIX}   Decoy ${i + 1}/${decoyCount} failed:`, (err as Error).message);
      }
    }

    // Update pool member count to include decoys
    if (injected > 0) {
      await prisma.transactionPool.update({
        where: { id: poolId },
        data: {
          memberCount: { increment: injected },
          settledCount: { increment: injected },
        },
      });
    }

    console.log(`${LOG_PREFIX} Injected ${injected}/${decoyCount} decoy members for ${poolCode}`);
    return injected;
  }
}

// Singleton
let _instance: PoolDecoyService | null = null;

export function getPoolDecoyService(): PoolDecoyService {
  if (!_instance) {
    _instance = new PoolDecoyService();
  }
  return _instance;
}
