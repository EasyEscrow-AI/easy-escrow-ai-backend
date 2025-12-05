/**
 * Derive Production Treasury PDA Address
 * 
 * This script derives the Treasury Program Derived Address (PDA) for the
 * production mainnet deployment using the production program ID and
 * treasury authority public key.
 */

import { PublicKey } from '@solana/web3.js';

// Production configuration
const PRODUCTION_PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';
const PRODUCTION_TREASURY_AUTHORITY = 'HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF';

// Treasury seed prefix (must match Rust program: b"main_treasury")
const TREASURY_SEED_PREFIX = Buffer.from('main_treasury');

async function deriveTreasuryPDA() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Production Treasury PDA Derivation                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Convert strings to PublicKey objects
    const programId = new PublicKey(PRODUCTION_PROGRAM_ID);
    const authority = new PublicKey(PRODUCTION_TREASURY_AUTHORITY);

    console.log('📋 Input Parameters:');
    console.log(`   Program ID: ${programId.toBase58()}`);
    console.log(`   Authority:  ${authority.toBase58()}`);
    console.log(`   Seed:       "main_treasury"\n`);

    // Derive the Treasury PDA
    const [treasuryPDA, bump] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED_PREFIX, authority.toBuffer()],
      programId
    );

    console.log('✅ Treasury PDA Derived Successfully!\n');
    console.log('📦 Results:');
    console.log(`   Treasury PDA: ${treasuryPDA.toBase58()}`);
    console.log(`   Bump Seed:    ${bump}\n`);

    // Output for documentation
    console.log('📝 For Production Environment Variables:');
    console.log(`   MAINNET_TREASURY_PDA=${treasuryPDA.toBase58()}`);
    console.log(`   MAINNET_TREASURY_AUTHORITY=${authority.toBase58()}`);
    console.log(`   MAINNET_TREASURY_BUMP=${bump}\n`);

    // Output for scripts
    console.log('🔧 For Scripts/CLI:');
    console.log(`   export TREASURY_PDA="${treasuryPDA.toBase58()}"`);
    console.log(`   export TREASURY_AUTHORITY="${authority.toBase58()}"`);
    console.log(`   export TREASURY_BUMP="${bump}"\n`);

    // Verification command
    console.log('🔍 Verification Commands:');
    console.log(`   # Check if Treasury PDA exists on mainnet:`);
    console.log(`   solana account ${treasuryPDA.toBase58()} --url mainnet-beta\n`);
    console.log(`   # Check balance:`);
    console.log(`   solana balance ${treasuryPDA.toBase58()} --url mainnet-beta\n`);

    return {
      treasuryPDA: treasuryPDA.toBase58(),
      authority: authority.toBase58(),
      bump,
      programId: programId.toBase58(),
    };

  } catch (error) {
    console.error('❌ Error deriving Treasury PDA:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  deriveTreasuryPDA()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { deriveTreasuryPDA };

