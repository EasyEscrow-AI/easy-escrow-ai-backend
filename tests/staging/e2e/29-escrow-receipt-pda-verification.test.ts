/**
 * Escrow Receipt PDA Verification E2E Test (Staging)
 *
 * Tests that every escrow release creates an on-chain encrypted receipt PDA
 * (when PRIVACY_ENABLED + TRANSACTION_POOLS_ENABLED) with AES-256-GCM encrypted
 * payload and SHA-256 commitment hash — even for non-pooled escrows.
 *
 * Flow:
 *   1. Create and fund a single escrow (not in a pool)
 *   2. Release the escrow
 *   3. Verify the escrow receipt PDA exists on-chain (610 bytes)
 *   4. Verify encrypted payload structure (IV + auth tag + ciphertext)
 *   5. Verify privacy analysis returns receiptAttributes with encrypted fields
 *   6. Verify commitment hash is publicly verifiable
 *   7. Verify the receipt PDA is owned by the escrow program
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config \
 *     tests/staging/e2e/29-escrow-receipt-pda-verification.test.ts --timeout 120000
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import axios, { AxiosInstance } from 'axios';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STAGING_API = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SETTLEMENT_KEY = process.env.SETTLEMENT_AUTHORITY_API_KEY || '';
const PROGRAM_ID = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei');
const ESCROW_RECEIPT_SEED = Buffer.from('escrow_receipt');
const BUYER_PRIVATE_KEY = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY || '';
const RECIPIENT_ADDRESS = process.env.DEVNET_STAGING_RECEIVER_ADDRESS || '59Xet5qZ6b6NbpS9a2JD1maamfYKMYEwbvfbFPR92jHx';

function uuidToBytes(uuid: string): Buffer {
  const buf = Buffer.alloc(32);
  Buffer.from(uuid.replace(/-/g, ''), 'hex').copy(buf);
  return buf;
}

describe('Escrow Receipt PDA Verification E2E (Staging)', function () {
  this.timeout(120000);

  let api: AxiosInstance;
  let connection: Connection;
  let buyerKeypair: Keypair;
  let buyerToken: string;

  let internalId: string;
  let escrowCode: string;

  before(async function () {
    if (!BUYER_PRIVATE_KEY) {
      console.log('  DEVNET_STAGING_SENDER_PRIVATE_KEY not set — skipping');
      this.skip();
    }

    const decode = (bs58 as any).default?.decode || bs58.decode;
    buyerKeypair = Keypair.fromSecretKey(decode(BUYER_PRIVATE_KEY));
    connection = new Connection(SOLANA_RPC, 'confirmed');
    api = axios.create({ baseURL: STAGING_API, timeout: 30000, validateStatus: () => true });

    console.log('\n  ═══════════════════════════════════════════════');
    console.log('  Escrow Receipt PDA Verification E2E');
    console.log('  ═══════════════════════════════════════════════');
    console.log(`  API:    ${STAGING_API}`);
    console.log(`  Buyer:  ${buyerKeypair.publicKey.toBase58()}`);

    const login = await api.post('/api/v1/institution/auth/login', { email: 'demo-enterprise@bank.com', password: 'DemoPass123!' });
    if (login.status !== 200) return this.skip();
    buyerToken = login.data.data.tokens.accessToken;
    console.log('  Auth:   logged in');
  });

  after(async function () {
    // No cleanup needed — escrow is already COMPLETE
  });

  it('1. should create, fund, and release an escrow', async function () {
    console.log('\n  [1] Creating and funding escrow...');

    // Create
    const create = await api.post('/api/v1/institution-escrow', {
      amount: 1, corridor: 'SG-CH', conditionType: 'ADMIN_RELEASE',
      payerWallet: buyerKeypair.publicKey.toBase58(), recipientWallet: RECIPIENT_ADDRESS,
    }, { headers: { Authorization: `Bearer ${buyerToken}` } });
    expect(create.status).to.equal(201);

    const escrow = create.data.data.escrow;
    internalId = escrow.internalId;
    escrowCode = escrow.escrowId;
    console.log(`    Created: ${escrowCode}`);

    // Fund
    const depTx = await api.get(`/api/v1/institution-escrow/${internalId}/deposit-tx`, { headers: { Authorization: `Bearer ${buyerToken}` } });
    expect(depTx.status).to.equal(200);

    const tx = Transaction.from(Buffer.from(depTx.data.data.transaction, 'base64'));
    tx.partialSign(buyerKeypair);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await connection.confirmTransaction(sig, 'confirmed');

    const txResult = await connection.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    expect(txResult?.meta?.err).to.be.null;

    const deposit = await api.post(`/api/v1/institution-escrow/${internalId}/deposit`, { txSignature: sig }, { headers: { Authorization: `Bearer ${buyerToken}` } });
    expect(deposit.status).to.equal(200);
    console.log('    Funded');

    // Release
    const release = await api.post(`/api/v1/institution-escrow/${internalId}/release`, { notes: 'Receipt PDA E2E test' }, {
      headers: { Authorization: `Bearer ${buyerToken}`, 'X-Settlement-Authority-Key': SETTLEMENT_KEY },
    });
    expect(release.status).to.equal(200, `Release failed: ${JSON.stringify(release.data)}`);
    expect(release.data.data.status).to.be.oneOf(['RELEASED', 'COMPLETE']);
    console.log(`    Released: ${release.data.data.status}`);
  });

  it('2. should have created an escrow receipt PDA on-chain', async function () {
    if (!internalId) return this.skip();

    console.log('\n  [2] Checking escrow receipt PDA...');
    const escrowIdBytes = uuidToBytes(internalId);
    const [receiptPda] = PublicKey.findProgramAddressSync(
      [ESCROW_RECEIPT_SEED, escrowIdBytes], PROGRAM_ID
    );

    const account = await connection.getAccountInfo(receiptPda);
    expect(account).to.not.be.null;
    console.log(`    PDA: ${receiptPda.toBase58()}`);
    console.log(`    Size: ${account!.data.length} bytes (expected 610)`);
    expect(account!.data.length).to.equal(610);
    expect(account!.owner.toBase58()).to.equal(PROGRAM_ID.toBase58());
    console.log(`    Owner: ${account!.owner.toBase58()} ✓`);
  });

  it('3. should have valid AES-256-GCM encrypted payload structure', async function () {
    if (!internalId) return this.skip();

    console.log('\n  [3] Verifying encrypted payload...');
    const escrowIdBytes = uuidToBytes(internalId);
    const [receiptPda] = PublicKey.findProgramAddressSync(
      [ESCROW_RECEIPT_SEED, escrowIdBytes], PROGRAM_ID
    );
    const account = await connection.getAccountInfo(receiptPda);
    expect(account).to.not.be.null;

    const d = account!.data;
    // Layout: disc(8) + escrow_id(32) + receipt_id(16) + timestamp(8) + status(1) + commitment_hash(32) + encrypted_payload(512) + bump(1)
    const encPayload = d.slice(97, 609);
    expect(encPayload.length).to.equal(512);

    const iv = encPayload.slice(0, 12);
    const authTag = encPayload.slice(12, 28);
    const ciphertextLen = encPayload.readUInt16BE(28);
    const ciphertext = encPayload.slice(30, 30 + ciphertextLen);

    console.log(`    IV: ${iv.toString('hex')} (12 bytes)`);
    console.log(`    Auth tag: ${authTag.toString('hex').slice(0, 16)}... (16 bytes)`);
    console.log(`    Ciphertext: ${ciphertextLen} bytes`);

    expect(iv.length).to.equal(12);
    expect(authTag.length).to.equal(16);
    expect(ciphertextLen).to.be.greaterThan(100); // JSON receipt is at least 100 bytes
    expect(ciphertextLen).to.be.lessThanOrEqual(482);

    // IV should not be all zeros (random)
    expect(iv.some((b: number) => b !== 0)).to.be.true;
    // Auth tag should not be all zeros
    expect(authTag.some((b: number) => b !== 0)).to.be.true;
  });

  it('4. should have a non-zero SHA-256 commitment hash', async function () {
    if (!internalId) return this.skip();

    console.log('\n  [4] Verifying commitment hash...');
    const escrowIdBytes = uuidToBytes(internalId);
    const [receiptPda] = PublicKey.findProgramAddressSync(
      [ESCROW_RECEIPT_SEED, escrowIdBytes], PROGRAM_ID
    );
    const account = await connection.getAccountInfo(receiptPda);
    expect(account).to.not.be.null;

    const commitmentHash = account!.data.slice(65, 97);
    expect(commitmentHash.length).to.equal(32);
    expect(commitmentHash.some((b: number) => b !== 0)).to.be.true;
    console.log(`    Hash: ${commitmentHash.toString('hex')}`);
    console.log('    Non-zero: ✓ (32 bytes, publicly verifiable)');
  });

  it('5. should show receiptAttributes with encrypted fields in privacy analysis', async function () {
    if (!escrowCode) return this.skip();

    console.log('\n  [5] Checking privacy analysis...');
    const res = await api.get(`/api/v1/institution-escrow/${escrowCode}/privacy-analysis`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    expect(res.status).to.equal(200);

    const pda = res.data.data.checks.pdaReceipts;
    expect(pda.escrowReceiptPda).to.be.a('string');
    expect(pda.escrowReceiptExists).to.be.true;
    console.log(`    escrowReceiptPda: ${pda.escrowReceiptPda}`);
    console.log(`    escrowReceiptExists: ${pda.escrowReceiptExists}`);

    // Verify receiptAttributes exist with encrypted fields
    expect(pda.receiptAttributes).to.be.an('array');
    expect(pda.receiptAttributes.length).to.be.greaterThan(0);

    const encrypted = pda.receiptAttributes.filter((a: any) => a.encrypted);
    const plaintext = pda.receiptAttributes.filter((a: any) => !a.encrypted);

    console.log(`    Encrypted fields (${encrypted.length}): ${encrypted.map((a: any) => a.field).join(', ')}`);
    console.log(`    Plaintext fields (${plaintext.length}): ${plaintext.map((a: any) => a.field).join(', ')}`);

    // Core fields must be encrypted
    const encryptedNames = encrypted.map((a: any) => a.field);
    expect(encryptedNames).to.include('escrowId');
    expect(encryptedNames).to.include('amount');
    expect(encryptedNames).to.include('payerWallet');
    expect(encryptedNames).to.include('recipientWallet');
    expect(encryptedNames).to.include('corridor');
    expect(encryptedNames).to.include('releaseTxSignature');

    // Commitment hash must be plaintext (publicly verifiable)
    const plaintextNames = plaintext.map((a: any) => a.field);
    expect(plaintextNames).to.include('commitmentHash');
  });

  it('6. should show correct overall privacy score', async function () {
    if (!escrowCode) return this.skip();

    console.log('\n  [6] Checking overall score...');
    const res = await api.get(`/api/v1/institution-escrow/${escrowCode}/privacy-analysis`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    expect(res.status).to.equal(200);

    const { overallScore, maxScore, checks } = res.data.data;
    console.log(`    Score: ${overallScore} / ${maxScore}`);
    console.log(`    Stealth: ${checks.stealthAddress.passed ? 'PASS' : 'FAIL'}`);
    console.log(`    PDA Receipts: ${checks.pdaReceipts.passed ? 'PASS' : 'FAIL'}`);
    console.log(`    Custody: ${checks.encryptedCustody.passed ? 'PASS' : 'FAIL'}`);
    console.log(`    Compliance: ${checks.complianceAuditTrail.passed ? 'PASS' : 'FAIL'}`);
    console.log(`    Pool: ${checks.transactionPoolShielding.passed ? 'PASS' : 'FAIL'}`);

    // PDA receipts should pass (receipt PDA exists with encrypted data)
    expect(checks.pdaReceipts.passed).to.be.true;
    // Encrypted custody should pass (3 tx sigs verified)
    expect(checks.encryptedCustody.passed).to.be.true;
    // Compliance should pass (audit trail complete)
    expect(checks.complianceAuditTrail.passed).to.be.true;
    // At least 3/5 checks should pass
    expect(overallScore).to.be.greaterThanOrEqual(3);
  });
});
