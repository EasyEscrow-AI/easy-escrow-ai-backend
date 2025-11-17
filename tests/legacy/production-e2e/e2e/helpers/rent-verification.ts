/**
 * Rent Recovery Verification Helpers for E2E Tests
 * 
 * These utilities help verify that escrow accounts are properly closed
 * and rent is recovered to the admin wallet after settlement or refund.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { expect } from 'chai';

/**
 * Expected rent-exempt reserve for EscrowState account
 * This is the standard Solana rent-exempt minimum for the account size
 */
export const EXPECTED_RENT_LAMPORTS = 2_303_760;
export const EXPECTED_RENT_SOL = EXPECTED_RENT_LAMPORTS / LAMPORTS_PER_SOL; // ~0.00230376 SOL

/**
 * Verify that an escrow account has been closed
 * @param connection - Solana connection
 * @param escrowPda - Escrow PDA address
 * @returns true if account is closed, false otherwise
 */
export async function verifyEscrowAccountClosed(
  connection: Connection,
  escrowPda: string
): Promise<boolean> {
  try {
    const accountInfo = await connection.getAccountInfo(new PublicKey(escrowPda));
    
    if (!accountInfo) {
      console.log(`✅ Escrow account ${escrowPda} is closed (does not exist)`);
      return true;
    }

    if (accountInfo.lamports === 0) {
      console.log(`✅ Escrow account ${escrowPda} has 0 lamports (closed)`);
      return true;
    }

    console.log(`❌ Escrow account ${escrowPda} still exists with ${accountInfo.lamports} lamports`);
    return false;
  } catch (error: any) {
    // If account doesn't exist, that's what we want
    if (error.message?.includes('Account does not exist')) {
      console.log(`✅ Escrow account ${escrowPda} is closed (account not found)`);
      return true;
    }
    throw error;
  }
}

/**
 * Verify rent recovery by checking admin wallet balance change
 * @param connection - Solana connection
 * @param adminAddress - Admin wallet address
 * @param balanceBefore - Admin balance before operation (in lamports)
 * @param expectedRent - Expected rent recovered (defaults to standard rent)
 * @returns true if rent was recovered, false otherwise
 */
export async function verifyRentRecovered(
  connection: Connection,
  adminAddress: string,
  balanceBefore: number,
  expectedRent: number = EXPECTED_RENT_LAMPORTS
): Promise<boolean> {
  const balanceAfter = await connection.getBalance(new PublicKey(adminAddress));
  const balanceChange = balanceAfter - balanceBefore;

  console.log(`💰 Admin balance change: ${balanceChange} lamports (${balanceChange / LAMPORTS_PER_SOL} SOL)`);
  console.log(`💰 Expected rent recovery: ${expectedRent} lamports (${expectedRent / LAMPORTS_PER_SOL} SOL)`);

  // Allow some tolerance for transaction fees
  // Rent should be recovered, but transaction fee (0.000005 SOL) is paid
  const tolerance = 10_000; // 0.00001 SOL tolerance
  
  if (Math.abs(balanceChange - expectedRent) <= tolerance) {
    console.log(`✅ Rent recovered successfully (within tolerance)`);
    return true;
  }

  if (balanceChange > (expectedRent - tolerance)) {
    console.log(`✅ Rent recovered (balance increased by ${balanceChange} lamports)`);
    return true;
  }

  console.log(`❌ Rent not recovered (balance change: ${balanceChange}, expected: ${expectedRent})`);
  return false;
}

/**
 * Complete verification: Check both account closure and rent recovery
 * @param connection - Solana connection
 * @param escrowPda - Escrow PDA address
 * @param adminAddress - Admin wallet address
 * @param adminBalanceBefore - Admin balance before operation
 */
export async function verifyCompleteRentRecovery(
  connection: Connection,
  escrowPda: string,
  adminAddress: string,
  adminBalanceBefore: number
): Promise<void> {
  console.log('\n🔍 Verifying rent recovery...');
  
  // 1. Verify escrow account is closed
  const accountClosed = await verifyEscrowAccountClosed(connection, escrowPda);
  expect(accountClosed, 'Escrow account should be closed').to.be.true;

  // 2. Verify rent was recovered to admin wallet
  const rentRecovered = await verifyRentRecovered(
    connection,
    adminAddress,
    adminBalanceBefore
  );
  expect(rentRecovered, 'Rent should be recovered to admin wallet').to.be.true;

  console.log('✅ Rent recovery verification complete\n');
}

/**
 * Get admin wallet balance before operation
 * Use this to capture the baseline before settlement/refund
 * @param connection - Solana connection
 * @param adminAddress - Admin wallet address
 * @returns Balance in lamports
 */
export async function getAdminBalanceBefore(
  connection: Connection,
  adminAddress: string
): Promise<number> {
  const balance = await connection.getBalance(new PublicKey(adminAddress));
  console.log(`📊 Admin balance before: ${balance} lamports (${balance / LAMPORTS_PER_SOL} SOL)`);
  return balance;
}

/**
 * Wait for account closure with timeout
 * Polls for account closure with exponential backoff
 * @param connection - Solana connection
 * @param escrowPda - Escrow PDA address
 * @param timeoutMs - Maximum time to wait (default: 30s)
 * @returns true if account closed within timeout
 */
export async function waitForAccountClosure(
  connection: Connection,
  escrowPda: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeoutMs) {
    attempt++;
    
    const isClosed = await verifyEscrowAccountClosed(connection, escrowPda);
    if (isClosed) {
      console.log(`✅ Account closed after ${attempt} attempts (${Date.now() - startTime}ms)`);
      return true;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 8s, ...
    const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
    console.log(`⏳ Account not yet closed, waiting ${backoffMs}ms (attempt ${attempt})...`);
    await new Promise(resolve => setTimeout(resolve, backoffMs));
  }

  console.log(`❌ Timeout: Account not closed within ${timeoutMs}ms`);
  return false;
}

/**
 * Example usage in E2E test:
 * 
 * ```typescript
 * // Before settlement/refund
 * const adminBalanceBefore = await getAdminBalanceBefore(connection, ADMIN_ADDRESS);
 * 
 * // ... execute settlement or refund ...
 * 
 * // After settlement/refund (wait for background closure)
 * await waitForAccountClosure(connection, escrowPda, 30000);
 * 
 * // Verify complete rent recovery
 * await verifyCompleteRentRecovery(
 *   connection,
 *   escrowPda,
 *   ADMIN_ADDRESS,
 *   adminBalanceBefore
 * );
 * ```
 */

