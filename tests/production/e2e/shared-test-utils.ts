/**
 * Shared Test Utilities for PRODUCTION E2E Tests
 * 
 * Common functions, types, and configurations used across all PRODUCTION E2E test scenarios.
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  Transaction, 
  sendAndConfirmTransaction,
  ComputeBudgetProgram 
} from '@solana/web3.js';
import { 
  getOrCreateAssociatedTokenAccount, 
  getAccount, 
  createMint, 
  mintTo, 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction 
} from '@solana/spl-token';
import { Metaplex, Nft, Sft } from '@metaplex-foundation/js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { PRODUCTION_CONFIG } from './test-config';

// Re-export configuration for use in test files
export { PRODUCTION_CONFIG };

// ============================================================================
// TYPES
// ============================================================================

export interface PRODUCTIONWallets {
  sender: Keypair;
  receiver: Keypair;
  admin: Keypair;
  feeCollector: Keypair;
}

export interface TestAgreement {
  agreementId: string;
  escrowPda: string;
  depositAddresses: {
    usdc: string;
    nft: string;
  };
  transactionId?: string;
}

export interface TestNFT {
  mint: PublicKey;
  tokenAccount: PublicKey;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
}

// ============================================================================
// WALLET MANAGEMENT
// ============================================================================

/**
 * Load PRODUCTION wallet keypairs from files
 */
export function loadPRODUCTIONWallets(): PRODUCTIONWallets {
  const walletDir = path.join(__dirname, '../../../wallets/production');
  
  const loadKeypair = (filename: string): Keypair => {
    const filepath = path.join(walletDir, filename);
    if (!fs.existsSync(filepath)) {
      throw new Error(`Wallet file not found: ${filepath}`);
    }
    const keypairData = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keypairData));
  };

  return {
    sender: loadKeypair('mainnet-sender.json'),
    receiver: loadKeypair('mainnet-receiver.json'),
    admin: loadKeypair('mainnet-admin.json'),
    feeCollector: loadKeypair('mainnet-admin.json'), // Using admin as fee collector for now
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique idempotency key
 */
export function generateIdempotencyKey(prefix: string = 'PRODUCTION-e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Get Solana explorer URL
 */
export function getExplorerUrl(address: string, type: 'address' | 'tx' = 'tx'): string {
  return `https://explorer.solana.com/${type}/${address}?cluster=${PRODUCTION_CONFIG.network}`;
}

/**
 * Wait for agreement status
 */
export async function waitForAgreementStatus(
  agreementId: string,
  targetStatus: string,
  maxAttempts: number = 30,
  intervalMs: number = 1000
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(
        `${PRODUCTION_CONFIG.apiBaseUrl}/v1/agreements/${agreementId}`
      );
      
      const status = response.data.data.status;
      console.log(`   [${i + 1}/${maxAttempts}] Status: ${status}`);
      
      if (status === targetStatus) {
        return response.data.data;
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error: any) {
      console.error(`   ⚠️  Error checking status: ${error.message}`);
    }
  }
  
  throw new Error(`Timeout waiting for status ${targetStatus} after ${maxAttempts} attempts`);
}

/**
 * Get token balance with proper decimal handling
 */
export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<number> {
  try {
    const accountInfo = await getAccount(connection, tokenAccount);
    const mintInfo = await connection.getParsedAccountInfo(accountInfo.mint);
    const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals || 0;
    return Number(accountInfo.amount) / Math.pow(10, decimals);
  } catch (error) {
    return 0;
  }
}

// ============================================================================
// NFT OPERATIONS
// ============================================================================

/**
 * Get a random NFT owned by the wallet
 * This is preferred for production tests to avoid creating unnecessary NFTs
 */
export async function getRandomNFTFromWallet(
  connection: Connection,
  owner: Keypair
): Promise<TestNFT> {
  console.log('   🔍 Fetching NFTs owned by wallet...');
  console.log(`   Wallet: ${owner.publicKey.toBase58()}`);
  
  const metaplex = Metaplex.make(connection);
  
  try {
    // Find all NFTs owned by the wallet (returns metadata only)
    const nftsRaw = await metaplex.nfts().findAllByOwner({
      owner: owner.publicKey,
    });
    
    console.log(`   ✅ Found ${nftsRaw.length} tokens`);
    
    if (nftsRaw.length === 0) {
      throw new Error(
        `No tokens found in wallet ${owner.publicKey.toBase58()}. ` +
        `Please ensure the sender wallet has at least one NFT.`
      );
    }
    
    // Load full NFT data for each token
    console.log(`   Loading full NFT data...`);
    const nftsPromises = nftsRaw.map(async (item) => {
      try {
        // Get mint address - different property names depending on type
        const mintAddress = 'mintAddress' in item ? item.mintAddress : item.mint.address;
        const nft = await metaplex.nfts().load({ metadata: item as any });
        return nft;
      } catch (err: any) {
        const mintAddr = 'mintAddress' in item ? item.mintAddress.toBase58() : item.mint.address.toBase58();
        console.warn(`   ⚠️  Failed to load NFT ${mintAddr}: ${err.message}`);
        return null;
      }
    });
    
    const nftsLoaded = await Promise.all(nftsPromises);
    const nfts = nftsLoaded.filter((item): item is Nft | Sft => item !== null);
    
    console.log(`   ✅ Loaded ${nfts.length} NFTs/SFTs with full data`);
    
    if (nfts.length === 0) {
      throw new Error(
        `Found ${nftsRaw.length} tokens but none could be loaded. ` +
        `Please ensure the sender wallet has at least one actual NFT.`
      );
    }
    
    // Filter for actual NFTs (supply = 1)
    const actualNfts = nfts.filter(
      nft => nft.mint.supply.basisPoints.toNumber() === 1
    );
    
    if (actualNfts.length === 0) {
      throw new Error(
        `Found ${nfts.length} tokens but none are NFTs (supply=1). ` +
        `Please ensure the sender wallet has at least one actual NFT.`
      );
    }
    
    console.log(`   ✅ Found ${actualNfts.length} actual NFTs (supply=1)`);
    
    // Randomly select an NFT
    const randomIndex = Math.floor(Math.random() * actualNfts.length);
    const selectedNft = actualNfts[randomIndex];
    
    console.log(`   🎲 Randomly selected NFT #${randomIndex + 1}/${actualNfts.length}`);
    console.log(`   NFT Mint: ${selectedNft.mint.address.toBase58()}`);
    console.log(`   Name: ${selectedNft.name}`);
    console.log(`   Symbol: ${selectedNft.symbol}`);
    
    // Get the token account for this NFT
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      owner,
      selectedNft.mint.address,
      owner.publicKey
    );
    
    console.log(`   Token Account: ${tokenAccount.address.toBase58()}`);
    
    return {
      mint: selectedNft.mint.address,
      tokenAccount: tokenAccount.address,
      metadata: {
        name: selectedNft.name,
        symbol: selectedNft.symbol,
        uri: selectedNft.uri,
      },
    };
  } catch (error: any) {
    console.error('   ❌ Error fetching NFTs:', error.message);
    throw new Error(
      `Failed to fetch NFTs from wallet: ${error.message}. ` +
      `Ensure the wallet has NFTs and RPC endpoint is working.`
    );
  }
}

/**
 * Create real test NFT on Mainnet using SPL Token
 * ⚠️ WARNING: Only use this if absolutely necessary! 
 * Creates a new NFT on mainnet which costs SOL and creates permanent on-chain data.
 * Prefer using getRandomNFTFromWallet() instead.
 */
export async function createTestNFT(
  connection: Connection,
  owner: Keypair
): Promise<TestNFT> {
  console.log('   🎨 Creating real NFT on Mainnet...');
  
  // Create NFT mint (supply of 1, 0 decimals)
  const nftMint = await createMint(
    connection,
    owner,
    owner.publicKey, // mint authority
    null, // freeze authority
    0 // decimals (NFTs have 0 decimals)
  );
  
  console.log(`   ✅ NFT Mint created: ${nftMint.toBase58()}`);
  
  // Wait for mint to be confirmed on-chain
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Create token account for owner
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    nftMint,
    owner.publicKey
  );
  
  console.log(`   ✅ Token account created: ${tokenAccount.address.toBase58()}`);
  
  // Mint 1 NFT to owner
  await mintTo(
    connection,
    owner,
    nftMint,
    tokenAccount.address,
    owner.publicKey,
    1 // mint 1 NFT
  );
  
  console.log(`   ✅ Minted 1 NFT to owner`);
  
  // Wait for mint transaction to confirm
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    mint: nftMint,
    tokenAccount: tokenAccount.address,
    metadata: {
      name: `PRODUCTION Test NFT ${Date.now()}`,
      symbol: 'STNFT',
      uri: 'https://example.com/nft/metadata.json',
    },
  };
}

// ============================================================================
// TOKEN ACCOUNT SETUP
// ============================================================================

/**
 * Create or get USDC token accounts and verify balances
 */
export async function setupUSDCAccounts(
  connection: Connection,
  usdcMint: PublicKey,
  sender: Keypair,
  receiver: Keypair,
  feeCollector?: Keypair,
  admin?: Keypair  // Optional admin wallet to pay for rent
): Promise<{ senderAccount: PublicKey; receiverAccount: PublicKey; feeCollectorAccount?: PublicKey }> {
  console.log('   💰 Setting up USDC accounts...');
  
  // Use admin as payer if provided, otherwise sender pays
  const rentPayer = admin || sender;
  console.log(`   💳 Rent payer: ${rentPayer.publicKey.toBase58()} ${admin ? '(admin/platform)' : '(sender)'}`);
  
  // Helper function with retry logic for account creation
  async function createAccountWithRetry(
    owner: PublicKey,
    maxRetries = 3
  ): Promise<PublicKey> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`   🔄 Attempting to create/get USDC account for ${owner.toBase58()} (attempt ${attempt}/${maxRetries})...`);
        
        // Get the ATA address
        const ataAddress = await getAssociatedTokenAddress(
          usdcMint,
          owner,
          false, // allowOwnerOffCurve
          TOKEN_PROGRAM_ID
        );
        
        console.log(`   📍 Derived ATA address: ${ataAddress.toBase58()}`);
        
        // Try to fetch the account
        let accountExists = false;
        try {
          await getAccount(connection, ataAddress, 'confirmed');
          accountExists = true;
          console.log(`   ✅ Account already exists!`);
        } catch (fetchError: any) {
          if (fetchError.name === 'TokenAccountNotFoundError') {
            console.log(`   ℹ️  Account doesn't exist, creating new one...`);
          } else {
            throw fetchError;
          }
        }
        
        // If account doesn't exist, create it
        if (!accountExists) {
          const transaction = new Transaction();
          
          // Add compute budget and priority fee for mainnet
          transaction.add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }) // 0.001 SOL priority fee
          );
          
          // Add the account creation instruction
          transaction.add(
            createAssociatedTokenAccountInstruction(
              rentPayer.publicKey, // payer (admin/platform pays rent)
              ataAddress, // ATA address
              owner, // owner
              usdcMint, // mint
              TOKEN_PROGRAM_ID
            )
          );
          
          console.log(`   📝 Sending create account transaction (platform pays rent + priority fee)...`);
          
          const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [rentPayer], // Admin signs and pays
            { 
              commitment: 'confirmed',
              skipPreflight: true, // Skip preflight to bypass tip account check
              maxRetries: 3
            }
          );
          
          console.log(`   ✅ Account created! Tx: ${signature}`);
          console.log(`   💰 Platform paid rent (~0.002 SOL) + priority fee (~0.0003 SOL)`);
        }
        
        // Wait a moment for the account to settle
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log(`   ✅ Account ready: ${ataAddress.toBase58()}`);
        
        return ataAddress;
      } catch (error: any) {
        const errorMsg = error?.message || error?.toString() || JSON.stringify(error) || 'Unknown error';
        console.log(`   ⚠️  Attempt ${attempt} failed: ${errorMsg}`);
        
        if (error?.logs) {
          console.log(`   📋 Error logs:`, error.logs);
        }
        
        if (attempt === maxRetries) {
          throw new Error(
            `Failed to create USDC account for ${owner.toBase58()} after ${maxRetries} attempts. ` +
            `Last error: ${errorMsg}. ` +
            `This usually means insufficient SOL for rent (~0.002 SOL needed) or RPC issues.`
          );
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    throw new Error('Unexpected error in createAccountWithRetry');
  }
  
  // Create accounts with retry logic (admin/platform pays for all)
  const senderAccount = await createAccountWithRetry(sender.publicKey);
  const receiverAccount = await createAccountWithRetry(receiver.publicKey);
  
  console.log(`   ✅ Sender USDC: ${senderAccount.toBase58()}`);
  console.log(`   ✅ Receiver USDC: ${receiverAccount.toBase58()}`);
  
  // Check receiver's existing USDC balance
  const receiverBalance = await getTokenBalance(connection, receiverAccount);
  console.log(`   💰 Receiver USDC Balance: ${receiverBalance.toFixed(6)} USDC`);
  
  if (receiverBalance > 0) {
    console.log(`   ✅ Using existing USDC (no minting needed!)`);
  } else {
    console.warn(`   ⚠️  Receiver has 0 USDC - tests may fail if USDC is required!`);
  }
  
  // Create fee collector account if provided
  let feeCollectorAccount: PublicKey | undefined;
  if (feeCollector) {
    feeCollectorAccount = await createAccountWithRetry(feeCollector.publicKey);
    console.log(`   ✅ Fee Collector USDC: ${feeCollectorAccount.toBase58()}`);
  }
  
  return {
    senderAccount,
    receiverAccount,
    feeCollectorAccount,
  };
}

/**
 * Verify receiver has sufficient USDC for test
 */
export async function verifyReceiverUSDCBalance(
  connection: Connection,
  receiverUsdcAccount: PublicKey,
  requiredAmount: number
): Promise<boolean> {
  const balance = await getTokenBalance(connection, receiverUsdcAccount);
  
  console.log(`\n   💰 Checking receiver USDC balance...`);
  console.log(`   Current: ${balance.toFixed(6)} USDC`);
  console.log(`   Required: ${requiredAmount.toFixed(6)} USDC`);
  
  if (balance >= requiredAmount) {
    console.log(`   ✅ Sufficient balance available!`);
    console.log(`   💡 Using existing USDC (no minting/transfer needed)\n`);
    return true;
  } else {
    const shortfall = requiredAmount - balance;
    console.error(`   ❌ Insufficient USDC balance!`);
    console.error(`   Shortfall: ${shortfall.toFixed(6)} USDC`);
    console.error(`   \n   Please fund receiver wallet: ${receiverUsdcAccount.toBase58()}`);
    console.error(`   With at least ${shortfall.toFixed(6)} USDC for tests to run\n`);
    throw new Error(
      `Insufficient USDC: Receiver has ${balance.toFixed(6)} USDC but needs ${requiredAmount.toFixed(6)} USDC. ` +
      `Please fund wallet ${receiverUsdcAccount.toBase58()} with ${shortfall.toFixed(6)} more USDC.`
    );
  }
}

// ============================================================================
// BALANCE TRACKING
// ============================================================================

/**
 * Get initial balances for all parties
 */
export async function getInitialBalances(
  connection: Connection,
  wallets: PRODUCTIONWallets,
  usdcAccounts: { 
    senderAccount: PublicKey; 
    receiverAccount: PublicKey; 
    feeCollectorAccount?: PublicKey 
  }
) {
  const senderUsdcBalance = await getTokenBalance(connection, usdcAccounts.senderAccount);
  const receiverUsdcBalance = await getTokenBalance(connection, usdcAccounts.receiverAccount);
  const feeCollectorUsdcBalance = usdcAccounts.feeCollectorAccount 
    ? await getTokenBalance(connection, usdcAccounts.feeCollectorAccount)
    : 0;
  
  return {
    sender: {
      sol: await connection.getBalance(wallets.sender.publicKey) / LAMPORTS_PER_SOL,
      usdc: senderUsdcBalance,
    },
    receiver: {
      sol: await connection.getBalance(wallets.receiver.publicKey) / LAMPORTS_PER_SOL,
      usdc: receiverUsdcBalance,
    },
    feeCollector: {
      sol: await connection.getBalance(wallets.feeCollector.publicKey) / LAMPORTS_PER_SOL,
      usdc: feeCollectorUsdcBalance,
    },
  };
}

/**
 * Display balance summary
 */
export function displayBalances(balances: any, label: string = 'Balances') {
  console.log(`\n${label}:`);
  console.log(`   Sender SOL: ${balances.sender.sol.toFixed(4)}, USDC: ${balances.sender.usdc.toFixed(6)}`);
  console.log(`   Receiver SOL: ${balances.receiver.sol.toFixed(4)}, USDC: ${balances.receiver.usdc.toFixed(6)}`);
  console.log(`   Fee Collector SOL: ${balances.feeCollector.sol.toFixed(4)}, USDC: ${balances.feeCollector.usdc.toFixed(6)}\n`);
}


