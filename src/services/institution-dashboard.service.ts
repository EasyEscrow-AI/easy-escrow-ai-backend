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

  /** Build the OR array for matching escrows where the institution is payer OR recipient.
   *  When clientId is null (admin aggregate), returns undefined to skip filtering. */
  private async buildEscrowOrClause(clientId: string | null): Promise<Array<Record<string, unknown>> | undefined> {
    if (!clientId) return undefined;
    const wallets = await this.getClientWallets(clientId);
    return [
      { clientId },
      ...(wallets.length > 0 ? [{ recipientWallet: { in: wallets } }] : []),
    ];
  }

  /** Build a full where clause that matches escrows where the institution is payer OR recipient.
   *  When clientId is null (admin aggregate), returns only the extra filters. */
  private async escrowWhereForClient(clientId: string | null, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const orClause = await this.buildEscrowOrClause(clientId);
    if (!orClause) return { ...extra };
    return { OR: orClause, ...extra };
  }

  private async getClientWallets(clientId: string): Promise<string[]> {
    const [client, accounts] = await Promise.all([
      this.prisma.institutionClient.findUnique({
        where: { id: clientId },
        select: { primaryWallet: true, settledWallets: true },
      }),
      this.prisma.institutionAccount.findMany({
        where: { clientId, isActive: true },
        select: { walletAddress: true },
      }),
    ]);
    return [
      client?.primaryWallet,
      ...(client?.settledWallets || []),
      ...accounts.map((a: { walletAddress: string }) => a.walletAddress),
    ].filter(Boolean) as string[];
  }

  async getMetrics(clientId: string | null) {
    const now = new Date();
    const day1 = new Date(now); day1.setDate(day1.getDate() - 1);
    const day7 = new Date(now); day7.setDate(day7.getDate() - 7);
    const day30 = new Date(now); day30.setDate(day30.getDate() - 30);

    // Build OR clause once — reuse for all escrow queries
    // null clientId (admin) → undefined orClause → no ownership filter
    const orClause = await this.buildEscrowOrClause(clientId);
    const escrowWhere = orClause ? { OR: orClause } : {};
    const directWhere = clientId ? { clientId } : {};

    const [
      escrows, directPayments, activeEscrowAgg,
      escrows24h, escrows7d, escrows30d,
      payments24h, payments7d, payments30d,
      totalClients, verifiedClients, pendingClients,
    ] = await Promise.all([
      this.prisma.institutionEscrow.findMany({
        where: escrowWhere as any,
        select: { amount: true, platformFee: true, status: true },
      }),
      this.prisma.directPayment.findMany({
        where: directWhere,
        select: { amount: true, platformFee: true, status: true },
      }),
      this.prisma.institutionEscrow.aggregate({
        where: { ...escrowWhere, status: { in: ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'RELEASING'] } } as any,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.institutionEscrow.aggregate({ where: { ...escrowWhere, createdAt: { gte: day1 } } as any, _sum: { amount: true } }),
      this.prisma.institutionEscrow.aggregate({ where: { ...escrowWhere, createdAt: { gte: day7 } } as any, _sum: { amount: true } }),
      this.prisma.institutionEscrow.aggregate({ where: { ...escrowWhere, createdAt: { gte: day30 } } as any, _sum: { amount: true } }),
      this.prisma.directPayment.aggregate({ where: { ...directWhere, createdAt: { gte: day1 } }, _sum: { amount: true } }),
      this.prisma.directPayment.aggregate({ where: { ...directWhere, createdAt: { gte: day7 } }, _sum: { amount: true } }),
      this.prisma.directPayment.aggregate({ where: { ...directWhere, createdAt: { gte: day30 } }, _sum: { amount: true } }),
      this.prisma.institutionClient.count(),
      this.prisma.institutionClient.count({ where: { kycStatus: 'VERIFIED' } }),
      this.prisma.institutionClient.count({ where: { kycStatus: 'PENDING' } }),
    ]);

    const totalEscrowVolume = escrows.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const totalDirectVolume = directPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    const completedEscrows = escrows.filter((e: any) => ['COMPLETE', 'RELEASED'].includes(e.status)).length;
    const completedPayments = directPayments.filter((p: any) => p.status === 'completed').length;
    const totalFees = escrows.reduce((sum: number, e: any) => sum + Number(e.platformFee), 0)
      + directPayments.reduce((sum: number, p: any) => sum + Number(p.platformFee), 0);
    const totalVolume = totalEscrowVolume + totalDirectVolume;

    return {
      // Original fields (backward compat)
      totalVolume,
      escrowVolume: totalEscrowVolume,
      directPaymentVolume: totalDirectVolume,
      activeEscrows: activeEscrowAgg._count,
      completedTransactions: completedEscrows + completedPayments,
      totalFees,
      escrowCount: escrows.length,
      directPaymentCount: directPayments.length,
      // Frontend-expected fields
      totalVolumeUsd: totalVolume,
      volume24h: Number(escrows24h._sum.amount || 0) + Number(payments24h._sum.amount || 0),
      volume7d: Number(escrows7d._sum.amount || 0) + Number(payments7d._sum.amount || 0),
      volume30d: Number(escrows30d._sum.amount || 0) + Number(payments30d._sum.amount || 0),
      totalClients,
      verifiedClients,
      pendingClients,
      totalPayments: escrows.length + directPayments.length,
      directCount: directPayments.length,
      escrowHeldUsd: Number(activeEscrowAgg._sum.amount || 0),
    };
  }

  async getCashflow(clientId: string | null, period: string = '7d') {
    const PERIOD_MAP: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '6m': 180, '12m': 365, '90d': 90 };
    const days = PERIOD_MAP[period] || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const isAdmin = !clientId;
    const wallets = clientId ? await this.getClientWallets(clientId) : [];
    const escrowWhere = clientId
      ? { OR: [{ clientId }, ...(wallets.length > 0 ? [{ recipientWallet: { in: wallets } }] : [])], createdAt: { gte: since } }
      : { createdAt: { gte: since } };
    const directWhere = clientId
      ? { clientId, createdAt: { gte: since } }
      : { createdAt: { gte: since } };

    const [escrows, payments] = await Promise.all([
      this.prisma.institutionEscrow.findMany({
        where: escrowWhere as any,
        select: { amount: true, status: true, createdAt: true, fundedAt: true, resolvedAt: true, corridor: true, clientId: true, recipientWallet: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.directPayment.findMany({
        where: directWhere,
        select: { amount: true, status: true, createdAt: true, settledAt: true, corridor: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Aggregate raw data by date key
    const byKey: Record<string, { sent: number; received: number }> = {};
    const addToKey = (key: string, sent: number, received: number) => {
      if (!byKey[key]) byKey[key] = { sent: 0, received: 0 };
      byKey[key].sent += sent;
      byKey[key].received += received;
    };

    for (const e of escrows as any[]) {
      const amt = Number(e.amount);

      if (isAdmin) {
        // Admin view: funded = sent (deposited into escrow), released = received (paid out)
        if (e.fundedAt && ['FUNDED', 'COMPLETE', 'RELEASED'].includes(e.status)) {
          addToKey(e.fundedAt.toISOString().split('T')[0], amt, 0);
        }
        if (e.resolvedAt && ['COMPLETE', 'RELEASED'].includes(e.status)) {
          addToKey(e.resolvedAt.toISOString().split('T')[0], 0, amt);
        }
      } else {
        // Client view: determine if this institution is the payer or recipient
        const isPayer = e.clientId === clientId;
        const isRecipient = !isPayer && wallets.includes(e.recipientWallet);

        if (e.fundedAt && ['FUNDED', 'COMPLETE', 'RELEASED'].includes(e.status)) {
          if (isPayer) addToKey(e.fundedAt.toISOString().split('T')[0], amt, 0);
          if (isRecipient) addToKey(e.fundedAt.toISOString().split('T')[0], 0, amt);
        }
        if (e.resolvedAt && ['COMPLETE', 'RELEASED'].includes(e.status)) {
          if (isPayer) addToKey(e.resolvedAt.toISOString().split('T')[0], 0, amt);
          if (isRecipient) addToKey(e.resolvedAt.toISOString().split('T')[0], amt, 0);
        }
      }
    }
    for (const p of payments) {
      const amt = Number(p.amount);
      const date = (p.settledAt || p.createdAt).toISOString().split('T')[0];
      if (p.status === 'completed') addToKey(date, amt, 0);
    }

    // Build labeled bars for the requested period
    const now = new Date();
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const bars: Array<{ label: string; sent: number; received: number; interest: number; forecast: boolean }> = [];

    if (period === '24h') {
      for (let h = 23; h >= 0; h--) {
        const d = new Date(now); d.setHours(d.getHours() - h, 0, 0, 0);
        const key = d.toISOString().split('T')[0];
        const vals = byKey[key] || { sent: 0, received: 0 };
        // Distribute daily total evenly across hours as approximation
        bars.push({ label: `${d.getHours()}:00`, sent: Math.round(vals.sent / 24), received: Math.round(vals.received / 24), interest: 0, forecast: false });
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
      // 7d, 30d, 90d — one bar per day
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

  async getPendingActions(clientId: string | null) {
    const pendingWhere = await this.escrowWhereForClient(clientId, {
      status: { in: ['CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'PENDING_RELEASE'] },
    });
    const pendingEscrows = await this.prisma.institutionEscrow.findMany({
      where: pendingWhere as any,
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

  async getRecentDirect(clientId: string | null, limit: number = 10) {
    const payments = await this.prisma.directPayment.findMany({
      where: clientId ? { clientId } : {},
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

  async getBranchActivity(clientId: string | null) {
    const branches = await this.prisma.institutionBranch.findMany({
      where: clientId ? { clientId } : {},
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
              ...(clientId ? { clientId } : {}),
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

  async getCorridorActivity(clientId: string | null) {
    const corridorWhere = await this.escrowWhereForClient(clientId, { corridor: { not: null } });
    const [escrows, payments, corridors] = await Promise.all([
      this.prisma.institutionEscrow.groupBy({
        by: ['corridor'],
        where: corridorWhere as any,
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.directPayment.groupBy({
        by: ['corridor'],
        where: clientId ? { clientId } : {},
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

  async getComplianceScorecard(clientId: string | null) {
    const escrowWhere = await this.escrowWhereForClient(clientId);
    const [aiAnalyses, auditLogs, escrows] = await Promise.all([
      this.prisma.institutionAiAnalysis.findMany({
        where: clientId ? { clientId } : {},
        select: { riskScore: true, recommendation: true, analysisType: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.institutionAuditLog.findMany({
        where: {
          ...(clientId ? { clientId } : {}),
          action: { in: ['COMPLIANCE_HOLD', 'COMPLIANCE_CHECK_PASSED', 'COMPLIANCE_CHECK_FAILED'] },
        },
        select: { action: true, createdAt: true },
      }),
      this.prisma.institutionEscrow.findMany({
        where: escrowWhere as any,
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

  async getSanctions(clientId: string | null) {
    const [sanctionedBranches, client] = await Promise.all([
      this.prisma.institutionBranch.findMany({
        where: { ...(clientId ? { clientId } : {}), isSanctioned: true },
        select: {
          id: true, name: true, city: true, country: true,
          countryCode: true, sanctionReason: true, complianceStatus: true,
        },
      }),
      clientId
        ? this.prisma.institutionClient.findUnique({
            where: { id: clientId },
            select: { sanctionsStatus: true },
          })
        : Promise.resolve(null),
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
