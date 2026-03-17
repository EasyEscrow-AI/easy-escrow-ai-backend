/**
 * Generate Sample Institution Escrow Receipt PDF
 *
 * Fetches a real escrow from the staging database and generates a PDF receipt.
 * Saves to ./receipts/sample-receipt-{status}.pdf
 *
 * Usage: npx ts-node scripts/generate-sample-receipt.ts [escrow-status]
 *
 * Examples:
 *   npx ts-node scripts/generate-sample-receipt.ts           # picks RELEASED escrow
 *   npx ts-node scripts/generate-sample-receipt.ts FUNDED
 *   npx ts-node scripts/generate-sample-receipt.ts COMPLIANCE_HOLD
 */

import { PrismaClient } from '../src/generated/prisma';
import { InstitutionReceiptService } from '../src/services/institution-receipt.service';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const targetStatus = process.argv[2] || 'RELEASED';
  console.log(`Looking for a ${targetStatus} escrow in staging DB...\n`);

  const escrow = await prisma.institutionEscrow.findFirst({
    where: { status: targetStatus as any },
    include: {
      client: true,
      deposits: true,
      auditLogs: { orderBy: { createdAt: 'asc' } },
      aiAnalyses: { take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!escrow) {
    console.error(`No escrow found with status ${targetStatus}`);
    console.log('Available statuses: CREATED, FUNDED, COMPLIANCE_HOLD, RELEASING, RELEASED, CANCELLING, CANCELLED, EXPIRED, FAILED');
    process.exit(1);
  }

  console.log(`Found escrow:`);
  console.log(`  ID:       ${escrow.escrowId}`);
  console.log(`  Client:   ${escrow.client.companyName}`);
  console.log(`  Status:   ${escrow.status}`);
  console.log(`  Amount:   ${Number(escrow.amount).toLocaleString()} USDC`);
  console.log(`  Corridor: ${escrow.corridor}`);
  console.log(`  Deposits: ${escrow.deposits.length}`);
  console.log(`  Audits:   ${escrow.auditLogs.length}`);
  console.log(`  AI:       ${escrow.aiAnalyses.length > 0 ? 'Yes' : 'No'}\n`);

  const service = new InstitutionReceiptService(prisma);
  console.log('Generating receipt data...');
  const data = await service.getReceiptData(escrow.escrowId, escrow.clientId);

  const outDir = path.resolve(__dirname, '../receipts');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const htmlPath = path.join(outDir, `sample-receipt-${targetStatus.toLowerCase()}.html`);
  fs.writeFileSync(htmlPath, service.renderReceiptHTML(data));
  console.log(`HTML saved: ${htmlPath}`);

  console.log('Generating PDF (launching Puppeteer)...');
  const pdfBuffer = await service.renderReceiptPDF(data);

  const pdfPath = path.join(outDir, `sample-receipt-${targetStatus.toLowerCase()}.pdf`);
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log(`PDF saved:  ${pdfPath}`);
  console.log(`\nSize: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`Receipt #:  ${data.receiptNumber}`);
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
