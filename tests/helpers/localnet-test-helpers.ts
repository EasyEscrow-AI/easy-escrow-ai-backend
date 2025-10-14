/**
 * Localnet Test Helpers
 * Utility functions for localnet testing
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";

/**
 * Load a keypair from a JSON file
 */
export function loadKeypair(filepath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(filepath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

/**
 * Airdrop SOL to an account
 */
export async function airdropSol(
  connection: Connection,
  publicKey: PublicKey,
  amount: number
): Promise<void> {
  const signature = await connection.requestAirdrop(publicKey, amount);
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    signature,
    ...latestBlockhash,
  });
}

/**
 * Create a test token mint
 */
export async function createTestMint(
  connection: Connection,
  payer: Keypair,
  decimals: number = 6
): Promise<PublicKey> {
  return await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    decimals
  );
}

/**
 * Create a test NFT mint (0 decimals, supply of 1)
 */
export async function createTestNft(
  connection: Connection,
  owner: Keypair
): Promise<{ mint: PublicKey; tokenAccount: PublicKey }> {
  const mint = await createMint(
    connection,
    owner,
    owner.publicKey,
    null,
    0 // NFTs have 0 decimals
  );

  const tokenAccountInfo = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mint,
    owner.publicKey
  );

  await mintTo(
    connection,
    owner,
    mint,
    tokenAccountInfo.address,
    owner.publicKey,
    1 // Mint exactly 1 NFT
  );

  return {
    mint,
    tokenAccount: tokenAccountInfo.address,
  };
}

/**
 * Setup test accounts with USDC tokens
 */
export async function setupTestAccounts(
  connection: Connection,
  usdcMint: PublicKey,
  ...accounts: { keypair: Keypair; amount: number }[]
): Promise<{ keypair: Keypair; tokenAccount: PublicKey }[]> {
  const result = [];

  for (const account of accounts) {
    const tokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      account.keypair,
      usdcMint,
      account.keypair.publicKey
    );

    await mintTo(
      connection,
      account.keypair,
      usdcMint,
      tokenAccountInfo.address,
      account.keypair.publicKey,
      account.amount * 1_000_000 // Convert to USDC units
    );

    result.push({
      keypair: account.keypair,
      tokenAccount: tokenAccountInfo.address,
    });
  }

  return result;
}

/**
 * Derive agreement PDA
 */
export async function deriveAgreementPda(
  programId: PublicKey,
  seller: PublicKey,
  agreementId: anchor.BN
): Promise<[PublicKey, number]> {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from("agreement"),
      seller.toBuffer(),
      agreementId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
}

/**
 * Derive USDC vault PDA
 */
export async function deriveUsdcVaultPda(
  programId: PublicKey,
  agreementPda: PublicKey
): Promise<[PublicKey, number]> {
  return await PublicKey.findProgramAddress(
    [Buffer.from("usdc_vault"), agreementPda.toBuffer()],
    programId
  );
}

/**
 * Derive NFT vault PDA
 */
export async function deriveNftVaultPda(
  programId: PublicKey,
  agreementPda: PublicKey
): Promise<[PublicKey, number]> {
  return await PublicKey.findProgramAddress(
    [Buffer.from("nft_vault"), agreementPda.toBuffer()],
    programId
  );
}

/**
 * Wait for a specified time
 */
export async function wait(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Generate test data for edge cases
 */
export interface EdgeCaseTestData {
  name: string;
  description: string;
  setup: () => Promise<void>;
  execute: () => Promise<void>;
  verify: () => Promise<void>;
}

/**
 * Test matrix builder for systematic testing
 */
export class TestMatrix {
  private tests: EdgeCaseTestData[] = [];

  add(test: EdgeCaseTestData): TestMatrix {
    this.tests.push(test);
    return this;
  }

  async runAll(): Promise<void> {
    for (const test of this.tests) {
      console.log(`\n🧪 Testing: ${test.name}`);
      console.log(`   ${test.description}`);
      
      await test.setup();
      await test.execute();
      await test.verify();
      
      console.log(`   ✅ ${test.name} passed`);
    }
  }

  getTests(): EdgeCaseTestData[] {
    return this.tests;
  }
}

/**
 * Generate multiple test keypairs
 */
export function generateTestKeypairs(count: number): Keypair[] {
  return Array.from({ length: count }, () => Keypair.generate());
}

/**
 * Calculate expected platform fee
 */
export function calculatePlatformFee(amount: number, feeBps: number): number {
  return Math.floor((amount * feeBps) / 10000);
}

/**
 * Calculate expected seller amount after fee
 */
export function calculateSellerAmount(amount: number, feeBps: number): number {
  return amount - calculatePlatformFee(amount, feeBps);
}

/**
 * Format test results
 */
export interface TestResult {
  testName: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: string;
}

export function formatTestResults(results: TestResult[]): string {
  const passed = results.filter(r => r.status === "passed").length;
  const failed = results.filter(r => r.status === "failed").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const total = results.length;

  return `
Test Results Summary
====================
Total:   ${total}
Passed:  ${passed} ✅
Failed:  ${failed} ❌
Skipped: ${skipped} ⏭️

${failed > 0 ? "\nFailed Tests:\n" + results
  .filter(r => r.status === "failed")
  .map(r => `  - ${r.testName}: ${r.error}`)
  .join("\n") : ""}
`;
}

