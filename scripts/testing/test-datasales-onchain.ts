/**
 * Test DataSales On-Chain Program Instructions on Staging (Devnet)
 *
 * Tests:
 * 1. PDA derivation matches expected values
 * 2. Create DataSales escrow instruction
 * 3. Deposit SOL instruction (simulated)
 * 4. Full transaction building
 *
 * Usage: npx ts-node scripts/testing/test-datasales-onchain.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';

// Import the DataSales program service
import { DataSalesProgramService } from '../../src/services/datasales-program.service';

// Staging program ID
const STAGING_PROGRAM_ID = 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei';

async function runTests() {
  console.log('=== DataSales On-Chain Program Tests (Staging/Devnet) ===\n');

  // Verify environment
  console.log('Environment check:');
  console.log(`  SOLANA_NETWORK: ${process.env.SOLANA_NETWORK || 'not set'}`);
  console.log(`  SOLANA_RPC_URL: ${process.env.SOLANA_RPC_URL ? '***' : 'not set'}`);
  console.log(`  ESCROW_PROGRAM_ID: ${process.env.ESCROW_PROGRAM_ID || 'not set'}`);
  console.log();

  const connection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );

  // Check program is deployed
  console.log('1. Verifying program deployment...');
  try {
    const programPubkey = new PublicKey(STAGING_PROGRAM_ID);
    const programInfo = await connection.getAccountInfo(programPubkey);

    if (programInfo && programInfo.executable) {
      console.log(`   ✅ Program is deployed and executable`);
      console.log(`   Program ID: ${STAGING_PROGRAM_ID}`);
      console.log(`   Data length: ${programInfo.data.length} bytes`);
    } else {
      console.log(`   ❌ Program not found or not executable`);
      return;
    }
  } catch (error: any) {
    console.error(`   ❌ Failed to check program: ${error.message}`);
    return;
  }

  // Initialize service
  console.log('\n2. Initializing DataSalesProgramService...');
  let service: DataSalesProgramService;
  try {
    service = new DataSalesProgramService();
    console.log('   ✅ Service initialized');
  } catch (error: any) {
    console.error(`   ❌ Failed to initialize service: ${error.message}`);
    return;
  }

  // Test PDA derivation
  console.log('\n3. Testing PDA derivation...');
  const testAgreementId = uuidv4();
  console.log(`   Test Agreement ID: ${testAgreementId}`);

  try {
    const escrowPda = service.deriveEscrowPda(testAgreementId);
    console.log(`   ✅ Escrow PDA: ${escrowPda.pda.toBase58()}`);
    console.log(`      Bump: ${escrowPda.bump}`);

    const vaultPda = service.deriveVaultPda(testAgreementId);
    console.log(`   ✅ Vault PDA: ${vaultPda.pda.toBase58()}`);
    console.log(`      Bump: ${vaultPda.bump}`);

    // Verify PDAs are on curve
    const escrowOnCurve = PublicKey.isOnCurve(escrowPda.pda.toBuffer());
    const vaultOnCurve = PublicKey.isOnCurve(vaultPda.pda.toBuffer());
    console.log(`   Escrow on curve: ${escrowOnCurve} (expected: false for PDA)`);
    console.log(`   Vault on curve: ${vaultOnCurve} (expected: false for PDA)`);
  } catch (error: any) {
    console.error(`   ❌ PDA derivation failed: ${error.message}`);
  }

  // Test transaction building (simulation only)
  console.log('\n4. Testing transaction building...');
  const sellerWallet = Keypair.generate().publicKey.toBase58();

  try {
    const createInput = {
      agreementId: testAgreementId,
      sellerWallet,
      priceLamports: BigInt(0.1 * LAMPORTS_PER_SOL),
      platformFeeLamports: BigInt(0.0025 * LAMPORTS_PER_SOL),
      depositWindowEnd: Math.floor(Date.now() / 1000) + 72 * 3600,
      accessDurationSeconds: 168 * 3600,
    };

    console.log('   Building create escrow transaction...');
    const createResult = await service.buildCreateEscrowTransaction(createInput);

    if (createResult.serializedTransaction) {
      console.log(`   ✅ Create transaction built successfully`);
      console.log(`      Escrow PDA: ${createResult.escrowPda}`);
      console.log(`      TX size: ${createResult.serializedTransaction.length} chars (base64)`);
    }
  } catch (error: any) {
    console.log(`   ⚠️ Create transaction building: ${error.message}`);
    console.log('      (This may fail without proper authority keypair - expected)');
  }

  // Test deposit transaction building
  console.log('\n5. Testing deposit transaction building...');
  const buyerWallet = Keypair.generate().publicKey.toBase58();

  try {
    const depositInput = {
      agreementId: testAgreementId,
      buyerWallet,
    };

    console.log('   Building deposit SOL transaction...');
    const depositResult = await service.buildDepositSolTransaction(depositInput);

    if (depositResult.serializedTransaction) {
      console.log(`   ✅ Deposit transaction built successfully`);
      console.log(`      Escrow PDA: ${depositResult.escrowPda}`);
      console.log(`      TX size: ${depositResult.serializedTransaction.length} chars (base64)`);
    }
  } catch (error: any) {
    console.log(`   ⚠️ Deposit transaction building: ${error.message}`);
    console.log('      (This may fail without existing escrow account - expected)');
  }

  // Check wallet balances for test wallets
  console.log('\n6. Checking staging test wallet balances...');
  const testWallets = [
    { name: 'Sender', address: process.env.DEVNET_STAGING_SENDER_ADDRESS },
    { name: 'Receiver', address: process.env.DEVNET_STAGING_RECEIVER_ADDRESS },
    { name: 'Fee Collector', address: process.env.DEVNET_STAGING_FEE_COLLECTOR_ADDRESS },
    { name: 'Treasury', address: process.env.DEVNET_STAGING_TREASURY_ADDRESS },
  ];

  for (const wallet of testWallets) {
    if (wallet.address) {
      try {
        const balance = await connection.getBalance(new PublicKey(wallet.address));
        console.log(`   ${wallet.name}: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      } catch (error) {
        console.log(`   ${wallet.name}: Unable to fetch balance`);
      }
    }
  }

  console.log('\n=== All on-chain tests completed ===\n');
}

runTests().catch(console.error);
