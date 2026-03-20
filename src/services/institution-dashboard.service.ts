import { prisma } from '../config/database';
import type { PrismaClient } from '../generated/prisma';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  CREATED: 'Awaiting Deposit',
  FUNDED: 'Funded — Awaiting Release',
  COMPLIANCE_HOLD: 'Compliance Review',
  RELEASING: 'Releasing',
  RELEASED: 'Released',
  INSUFFICIENT_FUNDS: 'Insufficient Funds',
  COMPLETE: 'Complete',
  CANCELLING: 'Cancelling',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  FAILED: 'Failed',
};

export class InstitutionDashboardService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async getMetrics(clientId: string) {
    const [escrows, directPayments, activeEscrowCount] = await Promise.all([
      this.prisma.institutionEscrow.findMany({
        where: { clientId },
        select: { amount: true, platformFee: true, status: true },
      }),
      this.prisma.directPayment.findMany({
        where: { clientId },
        select: { amount: true, platformFee: true, status: true },
      }),
      this.prisma.institutionEscrow.count({
        where: { clientId, status: { in: ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'RELEASING'] } },
      }),
    ]);

    const totalEscrowVolume = escrows.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const totalDirectVolume = directPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    const completedEscrows = escrows.filter((e: any) => ['COMPLETE', 'RELEASED'].includes(e.status)).length;
    const completedPayments = directPayments.filter((p: any) => p.status === 'completed').length;
    const totalFees = escrows.reduce((sum: number, e: any) => sum + Number(e.platformFee), 0)
      + directPayments.reduce((sum: number, p: any) => sum + Number(p.platformFee), 0);

    return {
      totalVolume: totalEscrowVolume + totalDirectVolume,
      escrowVolume: totalEscrowVolume,
      directPaymentVolume: totalDirectVolume,
      activeEscrows: activeEscrowCount,
      completedTransactions: completedEscrows + completedPayments,
      totalFees,
      escrowCount: escrows.length,
      directPaymentCount: directPayments.length,
    };
  }

  async getCashflow(clientId: string, period: string = '30d') {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [escrows, payments] = await Promise.all([
      this.prisma.institutionEscrow.findMany({
        where: { clientId, createdAt: { gte: since } },
        select: { amount: true, status: true, createdAt: true, corridor: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.directPayment.findMany({
        where: { clientId, createdAt: { gte: since } },
        select: { amount: true, status: true, createdAt: true, corridor: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const byDate: Record<string, { inflow: number; outflow: number; escrow: number; direct: number }> = {};
    for (const e of escrows) {
      const date = e.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { inflow: 0, outflow: 0, escrow: 0, direct: 0 };
      byDate[date].escrow += Number(e.amount);
      byDate[date].outflow += Number(e.amount);
    }
    for (const p of payments) {
      const date = p.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { inflow: 0, outflow: 0, escrow: 0, direct: 0 };
      byDate[date].direct += Number(p.amount);
      if (p.status === 'completed') {
        byDate[date].outflow += Number(p.amount);
      }
    }

    return {
      period,
      data: Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({ date, ...values })),
    };
  }

  async getPendingActions(clientId: string) {
    const pendingEscrows = await this.prisma.institutionEscrow.findMany({
      where: {
        clientId,
        status: { in: ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD'] },
      },
      select: {
        escrowCode: true, escrowId: true, status: true,
        amount: true, corridor: true, createdAt: true, expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return pendingEscrows.map((e: any) => ({
      id: e.escrowCode,
      escrowId: e.escrowCode,
      internalId: e.escrowId,
      status: e.status,
      statusLabel: STATUS_LABELS[e.status] || e.status,
      amount: Number(e.amount),
      corridor: e.corridor,
      createdAt: e.createdAt,
      expiresAt: e.expiresAt,
    }));
  }

  async getRecentDirect(clientId: string, limit: number = 10) {
    const payments = await this.prisma.directPayment.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return payments.map((p: any) => ({
      id: p.id, sender: p.sender, senderCountry: p.senderCountry,
      recipient: p.recipient, recipientCountry: p.recipientCountry,
      amount: Number(p.amount), currency: p.currency, corridor: p.corridor,
      status: p.status, txHash: p.txHash, platformFee: Number(p.platformFee),
      riskScore: p.riskScore, settlementMode: p.settlementMode,
      releaseMode: p.releaseMode, settledAt: p.settledAt, createdAt: p.createdAt,
    }));
  }

  async getBranchActivity(clientId: string) {
    const branches = await this.prisma.institutionBranch.findMany({
      where: { clientId },
      include: {
        accounts: {
          select: { id: true, name: true, accountType: true, walletAddress: true },
        },
      },
    });

    const results = [];
    for (const branch of branches) {
      const wallets = branch.accounts.map((a: any) => a.walletAddress);

      const [escrowCount, paymentCount] = await Promise.all([
        wallets.length > 0
          ? this.prisma.institutionEscrow.count({
              where: {
                clientId,
                OR: [
                  { payerWallet: { in: wallets } },
                  { recipientWallet: { in: wallets } },
                ],
              },
            })
          : Promise.resolve(0),
        this.prisma.directPayment.count({
          where: {
            clientId,
            OR: [
              { senderCountry: branch.countryCode },
              { recipientCountry: branch.countryCode },
            ],
          },
        }),
      ]);

      results.push({
        id: branch.id, name: branch.name, city: branch.city,
        country: branch.country, countryCode: branch.countryCode,
        complianceStatus: branch.complianceStatus, riskScore: branch.riskScore,
        isSanctioned: branch.isSanctioned, accountCount: branch.accounts.length,
        escrowCount, paymentCount, totalActivity: escrowCount + paymentCount,
      });
    }

    return results;
  }

  async getCorridorActivity(clientId: string) {
    const [escrows, payments, corridors] = await Promise.all([
      this.prisma.institutionEscrow.groupBy({
        by: ['corridor'],
        where: { clientId, corridor: { not: null } },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.directPayment.groupBy({
        by: ['corridor'],
        where: { clientId },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.institutionCorridor.findMany({ where: { status: 'ACTIVE' } }),
    ]);

    const corridorMap = new Map(corridors.map((c: any) => [c.code, c]));
    const combined: Record<string, any> = {};

    for (const e of escrows) {
      const code = e.corridor || 'UNKNOWN';
      const corridor = corridorMap.get(code);
      combined[code] = {
        code, escrowCount: e._count, escrowVolume: Number(e._sum.amount || 0),
        paymentCount: 0, paymentVolume: 0, riskLevel: corridor?.riskLevel || 'UNKNOWN',
      };
    }

    for (const p of payments) {
      if (!combined[p.corridor]) {
        const corridor = corridorMap.get(p.corridor);
        combined[p.corridor] = {
          code: p.corridor, escrowCount: 0, escrowVolume: 0,
          paymentCount: 0, paymentVolume: 0, riskLevel: corridor?.riskLevel || 'UNKNOWN',
        };
      }
      combined[p.corridor].paymentCount = p._count;
      combined[p.corridor].paymentVolume = Number(p._sum.amount || 0);
    }

    return Object.values(combined).map((c: any) => ({
      ...c,
      totalCount: c.escrowCount + c.paymentCount,
      totalVolume: c.escrowVolume + c.paymentVolume,
    }));
  }

  async getComplianceScorecard(clientId: string) {
    const [aiAnalyses, auditLogs, escrows] = await Promise.all([
      this.prisma.institutionAiAnalysis.findMany({
        where: { clientId },
        select: { riskScore: true, recommendation: true, analysisType: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.institutionAuditLog.findMany({
        where: {
          clientId,
          action: { in: ['COMPLIANCE_HOLD', 'COMPLIANCE_CHECK_PASSED', 'COMPLIANCE_CHECK_FAILED'] },
        },
        select: { action: true, createdAt: true },
      }),
      this.prisma.institutionEscrow.findMany({
        where: { clientId },
        select: { status: true, riskScore: true },
      }),
    ]);

    const avgRiskScore = aiAnalyses.length > 0
      ? Math.round(aiAnalyses.reduce((sum: number, a: any) => sum + a.riskScore, 0) / aiAnalyses.length)
      : 0;

    const approvedCount = aiAnalyses.filter((a: any) => a.recommendation === 'APPROVE').length;
    const rejectedCount = aiAnalyses.filter((a: any) => a.recommendation === 'REJECT').length;
    const reviewCount = aiAnalyses.filter((a: any) => a.recommendation === 'REVIEW').length;
    const holdCount = escrows.filter((e: any) => e.status === 'COMPLIANCE_HOLD').length;

    return {
      averageRiskScore: avgRiskScore,
      totalAnalyses: aiAnalyses.length,
      approved: approvedCount,
      rejected: rejectedCount,
      inReview: reviewCount,
      complianceHolds: holdCount,
      complianceRate: aiAnalyses.length > 0 ? Math.round((approvedCount / aiAnalyses.length) * 100) : 100,
      recentActions: auditLogs.slice(0, 10).map((l: any) => ({ action: l.action, createdAt: l.createdAt })),
    };
  }

  async getSanctions(clientId: string) {
    const [sanctionedBranches, client] = await Promise.all([
      this.prisma.institutionBranch.findMany({
        where: { clientId, isSanctioned: true },
        select: {
          id: true, name: true, city: true, country: true,
          countryCode: true, sanctionReason: true, complianceStatus: true,
        },
      }),
      this.prisma.institutionClient.findUnique({
        where: { id: clientId },
        select: { sanctionsStatus: true },
      }),
    ]);

    return {
      clientSanctionsStatus: client?.sanctionsStatus || 'CLEAR',
      sanctionedBranches,
      sanctionedRegions: ['RU', 'BY', 'KP', 'IR', 'SY', 'CU'],
    };
  }
}

let instance: InstitutionDashboardService | null = null;
export function getInstitutionDashboardService(): InstitutionDashboardService {
  if (!instance) {
    instance = new InstitutionDashboardService();
  }
  return instance;
}
