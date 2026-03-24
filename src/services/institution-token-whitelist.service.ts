/**
 * Institution Token Whitelist Service
 *
 * Manages the AMINA-approved token whitelist for institution escrow.
 * Validates that escrow token mints are on the approved list.
 *
 * "EasyEscrow supports AMINA's core stablecoins out-of-the-box:
 *  USDC, USDT, RLUSD, USDG, EURC, PYUSD. New assets added via
 *  policy update — no code changes needed."
 */

import { PrismaClient } from '../generated/prisma';
import { prisma as sharedPrisma } from '../config/database';

export interface ApprovedToken {
  symbol: string;
  name: string;
  mintAddress: string;
  decimals: number;
  issuer: string;
  jurisdiction: string | null;
  chain: string;
  isDefault: boolean;
  aminaApproved: boolean;
}

export class InstitutionTokenWhitelistService {
  private prisma: PrismaClient;
  // In-memory cache (refreshed on demand)
  private cache: Map<string, ApprovedToken> | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || sharedPrisma;
  }

  private async loadCache(): Promise<Map<string, ApprovedToken>> {
    if (this.cache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cache;
    }

    const tokens = await this.prisma.institutionApprovedToken.findMany({
      where: { isActive: true, aminaApproved: true },
    });

    this.cache = new Map();
    for (const t of tokens) {
      this.cache.set(t.mintAddress, {
        symbol: t.symbol,
        name: t.name,
        mintAddress: t.mintAddress,
        decimals: t.decimals,
        issuer: t.issuer,
        jurisdiction: t.jurisdiction,
        chain: t.chain,
        isDefault: t.isDefault,
        aminaApproved: t.aminaApproved,
      });
    }
    this.cacheTimestamp = Date.now();
    return this.cache;
  }

  /**
   * Check if a mint address is on the approved whitelist
   */
  async isApproved(mintAddress: string): Promise<boolean> {
    const cache = await this.loadCache();
    return cache.has(mintAddress);
  }

  /**
   * Get token metadata for a mint address (null if not approved)
   */
  async getToken(mintAddress: string): Promise<ApprovedToken | null> {
    const cache = await this.loadCache();
    return cache.get(mintAddress) || null;
  }

  /**
   * Get the default token mint address (USDC)
   */
  async getDefaultMint(): Promise<string> {
    const cache = await this.loadCache();
    for (const [mint, token] of cache) {
      if (token.isDefault) return mint;
    }
    // Fallback to env var — but only if it's on the approved whitelist
    const envMint = process.env.USDC_MINT_ADDRESS;
    if (envMint && cache.has(envMint)) return envMint;
    throw new Error('No default token configured');
  }

  /**
   * List all active approved tokens
   */
  async listApprovedTokens(): Promise<ApprovedToken[]> {
    const cache = await this.loadCache();
    return Array.from(cache.values());
  }

  /**
   * Validate a mint address and return its metadata, or throw
   */
  async validateMint(mintAddress: string): Promise<ApprovedToken> {
    const token = await this.getToken(mintAddress);
    if (!token) {
      const approved = await this.listApprovedTokens();
      const symbols = approved.map((t) => t.symbol).join(', ');
      throw new Error(
        `Token mint ${mintAddress} is not on the approved whitelist. Supported tokens: ${symbols}`
      );
    }
    return token;
  }

  /** Clear the in-memory cache (e.g. after adding a new token) */
  clearCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
  }
}

// Singleton
let instance: InstitutionTokenWhitelistService | null = null;

export function getTokenWhitelistService(): InstitutionTokenWhitelistService {
  if (!instance) {
    instance = new InstitutionTokenWhitelistService();
  }
  return instance;
}
