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
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
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
 * Parse Metaplex metadata from on-chain account data (fast, no off-chain fetch)
 * 
 * Metaplex Metadata V1 Structure:
 * - key (1 byte) - should be 4 for Metadata
 * - update_authority (32 bytes)
 * - mint (32 bytes)
 * - name (string with 4-byte length prefix + data)
 * - symbol (string with 4-byte length prefix + data)
 * - uri (string with 4-byte length prefix + data)
 * - seller_fee_basis_points (2 bytes)
 * - creators (optional)
 */
function parseMetaplexMetadata(data: Buffer): { name: string; symbol: string; uri: string } | null {
  try {
    let offset = 0;
    
    // Validate minimum buffer size
    if (data.length < 65) { // 1 byte key + 64 bytes for authorities
      return null;
    }
    
    // Read key (should be 4 for Metadata)
    const key = data.readUInt8(offset);
    offset += 1;
    
    if (key !== 4) {
      return null;
    }
    
    // Skip update authority (32 bytes) and mint (32 bytes)
    offset += 64;
    
    // Helper function to safely read a string
    const readString = (): string => {
      // Validate we can read the length
      if (offset + 4 > data.length) {
        throw new Error('Buffer overflow: cannot read string length');
      }
      
      const length = data.readUInt32LE(offset);
      offset += 4;
      
      // Validate the string data is within buffer bounds
      if (offset + length > data.length) {
        throw new Error(`Buffer overflow: string length ${length} exceeds buffer size`);
      }
      
      const str = data.slice(offset, offset + length).toString('utf8').replace(/\0/g, '').trim();
      offset += length;
      return str;
    };
    
    // Read name, symbol, and uri with bounds checking
    const name = readString();
    const symbol = readString();
    const uri = readString();
    
    return { name, symbol, uri };
  } catch (error) {
    console.error('   Error parsing metadata:', error);
    return null;
  }
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
 * Supports ALL SPL Token NFTs (not just Metaplex NFTs)
 */
export async function getRandomNFTFromWallet(
  connection: Connection,
  owner: Keypair
): Promise<TestNFT> {
  console.log('   🔍 Fetching NFTs owned by wallet...');
  console.log(`   Wallet: ${owner.publicKey.toBase58()}`);
  
  try {
    // Find all token accounts owned by the wallet
    // This finds ALL SPL tokens, including NFTs without Metaplex metadata
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      owner.publicKey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );
    
    console.log(`   ✅ Found ${tokenAccounts.value.length} token accounts`);
    
    // Filter for NFTs: decimals=0 and amount=1
    const nftAccounts = tokenAccounts.value.filter(
      acc => acc.account.data.parsed.info.tokenAmount.decimals === 0 &&
             acc.account.data.parsed.info.tokenAmount.uiAmount === 1
    );
    
    console.log(`   ✅ Found ${nftAccounts.length} NFTs (decimals=0, amount=1)`);
    
    if (nftAccounts.length === 0) {
      throw new Error(
        `No NFTs found in wallet ${owner.publicKey.toBase58()}. ` +
        `Please ensure the sender wallet has at least one NFT (SPL token with decimals=0 and amount=1).`
      );
    }
    
    // Randomly select an NFT
    const randomIndex = Math.floor(Math.random() * nftAccounts.length);
    const selectedAccount = nftAccounts[randomIndex];
    const mintAddress = new PublicKey(selectedAccount.account.data.parsed.info.mint);
    
    console.log(`   🎲 Randomly selected NFT #${randomIndex + 1}/${nftAccounts.length}`);
    console.log(`   NFT Mint: ${mintAddress.toBase58()}`);
    console.log(`   Token Account: ${selectedAccount.pubkey.toBase58()}`);
    
    // Fetch on-chain metadata only (fast, no off-chain IPFS/Arweave fetch)
    let metadata = {
      name: 'Unknown NFT',
      symbol: 'NFT',
      uri: '',
    };
    
    try {
      // Derive metadata PDA
      const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mintAddress.toBuffer()],
        METADATA_PROGRAM_ID
      );
      
      // Fetch on-chain account data (fast - no off-chain fetch)
      const accountInfo = await connection.getAccountInfo(metadataPDA);
      
      if (accountInfo) {
        // Parse basic fields from on-chain data
        const parsedMetadata = parseMetaplexMetadata(accountInfo.data);
        if (parsedMetadata) {
          metadata = {
            name: parsedMetadata.name || 'Unknown NFT',
            symbol: parsedMetadata.symbol || 'NFT',
            uri: parsedMetadata.uri || '',
          };
          console.log(`   📋 Loaded on-chain metadata: ${metadata.name} (${(accountInfo.data.length / 1024).toFixed(2)} KB)`);
        } else {
          console.log(`   ℹ️  Could not parse metadata (using SPL token as-is)`);
        }
      } else {
        console.log(`   ℹ️  No Metaplex metadata (using SPL token as-is)`);
      }
    } catch (err) {
      console.log(`   ℹ️  Error fetching metadata (using SPL token as-is)`);
    }
    
    return {
      mint: mintAddress,
      tokenAccount: selectedAccount.pubkey,
      metadata,
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
  
  try {
    // Create NFT mint (supply of 1, 0 decimals) with skipPreflight for mainnet
    console.log('   📝 Creating NFT mint...');
    const mintKeypair = Keypair.generate();
    
    // Build mint transaction
    const mintTransaction = new Transaction();
    
    // Add compute budget and priority fee for mainnet
    mintTransaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })
    );
    
    // Add create mint instruction
    const { SystemProgram } = await import('@solana/web3.js');
    const { createInitializeMintInstruction, MINT_SIZE, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
    
    const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    
    mintTransaction.add(
      SystemProgram.createAccount({
        fromPubkey: owner.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        0, // 0 decimals for NFT
        owner.publicKey, // mint authority
        null, // freeze authority
        TOKEN_PROGRAM_ID
      )
    );
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    mintTransaction.recentBlockhash = blockhash;
    mintTransaction.feePayer = owner.publicKey;
    
    // Sign transaction
    mintTransaction.sign(owner, mintKeypair);
    
    // Submit via Jito Block Engine (required for mainnet)
    console.log(`   📡 Sending mint transaction via Jito Block Engine...`);
    const serializedMintTx = mintTransaction.serialize().toString('base64');
    
    const jitoResponse = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [serializedMintTx, { encoding: 'base64' }],
      }),
    });
    
    if (!jitoResponse.ok) {
      const errorText = await jitoResponse.text();
      throw new Error(`Jito Block Engine error: ${jitoResponse.status} ${errorText}`);
    }
    
    const jitoResult = await jitoResponse.json() as { jsonrpc: string; id: number; result?: string; error?: any };
    if (jitoResult.error) {
      throw new Error(`Jito Block Engine error: ${JSON.stringify(jitoResult.error)}`);
    }
    
    const mintSig = jitoResult.result!;
    console.log(`   ✅ NFT Mint created: ${mintKeypair.publicKey.toBase58()}`);
    console.log(`   📤 Mint TX: ${mintSig}`);
    
    // Wait for confirmation
    await connection.confirmTransaction(mintSig, 'confirmed');
    console.log(`   ✅ Mint transaction confirmed`);
    
    // Wait a bit more for the account to be fully available
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create token account manually and submit via Jito
    console.log('   📝 Creating token account...');
    const tokenAccountAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      owner.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    
    // Check if account already exists
    let accountExists = false;
    try {
      await getAccount(connection, tokenAccountAddress, 'confirmed');
      accountExists = true;
      console.log(`   ✅ Token account already exists: ${tokenAccountAddress.toBase58()}`);
    } catch (err: any) {
      if (err.name !== 'TokenAccountNotFoundError') {
        console.log(`   ⚠️  Error checking account: ${err.message}`);
      }
    }
    
    if (!accountExists) {
      // Build token account creation transaction
      const createAccountTx = new Transaction();
      
      createAccountTx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })
      );
      
      createAccountTx.add(
        createAssociatedTokenAccountInstruction(
          owner.publicKey, // payer
          tokenAccountAddress, // ATA address
          owner.publicKey, // owner
          mintKeypair.publicKey, // mint
          TOKEN_PROGRAM_ID
        )
      );
      
      // Get recent blockhash and sign
      const { blockhash: createAcctBlockhash } = await connection.getLatestBlockhash('finalized');
      createAccountTx.recentBlockhash = createAcctBlockhash;
      createAccountTx.feePayer = owner.publicKey;
      createAccountTx.sign(owner);
      
      // Submit via Jito
      console.log(`   📡 Sending create account transaction via Jito Block Engine...`);
      const serializedCreateAcctTx = createAccountTx.serialize().toString('base64');
      
      const jitoCreateAcctResponse = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendTransaction',
          params: [serializedCreateAcctTx, { encoding: 'base64' }],
        }),
      });
      
      if (!jitoCreateAcctResponse.ok) {
        const errorText = await jitoCreateAcctResponse.text();
        throw new Error(`Jito Block Engine error: ${jitoCreateAcctResponse.status} ${errorText}`);
      }
      
      const jitoCreateAcctResult = await jitoCreateAcctResponse.json() as { jsonrpc: string; id: number; result?: string; error?: any };
      if (jitoCreateAcctResult.error) {
        throw new Error(`Jito Block Engine error: ${JSON.stringify(jitoCreateAcctResult.error)}`);
      }
      
      const createAcctSig = jitoCreateAcctResult.result!;
      console.log(`   ✅ Token account created: ${tokenAccountAddress.toBase58()}`);
      console.log(`   📤 Create account TX: ${createAcctSig}`);
      
      // Wait for confirmation
      await connection.confirmTransaction(createAcctSig, 'confirmed');
      console.log(`   ✅ Create account transaction confirmed`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Build mint-to transaction
    console.log('   📝 Minting NFT to token account...');
    const mintToTransaction = new Transaction();
    
    mintToTransaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })
    );
    
    const { createMintToInstruction } = await import('@solana/spl-token');
    mintToTransaction.add(
      createMintToInstruction(
        mintKeypair.publicKey, // mint
        tokenAccountAddress, // destination
        owner.publicKey, // mint authority
        1, // amount (1 NFT)
        [],
        TOKEN_PROGRAM_ID
      )
    );
    
    // Get recent blockhash and sign
    const { blockhash: mintToBlockhash } = await connection.getLatestBlockhash('finalized');
    mintToTransaction.recentBlockhash = mintToBlockhash;
    mintToTransaction.feePayer = owner.publicKey;
    mintToTransaction.sign(owner);
    
    // Submit via Jito
    console.log(`   📡 Sending mint-to transaction via Jito Block Engine...`);
    const serializedMintToTx = mintToTransaction.serialize().toString('base64');
    
    const jitoMintToResponse = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [serializedMintToTx, { encoding: 'base64' }],
      }),
    });
    
    if (!jitoMintToResponse.ok) {
      const errorText = await jitoMintToResponse.text();
      throw new Error(`Jito Block Engine error: ${jitoMintToResponse.status} ${errorText}`);
    }
    
    const jitoMintToResult = await jitoMintToResponse.json() as { jsonrpc: string; id: number; result?: string; error?: any };
    if (jitoMintToResult.error) {
      throw new Error(`Jito Block Engine error: ${JSON.stringify(jitoMintToResult.error)}`);
    }
    
    const mintToSig = jitoMintToResult.result!;
    console.log(`   ✅ Minted 1 NFT to owner`);
    console.log(`   📤 Mint-to TX: ${mintToSig}`);
    
    // Wait for confirmation
    await connection.confirmTransaction(mintToSig, 'confirmed');
    console.log(`   ✅ Mint-to transaction confirmed`);
    
    // Wait for mint transaction to confirm
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      mint: mintKeypair.publicKey,
      tokenAccount: tokenAccountAddress,
      metadata: {
        name: `PRODUCTION Test NFT ${Date.now()}`,
        symbol: 'STNFT',
        uri: 'https://example.com/nft/metadata.json',
      },
    };
  } catch (error: any) {
    console.error('   ❌ Failed to create NFT:', error.message);
    if (error.logs) {
      console.error('   📋 Error logs:', error.logs);
    }
    throw new Error(`Failed to create test NFT: ${error.message}`);
  }
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

// ============================================================================
// TEST CLEANUP
// ============================================================================

// Initialize Prisma client for direct database access during cleanup
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

/**
 * Archive test agreements for cleanup
 * Archives (soft deletes) agreements that were created during E2E tests
 * Uses direct database access - no API authentication needed
 * 
 * Archived agreements:
 * - Status set to ARCHIVED
 * - Automatically excluded from monitoring service
 * - Can be queried for analytics
 * - Can be restored if needed
 */
export async function archiveAgreements(agreementIds: string[]): Promise<void> {
  if (agreementIds.length === 0) {
    return;
  }
  
  console.log(`\n🗄️ Archiving ${agreementIds.length} test agreements...`);
  
  try {
    // Direct database update - no API, no auth needed!
    const result = await prisma.agreement.updateMany({
      where: {
        agreementId: {
          in: agreementIds
        }
      },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        archiveReason: 'E2E test cleanup'
      }
    });
    
    console.log(`   ✅ Archived ${result.count} agreement(s)`);
    
    if (result.count < agreementIds.length) {
      const notFound = agreementIds.length - result.count;
      console.log(`   ℹ️  ${notFound} agreement(s) not found (may have been deleted or already archived)`);
    }
    
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Archive failed:`, error?.message || error);
    console.log('');
  } finally {
    // Disconnect Prisma client
    await prisma.$disconnect();
  }
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use archiveAgreements instead
 */
export async function cleanupAgreements(agreementIds: string[]): Promise<void> {
  return archiveAgreements(agreementIds);
}


