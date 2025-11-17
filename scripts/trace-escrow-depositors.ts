/**
 * Trace Escrow Depositors - Find original depositors for trapped assets
 * 
 * This script scans blockchain transaction history for each escrow PDA to determine:
 * - Who deposited NFT A (seller)
 * - Who deposited NFT B (buyer, if applicable)
 * - Who deposited SOL (buyer/seller)
 * 
 * Output: JSON file mapping each escrow to its asset recipients
 */

import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Use QuickNode for higher rate limits
const RPC_URL = process.env.MAINNET_RPC_URL || 'https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/';
const PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

interface AssetRecipient {
  escrowPda: string;
  escrowId?: number;
  nftADepositor?: string; // Seller
  nftAMint?: string;
  nftBDepositor?: string; // Buyer
  nftBMint?: string;
  solDepositor?: string;
  solAmount?: number;
  tokenAccounts: {
    address: string;
    mint: string;
    amount: number;
    depositor?: string;
  }[];
  solVault?: {
    address: string;
    balance: number;
    depositor?: string;
  };
  createdAt?: Date;
  lastActivity?: Date;
}

async function getAllEscrowPDAs(connection: Connection): Promise<PublicKey[]> {
  console.log('📋 Fetching all escrow PDAs from blockchain...\n');
  
  const programId = new PublicKey(PROGRAM_ID);
  const accounts = await connection.getProgramAccounts(programId);
  
  console.log(`Found ${accounts.length} escrow PDAs\n`);
  return accounts.map(a => a.pubkey);
}

async function getEscrowTransactionHistory(
  connection: Connection,
  escrowPda: PublicKey
): Promise<ParsedTransactionWithMeta[]> {
  const signatures = await connection.getSignaturesForAddress(escrowPda, { limit: 100 });
  
  const transactions: ParsedTransactionWithMeta[] = [];
  
  for (const sig of signatures) {
    try {
      const tx = await connection.getParsedTransaction(sig.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      if (tx) {
        transactions.push(tx);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error: any) {
      console.warn(`Failed to fetch transaction ${sig.signature}: ${error.message}`);
    }
  }
  
  return transactions;
}

function extractNFTDepositor(
  tx: ParsedTransactionWithMeta,
  escrowPda: PublicKey,
  tokenAccount: PublicKey
): string | undefined {
  // Look for SPL token transfer TO the escrow's token account
  const instructions = tx.transaction.message.instructions;
  
  for (const ix of instructions) {
    if ('parsed' in ix && ix.program === 'spl-token') {
      const parsed = ix.parsed;
      
      // Look for transfer instruction
      if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
        const info = parsed.info;
        
        // Check if destination is our token account
        if (info.destination === tokenAccount.toString()) {
          // Source owner is the depositor
          return info.authority || info.source;
        }
      }
    }
  }
  
  return undefined;
}

function extractSOLDepositor(
  tx: ParsedTransactionWithMeta,
  solVault: PublicKey
): string | undefined {
  // Look for SOL transfer TO the sol_vault
  const instructions = tx.transaction.message.instructions;
  
  for (const ix of instructions) {
    if ('parsed' in ix && ix.program === 'system') {
      const parsed = ix.parsed;
      
      // Look for transfer instruction
      if (parsed.type === 'transfer') {
        const info = parsed.info;
        
        // Check if destination is sol_vault
        if (info.destination === solVault.toString()) {
          return info.source;
        }
      }
    }
  }
  
  return undefined;
}

async function traceEscrowAssets(
  connection: Connection,
  escrowPda: PublicKey
): Promise<AssetRecipient> {
  const result: AssetRecipient = {
    escrowPda: escrowPda.toString(),
    tokenAccounts: [],
  };
  
  console.log(`🔍 Tracing assets for ${escrowPda.toString().slice(0, 8)}...`);
  
  // Get all token accounts owned by escrow
  const tokenAccounts = await connection.getTokenAccountsByOwner(escrowPda, {
    programId: TOKEN_PROGRAM_ID,
  });
  
  console.log(`   Found ${tokenAccounts.value.length} token accounts`);
  
  // Get transaction history
  const transactions = await getEscrowTransactionHistory(connection, escrowPda);
  console.log(`   Found ${transactions.length} transactions`);
  
  // Track creation and last activity
  if (transactions.length > 0) {
    result.createdAt = new Date(transactions[transactions.length - 1].blockTime! * 1000);
    result.lastActivity = new Date(transactions[0].blockTime! * 1000);
  }
  
  // Trace each token account
  for (const tokenAccount of tokenAccounts.value) {
    const accountInfo = await connection.getTokenAccountBalance(tokenAccount.pubkey);
    const parsedInfo = await connection.getParsedAccountInfo(tokenAccount.pubkey);
    
    let mint: string | undefined;
    if (parsedInfo.value && 'parsed' in parsedInfo.value.data) {
      mint = parsedInfo.value.data.parsed.info.mint;
    }
    
    // Find who deposited this NFT
    let depositor: string | undefined;
    for (const tx of transactions.reverse()) { // Start from oldest
      const found = extractNFTDepositor(tx, escrowPda, tokenAccount.pubkey);
      if (found) {
        depositor = found;
        break;
      }
    }
    
    result.tokenAccounts.push({
      address: tokenAccount.pubkey.toString(),
      mint: mint || 'unknown',
      amount: parseInt(accountInfo.value.amount),
      depositor,
    });
    
    console.log(`   Token Account: ${tokenAccount.pubkey.toString().slice(0, 8)}...`);
    console.log(`     Mint: ${mint?.slice(0, 8)}...`);
    console.log(`     Amount: ${accountInfo.value.uiAmount}`);
    console.log(`     Depositor: ${depositor?.slice(0, 8)}... ${depositor ? '✅' : '❌'}`);
  }
  
  // Try to find sol_vault (might not exist for all escrows)
  // We'll need to derive it, but we don't have escrow_id from deserialization
  // So we'll skip this for now and handle it in the transaction builder
  
  console.log(`   ✅ Tracing complete\n`);
  
  return result;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 TRACING ESCROW DEPOSITORS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Get all escrow PDAs
  const escrowPDAs = await getAllEscrowPDAs(connection);
  
  console.log('📊 Starting asset tracing...\n');
  console.log(`Processing ${escrowPDAs.length} escrows\n`);
  
  const results: AssetRecipient[] = [];
  let successCount = 0;
  let failCount = 0;
  
  // Process in batches to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < escrowPDAs.length; i += batchSize) {
    const batch = escrowPDAs.slice(i, i + batchSize);
    
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(escrowPDAs.length / batchSize)}`);
    console.log('─────────────────────────────────────────────────────────\n');
    
    for (const escrowPda of batch) {
      try {
        const result = await traceEscrowAssets(connection, escrowPda);
        results.push(result);
        successCount++;
      } catch (error: any) {
        console.error(`❌ Failed to trace ${escrowPda.toString().slice(0, 8)}...: ${error.message}\n`);
        failCount++;
      }
      
      // Rate limiting between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Longer delay between batches
    if (i + batchSize < escrowPDAs.length) {
      console.log('\n⏸️  Pausing 5s before next batch to respect rate limits...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 TRACING COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Escrows: ${escrowPDAs.length}`);
  console.log(`Successfully Traced: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Save results
  const outputPath = path.join(__dirname, '../temp/escrow-asset-recipients.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log(`✅ Results saved to: ${outputPath}\n`);
  
  // Summary statistics
  const withTokenAccounts = results.filter(r => r.tokenAccounts.length > 0).length;
  const withTracedDepositors = results.filter(r => 
    r.tokenAccounts.some(ta => ta.depositor)
  ).length;
  const totalTokenAccounts = results.reduce((sum, r) => sum + r.tokenAccounts.length, 0);
  const tracedTokenAccounts = results.reduce((sum, r) => 
    sum + r.tokenAccounts.filter(ta => ta.depositor).length, 0
  );
  
  console.log('📈 Summary Statistics:');
  console.log(`   Escrows with token accounts: ${withTokenAccounts}`);
  console.log(`   Escrows with traced depositors: ${withTracedDepositors}`);
  console.log(`   Total token accounts: ${totalTokenAccounts}`);
  console.log(`   Token accounts traced: ${tracedTokenAccounts}/${totalTokenAccounts}`);
  console.log('');
  
  // Report escrows that need manual review
  const needsReview = results.filter(r => 
    r.tokenAccounts.some(ta => ta.amount > 0 && !ta.depositor)
  );
  
  if (needsReview.length > 0) {
    console.log(`⚠️  ${needsReview.length} escrows need manual review (assets without traced depositors):`);
    needsReview.forEach(r => {
      console.log(`   - ${r.escrowPda.slice(0, 8)}... (${r.tokenAccounts.filter(ta => !ta.depositor).length} untraced)`);
    });
    console.log('');
  }
  
  console.log('✅ Tracing script complete!\n');
  console.log('Next steps:');
  console.log('  1. Review temp/escrow-asset-recipients.json');
  console.log('  2. Manually investigate any escrows needing review');
  console.log('  3. Run transaction builder script');
  console.log('');
}

main().catch(console.error);


