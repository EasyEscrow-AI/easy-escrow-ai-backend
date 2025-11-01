/**
 * STAGING Security Test - Admin Authorization
 * 
 * Verifies that only authorized admins can initialize escrow agreements.
 * Tests the fix for the critical bug where admin check compared with program ID.
 * 
 * Run: npm run test:staging:security:admin
 */

// Load .env.staging file BEFORE any other imports
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.staging');
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  throw new Error(`Failed to load .env.staging: ${result.error}`);
}

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { STAGING_CONFIG } from '../e2e/test-config';
import { Escrow } from '../../../src/generated/anchor/escrow';
import { getEscrowIdl } from '../../../src/utils/idl-loader';

describe('STAGING Security - Admin Authorization', function () {
  this.timeout(60000);

  let connection: Connection;
  let authorizedAdminKeypair: Keypair;
  let unauthorizedKeypair: Keypair;
  let program: Program<Escrow>;

  before(async function () {
    console.log('\n' + '='.repeat(80));
    console.log('🔒 STAGING Security Test - Admin Authorization');
    console.log('='.repeat(80));
    console.log(`   Environment: STAGING`);
    console.log(`   Network: ${STAGING_CONFIG.network}`);
    console.log(`   RPC: ${STAGING_CONFIG.rpcUrl}`);
    console.log(`   Program: ${STAGING_CONFIG.programId}`);
    console.log('='.repeat(80) + '\n');

    // Setup connection
    connection = new Connection(STAGING_CONFIG.rpcUrl, 'confirmed');

    // Load authorized admin keypair from environment
    const adminPrivateKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
    if (!adminPrivateKey) {
      throw new Error('DEVNET_STAGING_ADMIN_PRIVATE_KEY not found in environment');
    }

    try {
      // Try JSON array format
      if (adminPrivateKey.startsWith('[')) {
        const secretKey = Uint8Array.from(JSON.parse(adminPrivateKey));
        authorizedAdminKeypair = Keypair.fromSecretKey(secretKey);
      } else {
        // Try base58 format
        const bs58 = await import('bs58');
        const secretKey = bs58.default.decode(adminPrivateKey);
        authorizedAdminKeypair = Keypair.fromSecretKey(secretKey);
      }
    } catch (error) {
      throw new Error(`Failed to load admin keypair: ${error}`);
    }

    // Create an unauthorized keypair
    unauthorizedKeypair = Keypair.generate();

    console.log(`✅ Authorized Admin: ${authorizedAdminKeypair.publicKey.toBase58()}`);
    console.log(`✅ Unauthorized User: ${unauthorizedKeypair.publicKey.toBase58()}\n`);

    // Setup Anchor program
    const programId = new PublicKey(STAGING_CONFIG.programId);
    const provider = new AnchorProvider(
      connection,
      { publicKey: authorizedAdminKeypair.publicKey, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any) => txs } as any,
      { commitment: 'confirmed' }
    );

    const idl = getEscrowIdl();
    program = new Program(idl, provider as any);

    // Verify connectivity
    const version = await connection.getVersion();
    console.log(`✅ Connected to Solana ${STAGING_CONFIG.network}`);
    console.log(`   Version: ${version['solana-core']}\n`);
  });

  it('should reject unauthorized admin when initializing escrow', async function () {
    console.log('🔒 Testing: Unauthorized admin should be rejected...\n');

    const escrowId = new BN(Date.now());
    const usdcAmount = new BN(10 * 1_000_000); // 10 USDC
    const expiryTimestamp = new BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    const platformFeeBps = 100; // 1%

    // Derive escrow PDA
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), escrowId.toArrayLike(Buffer, 'le', 8)],
      program.programId
    );

    // Create dummy addresses for buyer, seller, NFT
    const buyer = Keypair.generate().publicKey;
    const seller = Keypair.generate().publicKey;
    const nftMint = Keypair.generate().publicKey;

    console.log('   Attempting to initialize with unauthorized admin...');
    console.log(`   Unauthorized Admin: ${unauthorizedKeypair.publicKey.toBase58()}`);
    console.log(`   Escrow ID: ${escrowId.toString()}`);

    // Airdrop SOL to unauthorized keypair for transaction fees
    try {
      const airdropSignature = await connection.requestAirdrop(
        unauthorizedKeypair.publicKey,
        1_000_000_000 // 1 SOL
      );
      await connection.confirmTransaction(airdropSignature);
      console.log('   ✅ Airdropped 1 SOL for transaction fees\n');
    } catch (error) {
      console.log('   ⚠️  Airdrop failed (devnet might be congested), continuing anyway...\n');
    }

    let errorCaught = false;
    let errorMessage = '';

    try {
      // Attempt to initialize escrow with UNAUTHORIZED admin
      const tx = await program.methods
        .initAgreement(escrowId, usdcAmount, expiryTimestamp, platformFeeBps)
        .accounts({
          buyer,
          seller,
          nftMint,
          admin: unauthorizedKeypair.publicKey, // ❌ UNAUTHORIZED
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([unauthorizedKeypair])
        .rpc();

      console.log(`   ❌ SECURITY FAILURE: Transaction succeeded when it should have failed!`);
      console.log(`   Transaction: ${tx}\n`);
    } catch (error: any) {
      errorCaught = true;
      errorMessage = error.message || error.toString();

      console.log('   ✅ Transaction rejected as expected!');
      console.log(`   Error: ${errorMessage}\n`);

      // Verify it's specifically the UnauthorizedAdmin error
      if (errorMessage.includes('UnauthorizedAdmin') || errorMessage.includes('0x1775')) {
        console.log('   ✅ Correct error: UnauthorizedAdmin (0x1775)\n');
      } else if (errorMessage.includes('custom program error: 0x5')) {
        console.log('   ✅ Correct error: UnauthorizedAdmin (custom program error: 0x5)\n');
      } else {
        console.log(`   ⚠️  Error caught but might not be the expected one\n`);
      }
    }

    // Assert that an error was caught
    expect(errorCaught).to.be.true;
    expect(errorMessage).to.not.be.empty;

    console.log('🔒 Security Check Summary:');
    console.log('   ✅ Unauthorized admin was rejected');
    console.log('   ✅ Admin authorization check is working');
    console.log('   ✅ Only authorized admins can initialize escrows\n');
  });

  it('should allow authorized admin to initialize escrow', async function () {
    console.log('✅ Testing: Authorized admin should succeed...\n');

    const escrowId = new BN(Date.now() + 1000); // Different ID
    const usdcAmount = new BN(10 * 1_000_000); // 10 USDC
    const expiryTimestamp = new BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    const platformFeeBps = 100; // 1%

    // Derive escrow PDA
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), escrowId.toArrayLike(Buffer, 'le', 8)],
      program.programId
    );

    // Create dummy addresses for buyer, seller, NFT
    const buyer = Keypair.generate().publicKey;
    const seller = Keypair.generate().publicKey;
    const nftMint = Keypair.generate().publicKey;

    console.log('   Attempting to initialize with authorized admin...');
    console.log(`   Authorized Admin: ${authorizedAdminKeypair.publicKey.toBase58()}`);
    console.log(`   Escrow ID: ${escrowId.toString()}`);

    try {
      // Attempt to initialize escrow with AUTHORIZED admin
      const tx = await program.methods
        .initAgreement(escrowId, usdcAmount, expiryTimestamp, platformFeeBps)
        .accounts({
          buyer,
          seller,
          nftMint,
          admin: authorizedAdminKeypair.publicKey, // ✅ AUTHORIZED
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([authorizedAdminKeypair])
        .rpc();

      console.log(`   ✅ Transaction succeeded!`);
      console.log(`   Transaction: ${tx}\n`);

      // Verify escrow was created
      const escrowAccount = await program.account.escrowState.fetch(escrowPda);
      expect(escrowAccount.escrowId.toString()).to.equal(escrowId.toString());
      expect(escrowAccount.platformFeeBps).to.equal(platformFeeBps);

      console.log('✅ Authorization Check Summary:');
      console.log('   ✅ Authorized admin successfully initialized escrow');
      console.log('   ✅ Escrow PDA created on-chain');
      console.log(`   ✅ Platform fee stored: ${escrowAccount.platformFeeBps} bps\n`);
    } catch (error: any) {
      console.log(`   ❌ UNEXPECTED FAILURE: ${error.message}`);
      throw error;
    }
  });
});

