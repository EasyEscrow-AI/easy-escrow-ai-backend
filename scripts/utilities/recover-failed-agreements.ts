/**
 * Manual Asset Recovery Script
 * 
 * Recovers assets from failed/stuck agreements by executing on-chain refunds.
 * 
 * This script:
 * 1. Finds agreements with confirmed deposits but failed/stuck status
 * 2. Verifies assets are still in escrow
 * 3. Executes on-chain refunds to return assets to depositors
 * 4. Updates database to reflect refund status
 * 
 * Usage:
 *   # Dry run (preview only)
 *   npx ts-node scripts/utilities/recover-failed-agreements.ts --dry-run
 * 
 *   # Execute recovery for specific agreement
 *   npx ts-node scripts/utilities/recover-failed-agreements.ts --agreement-id <id>
 * 
 *   # Execute recovery for all failed agreements
 *   npx ts-node scripts/utilities/recover-failed-agreements.ts --all
 * 
 *   # Execute with specific environment
 *   npx ts-node scripts/utilities/recover-failed-agreements.ts --all --env production
 */

import dotenv from 'dotenv';
import path from 'path';
import { PublicKey, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { prisma } from '../../src/config/database';
import { AgreementStatus, DepositStatus, DepositType } from '../../src/generated/prisma';
import { getRefundService } from '../../src/services/refund.service';
import { config } from '../../src/config';

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const processAll = args.includes('--all');
const agreementIdIndex = args.indexOf('--agreement-id');
const specificAgreementId = agreementIdIndex !== -1 ? args[agreementIdIndex + 1] : null;
const envIndex = args.indexOf('--env');
const environment = envIndex !== -1 ? args[envIndex + 1] : 'staging';

// Load environment variables
const envFile = environment === 'production' ? '.env.production' : `.env.${environment}`;
const envPath = path.resolve(process.cwd(), envFile);
console.log(`\n📋 Loading environment from: ${envPath}\n`);
dotenv.config({ path: envPath, override: true });

interface FailedAgreement {
  agreementId: string;
  escrowPda: string;
  nftMint: string;
  seller: string;
  buyer: string | null;
  status: AgreementStatus;
  createdAt: Date;
  expiry: Date;
  deposits: Array<{
    id: string;
    type: DepositType;
    depositor: string;
    amount: any;
    tokenAccount: string | null;
    status: DepositStatus;
  }>;
}

interface RecoveryResult {
  agreementId: string;
  success: boolean;
  assetsRecovered: Array<{
    type: DepositType;
    depositor: string;
    txId?: string;
  }>;
  errors: string[];
}

/**
 * Find agreements that need asset recovery
 */
async function findFailedAgreements(): Promise<FailedAgreement[]> {
  console.log('🔍 Searching for agreements needing asset recovery...\n');

  const failedStatuses: AgreementStatus[] = [
    AgreementStatus.PENDING,
    AgreementStatus.FUNDED,
    AgreementStatus.USDC_LOCKED,
    AgreementStatus.NFT_LOCKED,
    AgreementStatus.BOTH_LOCKED,
    AgreementStatus.EXPIRED,
    AgreementStatus.CANCELLED,
  ];

  const agreements = await prisma.agreement.findMany({
    where: specificAgreementId
      ? { agreementId: specificAgreementId }
      : {
          status: { in: failedStatuses },
          deposits: {
            some: {
              status: DepositStatus.CONFIRMED,
            },
          },
        },
    include: {
      deposits: {
        where: {
          status: DepositStatus.CONFIRMED,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  console.log(`Found ${agreements.length} agreement(s) with confirmed deposits in failed/stuck status\n`);

  return agreements as FailedAgreement[];
}

/**
 * Verify assets are still in escrow on-chain
 */
async function verifyAssetsInEscrow(
  agreement: FailedAgreement,
  connection: Connection
): Promise<{ nftInEscrow: boolean; usdcInEscrow: boolean; nftBalance: number; usdcBalance: number }> {
  try {
    const escrowPda = new PublicKey(agreement.escrowPda);
    const nftMint = new PublicKey(agreement.nftMint);
    const usdcMint = new PublicKey(config.usdc.mintAddress!);

    // Get escrow token accounts
    const nftAccount = await getAssociatedTokenAddress(nftMint, escrowPda, true);
    const usdcAccount = await getAssociatedTokenAddress(usdcMint, escrowPda, true);

    let nftBalance = 0;
    let usdcBalance = 0;

    // Check NFT balance
    try {
      const nftAccountInfo = await getAccount(connection, nftAccount);
      nftBalance = Number(nftAccountInfo.amount);
    } catch (error) {
      // Account doesn't exist or has no balance
      nftBalance = 0;
    }

    // Check USDC balance
    try {
      const usdcAccountInfo = await getAccount(connection, usdcAccount);
      usdcBalance = Number(usdcAccountInfo.amount);
    } catch (error) {
      // Account doesn't exist or has no balance
      usdcBalance = 0;
    }

    return {
      nftInEscrow: nftBalance > 0,
      usdcInEscrow: usdcBalance > 0,
      nftBalance,
      usdcBalance,
    };
  } catch (error) {
    console.error(`   ⚠️  Error verifying assets for ${agreement.agreementId}:`, error);
    return {
      nftInEscrow: false,
      usdcInEscrow: false,
      nftBalance: 0,
      usdcBalance: 0,
    };
  }
}

/**
 * Recover assets for a single agreement
 */
async function recoverAgreement(
  agreement: FailedAgreement,
  connection: Connection,
  dryRun: boolean
): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    agreementId: agreement.agreementId,
    success: false,
    assetsRecovered: [],
    errors: [],
  };

  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📦 Agreement: ${agreement.agreementId}`);
    console.log(`   Status: ${agreement.status}`);
    console.log(`   Created: ${agreement.createdAt.toISOString()}`);
    console.log(`   Expiry: ${agreement.expiry.toISOString()}`);
    console.log(`   Escrow PDA: ${agreement.escrowPda}`);
    console.log(`   Deposits: ${agreement.deposits.length}`);

    // Verify assets on-chain
    const assetStatus = await verifyAssetsInEscrow(agreement, connection);
    
    console.log(`\n   On-Chain Assets:`);
    console.log(`   - NFT in escrow: ${assetStatus.nftInEscrow ? '✅' : '❌'} (balance: ${assetStatus.nftBalance})`);
    console.log(`   - USDC in escrow: ${assetStatus.usdcInEscrow ? '✅' : '❌'} (balance: ${assetStatus.usdcBalance})`);

    if (!assetStatus.nftInEscrow && !assetStatus.usdcInEscrow) {
      console.log(`\n   ⚠️  No assets found in escrow - already recovered or never deposited`);
      result.errors.push('No assets in escrow');
      return result;
    }

    console.log(`\n   Database Deposits:`);
    agreement.deposits.forEach((deposit, index) => {
      console.log(`   ${index + 1}. ${deposit.type} from ${deposit.depositor}`);
      if (deposit.type === DepositType.USDC) {
        console.log(`      Amount: ${deposit.amount} USDC`);
      }
    });

    if (dryRun) {
      console.log(`\n   🔍 DRY RUN - Would execute on-chain refund for this agreement`);
      result.success = true;
      return result;
    }

    // Execute on-chain refund
    console.log(`\n   💰 Executing on-chain refund...`);
    const refundService = getRefundService();
    const refundResult = await refundService.processRefunds(agreement.agreementId);

    if (refundResult.success) {
      console.log(`\n   ✅ Refund successful!`);
      console.log(`   Transactions: ${refundResult.transactionIds.length}`);
      
      refundResult.refundedDeposits.forEach((refund, index) => {
        console.log(`   ${index + 1}. ${refund.type} → ${refund.depositor}`);
        console.log(`      TX: ${refund.txId}`);
        
        result.assetsRecovered.push({
          type: refund.type,
          depositor: refund.depositor,
          txId: refund.txId,
        });
      });

      result.success = true;
    } else {
      console.log(`\n   ❌ Refund failed`);
      refundResult.errors.forEach((error) => {
        console.log(`      - ${error.error}`);
        result.errors.push(error.error);
      });
    }

    console.log(`${'='.repeat(80)}`);

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n   ❌ Recovery failed: ${errorMsg}`);
    result.errors.push(errorMsg);
    return result;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n${'█'.repeat(80)}`);
  console.log(`🚑 ASSET RECOVERY SCRIPT`);
  console.log(`${'█'.repeat(80)}`);
  console.log(`   Environment: ${environment.toUpperCase()}`);
  console.log(`   Network: ${config.solana.network}`);
  console.log(`   RPC: ${config.solana.rpcUrl}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE EXECUTION'}`);
  console.log(`${'█'.repeat(80)}\n`);

  if (!dryRun) {
    console.log(`⚠️  WARNING: This will execute real blockchain transactions!`);
    console.log(`   Press Ctrl+C within 5 seconds to cancel...\n`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log(`   Proceeding with recovery...\n`);
  }

  try {
    // Setup connection
    const connection = new Connection(config.solana.rpcUrl, 'confirmed');

    // Find failed agreements
    const failedAgreements = await findFailedAgreements();

    if (failedAgreements.length === 0) {
      console.log(`✅ No agreements found needing recovery\n`);
      return;
    }

    // Display summary
    console.log(`📊 Recovery Summary:`);
    console.log(`   Total agreements: ${failedAgreements.length}`);
    console.log(`   Total deposits: ${failedAgreements.reduce((sum, a) => sum + a.deposits.length, 0)}\n`);

    // Process each agreement
    const results: RecoveryResult[] = [];

    for (const agreement of failedAgreements) {
      const result = await recoverAgreement(agreement, connection, dryRun);
      results.push(result);

      // Add delay between recoveries to avoid rate limiting
      if (!dryRun && failedAgreements.length > 1) {
        console.log(`\n   ⏳ Waiting 3 seconds before next recovery...\n`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    // Final summary
    console.log(`\n${'█'.repeat(80)}`);
    console.log(`📋 FINAL SUMMARY`);
    console.log(`${'█'.repeat(80)}`);
    
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalAssets = results.reduce((sum, r) => sum + r.assetsRecovered.length, 0);

    console.log(`   Successful: ${successful} / ${results.length}`);
    console.log(`   Failed: ${failed} / ${results.length}`);
    console.log(`   Assets recovered: ${totalAssets}`);

    if (failed > 0) {
      console.log(`\n   ⚠️  Failed agreements:`);
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`      - ${r.agreementId}: ${r.errors.join(', ')}`);
        });
    }

    console.log(`${'█'.repeat(80)}\n`);

    if (dryRun) {
      console.log(`💡 TIP: Run without --dry-run to execute actual recovery\n`);
    }
  } catch (error) {
    console.error(`\n❌ Fatal error:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute
main()
  .then(() => {
    console.log(`✅ Script completed successfully\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Script failed:`, error);
    process.exit(1);
  });

