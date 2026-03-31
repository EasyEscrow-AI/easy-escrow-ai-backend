/**
 * Institution Escrow Receipt Service
 *
 * Generates professional bank-statement-style HTML receipts for institution escrows.
 * Includes client details, escrow details, transactions, audit trail, and compliance info.
 */

import { PrismaClient } from '../generated/prisma';
import { prisma as sharedPrisma } from '../config/database';
import { escrowWhere } from '../utils/uuid-conversion';
import fs from 'fs';
import path from 'path';

export interface ReceiptData {
  // Client
  client: {
    companyName: string;
    legalName: string | null;
    tradingName: string | null;
    email: string;
    tier: string;
    jurisdiction: string | null;
    registrationNumber: string | null;
    registrationCountry: string | null;
    entityType: string | null;
    lei: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    contactFirstName: string | null;
    contactLastName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    contactTitle: string | null;
    regulatoryBody: string | null;
    licenseNumber: string | null;
  };
  // Escrow
  escrow: {
    escrowId: string;
    status: string;
    corridor: string;
    conditionType: string;
    amount: string;
    platformFee: string;
    netAmount: string;
    currency: string;
    payerWallet: string;
    recipientWallet: string;
    settlementAuthority: string;
    escrowPda: string | null;
    vaultPda: string | null;
    riskScore: number | null;
    createdAt: string;
    fundedAt: string | null;
    resolvedAt: string | null;
    expiresAt: string;
  };
  // Transactions
  transactions: {
    type: string;
    signature: string;
    amount: string;
    confirmedAt: string | null;
    blockHeight: string | null;
  }[];
  // Audit trail
  auditLogs: {
    action: string;
    actor: string;
    timestamp: string;
    details: string;
  }[];
  // Compliance
  compliance: {
    riskScore: number;
    recommendation: string;
    model: string;
    factors: { name: string; weight: number; value: string }[];
    analyzedAt: string;
  } | null;
  // Meta
  generatedAt: string;
  receiptNumber: string;
  logoBase64: string;
}

export class InstitutionReceiptService {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || sharedPrisma;
  }

  /**
   * Load the EasyEscrow logo as a base64 data URI
   */
  private loadLogoBase64(): string {
    try {
      const logoPath = path.resolve(__dirname, '../../media/easyescrow-logo.png');
      const logoBuffer = fs.readFileSync(logoPath);
      return `data:image/png;base64,${logoBuffer.toString('base64')}`;
    } catch {
      return '';
    }
  }

  /**
   * Fetch all data needed for a receipt
   */
  async getReceiptData(escrowId: string, clientId: string): Promise<ReceiptData> {
    const escrow = await this.prisma.institutionEscrow.findFirst({
      where: { ...escrowWhere(escrowId), clientId },
      include: {
        client: true,
        deposits: { orderBy: { createdAt: 'asc' } },
        auditLogs: { orderBy: { createdAt: 'asc' } },
        aiAnalyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!escrow) {
      throw new Error(`Escrow not found: ${escrowId}`);
    }

    const c = escrow.client;
    const amount = Number(escrow.amount);
    const fee = Number(escrow.platformFee);

    // Build transaction list
    const transactions: ReceiptData['transactions'] = [];

    for (const dep of escrow.deposits) {
      transactions.push({
        type: 'Deposit',
        signature: dep.txSignature,
        amount: Number(dep.amount).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }),
        confirmedAt: dep.confirmedAt ? formatDate(dep.confirmedAt) : null,
        blockHeight: dep.blockHeight ? dep.blockHeight.toString() : null,
      });
    }

    if (escrow.releaseTxSignature) {
      transactions.push({
        type: 'Release',
        signature: escrow.releaseTxSignature,
        amount: (amount - fee).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }),
        confirmedAt: escrow.resolvedAt ? formatDate(escrow.resolvedAt) : null,
        blockHeight: null,
      });
    }

    if (escrow.cancelTxSignature) {
      transactions.push({
        type: 'Cancellation',
        signature: escrow.cancelTxSignature,
        amount: amount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }),
        confirmedAt: escrow.resolvedAt ? formatDate(escrow.resolvedAt) : null,
        blockHeight: null,
      });
    }

    // Build audit logs
    const auditLogs: ReceiptData['auditLogs'] = escrow.auditLogs
      .filter((l) => l.action !== 'STAGING_SEED')
      .map((l) => ({
        action: formatAction(l.action),
        actor: l.actor,
        timestamp: formatDate(l.createdAt),
        details: typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details),
      }));

    // Compliance
    const analysis = escrow.aiAnalyses[0] || null;
    const compliance: ReceiptData['compliance'] = analysis
      ? {
          riskScore: analysis.riskScore,
          recommendation: analysis.recommendation,
          model: analysis.model,
          factors: (analysis.factors as any[]) || [],
          analyzedAt: formatDate(analysis.createdAt),
        }
      : null;

    const receiptNumber = `${escrow.escrowCode}-${Date.now().toString(36).toUpperCase()}`;

    return {
      client: {
        companyName: c.companyName,
        legalName: c.legalName,
        tradingName: c.tradingName,
        email: c.email,
        tier: c.tier,
        jurisdiction: c.jurisdiction,
        registrationNumber: c.registrationNumber,
        registrationCountry: c.registrationCountry,
        entityType: c.entityType,
        lei: c.lei,
        addressLine1: c.addressLine1,
        addressLine2: c.addressLine2,
        city: c.city,
        state: c.state,
        postalCode: c.postalCode,
        country: c.country,
        contactFirstName: c.contactFirstName,
        contactLastName: c.contactLastName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        contactTitle: c.contactTitle,
        regulatoryBody: c.regulatoryBody,
        licenseNumber: c.licenseNumber,
      },
      escrow: {
        escrowId: escrow.escrowCode,
        status: escrow.status,
        corridor: escrow.corridor ?? 'N/A',
        conditionType: escrow.conditionType ?? 'N/A',
        amount: amount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }),
        platformFee: fee.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }),
        netAmount: (amount - fee).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }),
        currency: 'USDC',
        payerWallet: escrow.payerWallet,
        recipientWallet: escrow.recipientWallet ?? 'N/A',
        settlementAuthority: escrow.settlementAuthority,
        escrowPda: escrow.escrowPda,
        vaultPda: escrow.vaultPda,
        riskScore: escrow.riskScore,
        createdAt: formatDate(escrow.createdAt),
        fundedAt: escrow.fundedAt ? formatDate(escrow.fundedAt) : null,
        resolvedAt: escrow.resolvedAt ? formatDate(escrow.resolvedAt) : null,
        expiresAt: escrow.expiresAt ? formatDate(escrow.expiresAt) : 'N/A',
      },
      transactions,
      auditLogs,
      compliance,
      generatedAt: formatDate(new Date()),
      receiptNumber,
      logoBase64: this.loadLogoBase64(),
    };
  }

  /**
   * Render a receipt as HTML
   */
  renderReceiptHTML(data: ReceiptData): string {
    return buildReceiptHTML(data);
  }

  /**
   * Render a receipt as a PDF buffer (on-the-fly via Puppeteer)
   */
  async renderReceiptPDF(data: ReceiptData): Promise<Buffer> {
    const puppeteer = await import('puppeteer');
    const html = buildReceiptHTML(data);

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
        displayHeaderFooter: false,
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate a PDF receipt for an escrow and return the buffer
   */
  async generatePDF(
    escrowId: string,
    clientId: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const data = await this.getReceiptData(escrowId, clientId);
    const buffer = await this.renderReceiptPDF(data);
    const filename = `${data.receiptNumber}.pdf`;
    return { buffer, filename };
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateWallet(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

function statusBadgeColor(status: string): string {
  const colors: Record<string, string> = {
    CREATED: '#2563eb',
    FUNDED: '#7c3aed',
    COMPLIANCE_HOLD: '#d97706',
    RELEASING: '#0891b2',
    RELEASED: '#059669',
    CANCELLING: '#dc2626',
    CANCELLED: '#6b7280',
    EXPIRED: '#9ca3af',
    FAILED: '#dc2626',
  };
  return colors[status] || '#6b7280';
}

function riskColor(score: number): string {
  if (score < 30) return '#059669';
  if (score < 60) return '#d97706';
  return '#dc2626';
}

// ─── HTML Template ────────────────────────────────────────────

function buildReceiptHTML(d: ReceiptData): string {
  const clientAddress = [
    d.client.addressLine1,
    d.client.addressLine2,
    d.client.city,
    d.client.state,
    d.client.postalCode,
    d.client.country,
  ]
    .filter(Boolean)
    .join(', ');

  const contactName = [d.client.contactFirstName, d.client.contactLastName]
    .filter(Boolean)
    .join(' ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Escrow Receipt — ${esc(d.receiptNumber)}</title>
<style>
  @page { margin: 20mm 15mm; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
    color: #1a1a2e;
    background: #fff;
    line-height: 1.5;
  }
  .receipt {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px;
  }

  /* ── Header ─────────────────────────────── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #0f172a;
    padding-bottom: 20px;
    margin-bottom: 24px;
  }
  .header-logo img {
    height: 36px;
    display: block;
  }
  .header-meta {
    text-align: right;
    font-size: 12px;
    color: #475569;
  }
  .header-meta .receipt-number {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.5px;
  }
  .header-meta .doc-title {
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 4px;
  }

  /* ── Status banner ──────────────────────── */
  .status-banner {
    display: inline-block;
    padding: 4px 16px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 20px;
  }

  /* ── Sections ───────────────────────────── */
  .section {
    margin-bottom: 24px;
  }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px;
    margin-bottom: 12px;
  }

  /* ── Two-column grid ────────────────────── */
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 32px;
  }
  .field { margin-bottom: 6px; }
  .field-label {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .field-value {
    font-size: 13px;
    color: #1e293b;
    word-break: break-all;
  }
  .field-value.mono {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 11px;
    color: #334155;
  }

  /* ── Amount highlight ───────────────────── */
  .amount-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
  }
  .amount-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 13px;
  }
  .amount-row.total {
    border-top: 2px solid #0f172a;
    margin-top: 8px;
    padding-top: 8px;
    font-weight: 700;
    font-size: 16px;
  }
  .amount-row .label { color: #64748b; }
  .amount-row .value { color: #0f172a; font-weight: 600; }
  .amount-row.total .value { color: #059669; }

  /* ── Tables ─────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    background: #f1f5f9;
    font-size: 10px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }
  .mono-cell {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 10px;
    word-break: break-all;
  }

  /* ── Risk meter ─────────────────────────── */
  .risk-meter {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 8px 0;
  }
  .risk-bar {
    flex: 1;
    height: 8px;
    background: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
  }
  .risk-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }
  .risk-label {
    font-size: 14px;
    font-weight: 700;
    min-width: 40px;
    text-align: right;
  }
  .recommendation-badge {
    display: inline-block;
    padding: 3px 12px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .rec-approve { background: #d1fae5; color: #065f46; }
  .rec-review { background: #fef3c7; color: #92400e; }
  .rec-reject { background: #fee2e2; color: #991b1b; }

  /* ── Footer ─────────────────────────────── */
  .footer {
    border-top: 2px solid #0f172a;
    padding-top: 16px;
    margin-top: 32px;
    font-size: 11px;
    color: #94a3b8;
    text-align: center;
    line-height: 1.6;
  }
  .footer strong { color: #475569; }

  /* ── Print ──────────────────────────────── */
  @media print {
    body { background: #fff; }
    .receipt { padding: 0; max-width: 100%; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="receipt">

  <!-- Header -->
  <div class="header">
    <div class="header-logo">
      ${
        d.logoBase64
          ? `<img src="${d.logoBase64}" alt="EasyEscrow.ai">`
          : '<strong style="font-size:20px;color:#0f172a;">EasyEscrow.ai</strong>'
      }
    </div>
    <div class="header-meta">
      <div class="doc-title">Escrow Receipt</div>
      <div class="receipt-number">${esc(d.receiptNumber)}</div>
      <div>Generated: ${esc(d.generatedAt)}</div>
    </div>
  </div>

  <!-- Status -->
  <div>
    <span class="status-banner" style="background:${statusBadgeColor(d.escrow.status)}">${esc(
    d.escrow.status
  )}</span>
  </div>

  <!-- Client Details -->
  <div class="section">
    <div class="section-title">Client Information</div>
    <div class="grid-2">
      <div class="field">
        <div class="field-label">Company Name</div>
        <div class="field-value">${esc(d.client.companyName)}</div>
      </div>
      <div class="field">
        <div class="field-label">Legal Name</div>
        <div class="field-value">${esc(d.client.legalName) || '—'}</div>
      </div>
      <div class="field">
        <div class="field-label">Email</div>
        <div class="field-value">${esc(d.client.email)}</div>
      </div>
      <div class="field">
        <div class="field-label">Tier</div>
        <div class="field-value">${esc(d.client.tier)}</div>
      </div>
      <div class="field">
        <div class="field-label">Registered Address</div>
        <div class="field-value">${esc(clientAddress) || '—'}</div>
      </div>
      <div class="field">
        <div class="field-label">Jurisdiction</div>
        <div class="field-value">${esc(d.client.jurisdiction) || '—'}</div>
      </div>
      <div class="field">
        <div class="field-label">Entity Type</div>
        <div class="field-value">${esc(d.client.entityType) || '—'}</div>
      </div>
      <div class="field">
        <div class="field-label">Registration No.</div>
        <div class="field-value">${esc(d.client.registrationNumber) || '—'}</div>
      </div>
      <div class="field">
        <div class="field-label">LEI</div>
        <div class="field-value mono">${esc(d.client.lei) || '—'}</div>
      </div>
      <div class="field">
        <div class="field-label">Regulatory Body / License</div>
        <div class="field-value">${esc(d.client.regulatoryBody) || '—'}${
    d.client.licenseNumber ? ` (${esc(d.client.licenseNumber)})` : ''
  }</div>
      </div>
      <div class="field">
        <div class="field-label">Primary Contact</div>
        <div class="field-value">${esc(contactName) || '—'}${
    d.client.contactTitle ? `, ${esc(d.client.contactTitle)}` : ''
  }</div>
      </div>
      <div class="field">
        <div class="field-label">Contact Email / Phone</div>
        <div class="field-value">${esc(d.client.contactEmail) || '—'} / ${
    esc(d.client.contactPhone) || '—'
  }</div>
      </div>
    </div>
  </div>

  <!-- Escrow Details -->
  <div class="section">
    <div class="section-title">Escrow Details</div>
    <div class="grid-2">
      <div class="field">
        <div class="field-label">Escrow ID</div>
        <div class="field-value mono">${esc(d.escrow.escrowId)}</div>
      </div>
      <div class="field">
        <div class="field-label">Corridor</div>
        <div class="field-value">${esc(d.escrow.corridor)}</div>
      </div>
      <div class="field">
        <div class="field-label">Condition Type</div>
        <div class="field-value">${esc(formatAction(d.escrow.conditionType))}</div>
      </div>
      <div class="field">
        <div class="field-label">Risk Score</div>
        <div class="field-value">${
          d.escrow.riskScore !== null ? `${d.escrow.riskScore} / 100` : '—'
        }</div>
      </div>
      <div class="field">
        <div class="field-label">Payer Wallet</div>
        <div class="field-value mono" title="${esc(d.escrow.payerWallet)}">${esc(
    d.escrow.payerWallet
  )}</div>
      </div>
      <div class="field">
        <div class="field-label">Recipient Wallet</div>
        <div class="field-value mono" title="${esc(d.escrow.recipientWallet)}">${esc(
    d.escrow.recipientWallet
  )}</div>
      </div>
      <div class="field">
        <div class="field-label">Settlement Authority</div>
        <div class="field-value mono" title="${esc(d.escrow.settlementAuthority)}">${esc(
    truncateWallet(d.escrow.settlementAuthority)
  )}</div>
      </div>
      <div class="field">
        <div class="field-label">Escrow PDA</div>
        <div class="field-value mono">${
          d.escrow.escrowPda ? esc(truncateWallet(d.escrow.escrowPda)) : '—'
        }</div>
      </div>
      <div class="field">
        <div class="field-label">Created</div>
        <div class="field-value">${esc(d.escrow.createdAt)}</div>
      </div>
      <div class="field">
        <div class="field-label">Funded</div>
        <div class="field-value">${esc(d.escrow.fundedAt) || '—'}</div>
      </div>
      <div class="field">
        <div class="field-label">Resolved</div>
        <div class="field-value">${esc(d.escrow.resolvedAt) || '—'}</div>
      </div>
      <div class="field">
        <div class="field-label">Expires</div>
        <div class="field-value">${esc(d.escrow.expiresAt)}</div>
      </div>
    </div>
  </div>

  <!-- Amount Summary -->
  <div class="amount-box">
    <div class="amount-row">
      <span class="label">Escrow Amount</span>
      <span class="value">${esc(d.escrow.amount)} ${esc(d.escrow.currency)}</span>
    </div>
    <div class="amount-row">
      <span class="label">Platform Fee</span>
      <span class="value">- ${esc(d.escrow.platformFee)} ${esc(d.escrow.currency)}</span>
    </div>
    <div class="amount-row total">
      <span class="label">Net Settlement</span>
      <span class="value">${esc(d.escrow.netAmount)} ${esc(d.escrow.currency)}</span>
    </div>
  </div>

  <!-- Transactions -->
  ${
    d.transactions.length > 0
      ? `
  <div class="section">
    <div class="section-title">Transactions</div>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Signature</th>
          <th>Amount</th>
          <th>Confirmed</th>
          <th>Block</th>
        </tr>
      </thead>
      <tbody>
        ${d.transactions
          .map(
            (tx) => `
        <tr>
          <td><strong>${esc(tx.type)}</strong></td>
          <td class="mono-cell" title="${esc(tx.signature)}">${esc(
              truncateWallet(tx.signature)
            )}</td>
          <td>${esc(tx.amount)} USDC</td>
          <td>${esc(tx.confirmedAt) || '—'}</td>
          <td>${esc(tx.blockHeight) || '—'}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>
  `
      : ''
  }

  <!-- Compliance -->
  ${
    d.compliance
      ? `
  <div class="section">
    <div class="section-title">Compliance Analysis</div>
    <div class="risk-meter">
      <div class="risk-bar">
        <div class="risk-fill" style="width:${d.compliance.riskScore}%;background:${riskColor(
          d.compliance.riskScore
        )}"></div>
      </div>
      <div class="risk-label" style="color:${riskColor(d.compliance.riskScore)}">${
          d.compliance.riskScore
        }</div>
    </div>
    <div style="margin-bottom:12px;">
      <span class="recommendation-badge ${
        d.compliance.recommendation === 'APPROVE'
          ? 'rec-approve'
          : d.compliance.recommendation === 'REVIEW'
          ? 'rec-review'
          : 'rec-reject'
      }">${esc(d.compliance.recommendation)}</span>
      <span style="font-size:11px;color:#94a3b8;margin-left:8px;">Analyzed: ${esc(
        d.compliance.analyzedAt
      )} &middot; Model: ${esc(d.compliance.model)}</span>
    </div>
    ${
      d.compliance.factors.length > 0
        ? `
    <table>
      <thead>
        <tr>
          <th>Factor</th>
          <th>Weight</th>
          <th>Assessment</th>
        </tr>
      </thead>
      <tbody>
        ${d.compliance.factors
          .map(
            (f) => `
        <tr>
          <td>${esc(formatAction(f.name))}</td>
          <td>${(f.weight * 100).toFixed(0)}%</td>
          <td>${esc(String(f.value))}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
    `
        : ''
    }
  </div>
  `
      : ''
  }

  <!-- Audit Trail -->
  ${
    d.auditLogs.length > 0
      ? `
  <div class="section">
    <div class="section-title">Audit Trail</div>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Action</th>
          <th>Actor</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${d.auditLogs
          .map(
            (log) => `
        <tr>
          <td style="white-space:nowrap">${esc(log.timestamp)}</td>
          <td><strong>${esc(log.action)}</strong></td>
          <td class="mono-cell">${esc(truncateWallet(log.actor))}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(
            log.details
          )}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>
  `
      : ''
  }

  <!-- Footer -->
  <div class="footer">
    <strong>EasyEscrow.ai</strong> &mdash; Institutional USDC Escrow Platform<br>
    This receipt is a system-generated record of the escrow transaction described above.<br>
    Receipt <strong>${esc(d.receiptNumber)}</strong> &middot; Generated ${esc(d.generatedAt)}<br>
    Solana Blockchain &middot; All amounts in USDC (USD Coin)
  </div>

</div>
</body>
</html>`;
}

// Singleton
let instance: InstitutionReceiptService | null = null;

export function getInstitutionReceiptService(): InstitutionReceiptService {
  if (!instance) {
    instance = new InstitutionReceiptService();
  }
  return instance;
}
