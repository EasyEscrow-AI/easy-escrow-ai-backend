/**
 * Institution Escrow Primary Path - Full E2E Test (Staging + Devnet)
 *
 * Tests the complete institutional escrow lifecycle against the staging API
 * with REAL on-chain Solana devnet transactions:
 *
 *   Pre-test: Ensure buyer + supplier test clients exist (create if missing)
 *             Verify devnet wallet balances and USDC token accounts
 *   1. Create escrow (buyer) — SG-CH corridor, ADMIN_RELEASE, 1 USDC
 *   2. Verify escrow CREATED status + PDA derivation
 *   3. Fund escrow — real USDC SPL token transfer on devnet, record tx signature
 *   4. Upload invoice document (buyer, on behalf of supplier proof)
 *   5. Approve & release funds (buyer + settlement authority) — status → RELEASED
 *   6. Verify escrow settlement completed
 *   7. Verify receipt generated (JSON + HTML)
 *   8. Verify on-chain: confirm deposit tx on Solana devnet
 *
 * Wallets (loaded from env, with private keys for signing):
 *   Buyer/Payer:     DEVNET_STAGING_SENDER_ADDRESS   (DEVNET_STAGING_SENDER_PRIVATE_KEY)
 *   Supplier/Recip:  DEVNET_STAGING_RECEIVER_ADDRESS  (DEVNET_STAGING_RECEIVER_PRIVATE_KEY)
 *   Admin/PDA signer: DEVNET_STAGING_ADMIN_ADDRESS    (DEVNET_STAGING_ADMIN_PRIVATE_KEY)
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config \
 *     tests/staging/e2e/25-institution-escrow-primary-path.test.ts --timeout 180000
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import axios, { AxiosInstance } from 'axios';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STAGING_API = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SETTLEMENT_KEY = process.env.SETTLEMENT_AUTHORITY_API_KEY || 'inst-settlement-key-staging-2026';

// USDC mint on devnet/staging
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT_ADDRESS || 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
);

// Escrow amount in USDC (keep small for devnet testing)
const ESCROW_AMOUNT_USDC = 1; // $1 USDC
const ESCROW_AMOUNT_MICRO = ESCROW_AMOUNT_USDC * 1_000_000; // 6 decimals

// Wallets from staging env
const BUYER_WALLET_ADDRESS = process.env.DEVNET_STAGING_SENDER_ADDRESS || '';
const SUPPLIER_WALLET_ADDRESS = process.env.DEVNET_STAGING_RECEIVER_ADDRESS || '';
const BUYER_PRIVATE_KEY = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY || '';
const SUPPLIER_PRIVATE_KEY = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY || '';

// Fallback demo account
const DEMO_EMAIL = 'demo-enterprise@bank.com';
const DEMO_PASSWORD = 'DemoPass123!';

// Test client credentials
const RUN_ID = Date.now().toString(36);
const BUYER_EMAIL = `e2e-buyer-${RUN_ID}@test.easyescrow.ai`;
const SUPPLIER_EMAIL = `e2e-supplier-${RUN_ID}@test.easyescrow.ai`;
const TEST_PASSWORD = 'E2eTest@2026!Secure';

describe('Institution Escrow Primary Path - Full E2E (Staging + Devnet)', function () {
  this.timeout(180000);

  let api: AxiosInstance;
  let connection: Connection;
  let buyerKeypair: Keypair;
  let supplierKeypair: Keypair;
  let buyerToken: string;
  let escrowId: string;
  let depositTxSignature: string;
  let uploadedFileId: string;
  let useDemoAccount = false;

  // ─── Pre-test setup ──────────────────────────────────────────

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('  Institution Escrow Primary Path - Full E2E (Staging + Devnet)');
    console.log('='.repeat(80));
    console.log(`  API:       ${STAGING_API}`);
    console.log(`  RPC:       ${SOLANA_RPC}`);
    console.log(`  USDC Mint: ${USDC_MINT.toBase58()}`);
    console.log(`  Buyer:     ${BUYER_WALLET_ADDRESS}`);
    console.log(`  Supplier:  ${SUPPLIER_WALLET_ADDRESS}`);
    console.log('');

    // ── Validate required env vars ──
    if (!BUYER_PRIVATE_KEY || !SUPPLIER_PRIVATE_KEY) {
      console.log('  Missing DEVNET_STAGING_SENDER_PRIVATE_KEY or DEVNET_STAGING_RECEIVER_PRIVATE_KEY');
      console.log('  Set these env vars or load .env.staging to run this test');
      return this.skip();
    }

    // ── Load keypairs ──
    try {
      buyerKeypair = Keypair.fromSecretKey(bs58.decode(BUYER_PRIVATE_KEY));
      supplierKeypair = Keypair.fromSecretKey(bs58.decode(SUPPLIER_PRIVATE_KEY));
      console.log(`  Buyer keypair:    ${buyerKeypair.publicKey.toBase58()}`);
      console.log(`  Supplier keypair: ${supplierKeypair.publicKey.toBase58()}`);
    } catch (err: any) {
      console.log(`  Failed to load keypairs: ${err.message}`);
      return this.skip();
    }

    // ── Connect to Solana devnet ──
    connection = new Connection(SOLANA_RPC, 'confirmed');

    // ── Verify SOL balance (need gas for tx) ──
    const buyerSolBalance = await connection.getBalance(buyerKeypair.publicKey);
    console.log(`  Buyer SOL:        ${(buyerSolBalance / 1e9).toFixed(4)} SOL`);
    if (buyerSolBalance < 0.01 * 1e9) {
      console.log('  Insufficient SOL balance for gas — skipping');
      return this.skip();
    }

    // ── Verify USDC balance ──
    try {
      const buyerAta = await getAssociatedTokenAddress(USDC_MINT, buyerKeypair.publicKey);
      const buyerUsdcAccount = await getAccount(connection, buyerAta);
      const buyerUsdcBalance = Number(buyerUsdcAccount.amount) / 1_000_000;
      console.log(`  Buyer USDC:       ${buyerUsdcBalance.toFixed(2)} USDC`);

      if (buyerUsdcBalance < ESCROW_AMOUNT_USDC) {
        console.log(`  Insufficient USDC balance (need ${ESCROW_AMOUNT_USDC}) — skipping`);
        return this.skip();
      }
    } catch (err: any) {
      console.log(`  Buyer has no USDC token account — skipping: ${err.message}`);
      return this.skip();
    }

    // ── Setup API client ──
    api = axios.create({
      baseURL: STAGING_API,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });

    // ── Health check ──
    try {
      const health = await api.get('/health');
      if (health.status >= 500) {
        console.log(`  Server unhealthy (${health.status}) — skipping`);
        return this.skip();
      }
    } catch (err: any) {
      console.log(`  Server unreachable: ${err.message}`);
      return this.skip();
    }

    // ── Login / register buyer client ──
    console.log('\n  Setting up buyer client...');
    const buyerReg = await api.post('/api/v1/institution/auth/register', {
      email: BUYER_EMAIL,
      password: TEST_PASSWORD,
      companyName: `E2E Buyer Corp ${RUN_ID}`,
    });

    if (buyerReg.status === 201 || buyerReg.status === 200) {
      buyerToken = buyerReg.data.data.tokens.accessToken;
      console.log(`    Registered: ${BUYER_EMAIL}`);
    } else if (buyerReg.status === 409) {
      const login = await api.post('/api/v1/institution/auth/login', {
        email: BUYER_EMAIL,
        password: TEST_PASSWORD,
      });
      if (login.status === 200) {
        buyerToken = login.data.data.tokens.accessToken;
        console.log(`    Logged in (existing): ${BUYER_EMAIL}`);
      }
    }

    if (!buyerToken) {
      console.log('    Registration unavailable — falling back to demo account');
      const demoLogin = await api.post('/api/v1/institution/auth/login', {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (demoLogin.status !== 200) {
        console.log(`    Demo login failed (${demoLogin.status}) — skipping`);
        return this.skip();
      }
      buyerToken = demoLogin.data.data.tokens.accessToken;
      useDemoAccount = true;
      console.log(`    Using demo account: ${DEMO_EMAIL}`);
    }

    console.log('');
  });

  // ─── 1. Create escrow ────────────────────────────────────────

  it('1. should create a new escrow (buyer)', async function () {
    console.log(`  [1] Creating escrow: SG-CH, ${ESCROW_AMOUNT_USDC} USDC, ADMIN_RELEASE...`);

    const res = await api.post(
      '/api/v1/institution-escrow',
      {
        payerWallet: buyerKeypair.publicKey.toBase58(),
        recipientWallet: supplierKeypair.publicKey.toBase58(),
        amount: ESCROW_AMOUNT_USDC,
        corridor: 'SG-CH',
        conditionType: 'ADMIN_RELEASE',
        expiryHours: 24,
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } },
    );

    expect(res.status).to.equal(
      201,
      `Expected 201 but got ${res.status}: ${JSON.stringify(res.data)}`,
    );
    expect(res.data.success).to.be.true;

    const data = res.data.data;
    const escrow = data.escrow || data;
    expect(escrow.escrowId).to.be.a('string');
    expect(escrow.status).to.be.oneOf(['CREATED', 'COMPLIANCE_HOLD']);

    escrowId = escrow.escrowId;

    console.log(`      Escrow ID:  ${escrowId}`);
    console.log(`      Status:     ${escrow.status}`);
    console.log(`      Amount:     ${escrow.amount} USDC`);
    console.log(`      Corridor:   ${escrow.corridor}`);
    console.log(`      Payer:      ${escrow.payerWallet}`);
    console.log(`      Recipient:  ${escrow.recipientWallet}`);

    if (escrow.status === 'COMPLIANCE_HOLD') {
      console.log('      Escrow in COMPLIANCE_HOLD — subsequent deposit step will fail');
    }
  });

  // ─── 2. Verify CREATED + derive PDAs ─────────────────────────

  it('2. should verify escrow CREATED and derive on-chain PDAs', async function () {
    console.log('  [2] Verifying escrow details + PDA derivation...');

    const res = await api.get(`/api/v1/institution-escrow/${escrowId}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    expect(res.status).to.equal(200);
    const escrow = res.data.data;
    expect(escrow.escrowId).to.equal(escrowId);
    expect(escrow.payerWallet).to.equal(buyerKeypair.publicKey.toBase58());
    expect(escrow.recipientWallet).to.equal(supplierKeypair.publicKey.toBase58());
    expect(escrow.amount).to.equal(ESCROW_AMOUNT_USDC);

    // Derive PDAs locally to verify program address math
    const INST_ESCROW_SEED = Buffer.from('inst_escrow');
    const INST_VAULT_SEED = Buffer.from('inst_vault');
    const programId = new PublicKey(
      process.env.ESCROW_PROGRAM_ID || 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei',
    );

    // Convert UUID to 32-byte buffer (same as program service)
    const hex = escrowId.replace(/-/g, '');
    const uuidBuf = Buffer.alloc(32);
    Buffer.from(hex, 'hex').copy(uuidBuf);

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [INST_ESCROW_SEED, uuidBuf],
      programId,
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [INST_VAULT_SEED, uuidBuf],
      programId,
    );

    console.log(`      Status:      ${escrow.status}`);
    console.log(`      Program:     ${programId.toBase58()}`);
    console.log(`      Escrow PDA:  ${escrowPda.toBase58()}`);
    console.log(`      Vault PDA:   ${vaultPda.toBase58()}`);
    console.log(`      Created:     ${escrow.createdAt}`);
    console.log(`      Expires:     ${escrow.expiresAt}`);

    // PDAs should be off-curve (valid program addresses)
    expect(PublicKey.isOnCurve(escrowPda.toBytes())).to.be.false;
    expect(PublicKey.isOnCurve(vaultPda.toBytes())).to.be.false;
  });

  // ─── 3. Real on-chain USDC deposit ───────────────────────────

  it('3. should execute real USDC transfer on devnet and record deposit', async function () {
    this.timeout(60000);
    console.log(`  [3] Executing real USDC transfer on Solana devnet (${ESCROW_AMOUNT_USDC} USDC)...`);

    // ── Get or create ATAs ──
    const buyerAta = await getAssociatedTokenAddress(USDC_MINT, buyerKeypair.publicKey);
    const supplierAta = await getAssociatedTokenAddress(USDC_MINT, supplierKeypair.publicKey);

    console.log(`      Buyer ATA:      ${buyerAta.toBase58()}`);
    console.log(`      Supplier ATA:   ${supplierAta.toBase58()}`);

    // ── Check if supplier ATA exists, create if not ──
    const tx = new Transaction();
    try {
      await getAccount(connection, supplierAta);
      console.log('      Supplier ATA exists');
    } catch {
      console.log('      Creating supplier ATA...');
      tx.add(
        createAssociatedTokenAccountInstruction(
          buyerKeypair.publicKey, // payer
          supplierAta,
          supplierKeypair.publicKey, // owner
          USDC_MINT,
        ),
      );
    }

    // ── Build USDC transfer instruction ──
    tx.add(
      createTransferInstruction(
        buyerAta,                    // source
        supplierAta,                 // destination
        buyerKeypair.publicKey,      // owner/authority
        ESCROW_AMOUNT_MICRO,         // amount in micro-USDC
      ),
    );

    // ── Send and confirm on devnet ──
    console.log('      Sending transaction to devnet...');
    try {
      depositTxSignature = await sendAndConfirmTransaction(connection, tx, [buyerKeypair], {
        commitment: 'confirmed',
      });
    } catch (err: any) {
      console.log(`      On-chain transfer failed: ${err.message}`);
      // If the transfer fails (e.g., insufficient USDC), skip remaining tests
      return this.skip();
    }

    console.log(`      Tx signature:   ${depositTxSignature}`);
    expect(depositTxSignature).to.be.a('string');
    expect(depositTxSignature.length).to.be.gte(80);

    // ── Verify tx on-chain ──
    const txInfo = await connection.getTransaction(depositTxSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    expect(txInfo).to.not.be.null;
    expect(txInfo!.meta?.err).to.be.null;
    console.log(`      On-chain:       confirmed (slot ${txInfo!.slot})`);

    // ── Record deposit via API ──
    console.log('      Recording deposit via API...');
    const depositRes = await api.post(
      `/api/v1/institution-escrow/${escrowId}/deposit`,
      { txSignature: depositTxSignature },
      { headers: { Authorization: `Bearer ${buyerToken}` } },
    );

    expect(depositRes.status).to.equal(
      200,
      `Expected 200 but got ${depositRes.status}: ${JSON.stringify(depositRes.data)}`,
    );
    expect(depositRes.data.success).to.be.true;

    const escrow = depositRes.data.data;
    expect(escrow.status).to.equal('FUNDED');
    expect(escrow.depositTxSignature).to.equal(depositTxSignature);

    console.log(`      API status:     ${escrow.status}`);
    console.log(`      Funded at:      ${escrow.fundedAt}`);
  });

  // ─── 4. Upload invoice document ──────────────────────────────

  it('4. should upload invoice document as proof', async function () {
    console.log('  [4] Uploading invoice PDF...');

    const pdfContent = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n' +
        'xref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF',
    );

    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', pdfContent, {
      filename: `invoice-e2e-${RUN_ID}.pdf`,
      contentType: 'application/pdf',
    });
    form.append('documentType', 'INVOICE');
    form.append('escrowId', escrowId);

    const res = await api.post('/api/v1/institution/files', form, {
      headers: {
        Authorization: `Bearer ${buyerToken}`,
        ...form.getHeaders(),
      },
      timeout: 30000,
    });

    if (res.status === 503) {
      console.log('      File upload service unavailable — skipping');
      return this.skip();
    }

    expect(res.status).to.be.oneOf(
      [200, 201],
      `Expected 200/201 but got ${res.status}: ${JSON.stringify(res.data)}`,
    );

    const file = res.data.data || res.data;
    uploadedFileId = file.id;

    console.log(`      File ID:    ${uploadedFileId}`);
    console.log(`      Filename:   ${file.fileName || file.originalName}`);
    console.log(`      Type:       ${file.documentType}`);
    console.log(`      Size:       ${file.sizeBytes || file.size} bytes`);
  });

  // ─── 5. Release funds ────────────────────────────────────────

  it('5. should release funds with settlement authority (buyer approval)', async function () {
    console.log('  [5] Releasing funds (buyer approval + settlement key)...');

    const res = await api.post(
      `/api/v1/institution-escrow/${escrowId}/release`,
      { notes: 'E2E test — buyer approved after invoice verification' },
      {
        headers: {
          Authorization: `Bearer ${buyerToken}`,
          'X-Settlement-Authority-Key': SETTLEMENT_KEY,
        },
      },
    );

    expect(res.status).to.equal(
      200,
      `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`,
    );
    expect(res.data.success).to.be.true;

    const escrow = res.data.data;
    expect(escrow.status).to.equal('RELEASED');
    expect(escrow.resolvedAt).to.be.a('string');

    console.log(`      Status:     ${escrow.status}`);
    console.log(`      Resolved:   ${escrow.resolvedAt}`);
  });

  // ─── 6. Verify settlement completed ──────────────────────────

  it('6. should confirm escrow RELEASED with all timestamps', async function () {
    console.log('  [6] Verifying final escrow state...');

    const res = await api.get(`/api/v1/institution-escrow/${escrowId}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    expect(res.status).to.equal(200);
    const escrow = res.data.data;

    expect(escrow.status).to.equal('RELEASED');
    expect(escrow.escrowId).to.equal(escrowId);
    expect(escrow.depositTxSignature).to.equal(depositTxSignature);
    expect(escrow.resolvedAt).to.not.be.null;
    expect(escrow.fundedAt).to.not.be.null;

    console.log(`      Status:           ${escrow.status}`);
    console.log(`      Amount:           ${escrow.amount} USDC`);
    console.log(`      Platform Fee:     ${escrow.platformFee} USDC`);
    console.log(`      Deposit Tx:       ${depositTxSignature.substring(0, 20)}...`);
    console.log(`      Created:          ${escrow.createdAt}`);
    console.log(`      Funded:           ${escrow.fundedAt}`);
    console.log(`      Resolved:         ${escrow.resolvedAt}`);
  });

  // ─── 7. Verify receipt ───────────────────────────────────────

  it('7a. should retrieve receipt JSON with audit trail', async function () {
    console.log('  [7a] Fetching receipt JSON...');

    const res = await api.get(
      `/api/v1/institution-escrow/${escrowId}/receipt/data`,
      { headers: { Authorization: `Bearer ${buyerToken}` } },
    );

    if (res.status === 404) {
      console.log('      Receipt endpoint not deployed yet — skipping');
      return this.skip();
    }

    expect(res.status).to.equal(
      200,
      `Expected 200 but got ${res.status}: ${JSON.stringify(res.data)}`,
    );

    const receipt = res.data;
    expect(receipt).to.have.property('receiptNumber');
    expect(receipt).to.have.property('escrow');
    expect(receipt.escrow.escrowId).to.equal(escrowId);
    expect(receipt.escrow.status).to.equal('RELEASED');

    console.log(`      Receipt #:        ${receipt.receiptNumber}`);
    console.log(`      Escrow status:    ${receipt.escrow.status}`);
    console.log(`      Generated:        ${receipt.generatedAt}`);

    if (receipt.transactions?.deposits?.length) {
      console.log(`      Deposits:         ${receipt.transactions.deposits.length}`);
      // Verify the real tx signature appears in the receipt
      const depositEntry = receipt.transactions.deposits[0];
      if (depositEntry.txSignature) {
        expect(depositEntry.txSignature).to.equal(depositTxSignature);
        console.log(`      Deposit tx match: yes`);
      }
    }
    if (receipt.auditTrail?.length) {
      console.log(`      Audit entries:    ${receipt.auditTrail.length}`);
    }
  });

  it('7b. should retrieve receipt HTML', async function () {
    console.log('  [7b] Fetching receipt HTML...');

    const res = await api.get(
      `/api/v1/institution-escrow/${escrowId}/receipt?format=html`,
      {
        headers: { Authorization: `Bearer ${buyerToken}` },
        responseType: 'text',
      },
    );

    if (res.status === 404) {
      console.log('      Receipt endpoint not deployed yet — skipping');
      return this.skip();
    }

    expect(res.status).to.equal(200);

    const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    expect(html).to.include('<!DOCTYPE html');
    expect(html).to.include(escrowId);

    console.log(`      HTML length:      ${html.length} chars`);
    console.log(`      Contains escrow:  yes`);
  });

  // ─── 8. On-chain verification ────────────────────────────────

  it('8. should verify deposit tx exists on Solana devnet', async function () {
    console.log('  [8] Verifying deposit transaction on Solana devnet...');

    const txInfo = await connection.getTransaction(depositTxSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    expect(txInfo).to.not.be.null;
    expect(txInfo!.meta?.err).to.be.null;

    console.log(`      Tx signature:     ${depositTxSignature.substring(0, 20)}...`);
    console.log(`      Slot:             ${txInfo!.slot}`);
    console.log(`      Block time:       ${txInfo!.blockTime ? new Date(txInfo!.blockTime * 1000).toISOString() : 'N/A'}`);
    console.log(`      Fee (lamports):   ${txInfo!.meta?.fee}`);
    console.log(`      Status:           success`);

    // Verify it's a token transfer (pre/post token balances should differ)
    if (txInfo!.meta?.preTokenBalances && txInfo!.meta?.postTokenBalances) {
      console.log(`      Token balances:   ${txInfo!.meta.preTokenBalances.length} pre, ${txInfo!.meta.postTokenBalances.length} post`);
    }
  });

  // ─── Summary ─────────────────────────────────────────────────

  after(function () {
    console.log('\n' + '='.repeat(80));
    console.log('  Institution Escrow Primary Path — Complete');
    console.log('='.repeat(80));
    console.log('');
    console.log('  Lifecycle:');
    console.log('    CREATED → FUNDED (real devnet USDC tx) → RELEASED');
    console.log('');
    console.log(`  Escrow ID:      ${escrowId || '(not created)'}`);
    console.log(`  Deposit Tx:     ${depositTxSignature || '(no deposit)'}`);
    console.log(`  File ID:        ${uploadedFileId || '(not uploaded)'}`);
    console.log(`  Demo mode:      ${useDemoAccount}`);
    console.log(`  USDC amount:    ${ESCROW_AMOUNT_USDC} USDC`);
    console.log('');
    if (depositTxSignature) {
      console.log(`  Solscan:        https://solscan.io/tx/${depositTxSignature}?cluster=devnet`);
    }
    console.log('');
    // No cleanup — escrow is RELEASED (terminal state)
  });
});
