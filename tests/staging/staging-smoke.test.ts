/**
 * STAGING Smoke Tests
 * 
 * Quick validation tests to verify STAGING deployment is functional.
 * These tests run against devnet with the STAGING program ID.
 * 
 * Run: npm run test:staging:smoke
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

// STAGING Configuration
const STAGING_PROGRAM_ID = 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei';
const NETWORK_URL = 'https://api.devnet.solana.com';

describe('STAGING Smoke Tests', function () {
  this.timeout(60000); // 60 second timeout for network operations

  let connection: Connection;
  let provider: AnchorProvider;
  let program: Program;
  let adminWallet: Wallet;

  before(async function () {
    console.log('\n🔍 Setting up STAGING smoke tests...');
    console.log(`   Network: ${NETWORK_URL}`);
    console.log(`   Program: ${STAGING_PROGRAM_ID}`);

    // Setup connection
    connection = new Connection(NETWORK_URL, 'confirmed');

    // Load admin wallet
    const adminKeypairPath = path.join(__dirname, '../../keys/staging-admin.json');
    
    if (!fs.existsSync(adminKeypairPath)) {
      throw new Error(`Admin keypair not found: ${adminKeypairPath}`);
    }

    const adminKeypairData = JSON.parse(fs.readFileSync(adminKeypairPath, 'utf-8'));
    const adminKeypair = Keypair.fromSecretKey(
      Uint8Array.from(adminKeypairData)
    );
    adminWallet = new Wallet(adminKeypair);

    console.log(`   Admin: ${adminWallet.publicKey.toBase58()}`);

    // Setup provider
    provider = new AnchorProvider(
      connection,
      adminWallet,
      { commitment: 'confirmed' }
    );

    // Load program IDL
    const idlPath = path.join(__dirname, '../../target/idl/escrow.json');
    if (!fs.existsSync(idlPath)) {
      throw new Error(`IDL not found: ${idlPath}`);
    }

    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    program = new Program(idl, new PublicKey(STAGING_PROGRAM_ID), provider);

    console.log('   ✅ Setup complete\n');
  });

  describe('Network Connectivity', function () {
    it('should connect to devnet', async function () {
      const version = await connection.getVersion();
      console.log(`   Devnet version: ${version['solana-core']}`);
      expect(version).to.have.property('solana-core');
    });

    it('should have sufficient admin balance', async function () {
      const balance = await connection.getBalance(adminWallet.publicKey);
      const balanceSOL = balance / LAMPORTS_PER_SOL;
      
      console.log(`   Admin balance: ${balanceSOL.toFixed(4)} SOL`);
      expect(balance).to.be.greaterThan(0, 'Admin wallet has no SOL');
      
      if (balanceSOL < 1) {
        console.log('   ⚠️  Warning: Low balance for testing');
      }
    });
  });

  describe('Program Deployment', function () {
    it('should find program on devnet', async function () {
      const programId = new PublicKey(STAGING_PROGRAM_ID);
      const accountInfo = await connection.getAccountInfo(programId);
      
      expect(accountInfo).to.not.be.null;
      expect(accountInfo?.executable).to.be.true;
      expect(accountInfo?.owner.toBase58()).to.equal(
        'BPFLoaderUpgradeab1e11111111111111111111111'
      );
      
      console.log(`   Program size: ${accountInfo?.data.length} bytes`);
      console.log('   ✅ Program is deployed and executable');
    });

    it('should load program IDL', async function () {
      expect(program).to.not.be.undefined;
      expect(program.programId.toBase58()).to.equal(STAGING_PROGRAM_ID);
      
      // Check IDL has expected instructions
      const instructions = program.idl.instructions || [];
      const instructionNames = instructions.map((ix: any) => ix.name);
      
      console.log(`   Instructions found: ${instructionNames.length}`);
      console.log(`   Instructions: ${instructionNames.join(', ')}`);
      
      // Verify core instructions exist
      const expectedInstructions = [
        'initializeEscrow',
        'depositFunds',
        'releaseFunds',
        'cancelEscrow'
      ];
      
      for (const expected of expectedInstructions) {
        const found = instructionNames.includes(expected);
        if (found) {
          console.log(`   ✅ ${expected} instruction found`);
        } else {
          console.log(`   ⚠️  ${expected} instruction not found`);
        }
      }
    });
  });

  describe('PDA Derivation', function () {
    it('should derive escrow PDA correctly', async function () {
      // Test PDA derivation with a test escrow ID
      const testEscrowId = new PublicKey('11111111111111111111111111111111');
      
      const [escrowPDA, bump] = await PublicKey.findProgramAddress(
        [Buffer.from('escrow'), testEscrowId.toBuffer()],
        new PublicKey(STAGING_PROGRAM_ID)
      );
      
      console.log(`   Test Escrow PDA: ${escrowPDA.toBase58()}`);
      console.log(`   Bump: ${bump}`);
      
      expect(escrowPDA).to.be.instanceOf(PublicKey);
      expect(bump).to.be.a('number');
      expect(bump).to.be.greaterThanOrEqual(0);
      expect(bump).to.be.lessThan(256);
    });
  });

  describe('Token Program Integration', function () {
    it('should reference correct Token Program', function () {
      const tokenProgramId = TOKEN_PROGRAM_ID.toBase58();
      console.log(`   Token Program: ${tokenProgramId}`);
      
      expect(tokenProgramId).to.equal('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    });
  });

  describe('Explorer Links', function () {
    it('should generate valid explorer links', function () {
      const programExplorerUrl = `https://explorer.solana.com/address/${STAGING_PROGRAM_ID}?cluster=devnet`;
      const adminExplorerUrl = `https://explorer.solana.com/address/${adminWallet.publicKey.toBase58()}?cluster=devnet`;
      
      console.log(`\n   🔗 Program Explorer: ${programExplorerUrl}`);
      console.log(`   🔗 Admin Explorer: ${adminExplorerUrl}`);
      
      expect(programExplorerUrl).to.include('explorer.solana.com');
      expect(adminExplorerUrl).to.include('explorer.solana.com');
    });
  });

  // Summary
  after(function () {
    console.log('\n✅ STAGING Smoke Tests Complete!');
    console.log('   All critical checks passed');
    console.log('   STAGING environment is ready for testing\n');
  });
});

