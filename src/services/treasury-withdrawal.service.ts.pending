/**
 * Treasury Withdrawal Service
 * 
 * Handles weekly withdrawals from Treasury PDA to backend treasury wallet.
 * Runs every Sunday at 23:59 UTC.
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { config, getProgramConfig } from '../config';
import { getEscrowIdl } from '../utils/idl-loader';
import fs from 'fs';
import path from 'path';
import { Escrow } from '../generated/anchor/escrow';

export interface TreasuryWithdrawalConfig {
  /** Minimum balance to keep in Treasury PDA (for rent-exemption + buffer) */
  minBalance?: bigint;
  /** Whether to run in dry-run mode (no actual transactions) */
  dryRun?: boolean;
}

export class TreasuryWithdrawalService {
  private connection: Connection;
  private programConfig: ReturnType<typeof getProgramConfig>;

  constructor() {
    this.connection = new Connection(
      config.solana.rpcUrl,
      { commitment: 'confirmed' }
    );
    this.programConfig = getProgramConfig();
    
    console.log('[TreasuryWithdrawalService] Initialized');
    console.log(`  Network: ${this.programConfig.network}`);
    console.log(`  Treasury Address: ${this.programConfig.treasuryAddressString}`);
  }

  /**
   * Check if it's time for weekly withdrawal (Sunday 23:59 UTC)
   */
  isWithdrawalTime(): boolean {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    
    // Sunday (0) at 23:59 UTC
    const isRightDay = dayOfWeek === 0;
    const isRightTime = hour === 23 && minute === 59;
    
    return isRightDay && isRightTime;
  }

  /**
   * Get Treasury PDA address
   */
  async getTreasuryPda(): Promise<PublicKey> {
    const authorityPath = this.programConfig.authorityKeypairPath;
    if (!authorityPath) {
      throw new Error('Platform authority keypair path not configured');
    }

    const authoritySecret = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
    const authority = Keypair.fromSecretKey(new Uint8Array(authoritySecret));

    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), authority.publicKey.toBuffer()],
      this.programConfig.programId
    );

    return treasuryPda;
  }

  /**
   * Get Treasury PDA account data
   */
  async getTreasuryData(): Promise<{
    balance: bigint;
    totalFeesCollected: bigint;
    totalFeesWithdrawn: bigint;
    totalSwapsExecuted: bigint;
    isPaused: boolean;
    lastWithdrawalAt: Date | null;
  }> {
    const authorityPath = this.programConfig.authorityKeypairPath;
    if (!authorityPath) {
      throw new Error('Platform authority keypair path not configured');
    }

    const authoritySecret = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
    const authority = Keypair.fromSecretKey(new Uint8Array(authoritySecret));

    const wallet = new Wallet(authority);
    const provider = new AnchorProvider(this.connection, wallet, { commitment: 'confirmed' });
    const idl = getEscrowIdl(this.programConfig.network);
    const program = new Program<Escrow>(idl as any, provider);

    const treasuryPda = await this.getTreasuryPda();
    const treasuryAccount = await program.account.treasury.fetch(treasuryPda);
    const balance = await this.connection.getBalance(treasuryPda);

    return {
      balance: BigInt(balance),
      totalFeesCollected: BigInt(treasuryAccount.totalFeesCollected.toString()),
      totalFeesWithdrawn: BigInt(treasuryAccount.totalFeesWithdrawn.toString()),
      totalSwapsExecuted: BigInt(treasuryAccount.totalSwapsExecuted.toString()),
      isPaused: treasuryAccount.isPaused,
      lastWithdrawalAt: treasuryAccount.lastWithdrawalAt.toNumber() > 0
        ? new Date(treasuryAccount.lastWithdrawalAt.toNumber() * 1000)
        : null,
    };
  }

  /**
   * Execute weekly withdrawal from Treasury PDA to treasury wallet
   */
  async executeWeeklyWithdrawal(
    withdrawalConfig?: TreasuryWithdrawalConfig
  ): Promise<{
    success: boolean;
    txId?: string;
    amountWithdrawn?: bigint;
    error?: string;
  }> {
    const dryRun = withdrawalConfig?.dryRun || false;
    const minBalanceBuffer = withdrawalConfig?.minBalance || BigInt(10 * LAMPORTS_PER_SOL);

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('📅 WEEKLY TREASURY WITHDRAWAL - Sunday 23:59 UTC');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      // Load platform authority
      const authorityPath = this.programConfig.authorityKeypairPath;
      if (!authorityPath) {
        throw new Error('Platform authority keypair path not configured');
      }

      const authoritySecret = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
      const authority = Keypair.fromSecretKey(new Uint8Array(authoritySecret));

      console.log(`🔑 Platform Authority: ${authority.publicKey.toBase58()}`);

      // Setup program
      const wallet = new Wallet(authority);
      const provider = new AnchorProvider(this.connection, wallet, { commitment: 'confirmed' });
      const idl = getEscrowIdl(this.programConfig.network);
      const program = new Program<Escrow>(idl as any, provider);

      // Get Treasury PDA
      const treasuryPda = await this.getTreasuryPda();
      console.log(`🏛️  Treasury PDA: ${treasuryPda.toBase58()}`);

      // Get treasury data
      const treasuryData = await this.getTreasuryData();
      console.log(`\n💰 Treasury Status:`);
      console.log(`  Total Fees Collected: ${Number(treasuryData.totalFeesCollected) / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Total Fees Withdrawn: ${Number(treasuryData.totalFeesWithdrawn) / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Current Balance: ${Number(treasuryData.balance) / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Total Swaps: ${treasuryData.totalSwapsExecuted}`);
      console.log(`  Paused: ${treasuryData.isPaused ? '🚨 YES' : '✅ NO'}`);
      console.log(`  Last Withdrawal: ${treasuryData.lastWithdrawalAt?.toISOString() || 'Never'}`);

      // Check if paused
      if (treasuryData.isPaused) {
        console.log('\n🚨 Treasury is PAUSED - withdrawal blocked');
        return {
          success: false,
          error: 'Treasury is paused',
        };
      }

      // Calculate withdrawable amount
      const rentExempt = await this.connection.getMinimumBalanceForRentExemption(105); // Treasury::LEN
      const minimumBalance = BigInt(rentExempt) + minBalanceBuffer;
      const availableForWithdrawal = treasuryData.balance - minimumBalance;

      console.log(`\n📊 Withdrawal Calculation:`);
      console.log(`  Rent Exempt: ${rentExempt / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Buffer: ${Number(minBalanceBuffer) / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Minimum to Keep: ${Number(minimumBalance) / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Available to Withdraw: ${Number(availableForWithdrawal) / LAMPORTS_PER_SOL} SOL`);

      // Check if there's anything to withdraw
      if (availableForWithdrawal <= 0) {
        console.log('\n⚠️  No funds available for withdrawal');
        return {
          success: false,
          error: 'Insufficient balance for withdrawal',
        };
      }

      // Treasury wallet address
      const treasuryWallet = this.programConfig.treasuryAddress;
      console.log(`\n🎯 Destination: ${treasuryWallet.toBase58()}`);

      if (dryRun) {
        console.log('\n🧪 DRY RUN MODE - No transaction will be sent');
        console.log(`Would withdraw ${Number(availableForWithdrawal) / LAMPORTS_PER_SOL} SOL`);
        return {
          success: true,
          amountWithdrawn: availableForWithdrawal,
        };
      }

      // Execute withdrawal
      console.log('\n📤 Executing withdrawal transaction...');
      
      const tx = await program.methods
        .withdrawTreasuryFees(availableForWithdrawal)
        .accounts({
          authority: authority.publicKey,
          treasury: treasuryPda,
          treasuryWallet: treasuryWallet,
          systemProgram: PublicKey.default,
        })
        .rpc();

      console.log(`\n✅ Withdrawal successful!`);
      console.log(`  Transaction: ${tx}`);
      console.log(`  Amount: ${Number(availableForWithdrawal) / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Destination: ${treasuryWallet.toBase58()}`);

      return {
        success: true,
        txId: tx,
        amountWithdrawn: availableForWithdrawal,
      };
    } catch (error: any) {
      console.error('\n❌ Weekly withdrawal failed:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Emergency pause operations
   */
  async emergencyPause(): Promise<{ success: boolean; txId?: string; error?: string }> {
    console.log('\n🚨 EXECUTING EMERGENCY PAUSE');
    
    try {
      const authorityPath = this.programConfig.authorityKeypairPath;
      if (!authorityPath) {
        throw new Error('Platform authority keypair path not configured');
      }

      const authoritySecret = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
      const authority = Keypair.fromSecretKey(new Uint8Array(authoritySecret));

      const wallet = new Wallet(authority);
      const provider = new AnchorProvider(this.connection, wallet, { commitment: 'confirmed' });
      const idl = getEscrowIdl(this.programConfig.network);
      const program = new Program<Escrow>(idl as any, provider);

      const treasuryPda = await this.getTreasuryPda();

      const tx = await program.methods
        .emergencyPause()
        .accounts({
          authority: authority.publicKey,
          treasury: treasuryPda,
        })
        .rpc();

      console.log('✅ Emergency pause activated');
      console.log(`  Transaction: ${tx}`);

      return { success: true, txId: tx };
    } catch (error: any) {
      console.error('❌ Emergency pause failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Resume operations
   */
  async unpause(): Promise<{ success: boolean; txId?: string; error?: string }> {
    console.log('\n✅ RESUMING OPERATIONS');
    
    try {
      const authorityPath = this.programConfig.authorityKeypairPath;
      if (!authorityPath) {
        throw new Error('Platform authority keypair path not configured');
      }

      const authoritySecret = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
      const authority = Keypair.fromSecretKey(new Uint8Array(authoritySecret));

      const wallet = new Wallet(authority);
      const provider = new AnchorProvider(this.connection, wallet, { commitment: 'confirmed' });
      const idl = getEscrowIdl(this.programConfig.network);
      const program = new Program<Escrow>(idl as any, provider);

      const treasuryPda = await this.getTreasuryPda();

      const tx = await program.methods
        .unpause()
        .accounts({
          authority: authority.publicKey,
          treasury: treasuryPda,
        })
        .rpc();

      console.log('✅ Operations resumed');
      console.log(`  Transaction: ${tx}`);

      return { success: true, txId: tx };
    } catch (error: any) {
      console.error('❌ Unpause failed:', error);
      return { success: false, error: error.message };
    }
  }
}

