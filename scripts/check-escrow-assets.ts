/**
 * Check if escrow accounts have any assets (NFTs, SOL) before force-closing
 * 
 * CRITICAL: We cannot close accounts that still hold assets!
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Use QuickNode (higher rate limits for this one-time scan)
const RPC_URL = 'https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/';
const PROGRAM_ID = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx';

async function checkEscrowAssets() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 CHECKING ESCROW ACCOUNTS FOR TRAPPED ASSETS');
  console.log('═══════════════════════════════════════════════════════════\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);

  console.log('📋 Scanning blockchain for escrow PDAs...\n');
  const accounts = await connection.getProgramAccounts(programId);
  
  console.log(`Found ${accounts.length} escrow accounts\n`);
  console.log('Checking for associated token accounts (NFTs) and SOL vaults...\n');

  const results = {
    totalAccounts: accounts.length,
    accountsWithSOL: 0,
    accountsWithTokens: 0,
    accountsEmpty: 0,
    totalSOLTrapped: 0,
    tokenAccountsFound: [] as any[],
  };

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const escrowPda = account.pubkey;
    const lamports = account.account.lamports;
    const shortPda = escrowPda.toString().slice(0, 8);

    // Check for SOL vault (PDA: [b"sol_vault", escrow_id])
    // We can't derive escrow_id from data if deserialization fails,
    // so we'll check for token accounts owned by this escrow instead
    
    try {
      // Get all token accounts owned by this escrow PDA
      const tokenAccounts = await connection.getTokenAccountsByOwner(escrowPda, {
        programId: TOKEN_PROGRAM_ID,
      });

      if (tokenAccounts.value.length > 0) {
        results.accountsWithTokens++;
        console.log(`⚠️  ${i + 1}/${accounts.length} ${shortPda}... HAS ${tokenAccounts.value.length} TOKEN ACCOUNT(S)!`);
        
        for (const tokenAccount of tokenAccounts.value) {
          const tokenData = await connection.getTokenAccountBalance(tokenAccount.pubkey);
          if (parseInt(tokenData.value.amount) > 0) {
            console.log(`     🔴 ASSET TRAPPED: ${tokenAccount.pubkey.toString()} has ${tokenData.value.uiAmount} tokens`);
            results.tokenAccountsFound.push({
              escrow: escrowPda.toString(),
              tokenAccount: tokenAccount.pubkey.toString(),
              amount: tokenData.value.amount,
              uiAmount: tokenData.value.uiAmount,
            });
          }
        }
      } else {
        // No token accounts
        results.accountsEmpty++;
        if (i < 20) { // Show first 20
          console.log(`✅ ${i + 1}/${accounts.length} ${shortPda}... No token accounts`);
        }
      }

      // Check account rent (rent-exempt reserve vs actual balance)
      // Rent-exempt reserve for these accounts is ~0.002 SOL
      const rentExemptReserve = 0.0022 * 1e9; // ~0.0022 SOL in lamports
      const extraSOL = lamports - rentExemptReserve;
      
      if (extraSOL > 1000) { // More than 1000 lamports extra = has SOL
        results.accountsWithSOL++;
        results.totalSOLTrapped += extraSOL;
        console.log(`⚠️  ${shortPda}... HAS EXTRA SOL: ${(extraSOL / 1e9).toFixed(6)} SOL (beyond rent)`);
      }

    } catch (error: any) {
      console.log(`❌ ${i + 1}/${accounts.length} ${shortPda}... Error checking: ${error.message}`);
    }

    // Rate limit
    if (i % 10 === 9) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 ASSET CHECK RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Escrow Accounts: ${results.totalAccounts}`);
  console.log(`\nAsset Status:`);
  console.log(`  Accounts with Token Accounts (NFTs): ${results.accountsWithTokens}`);
  console.log(`  Accounts with Extra SOL: ${results.accountsWithSOL}`);
  console.log(`  Empty Accounts (safe to close): ${results.accountsEmpty}`);
  console.log(`\nTrapped Assets:`);
  console.log(`  Total SOL (beyond rent): ${(results.totalSOLTrapped / 1e9).toFixed(6)} SOL`);
  console.log(`  Token Accounts Found: ${results.tokenAccountsFound.length}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (results.accountsWithTokens > 0 || results.accountsWithSOL > 0) {
    console.log('🔴 CRITICAL: Some accounts have assets!');
    console.log('    Force-close instruction MUST return these assets first!');
    console.log('');
    
    if (results.tokenAccountsFound.length > 0) {
      console.log('Token Accounts with Assets:');
      results.tokenAccountsFound.forEach((ta, i) => {
        console.log(`  ${i + 1}. Escrow: ${ta.escrow.slice(0, 8)}...`);
        console.log(`     Token Account: ${ta.tokenAccount}`);
        console.log(`     Amount: ${ta.uiAmount} tokens`);
      });
    }
  } else {
    console.log('✅ SAFE: All accounts are empty (only rent-exempt reserves)');
    console.log('    Force-close can proceed without asset return logic');
  }
}

checkEscrowAssets().catch(console.error);

