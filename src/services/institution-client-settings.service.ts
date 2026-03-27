import { prisma } from '../config/database';
import * as crypto from 'crypto';
import type { PrismaClient } from '../generated/prisma';
import { isValidSolanaAddress } from '../models/validators/solana.validator';
import { PROTOCOL_FEE_LIMITS } from '../config/institution-escrow.config';

// Fields allowed to be updated via updateSettings
const ALLOWED_SETTINGS_FIELDS = [
  'defaultCorridor',
  'defaultCurrency',
  'notificationEmail',
  'webhookUrl',
  'webhookSecret',
  'timezone',
  'autoApproveThreshold',
  'manualReviewThreshold',
  'autoTravelRule',
  'activeSanctionsLists',
  'aiAutoRelease',
  'riskTolerance',
  'defaultToken',
  'emailNotifications',
  'language',
  'theme',
  'twoFactorEnabled',
  'aiRecommendations',
  'feeBps',
  'minFeeUsdc',
  'maxFeeUsdc',
  'notificationPreferences',
  'poolDefaultSettlementMode',
  'poolDefaultExpiryHours',
  'poolMaxMembers',
] as const;

const DEFAULT_NOTIFICATION_PREFERENCES = [
  { event: 'payment_created', inApp: true, email: true, sms: false },
  { event: 'payment_requires_approval', inApp: true, email: true, sms: false },
  { event: 'payment_compliance_hold', inApp: true, email: true, sms: false },
  { event: 'payment_gate_hold', inApp: true, email: true, sms: false },
  { event: 'payment_settled', inApp: true, email: true, sms: false },
  { event: 'payment_expired', inApp: true, email: true, sms: false },
  { event: 'payment_cancelled', inApp: true, email: true, sms: false },
  { event: 'payment_failed', inApp: true, email: true, sms: false },
];

export class InstitutionClientSettingsService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Get settings for a client, creating defaults if none exist.
   * Merges fields from InstitutionClient (tier, jurisdiction, kycStatus)
   * and maps field names to match frontend expectations.
   */
  async getSettings(clientId: string) {
    const [settings, client] = await Promise.all([
      this.prisma.institutionClientSettings.upsert({
        where: { clientId },
        create: { clientId, defaultCurrency: 'USDC', timezone: 'UTC' },
        update: {},
      }),
      this.prisma.institutionClient.findUnique({
        where: { id: clientId },
        select: { tier: true, jurisdiction: true, kycStatus: true },
      }),
    ]);

    const notificationPrefs = (settings.notificationPreferences as any[]) || DEFAULT_NOTIFICATION_PREFERENCES;

    return {
      institution: {
        tier: client?.tier ?? null,
        jurisdiction: client?.jurisdiction ?? null,
        kycStatus: client?.kycStatus ?? null,
      },
      preferences: {
        language: settings.language ?? 'en',
        timezone: settings.timezone,
        theme: settings.theme ?? 'light',
        defaultCurrency: settings.defaultCurrency,
      },
      security: {
        twoFactorEnabled: settings.twoFactorEnabled,
      },
      compliance: {
        autoTravelRule: settings.autoTravelRule,
        sanctionsLists: settings.activeSanctionsLists,
        manualReviewThreshold: settings.manualReviewThreshold ? String(settings.manualReviewThreshold) : null,
      },
      ai: {
        recommendations: settings.aiRecommendations,
        autoRelease: settings.aiAutoRelease,
        riskTolerance: settings.riskTolerance,
      },
      wallet: {
        defaultToken: settings.defaultToken,
        feeBps: settings.feeBps,
        minFeeUsdc: settings.minFeeUsdc ? Number(settings.minFeeUsdc) : 0.2,
        maxFeeUsdc: settings.maxFeeUsdc ? Number(settings.maxFeeUsdc) : 20.0,
      },
      notifications: {
        emailEnabled: settings.emailNotifications,
        preferences: notificationPrefs,
      },
      integration: {
        webhookUrl: settings.webhookUrl,
      },
    };
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

    // Validate new settings fields
    if ('manualReviewThreshold' in filteredUpdates) {
      const v = filteredUpdates.manualReviewThreshold;
      if (v !== null && (typeof v !== 'number' || v < 0)) {
        throw new Error('manualReviewThreshold must be a non-negative number or null');
      }
    }
    if (
      'autoTravelRule' in filteredUpdates &&
      typeof filteredUpdates.autoTravelRule !== 'boolean'
    ) {
      throw new Error('autoTravelRule must be a boolean');
    }
    if ('aiAutoRelease' in filteredUpdates && typeof filteredUpdates.aiAutoRelease !== 'boolean') {
      throw new Error('aiAutoRelease must be a boolean');
    }
    if (
      'emailNotifications' in filteredUpdates &&
      typeof filteredUpdates.emailNotifications !== 'boolean'
    ) {
      throw new Error('emailNotifications must be a boolean');
    }
    if ('riskTolerance' in filteredUpdates) {
      if (!['low', 'medium', 'high'].includes(filteredUpdates.riskTolerance)) {
        throw new Error('riskTolerance must be one of: low, medium, high');
      }
    }
    if ('activeSanctionsLists' in filteredUpdates) {
      const v = filteredUpdates.activeSanctionsLists;
      if (!Array.isArray(v) || v.length === 0 || !v.every((s: any) => typeof s === 'string')) {
        throw new Error('activeSanctionsLists must be a non-empty array of strings');
      }
    }
    if ('defaultToken' in filteredUpdates) {
      if (
        typeof filteredUpdates.defaultToken !== 'string' ||
        filteredUpdates.defaultToken.trim().length === 0
      ) {
        throw new Error('defaultToken must be a non-empty string');
      }
    }
    if ('language' in filteredUpdates) {
      const valid = ['en', 'de', 'fr', 'ar', 'zh', 'es'];
      if (filteredUpdates.language !== null && !valid.includes(filteredUpdates.language)) {
        throw new Error(`language must be one of: ${valid.join(', ')} (or null)`);
      }
    }
    if ('theme' in filteredUpdates) {
      const valid = ['light', 'dark', 'system'];
      if (filteredUpdates.theme !== null && !valid.includes(filteredUpdates.theme)) {
        throw new Error('theme must be one of: light, dark, system (or null)');
      }
    }
    if (
      'twoFactorEnabled' in filteredUpdates &&
      typeof filteredUpdates.twoFactorEnabled !== 'boolean'
    ) {
      throw new Error('twoFactorEnabled must be a boolean');
    }
    if (
      'aiRecommendations' in filteredUpdates &&
      typeof filteredUpdates.aiRecommendations !== 'boolean'
    ) {
      throw new Error('aiRecommendations must be a boolean');
    }
    if ('notificationPreferences' in filteredUpdates) {
      const v = filteredUpdates.notificationPreferences;
      if (!Array.isArray(v) || v.length === 0) {
        throw new Error('notificationPreferences must be a non-empty array');
      }
      const validEvents = [
        'payment_created', 'payment_requires_approval', 'payment_compliance_hold',
        'payment_gate_hold', 'payment_settled', 'payment_expired',
        'payment_cancelled', 'payment_failed',
      ];
      for (const pref of v) {
        if (!pref.event || !validEvents.includes(pref.event)) {
          throw new Error(`Invalid notification event: ${pref.event}`);
        }
        if (typeof pref.inApp !== 'boolean' || typeof pref.email !== 'boolean' || typeof pref.sms !== 'boolean') {
          throw new Error('Each notification preference must have boolean inApp, email, and sms fields');
        }
      }
    }
    if ('feeBps' in filteredUpdates) {
      const v = filteredUpdates.feeBps;
      if (
        typeof v !== 'number' ||
        !Number.isInteger(v) ||
        v < PROTOCOL_FEE_LIMITS.MIN_FEE_BPS ||
        v > PROTOCOL_FEE_LIMITS.MAX_FEE_BPS
      ) {
        throw new Error(
          `feeBps must be an integer between ${PROTOCOL_FEE_LIMITS.MIN_FEE_BPS} and ${PROTOCOL_FEE_LIMITS.MAX_FEE_BPS}`
        );
      }
    }
    if ('minFeeUsdc' in filteredUpdates) {
      const v = filteredUpdates.minFeeUsdc;
      if (typeof v !== 'number' || v < PROTOCOL_FEE_LIMITS.MIN_FEE_USDC) {
        throw new Error(`minFeeUsdc must be at least ${PROTOCOL_FEE_LIMITS.MIN_FEE_USDC}`);
      }
    }
    if ('maxFeeUsdc' in filteredUpdates) {
      const v = filteredUpdates.maxFeeUsdc;
      if (typeof v !== 'number' || v > PROTOCOL_FEE_LIMITS.MAX_FEE_USDC) {
        throw new Error(`maxFeeUsdc must be at most ${PROTOCOL_FEE_LIMITS.MAX_FEE_USDC}`);
      }
    }
    if ('minFeeUsdc' in filteredUpdates && 'maxFeeUsdc' in filteredUpdates) {
      if (filteredUpdates.minFeeUsdc > filteredUpdates.maxFeeUsdc) {
        throw new Error(
          `minFeeUsdc (${filteredUpdates.minFeeUsdc}) must not exceed maxFeeUsdc (${filteredUpdates.maxFeeUsdc})`
        );
      }
    }
    if ('poolDefaultSettlementMode' in filteredUpdates) {
      const valid = ['SEQUENTIAL', 'PARALLEL'];
      if (!valid.includes(filteredUpdates.poolDefaultSettlementMode)) {
        throw new Error(`poolDefaultSettlementMode must be one of: ${valid.join(', ')}`);
      }
    }
    if ('poolDefaultExpiryHours' in filteredUpdates) {
      const v = filteredUpdates.poolDefaultExpiryHours;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 2160) {
        throw new Error('poolDefaultExpiryHours must be a positive integer between 1 and 2160');
      }
    }
    if ('poolMaxMembers' in filteredUpdates) {
      const v = filteredUpdates.poolMaxMembers;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 100) {
        throw new Error('poolMaxMembers must be a positive integer between 1 and 100');
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
      throw new Error(`Invalid Solana address for primaryWallet: ${wallets.primaryWallet}`);
    }
    if (wallets.settlementWallet && !isValidSolanaAddress(wallets.settlementWallet)) {
      throw new Error(`Invalid Solana address for settlementWallet: ${wallets.settlementWallet}`);
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
    }
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

      let wallet;
      if (data.id) {
        // Update existing wallet — preserve flags when caller omits them
        const existing = await tx.institutionWallet.findUnique({
          where: { id: data.id },
        });
        if (!existing || existing.clientId !== clientId) {
          throw new Error('Wallet not found');
        }
        wallet = await tx.institutionWallet.update({
          where: { id: data.id },
          data: {
            name: data.name,
            address: data.address,
            chain: data.chain || existing.chain,
            description: data.description !== undefined ? data.description : existing.description,
            provider: data.provider !== undefined ? data.provider : existing.provider,
            isPrimary: data.isPrimary !== undefined ? data.isPrimary : existing.isPrimary,
            isSettlement:
              data.isSettlement !== undefined ? data.isSettlement : existing.isSettlement,
          },
        });
      } else {
        // Create new wallet
        wallet = await tx.institutionWallet.create({
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

      // Sync legacy fields to keep /auth/me consistent
      if (wallet.isPrimary) {
        const existingClient = await tx.institutionClient.findUnique({
          where: { id: clientId },
          select: { settledWallets: true },
        });
        const settledWallets = existingClient?.settledWallets || [];
        const updatedSettledWallets = settledWallets.includes(wallet.address)
          ? settledWallets
          : [...settledWallets, wallet.address];
        await tx.institutionClient.update({
          where: { id: clientId },
          data: { primaryWallet: wallet.address, settledWallets: updatedSettledWallets },
        });
      }
      if (wallet.isSettlement) {
        await tx.institutionClientSettings.upsert({
          where: { clientId },
          update: { settlementAuthorityWallet: wallet.address },
          create: {
            clientId,
            defaultCurrency: 'USDC',
            timezone: 'UTC',
            settlementAuthorityWallet: wallet.address,
          },
        });
      }

      return wallet;
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
  async generateApiKey(clientId: string, name: string, permissions: string[]) {
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
