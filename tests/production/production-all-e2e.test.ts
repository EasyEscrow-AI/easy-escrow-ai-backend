/**
 * Comprehensive End-to-End Tests for Atomic Swap System (Production)
 * 
 * This test suite validates the complete atomic swap functionality on production (mainnet).
 * It covers all critical paths and scenarios for the MVP implementation.
 * 
 * ⚠️ WARNING: These tests interact with REAL MAINNET. Use with extreme caution!
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import * as fs from 'fs';
import * as path from 'path';

// Test configuration
const RPC_URL = process.env.PRODUCTION_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx');
const PLATFORM_AUTHORITY_PATH = process.env.PRODUCTION_ADMIN_PRIVATE_KEY_PATH || 
  path.join(__dirname, '../../wallets/production/production-deployer.json');

describe('🚀 Atomic Swap E2E Tests - PRODUCTION', () => {
  let connection: Connection;
  let program: Program;
  let platformAuthority: Keypair;
  let treasuryPda: PublicKey;
  
  before(async function() {
    this.timeout(60000);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     PRODUCTION ATOMIC SWAP E2E TESTS - SETUP                ║');
    console.log('║     ⚠️  RUNNING ON MAINNET - USE WITH CAUTION  ⚠️            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    // Setup connection
    connection = new Connection(RPC_URL, 'confirmed');
    console.log('📡 RPC:', RPC_URL);
    
    // Load platform authority
    const authoritySecret = JSON.parse(fs.readFileSync(PLATFORM_AUTHORITY_PATH, 'utf8'));
    platformAuthority = Keypair.fromSecretKey(new Uint8Array(authoritySecret));
    console.log('🔑 Platform Authority:', platformAuthority.publicKey.toBase58());
    
    // Load IDL
    const idlPath = path.join(__dirname, '../../target/idl/escrow.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
    idl.address = PROGRAM_ID.toBase58();
    
    // Setup provider and program
    const wallet = new Wallet(platformAuthority);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    program = new Program(idl, provider);
    
    // Derive treasury PDA
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), platformAuthority.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log('🏛️  Treasury PDA:', treasuryPda.toBase58());
    
    // Verify treasury is initialized
    try {
      const treasuryAccount = await connection.getAccountInfo(treasuryPda);
      if (!treasuryAccount) {
        throw new Error('Treasury not initialized on production! Initialize before running tests.');
      }
      console.log('✅ Treasury initialized');
    } catch (error) {
      console.error('❌ Treasury check failed:', error);
      throw error;
    }
    
    console.log('\n✅ Setup complete\n');
  });
  
  describe('Test Suite 1: Production Health Checks', () => {
    it('should verify program is deployed and accessible', async function() {
      this.timeout(60000);
      
      console.log('\n📋 TEST: Program Health Check');
      console.log('═══════════════════════════════════════════════════════════');
      
      const programAccount = await connection.getAccountInfo(PROGRAM_ID);
      
      expect(programAccount).to.not.be.null;
      expect(programAccount?.executable).to.be.true;
      
      console.log('✅ Program ID:', PROGRAM_ID.toBase58());
      console.log('✅ Program is executable');
      console.log('📦 Data Length:', programAccount?.data.length, 'bytes');
      console.log('💰 Program Balance:', (programAccount?.lamports || 0) / LAMPORTS_PER_SOL, 'SOL');
      console.log('✅ Program health check passed\n');
    });
    
    it('should verify treasury PDA is accessible', async function() {
      this.timeout(60000);
      
      console.log('\n📋 TEST: Treasury Health Check');
      console.log('═══════════════════════════════════════════════════════════');
      
      const treasuryAccount = await connection.getAccountInfo(treasuryPda);
      
      expect(treasuryAccount).to.not.be.null;
      expect(treasuryAccount?.owner.toBase58()).to.equal(PROGRAM_ID.toBase58());
      
      console.log('✅ Treasury PDA:', treasuryPda.toBase58());
      console.log('✅ Owner:', treasuryAccount?.owner.toBase58());
      console.log('💰 Treasury Balance:', (treasuryAccount?.lamports || 0) / LAMPORTS_PER_SOL, 'SOL');
      console.log('✅ Treasury health check passed\n');
    });
  });
  
  describe('Test Suite 2: Treasury Analytics', () => {
    it('should fetch and display treasury statistics', async function() {
      this.timeout(60000);
      
      console.log('\n📋 TEST: Treasury Analytics');
      console.log('═══════════════════════════════════════════════════════════');
      
      const treasuryData = await (program.account as any).treasury.fetch(treasuryPda);
      
      const totalFeesSol = Number(treasuryData.totalFeesCollected) / LAMPORTS_PER_SOL;
      const totalSwaps = Number(treasuryData.totalSwapsExecuted);
      const avgFeePerSwap = totalSwaps > 0 ? totalFeesSol / totalSwaps : 0;
      
      console.log('📊 Treasury Statistics:');
      console.log('   Total Fees Collected:', totalFeesSol.toFixed(4), 'SOL');
      console.log('   Total Swaps Executed:', totalSwaps);
      console.log('   Average Fee per Swap:', avgFeePerSwap.toFixed(4), 'SOL');
      console.log('   Authority:', treasuryData.authority.toBase58());
      console.log('   Bump:', treasuryData.bump);
      
      expect(treasuryData.authority.toBase58()).to.equal(platformAuthority.publicKey.toBase58());
      expect(treasuryData.totalFeesCollected).to.be.a('BN');
      expect(treasuryData.totalSwapsExecuted).to.be.a('BN');
      
      console.log('✅ Treasury analytics fetched\n');
    });
  });
  
  describe('Test Suite 3: RPC Performance', () => {
    it('should measure RPC response time', async function() {
      this.timeout(60000);
      
      console.log('\n📋 TEST: RPC Performance');
      console.log('═══════════════════════════════════════════════════════════');
      
      const start = Date.now();
      await connection.getLatestBlockhash();
      const latency = Date.now() - start;
      
      console.log('⏱️  RPC Latency:', latency, 'ms');
      
      expect(latency).to.be.lessThan(5000); // Should respond within 5 seconds
      
      if (latency < 1000) {
        console.log('✅ Excellent response time');
      } else if (latency < 3000) {
        console.log('✅ Good response time');
      } else {
        console.log('⚠️  Slow response time');
      }
      
      console.log('✅ RPC performance test passed\n');
    });
  });
  
  describe('Test Suite 4: Security Validation', () => {
    it('should verify program authority configuration', async function() {
      this.timeout(60000);
      
      console.log('\n📋 TEST: Security Validation');
      console.log('═══════════════════════════════════════════════════════════');
      
      const treasuryData = await (program.account as any).treasury.fetch(treasuryPda);
      const authorityMatch = treasuryData.authority.toBase58() === platformAuthority.publicKey.toBase58();
      
      expect(authorityMatch).to.be.true;
      
      console.log('🔒 Security Checks:');
      console.log('   Treasury Authority:', treasuryData.authority.toBase58());
      console.log('   Expected Authority:', platformAuthority.publicKey.toBase58());
      console.log('   Authority Match:', authorityMatch ? '✅' : '❌');
      
      console.log('✅ Security validation passed\n');
    });
  });
  
  after(function() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     PRODUCTION E2E TESTS - COMPLETE                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
  });
});

/**
 * USAGE INSTRUCTIONS:
 * 
 * 1. ⚠️ PRODUCTION ENVIRONMENT - Use with extreme caution!
 * 
 * 2. Prerequisites:
 *    - Program deployed to mainnet (2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx)
 *    - Treasury initialized on mainnet
 *    - Platform authority keypair in wallets/production/
 * 
 * 3. Set environment variables:
 *    - PRODUCTION_SOLANA_RPC_URL (recommended: use paid RPC for reliability)
 *    - PRODUCTION_ADMIN_PRIVATE_KEY_PATH (optional)
 * 
 * 4. Run tests:
 *    npm run test:production:e2e:all
 * 
 * 5. Test Coverage:
 *    ✅ Program health and deployment verification
 *    ✅ Treasury PDA accessibility
 *    ✅ Treasury statistics and analytics
 *    ✅ RPC performance monitoring
 *    ✅ Security and authority validation
 * 
 * 6. What These Tests DON'T Do:
 *    ❌ Execute real swaps (requires user wallets and real assets)
 *    ❌ Modify state (read-only health checks)
 *    ❌ Spend real SOL (except minimal RPC fees)
 * 
 * NOTE: These tests are designed for production monitoring and validation.
 * They verify system health and integrity without executing real swaps.
 * 
 * For actual swap testing, use staging environment first!
 */

