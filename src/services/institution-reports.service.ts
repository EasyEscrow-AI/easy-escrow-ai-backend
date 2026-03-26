import { prisma } from '../config/database';
import type { PrismaClient } from '../generated/prisma';

export class InstitutionReportsService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async getComplianceReport(clientId: string, params: { from?: string; to?: string; limit?: number; offset?: number }) {
    const { from, to, limit = 50, offset = 0 } = params;
    const where: any = {
      clientId,
      action: { in: ['COMPLIANCE_HOLD', 'COMPLIANCE_CHECK_PASSED', 'COMPLIANCE_CHECK_FAILED', 'ESCROW_CREATED', 'DRAFT_SUBMITTED', 'DEPOSIT_CONFIRMED', 'FUNDS_RELEASED', 'ESCROW_CANCELLED', 'ESCROW_COMPLETED', 'INSUFFICIENT_FUNDS', 'POOL_CREATED', 'POOL_LOCKED', 'POOL_SETTLED', 'POOL_FAILED', 'POOL_CANCELLED'] },
    };
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(from) };
    if (to) where.createdAt = { ...where.createdAt, lte: new Date(to) };

    const [logs, total] = await Promise.all([
      this.prisma.institutionAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      this.prisma.institutionAuditLog.count({ where }),
    ]);

    return {
      data: logs.map((l: any) => ({ id: l.id, escrowId: l.escrowId, action: l.action, actor: l.actor, details: l.details, ipAddress: l.ipAddress, createdAt: l.createdAt })),
      total, limit, offset,
    };
  }

  async getAuditLog(clientId: string, params: { action?: string; escrowId?: string; from?: string; to?: string; limit?: number; offset?: number }) {
    const { action, escrowId, from, to, limit = 50, offset = 0 } = params;
    const where: any = { clientId };
    if (action) where.action = action;
    if (escrowId) where.escrowId = escrowId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      this.prisma.institutionAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      this.prisma.institutionAuditLog.count({ where }),
    ]);

    return {
      data: logs.map((l: any) => ({ id: l.id, escrowId: l.escrowId, action: l.action, actor: l.actor, details: l.details, ipAddress: l.ipAddress, createdAt: l.createdAt })),
      total, limit, offset,
    };
  }

  async getReceipts(clientId: string, params: { from?: string; to?: string; type?: string; limit?: number; offset?: number }) {
    const { from, to, type, limit = 50, offset = 0 } = params;
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    // Cap per-source fetch to avoid full table scans
    const fetchLimit = limit + offset;

    let escrowTotal = 0;
    let paymentTotal = 0;
    const results: any[] = [];

    if (!type || type === 'escrow') {
      const escrowWhere: any = { clientId, status: { in: ['COMPLETE', 'RELEASED'] } };
      if (hasDateFilter) escrowWhere.resolvedAt = dateFilter;
      const [escrows, count] = await Promise.all([
        this.prisma.institutionEscrow.findMany({
          where: escrowWhere, orderBy: { resolvedAt: 'desc' }, take: fetchLimit,
          select: { escrowCode: true, amount: true, platformFee: true, corridor: true, status: true, payerWallet: true, recipientWallet: true, releaseTxSignature: true, resolvedAt: true, createdAt: true },
        }),
        this.prisma.institutionEscrow.count({ where: escrowWhere }),
      ]);
      escrowTotal = count;
      for (const e of escrows) {
        results.push({
          id: e.escrowCode, type: 'escrow', amount: Number(e.amount), fee: Number(e.platformFee),
          currency: 'USDC', corridor: e.corridor, status: e.status, payerWallet: e.payerWallet,
          recipientWallet: e.recipientWallet, txSignature: e.releaseTxSignature,
          completedAt: e.resolvedAt, createdAt: e.createdAt,
        });
      }
    }

    if (!type || type === 'direct') {
      const paymentWhere: any = { clientId, status: 'completed' };
      if (hasDateFilter) paymentWhere.settledAt = dateFilter;
      const [payments, count] = await Promise.all([
        this.prisma.directPayment.findMany({
          where: paymentWhere, orderBy: { settledAt: 'desc' }, take: fetchLimit,
          select: { id: true, amount: true, platformFee: true, currency: true, corridor: true, status: true, sender: true, recipient: true, txHash: true, settledAt: true, createdAt: true },
        }),
        this.prisma.directPayment.count({ where: paymentWhere }),
      ]);
      paymentTotal = count;
      for (const p of payments) {
        results.push({
          id: p.id, type: 'direct', amount: Number(p.amount), fee: Number(p.platformFee),
          currency: p.currency, corridor: p.corridor, status: p.status,
          sender: p.sender, recipient: p.recipient, txSignature: p.txHash,
          completedAt: p.settledAt, createdAt: p.createdAt,
        });
      }
    }

    results.sort((a, b) => {
      const aDate = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bDate = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bDate - aDate;
    });

    return { data: results.slice(offset, offset + limit), total: escrowTotal + paymentTotal, limit, offset };
  }

  async getEscrowLog(clientId: string, params: { escrowId?: string; from?: string; to?: string; limit?: number; offset?: number }) {
    const { escrowId, from, to, limit = 50, offset = 0 } = params;
    const where: any = {
      clientId,
      action: { in: ['ESCROW_CREATED', 'DRAFT_UPDATED', 'DRAFT_SUBMITTED', 'DEPOSIT_CONFIRMED', 'FUNDS_RELEASED', 'ESCROW_CANCELLED', 'ESCROW_EXPIRED', 'COMPLIANCE_HOLD', 'INSUFFICIENT_FUNDS', 'POOL_CREATED', 'POOL_LOCKED', 'POOL_SETTLED', 'POOL_FAILED', 'POOL_CANCELLED', 'POOL_RELEASE_DEFERRED'] },
    };
    if (escrowId) where.escrowId = escrowId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      this.prisma.institutionAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      this.prisma.institutionAuditLog.count({ where }),
    ]);

    return {
      data: logs.map((l: any) => ({ id: l.id, escrowId: l.escrowId, action: l.action, actor: l.actor, details: l.details, ipAddress: l.ipAddress, createdAt: l.createdAt })),
      total, limit, offset,
    };
  }
}

let instance: InstitutionReportsService | null = null;
export function getInstitutionReportsService(): InstitutionReportsService {
  if (!instance) { instance = new InstitutionReportsService(); }
  return instance;
}
