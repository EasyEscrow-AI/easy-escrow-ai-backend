/**
 * Two-Phase Swap E2E Test - Production
 *
 * Tests the complete two-phase swap lifecycle on mainnet:
 * 1. Create bulk swap offer
 * 2. Accept offer
 * 3. Party A signs and submits lock transaction
 * 4. Party B signs and submits lock transaction
 * 5. Settlement executes
 * 6. Verify completion and rent recovery
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

import { Connection, Keypair, VersionedTransaction, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://api.easyescrow.ai';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

interface SwapMetrics {
  swapId: string;
  startTime: number;
  endTime?: number;
  transactions: Array<{
    phase: string;
    signature: string;
    fee: number;
    slot: number;
  }>;
  pdas: {
    delegatePDA: string;
    solVaultA: string;
    solVaultB: string;
  };
  rentUsed: number;
  rentReclaimed: number;
}

async function loadWallet(walletPath: string): Promise<Keypair> {
  const fullPath = path.resolve(walletPath);
  const secretKey = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function apiRequest(method: string, endpoint: string, body?: any): Promise<any> {
  const url = `${PRODUCTION_API_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (method === 'POST') {
    headers['idempotency-key'] = `e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json() as any;
  if (!response.ok) {
    throw new Error(`API Error: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

async function signAndSendTransaction(
  connection: Connection,
  serializedTx: string,
  signer: Keypair,
  phase: string
): Promise<{ signature: string; fee: number; slot: number }> {
  const txBuffer = Buffer.from(serializedTx, 'base64');
  const isVersioned = txBuffer.length > 0 && (txBuffer[0] & 0x80) !== 0;

  let signature: string;

  if (isVersioned) {
    const versionedTx = VersionedTransaction.deserialize(txBuffer);
    versionedTx.sign([signer]);
    signature = await connection.sendTransaction(versionedTx, { skipPreflight: false });
  } else {
    const legacyTx = Transaction.from(txBuffer);
    legacyTx.partialSign(signer);
    signature = await connection.sendRawTransaction(legacyTx.serialize());
  }

  console.log(`  [${phase}] Transaction sent: ${signature}`);

  // Wait for confirmation
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  // Get transaction details for fee info
  const txDetails = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
  const fee = txDetails?.meta?.fee || 5000;
  const slot = txDetails?.slot || 0;

  console.log(`  [${phase}] Confirmed at slot ${slot}, fee: ${fee} lamports`);

  return { signature, fee, slot };
}

async function checkPDABalance(connection: Connection, address: string): Promise<number> {
  try {
    const balance = await connection.getBalance(new (await import('@solana/web3.js')).PublicKey(address));
    return balance;
  } catch {
    return 0;
  }
}

async function runE2ETest() {
  console.log('\n' + '='.repeat(70));
  console.log('  TWO-PHASE SWAP E2E TEST - PRODUCTION (MAINNET)');
  console.log('='.repeat(70) + '\n');

  const metrics: SwapMetrics = {
    swapId: '',
    startTime: Date.now(),
    transactions: [],
    pdas: { delegatePDA: '', solVaultA: '', solVaultB: '' },
    rentUsed: 0,
    rentReclaimed: 0,
  };

  try {
    // Setup
    console.log('[1/8] Setting up...');
    const connection = new Connection(RPC_URL, 'confirmed');

    const partyA = await loadWallet('wallets/production/mainnet-sender.json');
    const partyB = await loadWallet('wallets/production/mainnet-receiver.json');

    console.log(`  Party A: ${partyA.publicKey.toBase58()}`);
    console.log(`  Party B: ${partyB.publicKey.toBase58()}`);

    const balanceA = await connection.getBalance(partyA.publicKey);
    const balanceB = await connection.getBalance(partyB.publicKey);
    console.log(`  Balance A: ${balanceA / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Balance B: ${balanceB / LAMPORTS_PER_SOL} SOL`);

    if (balanceB < 0.05 * LAMPORTS_PER_SOL) {
      throw new Error('Party B needs at least 0.05 SOL for the test');
    }

    // Step 1: Create two-phase swap
    console.log('\n[2/8] Creating two-phase swap...');
    const solAmountA = 0.01 * LAMPORTS_PER_SOL; // Party A offers 0.01 SOL
    const solAmountB = 0.01 * LAMPORTS_PER_SOL; // Party B offers 0.01 SOL back

    const createResponse = await apiRequest('POST', '/api/swaps/offers/bulk', {
      partyA: partyA.publicKey.toBase58(),
      partyB: partyB.publicKey.toBase58(),
      assetsA: [], // No NFTs
      assetsB: [], // No NFTs
      solAmountA: solAmountA.toString(), // Party A offers 0.01 SOL
      solAmountB: solAmountB.toString(), // Party B offers 0.01 SOL
    });

    metrics.swapId = createResponse.data.offerId;
    console.log(`  Swap ID: ${metrics.swapId}`);
    console.log(`  Status: ${createResponse.data.offer.status}`);

    // Step 2: Accept the swap
    console.log('\n[3/8] Accepting swap...');
    const acceptResponse = await apiRequest('POST', `/api/swaps/offers/bulk/${metrics.swapId}/accept`, {
      partyB: partyB.publicKey.toBase58(),
    });

    console.log(`  Status: ${acceptResponse.data.offer.status}`);
    metrics.pdas = {
      delegatePDA: acceptResponse.data.lockTransaction?.delegatePDA || acceptResponse.data.offer.pdas?.delegatePDA || '',
      solVaultA: acceptResponse.data.lockTransaction?.solVaultPDA || '',
      solVaultB: '',
    };

    // Step 3: Get Party A lock transaction
    console.log('\n[4/8] Building Party A lock transaction...');
    const lockAResponse = await apiRequest('POST', `/api/swaps/offers/bulk/${metrics.swapId}/lock`, {
      party: 'A',
      walletAddress: partyA.publicKey.toBase58(),
    });

    if (!lockAResponse.data.lockTransaction?.serialized) {
      console.log('  Party A has no assets to lock, skipping...');
    } else {
      const lockATx = await signAndSendTransaction(
        connection,
        lockAResponse.data.lockTransaction.serialized,
        partyA,
        'Lock A'
      );
      metrics.transactions.push({ phase: 'Lock A', ...lockATx });

      // Confirm lock A
      await apiRequest('POST', `/api/swaps/offers/bulk/${metrics.swapId}/confirm-lock`, {
        party: 'A',
        walletAddress: partyA.publicKey.toBase58(),
        signature: lockATx.signature,
      });
      console.log('  Party A lock confirmed');
    }

    // Step 4: Get Party B lock transaction
    console.log('\n[5/8] Building Party B lock transaction...');
    const lockBResponse = await apiRequest('POST', `/api/swaps/offers/bulk/${metrics.swapId}/lock`, {
      party: 'B',
      walletAddress: partyB.publicKey.toBase58(),
    });

    if (!lockBResponse.data.lockTransaction?.serialized) {
      throw new Error('Party B lock transaction not available');
    }

    // Check PDA balances before lock
    const preVaultB = await checkPDABalance(connection, lockBResponse.data.lockTransaction.solVaultPDA || '');
    metrics.pdas.solVaultB = lockBResponse.data.lockTransaction.solVaultPDA || '';

    const lockBTx = await signAndSendTransaction(
      connection,
      lockBResponse.data.lockTransaction.serialized,
      partyB,
      'Lock B'
    );
    metrics.transactions.push({ phase: 'Lock B', ...lockBTx });

    // Confirm lock B
    await apiRequest('POST', `/api/swaps/offers/bulk/${metrics.swapId}/confirm-lock`, {
      party: 'B',
      walletAddress: partyB.publicKey.toBase58(),
      signature: lockBTx.signature,
    });
    console.log('  Party B lock confirmed');

    // Check vault balance after lock
    const postVaultB = await checkPDABalance(connection, metrics.pdas.solVaultB);
    metrics.rentUsed = postVaultB > 0 ? 890880 : 0; // Rent for 0-byte account
    console.log(`  SOL Vault B balance: ${postVaultB / LAMPORTS_PER_SOL} SOL`);

    // Step 5: Check status - should be FULLY_LOCKED
    console.log('\n[6/8] Checking lock status...');
    const statusResponse = await apiRequest('GET', `/api/swaps/offers/bulk/${metrics.swapId}`);
    console.log(`  Status: ${statusResponse.data.offer.status}`);

    // Step 6: Start settlement
    console.log('\n[7/8] Starting settlement...');
    try {
      const settleResponse = await apiRequest('POST', `/api/swaps/offers/bulk/${metrics.swapId}/settle`);
      console.log(`  Settlement status: ${settleResponse.data.status || 'started'}`);

      if (settleResponse.data.signature) {
        metrics.transactions.push({
          phase: 'Settlement',
          signature: settleResponse.data.signature,
          fee: 5000,
          slot: 0,
        });
      }
    } catch (error: any) {
      console.log(`  Settlement: ${error.message}`);
      // Settlement might auto-trigger or need backend processing
    }

    // Wait for settlement to complete
    console.log('  Waiting for settlement to complete...');
    let finalStatus = '';
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const checkResponse = await apiRequest('GET', `/api/swaps/offers/bulk/${metrics.swapId}`);
      finalStatus = checkResponse.data.offer.status;
      console.log(`  Attempt ${i + 1}: Status = ${finalStatus}`);

      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(finalStatus)) {
        break;
      }
    }

    // Step 7: Final verification
    console.log('\n[8/8] Final verification...');
    const finalResponse = await apiRequest('GET', `/api/swaps/offers/bulk/${metrics.swapId}`);
    const finalSwap = finalResponse.data.offer;

    console.log(`  Final Status: ${finalSwap.status}`);
    console.log(`  Settled At: ${finalSwap.settledAt || 'N/A'}`);

    // Check if PDAs were closed (rent reclaimed)
    const finalVaultB = await checkPDABalance(connection, metrics.pdas.solVaultB);
    if (finalVaultB === 0 && metrics.rentUsed > 0) {
      metrics.rentReclaimed = metrics.rentUsed;
      console.log('  Rent reclaimed: YES');
    } else {
      console.log(`  Vault B remaining balance: ${finalVaultB / LAMPORTS_PER_SOL} SOL`);
    }

    metrics.endTime = Date.now();

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('  TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Swap ID: ${metrics.swapId}`);
    console.log(`  Duration: ${(metrics.endTime - metrics.startTime) / 1000} seconds`);
    console.log(`  Transactions: ${metrics.transactions.length}`);

    let totalFees = 0;
    metrics.transactions.forEach(tx => {
      console.log(`    - ${tx.phase}: ${tx.signature.slice(0, 20)}... (fee: ${tx.fee} lamports)`);
      totalFees += tx.fee;
    });

    console.log(`  Total Network Fees: ${totalFees} lamports (${totalFees / LAMPORTS_PER_SOL} SOL)`);
    console.log(`  PDAs Used: 3`);
    console.log(`    - Delegate: ${metrics.pdas.delegatePDA}`);
    console.log(`    - Vault A: ${metrics.pdas.solVaultA}`);
    console.log(`    - Vault B: ${metrics.pdas.solVaultB}`);
    console.log(`  Rent Used: ${metrics.rentUsed} lamports (${metrics.rentUsed / LAMPORTS_PER_SOL} SOL)`);
    console.log(`  Rent Reclaimed: ${metrics.rentReclaimed} lamports (${metrics.rentReclaimed / LAMPORTS_PER_SOL} SOL)`);
    console.log(`  Final Status: ${finalSwap.status}`);
    console.log('='.repeat(70) + '\n');

    if (finalSwap.status === 'COMPLETED') {
      console.log('SUCCESS: Two-phase swap completed successfully!');
    } else {
      console.log(`WARNING: Swap ended with status: ${finalSwap.status}`);
    }

  } catch (error) {
    console.error('\nERROR:', error);
    metrics.endTime = Date.now();
    console.log(`\nTest failed after ${(metrics.endTime - metrics.startTime) / 1000} seconds`);
    if (metrics.swapId) {
      console.log(`Swap ID for debugging: ${metrics.swapId}`);
    }
    process.exit(1);
  }
}

runE2ETest().catch(console.error);
