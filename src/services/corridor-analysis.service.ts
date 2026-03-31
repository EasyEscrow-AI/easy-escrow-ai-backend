/**
 * Corridor Analysis Service
 *
 * Provides risk analysis for payment corridors (country pairs).
 * Uses corridor configuration from the database plus static regulatory data
 * to produce a risk assessment without requiring AI API calls.
 */

import { PrismaClient } from '../generated/prisma';
import { prisma as sharedPrisma } from '../config/database';

const TRAVEL_RULE_THRESHOLD = parseInt(process.env.CORRIDOR_TRAVEL_RULE_THRESHOLD || '1000', 10);
const EDD_THRESHOLD = parseInt(process.env.CORRIDOR_EDD_THRESHOLD || '10000', 10);
const REPORTING_THRESHOLD = parseInt(process.env.CORRIDOR_REPORTING_THRESHOLD || '15000', 10);

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
  US: 'FinCEN/OCC',
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

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? sharedPrisma;
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

      const corridorEdd = Number(corridor.eddThreshold) || EDD_THRESHOLD;
      const corridorReporting = Number(corridor.reportingThreshold) || REPORTING_THRESHOLD;

      if (amount >= corridorEdd) {
        factors.push({
          label: 'Enhanced due diligence threshold',
          impact: 'MEDIUM',
          detail: `Amount of $${amount.toLocaleString()} triggers EDD requirements (threshold: $${corridorEdd.toLocaleString()}).`,
        });
        riskScore += 5;
      }

      if (amount >= corridorReporting) {
        factors.push({
          label: 'Reporting threshold',
          impact: 'MEDIUM',
          detail: `Amount of $${amount.toLocaleString()} may trigger regulatory reporting requirements (threshold: $${corridorReporting.toLocaleString()}).`,
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
    const rawDocs = corridor.requiredDocuments;
    const requiredDocs = Array.isArray(rawDocs) ? rawDocs.filter((d): d is string => typeof d === 'string') : [];
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

    // Use corridor DB values if available, fall back to env vars
    const travelRuleThreshold = Number(corridor.travelRuleThreshold) || TRAVEL_RULE_THRESHOLD;
    const eddThreshold = Number(corridor.eddThreshold) || EDD_THRESHOLD;
    const reportingThreshold = Number(corridor.reportingThreshold) || REPORTING_THRESHOLD;

    // Use corridor DB description/riskReason if available, fall back to generated text
    const description = corridor.description
      || (riskLevel === 'LOW'
        ? `Established ${fromName}–${toName} corridor`
        : riskLevel === 'HIGH'
          ? `Higher-risk ${fromName}–${toName} corridor requiring enhanced oversight`
          : `Standard ${fromName}–${toName} corridor`);

    const riskReason = corridor.riskReason
      || (riskLevel === 'LOW'
        ? 'Well-regulated outbound corridor'
        : riskLevel === 'HIGH'
          ? 'Elevated regulatory requirements between jurisdictions'
          : 'Moderate regulatory environment');

    // Use corridor DB compliance if available, fall back to generated
    const compliance = corridor.compliance || `${fromRegulator} + ${toRegulator}`;

    return {
      corridorCode,
      corridorName: `${fromName} → ${toName}`,
      compliance,
      description,
      corridorRisk,
      riskReason,
      travelRuleThreshold,
      eddThreshold,
      reportingThreshold,
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
