/**
 * Unit Tests for PDF Text Extraction (Real pdf-parse, No Mocks)
 *
 * These tests call the REAL extractPdfText method with actual PDF buffers
 * to catch library API changes like the pdf-parse v1→v2 break.
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config \
 *     tests/unit/institution-escrow/pdfExtraction.test.ts --timeout 30000
 */

import { expect } from 'chai';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { AiAnalysisService } from '../../../src/services/ai-analysis.service';

/**
 * Generate a minimal valid PDF buffer with embedded text.
 * Uses raw PDF 1.4 syntax — no external tools needed.
 */
function createTestPdfBuffer(text = 'Invoice #TEST-001\nAmount: 512 USDC'): Buffer {
  // The stream content length must match the /Length value exactly
  const streamLines = [
    'BT',
    '/F1 12 Tf',
    '100 700 Td',
    `(${text.replace(/\n/g, ') Tj 0 -20 Td (')}) Tj`,
    'ET',
  ];
  const streamContent = streamLines.join('\n');

  const pdfContent = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    'endobj',
    '3 0 obj',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    'endobj',
    '4 0 obj',
    `<< /Length ${streamContent.length} >>`,
    'stream',
    streamContent,
    'endstream',
    'endobj',
    '5 0 obj',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    'endobj',
  ];

  // Build xref table with correct byte offsets
  const bodyText = pdfContent.join('\n') + '\n';
  const offsets: number[] = [];
  let pos = 0;
  for (const line of pdfContent) {
    if (/^\d+ \d+ obj$/.test(line)) {
      offsets.push(pos);
    }
    pos += line.length + 1; // +1 for \n
  }

  const xrefStart = bodyText.length;
  const xrefLines = [
    'xref',
    `0 ${offsets.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${offsets.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefStart),
    '%%EOF',
  ];

  return Buffer.from(bodyText + xrefLines.join('\n'), 'utf-8');
}

describe('PDF Text Extraction (Real pdf-parse)', () => {
  let service: AiAnalysisService;

  before(() => {
    service = new AiAnalysisService();
  });

  it('should extract text from a valid PDF buffer using real pdf-parse', async () => {
    const pdfBuffer = createTestPdfBuffer('Invoice #TEST-001\nAmount: 512 USDC');

    // Call the REAL extractPdfText — no stubs
    const text = await (service as any).extractPdfText(pdfBuffer);

    expect(text).to.be.a('string');
    expect(text.length).to.be.greaterThan(0);
    // The extracted text should contain our embedded content
    expect(text).to.include('Invoice');
    expect(text).to.include('512');
  });

  it('should return fallback text for corrupted PDF without throwing', async () => {
    const corruptBuffer = Buffer.from('This is not a PDF');

    const text = await (service as any).extractPdfText(corruptBuffer);

    // Should gracefully return fallback, not throw
    expect(text).to.be.a('string');
    expect(text).to.include('PDF text extraction failed');
  });

  it('should return fallback text for empty buffer without throwing', async () => {
    const emptyBuffer = Buffer.alloc(0);

    const text = await (service as any).extractPdfText(emptyBuffer);

    expect(text).to.be.a('string');
    // Either returns empty string or fallback — should not throw
  });

  it('should handle a larger PDF with multiple text segments', async () => {
    const pdfBuffer = createTestPdfBuffer(
      'Optimus Exchange International\nInvoice INV-2026-0042\nBilled To: Satoshi Bridge Labs\nAmount Due: 512.00 USDC'
    );

    const text = await (service as any).extractPdfText(pdfBuffer);

    expect(text).to.be.a('string');
    expect(text.length).to.be.greaterThan(0);
    expect(text).to.include('Optimus');
    expect(text).to.include('512');
  });
});
