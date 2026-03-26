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
    const now = new Date();
    const day1 = new Date(now); day1.setDate(day1.getDate() - 1);
    const day7 = new Date(now); day7.setDate(day7.getDate() - 7);
    const day30 = new Date(now); day30.setDate(day30.getDate() - 30);

    const [
      escrows, directPayments, heldEscrowAgg, activeEscrowCount,
      escrows24h, escrows7d, escrows30d,
      payments24h, payments7d, payments30d,
      totalClients, verifiedClients, pendingClients,
    ] = await Promise.all([
      this.prisma.institutionEscrow.findMany({
        where: { clientId },
        select: { amount: true, platformFee: true, status: true },
      }),
      this.prisma.directPayment.findMany({
        where: { clientId },
        select: { amount: true, platformFee: true, status: true },
      }),
      this.prisma.institutionEscrow.aggregate({
        where: { clientId, status: { in: ['FUNDED', 'COMPLIANCE_HOLD', 'RELEASING'] } },
        _sum: { amount: true },
      }),
      this.prisma.institutionEscrow.count({
        where: { clientId, status: { in: ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'RELEASING'] } },
      }),
      this.prisma.institutionEscrow.aggregate({ where: { clientId, createdAt: { gte: day1 } }, _sum: { amount: true } }),
      this.prisma.institutionEscrow.aggregate({ where: { clientId, createdAt: { gte: day7 } }, _sum: { amount: true } }),
      this.prisma.institutionEscrow.aggregate({ where: { clientId, createdAt: { gte: day30 } }, _sum: { amount: true } }),
      this.prisma.directPayment.aggregate({ where: { clientId, createdAt: { gte: day1 } }, _sum: { amount: true } }),
      this.prisma.directPayment.aggregate({ where: { clientId, createdAt: { gte: day7 } }, _sum: { amount: true } }),
      this.prisma.directPayment.aggregate({ where: { clientId, createdAt: { gte: day30 } }, _sum: { amount: true } }),
      this.prisma.institutionEscrow.findMany({
        where: { clientId }, select: { recipientWallet: true }, distinct: ['recipientWallet'],
      }).then(rows => rows.length),
      this.prisma.institutionEscrow.findMany({
        where: { clientId, status: { in: ['COMPLETE', 'RELEASED'] } },
        select: { recipientWallet: true }, distinct: ['recipientWallet'],
      }).then(rows => rows.length),
      this.prisma.institutionEscrow.findMany({
        where: { clientId, status: { in: ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD'] } },
        select: { recipientWallet: true }, distinct: ['recipientWallet'],
      }).then(rows => rows.length),
    ]);

    const totalEscrowVolume = escrows.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const totalDirectVolume = directPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    const completedEscrows = escrows.filter((e: any) => ['COMPLETE', 'RELEASED'].includes(e.status)).length;
    const completedPayments = directPayments.filter((p: any) => p.status === 'completed').length;
    const totalFees = escrows.reduce((sum: number, e: any) => sum + Number(e.platformFee), 0)
      + directPayments.reduce((sum: number, p: any) => sum + Number(p.platformFee), 0);
    const totalVolume = totalEscrowVolume + totalDirectVolume;

    return {
      totalVolume,
      escrowVolume: totalEscrowVolume,
      directPaymentVolume: totalDirectVolume,
      activeEscrows: activeEscrowCount,
      completedTransactions: completedEscrows + completedPayments,
      totalFees,
      escrowCount: escrows.length,
      directPaymentCount: directPayments.length,
      totalVolumeUsd: totalVolume,
      volume24h: Number(escrows24h._sum.amount || 0) + Number(payments24h._sum.amount || 0),
      volume7d: Number(escrows7d._sum.amount || 0) + Number(payments7d._sum.amount || 0),
      volume30d: Number(escrows30d._sum.amount || 0) + Number(payments30d._sum.amount || 0),
      totalClients,
      verifiedClients,
      pendingClients,
      totalPayments: escrows.length + directPayments.length,
      directCount: directPayments.length,
      escrowHeldUsd: Number(heldEscrowAgg._sum.amount || 0),
    };
  }

  async getCashflow(clientId: string, period: string = '7d') {
    const PERIOD_MAP: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '6m': 180, '12m': 365, '90d': 90 };
    const days = PERIOD_MAP[period] || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [fundedEscrows, resolvedEscrows, payments] = await Promise.all([
      this.prisma.institutionEscrow.findMany({
        where: { clientId, fundedAt: { gte: since }, status: { in: ['FUNDED', 'COMPLETE', 'RELEASED'] } },
        select: { amount: true, fundedAt: true },
      }),
      this.prisma.institutionEscrow.findMany({
        where: { clientId, resolvedAt: { gte: since }, status: { in: ['COMPLETE', 'RELEASED'] } },
        select: { amount: true, resolvedAt: true },
      }),
      this.prisma.directPayment.findMany({
        where: { clientId, status: 'completed', OR: [{ settledAt: { gte: since } }, { settledAt: null, createdAt: { gte: since } }] },
        select: { amount: true, settledAt: true, createdAt: true },
      }),
    ]);

    const useHourKeys = period === '24h';
    const byKey: Record<string, { sent: number; received: number }> = {};
    const toKey = (d: Date) => useHourKeys ? d.toISOString().slice(0, 13) : d.toISOString().split('T')[0];
    const addToKey = (key: string, sent: number, received: number) => {
      if (!byKey[key]) byKey[key] = { sent: 0, received: 0 };
      byKey[key].sent += sent;
      byKey[key].received += received;
    };

    for (const e of fundedEscrows) addToKey(toKey(e.fundedAt!), 0, Number(e.amount));
    for (const e of resolvedEscrows) addToKey(toKey(e.resolvedAt!), Number(e.amount), 0);
    for (const p of payments) addToKey(toKey(p.settledAt || p.createdAt), Number(p.amount), 0);

    const now = new Date();
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const bars: Array<{ label: string; sent: number; received: number; interest: number; forecast: boolean }> = [];

    if (period === '24h') {
      for (let h = 23; h >= 0; h--) {
        const d = new Date(now); d.setHours(d.getHours() - h, 0, 0, 0);
        const key = d.toISOString().slice(0, 13);
        const vals = byKey[key] || { sent: 0, received: 0 };
        bars.push({ label: `${d.getHours()}:00`, sent: vals.sent, received: vals.received, interest: 0, forecast: false });
      }
    } else if (period === '6m' || period === '12m') {
      const months = period === '6m' ? 6 : 12;
      for (let m = months - 1; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        let sent = 0, received = 0;
        for (const [key, vals] of Object.entries(byKey)) {
          if (key.startsWith(monthKey)) { sent += vals.sent; received += vals.received; }
        }
        const interest = Math.round((sent + received) * 0.00002);
        bars.push({ label: MONTH_NAMES[d.getMonth()], sent, received, interest, forecast: m === 0 && now.getDate() < 15 });
      }
    } else {
      for (let d = days - 1; d >= 0; d--) {
        const date = new Date(now); date.setDate(date.getDate() - d);
        const key = date.toISOString().split('T')[0];
        const vals = byKey[key] || { sent: 0, received: 0 };
        const interest = Math.round((vals.sent + vals.received) * 0.00002);
        const label = d === 0 ? 'Today' : (days <= 7 ? DAY_NAMES[date.getDay()] : `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`);
        bars.push({ label, sent: vals.sent, received: vals.received, interest, forecast: false });
      }
    }

    return bars;
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

      const escrowCount = wallets.length > 0
        ? await this.prisma.institutionEscrow.count({
            where: {
              clientId,
              OR: [
                { payerWallet: { in: wallets } },
                { recipientWallet: { in: wallets } },
              ],
            },
          })
        : 0;

      results.push({
        id: branch.id, name: branch.name, city: branch.city,
        country: branch.country, countryCode: branch.countryCode,
        complianceStatus: branch.complianceStatus, riskScore: branch.riskScore,
        isSanctioned: branch.isSanctioned, accountCount: branch.accounts.length,
        escrowCount, totalActivity: escrowCount,
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
