import { prisma } from '../config/database';
import * as crypto from 'crypto';
import type { PrismaClient } from '../generated/prisma';

/**
 * Validates a Solana wallet address (base58 format, 32-44 characters)
 */
function isValidSolanaAddress(address: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

// Fields allowed to be updated via updateSettings
const ALLOWED_SETTINGS_FIELDS = [
  'defaultCorridor',
  'defaultCurrency',
  'notificationEmail',
  'webhookUrl',
  'webhookSecret',
  'timezone',
  'autoApproveThreshold',
] as const;

export class InstitutionClientSettingsService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Get settings for a client, creating defaults if none exist
   */
  async getSettings(clientId: string) {
    return this.prisma.institutionClientSettings.upsert({
      where: { clientId },
      create: { clientId, defaultCurrency: 'USDC', timezone: 'UTC' },
      update: {},
    });
  }

  /**
   * Update settings for a client (only allowed fields)
   */
  async updateSettings(clientId: string, updates: Record<string, any>) {
    // Filter to only allowed fields
    const filteredUpdates: Record<string, any> = {};
    for (const field of ALLOWED_SETTINGS_FIELDS) {
      if (field in updates) {
        filteredUpdates[field] = updates[field];
      }
    }

    const settings = await this.prisma.institutionClientSettings.upsert({
      where: { clientId },
      update: filteredUpdates,
      create: {
        clientId,
        defaultCurrency: 'USDC',
        timezone: 'UTC',
        ...filteredUpdates,
      },
    });

    return settings;
  }

  /**
   * Update wallet addresses for a client (legacy flat wallet method)
   * Validates Solana address format before persisting
   */
  async updateWallets(
    clientId: string,
    wallets: { primaryWallet?: string; settlementWallet?: string }
  ) {
    if (wallets.primaryWallet && !isValidSolanaAddress(wallets.primaryWallet)) {
      throw new Error(
        `Invalid Solana address for primaryWallet: ${wallets.primaryWallet}`
      );
    }
    if (
      wallets.settlementWallet &&
      !isValidSolanaAddress(wallets.settlementWallet)
    ) {
      throw new Error(
        `Invalid Solana address for settlementWallet: ${wallets.settlementWallet}`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (wallets.primaryWallet) {
        const existingClient = await tx.institutionClient.findUnique({
          where: { id: clientId },
          select: { settledWallets: true },
        });
        const settledWallets = existingClient?.settledWallets || [];
        const updatedSettledWallets = settledWallets.includes(wallets.primaryWallet)
          ? settledWallets
          : [...settledWallets, wallets.primaryWallet];

        await tx.institutionClient.update({
          where: { id: clientId },
          data: {
            primaryWallet: wallets.primaryWallet,
            settledWallets: updatedSettledWallets,
          },
        });
      }

      if (wallets.settlementWallet) {
        await tx.institutionClientSettings.upsert({
          where: { clientId },
          update: { settlementAuthorityWallet: wallets.settlementWallet },
          create: {
            clientId,
            defaultCurrency: 'USDC',
            timezone: 'UTC',
            settlementAuthorityWallet: wallets.settlementWallet,
          },
        });
      }

      return tx.institutionClient.findUnique({
        where: { id: clientId },
        include: { settings: true },
      });
    });
  }

  /**
   * Add or update a wallet in the InstitutionWallet model
   */
  async addOrUpdateWallet(
    clientId: string,
    data: {
      id?: string;
      name: string;
      address: string;
      chain?: string;
      description?: string;
      provider?: string;
      isPrimary?: boolean;
      isSettlement?: boolean;
    },
  ) {
    if (!data.name || !data.address) {
      throw new Error('name and address are required');
    }

    if (!isValidSolanaAddress(data.address)) {
      throw new Error(`Invalid wallet address: ${data.address}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // If setting as primary, unset other primaries
      if (data.isPrimary) {
        await tx.institutionWallet.updateMany({
          where: { clientId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      // If setting as settlement, unset other settlements
      if (data.isSettlement) {
        await tx.institutionWallet.updateMany({
          where: { clientId, isSettlement: true },
          data: { isSettlement: false },
        });
      }

      if (data.id) {
        // Update existing wallet
        const existing = await tx.institutionWallet.findUnique({
          where: { id: data.id },
        });
        if (!existing || existing.clientId !== clientId) {
          throw new Error('Wallet not found');
        }
        return tx.institutionWallet.update({
          where: { id: data.id },
          data: {
            name: data.name,
            address: data.address,
            chain: data.chain || 'solana',
            description: data.description,
            provider: data.provider,
            isPrimary: data.isPrimary ?? false,
            isSettlement: data.isSettlement ?? false,
          },
        });
      } else {
        // Create new wallet
        return tx.institutionWallet.create({
          data: {
            clientId,
            name: data.name,
            address: data.address,
            chain: data.chain || 'solana',
            description: data.description,
            provider: data.provider,
            isPrimary: data.isPrimary ?? false,
            isSettlement: data.isSettlement ?? false,
          },
        });
      }
    });
  }

  /**
   * List all wallets for a client
   */
  async listWallets(clientId: string) {
    return this.prisma.institutionWallet.findMany({
      where: { clientId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Delete a wallet belonging to a client
   */
  async deleteWallet(clientId: string, walletId: string) {
    const wallet = await this.prisma.institutionWallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet || wallet.clientId !== clientId) {
      throw new Error('Wallet not found');
    }

    await this.prisma.institutionWallet.delete({
      where: { id: walletId },
    });

    return { success: true };
  }

  /**
   * Generate a new API key for a client
   * Returns the raw key only once at creation time
   */
  async generateApiKey(
    clientId: string,
    name: string,
    permissions: string[]
  ) {
    const rawKey = `inst_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.institutionApiKey.create({
      data: {
        clientId,
        keyHash,
        name,
        permissions,
        active: true,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      permissions: apiKey.permissions,
      active: apiKey.active,
      createdAt: apiKey.createdAt,
    };
  }

  /**
   * Revoke an API key (set active = false)
   * Verifies the key belongs to the specified client
   */
  async revokeApiKey(clientId: string, keyId: string) {
    const apiKey = await this.prisma.institutionApiKey.findUnique({
      where: { id: keyId },
    });

    if (!apiKey) {
      throw new Error(`API key not found: ${keyId}`);
    }

    if (apiKey.clientId !== clientId) {
      throw new Error('API key does not belong to this client');
    }

    await this.prisma.institutionApiKey.update({
      where: { id: keyId },
      data: { active: false },
    });

    return { success: true };
  }

  /**
   * List all API keys for a client (without exposing keyHash)
   */
  async listApiKeys(clientId: string) {
    const keys = await this.prisma.institutionApiKey.findMany({
      where: { clientId },
      select: {
        id: true,
        name: true,
        permissions: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys;
  }
}

// Singleton instance
let instance: InstitutionClientSettingsService | null = null;

export function getInstitutionClientSettingsService(): InstitutionClientSettingsService {
  if (!instance) {
    instance = new InstitutionClientSettingsService();
  }
  return instance;
}
