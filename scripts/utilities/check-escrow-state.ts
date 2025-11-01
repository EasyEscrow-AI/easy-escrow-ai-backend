/**
 * Quick script to check on-chain escrow state for debugging
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

// Load staging environment
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.staging'), override: true });

async function checkEscrowState() {
  const escrowPdaStr = process.argv[2];
  
  if (!escrowPdaStr) {
    console.error('Usage: ts-node check-escrow-state.ts <escrowPDA>');
    process.exit(1);
  }

  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    console.error('SOLANA_RPC_URL not set in .env.staging');
    process.exit(1);
  }

  console.log(`\n🔍 Checking escrow state for: ${escrowPdaStr}`);
  console.log(`📡 RPC: ${rpcUrl.substring(0, 50)}...`);

  const connection = new Connection(rpcUrl, 'confirmed');
  const escrowPda = new PublicKey(escrowPdaStr);

  // Load IDL
  const idlPath = path.join(process.cwd(), 'target/idl/escrow.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // Create a dummy provider (we're just reading, no wallet needed)
  const dummyKeypair = Keypair.generate();
  const wallet = new Wallet(dummyKeypair);
  const provider = new AnchorProvider(connection, wallet, {});
  const programId = new PublicKey('AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei'); // Staging
  const program = new Program(idl, provider);

  try {
    const escrowState = await (program.account as any).escrowState.fetch(escrowPda);
    
    console.log('\n✅ Escrow State Found:');
    console.log('================================================================================');
    console.log(`Escrow ID:            ${escrowState.escrowId.toString()}`);
    console.log(`Buyer:                ${escrowState.buyer.toString()}`);
    console.log(`Seller:               ${escrowState.seller.toString()}`);
    console.log(`NFT Mint:             ${escrowState.nftMint.toString()}`);
    console.log(`USDC Amount:          ${escrowState.usdcAmount.toString()} (${escrowState.usdcAmount.toNumber() / 1_000_000} USDC)`);
    console.log(`Expiry Timestamp:     ${escrowState.expiryTimestamp.toString()} (${new Date(escrowState.expiryTimestamp.toNumber() * 1000).toISOString()})`);
    console.log(`Platform Fee BPS:     ${escrowState.platformFeeBps} (${escrowState.platformFeeBps / 100}%)`);
    console.log(`Status:               ${JSON.stringify(escrowState.status)}`);
    console.log(`\n🔐 Deposit Flags:`);
    console.log(`  Buyer USDC Deposited:  ${escrowState.buyerUsdcDeposited ? '✅ YES' : '❌ NO'}`);
    console.log(`  Seller NFT Deposited:  ${escrowState.sellerNftDeposited ? '✅ YES' : '❌ NO'}`);
    console.log(`\n🕒 Expiry Status:`);
    const now = Math.floor(Date.now() / 1000);
    const expired = now > escrowState.expiryTimestamp.toNumber();
    console.log(`  Current Time:  ${now} (${new Date(now * 1000).toISOString()})`);
    console.log(`  Expired:       ${expired ? '⚠️  YES - EXPIRED' : '✅ NO - Still valid'}`);
    
    console.log(`\n📋 Settlement Ready?`);
    const bothDeposited = escrowState.buyerUsdcDeposited && escrowState.sellerNftDeposited;
    const isPending = JSON.stringify(escrowState.status) === JSON.stringify({ pending: {} });
    const notExpired = !expired;
    const ready = bothDeposited && isPending && notExpired;
    
    console.log(`  Both Deposited:  ${bothDeposited ? '✅' : '❌'}`);
    console.log(`  Status Pending:  ${isPending ? '✅' : '❌'}`);
    console.log(`  Not Expired:     ${notExpired ? '✅' : '❌'}`);
    console.log(`  READY:           ${ready ? '✅ YES - READY TO SETTLE' : '❌ NO - NOT READY'}`);
    
    if (!ready) {
      console.log(`\n⚠️  Reasons NOT ready:`);
      if (!bothDeposited) {
        console.log(`  - Deposits incomplete (USDC: ${escrowState.buyerUsdcDeposited}, NFT: ${escrowState.sellerNftDeposited})`);
      }
      if (!isPending) {
        console.log(`  - Status is not Pending (current: ${JSON.stringify(escrowState.status)})`);
      }
      if (expired) {
        console.log(`  - Agreement has expired`);
      }
    }
    
    console.log('================================================================================\n');
  } catch (error) {
    console.error('\n❌ Error fetching escrow state:', error);
    console.error('Make sure the PDA address is correct and the escrow exists on-chain.\n');
    process.exit(1);
  }
}

checkEscrowState();

