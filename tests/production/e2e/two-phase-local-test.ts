/**
 * Two-Phase Swap Local Test
 *
 * Tests the on-chain instructions directly without going through the API.
 * This verifies that the deposit and settle instructions work correctly.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');
const FEE_COLLECTOR = new PublicKey('6e4dcMJSTuKSXHGDsUhVyK5YXTz3AkFiuQwSaQDwSXG1');

const TWO_PHASE_SOL_VAULT_SEED = 'two_phase_sol_vault';

function uuidToBuffer(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  return Buffer.from(hex, 'hex');
}

function uuidToUint8Array(uuid: string): Uint8Array {
  return new Uint8Array(uuidToBuffer(uuid));
}

function getInstructionDiscriminator(instructionName: string): Buffer {
  const hash = crypto.createHash('sha256')
    .update(`global:${instructionName}`)
    .digest();
  return hash.slice(0, 8);
}

function deriveSolVaultPDA(swapId: string, party: 'A' | 'B'): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(TWO_PHASE_SOL_VAULT_SEED),
      uuidToBuffer(swapId),
      Buffer.from(party),
    ],
    PROGRAM_ID
  );
}

function buildDepositInstruction(
  swapId: string,
  party: 'A' | 'B',
  depositor: PublicKey,
  amount: bigint
): TransactionInstruction {
  const [solVaultPDA] = deriveSolVaultPDA(swapId, party);
  const swapIdBytes = uuidToUint8Array(swapId);
  const partyByte = party.charCodeAt(0);

  const discriminator = getInstructionDiscriminator('deposit_two_phase_sol');

  const data = Buffer.alloc(8 + 16 + 1 + 8);
  discriminator.copy(data, 0);
  Buffer.from(swapIdBytes).copy(data, 8);
  data.writeUInt8(partyByte, 24);
  data.writeBigUInt64LE(amount, 25);

  return new TransactionInstruction({
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: solVaultPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
}

function buildSettleInstruction(
  swapId: string,
  party: 'A' | 'B',
  caller: PublicKey,
  recipient: PublicKey,
  recipientAmount: bigint,
  platformFee: bigint,
  rentRecipient: PublicKey
): TransactionInstruction {
  const [solVaultPDA] = deriveSolVaultPDA(swapId, party);
  const swapIdBytes = uuidToUint8Array(swapId);
  const partyByte = party.charCodeAt(0);

  const discriminator = getInstructionDiscriminator('settle_two_phase_with_close');

  const data = Buffer.alloc(8 + 16 + 1 + 8 + 8);
  discriminator.copy(data, 0);
  Buffer.from(swapIdBytes).copy(data, 8);
  data.writeUInt8(partyByte, 24);
  data.writeBigUInt64LE(recipientAmount, 25);
  data.writeBigUInt64LE(platformFee, 33);

  return new TransactionInstruction({
    keys: [
      { pubkey: caller, isSigner: true, isWritable: true },
      { pubkey: solVaultPDA, isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
      { pubkey: FEE_COLLECTOR, isSigner: false, isWritable: true },
      { pubkey: rentRecipient, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
}

async function loadWallet(walletPath: string): Promise<Keypair> {
  const fullPath = path.resolve(walletPath);
  const secretKey = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function runTest() {
  console.log('\n======================================================================');
  console.log('  TWO-PHASE SWAP LOCAL TEST (DIRECT ON-CHAIN)');
  console.log('======================================================================\n');

  const connection = new Connection(RPC_URL, 'confirmed');

  // Load wallets
  const partyA = await loadWallet('wallets/production/mainnet-sender.json');
  const partyB = await loadWallet('wallets/production/mainnet-receiver.json');
  const backendAuth = await loadWallet('wallets/production/mainnet-admin.json');

  console.log(`Party A: ${partyA.publicKey.toBase58()}`);
  console.log(`Party B: ${partyB.publicKey.toBase58()}`);
  console.log(`Backend Authority: ${backendAuth.publicKey.toBase58()}`);

  // Generate test swap ID
  const swapId = crypto.randomUUID();
  console.log(`\nSwap ID: ${swapId}`);

  const depositAmount = BigInt(0.01 * LAMPORTS_PER_SOL);
  const [vaultA] = deriveSolVaultPDA(swapId, 'A');
  const [vaultB] = deriveSolVaultPDA(swapId, 'B');

  console.log(`Vault A: ${vaultA.toBase58()}`);
  console.log(`Vault B: ${vaultB.toBase58()}`);

  try {
    // Step 1: Party A deposits
    console.log('\n[1/4] Party A depositing 0.01 SOL...');
    const depositAIx = buildDepositInstruction(swapId, 'A', partyA.publicKey, depositAmount);
    const depositATx = new Transaction().add(depositAIx);
    depositATx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    depositATx.feePayer = partyA.publicKey;

    const sigA = await sendAndConfirmTransaction(connection, depositATx, [partyA]);
    console.log(`  ✅ Party A deposit confirmed: ${sigA}`);

    // Check vault A balance
    const vaultABalance = await connection.getBalance(vaultA);
    console.log(`  Vault A balance: ${vaultABalance / LAMPORTS_PER_SOL} SOL`);

    // Step 2: Party B deposits
    console.log('\n[2/4] Party B depositing 0.01 SOL...');
    const depositBIx = buildDepositInstruction(swapId, 'B', partyB.publicKey, depositAmount);
    const depositBTx = new Transaction().add(depositBIx);
    depositBTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    depositBTx.feePayer = partyB.publicKey;

    const sigB = await sendAndConfirmTransaction(connection, depositBTx, [partyB]);
    console.log(`  ✅ Party B deposit confirmed: ${sigB}`);

    // Check vault B balance
    const vaultBBalance = await connection.getBalance(vaultB);
    console.log(`  Vault B balance: ${vaultBBalance / LAMPORTS_PER_SOL} SOL`);

    // Step 3: Settle vault A (Party A's SOL goes to Party B)
    console.log('\n[3/4] Settling vault A (A → B)...');
    const settleAIx = buildSettleInstruction(
      swapId,
      'A',
      backendAuth.publicKey,
      partyB.publicKey,
      depositAmount,
      BigInt(0),
      FEE_COLLECTOR
    );
    const settleATx = new Transaction().add(settleAIx);
    settleATx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    settleATx.feePayer = backendAuth.publicKey;

    const sigSettleA = await sendAndConfirmTransaction(connection, settleATx, [backendAuth]);
    console.log(`  ✅ Vault A settled: ${sigSettleA}`);

    // Step 4: Settle vault B (Party B's SOL goes to Party A)
    console.log('\n[4/4] Settling vault B (B → A)...');
    const settleBIx = buildSettleInstruction(
      swapId,
      'B',
      backendAuth.publicKey,
      partyA.publicKey,
      depositAmount,
      BigInt(0),
      FEE_COLLECTOR
    );
    const settleBTx = new Transaction().add(settleBIx);
    settleBTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    settleBTx.feePayer = backendAuth.publicKey;

    const sigSettleB = await sendAndConfirmTransaction(connection, settleBTx, [backendAuth]);
    console.log(`  ✅ Vault B settled: ${sigSettleB}`);

    // Final check
    const finalVaultA = await connection.getBalance(vaultA);
    const finalVaultB = await connection.getBalance(vaultB);

    console.log('\n======================================================================');
    console.log('  TEST RESULTS');
    console.log('======================================================================');
    console.log(`  Vault A final balance: ${finalVaultA} lamports (should be 0)`);
    console.log(`  Vault B final balance: ${finalVaultB} lamports (should be 0)`);
    console.log(`  Transactions: 4 (2 deposits, 2 settlements)`);
    console.log('======================================================================');

    if (finalVaultA === 0 && finalVaultB === 0) {
      console.log('\n✅ SUCCESS: Two-phase swap completed successfully!');
    } else {
      console.log('\n⚠️  WARNING: Vaults not fully closed');
    }

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    if (error.logs) {
      console.error('Logs:', error.logs);
    }
    process.exit(1);
  }
}

runTest().catch(console.error);
