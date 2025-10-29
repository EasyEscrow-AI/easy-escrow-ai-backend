/**
 * Manual Asset Recovery Script
 * 
 * Comprehensive tool for manually recovering assets from stuck escrow PDAs.
 * Handles both database-tracked and untracked escrows.
 * Uses admin cancel to return assets to their original depositors.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import { PrismaClient, AgreementStatus } from '../../src/generated/prisma';
import { EscrowProgramService } from '../../src/services/escrow-program.service';
import * as dotenv from 'dotenv';
import * as path from 'path';
import idl from '../../target/idl/escrow.json';

// Load environment
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.join(__dirname, `../../.env.${env}`) });

// Map environment variables based on env
if (env === 'production') {
  process.env.NODE_ENV = 'production';
  process.env.MAINNET_ADMIN_PRIVATE_KEY = process.env.MAINNET_PROD_ADMIN_PRIVATE_KEY;
  process.env.ESCROW_PROGRAM_ID = process.env.MAINNET_PROD_PROGRAM_ID;
}

const prisma = new PrismaClient();

interface RecoveryOptions {
  escrowPda: string;
  dryRun?: boolean;
  updateDatabase?: boolean;
  force?: boolean;
}

interface RecoveryResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  escrowPda: string;
  buyer?: string;
  seller?: string;
  nftMint?: string;
  assetsRecovered: {
    nft: boolean;
    usdc: boolean;
  };
  databaseUpdated: boolean;
}

async function recoverStuckAssets(options: RecoveryOptions): Promise<RecoveryResult> {
  console.log('\n🚨 MANUAL ASSET RECOVERY\n');
  console.log('Escrow PDA:', options.escrowPda);
  console.log('Environment:', env);
  console.log('Dry Run:', options.dryRun ? 'YES (no actual transaction)' : 'NO (will execute)');
  console.log('Update Database:', options.updateDatabase);
  console.log('='.repeat(80));

  const escrowPda = new PublicKey(options.escrowPda);
  
  const result: RecoveryResult = {
    success: false,
    escrowPda: options.escrowPda,
    assetsRecovered: {
      nft: false,
      usdc: false,
    },
    databaseUpdated: false,
  };

  try {
    // Step 1: Fetch on-chain escrow state
    console.log('\n📊 Step 1: Fetching On-Chain Escrow State...');
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.MAINNET_PROD_RPC_URL;
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL not configured');
    }

    const connection = new Connection(rpcUrl, 'confirmed');
    const dummyKeypair = Keypair.generate();
    const wallet = new Wallet(dummyKeypair);
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(idl as any, provider);

    let escrowAccount: any;
    try {
      escrowAccount = await (program.account as any).escrowState.fetch(escrowPda);
    } catch (fetchError) {
      throw new Error('Escrow PDA not found on-chain (may already be closed/recovered)');
    }

    const buyer = escrowAccount.buyer;
    const seller = escrowAccount.seller;
    const nftMint = escrowAccount.nftMint;
    const nftDeposited = escrowAccount.sellerNftDeposited;
    const usdcDeposited = escrowAccount.buyerUsdcDeposited;
    
    result.buyer = buyer?.toString();
    result.seller = seller?.toString();
    result.nftMint = nftMint?.toString();

    console.log('✅ Escrow State:');
    console.log('   Buyer:', buyer?.toString());
    console.log('   Seller:', seller?.toString());
    console.log('   NFT Mint:', nftMint?.toString());
    console.log('   NFT Deposited:', nftDeposited);
    console.log('   USDC Deposited:', usdcDeposited);

    // Check status
    let statusStr = 'UNKNOWN';
    if (escrowAccount.status) {
      if (escrowAccount.status.pending) statusStr = 'PENDING';
      else if (escrowAccount.status.bothDeposited) statusStr = 'BOTH_DEPOSITED';
      else if (escrowAccount.status.completed) statusStr = 'COMPLETED';
      else if (escrowAccount.status.cancelled) statusStr = 'CANCELLED';
    }
    console.log('   Status:', statusStr);

    // Check expiry
    let isExpired = false;
    if (escrowAccount.expiryTimestamp) {
      const expiryHex = escrowAccount.expiryTimestamp.toString('hex');
      const expiry = parseInt(expiryHex, 16);
      const expiryDate = new Date(expiry * 1000);
      const now = new Date();
      isExpired = now > expiryDate;
      
      console.log('   Expiry:', expiryDate.toISOString());
      console.log('   Is Expired:', isExpired ? '✅ YES' : '❌ NO');
      
      if (!isExpired && !options.force) {
        throw new Error('Escrow is not yet expired. Use --force to override.');
      }
    }

    // Step 2: Check if there are assets to recover
    console.log('\n💰 Step 2: Checking Assets to Recover...');
    const hasAssets = nftDeposited || usdcDeposited;
    
    if (!hasAssets) {
      console.log('⚠️  No assets deposited in this escrow');
      if (!options.force) {
        throw new Error('No assets to recover. Use --force to cancel anyway.');
      }
    }

    if (nftDeposited) {
      console.log('   ✅ NFT needs to be returned to seller');
      result.assetsRecovered.nft = true;
    }
    if (usdcDeposited) {
      console.log('   ✅ USDC needs to be returned to buyer');
      result.assetsRecovered.usdc = true;
    }

    // Step 3: Check database status
    console.log('\n📚 Step 3: Checking Database Status...');
    let agreement = null;
    let agreementId = null;
    
    try {
      agreement = await prisma.agreement.findFirst({
        where: {
          escrowPda: options.escrowPda,
        },
      });

      if (agreement) {
        agreementId = agreement.agreementId;
        console.log('✅ Agreement found in database:');
        console.log('   Agreement ID:', agreement.agreementId);
        console.log('   Status:', agreement.status);
        console.log('   Expiry:', agreement.expiry.toISOString());
      } else {
        console.log('⚠️  Agreement NOT found in database');
        console.log('   This escrow was created before monitoring started');
      }
    } catch (dbError) {
      console.log('⚠️  Database check failed:', dbError);
    }

    // Step 4: Execute recovery
    if (options.dryRun) {
      console.log('\n🔍 DRY RUN MODE - No actual transaction will be executed');
      console.log('   Would call: adminCancel()');
      console.log('   Escrow PDA:', options.escrowPda);
      console.log('   Buyer:', buyer?.toString());
      console.log('   Seller:', seller?.toString());
      console.log('   NFT Mint:', nftMint?.toString());
      result.success = true;
      return result;
    }

    console.log('\n🔧 Step 4: Executing On-Chain Recovery...');
    console.log('⚠️  This will execute an adminCancel transaction');
    
    // Get USDC mint
    const { config } = await import('../../src/config');
    const usdcMintAddress = config.usdc.mintAddress;
    if (!usdcMintAddress) {
      throw new Error('USDC_MINT_ADDRESS not configured');
    }
    const usdcMint = new PublicKey(usdcMintAddress);

    // Initialize escrow service
    const escrowService = new EscrowProgramService();

    // Execute admin cancel
    console.log('   Calling adminCancel...');
    const txId = await escrowService.adminCancel(
      escrowPda,
      buyer,
      seller,
      nftMint,
      usdcMint
    );

    console.log('✅ Recovery transaction submitted:', txId);
    console.log('   View on Solscan: https://solscan.io/tx/' + txId);

    result.success = true;
    result.transactionId = txId;

    // Step 5: Update database if requested
    if (options.updateDatabase && agreement) {
      console.log('\n📝 Step 5: Updating Database...');
      try {
        await prisma.agreement.update({
          where: {
            agreementId: agreement.agreementId,
          },
          data: {
            status: AgreementStatus.CANCELLED,
            cancelTxId: txId,
            cancelledAt: new Date(),
          },
        });

        console.log('✅ Database updated:');
        console.log('   Agreement ID:', agreement.agreementId);
        console.log('   New Status: CANCELLED');
        console.log('   Cancel TX:', txId);
        
        result.databaseUpdated = true;
      } catch (dbError) {
        console.error('⚠️  Failed to update database:', dbError);
        console.error('   Transaction succeeded but database update failed');
        console.error('   Manual database update may be required');
      }
    }

    console.log('\n✅ RECOVERY COMPLETE');
    console.log('   Transaction:', txId);
    console.log('   NFT Recovered:', result.assetsRecovered.nft);
    console.log('   USDC Recovered:', result.assetsRecovered.usdc);
    console.log('   Database Updated:', result.databaseUpdated);

    return result;

  } catch (error) {
    console.error('\n❌ RECOVERY FAILED:', error);
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Manual Asset Recovery Script

Usage:
  npx ts-node scripts/utilities/manual-recovery.ts <ESCROW_PDA> [OPTIONS]

Arguments:
  ESCROW_PDA          The escrow PDA address to recover assets from

Options:
  --dry-run           Simulate recovery without executing transaction
  --update-db         Update database status after successful recovery
  --force             Force recovery even if not expired or no assets
  --help, -h          Show this help message

Environment:
  Set NODE_ENV to control which environment to use:
    NODE_ENV=development    Use .env.development (devnet/staging)
    NODE_ENV=production     Use .env.production (mainnet)

Examples:
  # Dry run to see what would happen
  NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh --dry-run

  # Actual recovery with database update
  NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh --update-db

  # Force recovery even if not expired
  NODE_ENV=production npx ts-node scripts/utilities/manual-recovery.ts CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh --force --update-db
`);
    process.exit(0);
  }

  const escrowPda = args[0];
  const dryRun = args.includes('--dry-run');
  const updateDatabase = args.includes('--update-db');
  const force = args.includes('--force');

  if (!escrowPda || !escrowPda.match(/^[A-HJ-NP-Za-km-z1-9]{32,44}$/)) {
    console.error('❌ Invalid escrow PDA address');
    console.error('\nUsage: npx ts-node scripts/utilities/manual-recovery.ts <ESCROW_PDA> [--dry-run] [--update-db] [--force]');
    process.exit(1);
  }

  recoverStuckAssets({
    escrowPda,
    dryRun,
    updateDatabase,
    force,
  })
    .then((result) => {
      if (result.success) {
        console.log('\n✅ Script completed successfully');
        process.exit(0);
      } else {
        console.log('\n❌ Script completed with errors');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { recoverStuckAssets, RecoveryOptions, RecoveryResult };

