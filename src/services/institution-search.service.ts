/**
 * Institution Search Service
 *
 * Sitewide search across clients, escrows, accounts, and notifications.
 * All queries are scoped to the authenticated client's data.
 */

import { prisma } from '../config/database';

export interface SearchParams {
  clientId: string;
  query: string;
  limit?: number;
  categories?: string[];
}

export interface SearchResult {
  category: 'escrow' | 'client' | 'account' | 'notification' | 'payment' | 'pool';
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  counts: {
    escrows: number;
    clients: number;
    accounts: number;
    notifications: number;
    payments: number;
    pools: number;
    total: number;
  };
}

const MAX_PER_CATEGORY = 10;

class InstitutionSearchService {
  async search(params: SearchParams): Promise<SearchResponse> {
    const { clientId, query, limit = MAX_PER_CATEGORY, categories } = params;
    const perCategory = Math.min(limit, MAX_PER_CATEGORY);
    const q = query.trim();

    const shouldSearch = (cat: string) => !categories || categories.includes(cat);

    const [escrows, clients, accounts, notifications, payments, pools] = await Promise.all([
      shouldSearch('escrow') ? this.searchEscrows(clientId, q, perCategory) : [],
      shouldSearch('client') ? this.searchClients(clientId, q, perCategory) : [],
      shouldSearch('account') ? this.searchAccounts(clientId, q, perCategory) : [],
      shouldSearch('notification') ? this.searchNotifications(clientId, q, perCategory) : [],
      shouldSearch('payment') ? this.searchPayments(clientId, q, perCategory) : [],
      shouldSearch('pool') ? this.searchPools(clientId, q, perCategory) : [],
    ]);

    const results = [...escrows, ...clients, ...accounts, ...notifications, ...payments, ...pools];

    return {
      query: q,
      results,
      counts: {
        escrows: escrows.length,
        clients: clients.length,
        accounts: accounts.length,
        notifications: notifications.length,
        payments: payments.length,
        pools: pools.length,
        total: results.length,
      },
    };
  }

  private async searchEscrows(clientId: string, q: string, limit: number): Promise<SearchResult[]> {
    const isEscrowCode = /^EE-/i.test(q);
    const isAmount = /^\d+(\.\d+)?$/.test(q);
    const isWallet = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);

    const or: any[] = [];

    if (isEscrowCode) {
      or.push({ escrowCode: { contains: q, mode: 'insensitive' } });
    } else if (isAmount) {
      or.push({ amount: { equals: parseFloat(q) } });
    } else if (isWallet) {
      or.push(
        { payerWallet: { equals: q } },
        { recipientWallet: { equals: q } },
      );
    } else {
      // General text: search escrow code, corridor, wallets
      or.push(
        { escrowCode: { contains: q, mode: 'insensitive' } },
        { corridor: { contains: q, mode: 'insensitive' } },
        { payerWallet: { startsWith: q } },
        { recipientWallet: { startsWith: q } },
      );

      // Check if query matches a status name
      const statusMatch = this.matchStatus(q);
      if (statusMatch) {
        or.push({ status: statusMatch });
      }
    }

    const escrows = await prisma.institutionEscrow.findMany({
      where: { clientId, OR: or },
      select: {
        escrowCode: true,
        escrowId: true,
        status: true,
        amount: true,
        corridor: true,
        payerWallet: true,
        recipientWallet: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return escrows.map((e) => ({
      category: 'escrow' as const,
      id: e.escrowCode,
      title: `${e.escrowCode} — ${Number(e.amount)} USDC`,
      subtitle: e.corridor
        ? `${e.corridor} · ${e.payerWallet.slice(0, 4)}...${e.payerWallet.slice(-4)}`
        : `${e.payerWallet.slice(0, 4)}...${e.payerWallet.slice(-4)}`,
      status: e.status,
      metadata: {
        escrowId: e.escrowId,
        amount: Number(e.amount),
        corridor: e.corridor,
        createdAt: e.createdAt,
      },
    }));
  }

  private async searchClients(clientId: string, q: string, limit: number): Promise<SearchResult[]> {
    const clients = await prisma.institutionClient.findMany({
      where: {
        id: { not: clientId },
        isArchived: false,
        isTestAccount: false,
        OR: [
          { companyName: { contains: q, mode: 'insensitive' } },
          { legalName: { contains: q, mode: 'insensitive' } },
          { tradingName: { contains: q, mode: 'insensitive' } },
          { contactFirstName: { contains: q, mode: 'insensitive' } },
          { contactLastName: { contains: q, mode: 'insensitive' } },
          { industry: { contains: q, mode: 'insensitive' } },
          { country: { contains: q, mode: 'insensitive' } },
          { jurisdiction: { contains: q, mode: 'insensitive' } },
          { businessDescription: { contains: q, mode: 'insensitive' } },
          { registrationNumber: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        companyName: true,
        legalName: true,
        contactFirstName: true,
        contactLastName: true,
        industry: true,
        country: true,
        tier: true,
        status: true,
      },
      orderBy: { companyName: 'asc' },
      take: limit,
    });

    return clients.map((c) => ({
      category: 'client' as const,
      id: c.id,
      title: c.companyName,
      subtitle: [c.contactFirstName, c.contactLastName].filter(Boolean).join(' ')
        || [c.industry, c.country].filter(Boolean).join(' · ')
        || c.tier,
      status: c.status,
      metadata: {
        legalName: c.legalName,
        contactName: [c.contactFirstName, c.contactLastName].filter(Boolean).join(' ') || undefined,
        tier: c.tier,
      },
    }));
  }

  private async searchAccounts(clientId: string, q: string, limit: number): Promise<SearchResult[]> {
    const isWallet = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);

    const or: any[] = [
      { name: { contains: q, mode: 'insensitive' } },
      { label: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { notificationEmail: { contains: q, mode: 'insensitive' } },
    ];

    if (isWallet) {
      or.push({ walletAddress: { equals: q } });
    } else {
      or.push({ walletAddress: { startsWith: q } });
    }

    const accounts = await prisma.institutionAccount.findMany({
      where: { clientId, OR: or },
      select: {
        id: true,
        name: true,
        label: true,
        accountType: true,
        walletAddress: true,
        verificationStatus: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return accounts.map((a) => ({
      category: 'account' as const,
      id: a.id,
      title: a.label || a.name,
      subtitle: `${a.accountType} · ${a.walletAddress.slice(0, 4)}...${a.walletAddress.slice(-4)}`,
      status: a.verificationStatus,
      metadata: {
        accountType: a.accountType,
        walletAddress: a.walletAddress,
        isActive: a.isActive,
      },
    }));
  }

  private async searchNotifications(clientId: string, q: string, limit: number): Promise<SearchResult[]> {
    const notifications = await prisma.institutionNotification.findMany({
      where: {
        clientId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { message: { contains: q, mode: 'insensitive' } },
          { escrowId: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        priority: true,
        isRead: true,
        escrowId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return notifications.map((n) => ({
      category: 'notification' as const,
      id: n.id,
      title: n.title,
      subtitle: n.message.length > 80 ? n.message.slice(0, 80) + '…' : n.message,
      status: n.isRead ? 'READ' : 'UNREAD',
      metadata: {
        type: n.type,
        priority: n.priority,
        escrowId: n.escrowId,
        createdAt: n.createdAt,
      },
    }));
  }

  private async searchPayments(clientId: string, q: string, limit: number): Promise<SearchResult[]> {
    const isAmount = /^\d+(\.\d+)?$/.test(q);
    const isWallet = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);

    const or: any[] = [];

    if (isAmount) {
      or.push({ amount: { equals: parseFloat(q) } });
    } else if (isWallet) {
      or.push(
        { senderWallet: { equals: q } },
        { recipientWallet: { equals: q } },
      );
    } else {
      or.push(
        { paymentCode: { startsWith: q, mode: 'insensitive' } },
        { sender: { contains: q, mode: 'insensitive' } },
        { recipient: { contains: q, mode: 'insensitive' } },
        { corridor: { contains: q, mode: 'insensitive' } },
        { senderWallet: { startsWith: q } },
        { recipientWallet: { startsWith: q } },
      );

      const statusMatch = this.matchPaymentStatus(q);
      if (statusMatch) {
        or.push({ status: statusMatch });
      }
    }

    if (or.length === 0) return [];

    const payments = await prisma.directPayment.findMany({
      where: { clientId, OR: or },
      select: {
        id: true,
        paymentCode: true,
        sender: true,
        recipient: true,
        senderWallet: true,
        recipientWallet: true,
        amount: true,
        currency: true,
        corridor: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return payments.map((p) => ({
      category: 'payment' as const,
      id: p.id,
      title: p.paymentCode ? `${p.paymentCode} · ${Number(p.amount)} ${p.currency}` : `${Number(p.amount)} ${p.currency}`,
      subtitle: `${p.sender} → ${p.recipient}${p.corridor ? ` · ${p.corridor}` : ''}`,
      status: p.status,
      metadata: {
        paymentCode: p.paymentCode,
        amount: Number(p.amount),
        currency: p.currency,
        corridor: p.corridor,
        sender: p.sender,
        recipient: p.recipient,
        createdAt: p.createdAt,
      },
    }));
  }

  private async searchPools(clientId: string, q: string, limit: number): Promise<SearchResult[]> {
    const or: any[] = [
      { poolCode: { contains: q, mode: 'insensitive' } },
      { corridor: { contains: q, mode: 'insensitive' } },
    ];

    const statusMatch = this.matchPoolStatus(q);
    if (statusMatch) {
      or.push({ status: statusMatch });
    }

    const pools = await prisma.transactionPool.findMany({
      where: { clientId, OR: or },
      select: {
        id: true,
        poolCode: true,
        status: true,
        totalAmount: true,
        memberCount: true,
        corridor: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return pools.map((p) => ({
      category: 'pool' as const,
      id: p.id,
      title: `${p.poolCode} — ${Number(p.totalAmount)} USDC (${p.memberCount} members)`,
      subtitle: p.corridor || 'No corridor',
      status: p.status,
      metadata: {
        poolCode: p.poolCode,
        totalAmount: Number(p.totalAmount),
        memberCount: p.memberCount,
        corridor: p.corridor,
        createdAt: p.createdAt,
      },
    }));
  }

  private matchPoolStatus(q: string): string | null {
    const statuses = ['OPEN', 'LOCKED', 'SETTLING', 'SETTLED', 'PARTIAL_FAIL', 'FAILED', 'CANCELLED'];
    const upper = q.toUpperCase().replace(/\s+/g, '_');
    return statuses.find((s) => s === upper || s.startsWith(upper)) || null;
  }

  private matchPaymentStatus(q: string): string | null {
    const statuses = ['completed', 'processing', 'failed'];
    const lower = q.toLowerCase();
    return statuses.find((s) => s === lower || s.startsWith(lower)) || null;
  }

  private matchStatus(q: string): string | null {
    const statuses = [
      'DRAFT', 'CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'RELEASING', 'RELEASED',
      'INSUFFICIENT_FUNDS', 'COMPLETE', 'CANCELLING', 'CANCELLED', 'EXPIRED', 'FAILED',
    ];
    const upper = q.toUpperCase().replace(/\s+/g, '_');
    return statuses.find((s) => s === upper || s.startsWith(upper)) || null;
  }
}

let instance: InstitutionSearchService | null = null;
export function getInstitutionSearchService(): InstitutionSearchService {
  if (!instance) {
    instance = new InstitutionSearchService();
  }
  return instance;
}
