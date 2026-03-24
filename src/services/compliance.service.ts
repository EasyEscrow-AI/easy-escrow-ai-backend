/**
 * Compliance Service
 *
 * Runs 12 itemized compliance checks for institution escrow transactions.
 * Each check returns PASS (0 points), WARNING, FAIL, or NOT_APPLICABLE.
 * Only WARNING and FAIL add risk points. A fully compliant transaction scores 0/100.
 */

import { PrismaClient } from '../generated/prisma';
import { prisma } from '../config/database';
import { AllowlistService, getAllowlistService } from './allowlist.service';

// ─── New Interfaces ────────────────────────────────────────

export type ComplianceCheckStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_APPLICABLE';

export interface ComplianceCheckItem {
  id: string;
  name: string;
  status: ComplianceCheckStatus;
  score: number;
  maxScore: number;
  description: string;
  detail?: string;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ComplianceResult {
  passed: boolean;
  flags: string[];
  reasons: string[];
  riskScore: number;
  corridorValid: boolean;
  walletsAllowlisted: boolean;
  limitsWithinRange: boolean;
  checks: ComplianceCheckItem[];
  riskLevel: RiskLevel;
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
const THRESHOLD_CACHE_TTL_MS = 5 * 60 * 1000;

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 76) return 'CRITICAL';
  if (score >= 51) return 'HIGH';
  if (score >= 26) return 'MEDIUM';
  return 'LOW';
}

export class ComplianceService {
  private prisma: PrismaClient;
  private allowlistService: AllowlistService;
  private cachedThresholds: ComplianceThresholds | null = null;
  private thresholdsCachedAt = 0;

  constructor() {
    this.prisma = prisma;
    this.allowlistService = getAllowlistService();
  }

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
      console.warn(
        '[ComplianceService] Failed to load thresholds from DB, using defaults:',
        err instanceof Error ? err.message : err
      );
      this.cachedThresholds = { ...DEFAULT_THRESHOLDS };
    }

    this.thresholdsCachedAt = now;
    return this.cachedThresholds;
  }

  /**
   * Run all 12 compliance checks and aggregate into a ComplianceResult.
   */
  async validateTransaction(params: ComplianceCheckParams): Promise<ComplianceResult> {
    // Fetch all needed data in parallel
    const [client, corridor, branches, payerAllowlisted, recipientAllowlisted, limitsResult] =
      await Promise.all([
        this.prisma.institutionClient.findUnique({ where: { id: params.clientId } }),
        this.prisma.institutionCorridor.findUnique({ where: { code: params.corridor } }),
        this.prisma.institutionBranch.findMany({ where: { clientId: params.clientId } }),
        this.allowlistService.isAllowlisted(params.payerWallet),
        this.allowlistService.isAllowlisted(params.recipientWallet),
        this.checkTransactionLimits(params.clientId, params.amount, params.corridor),
      ]);

    // Verify payer wallet belongs to client
    let payerOwnership = true;
    if (params.clientId && payerAllowlisted) {
      const payerMeta = await this.allowlistService.getWalletMetadata(params.payerWallet);
      if (payerMeta && payerMeta.clientId !== params.clientId) {
        payerOwnership = false;
      }
    }

    // Run all 12 checks
    const checks: ComplianceCheckItem[] = [
      this.checkKycVerification(client),
      this.checkSanctionsScreening(client),
      this.checkCorridorRisk(corridor),
      this.checkWalletAllowlist(payerAllowlisted, recipientAllowlisted, payerOwnership, params),
      this.checkTransactionLimitsFromResult(limitsResult, corridor, params.amount),
      this.checkAmountThreshold(params.amount),
      this.checkSourceOfFunds(client),
      this.checkPepScreening(client),
      this.checkRegulatoryStatus(client),
      this.checkBranchCompliance(branches),
      this.checkClientTier(client),
      this.checkCorridorValidity(corridor),
    ];

    // Aggregate
    const riskScore = Math.min(
      100,
      checks.reduce((sum, c) => sum + c.score, 0)
    );
    const riskLevel = riskLevelFromScore(riskScore);

    // Build backward-compatible flags and reasons
    const flags: string[] = [];
    const reasons: string[] = [];

    for (const check of checks) {
      if (check.status === 'FAIL') {
        flags.push(check.id);
        if (check.detail) reasons.push(check.detail);
      } else if (check.status === 'WARNING') {
        if (check.detail) reasons.push(check.detail);
      }
    }

    // Derive backward-compatible booleans
    const corridorValidCheck = checks.find((c) => c.id === 'CORRIDOR_VALIDITY');
    const corridorRiskCheck = checks.find((c) => c.id === 'CORRIDOR_RISK');
    const walletCheck = checks.find((c) => c.id === 'WALLET_ALLOWLIST');
    const limitsCheck = checks.find((c) => c.id === 'TRANSACTION_LIMITS');

    const corridorValid =
      corridorValidCheck?.status !== 'FAIL' &&
      corridorRiskCheck?.status !== 'FAIL' &&
      this.isCorridorStructurallyValid(corridor, params.amount);
    const walletsAllowlisted = walletCheck?.status === 'PASS';
    const limitsWithinRange =
      limitsCheck?.status === 'PASS' || limitsCheck?.status === 'NOT_APPLICABLE';

    // Add risk flags based on thresholds
    const thresholds = await this.getComplianceThresholds();
    if (riskScore >= thresholds.rejectScore) {
      flags.push('HIGH_RISK');
      reasons.push(`Risk score ${riskScore} exceeds reject threshold (${thresholds.rejectScore})`);
    } else if (riskScore >= thresholds.holdScore) {
      flags.push('MEDIUM_RISK');
    }

    const passed =
      corridorValid &&
      walletsAllowlisted &&
      limitsWithinRange &&
      riskScore < thresholds.rejectScore;

    return {
      passed,
      flags,
      reasons,
      riskScore,
      corridorValid,
      walletsAllowlisted,
      limitsWithinRange,
      checks,
      riskLevel,
    };
  }

  /**
   * Backward-compatible risk score calculator (wraps validateTransaction).
   */
  async calculateRiskScore(params: ComplianceCheckParams): Promise<number> {
    const result = await this.validateTransaction(params);
    return result.riskScore;
  }

  // ─── 12 Individual Check Methods ────────────────────────────

  private checkKycVerification(client: any): ComplianceCheckItem {
    const base = {
      id: 'KYC_VERIFICATION',
      name: 'KYC/KYB Verification',
      maxScore: 15,
      description: 'Verifies KYC/KYB status of the client',
    };
    if (!client) {
      return { ...base, status: 'FAIL', score: 15, detail: 'Client not found' };
    }
    const kyc = client.kycStatus;
    if (kyc === 'VERIFIED') {
      return { ...base, status: 'PASS', score: 0 };
    }
    if (kyc === 'PENDING') {
      return { ...base, status: 'WARNING', score: 8, detail: 'KYC verification is pending' };
    }
    // REJECTED, EXPIRED, or unknown
    return { ...base, status: 'FAIL', score: 15, detail: `KYC status is ${kyc}` };
  }

  private checkSanctionsScreening(client: any): ComplianceCheckItem {
    const base = {
      id: 'SANCTIONS_SCREENING',
      name: 'Sanctions Screening (OFAC/EU/UN)',
      maxScore: 15,
      description: 'Screens client against OFAC, EU, and UN sanctions lists',
    };
    if (!client) {
      return { ...base, status: 'FAIL', score: 15, detail: 'Client not found for sanctions check' };
    }
    const status = client.sanctionsStatus;
    if (status === 'CLEAR') {
      return { ...base, status: 'PASS', score: 0 };
    }
    if (status === 'PENDING_REVIEW') {
      return { ...base, status: 'WARNING', score: 8, detail: 'Sanctions screening pending review' };
    }
    if (status === 'FLAGGED' || status === 'BLOCKED') {
      return { ...base, status: 'FAIL', score: 15, detail: `Sanctions status: ${status}` };
    }
    // null/unknown = not screened yet, treat as warning
    return { ...base, status: 'WARNING', score: 8, detail: 'Sanctions screening not completed' };
  }

  private checkCorridorRisk(corridor: any): ComplianceCheckItem {
    const base = {
      id: 'CORRIDOR_RISK',
      name: 'Corridor Risk Level',
      maxScore: 12,
      description: 'Assesses risk level of the payment corridor',
    };
    if (!corridor) {
      return { ...base, status: 'FAIL', score: 12, detail: 'Corridor not found' };
    }
    switch (corridor.riskLevel) {
      case 'LOW':
        return { ...base, status: 'PASS', score: 0 };
      case 'MEDIUM':
        return { ...base, status: 'WARNING', score: 6, detail: 'Medium-risk corridor' };
      case 'HIGH':
        return { ...base, status: 'FAIL', score: 12, detail: 'High-risk corridor' };
      default:
        return {
          ...base,
          status: 'FAIL',
          score: 12,
          detail: `Unknown corridor risk level: ${corridor.riskLevel}`,
        };
    }
  }

  private checkWalletAllowlist(
    payerAllowlisted: boolean,
    recipientAllowlisted: boolean,
    payerOwnership: boolean,
    params: ComplianceCheckParams
  ): ComplianceCheckItem {
    const base = {
      id: 'WALLET_ALLOWLIST',
      name: 'Wallet Allowlist',
      maxScore: 12,
      description: 'Verifies both payer and recipient wallets are on the allowlist',
    };
    const issues: string[] = [];
    if (!payerAllowlisted)
      issues.push(`Payer wallet ${params.payerWallet} is not on the allowlist`);
    if (!payerOwnership)
      issues.push(`Payer wallet ${params.payerWallet} does not belong to the requesting client`);
    if (!recipientAllowlisted)
      issues.push(`Recipient wallet ${params.recipientWallet} is not on the allowlist`);
    if (issues.length > 0) {
      return { ...base, status: 'FAIL', score: 12, detail: issues.join('; ') };
    }
    return { ...base, status: 'PASS', score: 0 };
  }

  private checkTransactionLimitsFromResult(
    limitsResult: { valid: boolean; reasons: string[] },
    corridor: any,
    amount: number
  ): ComplianceCheckItem {
    const base = {
      id: 'TRANSACTION_LIMITS',
      name: 'Transaction Limits',
      maxScore: 10,
      description: 'Checks per-transaction, daily, and monthly volume limits',
    };
    if (!corridor) {
      return { ...base, status: 'FAIL', score: 10, detail: 'Corridor not found for limits check' };
    }
    if (!limitsResult.valid) {
      return { ...base, status: 'FAIL', score: 10, detail: limitsResult.reasons.join('; ') };
    }
    // Check if approaching limit (>80% of per-tx max)
    const maxAmount = Number(corridor.maxAmount);
    if (maxAmount > 0 && amount > maxAmount * 0.8) {
      return {
        ...base,
        status: 'WARNING',
        score: 5,
        detail: `Amount is ${Math.round((amount / maxAmount) * 100)}% of per-transaction maximum`,
      };
    }
    return { ...base, status: 'PASS', score: 0 };
  }

  private checkAmountThreshold(amount: number): ComplianceCheckItem {
    const base = {
      id: 'AMOUNT_THRESHOLD',
      name: 'Amount Risk',
      maxScore: 8,
      description: 'Evaluates transaction amount against risk thresholds',
    };
    if (amount >= 100000) {
      return {
        ...base,
        status: 'FAIL',
        score: 8,
        detail: `Amount $${amount.toLocaleString()} exceeds $100k high-risk threshold`,
      };
    }
    if (amount >= 10000) {
      return {
        ...base,
        status: 'WARNING',
        score: 4,
        detail: `Amount $${amount.toLocaleString()} exceeds $10k reporting threshold`,
      };
    }
    return { ...base, status: 'PASS', score: 0 };
  }

  private checkSourceOfFunds(client: any): ComplianceCheckItem {
    const base = {
      id: 'SOURCE_OF_FUNDS',
      name: 'Source of Funds',
      maxScore: 8,
      description: 'Verifies source of funds documentation',
    };
    if (!client) {
      return {
        ...base,
        status: 'FAIL',
        score: 8,
        detail: 'Client not found for source of funds check',
      };
    }
    const sof = client.sourceOfFunds;
    if (sof && sof.toLowerCase() !== 'undocumented' && sof.toLowerCase() !== 'unknown') {
      // Has documented source of funds
      if (sof.toLowerCase() === 'partial' || sof.toLowerCase() === 'pending') {
        return {
          ...base,
          status: 'WARNING',
          score: 4,
          detail: 'Source of funds partially documented',
        };
      }
      return { ...base, status: 'PASS', score: 0 };
    }
    if (!sof) {
      return { ...base, status: 'WARNING', score: 4, detail: 'Source of funds not provided' };
    }
    return { ...base, status: 'FAIL', score: 8, detail: 'Source of funds undocumented' };
  }

  private checkPepScreening(client: any): ComplianceCheckItem {
    const base = {
      id: 'PEP_SCREENING',
      name: 'PEP Screening',
      maxScore: 5,
      description: 'Screens for Politically Exposed Persons',
    };
    if (!client) {
      return { ...base, status: 'FAIL', score: 5, detail: 'Client not found for PEP screening' };
    }
    const rating = client.riskRating;
    if (!rating || rating === 'LOW' || rating === 'UNRATED') {
      return { ...base, status: 'PASS', score: 0 };
    }
    if (rating === 'MEDIUM') {
      return { ...base, status: 'WARNING', score: 3, detail: 'Medium PEP risk rating' };
    }
    // HIGH or CRITICAL
    return { ...base, status: 'FAIL', score: 5, detail: `PEP risk rating: ${rating}` };
  }

  private checkRegulatoryStatus(client: any): ComplianceCheckItem {
    const base = {
      id: 'REGULATORY_STATUS',
      name: 'Regulatory Compliance',
      maxScore: 5,
      description: 'Verifies regulatory compliance status',
    };
    if (!client) {
      return { ...base, status: 'FAIL', score: 5, detail: 'Client not found for regulatory check' };
    }
    const status = client.regulatoryStatus;
    if (status === 'REGULATED' || status === 'EXEMPT') {
      return { ...base, status: 'PASS', score: 0 };
    }
    if (status === 'PENDING_LICENSE') {
      return { ...base, status: 'WARNING', score: 3, detail: 'License pending approval' };
    }
    if (status === 'SUSPENDED') {
      return { ...base, status: 'FAIL', score: 5, detail: 'Regulatory status: SUSPENDED' };
    }
    // UNREGULATED or null
    if (!status) {
      return { ...base, status: 'PASS', score: 0, detail: undefined };
    }
    return { ...base, status: 'FAIL', score: 5, detail: `Regulatory status: ${status}` };
  }

  private checkBranchCompliance(branches: any[]): ComplianceCheckItem {
    const base = {
      id: 'BRANCH_COMPLIANCE',
      name: 'Branch Compliance',
      maxScore: 4,
      description: 'Verifies compliance status of client branches',
    };
    if (!branches || branches.length === 0) {
      return { ...base, status: 'NOT_APPLICABLE', score: 0, detail: 'No branches registered' };
    }
    const sanctioned = branches.filter((b) => b.isSanctioned);
    if (sanctioned.length > 0) {
      return {
        ...base,
        status: 'FAIL',
        score: 4,
        detail: `${sanctioned.length} branch(es) in sanctioned jurisdictions`,
      };
    }
    const underReview = branches.filter((b) => b.complianceStatus === 'UNDER_REVIEW');
    if (underReview.length > 0) {
      return {
        ...base,
        status: 'WARNING',
        score: 2,
        detail: `${underReview.length} branch(es) under compliance review`,
      };
    }
    const blocked = branches.filter(
      (b) => b.complianceStatus === 'BLOCKED' || b.complianceStatus === 'SUSPENDED'
    );
    if (blocked.length > 0) {
      return {
        ...base,
        status: 'FAIL',
        score: 4,
        detail: `${blocked.length} branch(es) blocked or suspended`,
      };
    }
    return { ...base, status: 'PASS', score: 0 };
  }

  private checkClientTier(client: any): ComplianceCheckItem {
    const base = {
      id: 'CLIENT_TIER',
      name: 'Client Tier',
      maxScore: 3,
      description: 'Assesses risk based on client tier level',
    };
    if (!client) {
      return { ...base, status: 'FAIL', score: 3, detail: 'Client not found' };
    }
    switch (client.tier) {
      case 'ENTERPRISE':
        return { ...base, status: 'PASS', score: 0 };
      case 'PREMIUM':
        return { ...base, status: 'WARNING', score: 1, detail: 'Premium tier client' };
      case 'STANDARD':
        return {
          ...base,
          status: 'FAIL',
          score: 3,
          detail: 'Standard tier client — elevated risk',
        };
      default:
        return { ...base, status: 'FAIL', score: 3, detail: `Unknown client tier: ${client.tier}` };
    }
  }

  private checkCorridorValidity(corridor: any): ComplianceCheckItem {
    const base = {
      id: 'CORRIDOR_VALIDITY',
      name: 'Corridor Active Status',
      maxScore: 3,
      description: 'Verifies the corridor is active',
    };
    if (!corridor) {
      return { ...base, status: 'FAIL', score: 3, detail: 'Corridor not found' };
    }
    if (corridor.status === 'ACTIVE') {
      return { ...base, status: 'PASS', score: 0 };
    }
    return { ...base, status: 'FAIL', score: 3, detail: `Corridor status: ${corridor.status}` };
  }

  // ─── Existing Methods (kept for backward compat) ──────────

  /**
   * Validate corridor is active and amount is within limits.
   * Used by validateTransaction for the structural corridor check.
   */
  private isCorridorStructurallyValid(corridor: any, amount: number): boolean {
    if (!corridor) return false;
    if (corridor.status !== 'ACTIVE') return false;
    const minAmount = Number(corridor.minAmount);
    const maxAmount = Number(corridor.maxAmount);
    if (amount < minAmount || amount > maxAmount) return false;
    return true;
  }

  async validateCorridor(
    corridorCode: string,
    amount: number
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
      reasons.push(`Amount ${amount} below corridor minimum ${minAmount}`);
    }

    if (amount > maxAmount) {
      reasons.push(`Amount ${amount} exceeds corridor maximum ${maxAmount}`);
    }

    return { valid: reasons.length === 0, reasons };
  }

  async validateWallets(
    payerWallet: string,
    recipientWallet: string,
    clientId?: string
  ): Promise<{ valid: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    const payerAllowlisted = await this.allowlistService.isAllowlisted(payerWallet);
    if (!payerAllowlisted) {
      reasons.push(`Payer wallet ${payerWallet} is not on the allowlist`);
    }

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

  async checkTransactionLimits(
    clientId: string,
    amount: number,
    corridorCode: string
  ): Promise<{ valid: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    const corridor = await this.prisma.institutionCorridor.findUnique({
      where: { code: corridorCode },
    });
    if (!corridor) {
      return { valid: false, reasons: [`Corridor ${corridorCode} not found`] };
    }

    const maxAmount = Number(corridor.maxAmount);
    if (amount > maxAmount) {
      reasons.push(`Amount ${amount} exceeds per-transaction max ${maxAmount}`);
    }

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
