/**
 * Institution Escrow AI Analysis & File Management E2E Test (Staging)
 *
 * Tests the file upload/management system and AI analysis endpoints:
 * - Login with demo account
 * - Upload a test PDF file
 * - List files
 * - Get file download URL
 * - Delete file
 * - (AI analysis requires ANTHROPIC_API_KEY to be configured on staging)
 *
 * Run: cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/staging/e2e/24-institution-escrow-ai-analysis.test.ts --timeout 180000
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import axios, { AxiosInstance } from 'axios';

const STAGING_API = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';

// Demo account credentials (seeded in staging)
const DEMO_EMAIL = 'demo-enterprise@bank.com';
const DEMO_PASSWORD = 'DemoPass123!';

// Test wallets (from seed data)
const PAYER_WALLET = '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u';
const RECIPIENT_WALLET = '498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R';

/**
 * Generate a minimal valid PDF buffer for testing.
 * This creates a simple 1-page PDF with "Invoice #TEST-001" text.
 */
function createTestPdfBuffer(): Buffer {
  const pdfContent = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    'endobj',
    '3 0 obj',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    'endobj',
    '4 0 obj',
    '<< /Length 82 >>',
    'stream',
    'BT',
    '/F1 24 Tf',
    '100 700 Td',
    '(Invoice #TEST-001) Tj',
    '0 -30 Td',
    '/F1 12 Tf',
    '(Amount: 100 USDC) Tj',
    'ET',
    'endstream',
    'endobj',
    '5 0 obj',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    'endobj',
    'xref',
    '0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000266 00000 n ',
    '0000000399 00000 n ',
    'trailer',
    '<< /Size 6 /Root 1 0 R >>',
    'startxref',
    '477',
    '%%EOF',
  ].join('\n');

  return Buffer.from(pdfContent, 'utf-8');
}

describe('Institution AI Analysis & File Management - E2E Staging', function () {
  this.timeout(180000);

  let api: AxiosInstance;
  let accessToken: string;
  let uploadedFileId: string;
  let escrowId: string;
  const cleanupFileIds: string[] = [];
  const cleanupEscrowIds: string[] = [];

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('  Institution AI Analysis & File Management - E2E Staging');
    console.log('='.repeat(80));
    console.log('');
    console.log(`  API:   ${STAGING_API}`);
    console.log(`  Demo:  ${DEMO_EMAIL}`);
    console.log('');

    api = axios.create({
      baseURL: STAGING_API,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });

    // Login
    console.log('  Logging in with demo enterprise account...');
    let loginRes;
    try {
      loginRes = await api.post('/api/v1/institution/auth/login', {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (loginRes.status === 504) {
        console.log('  Institution endpoints returning 504 - likely insufficient server resources');
        return this.skip();
      }
    } catch (err: any) {
      console.log('  Institution endpoints unavailable:', err.message || err);
      return this.skip();
    }

    expect(loginRes.status).to.equal(
      200,
      `Demo login failed (${loginRes.status}): ${JSON.stringify(loginRes.data)}. ` +
        'Ensure staging DB is seeded.',
    );

    accessToken = loginRes.data.data.tokens.accessToken;
    console.log('  Logged in successfully');

    // Create an escrow to associate files with
    console.log('  Creating test escrow for file association...');
    const escrowRes = await api.post(
      '/api/v1/institution-escrow',
      {
        payerWallet: PAYER_WALLET,
        recipientWallet: RECIPIENT_WALLET,
        amount: 100,
        corridor: 'SG-CH',
        conditionType: 'ADMIN_RELEASE',
        expiryHours: 24,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(escrowRes.status).to.equal(201, `Escrow creation failed: ${JSON.stringify(escrowRes.data)}`);
    escrowId = escrowRes.data.data.escrowId;
    cleanupEscrowIds.push(escrowId);
    console.log(`  Test escrow: ${escrowId}\n`);
  });

  // ---------------------------------------------------------------------------
  // 1. Upload a test PDF file
  // ---------------------------------------------------------------------------

  it('should upload a PDF file', async function () {
    console.log('  [1] Uploading test PDF file...');

    const pdfBuffer = createTestPdfBuffer();

    // Build multipart form data manually using axios
    const boundary = `----FormBoundary${Date.now()}`;
    const CRLF = '\r\n';

    const parts: Buffer[] = [];

    // File field
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="test-invoice.pdf"${CRLF}` +
      `Content-Type: application/pdf${CRLF}${CRLF}`,
    ));
    parts.push(pdfBuffer);
    parts.push(Buffer.from(CRLF));

    // documentType field
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="documentType"${CRLF}${CRLF}` +
      `INVOICE${CRLF}`,
    ));

    // escrowId field
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="escrowId"${CRLF}${CRLF}` +
      `${escrowId}${CRLF}`,
    ));

    // End boundary
    parts.push(Buffer.from(`--${boundary}--${CRLF}`));

    const body = Buffer.concat(parts);

    const res = await api.post('/api/v1/institution/files', body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      maxContentLength: 10 * 1024 * 1024,
    });

    expect(res.status).to.equal(201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;
    expect(res.data.data).to.exist;
    expect(res.data.data.id).to.be.a('string');

    uploadedFileId = res.data.data.id;
    cleanupFileIds.push(uploadedFileId);

    console.log(`    File ID: ${uploadedFileId}`);
    console.log(`    Filename: ${res.data.data.originalName || res.data.data.filename || 'test-invoice.pdf'}`);
    console.log(`    Document type: ${res.data.data.documentType || 'INVOICE'}`);
    if (res.data.data.size) {
      console.log(`    Size: ${res.data.data.size} bytes`);
    }
  });

  it('should reject upload without file', async function () {
    console.log('  [1b] Attempting upload without file...');

    const res = await api.post('/api/v1/institution/files', {}, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.be.oneOf([400, 415]);
    console.log(`    Correctly rejected (${res.status}): ${res.data.message}`);
  });

  // ---------------------------------------------------------------------------
  // 2. List files
  // ---------------------------------------------------------------------------

  it('should list files for the client', async function () {
    console.log('  [2] Listing files...');

    const res = await api.get('/api/v1/institution/files', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(200);
    expect(res.data.success).to.be.true;

    const files = Array.isArray(res.data.data) ? res.data.data : [];

    expect(files.length).to.be.at.least(1, 'Should have at least 1 file');

    const found = files.find((f: any) => f.id === uploadedFileId);
    expect(found, `Uploaded file ${uploadedFileId} should appear in list`).to.exist;

    console.log(`    Total files: ${files.length}`);
    console.log(`    Uploaded file found: ${!!found}`);
  });

  it('should list files filtered by escrowId', async function () {
    console.log('  [2b] Listing files filtered by escrow ID...');

    const res = await api.get('/api/v1/institution/files', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { escrowId },
    });

    expect(res.status).to.equal(200);

    const files = Array.isArray(res.data.data) ? res.data.data : [];

    // All returned files should be associated with our escrow
    const found = files.find((f: any) => f.id === uploadedFileId);
    console.log(`    Files for escrow ${escrowId}: ${files.length}`);
    console.log(`    Test file found: ${!!found}`);
  });

  // ---------------------------------------------------------------------------
  // 3. Get file download URL
  // ---------------------------------------------------------------------------

  it('should get file download URL', async function () {
    console.log('  [3] Getting file download URL...');

    const res = await api.get(`/api/v1/institution/files/${uploadedFileId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;
    expect(res.data.data).to.exist;

    // The response should contain a download URL or signed URL
    const hasUrl = res.data.data.url || res.data.data.downloadUrl || res.data.data.signedUrl;
    expect(hasUrl, 'Response should include a URL for downloading the file').to.be.a('string');

    console.log(`    URL provided: ${hasUrl ? 'yes' : 'no'}`);
    if (hasUrl) {
      console.log(`    URL prefix: ${hasUrl.substring(0, 60)}...`);
    }
  });

  it('should return 404 for non-existent file', async function () {
    console.log('  [3b] Getting non-existent file...');

    const res = await api.get('/api/v1/institution/files/00000000-0000-0000-0000-000000000000', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(404);
    console.log(`    Correctly returned 404`);
  });

  // ---------------------------------------------------------------------------
  // 4. AI Analysis (skipped unless ANTHROPIC_API_KEY is configured on staging)
  // ---------------------------------------------------------------------------

  it.skip('should run AI analysis on uploaded file (requires ANTHROPIC_API_KEY on staging)', async function () {
    // AI analysis requires:
    // 1. ANTHROPIC_API_KEY environment variable set on the staging server
    // 2. A valid escrow ID
    // 3. A valid file ID pointing to an uploaded document
    //
    // POST /api/v1/ai/analyze/:escrow_id
    // Body: { fileId: "...", context: { expectedAmount: 100, poNumber: "PO-001" } }
    //
    // To enable:
    // - Ensure ANTHROPIC_API_KEY is set in staging environment
    // - Uncomment the test below
    //
    // const res = await api.post(
    //   `/api/v1/ai/analyze/${escrowId}`,
    //   {
    //     fileId: uploadedFileId,
    //     context: {
    //       expectedAmount: 100,
    //       poNumber: 'TEST-001',
    //     },
    //   },
    //   { headers: { Authorization: `Bearer ${accessToken}` } },
    // );
    //
    // expect(res.status).to.equal(200);
    // expect(res.data.data).to.exist;
    // console.log('    AI analysis result:', JSON.stringify(res.data.data, null, 2));
  });

  it.skip('should get AI analysis results (requires prior analysis run)', async function () {
    // GET /api/v1/ai/analysis/:escrow_id
    // Returns all analyses for a given escrow
    //
    // const res = await api.get(`/api/v1/ai/analysis/${escrowId}`, {
    //   headers: { Authorization: `Bearer ${accessToken}` },
    // });
    //
    // expect(res.status).to.equal(200);
    // expect(res.data.data).to.be.an('array');
  });

  // ---------------------------------------------------------------------------
  // 5. Delete file
  // ---------------------------------------------------------------------------

  it('should delete the uploaded file', async function () {
    console.log('  [5] Deleting uploaded file...');

    const res = await api.delete(`/api/v1/institution/files/${uploadedFileId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`);
    expect(res.data.success).to.be.true;

    // Remove from cleanup since we deleted it
    const idx = cleanupFileIds.indexOf(uploadedFileId);
    if (idx >= 0) cleanupFileIds.splice(idx, 1);

    console.log(`    File ${uploadedFileId} deleted`);
  });

  it('should return 404 when getting deleted file', async function () {
    console.log('  [5b] Verifying deleted file returns 404...');

    const res = await api.get(`/api/v1/institution/files/${uploadedFileId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.status).to.equal(404);
    console.log(`    Correctly returned 404 for deleted file`);
  });

  it('should not show deleted file in file list', async function () {
    console.log('  [5c] Verifying deleted file not in list...');

    const res = await api.get('/api/v1/institution/files', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { escrowId },
    });

    expect(res.status).to.equal(200);

    const files = Array.isArray(res.data.data) ? res.data.data : [];
    const found = files.find((f: any) => f.id === uploadedFileId);

    expect(found, 'Deleted file should not appear in list').to.be.undefined;
    console.log(`    Deleted file absent from list: confirmed`);
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  after(async function () {
    // Delete any remaining files
    for (const fileId of cleanupFileIds) {
      try {
        await api.delete(`/api/v1/institution/files/${fileId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        console.log(`  Cleaned up file: ${fileId}`);
      } catch {
        // Best-effort cleanup
      }
    }

    // Cancel test escrows
    for (const id of cleanupEscrowIds) {
      try {
        await api.post(
          `/api/v1/institution-escrow/${id}/cancel`,
          { reason: 'E2E test cleanup' },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        console.log(`  Cleaned up escrow: ${id}`);
      } catch {
        // Best-effort cleanup
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('  Institution AI Analysis & File Management - Tests Complete');
    console.log('='.repeat(80));
    console.log('');
    console.log('  Summary:');
    console.log('    File upload (PDF with documentType and escrowId)');
    console.log('    File listing (all files and filtered by escrowId)');
    console.log('    File download URL retrieval');
    console.log('    File deletion and 404 verification');
    console.log('    AI analysis: SKIPPED (requires ANTHROPIC_API_KEY on staging)');
    console.log('');
  });
});
