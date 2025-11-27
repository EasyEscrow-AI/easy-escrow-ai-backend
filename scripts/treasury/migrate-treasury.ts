import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import config from '../../src/config';

// Load IDL
const IDL_PATH = path.join(__dirname, '../../src/generated/anchor/escrow-idl-staging.json');
const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));

async function getTreasuryPda(programId: PublicKey, authority: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('main_treasury'), authority.toBuffer()],
    programId
  );
}

async function main() {
  console.log('\n🔄 TREASURY INITIALIZATION\n');

  // Setup connection
  const connection = new Connection(config.solana.rpcUrl, 'confirmed');

  // Load admin keypair (use Solana CLI default for staging backend)
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const ADMIN_KEYPAIR_PATH = path.join(homeDir, '.config', 'solana', 'id.json');
  const adminKeypairData = JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, 'utf-8'));
  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminKeypairData));

  const programId = new PublicKey(idl.address); // Use IDL address for programId

  console.log(`Admin Authority: ${adminKeypair.publicKey.toBase58()}`);
  console.log(`Program ID: ${programId.toBase58()}`);

  // Get treasury PDA (114-byte structure with locked withdrawals)
  const [treasuryPda, bump] = await getTreasuryPda(programId, adminKeypair.publicKey);
  console.log(`Treasury PDA: ${treasuryPda.toBase58()}\n`);

  // Check existing treasury account
  const treasuryAccount = await connection.getAccountInfo(treasuryPda);

  if (treasuryAccount) {
    console.log('📊 EXISTING TREASURY ACCOUNT');
    console.log(`  Size: ${treasuryAccount.data.length} bytes`);
    console.log(`  Balance: ${treasuryAccount.lamports} lamports`);
    console.log(`  Owner: ${treasuryAccount.owner.toBase58()}\n`);

    if (treasuryAccount.data.length === 114) {
      console.log('✅ Treasury already initialized (114 bytes)');
      
      // Verify authorized wallet matches
      const currentAuthorizedWallet = new PublicKey(treasuryAccount.data.slice(81, 113));
      const treasuryAddressStr = config.platform?.treasuryAddress;
      if (treasuryAddressStr) {
        const authorizedWallet = new PublicKey(treasuryAddressStr);
        if (!currentAuthorizedWallet.equals(authorizedWallet)) {
          console.log(`\n⚠️  Authorized withdrawal wallet mismatch!`);
          console.log(`   On-chain: ${currentAuthorizedWallet.toBase58()}`);
          console.log(`   Configured: ${authorizedWallet.toBase58()}`);
        } else {
          console.log(`✅ Authorized wallet verified: ${authorizedWallet.toBase58()}`);
        }
      }
      process.exit(0);
    } else {
      console.log(`❌ ERROR: Unexpected treasury account size: ${treasuryAccount.data.length} bytes`);
      console.log('   Expected: 114 bytes (current structure)');
      console.log('   This PDA may be from an old deployment.');
      console.log('   Since there are no users, you can use a different PDA or close this one.');
      process.exit(1);
    }
  }

  // Initialize new treasury
  console.log('✅ No existing treasury found. Initializing...\n');

  // Validate authorized withdrawal wallet from config
  const treasuryAddressStr = config.platform?.treasuryAddress;
  if (!treasuryAddressStr || treasuryAddressStr.trim() === '') {
    throw new Error('Treasury address not configured in environment');
  }

  let authorizedWallet: PublicKey;
  try {
    authorizedWallet = new PublicKey(treasuryAddressStr);
  } catch (error) {
    throw new Error(`Invalid treasury address in config: ${treasuryAddressStr}`);
  }

  // Setup provider and program
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new anchor.Program(idl, provider);

  console.log('🚀 Initializing Treasury PDA...');
  console.log(`   Authorized withdrawal wallet: ${authorizedWallet.toBase58()}\n`);

  try {
    const tx = await program.methods
      .initializeTreasury(authorizedWallet)
      .accounts({
        authority: adminKeypair.publicKey,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    console.log('✅ Treasury initialized successfully!');
    console.log(`🔗 Transaction: ${tx}`);
    console.log(`🌐 Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet\n`);

    // Verify new structure
    await new Promise(resolve => setTimeout(resolve, 3000));
    const newAccount = await connection.getAccountInfo(treasuryPda);
    console.log(`✅ Verified - Treasury Size: ${newAccount?.data.length} bytes`);

  } catch (error: any) {
    console.error('❌ Initialization failed:', error.message);
    if (error.logs) {
      console.error('\nProgram Logs:');
      error.logs.forEach((log: string) => console.error(`  ${log}`));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
