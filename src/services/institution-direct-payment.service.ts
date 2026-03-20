import { prisma } from '../config/database';
import type { PrismaClient } from '../generated/prisma';

export class InstitutionDirectPaymentService {
  private prisma: PrismaClient;
  constructor() { this.prisma = prisma; }

  async list(clientId: string, params: { status?: string; corridor?: string; from?: string; to?: string; limit?: number; offset?: number }) {
    const { status, corridor, from, to, limit = 20, offset = 0 } = params;
    const where: any = { clientId };
    if (status) where.status = status;
    if (corridor) where.corridor = corridor;
    if (from || to) { where.createdAt = {}; if (from) where.createdAt.gte = new Date(from); if (to) where.createdAt.lte = new Date(to); }

    const [payments, total] = await Promise.all([
      this.prisma.directPayment.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      this.prisma.directPayment.count({ where }),
    ]);

    return { data: payments.map((p: any) => this.format(p)), total, limit, offset };
  }

  async getById(clientId: string, paymentId: string) {
    const payment = await this.prisma.directPayment.findFirst({ where: { id: paymentId, clientId } });
    if (!payment) throw new Error(`Direct payment not found: ${paymentId}`);

    const auditLogs = await this.prisma.institutionAuditLog.findMany({
      where: { clientId, action: { in: ['DIRECT_PAYMENT_CREATED', 'DIRECT_PAYMENT_COMPLETED', 'DIRECT_PAYMENT_FAILED'] } },
      orderBy: { createdAt: 'desc' }, take: 10,
    });

    return {
      ...this.format(payment),
      activityLog: auditLogs.map((l: any) => ({ id: l.id, action: l.action, actor: l.actor, details: l.details, createdAt: l.createdAt })),
    };
  }

  private format(p: any) {
    return {
      id: p.id, sender: p.sender, senderCountry: p.senderCountry, senderWallet: p.senderWallet,
      recipient: p.recipient, recipientCountry: p.recipientCountry, recipientWallet: p.recipientWallet,
      amount: Number(p.amount), currency: p.currency, corridor: p.corridor, status: p.status,
      txHash: p.txHash, platformFee: Number(p.platformFee), riskScore: p.riskScore,
      settlementMode: p.settlementMode, releaseMode: p.releaseMode,
      settledAt: p.settledAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
    };
  }
}

let instance: InstitutionDirectPaymentService | null = null;
export function getInstitutionDirectPaymentService(): InstitutionDirectPaymentService {
  if (!instance) { instance = new InstitutionDirectPaymentService(); }
  return instance;
}
