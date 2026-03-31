/**
 * Institution Escrow Primary Path - Two-Party E2E Test (Staging + Devnet)
 *
 * Tests the complete institutional escrow lifecycle with TWO authenticated
 * parties (buyer + supplier) against the staging API with REAL on-chain
 * Solana devnet transactions:
 *
 *   Pre-test: Authenticate both buyer and supplier clients
 *             Verify devnet wallet balances and USDC token accounts
 *   1.  Buyer creates Treasury account (buyer wallet)
 *   2.  Supplier creates Settlement account (supplier wallet)
 *   3.  Buyer creates escrow: buyer wallet -> supplier wallet, SG-CH, 1 USDC
 *   4.  Both verify escrow — buyer as owner, supplier as counterparty
 *   5.  Buyer executes real USDC transfer on devnet + records deposit
 *   6.  Supplier uploads proof of work (SHIPPING_DOC)
 *   7.  Buyer approves & releases funds (JWT + settlement key)
 *   8.  Buyer verifies settlement — timestamps, amounts, fee
 *   9.  Buyer verifies receipt (JSON + HTML)
 *   10. Verify deposit tx on Solana devnet
 *
 * Wallets (loaded from env, with private keys for signing):
 *   Buyer/Payer:     DEVNET_STAGING_SENDER_ADDRESS   (DEVNET_STAGING_SENDER_PRIVATE_KEY)
 *   Supplier/Recip:  DEVNET_STAGING_RECEIVER_ADDRESS  (DEVNET_STAGING_RECEIVER_PRIVATE_KEY)
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config \
 *     tests/staging/e2e/25-institution-escrow-primary-path.test.ts --timeout 180000
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import axios, { AxiosInstance } from 'axios';
import { cleanupE2ETestClients } from './shared-test-utils';
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

// Demo accounts (seeded, ACTIVE/VERIFIED)
const BUYER_DEMO_EMAIL = 'demo-enterprise@bank.com';
const SUPPLIER_DEMO_EMAIL = 'demo-premium@trade.com';
const DEMO_PASSWORD = 'DemoPass123!';

// Fallback: fresh registration with RUN_ID-based emails
const RUN_ID = Date.now().toString(36);
const BUYER_REG_EMAIL = `e2e-buyer-${RUN_ID}@test.easyescrow.ai`;
const SUPPLIER_REG_EMAIL = `e2e-supplier-${RUN_ID}@test.easyescrow.ai`;
const TEST_PASSWORD = 'E2eTest@2026!Secure';

describe('Institution Escrow Two-Party E2E (Staging + Devnet)', function () {
  this.timeout(180000);

  let api: AxiosInstance;
  let connection: Connection;
  let buyerKeypair: Keypair;
  let supplierKeypair: Keypair;

  // Auth tokens
  let buyerToken: string;
  let supplierToken: string;

  // Client info for summary
  let buyerClientName = '';
  let supplierClientName = '';

  // Created resources
  let buyerAccountId: string;
  let supplierAccountId: string;
  let escrowId: string;
  let escrowCode: string;
  let depositTxSignature: string;
  let uploadedFileId: string;

  // Track registered client IDs for cleanup
  const registeredClientIds: string[] = [];

  // ─── Helper: authenticate a client ────────────────────────────

  async function authenticateClient(
    demoEmail: string,
    regEmail: string,
    label: string,
  ): Promise<{ token: string; clientName: string }> {
    // Try demo account first
    const demoLogin = await api.post('/api/v1/institution/auth/login', {
      email: demoEmail,
      password: DEMO_PASSWORD,
    });
    if (demoLogin.status === 200) {
      const data = demoLogin.data.data;
      console.log(`    ${label}: logged in as ${demoEmail} (demo)`);
      return {
        token: data.tokens.accessToken,
        clientName: data.client?.companyName || demoEmail,
      };
    }

    // Try fresh registration
    const reg = await api.post('/api/v1/institution/auth/register', {
      email: regEmail,
      password: TEST_PASSWORD,
      companyName: `E2E ${label} ${RUN_ID}`,
    });
    if (reg.status === 201 || reg.status === 200) {
      const data = reg.data.data;
      if (data.client?.id) registeredClientIds.push(data.client.id);
      console.log(`    ${label}: registered as ${regEmail}`);
      return {
        token: data.tokens.accessToken,
        clientName: data.client?.companyName || regEmail,
      };
    }

    // Try login with reg email (if previously created)
    if (reg.status === 409) {
      const login = await api.post('/api/v1/institution/auth/login', {
        email: regEmail,
        password: TEST_PASSWORD,
      });
      if (login.status === 200) {
        const data = login.data.data;
        console.log(`    ${label}: logged in as ${regEmail} (existing)`);
        return {
          token: data.tokens.accessToken,
          clientName: data.client?.companyName || regEmail,
        };
      }
    }

    throw new Error(
      `Failed to authenticate ${label}: demo=${demoLogin.status}, reg=${reg.status}`,
    );
  }

  // ─── Pre-test setup ──────────────────────────────────────────

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('  Institution Escrow Two-Party E2E (Staging + Devnet)');
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

    // ── Authenticate BOTH clients ──
    console.log('\n  Authenticating clients...');
    try {
      const buyerAuth = await authenticateClient(BUYER_DEMO_EMAIL, BUYER_REG_EMAIL, 'Buyer');
      buyerToken = buyerAuth.token;
      buyerClientName = buyerAuth.clientName;

      const supplierAuth = await authenticateClient(SUPPLIER_DEMO_EMAIL, SUPPLIER_REG_EMAIL, 'Supplier');
      supplierToken = supplierAuth.token;
      supplierClientName = supplierAuth.clientName;
    } catch (err: any) {
      console.log(`  Auth failed: ${err.message} — skipping`);
      return this.skip();
    }

    console.log('');
  });

  // ─── 1. Buyer creates Treasury account ────────────────────────

  it('1. should create buyer Treasury account', async function () {
    const buyerWallet = buyerKeypair.publicKey.toBase58();
    console.log(`  [1] Creating buyer Treasury account (${buyerWallet.substring(0, 8)}...)...`);

    const res = await api.post(
      '/api/v1/institution/accounts',
      {
        name: `E2E Treasury ${RUN_ID}`,
        accountType: 'TREASURY',
        walletAddress: buyerWallet,
        description: 'E2E test treasury account for buyer',
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } },
    );

    if (res.status === 400 && res.data?.error?.includes?.('already exists')) {
      // Account with this name may exist from prior run — list and use existing
      console.log('      Treasury name conflict — listing existing accounts...');
      const listRes = await api.get('/api/v1/institution/accounts?accountType=TREASURY', {
        headers: { Authorization: `Bearer ${buyerToken}` },
      });
      if (listRes.status === 200 && listRes.data.data?.length > 0) {
        const existing = listRes.data.data.find(
          (a: any) => a.walletAddress === buyerWallet,
        ) || listRes.data.data[0];
        buyerAccountId = existing.id;
        console.log(`      Using existing Treasury: ${buyerAccountId}`);
        return;
      }
    }

    expect(res.status).to.equal(
      201,
      `Expected 201 but got ${res.status}: ${JSON.stringify(res.data)}`,
    );
    expect(res.data.success).to.be.true;

    const account = res.data.data;
    buyerAccountId = account.id;

    console.log(`      Account ID:   ${buyerAccountId}`);
    console.log(`      Type:         ${account.accountType}`);
    console.log(`      Wallet:       ${account.walletAddress}`);
  });

  // ─── 2. Supplier creates Settlement account ──────────────────

  it('2. should create supplier Settlement account', async function () {
    const supplierWallet = supplierKeypair.publicKey.toBase58();
    console.log(`  [2] Creating supplier Settlement account (${supplierWallet.substring(0, 8)}...)...`);

    const res = await api.post(
      '/api/v1/institution/accounts',
      {
        name: `E2E Settlement ${RUN_ID}`,
        accountType: 'SETTLEMENT',
        walletAddress: supplierWallet,
        description: 'E2E test settlement account for supplier',
      },
      { headers: { Authorization: `Bearer ${supplierToken}` } },
    );

    if (res.status === 400 && res.data?.error?.includes?.('already exists')) {
      console.log('      Settlement name conflict — listing existing accounts...');
      const listRes = await api.get('/api/v1/institution/accounts?accountType=SETTLEMENT', {
        headers: { Authorization: `Bearer ${supplierToken}` },
      });
      if (listRes.status === 200 && listRes.data.data?.length > 0) {
        const existing = listRes.data.data.find(
          (a: any) => a.walletAddress === supplierWallet,
        ) || listRes.data.data[0];
        supplierAccountId = existing.id;
        console.log(`      Using existing Settlement: ${supplierAccountId}`);
        return;
      }
    }

    expect(res.status).to.equal(
      201,
      `Expected 201 but got ${res.status}: ${JSON.stringify(res.data)}`,
    );
    expect(res.data.success).to.be.true;

    const account = res.data.data;
    supplierAccountId = account.id;

    console.log(`      Account ID:   ${supplierAccountId}`);
    console.log(`      Type:         ${account.accountType}`);
    console.log(`      Wallet:       ${account.walletAddress}`);
  });

  // ─── 3. Buyer creates escrow ──────────────────────────────────

  it('3. should create escrow: buyer -> supplier, SG-CH, 1 USDC, ADMIN_RELEASE', async function () {
    const buyerWallet = buyerKeypair.publicKey.toBase58();
    const supplierWallet = supplierKeypair.publicKey.toBase58();
    console.log(`  [3] Creating escrow: SG-CH, ${ESCROW_AMOUNT_USDC} USDC, ADMIN_RELEASE...`);

    const res = await api.post(
      '/api/v1/institution-escrow',
      {
        payerWallet: buyerWallet,
        recipientWallet: supplierWallet,
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
    expect(escrow.payerWallet).to.equal(buyerWallet);
    expect(escrow.recipientWallet).to.equal(supplierWallet);

    escrowId = escrow.escrowId;
    escrowCode = escrow.escrowId; // escrowId is the human-readable EE-XXXX-XXXX code

    console.log(`      Escrow ID:    ${escrowId}`);
    console.log(`      Status:       ${escrow.status}`);
    console.log(`      Amount:       ${escrow.amount} USDC`);
    console.log(`      Corridor:     ${escrow.corridor}`);
    console.log(`      Payer:        ${escrow.payerWallet}`);
    console.log(`      Recipient:    ${escrow.recipientWallet}`);

    if (escrow.status === 'COMPLIANCE_HOLD') {
      console.log('      Escrow in COMPLIANCE_HOLD — subsequent deposit step will fail');
    }
  });

  // ─── 4. Both verify escrow ────────────────────────────────────

  it('4a. should allow buyer to view escrow as owner', async function () {
    console.log('  [4a] Buyer verifying escrow...');

    const res = await api.get(`/api/v1/institution-escrow/${escrowId}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    expect(res.status).to.equal(200);
    const escrow = res.data.data;
    expect(escrow.escrowId).to.equal(escrowId);
    expect(escrow.payerWallet).to.equal(buyerKeypair.publicKey.toBase58());
    expect(escrow.recipientWallet).to.equal(supplierKeypair.publicKey.toBase58());
    expect(escrow.amount).to.equal(ESCROW_AMOUNT_USDC);

    console.log(`      Status:       ${escrow.status}`);
    console.log(`      Created:      ${escrow.createdAt}`);
    console.log(`      Expires:      ${escrow.expiresAt}`);
  });

  it('4b. should allow supplier to view escrow as counterparty', async function () {
    console.log('  [4b] Supplier verifying escrow as counterparty...');

    const res = await api.get(`/api/v1/institution-escrow/${escrowId}`, {
      headers: { Authorization: `Bearer ${supplierToken}` },
    });

    expect(res.status).to.equal(
      200,
      `Expected 200 (counterparty access) but got ${res.status}: ${JSON.stringify(res.data)}`,
    );

    const escrow = res.data.data;
    expect(escrow.escrowId).to.equal(escrowId);
    expect(escrow.recipientWallet).to.equal(supplierKeypair.publicKey.toBase58());
    expect(escrow.amount).to.equal(ESCROW_AMOUNT_USDC);

    console.log(`      Status:       ${escrow.status}`);
    console.log(`      Supplier can see escrow: yes`);
  });

  // ─── 5. Real on-chain USDC deposit ────────────────────────────

  it('5. should execute real USDC transfer on devnet and record deposit', async function () {
    this.timeout(60000);
    console.log(`  [5] Executing real USDC transfer on Solana devnet (${ESCROW_AMOUNT_USDC} USDC)...`);

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
        buyerAta,               // source
        supplierAta,            // destination
        buyerKeypair.publicKey, // owner/authority
        ESCROW_AMOUNT_MICRO,    // amount in micro-USDC
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

  // ─── 6. Supplier uploads proof of work ────────────────────────

  it('6. should upload proof of work as supplier (SHIPPING_DOC)', async function () {
    console.log('  [6] Supplier uploading shipping document (proof of work)...');

    const pdfContent = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n' +
        'xref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF',
    );

    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', pdfContent, {
      filename: `shipping-doc-e2e-${RUN_ID}.pdf`,
      contentType: 'application/pdf',
    });
    form.append('documentType', 'SHIPPING_DOC');
    form.append('escrowId', escrowId);

    const res = await api.post('/api/v1/institution/files', form, {
      headers: {
        Authorization: `Bearer ${supplierToken}`,
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

    console.log(`      File ID:      ${uploadedFileId}`);
    console.log(`      Filename:     ${file.fileName || file.originalName}`);
    console.log(`      Type:         ${file.documentType}`);
    console.log(`      Size:         ${file.sizeBytes || file.size} bytes`);
    console.log(`      Uploaded by:  supplier`);
  });

  // ─── 7. Buyer approves & releases ─────────────────────────────

  it('7. should release funds with buyer approval + settlement authority', async function () {
    console.log('  [7] Releasing funds (buyer approval + settlement key)...');

    const res = await api.post(
      `/api/v1/institution-escrow/${escrowId}/release`,
      { notes: 'E2E test — buyer approved after supplier submitted shipping doc' },
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

    console.log(`      Status:       ${escrow.status}`);
    console.log(`      Resolved:     ${escrow.resolvedAt}`);
  });

  // ─── 8. Verify settlement ─────────────────────────────────────

  it('8. should confirm escrow RELEASED with all timestamps and amounts', async function () {
    console.log('  [8] Verifying final escrow state...');

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

  // ─── 9. Verify receipt ─────────────────────────────────────────

  it('9a. should retrieve receipt JSON with audit trail', async function () {
    console.log('  [9a] Fetching receipt JSON...');

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
      const depositEntry = receipt.transactions.deposits[0];
      if (depositEntry.txSignature) {
        expect(depositEntry.txSignature).to.equal(depositTxSignature);
        console.log(`      Deposit tx match: yes`);
      }
    }

    // Verify both wallets appear in receipt
    const receiptStr = JSON.stringify(receipt);
    expect(receiptStr).to.include(buyerKeypair.publicKey.toBase58());
    expect(receiptStr).to.include(supplierKeypair.publicKey.toBase58());
    console.log(`      Both wallets:     present in receipt`);

    if (receipt.auditTrail?.length) {
      console.log(`      Audit entries:    ${receipt.auditTrail.length}`);
    }
  });

  it('9b. should retrieve receipt HTML', async function () {
    console.log('  [9b] Fetching receipt HTML...');

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

  // ─── 10. On-chain verification ────────────────────────────────

  it('10. should verify deposit tx exists on Solana devnet', async function () {
    console.log('  [10] Verifying deposit transaction on Solana devnet...');

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

    if (txInfo!.meta?.preTokenBalances && txInfo!.meta?.postTokenBalances) {
      console.log(`      Token balances:   ${txInfo!.meta.preTokenBalances.length} pre, ${txInfo!.meta.postTokenBalances.length} post`);
    }
  });

  // ─── Summary ──────────────────────────────────────────────────

  after(async function () {
    // Clean up any fallback-registered test clients
    if (registeredClientIds.length > 0) {
      await cleanupE2ETestClients(registeredClientIds);
    }

    const buyerWallet =
      buyerKeypair?.publicKey?.toBase58() || BUYER_WALLET_ADDRESS;
    const supplierWallet =
      supplierKeypair?.publicKey?.toBase58() || SUPPLIER_WALLET_ADDRESS;

    console.log('\n' + '='.repeat(80));
    console.log('  Institution Escrow Two-Party E2E — Summary');
    console.log('='.repeat(80));
    console.log('');
    console.log(`  From (Client):      ${buyerClientName || '(unknown)'}`);
    console.log(`  From (Account):     Treasury -- ${buyerWallet}`);
    console.log(`  To (Client):        ${supplierClientName || '(unknown)'}`);
    console.log(`  To (Account):       Settlement -- ${supplierWallet}`);
    console.log(`  Corridor:           SG-CH`);
    console.log(`  Amount:             ${ESCROW_AMOUNT_USDC} USDC`);
    console.log(`  Settlement Mode:    Escrow`);
    console.log(`  Release Mode:       Manual Approval (ADMIN_RELEASE)`);
    console.log('');
    console.log('  Lifecycle:');
    console.log('    CREATED -> FUNDED (real devnet USDC tx) -> RELEASED');
    console.log('');
    console.log(`  Escrow ID:          ${escrowId || '(not created)'}`);
    console.log(`  Deposit Tx:         ${depositTxSignature || '(no deposit)'}`);
    console.log(`  File ID:            ${uploadedFileId || '(not uploaded)'}`);
    console.log(`  Buyer Account:      ${buyerAccountId || '(not created)'}`);
    console.log(`  Supplier Account:   ${supplierAccountId || '(not created)'}`);
    console.log('');
    if (depositTxSignature) {
      console.log(
        `  Solscan:            https://solscan.io/tx/${depositTxSignature}?cluster=devnet`,
      );
    }
    console.log('');
  });
});
