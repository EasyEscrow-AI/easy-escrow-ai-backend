/**
 * Investigation Tool: Stuck Escrow Analysis
 * 
 * Analyzes why a stuck escrow wasn't automatically recovered by the recovery service.
 * Checks database status, on-chain status, and recovery service logs.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import { PrismaClient } from '../../src/generated/prisma';
import * as dotenv from 'dotenv';
import * as path from 'path';
import idl from '../../target/idl/escrow.json';

// Load environment based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.join(__dirname, `../../.env.${env}`) });

const prisma = new PrismaClient();

interface InvestigationResult {
  escrowPda: string;
  databaseStatus: {
    found: boolean;
    agreementId?: string;
    status?: string;
    expiry?: Date;
    escrowPda?: string;
    deposits?: any[];
  };
  onChainStatus: {
    found: boolean;
    initialized?: boolean;
    buyer?: string;
    seller?: string;
    nftMint?: string;
    expiry?: Date;
    nftDeposited?: boolean;
    tokenDeposited?: boolean;
    escrowStatus?: string;
  };
  analysis: {
    isStuck: boolean;
    reason: string[];
    recommendations: string[];
  };
}

async function investigateStuckEscrow(escrowPdaAddress: string): Promise<InvestigationResult> {
  console.log('🔍 Investigating Stuck Escrow\n');
  console.log('Escrow PDA:', escrowPdaAddress);
  console.log('Environment:', env);
  console.log('Date:', new Date().toISOString());
  console.log('='.repeat(80));
  
  const escrowPda = new PublicKey(escrowPdaAddress);
  
  const result: InvestigationResult = {
    escrowPda: escrowPdaAddress,
    databaseStatus: {
      found: false,
    },
    onChainStatus: {
      found: false,
    },
    analysis: {
      isStuck: false,
      reason: [],
      recommendations: [],
    },
  };

  // 1. Check database status
  console.log('\n📊 Step 1: Checking Database Status...');
  try {
    const agreement = await prisma.agreement.findFirst({
      where: {
        escrowPda: escrowPdaAddress,
      },
      include: {
        deposits: {
          where: {
            status: 'CONFIRMED',
          },
        },
      },
    });

    if (agreement) {
      result.databaseStatus.found = true;
      result.databaseStatus.agreementId = agreement.agreementId;
      result.databaseStatus.status = agreement.status;
      result.databaseStatus.expiry = agreement.expiry;
      result.databaseStatus.escrowPda = agreement.escrowPda!;
      result.databaseStatus.deposits = agreement.deposits;

      console.log('✅ Agreement found in database:');
      console.log('   Agreement ID:', agreement.agreementId);
      console.log('   Status:', agreement.status);
      console.log('   Expiry:', agreement.expiry.toISOString());
      console.log('   Deposits:', agreement.deposits.length);
      
      // Check if expired
      if (new Date() > agreement.expiry) {
        console.log('   ⚠️  EXPIRED:', Math.floor((Date.now() - agreement.expiry.getTime()) / (1000 * 60 * 60)), 'hours ago');
      }
    } else {
      console.log('❌ Agreement NOT found in database');
      result.analysis.reason.push('Agreement not tracked in database');
      result.analysis.recommendations.push('Agreement may have been created before monitoring started');
    }
  } catch (error) {
    console.error('Error checking database:', error);
    result.analysis.reason.push(`Database error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  // 2. Check on-chain status
  console.log('\n⛓️  Step 2: Checking On-Chain Status...');
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.MAINNET_PROD_RPC_URL;
    if (!rpcUrl) {
      throw new Error('SOLANA_RPC_URL not configured');
    }

    const connection = new Connection(rpcUrl, 'confirmed');
    const dummyKeypair = Keypair.generate();
    const wallet = new Wallet(dummyKeypair);
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(idl as any, provider);

    try {
      const escrowAccount: any = await (program.account as any).escrowState.fetch(escrowPda);
      
      result.onChainStatus.found = true;
      result.onChainStatus.buyer = escrowAccount.buyer?.toString();
      result.onChainStatus.seller = escrowAccount.seller?.toString();
      result.onChainStatus.nftMint = escrowAccount.nftMint?.toString();

      console.log('✅ Escrow account found on-chain:');
      console.log('   Buyer:', escrowAccount.buyer?.toString());
      console.log('   Seller:', escrowAccount.seller?.toString());
      console.log('   NFT Mint:', escrowAccount.nftMint?.toString());

      // Check status
      if (escrowAccount.status) {
        if (escrowAccount.status.pending) {
          result.onChainStatus.escrowStatus = 'PENDING';
          console.log('   Status: PENDING');
        } else if (escrowAccount.status.bothDeposited) {
          result.onChainStatus.escrowStatus = 'BOTH_DEPOSITED';
          console.log('   Status: BOTH_DEPOSITED');
        } else if (escrowAccount.status.completed) {
          result.onChainStatus.escrowStatus = 'COMPLETED';
          console.log('   Status: COMPLETED');
        } else if (escrowAccount.status.cancelled) {
          result.onChainStatus.escrowStatus = 'CANCELLED';
          console.log('   Status: CANCELLED');
        }
      }

      // Check deposits
      result.onChainStatus.nftDeposited = escrowAccount.sellerNftDeposited;
      result.onChainStatus.tokenDeposited = escrowAccount.buyerUsdcDeposited;
      console.log('   NFT Deposited:', escrowAccount.sellerNftDeposited);
      console.log('   Token Deposited:', escrowAccount.buyerUsdcDeposited);

      // Check expiry
      if (escrowAccount.expiryTimestamp) {
        const expiryHex = escrowAccount.expiryTimestamp.toString('hex');
        const expiry = parseInt(expiryHex, 16);
        const expiryDate = new Date(expiry * 1000);
        result.onChainStatus.expiry = expiryDate;
        
        const now = new Date();
        const isExpired = now > expiryDate;
        
        console.log('   Expiry:', expiryDate.toISOString());
        console.log('   Is Expired:', isExpired ? '✅ YES' : '❌ NO');
        
        if (isExpired) {
          const hoursAgo = Math.floor((now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60));
          console.log('   ⚠️  EXPIRED:', hoursAgo, 'hours ago');
        }
      }

    } catch (fetchError) {
      console.log('❌ Escrow account NOT found on-chain or already closed');
      result.analysis.reason.push('Escrow PDA not found on-chain (may have been closed)');
    }

  } catch (error) {
    console.error('Error checking on-chain status:', error);
    result.analysis.reason.push(`On-chain error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  // 3. Analyze why it's stuck
  console.log('\n🔬 Step 3: Analysis...');
  
  // Check database vs on-chain mismatch
  if (!result.databaseStatus.found && result.onChainStatus.found) {
    result.analysis.isStuck = true;
    result.analysis.reason.push('Escrow exists on-chain but not tracked in database');
    result.analysis.recommendations.push('This escrow was created before database monitoring started');
    result.analysis.recommendations.push('Use manual recovery script to return assets');
  }

  if (result.databaseStatus.found && result.databaseStatus.status !== 'EXPIRED' && result.onChainStatus.expiry && new Date() > result.onChainStatus.expiry) {
    result.analysis.isStuck = true;
    result.analysis.reason.push(`Agreement expired but database status is still '${result.databaseStatus.status}'`);
    result.analysis.recommendations.push('ExpiryService may not have run when agreement expired');
    result.analysis.recommendations.push('Manually update database status to EXPIRED');
    result.analysis.recommendations.push('Run recovery orchestrator to process refunds');
  }

  if (result.databaseStatus.found && result.databaseStatus.status === 'EXPIRED' && result.databaseStatus.deposits!.length > 0) {
    result.analysis.isStuck = true;
    result.analysis.reason.push('Agreement marked EXPIRED with deposits but not yet refunded');
    result.analysis.recommendations.push('RefundService should process this automatically');
    result.analysis.recommendations.push('Check refund service logs for errors');
    result.analysis.recommendations.push('Manually trigger refund processing if needed');
  }

  if (result.onChainStatus.found && result.onChainStatus.escrowStatus === 'COMPLETED') {
    result.analysis.isStuck = false;
    result.analysis.reason.push('Escrow completed successfully - not stuck!');
    result.analysis.recommendations.push('No action needed');
  }

  // Print analysis
  console.log('\n📋 Analysis Results:');
  console.log('Is Stuck:', result.analysis.isStuck ? '✅ YES' : '❌ NO');
  console.log('\nReasons:');
  result.analysis.reason.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  console.log('\nRecommendations:');
  result.analysis.recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

  return result;
}

// Main execution
if (require.main === module) {
  const escrowPdaArg = process.argv[2];
  
  if (!escrowPdaArg) {
    console.error('❌ Usage: npx ts-node scripts/utilities/investigate-stuck-escrow.ts <ESCROW_PDA>');
    console.error('\nExample:');
    console.error('  npx ts-node scripts/utilities/investigate-stuck-escrow.ts CaMUFXGNf8u11cZXx8rvDWYZ8d99mjxNRreTgwFDEdMh');
    process.exit(1);
  }

  investigateStuckEscrow(escrowPdaArg)
    .then(() => {
      console.log('\n✅ Investigation complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Investigation failed:', error);
      process.exit(1);
    });
}

export { investigateStuckEscrow };

