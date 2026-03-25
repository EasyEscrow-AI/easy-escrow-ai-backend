/**
 * Institution Account Service
 *
 * Multi-account management for institutional clients.
 * Each client can have up to 10 accounts (Treasury, Operations, Settlement, etc.)
 * with per-account wallet, verification, limits, and settings.
 *
 * Balance is fetched live from Solana RPC (SOL + approved tokens), cached in Redis (5-min TTL).
 * On staging/devnet, token mints are overridden via env vars so balances resolve correctly.
 */

import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { Connection, PublicKey } from '@solana/web3.js';
import { isValidSolanaAddress } from '../models/validators/solana.validator';
import { getSolanaService } from './solana.service';
import { getInstitutionEscrowConfig } from '../config/institution-escrow.config';
import { getEffectiveMint, normalizeSymbol } from '../utils/token-env-mapping';
import { isPrivacyEnabled } from '../utils/featureFlags';
import { getStealthAddressService } from './privacy/stealth-address.service';
import type {
  PrismaClient,
  Prisma,
  InstitutionAccountType,
  AccountVerificationStatus,
  ApprovalMode,
} from '../generated/prisma';

const MAX_ACCOUNTS_PER_CLIENT = 10;
const BALANCE_CACHE_TTL = 300; // 5 minutes — balance refreshable via POST /refresh-balance
const BALANCE_CACHE_PREFIX = 'institution:account:balance:';

const VALID_ACCOUNT_TYPES: InstitutionAccountType[] = [
  'TREASURY',
  'OPERATIONS',
  'SETTLEMENT',
  'COLLATERAL',
  'GENERAL',
];

// Fields allowed to be updated
const ALLOWED_UPDATE_FIELDS = [
  'label',
  'accountType',
  'walletAddress',
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

// Fields exposed in the per-account settings view
const ACCOUNT_SETTINGS_FIELDS = [
  'defaultCurrency',
  'notifyOnEscrowCreated',
  'notifyOnEscrowFunded',
  'notifyOnEscrowReleased',
  'notifyOnComplianceAlert',
  'notificationEmail',
  'webhookUrl',
  'approvalMode',
  'approvalThreshold',
  'whitelistEnforced',
  'isActive',
] as const;

const VALID_CURRENCIES = ['USDC', 'USDT', 'EURC'] as const;

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
  branchId?: string;
  includeBalances?: boolean;
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

    // Auto-generate stealth meta-address for the account (privacy-by-default)
    if (isPrivacyEnabled()) {
      try {
        const stealthService = getStealthAddressService();
        const meta = await stealthService.registerMetaAddress(clientId, `account:${account.id}`);
        await this.prisma.institutionAccount.update({
          where: { id: account.id },
          data: { stealthMetaAddressId: meta.id },
        });
        console.log(
          `[InstitutionAccount] Auto-generated stealth meta-address ${meta.id} for account ${account.id}`
        );
      } catch (error) {
        // Non-critical: account still works without stealth
        console.warn('[InstitutionAccount] Failed to auto-generate stealth meta-address:', error);
      }
    }

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
    if (filters?.branchId) {
      where.branchId = filters.branchId;
    }

    const accounts = await this.prisma.institutionAccount.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    // Only fetch balances when explicitly requested (expensive: N RPC calls)
    if (!filters?.includeBalances) {
      return accounts;
    }

    const accountsWithBalances = await Promise.all(
      accounts.map(async (account) => {
        try {
          const balance = await this.getAccountBalance(account.walletAddress);
          return { ...account, balance };
        } catch {
          return {
            ...account,
            balance: { sol: 0, usdc: 0, tokens: [], lastUpdated: new Date().toISOString() },
          };
        }
      })
    );

    return accountsWithBalances;
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

    // Validate accountType if provided
    if (filteredUpdates.accountType) {
      if (!VALID_ACCOUNT_TYPES.includes(filteredUpdates.accountType)) {
        throw new Error(
          `Invalid accountType. Must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`
        );
      }
    }

    // Validate walletAddress if provided; reset verification when changed
    if (filteredUpdates.walletAddress !== undefined) {
      if (!isValidSolanaAddress(filteredUpdates.walletAddress)) {
        throw new Error('Invalid Solana wallet address');
      }
      if (filteredUpdates.walletAddress !== account.walletAddress) {
        filteredUpdates.verificationStatus = 'PENDING';
      }
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

  async getClientProfile(clientId: string) {
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        companyName: true,
        legalName: true,
        tradingName: true,
        tier: true,
        status: true,
        kycStatus: true,
        kybStatus: true,
        jurisdiction: true,
        entityType: true,
        registrationNumber: true,
        registrationCountry: true,
        industry: true,
        websiteUrl: true,
        businessDescription: true,
        yearEstablished: true,
        contactFirstName: true,
        contactLastName: true,
        contactEmail: true,
        contactTitle: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        riskRating: true,
        isRegulatedEntity: true,
        regulatoryStatus: true,
        licenseType: true,
        regulatoryBody: true,
        accountManagerName: true,
        accountManagerEmail: true,
        onboardingCompletedAt: true,
        nextReviewDate: true,
        createdAt: true,
        updatedAt: true,
        settings: {
          select: {
            defaultCurrency: true,
            defaultCorridor: true,
            timezone: true,
            emailNotifications: true,
            language: true,
            theme: true,
            twoFactorEnabled: true,
            aiRecommendations: true,
            riskTolerance: true,
            defaultToken: true,
          },
        },
        accounts: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            label: true,
            accountType: true,
            walletAddress: true,
            verificationStatus: true,
            defaultCurrency: true,
            isDefault: true,
            isActive: true,
          },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!client) {
      throw new Error('Client not found');
    }

    return client;
  }

  async getAccountSettings(clientId: string, accountId: string) {
    const account = await this.prisma.institutionAccount.findFirst({
      where: { id: accountId, clientId },
      select: {
        id: true,
        name: true,
        label: true,
        accountType: true,
        defaultCurrency: true,
        isActive: true,
        isDefault: true,
        notifyOnEscrowCreated: true,
        notifyOnEscrowFunded: true,
        notifyOnEscrowReleased: true,
        notifyOnComplianceAlert: true,
        notificationEmail: true,
        webhookUrl: true,
        approvalMode: true,
        approvalThreshold: true,
        whitelistEnforced: true,
      },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    return account;
  }

  async updateAccountSettings(clientId: string, accountId: string, data: Record<string, any>) {
    const account = await this.prisma.institutionAccount.findFirst({
      where: { id: accountId, clientId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Filter to only settings fields
    const updates: Record<string, any> = {};
    for (const field of ACCOUNT_SETTINGS_FIELDS) {
      if (field in data) {
        updates[field] = data[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('No valid settings fields to update');
    }

    // Validate defaultCurrency
    if (updates.defaultCurrency) {
      const currency = updates.defaultCurrency.toUpperCase();
      if (!VALID_CURRENCIES.includes(currency as any)) {
        throw new Error(
          `Invalid currency: ${updates.defaultCurrency}. Supported: ${VALID_CURRENCIES.join(', ')}`
        );
      }
      updates.defaultCurrency = currency;
    }

    // Validate boolean toggles
    const booleanFields = [
      'notifyOnEscrowCreated',
      'notifyOnEscrowFunded',
      'notifyOnEscrowReleased',
      'notifyOnComplianceAlert',
      'whitelistEnforced',
      'isActive',
    ];
    for (const field of booleanFields) {
      if (field in updates && typeof updates[field] !== 'boolean') {
        throw new Error(`${field} must be a boolean`);
      }
    }

    // Prevent deactivating default account
    if (updates.isActive === false && account.isDefault) {
      throw new Error(
        'Cannot deactivate the default account. Set another account as default first.'
      );
    }

    const updated = await this.prisma.institutionAccount.update({
      where: { id: accountId },
      data: updates,
    });

    return updated;
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
        // Use env-configured mint for staging/devnet (DB has mainnet mints)
        const mintAddress = getEffectiveMint(token.symbol, token.mintAddress);

        // Skip tokens with pending/placeholder mint addresses
        if (!isValidSolanaAddress(mintAddress)) continue;

        try {
          const mint = new PublicKey(mintAddress);
          const tokenAccounts = await connection.getTokenAccountsByOwner(pubkey, { mint });

          let tokenBalance = 0;
          for (const { account } of tokenAccounts.value) {
            // Token account data layout: first 32 bytes mint, next 32 bytes owner,
            // then 8 bytes amount (u64 little-endian)
            const data = account.data;
            const amount = data.readBigUInt64LE(64);
            tokenBalance += Number(amount) / 10 ** token.decimals;
          }

          // Always return canonical symbol (USDC not USDC-DEV)
          const displaySymbol = normalizeSymbol(token.symbol);

          if (tokenBalance > 0) {
            tokens.push({
              symbol: displaySymbol,
              name: token.name,
              balance: tokenBalance,
              mintAddress,
            });
          }

          // Keep USDC in the top-level field for backwards compatibility
          if (displaySymbol === 'USDC') {
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

  async refreshAccountBalance(clientId: string, accountId: string) {
    const account = await this.prisma.institutionAccount.findFirst({
      where: { id: accountId, clientId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Bust cache, then fetch fresh from RPC
    const cacheKey = `${BALANCE_CACHE_PREFIX}${account.walletAddress}`;
    try {
      await redisClient.del(cacheKey);
    } catch {
      // Redis unavailable — fetch will still work
    }

    const balance = await this.getAccountBalance(account.walletAddress);
    return { ...account, balance };
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
