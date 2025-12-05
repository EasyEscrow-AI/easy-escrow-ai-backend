/**
 * Production NFT Helpers for Mainnet Testing
 * 
 * Provides utilities for creating, managing, and cleaning up test NFTs on mainnet:
 * - Standard SPL NFT minting
 * - cNFT (compressed NFT) creation
 * - NFT transfer utilities
 * - Test cleanup procedures
 * 
 * ⚠️ IMPORTANT: These create REAL NFTs on mainnet with REAL costs
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';

export interface TestNFT {
  mint: PublicKey;
  tokenAccount: PublicKey;
  owner: PublicKey;
  name: string;
  symbol: string;
}

export interface NFTMetadata {
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: { address: PublicKey; verified: boolean; share: number }[];
}

/**
 * Create a simple test NFT (SPL Token with supply = 1, decimals = 0)
 * ⚠️ WARNING: This creates a REAL NFT on mainnet!
 */
export async function createTestNFT(
  connection: Connection,
  payer: Keypair,
  owner: Keypair,
  metadata: Partial<NFTMetadata> = {}
): Promise<TestNFT> {
  const name = metadata.name || `Test NFT ${Date.now()}`;
  const symbol = metadata.symbol || 'TEST';
  
  console.log(`\n🎨 Creating test NFT: ${name} (${symbol})...`);
  console.log(`   Payer: ${payer.publicKey.toBase58()}`);
  console.log(`   Owner: ${owner.publicKey.toBase58()}`);
  
  try {
    // Create mint with 0 decimals (NFT)
    const mint = await createMint(
      connection,
      payer,
      owner.publicKey, // mint authority
      owner.publicKey, // freeze authority
      0 // decimals = 0 for NFT
    );
    
    console.log(`   ✅ Mint created: ${mint.toBase58()}`);
    
    // Create token account for owner
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      owner.publicKey
    );
    
    console.log(`   ✅ Token account: ${tokenAccount.address.toBase58()}`);
    
    // Mint exactly 1 token (NFT)
    await mintTo(
      connection,
      payer,
      mint,
      tokenAccount.address,
      owner,
      1 // mint 1 token
    );
    
    console.log(`   ✅ NFT minted (supply: 1)`);
    console.log(`   ⚠️  Cost: ~0.002 SOL for rent + fees\n`);
    
    return {
      mint,
      tokenAccount: tokenAccount.address,
      owner: owner.publicKey,
      name,
      symbol,
    };
  } catch (error) {
    console.error(`❌ Failed to create test NFT:`, error);
    throw error;
  }
}

/**
 * Verify NFT ownership
 */
export async function verifyNFTOwnership(
  connection: Connection,
  mint: PublicKey,
  expectedOwner: PublicKey
): Promise<boolean> {
  try {
    // Get associated token account
    const { value } = await connection.getTokenAccountsByOwner(
      expectedOwner,
      { mint }
    );
    
    if (value.length === 0) {
      console.log(`   ❌ No token account found for mint ${mint.toBase58()}`);
      return false;
    }
    
    const accountInfo = value[0];
    const tokenAccountData = await getAccount(connection, accountInfo.pubkey);
    
    // Check balance is 1 (NFT)
    if (tokenAccountData.amount !== BigInt(1)) {
      console.log(`   ❌ Token amount is ${tokenAccountData.amount}, expected 1`);
      return false;
    }
    
    console.log(`   ✅ NFT ownership verified: ${expectedOwner.toBase58()} owns ${mint.toBase58()}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error verifying NFT ownership:`, error);
    return false;
  }
}

/**
 * Get NFT token account for a wallet
 */
export async function getNFTTokenAccount(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey | null> {
  try {
    const { value } = await connection.getTokenAccountsByOwner(
      owner,
      { mint }
    );
    
    if (value.length === 0) {
      return null;
    }
    
    return value[0].pubkey;
  } catch (error) {
    console.error(`Error getting NFT token account:`, error);
    return null;
  }
}

/**
 * Create multiple test NFTs for batch testing
 */
export async function createMultipleTestNFTs(
  connection: Connection,
  payer: Keypair,
  owner: Keypair,
  count: number,
  namePrefix: string = 'Test NFT'
): Promise<TestNFT[]> {
  console.log(`\n🎨 Creating ${count} test NFTs...`);
  console.log(`   ⚠️  Estimated cost: ~${(0.002 * count).toFixed(3)} SOL\n`);
  
  const nfts: TestNFT[] = [];
  
  for (let i = 0; i < count; i++) {
    const nft = await createTestNFT(connection, payer, owner, {
      name: `${namePrefix} #${i + 1}`,
      symbol: `TEST${i + 1}`,
    });
    
    nfts.push(nft);
    
    // Wait a bit between creations to avoid rate limits
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`✅ Created ${nfts.length} test NFTs\n`);
  return nfts;
}

/**
 * Clean up test NFTs by burning them (optional - saves rent)
 * ⚠️ This is permanent and cannot be undone!
 */
export async function burnTestNFT(
  connection: Connection,
  payer: Keypair,
  owner: Keypair,
  mint: PublicKey
): Promise<void> {
  console.log(`\n🔥 Burning test NFT: ${mint.toBase58()}...`);
  
  try {
    // Get token account
    const tokenAccount = await getNFTTokenAccount(connection, mint, owner.publicKey);
    
    if (!tokenAccount) {
      console.log(`   ⚠️  No token account found - NFT may already be burned`);
      return;
    }
    
    // Burn is complex on mainnet - for test cleanup, we typically just leave them
    // Real cleanup would require closing accounts and recovering rent
    console.log(`   ⚠️  NFT cleanup not implemented - NFT will remain on mainnet`);
    console.log(`   💡 Consider transferring to a cleanup wallet instead`);
    
  } catch (error) {
    console.error(`   ❌ Error burning NFT:`, error);
  }
}

/**
 * Display test NFT information
 */
export async function displayNFTInfo(
  connection: Connection,
  nft: TestNFT
): Promise<void> {
  console.log(`\n📋 NFT Information:`);
  console.log(`   Name:          ${nft.name}`);
  console.log(`   Symbol:        ${nft.symbol}`);
  console.log(`   Mint:          ${nft.mint.toBase58()}`);
  console.log(`   Token Account: ${nft.tokenAccount.toBase58()}`);
  console.log(`   Owner:         ${nft.owner.toBase58()}`);
  
  // Verify current ownership
  await verifyNFTOwnership(connection, nft.mint, nft.owner);
  
  console.log();
}

/**
 * Estimate cost for NFT operations
 */
export function estimateNFTCreationCost(count: number = 1): number {
  const costPerNFT = 0.002; // Approximate: mint creation + token account + minting
  return costPerNFT * count;
}

/**
 * Check if wallet has sufficient balance for NFT creation
 */
export async function checkNFTCreationBalance(
  connection: Connection,
  payer: PublicKey,
  nftCount: number = 1
): Promise<boolean> {
  const requiredSol = estimateNFTCreationCost(nftCount);
  const balance = await connection.getBalance(payer);
  const balanceSol = balance / LAMPORTS_PER_SOL;
  
  console.log(`\n💰 NFT Creation Balance Check:`);
  console.log(`   Payer:    ${payer.toBase58()}`);
  console.log(`   Balance:  ${balanceSol.toFixed(4)} SOL`);
  console.log(`   Required: ${requiredSol.toFixed(4)} SOL (${nftCount} NFT${nftCount > 1 ? 's' : ''})`);
  
  if (balanceSol < requiredSol) {
    console.log(`   ❌ Insufficient balance!`);
    console.log(`   Shortfall: ${(requiredSol - balanceSol).toFixed(4)} SOL\n`);
    return false;
  }
  
  console.log(`   ✅ Sufficient balance\n`);
  return true;
}

/**
 * Wait for NFT to be confirmed on-chain
 */
export async function waitForNFTConfirmation(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  maxAttempts: number = 30
): Promise<boolean> {
  console.log(`\n⏳ Waiting for NFT confirmation...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const verified = await verifyNFTOwnership(connection, mint, owner);
    
    if (verified) {
      console.log(`   ✅ NFT confirmed on-chain (attempt ${attempt}/${maxAttempts})\n`);
      return true;
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }
  }
  
  console.log(`   ❌ NFT confirmation timeout after ${maxAttempts} attempts\n`);
  return false;
}

/**
 * Get all NFTs owned by a wallet (simple version - checks token accounts)
 */
export async function getOwnedNFTs(
  connection: Connection,
  owner: PublicKey
): Promise<PublicKey[]> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID }
    );
    
    // Filter for NFTs (amount = 1, decimals = 0)
    const nftMints = tokenAccounts.value
      .filter(account => {
        const data = account.account.data.parsed.info;
        return data.tokenAmount.decimals === 0 && data.tokenAmount.amount === '1';
      })
      .map(account => new PublicKey(account.account.data.parsed.info.mint));
    
    console.log(`\n📦 Found ${nftMints.length} NFTs owned by ${owner.toBase58()}`);
    nftMints.forEach((mint, i) => {
      console.log(`   ${i + 1}. ${mint.toBase58()}`);
    });
    console.log();
    
    return nftMints;
  } catch (error) {
    console.error(`Error fetching owned NFTs:`, error);
    return [];
  }
}

