/**
 * Escrow Rules Engine — Deterministic local analysis
 *
 * Evaluates the same 8 sections as the AI system prompt using simple rules.
 * Returns a "preliminary" result in <1ms, no API calls needed.
 *
 * Used by `analyzeEscrowFast()` to give instant feedback while the full
 * AI analysis runs in the background.
 */

const KNOWN_STABLECOINS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC (Solana)
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT (Solana)
  'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', // EURC (Solana)
  'CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM', // PYUSD (Solana)
];

type SectionStatus = 'pass' | 'warning' | 'fail' | 'pending';

export interface RulesSection {
  status: SectionStatus;
  title: string;
  findings: string;
  checked_fields: string[];
  recommended_corridor?: string | null;
}

export interface RulesEngineResult {
  riskScore: number;
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
  summary: string;
  sections: Record<string, RulesSection>;
  extractedFields: Record<string, unknown>;
  factors: Array<{ name: string; weight: number; value: number }>;
  details: string;
}

interface CorridorInfo {
  code: string;
  riskLevel: string;
  minAmount: number;
  maxAmount: number;
}

export interface EscrowData {
  status: string;
  amount: number;
  platformFee: number;
  tokenMint: string | null;
  corridor: string | null;
  conditionType: string | null;
  settlementAuthority: string | null;
  riskScore: number | null;
  payerWallet: string | null;
  recipientWallet: string | null;
  hasDeposit: boolean;
  depositCount: number;
  fileCount: number;
  expiresAt: string | null;
  depositTxSignature: string | null;
  escrowPda: string | null;
  nonceAccount: string | null;
  client: {
    kycStatus: string | null;
    kybStatus: string | null;
    riskRating: string | null;
    country: string | null;
    entityType: string | null;
    tier: string | null;
  };
  availableCorridors: CorridorInfo[] | null;
}

// Section weights for risk score computation
const SECTION_WEIGHTS: Record<string, number> = {
  from_account: 0.25,
  to_account: 0.10,
  corridor: 0.20,
  amount: 0.15,
  settlement: 0.10,
  release: 0.08,
  advanced: 0.07,
  overview: 0.05,
};

const STATUS_SCORES: Record<SectionStatus, number> = {
  pass: 5,
  pending: 25,
  warning: 45,
  fail: 80,
};

export function evaluateEscrow(data: EscrowData): RulesEngineResult {
  const sections: Record<string, RulesSection> = {};

  // 1. from_account
  sections.from_account = evaluateFromAccount(data);
  // 2. to_account
  sections.to_account = evaluateToAccount(data);
  // 3. corridor
  sections.corridor = evaluateCorridor(data);
  // 4. amount
  sections.amount = evaluateAmount(data);
  // 5. settlement
  sections.settlement = evaluateSettlement(data);
  // 6. release
  sections.release = evaluateRelease(data);
  // 7. advanced
  sections.advanced = evaluateAdvanced(data);
  // 8. overview
  sections.overview = evaluateOverview(sections);

  // Compute weighted risk score
  const factors: Array<{ name: string; weight: number; value: number }> = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, section] of Object.entries(sections)) {
    if (key === 'overview') continue;
    const weight = SECTION_WEIGHTS[key] || 0.1;
    const value = STATUS_SCORES[section.status];
    factors.push({ name: key, weight, value });
    weightedSum += weight * value;
    totalWeight += weight;
  }

  const riskScore = totalWeight > 0
    ? Math.round(Math.min(100, Math.max(0, weightedSum / totalWeight)))
    : 25;

  const recommendation: 'APPROVE' | 'REVIEW' | 'REJECT' =
    riskScore <= 25 ? 'APPROVE'
    : riskScore <= 60 ? 'REVIEW'
    : 'REJECT';

  const statusCounts = Object.values(sections).reduce(
    (acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  const summary = `Preliminary analysis: ${statusCounts.pass || 0} pass, ${statusCounts.warning || 0} warning, ${statusCounts.fail || 0} fail, ${statusCounts.pending || 0} pending.`;

  const extractedFields: Record<string, unknown> = {
    escrow_status: data.status,
    amount_usd: data.amount || null,
    corridor: data.corridor || null,
    condition_type: data.conditionType || null,
    client_tier: data.client.tier || null,
    kyc_status: data.client.kycStatus || null,
    days_until_expiry: data.expiresAt
      ? Math.round((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null,
    has_supporting_documents: data.fileCount > 0,
    deposit_confirmed: data.hasDeposit,
  };

  return {
    riskScore,
    recommendation,
    summary,
    sections,
    extractedFields,
    factors,
    details: `Rule-based preliminary assessment (${Object.keys(sections).length} sections evaluated).`,
  };
}

function evaluateFromAccount(data: EscrowData): RulesSection {
  const checked = ['payerWallet', 'client.kycStatus', 'client.kybStatus', 'client.riskRating', 'client.country'];

  if (!data.payerWallet) {
    return { status: 'pending', title: 'Payer Account', findings: 'Payer wallet not yet provided.', checked_fields: checked };
  }

  if (data.client.kycStatus !== 'VERIFIED') {
    return { status: 'fail', title: 'Payer Account', findings: `KYC status is ${data.client.kycStatus || 'unknown'} — must be VERIFIED.`, checked_fields: checked };
  }

  if (data.client.riskRating === 'HIGH' || data.client.riskRating === 'CRITICAL') {
    return { status: 'fail', title: 'Payer Account', findings: `Client risk rating is ${data.client.riskRating}.`, checked_fields: checked };
  }

  const warnings: string[] = [];
  if (data.client.kybStatus && data.client.kybStatus !== 'VERIFIED') {
    warnings.push(`KYB status is ${data.client.kybStatus}`);
  }

  if (warnings.length > 0) {
    return { status: 'warning', title: 'Payer Account', findings: `KYC verified. ${warnings.join('. ')}.`, checked_fields: checked };
  }

  return { status: 'pass', title: 'Payer Account', findings: 'KYC verified, risk rating acceptable.', checked_fields: checked };
}

function evaluateToAccount(data: EscrowData): RulesSection {
  const checked = ['recipientWallet', 'payerWallet'];

  if (!data.recipientWallet) {
    return { status: 'pending', title: 'Recipient Account', findings: 'Recipient wallet not yet provided.', checked_fields: checked };
  }

  if (data.payerWallet && data.recipientWallet === data.payerWallet) {
    return { status: 'fail', title: 'Recipient Account', findings: 'Recipient wallet is the same as payer wallet.', checked_fields: checked };
  }

  return { status: 'pass', title: 'Recipient Account', findings: 'Recipient wallet set and different from payer.', checked_fields: checked };
}

function evaluateCorridor(data: EscrowData): RulesSection {
  const checked = ['corridor', 'availableCorridors', 'amount'];

  if (!data.corridor) {
    if (!data.availableCorridors || data.availableCorridors.length === 0) {
      return { status: 'fail', title: 'Payment Corridor', findings: 'No active corridors available for this country.', checked_fields: checked };
    }
    // Recommend the lowest-risk corridor that fits the amount
    const suitable = data.amount > 0
      ? data.availableCorridors.filter(c => data.amount >= c.minAmount && data.amount <= c.maxAmount)
      : data.availableCorridors;
    const riskOrder = ['LOW', 'MEDIUM', 'HIGH'];
    const sorted = (suitable.length > 0 ? suitable : data.availableCorridors)
      .sort((a, b) => riskOrder.indexOf(a.riskLevel) - riskOrder.indexOf(b.riskLevel));
    const best = sorted[0];
    return {
      status: 'pending',
      title: 'Payment Corridor',
      findings: `Corridor not yet selected. Recommended: ${best.code} (${best.riskLevel} risk).`,
      checked_fields: checked,
      recommended_corridor: best.code,
    };
  }

  // Corridor is set — validate
  if (data.availableCorridors && data.availableCorridors.length > 0) {
    const match = data.availableCorridors.find(c => c.code === data.corridor);
    if (!match) {
      return { status: 'fail', title: 'Payment Corridor', findings: `Corridor ${data.corridor} not found in available corridors.`, checked_fields: checked };
    }
    const warnings: string[] = [];
    if (match.riskLevel === 'HIGH') {
      warnings.push('High-risk corridor');
    }
    if (data.amount > 0 && data.amount > match.maxAmount) {
      warnings.push(`Amount exceeds corridor max ($${match.maxAmount.toLocaleString()})`);
    }
    if (data.amount > 0 && data.amount < match.minAmount) {
      warnings.push(`Amount below corridor min ($${match.minAmount.toLocaleString()})`);
    }
    if (warnings.length > 0) {
      return { status: 'warning', title: 'Payment Corridor', findings: warnings.join('. ') + '.', checked_fields: checked, recommended_corridor: data.corridor };
    }
    return { status: 'pass', title: 'Payment Corridor', findings: `Corridor ${data.corridor} validated (${match.riskLevel} risk).`, checked_fields: checked, recommended_corridor: data.corridor };
  }

  return { status: 'pass', title: 'Payment Corridor', findings: `Corridor ${data.corridor} set.`, checked_fields: checked, recommended_corridor: data.corridor };
}

function evaluateAmount(data: EscrowData): RulesSection {
  const checked = ['amount', 'platformFee'];

  if (!data.amount || data.amount <= 0) {
    return { status: 'pending', title: 'Transaction Amount', findings: 'Amount not yet provided.', checked_fields: checked };
  }

  const warnings: string[] = [];
  if (data.amount > 1000000) {
    warnings.push('Amount exceeds $1M — high scrutiny required');
  } else if (data.amount > 100000) {
    warnings.push('Amount exceeds $100K — enhanced review');
  }

  if (warnings.length > 0) {
    return { status: 'warning', title: 'Transaction Amount', findings: warnings.join('. ') + '.', checked_fields: checked };
  }

  return { status: 'pass', title: 'Transaction Amount', findings: `Amount $${data.amount.toLocaleString()} within normal range.`, checked_fields: checked };
}

function evaluateSettlement(data: EscrowData): RulesSection {
  const checked = ['tokenMint', 'hasDeposit', 'depositTxSignature', 'escrowPda'];

  if (!data.tokenMint) {
    return { status: 'pending', title: 'Settlement Details', findings: 'Token mint not yet configured.', checked_fields: checked };
  }

  const isKnown = KNOWN_STABLECOINS.includes(data.tokenMint);
  const findings: string[] = [];

  if (!isKnown) {
    findings.push(`Token mint ${data.tokenMint.substring(0, 8)}... is not a recognized stablecoin`);
  }

  if (data.hasDeposit) {
    findings.push('Deposit confirmed');
    if (data.depositTxSignature) findings.push('on-chain signature recorded');
  } else {
    findings.push('No deposit yet');
  }

  if (data.escrowPda) findings.push('escrow PDA assigned');

  const status: SectionStatus = !isKnown ? 'warning' : 'pass';
  return { status, title: 'Settlement Details', findings: findings.join('; ') + '.', checked_fields: checked };
}

function evaluateRelease(data: EscrowData): RulesSection {
  const checked = ['conditionType', 'settlementAuthority'];

  if (!data.conditionType) {
    return { status: 'pending', title: 'Release Conditions', findings: 'Release condition type not yet set.', checked_fields: checked };
  }

  const warnings: string[] = [];
  if (!data.settlementAuthority && data.status !== 'DRAFT') {
    warnings.push('Settlement authority not set for non-DRAFT escrow');
  }

  if (warnings.length > 0) {
    return { status: 'warning', title: 'Release Conditions', findings: `Condition: ${data.conditionType}. ${warnings.join('. ')}.`, checked_fields: checked };
  }

  return { status: 'pass', title: 'Release Conditions', findings: `Condition: ${data.conditionType}. Settlement authority configured.`, checked_fields: checked };
}

function evaluateAdvanced(data: EscrowData): RulesSection {
  const checked = ['expiresAt', 'fileCount', 'nonceAccount'];

  if (!data.expiresAt && data.status !== 'DRAFT') {
    return { status: 'pending', title: 'Advanced Settings', findings: 'Expiry date not set on non-DRAFT escrow.', checked_fields: checked };
  }

  const warnings: string[] = [];

  if (data.expiresAt) {
    const hoursUntilExpiry = (new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
    const daysUntilExpiry = hoursUntilExpiry / 24;
    if (hoursUntilExpiry < 24) {
      warnings.push('Expires in less than 24 hours');
    } else if (daysUntilExpiry > 90) {
      warnings.push('Expiry is more than 90 days away');
    }
  }

  if (data.fileCount === 0 && data.amount > 50000) {
    warnings.push('No supporting documents for amount > $50K');
  }

  if (warnings.length > 0) {
    return { status: 'warning', title: 'Advanced Settings', findings: warnings.join('. ') + '.', checked_fields: checked };
  }

  const findings = [];
  if (data.expiresAt) findings.push('Expiry set');
  if (data.nonceAccount) findings.push('nonce account assigned');
  if (data.fileCount > 0) findings.push(`${data.fileCount} document(s) attached`);
  if (findings.length === 0) findings.push('No advanced settings configured yet');

  return { status: data.expiresAt ? 'pass' : 'pending', title: 'Advanced Settings', findings: findings.join('; ') + '.', checked_fields: checked };
}

function evaluateOverview(sections: Record<string, RulesSection>): RulesSection {
  const checked = Object.keys(sections);
  const statuses = Object.values(sections).map(s => s.status);

  const counts = statuses.reduce(
    (acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  let status: SectionStatus;
  if (statuses.includes('fail')) {
    status = 'fail';
  } else if (statuses.includes('warning')) {
    status = 'warning';
  } else {
    status = 'pass';
  }

  return {
    status,
    title: 'Overall Assessment',
    findings: `${counts.pass || 0} pass, ${counts.warning || 0} warning, ${counts.fail || 0} fail, ${counts.pending || 0} pending.`,
    checked_fields: checked,
  };
}
