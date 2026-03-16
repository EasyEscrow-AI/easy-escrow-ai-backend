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
    let settings = await this.prisma.institutionClientSettings.findUnique({
      where: { clientId },
    });

    if (!settings) {
      settings = await this.prisma.institutionClientSettings.create({
        data: {
          clientId,
          defaultCurrency: 'USDC',
          timezone: 'UTC',
        },
      });
    }

    return settings;
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
   * Update wallet addresses for a client
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

    // Update InstitutionClient.primaryWallet if provided
    if (wallets.primaryWallet) {
      const existingClient = await this.prisma.institutionClient.findUnique({
        where: { id: clientId },
        select: { settledWallets: true },
      });

      const settledWallets = existingClient?.settledWallets || [];
      const updatedSettledWallets = settledWallets.includes(
        wallets.primaryWallet
      )
        ? settledWallets
        : [...settledWallets, wallets.primaryWallet];

      await this.prisma.institutionClient.update({
        where: { id: clientId },
        data: {
          primaryWallet: wallets.primaryWallet,
          settledWallets: updatedSettledWallets,
        },
      });
    }

    // Update settlementAuthorityWallet if settlementWallet provided
    if (wallets.settlementWallet) {
      await this.prisma.institutionClientSettings.upsert({
        where: { clientId },
        update: {
          settlementAuthorityWallet: wallets.settlementWallet,
        },
        create: {
          clientId,
          defaultCurrency: 'USDC',
          timezone: 'UTC',
          settlementAuthorityWallet: wallets.settlementWallet,
        },
      });
    }

    // Return the updated client with settings
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: clientId },
      include: { settings: true },
    });

    return client;
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
