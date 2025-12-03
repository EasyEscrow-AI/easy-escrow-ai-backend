/**
 * Local Testing Script for Atomic Swap Program
 * 
 * Tests the atomic swap functionality on a local Solana validator
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import * as fs from 'fs';
import * as path from 'path';

// Load IDL
const idlPath = path.join(__dirname, '../../target/idl/escrow.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

// Program ID for localnet
const PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');

// Override IDL address with localnet program ID
idl.address = PROGRAM_ID.toBase58();

// Local RPC endpoint
const RPC_URL = 'http://127.0.0.1:8899';

async function main() {
  console.log('🚀 Starting Atomic Swap Local Tests\n');
  console.log('═══════════════════════════════════════════════════════════');
  
  // Setup connection
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Load platform authority (dev admin)
  const platformAuthorityPath = path.join(__dirname, '../../wallets/dev/dev-admin.json');
  const platformAuthorityKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(platformAuthorityPath, 'utf8')))
  );
  
  console.log('📡 Connection:', RPC_URL);
  console.log('🔑 Platform Authority:', platformAuthorityKeypair.publicKey.toBase58());
  console.log('🏦 Program ID:', PROGRAM_ID.toBase58());
  
  // Setup provider and program
  const wallet = new Wallet(platformAuthorityKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idl, provider);
  
  console.log('\n✅ Program loaded successfully');
  
  // Test 1: Initialize Treasury
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📋 TEST 1: Initialize Treasury PDA');
  console.log('═══════════════════════════════════════════════════════════');
  
  try {
    const [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), platformAuthorityKeypair.publicKey.toBuffer()],
      PROGRAM_ID
    );
    
    console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
    console.log('🔢 Treasury Bump:', treasuryBump);
    
    // Check if treasury already exists
    const treasuryAccount = await connection.getAccountInfo(treasuryPda);
    
    if (treasuryAccount) {
      console.log('ℹ️  Treasury already initialized');
      
      // Read treasury data
      const treasuryData = await (program.account as any).treasury.fetch(treasuryPda);
      console.log('💰 Total Fees Collected:', treasuryData.totalFeesCollected.toString(), 'lamports');
      console.log('🔄 Total Swaps Executed:', treasuryData.totalSwapsExecuted.toString());
    } else {
      console.log('🔨 Initializing treasury...');
      
      const tx = await program.methods
        .initializeTreasury()
        .accounts({
          authority: platformAuthorityKeypair.publicKey,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log('✅ Treasury initialized!');
      console.log('📝 Transaction:', tx);
      
      // Verify
      const treasuryData = await (program.account as any).treasury.fetch(treasuryPda);
      console.log('💰 Initial Fees:', treasuryData.totalFeesCollected.toString());
      console.log('🔄 Initial Swaps:', treasuryData.totalSwapsExecuted.toString());
    }
  } catch (error) {
    console.error('❌ Treasury initialization failed:', error);
    throw error;
  }
  
  // Test 2: Create Test Accounts
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📋 TEST 2: Create Test Accounts');
  console.log('═══════════════════════════════════════════════════════════');
  
  // Create maker and taker keypairs
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  
  console.log('👤 Maker:', maker.publicKey.toBase58());
  console.log('👤 Taker:', taker.publicKey.toBase58());
  
  // Fund test accounts from faucet (airdrop often fails on local validator)
  console.log('\n💸 Funding test accounts from faucet...');
  
  try {
    // Load faucet keypair
    const faucetPath = path.join(__dirname, '../../test-ledger/faucet-keypair.json');
    const faucetKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(faucetPath, 'utf8')))
    );
    
    // Transfer to maker
    const makerTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: faucetKeypair.publicKey,
        toPubkey: maker.publicKey,
        lamports: 2 * LAMPORTS_PER_SOL,
      })
    );
    makerTx.feePayer = faucetKeypair.publicKey;
    makerTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    makerTx.sign(faucetKeypair);
    const makerSig = await connection.sendRawTransaction(makerTx.serialize());
    await connection.confirmTransaction(makerSig, 'confirmed');
    console.log('✅ Maker funded: 2 SOL');
    
    // Transfer to taker
    const takerTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: faucetKeypair.publicKey,
        toPubkey: taker.publicKey,
        lamports: 2 * LAMPORTS_PER_SOL,
      })
    );
    takerTx.feePayer = faucetKeypair.publicKey;
    takerTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    takerTx.sign(faucetKeypair);
    const takerSig = await connection.sendRawTransaction(takerTx.serialize());
    await connection.confirmTransaction(takerSig, 'confirmed');
    console.log('✅ Taker funded: 2 SOL');
  } catch (error) {
    console.error('❌ Funding failed:', error);
    throw error;
  }
  
  // Check balances
  const makerBalance = await connection.getBalance(maker.publicKey);
  const takerBalance = await connection.getBalance(taker.publicKey);
  
  console.log('\n💰 Balances:');
  console.log('   Maker:', (makerBalance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
  console.log('   Taker:', (takerBalance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
  
  // Test 3: SOL-only Swap (simplest test)
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📋 TEST 3: SOL-only Swap (0.1 SOL for 0.2 SOL)');
  console.log('═══════════════════════════════════════════════════════════');
  
  try {
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), platformAuthorityKeypair.publicKey.toBuffer()],
      PROGRAM_ID
    );
    
    const makerSolAmount = 0.1 * LAMPORTS_PER_SOL; // Maker sends 0.1 SOL
    const takerSolAmount = 0.2 * LAMPORTS_PER_SOL; // Taker sends 0.2 SOL
    const platformFee = 0.005 * LAMPORTS_PER_SOL;  // 0.005 SOL fee
    
    console.log('💱 Swap Details:');
    console.log('   Maker sends:', (makerSolAmount / LAMPORTS_PER_SOL), 'SOL');
    console.log('   Taker sends:', (takerSolAmount / LAMPORTS_PER_SOL), 'SOL');
    console.log('   Platform fee:', (platformFee / LAMPORTS_PER_SOL), 'SOL');
    
    console.log('\n🔨 Building transaction...');
    
    const tx = await program.methods
      .atomicSwapWithFee({
        makerSendsNft: false,
        takerSendsNft: false,
        makerSolAmount: new BN(makerSolAmount),
        takerSolAmount: new BN(takerSolAmount),
        platformFee: new BN(platformFee),
        swapId: 'test-sol-swap-001',
      })
      .accounts({
        maker: maker.publicKey,
        taker: taker.publicKey,
        platformAuthority: platformAuthorityKeypair.publicKey,
        treasury: treasuryPda,
        makerNftAccount: PROGRAM_ID, // Sentinel value for optional account
        takerNftDestination: PROGRAM_ID,
        takerNftAccount: PROGRAM_ID,
        makerNftDestination: PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker, taker, platformAuthorityKeypair])
      .rpc();
    
    console.log('✅ Swap executed!');
    console.log('📝 Transaction:', tx);
    
    // Verify balances
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for confirmation
    
    const makerBalanceAfter = await connection.getBalance(maker.publicKey);
    const takerBalanceAfter = await connection.getBalance(taker.publicKey);
    
    console.log('\n💰 Balances After Swap:');
    console.log('   Maker:', (makerBalanceAfter / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
    console.log('   Taker:', (takerBalanceAfter / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
    
    // Verify treasury
    const treasuryData = await (program.account as any).treasury.fetch(treasuryPda);
    console.log('\n🏛️  Treasury Stats:');
    console.log('   Total Fees:', (Number(treasuryData.totalFeesCollected) / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
    console.log('   Total Swaps:', treasuryData.totalSwapsExecuted.toString());
    
    console.log('\n✅ SOL swap test PASSED!');
  } catch (error) {
    console.error('❌ SOL swap test FAILED:', error);
    throw error;
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ All tests completed successfully!');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main()
  .then(() => {
    console.log('🎉 Testing complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Testing failed:', error);
    process.exit(1);
  });

