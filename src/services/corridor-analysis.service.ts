/**
 * Corridor Analysis Service
 *
 * Provides risk analysis for payment corridors (country pairs).
 * Uses corridor configuration from the database plus static regulatory data
 * to produce a risk assessment without requiring AI API calls.
 */

import { PrismaClient } from '../generated/prisma';

const COUNTRY_NAMES: Record<string, string> = {
  AE: 'United Arab Emirates',
  CH: 'Switzerland',
  DE: 'Germany',
  GB: 'United Kingdom',
  HK: 'Hong Kong',
  IT: 'Italy',
  JP: 'Japan',
  SG: 'Singapore',
  US: 'United States',
};

const COUNTRY_REGULATORS: Record<string, string> = {
  AE: 'CBUAE',
  CH: 'FINMA',
  DE: 'BaFin',
  GB: 'FCA',
  HK: 'HKMA',
  IT: 'Banca d\'Italia',
  JP: 'FSA',
  SG: 'MAS',
  US: 'FinCEN',
};

const RISK_LEVEL_SCORES: Record<string, number> = {
  LOW: 6,
  MEDIUM: 15,
  HIGH: 30,
};

export interface CorridorAnalysisParams {
  fromCountry: string;
  toCountry: string;
  amount?: number;
  currency?: string;
}

export interface CorridorAnalysisFactor {
  label: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  detail: string;
}

export interface CorridorAnalysisResult {
  corridorCode: string;
  corridorName: string;
  compliance: string;
  description: string;
  corridorRisk: number;
  riskReason: string;
  travelRuleThreshold: number;
  eddThreshold: number;
  reportingThreshold: number;
  riskScore: number;
  riskLevel: string;
  factors: CorridorAnalysisFactor[];
}

export class CorridorAnalysisService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async analyzeCorridor(params: CorridorAnalysisParams): Promise<CorridorAnalysisResult> {
    const { fromCountry, toCountry, amount, currency = 'USDC' } = params;
    const corridorCode = `${fromCountry}-${toCountry}`;

    // Look up corridor in the database
    const corridor = await this.prisma.institutionCorridor.findUnique({
      where: { code: corridorCode },
    });

    if (!corridor || corridor.status !== 'ACTIVE') {
      throw new Error(`Corridor ${corridorCode} is not supported or not active`);
    }

    const fromName = COUNTRY_NAMES[fromCountry] || fromCountry;
    const toName = COUNTRY_NAMES[toCountry] || toCountry;
    const fromRegulator = COUNTRY_REGULATORS[fromCountry] || 'Local regulator';
    const toRegulator = COUNTRY_REGULATORS[toCountry] || 'Local regulator';

    const riskLevel = corridor.riskLevel || 'MEDIUM';
    const corridorRisk = RISK_LEVEL_SCORES[riskLevel] || 15;

    // Build risk factors
    const factors: CorridorAnalysisFactor[] = [];
    let riskScore = corridorRisk;

    // Regulatory alignment factor
    factors.push({
      label: 'Regulatory alignment',
      impact: riskLevel === 'HIGH' ? 'HIGH' : 'LOW',
      detail: `${fromRegulator} and ${toRegulator} regulatory frameworks apply. ${
        riskLevel === 'LOW'
          ? 'Well-regulated jurisdictions with strong bilateral cooperation.'
          : riskLevel === 'HIGH'
            ? 'Enhanced due diligence may be required due to regulatory differences.'
            : 'Moderate regulatory alignment between jurisdictions.'
      }`,
    });

    // Amount-based risk factors
    if (amount !== undefined) {
      if (amount > Number(corridor.maxAmount)) {
        factors.push({
          label: 'Amount exceeds corridor limit',
          impact: 'HIGH',
          detail: `Requested amount $${amount.toLocaleString()} exceeds corridor maximum of $${Number(corridor.maxAmount).toLocaleString()}.`,
        });
        riskScore += 20;
      } else if (amount < Number(corridor.minAmount)) {
        factors.push({
          label: 'Amount below corridor minimum',
          impact: 'MEDIUM',
          detail: `Requested amount $${amount.toLocaleString()} is below corridor minimum of $${Number(corridor.minAmount).toLocaleString()}.`,
        });
        riskScore += 5;
      }

      if (amount >= 10000) {
        factors.push({
          label: 'Enhanced due diligence threshold',
          impact: 'MEDIUM',
          detail: `Amount of $${amount.toLocaleString()} triggers EDD requirements.`,
        });
        riskScore += 5;
      }

      if (amount >= 15000) {
        factors.push({
          label: 'Reporting threshold',
          impact: 'MEDIUM',
          detail: `Amount of $${amount.toLocaleString()} may trigger regulatory reporting requirements.`,
        });
        riskScore += 5;
      }
    }

    // Corridor volume factor
    factors.push({
      label: 'Corridor capacity',
      impact: 'LOW',
      detail: `Daily limit: $${Number(corridor.dailyLimit).toLocaleString()}, Monthly limit: $${Number(corridor.monthlyLimit).toLocaleString()}.`,
    });

    // Documentation requirements
    const requiredDocs = (corridor.requiredDocuments as string[]) || [];
    if (requiredDocs.length > 0) {
      factors.push({
        label: 'Documentation requirements',
        impact: requiredDocs.length > 2 ? 'MEDIUM' : 'LOW',
        detail: `Required documents: ${requiredDocs.join(', ')}.`,
      });
    }

    // Clamp risk score
    riskScore = Math.min(Math.max(riskScore, 0), 100);

    const finalRiskLevel = riskScore <= 10 ? 'LOW' : riskScore <= 25 ? 'MEDIUM' : 'HIGH';

    const description = riskLevel === 'LOW'
      ? `Established ${fromName}–${toName} corridor`
      : riskLevel === 'HIGH'
        ? `Higher-risk ${fromName}–${toName} corridor requiring enhanced oversight`
        : `Standard ${fromName}–${toName} corridor`;

    const riskReason = riskLevel === 'LOW'
      ? 'Well-regulated outbound corridor'
      : riskLevel === 'HIGH'
        ? 'Elevated regulatory requirements between jurisdictions'
        : 'Moderate regulatory environment';

    return {
      corridorCode,
      corridorName: `${fromName} → ${toName}`,
      compliance: `${fromRegulator} + ${toRegulator}`,
      description,
      corridorRisk,
      riskReason,
      travelRuleThreshold: 1000,
      eddThreshold: 10000,
      reportingThreshold: 15000,
      riskScore,
      riskLevel: finalRiskLevel,
      factors,
    };
  }
}

let instance: CorridorAnalysisService | null = null;
export function getCorridorAnalysisService(): CorridorAnalysisService {
  if (!instance) {
    instance = new CorridorAnalysisService();
  }
  return instance;
}
