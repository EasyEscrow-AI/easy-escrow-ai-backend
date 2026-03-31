/**
 * Allowlist Service
 *
 * Manages the institution escrow wallet allowlist using Redis for fast lookups
 * with PostgreSQL as the source of truth. Wallets from verified institution
 * clients are automatically added to the allowlist.
 */

import { PrismaClient } from '../generated/prisma';
import { prisma } from '../config/database';
import { redisClient } from '../config/redis';

const ALLOWLIST_SET_KEY = 'institution:allowlist';
const ALLOWLIST_META_PREFIX = 'institution:allowlist:meta:';
const ALLOWLIST_META_TTL = 86400; // 24 hours

export interface AllowlistMetadata {
  clientId: string;
  companyName: string;
  kycStatus: string;
  tier: string;
  addedAt: string;
}

export class AllowlistService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Check if a wallet is on the allowlist
   * Redis SET first, fallback to Prisma
   */
  async isAllowlisted(wallet: string): Promise<boolean> {
    if (!isValidSolanaAddress(wallet)) return false;

    try {
      const inRedis = await redisClient.sismember(ALLOWLIST_SET_KEY, wallet);
      if (inRedis) return true;
    } catch {
      // Redis unavailable, fall through to Prisma
    }

    // Fallback: check if wallet belongs to an active, verified client
    const client = await this.prisma.institutionClient.findFirst({
      where: {
        OR: [{ primaryWallet: wallet }, { settledWallets: { has: wallet } }],
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
      },
    });

    if (client) {
      // Populate Redis cache on miss
      try {
        await redisClient.sadd(ALLOWLIST_SET_KEY, wallet);
        await this.setWalletMetadata(wallet, {
          clientId: client.id,
          companyName: client.companyName,
          kycStatus: client.kycStatus,
          tier: client.tier,
          addedAt: new Date().toISOString(),
        });
      } catch {
        // Redis write failure is non-critical
      }
      return true;
    }

    return false;
  }

  /**
   * Add a wallet to the allowlist
   */
  async addToAllowlist(
    wallet: string,
    clientId: string,
    metadata?: Partial<AllowlistMetadata>
  ): Promise<void> {
    if (!isValidSolanaAddress(wallet)) {
      throw new Error(`Invalid Solana address: ${wallet}`);
    }

    // Verify client exists
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    // Add to Redis SET
    try {
      await redisClient.sadd(ALLOWLIST_SET_KEY, wallet);
      await this.setWalletMetadata(wallet, {
        clientId,
        companyName: client.companyName,
        kycStatus: client.kycStatus,
        tier: client.tier,
        addedAt: new Date().toISOString(),
        ...metadata,
      });
    } catch (error) {
      console.error('[AllowlistService] Redis write failed:', error);
    }

    // Ensure wallet is in client's settledWallets array
    if (!client.settledWallets.includes(wallet) && client.primaryWallet !== wallet) {
      await this.prisma.institutionClient.update({
        where: { id: clientId },
        data: {
          settledWallets: { push: wallet },
        },
      });
    }
  }

  /**
   * Remove a wallet from the allowlist
   */
  async removeFromAllowlist(wallet: string): Promise<void> {
    try {
      await redisClient.srem(ALLOWLIST_SET_KEY, wallet);
      await redisClient.del(`${ALLOWLIST_META_PREFIX}${wallet}`);
    } catch (error) {
      console.error('[AllowlistService] Redis delete failed:', error);
    }
  }

  /**
   * Get metadata for an allowlisted wallet
   */
  async getWalletMetadata(wallet: string): Promise<AllowlistMetadata | null> {
    try {
      const data = await redisClient.hgetall(`${ALLOWLIST_META_PREFIX}${wallet}`);
      if (!data || Object.keys(data).length === 0) return null;
      return data as unknown as AllowlistMetadata;
    } catch {
      return null;
    }
  }

  /**
   * List all allowlisted wallets
   */
  async listAllowlist(): Promise<string[]> {
    try {
      return await redisClient.smembers(ALLOWLIST_SET_KEY);
    } catch {
      // Fallback to Prisma
      const clients = await this.prisma.institutionClient.findMany({
        where: { status: 'ACTIVE', kycStatus: 'VERIFIED' },
        select: { primaryWallet: true, settledWallets: true },
      });

      const wallets = new Set<string>();
      for (const client of clients) {
        if (client.primaryWallet) wallets.add(client.primaryWallet);
        for (const w of client.settledWallets) wallets.add(w);
      }
      return Array.from(wallets);
    }
  }

  /**
   * Sync allowlist from Prisma to Redis (for initialization/recovery)
   */
  async syncAllowlist(): Promise<number> {
    const clients = await this.prisma.institutionClient.findMany({
      where: { status: 'ACTIVE', kycStatus: 'VERIFIED' },
    });

    let count = 0;
    for (const client of clients) {
      const wallets = [client.primaryWallet, ...client.settledWallets].filter(Boolean) as string[];

      for (const wallet of wallets) {
        await this.addToAllowlist(wallet, client.id);
        count++;
      }
    }

    return count;
  }

  private async setWalletMetadata(wallet: string, metadata: AllowlistMetadata): Promise<void> {
    const key = `${ALLOWLIST_META_PREFIX}${wallet}`;
    await redisClient.hset(key, metadata as unknown as Record<string, string>);
    await redisClient.expire(key, ALLOWLIST_META_TTL);
  }
}

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

let instance: AllowlistService | null = null;
export function getAllowlistService(): AllowlistService {
  if (!instance) {
    instance = new AllowlistService();
  }
  return instance;
}
