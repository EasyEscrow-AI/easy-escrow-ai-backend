/**
 * Escrow Rules Engine — Deterministic local analysis
 *
 * Evaluates 5 compliance sections using simple rules:
 * 1. Account Verifications — KYC/KYB, wallet checks
 * 2. Transaction Amount — thresholds, AI vs manual approval
 * 3. Payment Corridor — country regulations, enabled corridors
 * 4. Release Conditions — approval mode, expiry
 * 5. Overall Compliance — aggregate verdict
 *
 * Each section returns a risk level: low_risk | medium_risk | high_risk | blocked
 * "blocked" means the escrow cannot proceed without resolution.
 *
 * Returns a result in <1ms, no API calls needed.
 */

const KNOWN_STABLECOINS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC (Solana mainnet)
  'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', // USDC (Solana devnet)
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT (Solana)
  'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', // EURC (Solana)
  'CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM', // PYUSD (Solana)
];

export type RiskLevel = 'low_risk' | 'medium_risk' | 'high_risk' | 'blocked';

export interface RulesSection {
  risk: RiskLevel;
  title: string;
  finding: string;
}

export interface TriggeredRule {
  ruleId: string;
  label: string;
  riskLevel: string;
  detail: string;
  regulationRef: string;
}

export interface RulesEngineResult {
  risk: RiskLevel;
  summary: string;
  sections: {
    overall: RulesSection;
    account_verifications: RulesSection;
    transaction_amount: RulesSection;
    payment_corridor: RulesSection;
    release_conditions: RulesSection;
  };
  extractedFields: Record<string, unknown>;
  triggeredRules: TriggeredRule[];
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
  recipientClient?: {
    kycStatus: string | null;
    kybStatus: string | null;
    riskRating: string | null;
    country: string | null;
  } | null;
  availableCorridors: CorridorInfo[] | null;
  thresholdRules?: ThresholdRule[] | null;
}

export interface ThresholdRule {
  ruleId: string;
  label: string;
  riskLevel: string; // low, medium, high
  thresholdType: string; // gte, range, pattern
  thresholdAmount: number | null;
  thresholdMax: number | null;
  currency: string;
  detailTemplate: string;
  regulationRef: string;
}

// Amount thresholds
const AI_APPROVAL_MAX = 50000; // Up to $50K: AI can auto-approve
const MANUAL_REVIEW_THRESHOLD = 100000; // $100K+: requires manual approval
const HIGH_SCRUTINY_THRESHOLD = 1000000; // $1M+: high scrutiny, manual only

export function evaluateEscrow(data: EscrowData): RulesEngineResult {
  const accountVerifications = evaluateAccountVerifications(data);
  const transactionAmount = evaluateTransactionAmount(data);
  const paymentCorridor = evaluatePaymentCorridor(data);
  const releaseConditions = evaluateReleaseConditions(data);
  const overall = evaluateOverall(
    accountVerifications,
    transactionAmount,
    paymentCorridor,
    releaseConditions
  );

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

  // Evaluate threshold rules if provided
  const triggeredRules = evaluateThresholdRules(data);

  return {
    risk: overall.risk,
    summary: overall.finding,
    sections: {
      overall,
      account_verifications: accountVerifications,
      transaction_amount: transactionAmount,
      payment_corridor: paymentCorridor,
      release_conditions: releaseConditions,
    },
    extractedFields,
    triggeredRules,
  };
}

function evaluateAccountVerifications(data: EscrowData): RulesSection {
  const title = 'Account Verifications';

  // KYC not verified = blocked
  if (data.client.kycStatus !== 'VERIFIED') {
    return {
      risk: 'blocked',
      title,
      finding: `Payer KYC is ${
        data.client.kycStatus || 'not started'
      } — must be VERIFIED before proceeding.`,
    };
  }

  // High/critical risk client = blocked
  if (data.client.riskRating === 'HIGH' || data.client.riskRating === 'CRITICAL') {
    return {
      risk: 'blocked',
      title,
      finding: `Payer risk rating is ${data.client.riskRating} — cannot proceed without manual review.`,
    };
  }

  // Recipient checks
  if (data.recipientWallet && data.payerWallet && data.recipientWallet === data.payerWallet) {
    return {
      risk: 'blocked',
      title,
      finding: 'Recipient wallet is the same as payer wallet — self-transfers are not allowed.',
    };
  }

  // Recipient KYC check (if available)
  if (data.recipientClient && data.recipientClient.kycStatus !== 'VERIFIED') {
    return {
      risk: 'high_risk',
      title,
      finding: `Recipient KYC is ${
        data.recipientClient.kycStatus || 'unknown'
      } — recommend verifying before release.`,
    };
  }

  // Warnings
  const issues: string[] = [];
  if (data.client.kybStatus && data.client.kybStatus !== 'VERIFIED') {
    issues.push(`KYB is ${data.client.kybStatus}`);
  }
  if (!data.recipientWallet) {
    issues.push('recipient wallet not yet provided');
  }

  if (issues.length > 0) {
    return { risk: 'medium_risk', title, finding: `Payer KYC verified. ${issues.join('; ')}.` };
  }

  return { risk: 'low_risk', title, finding: 'Both parties verified, wallets valid.' };
}

function evaluateTransactionAmount(data: EscrowData): RulesSection {
  const title = 'Transaction Amount';

  if (!data.amount || data.amount <= 0) {
    return { risk: 'medium_risk', title, finding: 'Amount not yet provided.' };
  }

  // Token check
  if (data.tokenMint && !KNOWN_STABLECOINS.includes(data.tokenMint)) {
    return {
      risk: 'blocked',
      title,
      finding: `Token ${data.tokenMint.substring(0, 8)}... is not a whitelisted stablecoin.`,
    };
  }

  if (data.amount >= HIGH_SCRUTINY_THRESHOLD) {
    return {
      risk: 'high_risk',
      title,
      finding: `$${data.amount.toLocaleString()} exceeds $1M — manual approval only, high scrutiny required.`,
    };
  }

  if (data.amount >= MANUAL_REVIEW_THRESHOLD) {
    return {
      risk: 'medium_risk',
      title,
      finding: `$${data.amount.toLocaleString()} exceeds $100K — requires manual approval.`,
    };
  }

  if (data.amount <= AI_APPROVAL_MAX) {
    return {
      risk: 'low_risk',
      title,
      finding: `$${data.amount.toLocaleString()} is within AI auto-approval range.`,
    };
  }

  // Between $50K-$100K
  return {
    risk: 'medium_risk',
    title,
    finding: `$${data.amount.toLocaleString()} — standard review applies.`,
  };
}

function evaluatePaymentCorridor(data: EscrowData): RulesSection {
  const title = 'Payment Corridor';

  if (!data.corridor) {
    if (!data.availableCorridors || data.availableCorridors.length === 0) {
      return {
        risk: 'blocked',
        title,
        finding: 'No active corridors available for this country.',
      };
    }
    return {
      risk: 'medium_risk',
      title,
      finding: `Corridor not yet selected — ${data.availableCorridors.length} available.`,
    };
  }

  // Validate corridor exists
  if (data.availableCorridors && data.availableCorridors.length > 0) {
    const match = data.availableCorridors.find((c) => c.code === data.corridor);
    if (!match) {
      return {
        risk: 'blocked',
        title,
        finding: `Corridor ${data.corridor} is not enabled on this platform.`,
      };
    }

    const issues: string[] = [];
    if (match.riskLevel === 'HIGH') {
      issues.push('high-risk corridor');
    }
    if (data.amount > 0 && data.amount > match.maxAmount) {
      issues.push(`amount exceeds corridor max ($${match.maxAmount.toLocaleString()})`);
    }
    if (data.amount > 0 && data.amount < match.minAmount) {
      issues.push(`amount below corridor min ($${match.minAmount.toLocaleString()})`);
    }

    if (issues.some((i) => i.includes('exceeds') || i.includes('below'))) {
      return {
        risk: 'blocked',
        title,
        finding: `Corridor ${data.corridor}: ${issues.join('; ')}.`,
      };
    }
    if (issues.length > 0) {
      return {
        risk: 'high_risk',
        title,
        finding: `Corridor ${data.corridor}: ${issues.join('; ')}.`,
      };
    }
    return {
      risk: 'low_risk',
      title,
      finding: `${data.corridor} corridor validated (${match.riskLevel} risk).`,
    };
  }

  return { risk: 'low_risk', title, finding: `Corridor ${data.corridor} set.` };
}

function evaluateReleaseConditions(data: EscrowData): RulesSection {
  const title = 'Release Conditions';

  if (!data.conditionType) {
    return { risk: 'medium_risk', title, finding: 'Release condition not yet configured.' };
  }

  const issues: string[] = [];

  // High-amount escrows must be manual
  if (data.amount >= MANUAL_REVIEW_THRESHOLD && data.conditionType !== 'ADMIN_RELEASE') {
    issues.push('amount ≥$100K requires ADMIN_RELEASE for manual approval');
  }

  // Expiry check
  if (data.expiresAt) {
    const hoursUntilExpiry = (new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilExpiry < 24) {
      issues.push('expires in less than 24 hours');
    }
  } else if (data.status !== 'DRAFT') {
    issues.push('no expiry set');
  }

  if (issues.some((i) => i.includes('requires ADMIN_RELEASE'))) {
    return { risk: 'blocked', title, finding: `${data.conditionType}: ${issues.join('; ')}.` };
  }
  if (issues.length > 0) {
    return { risk: 'medium_risk', title, finding: `${data.conditionType}: ${issues.join('; ')}.` };
  }

  return {
    risk: 'low_risk',
    title,
    finding: `${data.conditionType} configured, expiry acceptable.`,
  };
}

function evaluateOverall(
  accountVerifications: RulesSection,
  transactionAmount: RulesSection,
  paymentCorridor: RulesSection,
  releaseConditions: RulesSection
): RulesSection {
  const title = 'Overall Compliance';
  const all = [accountVerifications, transactionAmount, paymentCorridor, releaseConditions];

  if (all.some((s) => s.risk === 'blocked')) {
    const blocked = all.filter((s) => s.risk === 'blocked').map((s) => s.title);
    return {
      risk: 'blocked',
      title,
      finding: `Cannot proceed — blocked by: ${blocked.join(', ')}.`,
    };
  }

  if (all.some((s) => s.risk === 'high_risk')) {
    return { risk: 'high_risk', title, finding: 'Manual review required before proceeding.' };
  }

  if (all.some((s) => s.risk === 'medium_risk')) {
    return { risk: 'medium_risk', title, finding: 'Some items need attention before approval.' };
  }

  return { risk: 'low_risk', title, finding: 'All checks passed — eligible for AI auto-approval.' };
}

/**
 * Evaluate corridor threshold rules against the escrow amount.
 * Returns triggered rules with resolved detail text.
 */
function evaluateThresholdRules(data: EscrowData): TriggeredRule[] {
  if (
    !data.thresholdRules ||
    data.thresholdRules.length === 0 ||
    !data.amount ||
    data.amount <= 0
  ) {
    return [];
  }

  const triggered: TriggeredRule[] = [];

  for (const rule of data.thresholdRules) {
    let matches = false;

    switch (rule.thresholdType) {
      case 'gte':
        if (rule.thresholdAmount !== null && data.amount >= rule.thresholdAmount) {
          matches = true;
        }
        break;
      case 'range':
        if (
          rule.thresholdAmount !== null &&
          rule.thresholdMax !== null &&
          data.amount >= rule.thresholdAmount &&
          data.amount < rule.thresholdMax
        ) {
          matches = true;
        }
        break;
      case 'lt':
        if (rule.thresholdAmount !== null && data.amount < rule.thresholdAmount) {
          matches = true;
        }
        break;
      case 'gt':
        if (rule.thresholdAmount !== null && data.amount > rule.thresholdAmount) {
          matches = true;
        }
        break;
      case 'pattern':
        // round_number: amount is a multiple of thresholdAmount and >= thresholdAmount
        if (
          rule.ruleId === 'round_number' &&
          rule.thresholdAmount !== null &&
          data.amount >= rule.thresholdAmount &&
          data.amount % rule.thresholdAmount === 0
        ) {
          matches = true;
        }
        break;
    }

    if (matches) {
      const detail = rule.detailTemplate
        .replace(/\{amount\}/g, `$${data.amount.toLocaleString()}`)
        .replace(/\$\{threshold\}/g, `$${(rule.thresholdAmount || 0).toLocaleString()}`)
        .replace(/\{threshold\}/g, `$${(rule.thresholdAmount || 0).toLocaleString()}`)
        .replace(/\{corridor\}/g, data.corridor || 'unknown');

      triggered.push({
        ruleId: rule.ruleId,
        label: rule.label,
        riskLevel: rule.riskLevel,
        detail,
        regulationRef: rule.regulationRef,
      });
    }
  }

  return triggered;
}
