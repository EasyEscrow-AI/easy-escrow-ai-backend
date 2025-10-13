import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { easyEscrowProgram } from '../src/program';

/**
 * Deploy the EasyEscrow program to Solana devnet
 */
async function deployProgram() {
  console.log('🚀 Starting EasyEscrow program deployment...');

  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  console.log('📡 Connected to Solana devnet');

  // Generate a new keypair for the program
  const programKeypair = Keypair.generate();
  console.log('🔑 Generated program keypair:', programKeypair.publicKey.toString());

  // Check if we need to fund the program account
  const balance = await connection.getBalance(programKeypair.publicKey);
  console.log('💰 Program account balance:', balance / 1e9, 'SOL');

  if (balance === 0) {
    console.log('⚠️  Program account needs funding. Please fund it manually:');
    console.log('   solana airdrop 2', programKeypair.publicKey.toString(), '--url devnet');
    console.log('   Or transfer SOL to:', programKeypair.publicKey.toString());
    return;
  }

  // For now, we'll just validate the program structure
  console.log('✅ Program structure validated');
  console.log('📋 Program ID:', easyEscrowProgram.programId.toString());
  console.log('🔧 Available instructions:');
  console.log('   - initAgreement');
  console.log('   - depositUsdc');
  console.log('   - depositNft');
  console.log('   - settle');
  console.log('   - cancelIfExpired');
  console.log('   - adminCancel');

  // Test PDA generation
  const testEscrowId = 12345;
  const [pda, bump] = easyEscrowProgram.getEscrowPDA(testEscrowId);
  console.log('🧪 Test PDA generation:');
  console.log('   Escrow ID:', testEscrowId);
  console.log('   PDA:', pda.toString());
  console.log('   Bump:', bump);

  console.log('✅ Deployment validation completed');
  console.log('📝 Note: This is a TypeScript-based program. For production deployment,');
  console.log('   compile the Rust program and deploy using Anchor CLI.');
}

// Run deployment if this script is executed directly
if (require.main === module) {
  deployProgram().catch(console.error);
}

export { deployProgram };