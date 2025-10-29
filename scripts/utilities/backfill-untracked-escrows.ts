/**
 * Backfill Untracked Escrows
 * 
 * Scans the blockchain for escrow PDAs created by our program that aren't
 * tracked in the database, and adds them for proper monitoring.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import { PrismaClient, AgreementStatus } from '../../src/generated/prisma';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Decimal } from '@prisma/client/runtime/library';
import idl from '../../target/idl/escrow.json';

// Load environment
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.join(__dirname, `../../.env.${env}`) });

const prisma = new PrismaClient();

interface UntrackeedEscrow {
  escrowPda: string;
  escrowId: string;
  buyer: string;
  seller: string;
  nftMint: string;
  usdcAmount: number;
  expiry: Date;
  nftDeposited: boolean;
  usdcDeposited: boolean;
  status: string;
  onChainStatus: string;
}

async function findUntrackedEscrows(): Promise<UntrackeedEscrow[]> {
  console.log('🔍 Scanning blockchain for untracked escrows...\n');
  console.log('Environment:', env);
  console.log('Program ID:', idl.address);
  
  const rpcUrl = process.env.SOLANA_RPC_URL || process.env.MAINNET_PROD_RPC_URL;
  if (!rpcUrl) {
    throw new Error('SOLANA_RPC_URL not configured');
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const dummyKeypair = Keypair.generate();
  const wallet = new Wallet(dummyKeypair);
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program(idl as any, provider);

  // Get all program accounts (all escrow PDAs)
  console.log('📊 Fetching all escrow accounts from program...');
  const programAccounts = await connection.getProgramAccounts(
    new PublicKey(idl.address),
    {
      filters: [
        {
          dataSize: 8 + 32 + 32 + 32 + 8 + 32 + 1 + 1 + 1 + 8 + 1 + 32, // EscrowState size
        },
      ],
    }
  );

  console.log(`✅ Found ${programAccounts.length} escrow accounts on-chain\n`);

  // Fetch all tracked escrows from database
  console.log('📚 Fetching tracked escrows from database...');
  const trackedEscrows = await prisma.agreement.findMany({
    select: {
      escrowPda: true,
    },
  });

  const trackedPdas = new Set(trackedEscrows.map(e => e.escrowPda).filter(Boolean));
  console.log(`✅ Found ${trackedPdas.size} tracked escrows in database\n`);

  // Find untracked escrows
  const untrackedEscrows: UntrackeedEscrow[] = [];

  console.log('🔬 Analyzing escrows...\n');
  for (const accountInfo of programAccounts) {
    const escrowPda = accountInfo.pubkey.toString();

    // Skip if already tracked
    if (trackedPdas.has(escrowPda)) {
      continue;
    }

    try {
      // Decode escrow account
      const escrowAccount: any = await (program.account as any).escrowState.fetch(
        accountInfo.pubkey
      );

      // Parse status
      let onChainStatus = 'UNKNOWN';
      if (escrowAccount.status) {
        if (escrowAccount.status.pending) onChainStatus = 'PENDING';
        else if (escrowAccount.status.bothDeposited) onChainStatus = 'BOTH_DEPOSITED';
        else if (escrowAccount.status.completed) onChainStatus = 'COMPLETED';
        else if (escrowAccount.status.cancelled) onChainStatus = 'CANCELLED';
      }

      // Parse expiry
      const expiryHex = escrowAccount.expiryTimestamp.toString('hex');
      const expiry = parseInt(expiryHex, 16);
      const expiryDate = new Date(expiry * 1000);

      untrackedEscrows.push({
        escrowPda,
        escrowId: Buffer.from(escrowAccount.escrowId).toString('hex'),
        buyer: escrowAccount.buyer.toString(),
        seller: escrowAccount.seller.toString(),
        nftMint: escrowAccount.nftMint.toString(),
        usdcAmount: escrowAccount.usdcAmount,
        expiry: expiryDate,
        nftDeposited: escrowAccount.sellerNftDeposited,
        usdcDeposited: escrowAccount.buyerUsdcDeposited,
        status: onChainStatus,
        onChainStatus,
      });

      console.log(`❌ UNTRACKED: ${escrowPda}`);
      console.log(`   Status: ${onChainStatus}`);
      console.log(`   Expiry: ${expiryDate.toISOString()}`);
      console.log(`   NFT Deposited: ${escrowAccount.sellerNftDeposited}`);
      console.log(`   USDC Deposited: ${escrowAccount.buyerUsdcDeposited}\n`);

    } catch (error) {
      console.error(`⚠️  Failed to decode escrow ${escrowPda}:`, error);
    }
  }

  console.log(`\n📋 Summary:`);
  console.log(`   Total on-chain: ${programAccounts.length}`);
  console.log(`   Tracked in DB: ${trackedPdas.size}`);
  console.log(`   Untracked: ${untrackedEscrows.length}`);

  return untrackedEscrows;
}

async function backfillEscrow(escrow: UntrackeedEscrow, dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    console.log(`\n[DRY RUN] Would create database entry for ${escrow.escrowPda}`);
    return true;
  }

  try {
    // Generate agreement ID
    const agreementId = `AGR-BACKFILL-${escrow.escrowId.substring(0, 8).toUpperCase()}`;

    // Determine status
    const now = new Date();
    let status: AgreementStatus;
    
    if (escrow.onChainStatus === 'COMPLETED') {
      status = AgreementStatus.SETTLED;
    } else if (escrow.onChainStatus === 'CANCELLED') {
      status = AgreementStatus.CANCELLED;
    } else if (now > escrow.expiry) {
      status = AgreementStatus.EXPIRED;
    } else if (escrow.nftDeposited && escrow.usdcDeposited) {
      status = AgreementStatus.BOTH_LOCKED;
    } else if (escrow.nftDeposited) {
      status = AgreementStatus.NFT_LOCKED;
    } else if (escrow.usdcDeposited) {
      status = AgreementStatus.USDC_LOCKED;
    } else {
      status = AgreementStatus.PENDING;
    }

    // Create database entry
    await prisma.agreement.create({
      data: {
        agreementId,
        escrowPda: escrow.escrowPda,
        nftMint: escrow.nftMint,
        seller: escrow.seller,
        buyer: escrow.buyer,
        price: new Decimal(escrow.usdcAmount / 1_000_000), // Convert from lamports
        feeBps: 100, // Default platform fee
        honorRoyalties: false, // Default
        status,
        expiry: escrow.expiry,
        // Note: We don't have deposit addresses, those would need to be derived
        usdcDepositAddr: null,
        nftDepositAddr: null,
        initTxId: null, // Unknown for backfilled entries
      },
    });

    console.log(`✅ Backfilled: ${escrow.escrowPda}`);
    console.log(`   Agreement ID: ${agreementId}`);
    console.log(`   Status: ${status}`);
    
    return true;

  } catch (error) {
    console.error(`❌ Failed to backfill ${escrow.escrowPda}:`, error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const autoConfirm = args.includes('--yes');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Backfill Untracked Escrows

Scans the blockchain for escrow PDAs that aren't tracked in the database
and optionally adds them for proper monitoring and recovery.

Usage:
  npx ts-node scripts/utilities/backfill-untracked-escrows.ts [OPTIONS]

Options:
  --dry-run       Show what would be backfilled without making changes
  --yes, -y       Skip confirmation prompt
  --help, -h      Show this help message

Environment:
  NODE_ENV=development    Use devnet/staging
  NODE_ENV=production     Use mainnet

Examples:
  # Preview untracked escrows (safe)
  NODE_ENV=production npx ts-node scripts/utilities/backfill-untracked-escrows.ts --dry-run

  # Backfill with confirmation
  NODE_ENV=production npx ts-node scripts/utilities/backfill-untracked-escrows.ts

  # Backfill without confirmation
  NODE_ENV=production npx ts-node scripts/utilities/backfill-untracked-escrows.ts --yes
`);
    process.exit(0);
  }

  console.log('🔧 Backfill Untracked Escrows\n');
  console.log('Environment:', env);
  console.log('Mode:', dryRun ? 'DRY RUN (no changes)' : 'LIVE (will modify database)');
  console.log('='.repeat(80) + '\n');

  try {
    // Find untracked escrows
    const untrackedEscrows = await findUntrackedEscrows();

    if (untrackedEscrows.length === 0) {
      console.log('\n✅ No untracked escrows found! All escrows are being monitored.');
      process.exit(0);
    }

    // Confirm before proceeding
    if (!dryRun && !autoConfirm) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        readline.question(
          `\n⚠️  Found ${untrackedEscrows.length} untracked escrows. Backfill them? (yes/no): `,
          resolve
        );
      });

      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ Backfill cancelled by user');
        process.exit(0);
      }
    }

    // Backfill each untracked escrow
    console.log(`\n📝 Backfilling ${untrackedEscrows.length} escrows...\n`);
    
    let successCount = 0;
    let failCount = 0;

    for (const escrow of untrackedEscrows) {
      const success = await backfillEscrow(escrow, dryRun);
      if (success) successCount++;
      else failCount++;
    }

    console.log(`\n✅ Backfill Complete`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'LIVE (database updated)'}`);

    process.exit(failCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { findUntrackedEscrows, backfillEscrow };

