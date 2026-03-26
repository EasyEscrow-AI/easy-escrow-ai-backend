/**
 * Corridor Configuration Seed
 *
 * Upserts all 49 institution corridors with compliance metadata,
 * risk levels, and threshold configuration.
 *
 * Idempotent: uses upsert with `where: { code }` so re-running is safe.
 *
 * Usage:
 *   npx ts-node prisma/seeds/corridor-config-seed.ts
 */

import { PrismaClient } from '../../src/generated/prisma';

const prisma = new PrismaClient();

interface CorridorSeed {
  code: string;
  name: string;
  sourceCountry: string;
  destCountry: string;
  compliance: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  travelRuleThreshold: number;
  eddThreshold: number;
  reportingThreshold: number;
  riskReason: string;
  description?: string;
  minAmount?: number;
  maxAmount?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
}

const corridors: CorridorSeed[] = [
  // ── Switzerland (CH) outbound ──────────────────────────────────
  {
    code: 'CH-SG',
    name: 'Switzerland \u2192 Singapore',
    sourceCountry: 'CH',
    destCountry: 'SG',
    compliance: 'FINMA + MAS',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'Swiss-originated, FINMA primary \u2014 well-regulated outbound corridor with full MAS reciprocity',
  },
  {
    code: 'CH-HK',
    name: 'Switzerland \u2192 Hong Kong',
    sourceCountry: 'CH',
    destCountry: 'HK',
    compliance: 'FINMA + SFC',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'SFC licensing regime mature but evolving crypto framework \u2014 moderate compliance overhead',
  },
  {
    code: 'CH-AE',
    name: 'Switzerland \u2192 UAE',
    sourceCountry: 'CH',
    destCountry: 'AE',
    compliance: 'FINMA + DFSA',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'DFSA/VARA dual regime in UAE \u2014 growing but less established than European counterparts',
  },
  {
    code: 'CH-EU',
    name: 'Switzerland \u2192 EU',
    sourceCountry: 'CH',
    destCountry: 'EU',
    compliance: 'FINMA + MiCA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'MiCA framework maturing \u2014 FINMA-MiCA interoperability under active harmonization',
  },
  {
    code: 'CH-JP',
    name: 'Switzerland \u2192 Japan',
    sourceCountry: 'CH',
    destCountry: 'JP',
    compliance: 'FINMA + JFSA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'Japan has one of the most mature crypto regulatory frameworks globally \u2014 low friction corridor',
  },
  {
    code: 'CH-KR',
    name: 'Switzerland \u2192 South Korea',
    sourceCountry: 'CH',
    destCountry: 'KR',
    compliance: 'FINMA + FSC',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'Korean FSC strict on crypto \u2014 Travel Rule enforcement active, additional reporting layers',
  },
  {
    code: 'CH-CN',
    name: 'Switzerland \u2192 China',
    sourceCountry: 'CH',
    destCountry: 'CN',
    compliance: 'FINMA + PBOC',
    riskLevel: 'HIGH',
    travelRuleThreshold: 1000,
    eddThreshold: 5000,
    reportingThreshold: 8000,
    riskReason:
      'China restricts crypto transactions \u2014 requires PBOC-approved channels, high compliance burden',
  },
  {
    code: 'CH-US',
    name: 'Switzerland \u2192 United States',
    sourceCountry: 'CH',
    destCountry: 'US',
    compliance: 'FINMA + FinCEN/OCC',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason:
      'FINMA Payment Instrument Institution license (CH) + OCC Permitted Payment Stablecoin Issuer (US). Strict AML/KYC under BSA. Foreign issuers prohibited in US until July 18 2028 unless OCC-registered.',
    description:
      'Institutional corridor under 2026 regulatory framework. CH: FINMA Payment Instrument Institution license (replaces Fintech license), no deposit cap (CHF 100M limit removed late 2025), 1:1 reserves in segregated bankruptcy-remote accounts, yield prohibited. US: OCC PPSI license, $10B issuance cap for state-regulated issuers, 1:1 reserves in fiat or HQLA, yield prohibited. Travel Rule: CHF 1,000 (CH) / $3,000 (US). Cross-border access via supervised custodians (CH); foreign issuers prohibited until July 18 2028 unless OCC-registered.',
    minAmount: 500,
  },
  {
    code: 'CH-GB',
    name: 'Switzerland \u2192 United Kingdom',
    sourceCountry: 'CH',
    destCountry: 'GB',
    compliance: 'FINMA + FCA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'FCA Travel Rule in effect \u2014 strong bilateral regulatory alignment with Swiss framework',
  },
  {
    code: 'CH-CH',
    name: 'Switzerland Domestic',
    sourceCountry: 'CH',
    destCountry: 'CH',
    compliance: 'FINMA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 25000,
    reportingThreshold: 100000,
    riskReason:
      'Single-jurisdiction domestic transfer \u2014 minimal cross-border compliance overhead',
  },

  // ── Singapore (SG) outbound ────────────────────────────────────
  {
    code: 'SG-CH',
    name: 'Singapore \u2192 Switzerland',
    sourceCountry: 'SG',
    destCountry: 'CH',
    compliance: 'MAS + FINMA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1500,
    eddThreshold: 15000,
    reportingThreshold: 20000,
    riskReason:
      'Dual regulation (MAS + FINMA) \u2014 established APAC-Europe corridor with full Travel Rule coverage',
  },
  {
    code: 'SG-HK',
    name: 'Singapore \u2192 Hong Kong',
    sourceCountry: 'SG',
    destCountry: 'HK',
    compliance: 'MAS + SFC',
    riskLevel: 'LOW',
    travelRuleThreshold: 1500,
    eddThreshold: 15000,
    reportingThreshold: 20000,
    riskReason:
      'Strong APAC regulatory alignment \u2014 MAS-SFC mutual recognition streamlines compliance',
  },
  {
    code: 'SG-AE',
    name: 'Singapore \u2192 UAE',
    sourceCountry: 'SG',
    destCountry: 'AE',
    compliance: 'MAS + DFSA',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1500,
    eddThreshold: 15000,
    reportingThreshold: 20000,
    riskReason:
      'Growing corridor \u2014 DFSA/VARA framework evolving, additional due diligence recommended',
  },
  {
    code: 'SG-EU',
    name: 'Singapore \u2192 EU',
    sourceCountry: 'SG',
    destCountry: 'EU',
    compliance: 'MAS + MiCA',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1500,
    eddThreshold: 15000,
    reportingThreshold: 20000,
    riskReason:
      'MiCA compliance layer on top of MAS \u2014 dual-framework overhead with maturing EU regulation',
  },
  {
    code: 'SG-JP',
    name: 'Singapore \u2192 Japan',
    sourceCountry: 'SG',
    destCountry: 'JP',
    compliance: 'MAS + JFSA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1500,
    eddThreshold: 15000,
    reportingThreshold: 20000,
    riskReason: 'Both MAS and JFSA are mature frameworks \u2014 low-friction APAC corridor',
  },
  {
    code: 'SG-KR',
    name: 'Singapore \u2192 South Korea',
    sourceCountry: 'SG',
    destCountry: 'KR',
    compliance: 'MAS + FSC',
    riskLevel: 'LOW',
    travelRuleThreshold: 1500,
    eddThreshold: 15000,
    reportingThreshold: 20000,
    riskReason:
      'Korean FSC has strict Travel Rule enforcement \u2014 additional reporting requirements',
  },
  {
    code: 'SG-CN',
    name: 'Singapore \u2192 China',
    sourceCountry: 'SG',
    destCountry: 'CN',
    compliance: 'MAS + PBOC',
    riskLevel: 'HIGH',
    travelRuleThreshold: 1500,
    eddThreshold: 5000,
    reportingThreshold: 8000,
    riskReason:
      'China restricts crypto \u2014 requires PBOC-approved channels, very high compliance burden from Singapore',
  },
  {
    code: 'SG-US',
    name: 'Singapore \u2192 United States',
    sourceCountry: 'SG',
    destCountry: 'US',
    compliance: 'MAS + FinCEN',
    riskLevel: 'LOW',
    travelRuleThreshold: 1500,
    eddThreshold: 15000,
    reportingThreshold: 20000,
    riskReason:
      'FinCEN BSA requirements \u2014 well-defined AML/KYC for US-bound, MAS provides strong originator data',
  },
  {
    code: 'SG-GB',
    name: 'Singapore \u2192 United Kingdom',
    sourceCountry: 'SG',
    destCountry: 'GB',
    compliance: 'MAS + FCA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1500,
    eddThreshold: 15000,
    reportingThreshold: 20000,
    riskReason: 'FCA and MAS both enforce Travel Rule \u2014 well-aligned regulatory expectations',
  },
  {
    code: 'SG-SG',
    name: 'Singapore Domestic',
    sourceCountry: 'SG',
    destCountry: 'SG',
    compliance: 'MAS',
    riskLevel: 'LOW',
    travelRuleThreshold: 1500,
    eddThreshold: 25000,
    reportingThreshold: 100000,
    riskReason: 'Single-jurisdiction domestic transfer \u2014 MAS oversight only',
  },

  // ── United States (US) outbound ────────────────────────────────
  {
    code: 'US-CH',
    name: 'United States \u2192 Switzerland',
    sourceCountry: 'US',
    destCountry: 'CH',
    compliance: 'FinCEN + FINMA',
    riskLevel: 'LOW',
    travelRuleThreshold: 3000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason:
      'FinCEN BSA/SAR requirements \u2014 CTR threshold at $10k, strict OFAC screening required',
  },
  {
    code: 'US-SG',
    name: 'United States \u2192 Singapore',
    sourceCountry: 'US',
    destCountry: 'SG',
    compliance: 'FinCEN + MAS',
    riskLevel: 'LOW',
    travelRuleThreshold: 3000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason:
      'FinCEN strict on cross-border \u2014 $3k Travel Rule trigger, OFAC screening mandatory',
  },
  {
    code: 'US-HK',
    name: 'United States \u2192 Hong Kong',
    sourceCountry: 'US',
    destCountry: 'HK',
    compliance: 'FinCEN + SFC',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 3000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason:
      'HK political risk considerations \u2014 enhanced OFAC and BIS screening, elevated due diligence',
  },
  {
    code: 'US-AE',
    name: 'United States \u2192 UAE',
    sourceCountry: 'US',
    destCountry: 'AE',
    compliance: 'FinCEN + DFSA',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 3000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason:
      'UAE on FATF greylist history \u2014 enhanced due diligence required, OFAC secondary sanctions risk',
  },
  {
    code: 'US-EU',
    name: 'United States \u2192 EU',
    sourceCountry: 'US',
    destCountry: 'EU',
    compliance: 'FinCEN + MiCA',
    riskLevel: 'LOW',
    travelRuleThreshold: 3000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason:
      'Dual compliance \u2014 FinCEN BSA plus MiCA TFR, well-defined but heavy documentation',
  },
  {
    code: 'US-JP',
    name: 'United States \u2192 Japan',
    sourceCountry: 'US',
    destCountry: 'JP',
    compliance: 'FinCEN + JFSA',
    riskLevel: 'LOW',
    travelRuleThreshold: 3000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason:
      'Strong bilateral regulatory alignment \u2014 both enforce Travel Rule with mature frameworks',
  },
  {
    code: 'US-KR',
    name: 'United States \u2192 South Korea',
    sourceCountry: 'US',
    destCountry: 'KR',
    compliance: 'FinCEN + FSC',
    riskLevel: 'LOW',
    travelRuleThreshold: 3000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason:
      'FSC strict but aligned with FinCEN expectations \u2014 manageable compliance overhead',
  },
  {
    code: 'US-CN',
    name: 'United States \u2192 China',
    sourceCountry: 'US',
    destCountry: 'CN',
    compliance: 'FinCEN + PBOC',
    riskLevel: 'HIGH',
    travelRuleThreshold: 3000,
    eddThreshold: 5000,
    reportingThreshold: 8000,
    riskReason:
      'Extreme compliance burden \u2014 OFAC restrictions, PBOC crypto prohibitions, requires special channels',
  },
  {
    code: 'US-GB',
    name: 'United States \u2192 United Kingdom',
    sourceCountry: 'US',
    destCountry: 'GB',
    compliance: 'FinCEN + FCA',
    riskLevel: 'LOW',
    travelRuleThreshold: 3000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason:
      'Strong bilateral AML framework \u2014 UK-US data sharing agreements reduce friction',
  },
  {
    code: 'US-US',
    name: 'United States Domestic',
    sourceCountry: 'US',
    destCountry: 'US',
    compliance: 'FinCEN',
    riskLevel: 'LOW',
    travelRuleThreshold: 3000,
    eddThreshold: 10000,
    reportingThreshold: 10000,
    riskReason: 'Single-jurisdiction domestic transfer \u2014 FinCEN BSA/CTR obligations apply',
  },

  // ── United Kingdom (GB) outbound ───────────────────────────────
  {
    code: 'GB-CH',
    name: 'United Kingdom \u2192 Switzerland',
    sourceCountry: 'GB',
    destCountry: 'CH',
    compliance: 'FCA + FINMA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason: 'FCA-FINMA strong bilateral \u2014 both FATF-compliant, streamlined compliance',
  },
  {
    code: 'GB-SG',
    name: 'United Kingdom \u2192 Singapore',
    sourceCountry: 'GB',
    destCountry: 'SG',
    compliance: 'FCA + MAS',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'FCA-MAS alignment \u2014 both enforce Travel Rule with mature digital asset frameworks',
  },
  {
    code: 'GB-HK',
    name: 'United Kingdom \u2192 Hong Kong',
    sourceCountry: 'GB',
    destCountry: 'HK',
    compliance: 'FCA + SFC',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'Post-handover considerations \u2014 FCA requires enhanced monitoring for HK corridor',
  },
  {
    code: 'GB-AE',
    name: 'United Kingdom \u2192 UAE',
    sourceCountry: 'GB',
    destCountry: 'AE',
    compliance: 'FCA + DFSA',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'DFSA/VARA framework growing \u2014 FCA requires enhanced monitoring for Gulf corridors',
  },
  {
    code: 'GB-EU',
    name: 'United Kingdom \u2192 EU',
    sourceCountry: 'GB',
    destCountry: 'EU',
    compliance: 'FCA + MiCA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'Post-Brexit divergence \u2014 FCA and MiCA not fully aligned, additional mapping required',
  },
  {
    code: 'GB-JP',
    name: 'United Kingdom \u2192 Japan',
    sourceCountry: 'GB',
    destCountry: 'JP',
    compliance: 'FCA + JFSA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason: 'UK-Japan bilateral strong \u2014 both FATF-compliant, low-friction corridor',
  },
  {
    code: 'GB-KR',
    name: 'United Kingdom \u2192 South Korea',
    sourceCountry: 'GB',
    destCountry: 'KR',
    compliance: 'FCA + FSC',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason: 'FSC strict but manageable \u2014 FCA-FSC compliance expectations aligned',
  },
  {
    code: 'GB-CN',
    name: 'United Kingdom \u2192 China',
    sourceCountry: 'GB',
    destCountry: 'CN',
    compliance: 'FCA + PBOC',
    riskLevel: 'HIGH',
    travelRuleThreshold: 1000,
    eddThreshold: 5000,
    reportingThreshold: 8000,
    riskReason:
      'China crypto restrictions \u2014 FCA requires full source-of-funds for CN-bound, very high bar',
  },
  {
    code: 'GB-US',
    name: 'United Kingdom \u2192 United States',
    sourceCountry: 'GB',
    destCountry: 'US',
    compliance: 'FCA + FinCEN',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'Strong UK-US AML cooperation \u2014 data sharing agreements, well-established corridor',
  },
  {
    code: 'GB-GB',
    name: 'United Kingdom Domestic',
    sourceCountry: 'GB',
    destCountry: 'GB',
    compliance: 'FCA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 25000,
    reportingThreshold: 100000,
    riskReason: 'Single-jurisdiction domestic transfer \u2014 FCA oversight only',
  },

  // ── UAE (AE) outbound ──────────────────────────────────────────
  {
    code: 'AE-CH',
    name: 'UAE \u2192 Switzerland',
    sourceCountry: 'AE',
    destCountry: 'CH',
    compliance: 'DFSA + FINMA',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'DFSA/VARA originator \u2014 FINMA requires enhanced source-of-funds for Gulf corridors',
  },
  {
    code: 'AE-SG',
    name: 'UAE \u2192 Singapore',
    sourceCountry: 'AE',
    destCountry: 'SG',
    compliance: 'DFSA + MAS',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason: 'DFSA-MAS growing relationship \u2014 additional due diligence for Gulf-APAC flows',
  },
  {
    code: 'AE-HK',
    name: 'UAE \u2192 Hong Kong',
    sourceCountry: 'AE',
    destCountry: 'HK',
    compliance: 'DFSA + SFC',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'Two evolving frameworks \u2014 DFSA/VARA and SFC both maturing, elevated monitoring',
  },
  {
    code: 'AE-EU',
    name: 'UAE \u2192 EU',
    sourceCountry: 'AE',
    destCountry: 'EU',
    compliance: 'DFSA + MiCA',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason: 'MiCA stringent on Gulf-origin \u2014 enhanced originator data requirements',
  },
  {
    code: 'AE-JP',
    name: 'UAE \u2192 Japan',
    sourceCountry: 'AE',
    destCountry: 'JP',
    compliance: 'DFSA + JFSA',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason: 'JFSA mature but cautious on Gulf corridors \u2014 additional verification layers',
  },
  {
    code: 'AE-KR',
    name: 'UAE \u2192 South Korea',
    sourceCountry: 'AE',
    destCountry: 'KR',
    compliance: 'DFSA + FSC',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason: 'FSC-DFSA limited bilateral \u2014 higher compliance overhead',
  },
  {
    code: 'AE-US',
    name: 'UAE \u2192 United States',
    sourceCountry: 'AE',
    destCountry: 'US',
    compliance: 'DFSA + FinCEN',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'FinCEN strict OFAC screening for Gulf origin \u2014 enhanced due diligence required',
  },
  {
    code: 'AE-GB',
    name: 'UAE \u2192 United Kingdom',
    sourceCountry: 'AE',
    destCountry: 'GB',
    compliance: 'DFSA + FCA',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'FCA cautious on Gulf-origin \u2014 enhanced monitoring, source-of-funds requirements',
  },
  {
    code: 'AE-AE',
    name: 'UAE Domestic',
    sourceCountry: 'AE',
    destCountry: 'AE',
    compliance: 'DFSA',
    riskLevel: 'LOW',
    travelRuleThreshold: 1000,
    eddThreshold: 25000,
    reportingThreshold: 100000,
    riskReason: 'Single-jurisdiction domestic transfer \u2014 DFSA/VARA oversight only',
  },

  // ── Fallback ───────────────────────────────────────────────────
  {
    code: 'CUSTOM',
    name: 'Custom Corridor',
    sourceCountry: 'XX',
    destCountry: 'XX',
    compliance: 'Manual',
    riskLevel: 'MEDIUM',
    travelRuleThreshold: 1000,
    eddThreshold: 10000,
    reportingThreshold: 15000,
    riskReason:
      'Uncharted corridor \u2014 manual compliance verification required, no pre-configured regulatory mapping',
  },
];

async function seed() {
  console.log(`Seeding ${corridors.length} corridors...`);

  let created = 0;
  let updated = 0;

  for (const c of corridors) {
    const result = await prisma.institutionCorridor.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        sourceCountry: c.sourceCountry,
        destCountry: c.destCountry,
        compliance: c.compliance,
        riskLevel: c.riskLevel,
        riskReason: c.riskReason,
        travelRuleThreshold: c.travelRuleThreshold,
        eddThreshold: c.eddThreshold,
        reportingThreshold: c.reportingThreshold,
        ...(c.description !== undefined && { description: c.description }),
        ...(c.minAmount !== undefined && { minAmount: c.minAmount }),
        ...(c.maxAmount !== undefined && { maxAmount: c.maxAmount }),
        ...(c.dailyLimit !== undefined && { dailyLimit: c.dailyLimit }),
        ...(c.monthlyLimit !== undefined && { monthlyLimit: c.monthlyLimit }),
      },
      create: {
        code: c.code,
        name: c.name,
        sourceCountry: c.sourceCountry,
        destCountry: c.destCountry,
        compliance: c.compliance,
        riskLevel: c.riskLevel,
        riskReason: c.riskReason,
        travelRuleThreshold: c.travelRuleThreshold,
        eddThreshold: c.eddThreshold,
        reportingThreshold: c.reportingThreshold,
        description: c.description || null,
        minAmount: c.minAmount ?? 10, // $10 default minimum
        maxAmount: c.maxAmount ?? 100000000, // $100M default maximum
        dailyLimit: c.dailyLimit ?? 10000000, // $10M default daily
        monthlyLimit: c.monthlyLimit ?? 100000000, // $100M default monthly
        status: 'ACTIVE',
      },
    });

    // If updatedAt is very close to createdAt, it was freshly created
    const wasCreated = Math.abs(result.updatedAt.getTime() - result.createdAt.getTime()) < 1000;
    if (wasCreated) created++;
    else updated++;
  }

  console.log(`Seed complete: ${created} created, ${updated} updated (${corridors.length} total)`);
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
