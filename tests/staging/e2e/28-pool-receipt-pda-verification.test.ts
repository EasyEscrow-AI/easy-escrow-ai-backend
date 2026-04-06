/**
 * Pool Receipt PDA Verification E2E Test (Staging)
 *
 * Tests that transaction pool settlement creates on-chain receipt PDAs with
 * AES-256-GCM encrypted payloads and SHA-256 commitment hashes, and that
 * receipts can be decrypted and verified via the API.
 *
 * Flow:
 *   1. Authenticate as demo client
 *   2. Create 2 escrows (SG-CH corridor) and fund them on devnet
 *   3. Create a transaction pool for SG-CH corridor
 *   4. Add both escrows to the pool
 *   5. Lock the pool (compliance check)
 *   6. Settle the pool (sequential settlement)
 *   7. Verify pool receipt PDAs exist on-chain
 *   8. Verify commitment hash is deterministic (SHA-256 of receipt plaintext)
 *   9. Decrypt receipt via API and verify contents match
 *  10. Verify encrypted payload is exactly 512 bytes (AES-256-GCM format)
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config \
 *     tests/staging/e2e/28-pool-receipt-pda-verification.test.ts --timeout 300000
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import axios, { AxiosInstance } from 'axios';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STAGING_API = process.env.STAGING_API_URL || 'https://staging-api.easyescrow.ai';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SETTLEMENT_KEY = process.env.SETTLEMENT_AUTHORITY_API_KEY || '';
const PROGRAM_ID = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei');
const POOL_RECEIPT_SEED = Buffer.from('pool_receipt');

// Demo accounts
const BUYER_EMAIL = 'demo-enterprise@bank.com';
const DEMO_PASSWORD = 'DemoPass123!';

// Small amounts for devnet testing
const ESCROW_AMOUNT = 1; // 1 USDC

const BUYER_PRIVATE_KEY = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY || '';
const RECIPIENT_ADDRESS = process.env.DEVNET_STAGING_RECEIVER_ADDRESS || '59Xet5qZ6b6NbpS9a2JD1maamfYKMYEwbvfbFPR92jHx';

describe('Pool Receipt PDA Verification E2E (Staging)', function () {
  this.timeout(300000);

  let api: AxiosInstance;
  let connection: Connection;
  let buyerKeypair: Keypair;
  let buyerToken: string;

  // Created resources
  const escrowIds: string[] = [];       // internal UUIDs
  const escrowCodes: string[] = [];     // EE-XXX-XXX codes
  let poolId: string;
  let poolCode: string;

  // ─── Setup ──────────────────────────────────────────────────────

  before(async function () {
    if (!BUYER_PRIVATE_KEY) {
      console.log('  DEVNET_STAGING_SENDER_PRIVATE_KEY not set — skipping pool E2E');
      this.skip();
    }

    const decode = (bs58 as any).default?.decode || bs58.decode;
    buyerKeypair = Keypair.fromSecretKey(decode(BUYER_PRIVATE_KEY));
    connection = new Connection(SOLANA_RPC, 'confirmed');

    api = axios.create({
      baseURL: STAGING_API,
      timeout: 30000,
      validateStatus: () => true,
    });

    console.log('\n  ═══════════════════════════════════════════════');
    console.log('  Pool Receipt PDA Verification E2E');
    console.log('  ═══════════════════════════════════════════════');
    console.log(`  API:    ${STAGING_API}`);
    console.log(`  RPC:    ${SOLANA_RPC}`);
    console.log(`  Buyer:  ${buyerKeypair.publicKey.toBase58()}`);

    // Authenticate
    const loginRes = await api.post('/api/v1/institution/auth/login', {
      email: BUYER_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (loginRes.status !== 200) {
      console.log(`  Login failed (${loginRes.status}): ${JSON.stringify(loginRes.data)}`);
      this.skip();
    }
    buyerToken = loginRes.data.data.tokens.accessToken;
    console.log(`  Auth:   logged in as ${BUYER_EMAIL}`);
  });

  after(async function () {
    // Cleanup: cancel any unfunded escrows
    for (const id of escrowIds) {
      try {
        await api.post(
          `/api/v1/institution-escrow/${id}/cancel`,
          { reason: 'E2E test cleanup' },
          { headers: { Authorization: `Bearer ${buyerToken}`, 'X-Settlement-Authority-Key': SETTLEMENT_KEY } }
        );
      } catch { /* ignore cleanup errors */ }
    }
  });

  // ─── Helper: create and fund an escrow ──────────────────────────

  async function createAndFundEscrow(label: string): Promise<{ internalId: string; escrowCode: string }> {
    console.log(`\n  [${label}] Creating escrow...`);

    // Create
    const createRes = await api.post(
      '/api/v1/institution-escrow',
      {
        amount: ESCROW_AMOUNT,
        corridor: 'SG-CH',
        conditionType: 'ADMIN_RELEASE',
        payerWallet: buyerKeypair.publicKey.toBase58(),
        recipientWallet: RECIPIENT_ADDRESS,
      },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    if (createRes.status !== 201) {
      throw new Error(`Create failed (${createRes.status}): ${JSON.stringify(createRes.data)}`);
    }

    const escrow = createRes.data.data.escrow || createRes.data.data;
    const internalId = escrow.internalId || escrow.id || escrow.escrowId;
    const escrowCode = escrow.escrowId || escrow.escrowCode || escrow.code;
    console.log(`    Created: ${escrowCode} (${internalId})`);

    // Get deposit tx from backend
    const depositTxRes = await api.get(
      `/api/v1/institution-escrow/${internalId}/deposit-tx`,
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    if (depositTxRes.status !== 200) {
      throw new Error(`deposit-tx failed (${depositTxRes.status}): ${JSON.stringify(depositTxRes.data)}`);
    }

    // Sign and submit deposit
    const txBytes = Buffer.from(depositTxRes.data.data.transaction, 'base64');
    const tx = Transaction.from(txBytes);
    tx.partialSign(buyerKeypair);
    const rawTx = tx.serialize();
    const depositSig = await connection.sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 3 });
    await connection.confirmTransaction(depositSig, 'confirmed');
    console.log(`    Deposit tx: ${depositSig.slice(0, 20)}...`);

    // Record deposit
    const depositRes = await api.post(
      `/api/v1/institution-escrow/${internalId}/deposit`,
      { txSignature: depositSig },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    if (depositRes.status !== 200) {
      if (depositRes.data?.message?.includes('COMPLIANCE_HOLD')) {
        throw new Error('COMPLIANCE_HOLD — cannot proceed');
      }
      throw new Error(`Deposit record failed (${depositRes.status}): ${JSON.stringify(depositRes.data)}`);
    }

    console.log(`    Status: ${depositRes.data.data.status}`);
    expect(depositRes.data.data.status).to.equal('FUNDED');

    return { internalId, escrowCode };
  }

  // ─── Tests ──────────────────────────────────────────────────────

  it('1. should create and fund 2 escrows for pool membership', async function () {
    console.log('\n  [1] Creating and funding 2 escrows...');

    try {
      const e1 = await createAndFundEscrow('Escrow 1');
      escrowIds.push(e1.internalId);
      escrowCodes.push(e1.escrowCode);

      const e2 = await createAndFundEscrow('Escrow 2');
      escrowIds.push(e2.internalId);
      escrowCodes.push(e2.escrowCode);
    } catch (err: any) {
      if (err.message.includes('COMPLIANCE_HOLD')) {
        console.log('    Escrow in COMPLIANCE_HOLD — skipping pool tests');
        return this.skip();
      }
      throw err;
    }

    expect(escrowIds).to.have.length(2);
    console.log(`    Escrows ready: ${escrowCodes.join(', ')}`);
  });

  it('2. should create a transaction pool', async function () {
    if (escrowIds.length < 2) return this.skip();

    console.log('\n  [2] Creating pool...');
    const res = await api.post(
      '/api/v1/institution/pools',
      { corridor: 'SG-CH', settlementMode: 'SEQUENTIAL', expiryHours: 24 },
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).to.equal(201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.data)}`);

    const pool = res.data.data;
    poolId = pool.id || pool.poolId;
    poolCode = pool.poolCode || pool.code;
    console.log(`    Pool: ${poolCode} (${poolId})`);
    console.log(`    Status: ${pool.status}`);
  });

  it('3. should add both escrows to the pool', async function () {
    if (!poolId) return this.skip();

    console.log('\n  [3] Adding escrows to pool...');
    for (const escrowId of escrowIds) {
      const res = await api.post(
        `/api/v1/institution/pools/${poolId}/add`,
        { escrowId },
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      expect(res.status).to.equal(200, `Add failed (${res.status}): ${JSON.stringify(res.data)}`);
      console.log(`    Added: ${escrowId.slice(0, 8)}...`);
    }
  });

  it('4. should lock the pool', async function () {
    if (!poolId) return this.skip();

    console.log('\n  [4] Locking pool...');
    const res = await api.post(
      `/api/v1/institution/pools/${poolId}/lock`,
      {},
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );

    expect(res.status).to.equal(200, `Lock failed (${res.status}): ${JSON.stringify(res.data)}`);
    console.log(`    Pool status: ${res.data.data?.status || 'LOCKED'}`);
  });

  it('5. should settle the pool', async function () {
    if (!poolId) return this.skip();

    console.log('\n  [5] Settling pool (sequential)...');
    const res = await api.post(
      `/api/v1/institution/pools/${poolId}/settle`,
      { notes: 'E2E pool receipt verification test' },
      { headers: { Authorization: `Bearer ${buyerToken}`, 'X-Settlement-Authority-Key': SETTLEMENT_KEY } }
    );

    if (res.status === 400 && res.data?.message?.includes('not LOCKED')) {
      console.log(`    Pool not in LOCKED state — may need compliance approval`);
      return this.skip();
    }

    expect(res.status).to.equal(200, `Settle failed (${res.status}): ${JSON.stringify(res.data)}`);

    const settled = res.data.data;
    console.log(`    Pool status: ${settled.status}`);
    console.log(`    Members settled: ${settled.settledCount || settled.members?.filter((m: any) => m.status === 'SETTLED').length || '?'}`);
  });

  it('6. should verify pool receipt PDAs exist on-chain', async function () {
    if (!poolId) return this.skip();

    console.log('\n  [6] Verifying receipt PDAs on-chain...');

    // Get pool details to find member escrow IDs
    const poolRes = await api.get(
      `/api/v1/institution/pools/${poolId}`,
      { headers: { Authorization: `Bearer ${buyerToken}` } }
    );
    expect(poolRes.status).to.equal(200);

    const pool = poolRes.data.data;
    const poolIdBytes = uuidToBytes(pool.poolId || pool.id);

    for (const escrowId of escrowIds) {
      const escrowIdBytes = uuidToBytes(escrowId);
      const [receiptPda] = PublicKey.findProgramAddressSync(
        [POOL_RECEIPT_SEED, poolIdBytes, escrowIdBytes],
        PROGRAM_ID
      );

      const accountInfo = await connection.getAccountInfo(receiptPda);
      console.log(`    Receipt PDA ${receiptPda.toBase58().slice(0, 12)}... — ${accountInfo ? 'EXISTS' : 'NOT FOUND'}`);
      expect(accountInfo).to.not.be.null;

      if (accountInfo) {
        // Anchor discriminator (8) + pool_id (32) + escrow_id (32) + receipt_id (16)
        // + timestamp (8) + status (1) + commitment_hash (32) + encrypted_payload (512) + bump (1) = 642
        console.log(`    Data length: ${accountInfo.data.length} bytes (expected 642)`);
        console.log(`    Owner: ${accountInfo.owner.toBase58()}`);
        expect(accountInfo.owner.toBase58()).to.equal(PROGRAM_ID.toBase58());

        // Extract encrypted payload (offset: 8 + 32 + 32 + 16 + 8 + 1 + 32 = 129)
        const encryptedPayload = accountInfo.data.slice(129, 129 + 512);
        console.log(`    Encrypted payload: ${encryptedPayload.length} bytes`);
        expect(encryptedPayload.length).to.equal(512);

        // Verify payload structure: IV (12) + Tag (16) + Length (2) + Ciphertext
        const iv = encryptedPayload.slice(0, 12);
        const tag = encryptedPayload.slice(12, 28);
        const ciphertextLen = encryptedPayload.readUInt16BE(28);
        console.log(`    IV: ${iv.toString('hex').slice(0, 16)}...`);
        console.log(`    Auth tag: ${tag.toString('hex').slice(0, 16)}...`);
        console.log(`    Ciphertext length: ${ciphertextLen} bytes`);
        expect(ciphertextLen).to.be.greaterThan(0);
        expect(ciphertextLen).to.be.lessThanOrEqual(482);

        // Extract commitment hash (offset: 8 + 32 + 32 + 16 + 8 + 1 = 97)
        const commitmentHash = accountInfo.data.slice(97, 129);
        console.log(`    Commitment hash: ${commitmentHash.toString('hex').slice(0, 32)}...`);
        expect(commitmentHash.length).to.equal(32);
        // Hash should not be all zeros
        expect(commitmentHash.some((b: number) => b !== 0)).to.be.true;
      }
    }
  });

  it('7. should decrypt receipt via API and verify contents', async function () {
    if (!poolId) return this.skip();

    console.log('\n  [7] Decrypting receipts via API...');

    for (let i = 0; i < escrowIds.length; i++) {
      const escrowId = escrowIds[i];
      const res = await api.get(
        `/api/v1/institution/pools/${poolId}/receipt/${escrowId}`,
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );

      expect(res.status).to.equal(200, `Decrypt failed (${res.status}): ${JSON.stringify(res.data)}`);

      const receipt = res.data.data;
      console.log(`\n    Receipt for ${escrowCodes[i]}:`);
      console.log(`      Pool:       ${receipt.poolCode}`);
      console.log(`      Escrow:     ${receipt.escrowCode}`);
      console.log(`      Amount:     ${receipt.amount} USDC`);
      console.log(`      Corridor:   ${receipt.corridor}`);
      console.log(`      Payer:      ${receipt.payerWallet?.slice(0, 12)}...`);
      console.log(`      Recipient:  ${receipt.recipientWallet?.slice(0, 12)}...`);
      console.log(`      Release tx: ${receipt.releaseTxSignature?.slice(0, 20)}...`);
      console.log(`      Settled at: ${receipt.settledAt}`);

      // Verify receipt fields are populated
      expect(receipt.poolCode).to.be.a('string').and.match(/^TP-/);
      expect(receipt.escrowCode).to.be.a('string').and.match(/^EE-/);
      expect(receipt.amount).to.be.a('string');
      expect(parseFloat(receipt.amount)).to.be.greaterThan(0);
      expect(receipt.corridor).to.equal('SG-CH');
      expect(receipt.payerWallet).to.be.a('string');
      expect(receipt.recipientWallet).to.be.a('string');
      expect(receipt.releaseTxSignature).to.be.a('string');
      expect(receipt.settledAt).to.be.a('string');
    }
  });

  it('8. should verify commitment hash matches re-computed hash from decrypted receipt', async function () {
    if (!poolId) return this.skip();

    console.log('\n  [8] Verifying commitment hashes...');

    for (let i = 0; i < escrowIds.length; i++) {
      const escrowId = escrowIds[i];

      // Decrypt receipt via API
      const receiptRes = await api.get(
        `/api/v1/institution/pools/${poolId}/receipt/${escrowId}`,
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      expect(receiptRes.status).to.equal(200);
      const receipt = receiptRes.data.data;

      // Re-compute commitment hash: SHA-256(JSON.stringify(receipt))
      const recomputed = crypto
        .createHash('sha256')
        .update(JSON.stringify(receipt))
        .digest();

      // Read on-chain commitment hash
      const poolIdBytes = uuidToBytes(poolId);
      const escrowIdBytes = uuidToBytes(escrowId);
      const [receiptPda] = PublicKey.findProgramAddressSync(
        [POOL_RECEIPT_SEED, poolIdBytes, escrowIdBytes],
        PROGRAM_ID
      );
      const accountInfo = await connection.getAccountInfo(receiptPda);
      expect(accountInfo).to.not.be.null;

      const onChainHash = accountInfo!.data.slice(97, 129);

      const match = recomputed.equals(onChainHash);
      console.log(`    ${escrowCodes[i]}:`);
      console.log(`      On-chain:    ${onChainHash.toString('hex').slice(0, 32)}...`);
      console.log(`      Re-computed: ${recomputed.toString('hex').slice(0, 32)}...`);
      console.log(`      Match: ${match ? 'YES ✓' : 'NO ✗'}`);
      expect(match).to.be.true;
    }
  });

  it('9. should verify release transactions exist on Solana devnet', async function () {
    if (!poolId) return this.skip();

    console.log('\n  [9] Verifying release txs on-chain...');

    for (let i = 0; i < escrowIds.length; i++) {
      const receiptRes = await api.get(
        `/api/v1/institution/pools/${poolId}/receipt/${escrowIds[i]}`,
        { headers: { Authorization: `Bearer ${buyerToken}` } }
      );
      const receipt = receiptRes.data.data;
      const sig = receipt.releaseTxSignature;

      if (sig) {
        const txInfo = await connection.getTransaction(sig, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });

        console.log(`    ${escrowCodes[i]}: ${sig.slice(0, 20)}... — ${txInfo ? 'CONFIRMED' : 'NOT FOUND'}`);
        expect(txInfo).to.not.be.null;
        expect(txInfo!.meta?.err).to.be.null;
      }
    }
  });
});

// ─── Helpers ──────────────────────────────────────────────────────

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  const buf = Buffer.from(hex, 'hex');
  const padded = Buffer.alloc(32);
  buf.copy(padded);
  return padded;
}
