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
      action: { in: ['COMPLIANCE_HOLD', 'COMPLIANCE_CHECK_PASSED', 'COMPLIANCE_CHECK_FAILED', 'ESCROW_CREATED', 'FUNDS_RELEASED', 'ESCROW_CANCELLED'] },
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

    const results: any[] = [];

    if (!type || type === 'escrow') {
      const escrowWhere: any = { clientId, status: { in: ['COMPLETE', 'RELEASED'] } };
      if (hasDateFilter) escrowWhere.resolvedAt = dateFilter;
      const escrows = await this.prisma.institutionEscrow.findMany({ where: escrowWhere, orderBy: { resolvedAt: 'desc' } });
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
      const payments = await this.prisma.directPayment.findMany({ where: paymentWhere, orderBy: { settledAt: 'desc' } });
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

    return { data: results.slice(offset, offset + limit), total: results.length, limit, offset };
  }

  async getEscrowLog(clientId: string, params: { escrowId?: string; from?: string; to?: string; limit?: number; offset?: number }) {
    const { escrowId, from, to, limit = 50, offset = 0 } = params;
    const where: any = {
      clientId,
      action: { in: ['ESCROW_CREATED', 'DRAFT_UPDATED', 'DRAFT_SUBMITTED', 'DEPOSIT_CONFIRMED', 'FUNDS_RELEASED', 'ESCROW_CANCELLED', 'ESCROW_EXPIRED', 'COMPLIANCE_HOLD', 'INSUFFICIENT_FUNDS'] },
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
