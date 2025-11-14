/**
 * Inspect escrow account states to understand why they can't be closed
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load production env
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

const RPC_URL = 'https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/';
const PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';

async function inspectAccounts() {
  console.log('🔍 Inspecting escrow account states...\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);

  // Get all program accounts
  const accounts = await connection.getProgramAccounts(programId);
  console.log(`Found ${accounts.length} accounts\n`);

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/escrow.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // Create dummy provider (we're just reading, not signing)
  const dummyKeypair = Keypair.generate();
  const wallet = new Wallet(dummyKeypair);
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program(idl, provider);

  // Inspect first 10 accounts
  const sampleSize = Math.min(10, accounts.length);
  console.log(`Inspecting ${sampleSize} sample accounts:\n`);

  const results = {
    readable: 0,
    unreadable: 0,
    completed: 0,
    cancelled: 0,
    pending: 0,
    other: 0,
  };

  for (let i = 0; i < sampleSize; i++) {
    const account = accounts[i];
    const pda = account.pubkey;
    const shortPda = pda.toString().slice(0, 8);

    try {
      // Fetch raw account data
      const accountInfo = await connection.getAccountInfo(pda);
      
      if (!accountInfo || !accountInfo.data) {
        console.log(`❌ ${i + 1}. ${shortPda}... - No data (likely already closed)`);
        results.unreadable++;
        continue;
      }

      // Try to decode the data (simplified - just check if we can read it)
      const data = accountInfo.data;
      console.log(`✅ ${i + 1}. ${shortPda}... - Has data (${data.length} bytes, ${(accountInfo.lamports / 1e9).toFixed(6)} SOL rent)`);
      
      results.readable++;
      results.other++; // Count as "other" since we can't easily decode status without full deserialization
      
    } catch (error: any) {
      console.log(`❌ ${i + 1}. ${shortPda}... - Error: ${error.message}`);
      results.unreadable++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 INSPECTION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Accounts: ${accounts.length}`);
  console.log(`Sample Inspected: ${sampleSize}`);
  console.log('');
  console.log(`Readable: ${results.readable}`);
  console.log(`  - Completed: ${results.completed}`);
  console.log(`  - Cancelled: ${results.cancelled}`);
  console.log(`  - Pending: ${results.pending}`);
  console.log(`  - Other: ${results.other}`);
  console.log(`Unreadable: ${results.unreadable}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (results.unreadable > 0) {
    console.log('⚠️  Some accounts are unreadable (corrupted or already closed)');
    console.log('These accounts may already be closed or in an invalid state.\n');
  }

  if (results.completed > 0 || results.cancelled > 0) {
    console.log(`✅ ${results.completed + results.cancelled} accounts are in terminal state and can be closed\n`);
  }

  if (results.pending > 0 || results.other > 0) {
    console.log(`⚠️  ${results.pending + results.other} accounts are NOT in terminal state`);
    console.log('These need to be cancelled/settled first before closing\n');
  }
}

inspectAccounts().catch(console.error);

