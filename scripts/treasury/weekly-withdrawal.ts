/**
 * Weekly Treasury Withdrawal Script
 * 
 * Withdraws accumulated fees from Treasury PDA to backend treasury wallet.
 * Intended to run every Sunday at 23:59 UTC via cron job.
 * 
 * Usage:
 *   npm run treasury:withdraw              # Execute withdrawal
 *   npm run treasury:withdraw -- --dry-run # Preview without executing
 *   npm run treasury:withdraw -- --force   # Force withdrawal regardless of timing
 *   npm run treasury:status                # Check treasury status
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram} from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import config from '../../src/config';

// Load IDL
const IDL_PATH = path.join(__dirname, '../../src/generated/anchor/escrow-idl-staging.json');
const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));

async function getTreasuryPda(programId: PublicKey, authority: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury_v3'), authority.toBuffer()],
    programId
  );
}

async function getTreasuryData(connection: Connection, treasuryPda: PublicKey) {
  try {
    const accountInfo = await connection.getAccountInfo(treasuryPda);
    if (!accountInfo) {
      console.log('\n⚠️  Treasury PDA not initialized yet');
      console.log('   Run a swap first to initialize the treasury');
      return null;
    }

    const balance = accountInfo.lamports;
    const data = accountInfo.data;
    const accountSize = data.length;
    
    console.log(`\n📏 Treasury Account Size: ${accountSize} bytes`);
    
    // Validate account size and decode based on structure
    // OLD structure: 57 bytes (discriminator + authority + total_fees + total_swaps + bump)
    // NEW structure: 82 bytes (adds total_fees_withdrawn, is_paused, paused_at, last_withdrawal_at)
    
    if (accountSize !== 57 && accountSize !== 82 && accountSize !== 114) {
      console.error(`\n❌ Unexpected treasury account size: ${accountSize} bytes`);
      console.error('   Expected: 57 bytes (v1), 82 bytes (v2), or 114 bytes (v3)');
      return null;
    }
    
    // Common fields (exist in both old and new structures)
    const authority = new PublicKey(data.slice(8, 40));
    const totalFeesCollected = data.readBigUInt64LE(40);
    const totalSwapsExecuted = data.readBigUInt64LE(48);
    
    if (accountSize === 57) {
      // OLD STRUCTURE (57 bytes) - missing withdrawal and pause features
      const bump = data.readUInt8(56);
      
      console.log('⚠️  Treasury is using OLD structure (57 bytes)');
      console.log('   Missing: withdrawal tracking and pause features');
      console.log('   Basic withdrawal still works, but timing checks are disabled');
      
      return {
        authority,
        totalFeesCollected,
        totalSwapsExecuted,
        totalFeesWithdrawn: BigInt(0), // Not available in old structure
        isPaused: false, // Not available in old structure
        pausedAt: null,
        lastWithdrawalAt: null,
        balance: BigInt(balance),
        bump,
        isOldStructure: true,
        accountSize,
      };
    } else if (accountSize === 82) {
      // V2 STRUCTURE (82 bytes) - withdrawal tracking and pause
      const totalFeesWithdrawn = data.readBigUInt64LE(56);
      const isPaused = data.readUInt8(64) === 1;
      const pausedAtTimestamp = data.readBigInt64LE(65);
      const lastWithdrawalTimestamp = data.readBigInt64LE(73);
      const bump = data.readUInt8(81);
      
      console.log('⚠️  Treasury is using V2 structure (82 bytes)');
      console.log('   Missing: locked withdrawal wallet security');
      
      return {
        authority,
        totalFeesCollected,
        totalSwapsExecuted,
        totalFeesWithdrawn,
        isPaused,
        pausedAt: Number(pausedAtTimestamp) > 0 ? new Date(Number(pausedAtTimestamp) * 1000) : null,
        lastWithdrawalAt: Number(lastWithdrawalTimestamp) > 0 ? new Date(Number(lastWithdrawalTimestamp) * 1000) : null,
        balance: BigInt(balance),
        bump,
        isOldStructure: false,
        accountSize,
      };
    } else {
      // V3 STRUCTURE (114 bytes) - full feature set with locked withdrawals
      const totalFeesWithdrawn = data.readBigUInt64LE(56);
      const isPaused = data.readUInt8(64) === 1;
      const pausedAtTimestamp = data.readBigInt64LE(65);
      const lastWithdrawalTimestamp = data.readBigInt64LE(73);
      const authorizedWithdrawalWallet = new PublicKey(data.slice(81, 113));
      const bump = data.readUInt8(113);
      
      console.log('✅ Treasury is using V3 structure (114 bytes - SECURE)');
      console.log(`   Locked withdrawal wallet: ${authorizedWithdrawalWallet.toBase58()}`);
      
      return {
        authority,
        totalFeesCollected,
        totalSwapsExecuted,
        totalFeesWithdrawn,
        isPaused,
        pausedAt: Number(pausedAtTimestamp) > 0 ? new Date(Number(pausedAtTimestamp) * 1000) : null,
        lastWithdrawalAt: Number(lastWithdrawalTimestamp) > 0 ? new Date(Number(lastWithdrawalTimestamp) * 1000) : null,
        balance: BigInt(balance),
        bump,
        isOldStructure: false,
        accountSize,
        authorizedWithdrawalWallet,
      };
    }
  } catch (error: any) {
    console.error(`Error fetching treasury data: ${error.message}`);
    return null;
  }
}

function isWithdrawalTime(): boolean {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  
  // Sunday (0) at 23:59 UTC
  return dayOfWeek === 0 && hours === 23 && minutes === 59;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const checkStatus = args.includes('--status');
  const force = args.includes('--force');

  // Setup connection
  const connection = new Connection(config.solana.rpcUrl, 'confirmed');
  
  // Load admin keypair (use Solana CLI default for staging backend)
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const ADMIN_KEYPAIR_PATH = path.join(homeDir, '.config', 'solana', 'id.json');
  const adminKeypairData = JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, 'utf-8'));
  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminKeypairData));
  
  const programId = new PublicKey(config.solana.escrowProgramId);

  // Setup provider and program
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new anchor.Program(idl, provider);

  // Get treasury PDA
  const [treasuryPda, bump] = await getTreasuryPda(programId, adminKeypair.publicKey);
  
  console.log('\n🏦 TREASURY INFORMATION');
  console.log(`Program ID: ${programId.toBase58()}`);
  console.log(`Treasury PDA: ${treasuryPda.toBase58()}`);
  console.log(`Authority: ${adminKeypair.publicKey.toBase58()}`);
  
  // Get treasury data
  const treasuryData = await getTreasuryData(connection, treasuryPda);
  
  if (!treasuryData) {
    process.exit(1);
  }

  if (checkStatus) {
    console.log('\n📊 TREASURY STATUS\n');
    
    // Use correct rent calculation based on actual account size
    const accountSize = treasuryData.accountSize;
    const rent = await connection.getMinimumBalanceForRentExemption(accountSize);
    const availableBalance = Number(treasuryData.balance) - rent;
    const pendingWithdrawal = Number(treasuryData.totalFeesCollected) - Number(treasuryData.totalFeesWithdrawn);
    
    console.log(`Total Balance: ${Number(treasuryData.balance) / LAMPORTS_PER_SOL} SOL`);
    console.log(`Rent Reserve: ${rent / LAMPORTS_PER_SOL} SOL (${accountSize} bytes)`);
    console.log(`Available: ${availableBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`\nTotal Fees Collected: ${Number(treasuryData.totalFeesCollected) / LAMPORTS_PER_SOL} SOL`);
    console.log(`Total Fees Withdrawn: ${Number(treasuryData.totalFeesWithdrawn) / LAMPORTS_PER_SOL} SOL`);
    console.log(`Pending Withdrawal: ${pendingWithdrawal / LAMPORTS_PER_SOL} SOL`);
    console.log(`\nTotal Swaps Executed: ${treasuryData.totalSwapsExecuted}`);
    console.log(`Status: ${treasuryData.isPaused ? '🚨 PAUSED' : '✅ ACTIVE'}`);
    console.log(`Last Withdrawal: ${treasuryData.lastWithdrawalAt?.toISOString() || 'Never'}`);
    
    if (treasuryData.lastWithdrawalAt) {
      const daysSince = (Date.now() - treasuryData.lastWithdrawalAt.getTime()) / (1000 * 60 * 60 * 24);
      console.log(`Days Since Last: ${daysSince.toFixed(1)}`);
      const canWithdraw = daysSince >= 7;
      console.log(`Can Withdraw: ${canWithdraw ? '✅ YES' : '❌ NO (wait 7 days)'}`);
    } else {
      console.log(`Can Withdraw: ✅ YES (first withdrawal)`);
    }
    
    return;
  }

  // Check if it's the right time for withdrawal
  const isTime = isWithdrawalTime();
  const now = new Date();
  
  console.log(`\n🕐 WITHDRAWAL TIMING`);
  console.log(`Current Time: ${now.toISOString()}`);
  console.log(`Day of Week: ${now.toUTCString().split(',')[0]}`);
  console.log(`Is Withdrawal Time (Sunday 23:59 UTC): ${isTime ? '✅ YES' : '❌ NO'}`);

  if (!isTime && !force) {
    console.log('\n⚠️  Not withdrawal time. Use --force to override.');
    console.log('   Scheduled: Every Sunday at 23:59 UTC');
    process.exit(0);
  }

  if (force) {
    console.log('\n⚠️  FORCE MODE: Bypassing time check');
  }

  // Calculate withdrawal amount (use correct account size for rent)
  const accountSize = treasuryData.isOldStructure ? 57 : 82;
  const rent = await connection.getMinimumBalanceForRentExemption(accountSize);
  const availableBalance = Number(treasuryData.balance) - rent;
  const MIN_BUFFER = 0.01 * LAMPORTS_PER_SOL; // Keep 0.01 SOL buffer
  const withdrawAmount = Math.max(0, availableBalance - MIN_BUFFER);

  if (withdrawAmount <= 0) {
    console.log('\n⚠️  No funds available for withdrawal');
    console.log(`   Available: ${availableBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Minimum buffer: ${MIN_BUFFER / LAMPORTS_PER_SOL} SOL`);
    process.exit(0);
  }

  console.log(`\n💰 WITHDRAWAL AMOUNT`);
  console.log(`Available Balance: ${availableBalance / LAMPORTS_PER_SOL} SOL`);
  console.log(`Minimum Buffer: ${MIN_BUFFER / LAMPORTS_PER_SOL} SOL`);
  console.log(`Withdrawal Amount: ${withdrawAmount / LAMPORTS_PER_SOL} SOL`);

  // Get treasury wallet address
  const treasuryWalletAddress = config.platform?.treasuryAddress;
  if (!treasuryWalletAddress) {
    throw new Error('Treasury wallet address not configured');
  }
  const treasuryWallet = new PublicKey(treasuryWalletAddress);

  console.log(`\n📤 DESTINATION`);
  console.log(`Treasury Wallet: ${treasuryWallet.toBase58()}`);

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No transaction will be sent');
    console.log(`\nWould withdraw: ${withdrawAmount / LAMPORTS_PER_SOL} SOL`);
    console.log(`From: ${treasuryPda.toBase58()}`);
    console.log(`To: ${treasuryWallet.toBase58()}`);
    process.exit(0);
  }

  // Execute withdrawal
  console.log('\n🚀 Executing withdrawal transaction...\n');
  
  try {
    const tx = await program.methods
      .withdrawTreasuryFees(new anchor.BN(withdrawAmount))
      .accounts({
        authority: adminKeypair.publicKey,
        treasury: treasuryPda,
        treasuryWallet: treasuryWallet,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    console.log('✅ Withdrawal completed successfully!');
    console.log(`\n🔗 Transaction: ${tx}`);
    console.log(`💰 Amount: ${withdrawAmount / LAMPORTS_PER_SOL} SOL`);
    console.log(`\n🌐 Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
    // Verify balance
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for confirmation
    const newBalance = await connection.getBalance(treasuryPda);
    console.log(`\n📊 New Treasury Balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
    
    console.log('\n📝 Next steps:');
    console.log('   1. Verify funds received in treasury wallet');
    console.log('   2. Distribute prizes from treasury wallet');
    console.log('   3. Transfer remaining to cold storage fee collector');
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Withdrawal failed');
    console.error(`Error: ${error.message}`);
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
