/**
 * Institution Account Service
 *
 * Multi-account management for institutional clients.
 * Each client can have up to 10 accounts (Treasury, Operations, Settlement, etc.)
 * with per-account wallet, verification, limits, and settings.
 *
 * Balance is fetched live from Solana RPC (SOL + USDC), cached in Redis (30s TTL).
 */

import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { Connection, PublicKey } from '@solana/web3.js';
import { isValidSolanaAddress } from '../models/validators/solana.validator';
import { getSolanaService } from './solana.service';
import { getInstitutionEscrowConfig } from '../config/institution-escrow.config';
import type {
  PrismaClient,
  Prisma,
  InstitutionAccountType,
  AccountVerificationStatus,
  ApprovalMode,
} from '../generated/prisma';

const MAX_ACCOUNTS_PER_CLIENT = 10;
const BALANCE_CACHE_TTL = 30; // seconds
const BALANCE_CACHE_PREFIX = 'institution:account:balance:';

// Fields allowed to be updated
const ALLOWED_UPDATE_FIELDS = [
  'label',
  'description',
  'walletProvider',
  'custodyType',
  'maxTransactionAmount',
  'minTransactionAmount',
  'dailyVolumeLimit',
  'monthlyVolumeLimit',
  'dailyTransactionCountLimit',
  'monthlyTransactionCountLimit',
  'approvalMode',
  'approvalThreshold',
  'whitelistedAddresses',
  'whitelistEnforced',
  'notificationEmail',
  'webhookUrl',
  'notifyOnEscrowCreated',
  'notifyOnEscrowFunded',
  'notifyOnEscrowReleased',
  'notifyOnComplianceAlert',
] as const;

interface CreateAccountInput {
  name: string;
  label?: string;
  accountType?: InstitutionAccountType;
  description?: string;
  walletAddress: string;
  chain?: string;
  walletProvider?: string;
  custodyType?: string;
  notificationEmail?: string;
  webhookUrl?: string;
}

interface ListAccountsFilters {
  accountType?: InstitutionAccountType;
  verificationStatus?: AccountVerificationStatus;
  isActive?: boolean;
}

interface TokenBalance {
  symbol: string;
  name: string;
  balance: number;
  mintAddress: string;
}

interface AccountBalance {
  sol: number;
  usdc: number;
  tokens: TokenBalance[];
  lastUpdated: string;
}

export class InstitutionAccountService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async createAccount(clientId: string, data: CreateAccountInput) {
    // Validate wallet address
    if (!isValidSolanaAddress(data.walletAddress)) {
      throw new Error(`Invalid Solana address: ${data.walletAddress}`);
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Account name is required');
    }

    // Check max accounts limit
    const existingCount = await this.prisma.institutionAccount.count({
      where: { clientId, isActive: true },
    });

    if (existingCount >= MAX_ACCOUNTS_PER_CLIENT) {
      throw new Error(`Maximum of ${MAX_ACCOUNTS_PER_CLIENT} accounts per client`);
    }

    // Check name uniqueness (enforced by DB constraint too, but better error message)
    const existing = await this.prisma.institutionAccount.findUnique({
      where: { clientId_name: { clientId, name: data.name.trim() } },
    });

    if (existing) {
      throw new Error(`Account with name "${data.name.trim()}" already exists`);
    }

    // If this is the first account, make it default
    const isFirst = existingCount === 0;

    const account = await this.prisma.institutionAccount.create({
      data: {
        clientId,
        name: data.name.trim(),
        label: data.label?.trim() || null,
        accountType: data.accountType || 'GENERAL',
        description: data.description?.trim() || null,
        walletAddress: data.walletAddress,
        chain: data.chain || 'solana',
        walletProvider: data.walletProvider || null,
        custodyType: (data.custodyType as any) || null,
        notificationEmail: data.notificationEmail || null,
        webhookUrl: data.webhookUrl || null,
        isDefault: isFirst,
      },
    });

    return account;
  }

  async getAccount(clientId: string, accountId: string) {
    const account = await this.prisma.institutionAccount.findFirst({
      where: { id: accountId, clientId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Fetch live balance
    const balance = await this.getAccountBalance(account.walletAddress);

    return { ...account, balance };
  }

  async listAccounts(clientId: string, filters?: ListAccountsFilters) {
    const where: Prisma.InstitutionAccountWhereInput = { clientId };

    if (filters?.accountType) {
      where.accountType = filters.accountType;
    }
    if (filters?.verificationStatus) {
      where.verificationStatus = filters.verificationStatus;
    }
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const accounts = await this.prisma.institutionAccount.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return accounts;
  }

  async updateAccount(clientId: string, accountId: string, data: Record<string, any>) {
    const account = await this.prisma.institutionAccount.findFirst({
      where: { id: accountId, clientId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Filter to only allowed fields
    const filteredUpdates: Record<string, any> = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (field in data) {
        filteredUpdates[field] = data[field];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Validate whitelistedAddresses if provided
    if (filteredUpdates.whitelistedAddresses) {
      if (!Array.isArray(filteredUpdates.whitelistedAddresses)) {
        throw new Error('whitelistedAddresses must be an array');
      }
      for (const addr of filteredUpdates.whitelistedAddresses) {
        if (!isValidSolanaAddress(addr)) {
          throw new Error(`Invalid Solana address in whitelist: ${addr}`);
        }
      }
    }

    const updated = await this.prisma.institutionAccount.update({
      where: { id: accountId },
      data: filteredUpdates,
    });

    return updated;
  }

  async deleteAccount(clientId: string, accountId: string) {
    const account = await this.prisma.institutionAccount.findFirst({
      where: { id: accountId, clientId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    if (account.isDefault) {
      throw new Error(
        'Cannot deactivate the default account. Set another account as default first.'
      );
    }

    const updated = await this.prisma.institutionAccount.update({
      where: { id: accountId },
      data: { isActive: false },
    });

    return updated;
  }

  async setDefaultAccount(clientId: string, accountId: string) {
    const account = await this.prisma.institutionAccount.findFirst({
      where: { id: accountId, clientId, isActive: true },
    });

    if (!account) {
      throw new Error('Account not found or inactive');
    }

    // Unset all others, set this one
    await this.prisma.$transaction([
      this.prisma.institutionAccount.updateMany({
        where: { clientId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.institutionAccount.update({
        where: { id: accountId },
        data: { isDefault: true },
      }),
    ]);

    return this.prisma.institutionAccount.findUnique({ where: { id: accountId } });
  }

  async getAccountBalance(walletAddress: string): Promise<AccountBalance> {
    // Check Redis cache first
    const cacheKey = `${BALANCE_CACHE_PREFIX}${walletAddress}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable, proceed without cache
    }

    let solBalance = 0;
    let usdcBalance = 0;
    const tokens: TokenBalance[] = [];

    try {
      const solanaService = getSolanaService();
      const connection = solanaService.getConnection();
      const pubkey = new PublicKey(walletAddress);

      // Fetch SOL balance
      const lamports = await connection.getBalance(pubkey);
      solBalance = lamports / 1e9; // lamports to SOL

      // Fetch all approved token balances
      const approvedTokens = await this.prisma.institutionApprovedToken.findMany({
        where: { isActive: true },
        select: { symbol: true, name: true, mintAddress: true, decimals: true },
      });

      for (const token of approvedTokens) {
        // Skip tokens with pending/placeholder mint addresses
        if (!isValidSolanaAddress(token.mintAddress)) continue;

        try {
          const mint = new PublicKey(token.mintAddress);
          const tokenAccounts = await connection.getTokenAccountsByOwner(pubkey, { mint });

          let tokenBalance = 0;
          for (const { account } of tokenAccounts.value) {
            // Token account data layout: first 32 bytes mint, next 32 bytes owner,
            // then 8 bytes amount (u64 little-endian)
            const data = account.data;
            const amount = data.readBigUInt64LE(64);
            tokenBalance += Number(amount) / 10 ** token.decimals;
          }

          if (tokenBalance > 0) {
            tokens.push({
              symbol: token.symbol,
              name: token.name,
              balance: tokenBalance,
              mintAddress: token.mintAddress,
            });
          }

          // Keep USDC in the top-level field for backwards compatibility
          if (token.symbol === 'USDC') {
            usdcBalance = tokenBalance;
          }
        } catch {
          // Token account may not exist for this wallet — skip
        }
      }
    } catch (err) {
      console.error(
        `Balance fetch RPC error for ${walletAddress}:`,
        err instanceof Error ? err.message : err
      );
      // Return zeros — caller sees stale/empty balance rather than a hard failure
    }

    const balance: AccountBalance = {
      sol: solBalance,
      usdc: usdcBalance,
      tokens,
      lastUpdated: new Date().toISOString(),
    };

    // Cache in Redis
    try {
      await redisClient.set(cacheKey, JSON.stringify(balance), 'EX', BALANCE_CACHE_TTL);
    } catch {
      // Redis unavailable — skip cache
    }

    return balance;
  }
}

// Singleton
let _instance: InstitutionAccountService | null = null;

export function getInstitutionAccountService(): InstitutionAccountService {
  if (!_instance) {
    _instance = new InstitutionAccountService();
  }
  return _instance;
}
