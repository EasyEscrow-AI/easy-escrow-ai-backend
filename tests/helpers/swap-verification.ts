/**
 * Verification Helper Functions for Atomic Swap E2E Tests
 * 
 * Utilities for verifying balance changes, asset transfers, and nonce consumption
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import { expect } from 'chai';

/**
 * Verify SOL balance change within tolerance
 */
export async function verifyBalanceChange(
  connection: Connection,
  publicKey: PublicKey,
  balanceBefore: number,
  expectedChange: number, // positive for increase, negative for decrease (in lamports)
  tolerance: number = 10000, // 0.00001 SOL tolerance for transaction fees
  label: string = 'Account'
): Promise<void> {
  const balanceAfter = await connection.getBalance(publicKey);
  const actualChange = balanceAfter - balanceBefore;
  const difference = Math.abs(actualChange - expectedChange);

  console.log(`\n💰 ${label} Balance Verification:`);
  console.log(`  Before:  ${(balanceBefore / 1e9).toFixed(9)} SOL`);
  console.log(`  After:   ${(balanceAfter / 1e9).toFixed(9)} SOL`);
  console.log(`  Change:  ${(actualChange / 1e9).toFixed(9)} SOL`);
  console.log(`  Expected: ${(expectedChange / 1e9).toFixed(9)} SOL`);
  console.log(`  Diff:    ${(difference / 1e9).toFixed(9)} SOL (tolerance: ${(tolerance / 1e9).toFixed(9)} SOL)`);

  expect(difference).to.be.lessThanOrEqual(
    tolerance,
    `${label} balance change mismatch. Expected: ${expectedChange / 1e9} SOL, Got: ${actualChange / 1e9} SOL (diff: ${difference / 1e9} SOL)`
  );
  
  console.log(`  ✅ Balance change verified within tolerance`);
}

/**
 * Get NFT owner from token account
 */
export async function getNFTOwner(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  // Get the largest token account for this mint (the owner's associated token account)
  const largestAccounts = await connection.getTokenLargestAccounts(mint);
  
  if (largestAccounts.value.length === 0) {
    throw new Error(`No token accounts found for mint: ${mint.toBase58()}`);
  }

  const largestAccountAddress = largestAccounts.value[0].address;
  const accountInfo = await getAccount(connection, largestAccountAddress);
  
  return accountInfo.owner;
}

/**
 * Verify NFT ownership transfer
 */
export async function verifyNFTOwner(
  connection: Connection,
  mint: PublicKey,
  expectedOwner: PublicKey,
  label: string = 'NFT'
): Promise<void> {
  console.log(`\n🎨 ${label} Ownership Verification:`);
  console.log(`  Mint: ${mint.toBase58()}`);
  console.log(`  Expected Owner: ${expectedOwner.toBase58()}`);

  const actualOwner = await getNFTOwner(connection, mint);
  console.log(`  Actual Owner:   ${actualOwner.toBase58()}`);

  expect(actualOwner.toBase58()).to.equal(
    expectedOwner.toBase58(),
    `${label} owner mismatch. Expected: ${expectedOwner.toBase58()}, Got: ${actualOwner.toBase58()}`
  );

  console.log(`  ✅ Ownership verified`);
}

/**
 * Get nonce account data
 */
export async function getNonceData(
  connection: Connection,
  nonceAccount: PublicKey
): Promise<{ nonce: string; authority: PublicKey }> {
  const accountInfo = await connection.getAccountInfo(nonceAccount);
  
  if (!accountInfo) {
    throw new Error(`Nonce account not found: ${nonceAccount.toBase58()}`);
  }

  // Parse nonce account data
  // Format: version (4 bytes) + state (4 bytes) + authority (32 bytes) + nonce value (32 bytes)
  const data = accountInfo.data;
  
  // Skip version and state (8 bytes)
  const authorityBytes = data.slice(8, 40);
  const nonceBytes = data.slice(40, 72);
  
  const authority = new PublicKey(authorityBytes);
  const nonce = Buffer.from(nonceBytes).toString('base64');

  return { nonce, authority };
}

/**
 * Verify nonce has advanced (changed from previous value)
 */
export async function verifyNonceAdvanced(
  connection: Connection,
  nonceAccount: PublicKey,
  previousNonce: string,
  label: string = 'Nonce'
): Promise<string> {
  console.log(`\n🔄 ${label} Advancement Verification:`);
  console.log(`  Nonce Account: ${nonceAccount.toBase58()}`);
  console.log(`  Previous: ${previousNonce.substring(0, 20)}...`);

  const { nonce: currentNonce } = await getNonceData(connection, nonceAccount);
  console.log(`  Current:  ${currentNonce.substring(0, 20)}...`);

  expect(currentNonce).to.not.equal(
    previousNonce,
    `${label} did not advance. Nonce value is still: ${previousNonce}`
  );

  console.log(`  ✅ Nonce advanced successfully`);
  
  return currentNonce;
}

/**
 * Wait for transaction confirmation with retries
 */
export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
  maxRetries: number = 30,
  retryDelay: number = 1000
): Promise<void> {
  console.log(`\n⏳ Waiting for transaction confirmation...`);
  console.log(`  Signature: ${signature}`);
  console.log(`  Commitment: ${commitment}`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (status?.value?.confirmationStatus === commitment || 
          status?.value?.confirmationStatus === 'finalized') {
        console.log(`  ✅ Transaction confirmed (${status.value.confirmationStatus})`);
        
        if (status.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }
        
        return;
      }

      if (i % 5 === 0 && i > 0) {
        console.log(`  ⏳ Still waiting... (${i}/${maxRetries} attempts)`);
      }

      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error(`Transaction confirmation timeout after ${maxRetries * retryDelay / 1000}s`);
}

/**
 * Display transaction explorer link
 */
export function displayExplorerLink(
  signature: string,
  cluster: 'devnet' | 'mainnet-beta' = 'devnet'
): void {
  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '';
  console.log(`  🔗 Explorer: https://explorer.solana.com/tx/${signature}${clusterParam}`);
}

/**
 * Summary helper for test results
 */
export function displayTestSummary(
  testName: string,
  results: {
    makerBalanceChange: number;
    takerBalanceChange: number;
    feeCollected: number;
    nftTransferred: boolean;
    nonceAdvanced: boolean;
  }
): void {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  ${testName.padEnd(60)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`\n✅ Test Results:`);
  console.log(`  Maker Balance:   ${results.makerBalanceChange > 0 ? '+' : ''}${(results.makerBalanceChange / 1e9).toFixed(9)} SOL`);
  console.log(`  Taker Balance:   ${results.takerBalanceChange > 0 ? '+' : ''}${(results.takerBalanceChange / 1e9).toFixed(9)} SOL`);
  console.log(`  Fee Collected:   ${(results.feeCollected / 1e9).toFixed(9)} SOL`);
  console.log(`  NFT Transferred: ${results.nftTransferred ? '✅ Yes' : '❌ No'}`);
  console.log(`  Nonce Advanced:  ${results.nonceAdvanced ? '✅ Yes' : '❌ No'}`);
  console.log(`\n🎉 All verifications passed!\n`);
}

