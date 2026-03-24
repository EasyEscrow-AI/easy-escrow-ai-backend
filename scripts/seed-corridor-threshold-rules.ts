/**
 * Seed corridor threshold rules for all active corridors.
 *
 * Usage:
 *   npx ts-node scripts/seed-corridor-threshold-rules.ts
 *
 * Creates 6 rules per corridor with jurisdiction-specific thresholds.
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// Jurisdiction-specific thresholds (in USD)
const JURISDICTION_THRESHOLDS: Record<
  string,
  { travelRule: number; edd: number; reporting: number }
> = {
  US: { travelRule: 3000, edd: 10000, reporting: 10000 },
  CH: { travelRule: 1000, edd: 25000, reporting: 100000 },
  SG: { travelRule: 1500, edd: 20000, reporting: 20000 },
  GB: { travelRule: 1000, edd: 15000, reporting: 15000 },
  AE: { travelRule: 1000, edd: 15000, reporting: 55000 },
  EU: { travelRule: 1000, edd: 15000, reporting: 15000 },
  HK: { travelRule: 1000, edd: 15000, reporting: 20000 },
  JP: { travelRule: 1000, edd: 10000, reporting: 10000 },
  AU: { travelRule: 1000, edd: 10000, reporting: 10000 },
  CA: { travelRule: 1000, edd: 10000, reporting: 10000 },
};
const DEFAULT_THRESHOLDS = { travelRule: 1000, edd: 10000, reporting: 15000 };

function getThresholds(corridorCode: string) {
  // Use the destination country's thresholds (stricter jurisdiction applies)
  const dest = corridorCode.split('-')[1];
  const source = corridorCode.split('-')[0];
  const destT = JURISDICTION_THRESHOLDS[dest] || DEFAULT_THRESHOLDS;
  const sourceT = JURISDICTION_THRESHOLDS[source] || DEFAULT_THRESHOLDS;
  // Use the stricter (lower) threshold between source and dest
  return {
    travelRule: Math.min(destT.travelRule, sourceT.travelRule),
    edd: Math.min(destT.edd, sourceT.edd),
    reporting: Math.min(destT.reporting, sourceT.reporting),
  };
}

function buildRules(corridorCode: string) {
  const t = getThresholds(corridorCode);

  return [
    {
      ruleId: 'travel_rule',
      label: 'Travel Rule Active',
      riskLevel: 'low',
      thresholdType: 'gte',
      thresholdAmount: t.travelRule,
      thresholdMax: null,
      currency: 'USD',
      detailTemplate: `FATF Recommendation 16 — originator and beneficiary data must accompany transfers ≥$\{threshold} on the {corridor} corridor.`,
      regulationRef: 'FATF R.16',
    },
    {
      ruleId: 'edd',
      label: 'Enhanced Due Diligence',
      riskLevel: 'medium',
      thresholdType: 'gte',
      thresholdAmount: t.edd,
      thresholdMax: null,
      currency: 'USD',
      detailTemplate: `Enhanced due diligence required for transfers ≥$\{threshold} on the {corridor} corridor.`,
      regulationRef: 'FATF R.10',
    },
    {
      ruleId: 'reporting',
      label: 'Regulatory Reporting',
      riskLevel: 'high',
      thresholdType: 'gte',
      thresholdAmount: t.reporting,
      thresholdMax: null,
      currency: 'USD',
      detailTemplate: `Regulatory reporting required for transfers ≥$\{threshold} on the {corridor} corridor.`,
      regulationRef: 'Local AML',
    },
    {
      ruleId: 'round_number',
      label: 'Round Number',
      riskLevel: 'low',
      thresholdType: 'pattern',
      thresholdAmount: 1000,
      thresholdMax: null,
      currency: 'USD',
      detailTemplate:
        'Amount is a round multiple of $1,000 — common in legitimate trade but also a structuring indicator.',
      regulationRef: 'FATF R.20',
    },
    {
      ruleId: 'structuring',
      label: 'Near Threshold',
      riskLevel: 'medium',
      thresholdType: 'range',
      thresholdAmount: 900,
      thresholdMax: 999,
      currency: 'USD',
      detailTemplate:
        'Amount falls in the $900–$999 range, just below the $1,000 Travel Rule threshold — potential structuring indicator.',
      regulationRef: '31 CFR §1010.314',
    },
    {
      ruleId: 'large_transaction',
      label: 'Large Transaction',
      riskLevel: 'medium',
      thresholdType: 'gte',
      thresholdAmount: 100000,
      thresholdMax: null,
      currency: 'USD',
      detailTemplate:
        'Transaction ≥$100,000 — requires enhanced monitoring and potential CTR filing.',
      regulationRef: 'CTR Filing',
    },
  ];
}

async function main() {
  const corridors = await prisma.institutionCorridor.findMany({
    where: { status: 'ACTIVE' },
    select: { code: true },
  });

  console.log(`Found ${corridors.length} active corridors`);

  let created = 0;
  let skipped = 0;

  for (const corridor of corridors) {
    const rules = buildRules(corridor.code);
    for (const rule of rules) {
      try {
        await prisma.corridorThresholdRule.upsert({
          where: {
            idx_corridor_rule_unique: {
              corridorCode: corridor.code,
              ruleId: rule.ruleId,
            },
          },
          create: {
            corridorCode: corridor.code,
            ...rule,
          },
          update: {
            label: rule.label,
            riskLevel: rule.riskLevel,
            thresholdAmount: rule.thresholdAmount,
            thresholdType: rule.thresholdType,
            thresholdMax: rule.thresholdMax,
            detailTemplate: rule.detailTemplate,
            regulationRef: rule.regulationRef,
          },
        });
        created++;
      } catch (err) {
        console.error(`  Failed for ${corridor.code}/${rule.ruleId}:`, (err as Error).message);
        skipped++;
      }
    }
    console.log(`  ${corridor.code}: 6 rules seeded`);
  }

  console.log(`\nDone: ${created} created/updated, ${skipped} skipped`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
