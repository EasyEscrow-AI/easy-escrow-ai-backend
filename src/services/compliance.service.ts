/**
 * Compliance Service
 *
 * Runs compliance checks for institution escrow transactions:
 * - Corridor validation (active, within limits)
 * - Wallet allowlist verification (both parties must be verified)
 * - Risk scoring (corridor risk, amount thresholds, client tier)
 * - Transaction limits (per-tx, daily, monthly volumes)
 */

import { PrismaClient } from '../generated/prisma';
import { AllowlistService, getAllowlistService } from './allowlist.service';

export interface ComplianceResult {
  passed: boolean;
  flags: string[];
  reasons: string[];
  riskScore: number;
  corridorValid: boolean;
  walletsAllowlisted: boolean;
  limitsWithinRange: boolean;
}

export interface ComplianceCheckParams {
  clientId: string;
  payerWallet: string;
  recipientWallet: string;
  amount: number;
  corridor: string;
}

export interface ComplianceThresholds {
  rejectScore: number;
  holdScore: number;
}

const DEFAULT_THRESHOLDS: ComplianceThresholds = { rejectScore: 90, holdScore: 70 };
const THRESHOLD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class ComplianceService {
  private prisma: PrismaClient;
  private allowlistService: AllowlistService;
  private cachedThresholds: ComplianceThresholds | null = null;
  private thresholdsCachedAt = 0;

  constructor() {
    this.prisma = new PrismaClient();
    this.allowlistService = getAllowlistService();
  }

  /**
   * Get compliance thresholds from SystemSetting (cached 5 min).
   * Default: rejectScore=90, holdScore=70
   */
  async getComplianceThresholds(): Promise<ComplianceThresholds> {
    const now = Date.now();
    if (this.cachedThresholds && now - this.thresholdsCachedAt < THRESHOLD_CACHE_TTL_MS) {
      return this.cachedThresholds;
    }

    try {
      const setting = await this.prisma.systemSetting.findUnique({
        where: { key: 'compliance.riskThresholds' },
      });
      if (setting && setting.value) {
        const val = setting.value as Record<string, unknown>;
        const clamp = (v: unknown, fallback: number) =>
          typeof v === 'number' && v >= 0 && v <= 100 ? v : fallback;
        let rejectScore = clamp(val.rejectScore, DEFAULT_THRESHOLDS.rejectScore);
        let holdScore = clamp(val.holdScore, DEFAULT_THRESHOLDS.holdScore);
        if (holdScore >= rejectScore) {
          rejectScore = DEFAULT_THRESHOLDS.rejectScore;
          holdScore = DEFAULT_THRESHOLDS.holdScore;
        }
        this.cachedThresholds = { rejectScore, holdScore };
      } else {
        this.cachedThresholds = { ...DEFAULT_THRESHOLDS };
      }
    } catch (err) {
      console.warn('[ComplianceService] Failed to load thresholds from DB, using defaults:', err instanceof Error ? err.message : err);
      this.cachedThresholds = { ...DEFAULT_THRESHOLDS };
    }

    this.thresholdsCachedAt = now;
    return this.cachedThresholds;
  }

  /**
   * Run all compliance checks for an escrow transaction
   */
  async validateTransaction(params: ComplianceCheckParams): Promise<ComplianceResult> {
    const flags: string[] = [];
    const reasons: string[] = [];

    // 1. Validate corridor
    const corridorResult = await this.validateCorridor(params.corridor, params.amount);
    if (!corridorResult.valid) {
      reasons.push(...corridorResult.reasons);
      flags.push('CORRIDOR_INVALID');
    }

    // 2. Validate wallets are allowlisted
    const walletsResult = await this.validateWallets(params.payerWallet, params.recipientWallet, params.clientId);
    if (!walletsResult.valid) {
      reasons.push(...walletsResult.reasons);
      flags.push('WALLET_NOT_ALLOWLISTED');
    }

    // 3. Check transaction limits
    const limitsResult = await this.checkTransactionLimits(
      params.clientId,
      params.amount,
      params.corridor,
    );
    if (!limitsResult.valid) {
      reasons.push(...limitsResult.reasons);
      flags.push('LIMIT_EXCEEDED');
    }

    // 4. Calculate risk score
    const riskScore = await this.calculateRiskScore(params);

    // Add risk flag based on configurable thresholds
    const thresholds = await this.getComplianceThresholds();
    if (riskScore >= thresholds.rejectScore) {
      flags.push('HIGH_RISK');
      reasons.push(`Risk score ${riskScore} exceeds reject threshold (${thresholds.rejectScore})`);
    } else if (riskScore >= thresholds.holdScore) {
      flags.push('MEDIUM_RISK');
    }

    const passed =
      corridorResult.valid &&
      walletsResult.valid &&
      limitsResult.valid &&
      riskScore < thresholds.rejectScore;

    return {
      passed,
      flags,
      reasons,
      riskScore,
      corridorValid: corridorResult.valid,
      walletsAllowlisted: walletsResult.valid,
      limitsWithinRange: limitsResult.valid,
    };
  }

  /**
   * Validate corridor is active and amount is within limits
   */
  async validateCorridor(
    corridorCode: string,
    amount: number,
  ): Promise<{ valid: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    const corridor = await this.prisma.institutionCorridor.findUnique({
      where: { code: corridorCode },
    });

    if (!corridor) {
      return { valid: false, reasons: [`Corridor ${corridorCode} not found`] };
    }

    if (corridor.status !== 'ACTIVE') {
      reasons.push(`Corridor ${corridorCode} is ${corridor.status}`);
    }

    const minAmount = Number(corridor.minAmount);
    const maxAmount = Number(corridor.maxAmount);

    if (amount < minAmount) {
      reasons.push(
        `Amount ${amount} below corridor minimum ${minAmount}`,
      );
    }

    if (amount > maxAmount) {
      reasons.push(
        `Amount ${amount} exceeds corridor maximum ${maxAmount}`,
      );
    }

    return { valid: reasons.length === 0, reasons };
  }

  /**
   * Validate both payer and recipient wallets are allowlisted
   */
  async validateWallets(
    payerWallet: string,
    recipientWallet: string,
    clientId?: string,
  ): Promise<{ valid: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    const payerAllowlisted = await this.allowlistService.isAllowlisted(payerWallet);
    if (!payerAllowlisted) {
      reasons.push(`Payer wallet ${payerWallet} is not on the allowlist`);
    }

    // Verify payer wallet belongs to the calling client
    if (clientId && payerAllowlisted) {
      const payerMeta = await this.allowlistService.getWalletMetadata(payerWallet);
      if (payerMeta && payerMeta.clientId !== clientId) {
        reasons.push(`Payer wallet ${payerWallet} does not belong to the requesting client`);
      }
    }

    const recipientAllowlisted = await this.allowlistService.isAllowlisted(recipientWallet);
    if (!recipientAllowlisted) {
      reasons.push(`Recipient wallet ${recipientWallet} is not on the allowlist`);
    }

    return { valid: reasons.length === 0, reasons };
  }

  /**
   * Calculate risk score (0-100) based on corridor, amount, and client tier
   */
  async calculateRiskScore(params: ComplianceCheckParams): Promise<number> {
    let score = 0;

    // Corridor risk level (0-30 points)
    const corridor = await this.prisma.institutionCorridor.findUnique({
      where: { code: params.corridor },
    });
    if (corridor) {
      switch (corridor.riskLevel) {
        case 'HIGH':
          score += 30;
          break;
        case 'MEDIUM':
          score += 15;
          break;
        case 'LOW':
          score += 5;
          break;
      }
    } else {
      score += 30; // Unknown corridor = high risk
    }

    // Amount threshold (0-30 points)
    if (params.amount >= 500000) {
      score += 30;
    } else if (params.amount >= 100000) {
      score += 20;
    } else if (params.amount >= 10000) {
      score += 10;
    } else {
      score += 5;
    }

    // Client tier (0-20 points)
    const client = await this.prisma.institutionClient.findUnique({
      where: { id: params.clientId },
    });
    if (client) {
      switch (client.tier) {
        case 'ENTERPRISE':
          score += 5; // Lower risk for established clients
          break;
        case 'PREMIUM':
          score += 10;
          break;
        case 'STANDARD':
          score += 20;
          break;
      }
    } else {
      score += 20;
    }

    // KYC status (0-20 points)
    if (client) {
      switch (client.kycStatus) {
        case 'VERIFIED':
          score += 0;
          break;
        case 'PENDING':
          score += 15;
          break;
        default:
          score += 20;
          break;
      }
    }

    return Math.min(100, score);
  }

  /**
   * Check per-transaction, daily, and monthly volume limits
   */
  async checkTransactionLimits(
    clientId: string,
    amount: number,
    corridorCode: string,
  ): Promise<{ valid: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    const corridor = await this.prisma.institutionCorridor.findUnique({
      where: { code: corridorCode },
    });
    if (!corridor) {
      return { valid: false, reasons: [`Corridor ${corridorCode} not found`] };
    }

    // Check per-transaction max
    const maxAmount = Number(corridor.maxAmount);
    if (amount > maxAmount) {
      reasons.push(`Amount ${amount} exceeds per-transaction max ${maxAmount}`);
    }

    // Atomic volume check via interactive transaction
    await this.prisma.$transaction(async (tx) => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const dailyVolume = await tx.institutionEscrow.aggregate({
        _sum: { amount: true },
        where: {
          clientId,
          corridor: corridorCode,
          createdAt: { gte: startOfDay },
          status: { notIn: ['CANCELLED', 'FAILED', 'EXPIRED'] },
        },
      });

      const dailyTotal = Number(dailyVolume._sum.amount || 0) + amount;
      const dailyLimit = Number(corridor.dailyLimit);
      if (dailyTotal > dailyLimit) {
        reasons.push(`Daily volume ${dailyTotal} would exceed limit ${dailyLimit}`);
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyVolume = await tx.institutionEscrow.aggregate({
        _sum: { amount: true },
        where: {
          clientId,
          corridor: corridorCode,
          createdAt: { gte: startOfMonth },
          status: { notIn: ['CANCELLED', 'FAILED', 'EXPIRED'] },
        },
      });

      const monthlyTotal = Number(monthlyVolume._sum.amount || 0) + amount;
      const monthlyLimit = Number(corridor.monthlyLimit);
      if (monthlyTotal > monthlyLimit) {
        reasons.push(`Monthly volume ${monthlyTotal} would exceed limit ${monthlyLimit}`);
      }
    });

    return { valid: reasons.length === 0, reasons };
  }
}

let instance: ComplianceService | null = null;
export function getComplianceService(): ComplianceService {
  if (!instance) {
    instance = new ComplianceService();
  }
  return instance;
}
