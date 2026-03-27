import crypto from 'crypto';
import { prisma } from '../config/database';
import type { PrismaClient } from '../generated/prisma';

export class InstitutionDirectPaymentService {
  private prisma: PrismaClient;
  constructor() { this.prisma = prisma; }

  /**
   * Generate a human-readable payment code in EE-XXX-XXX format.
   */
  generatePaymentCode(): string {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const bytes = crypto.randomBytes(6);
    let code = 'EE-';
    for (let i = 0; i < 6; i++) {
      if (i === 3) code += '-';
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

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

    return { data: await Promise.all(payments.map((p: any) => this.format(p))), total, limit, offset };
  }

  async getById(clientId: string, paymentId: string) {
    const isCode = paymentId.startsWith('EE-');
    const payment = await this.prisma.directPayment.findFirst({
      where: isCode ? { paymentCode: paymentId, clientId } : { id: paymentId, clientId },
    });
    if (!payment) return null;

    const auditLogs = await this.prisma.institutionAuditLog.findMany({
      where: {
        clientId,
        action: { in: ['DIRECT_PAYMENT_CREATED', 'DIRECT_PAYMENT_COMPLETED', 'DIRECT_PAYMENT_FAILED'] },
        OR: [
          { details: { path: ['paymentId'], equals: payment.id } },
          ...(payment.paymentCode ? [{ details: { path: ['paymentId'], equals: payment.paymentCode } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' }, take: 10,
    });

    return {
      ...(await this.format(payment)),
      activityLog: auditLogs.map((l: any) => ({ id: l.id, action: l.action, actor: l.actor, details: l.details, createdAt: l.createdAt })),
    };
  }

  /**
   * Resolve account + branch details for a wallet address.
   */
  private async resolveParty(wallet: string): Promise<{
    clientId: string; name: string; accountLabel: string | null; branchName: string | null; wallet: string;
  } | null> {
    const account = await this.prisma.institutionAccount.findFirst({
      where: { walletAddress: wallet, isActive: true },
      select: {
        label: true,
        client: { select: { id: true, companyName: true } },
        branch: { select: { name: true } },
      },
    });
    if (!account) return null;
    return {
      clientId: account.client.id,
      name: account.client.companyName,
      accountLabel: account.label || null,
      branchName: account.branch?.name || null,
      wallet,
    };
  }

  private async format(p: any) {
    const [from, to] = await Promise.all([
      this.resolveParty(p.senderWallet),
      this.resolveParty(p.recipientWallet),
    ]);

    return {
      id: p.paymentCode || p.id, paymentId: p.paymentCode || p.id, internalId: p.id,
      sender: p.sender, senderCountry: p.senderCountry, senderWallet: p.senderWallet,
      recipient: p.recipient, recipientCountry: p.recipientCountry, recipientWallet: p.recipientWallet,
      from: from || { clientId: p.clientId, name: p.sender, accountLabel: null, branchName: null, wallet: p.senderWallet },
      to: to || { clientId: null, name: p.recipient, accountLabel: null, branchName: null, wallet: p.recipientWallet },
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
