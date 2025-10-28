/**
 * USDC Account Management Service
 * 
 * Handles automatic creation of USDC token accounts for users
 * Platform pays rent to provide seamless UX
 */

import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  SystemProgram,
  Keypair,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { config } from '../config';
import { getSolanaService } from './solana.service';

/**
 * Load admin keypair from environment variables
 * Same logic as EscrowProgramService
 */
function loadAdminKeypair(): Keypair {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Determine which env var to use based on NODE_ENV
  let envName = 'DEVNET_ADMIN_PRIVATE_KEY'; // default to devnet
  
  if (nodeEnv === 'production' || nodeEnv === 'mainnet') {
    envName = 'MAINNET_ADMIN_PRIVATE_KEY';
  } else if (nodeEnv === 'staging') {
    envName = 'DEVNET_STAGING_ADMIN_PRIVATE_KEY';
  }
  
  const envValue = process.env[envName];
  
  if (!envValue) {
    throw new Error(`[UsdcAccountService] Missing ${envName} environment variable for NODE_ENV=${nodeEnv}`);
  }
  
  try {
    // Try JSON array format [1, 2, 3, ..., 64]
    if (envValue.startsWith('[')) {
      const secretKey = Uint8Array.from(JSON.parse(envValue));
      const keypair = Keypair.fromSecretKey(secretKey);
      console.log(`[UsdcAccountService] Loaded admin keypair from ${envName} (${nodeEnv}): ${keypair.publicKey.toString()}`);
      return keypair;
    }
    
    // Try Base58 format (Solana standard)
    const secretKey = bs58.decode(envValue);
    if (secretKey.length === 64) {
      const keypair = Keypair.fromSecretKey(secretKey);
      console.log(`[UsdcAccountService] Loaded admin keypair from ${envName} (${nodeEnv}): ${keypair.publicKey.toString()}`);
      return keypair;
    }
    
    // Try Base64 format
    const base64Key = Buffer.from(envValue, 'base64');
    if (base64Key.length === 64) {
      const keypair = Keypair.fromSecretKey(base64Key);
      console.log(`[UsdcAccountService] Loaded admin keypair from ${envName} (${nodeEnv}): ${keypair.publicKey.toString()}`);
      return keypair;
    }
    
    throw new Error('Invalid private key format');
  } catch (error) {
    throw new Error(`[UsdcAccountService] Failed to load admin keypair: ${error}`);
  }
}

/**
 * Check if a USDC account exists for a wallet
 */
export async function checkUSDCAccountExists(
  connection: Connection,
  walletAddress: PublicKey,
  usdcMint: PublicKey
): Promise<{ exists: boolean; address: PublicKey }> {
  try {
    // Derive the ATA address
    const ataAddress = await getAssociatedTokenAddress(
      usdcMint,
      walletAddress,
      false, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID
    );

    // Try to fetch the account
    try {
      await getAccount(connection, ataAddress, 'confirmed');
      return { exists: true, address: ataAddress };
    } catch (error: any) {
      if (error.name === 'TokenAccountNotFoundError') {
        return { exists: false, address: ataAddress };
      }
      throw error;
    }
  } catch (error) {
    console.error('Error checking USDC account:', error);
    throw new Error(`Failed to check USDC account: ${error}`);
  }
}

/**
 * Create USDC account for a user (platform pays rent)
 * Handles QuickNode endpoints with or without Jito requirements
 */
export async function createUSDCAccountForUser(
  connection: Connection,
  userWalletAddress: PublicKey,
  usdcMint: PublicKey,
  maxRetries: number = 3
): Promise<{ 
  address: PublicKey; 
  signature: string | null; 
  alreadyExisted: boolean 
}> {
  console.log(`📝 Creating USDC account for user: ${userWalletAddress.toBase58()}`);

  // Get admin keypair (platform pays)
  const adminKeypair = loadAdminKeypair();

  // Derive ATA address
  const ataAddress = await getAssociatedTokenAddress(
    usdcMint,
    userWalletAddress,
    false,
    TOKEN_PROGRAM_ID
  );

  console.log(`📍 ATA address: ${ataAddress.toBase58()}`);

  // Check if account already exists
  try {
    await getAccount(connection, ataAddress, 'confirmed');
    console.log(`✅ USDC account already exists for user`);
    return { 
      address: ataAddress, 
      signature: null, 
      alreadyExisted: true 
    };
  } catch (error: any) {
    if (error.name !== 'TokenAccountNotFoundError') {
      throw error;
    }
    console.log(`ℹ️  Account doesn't exist, creating new one...`);
  }

  // Account doesn't exist, create it with retries
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries} to create USDC account...`);

      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = 
        await connection.getLatestBlockhash('confirmed');

      // Create transaction
      const transaction = new Transaction({
        feePayer: adminKeypair.publicKey,
        blockhash,
        lastValidBlockHeight,
      });

      // Add compute budget instructions (required for mainnet)
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }) // Moderate priority
      );

      // Add account creation instruction
      transaction.add(
        createAssociatedTokenAccountInstruction(
          adminKeypair.publicKey, // payer (platform pays)
          ataAddress, // account to create
          userWalletAddress, // owner
          usdcMint, // mint
          TOKEN_PROGRAM_ID
        )
      );

      // Sign and send with skipPreflight to avoid Jito tip requirement
      console.log(`📤 Sending transaction (platform pays rent)...`);
      
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [adminKeypair],
        {
          commitment: 'confirmed',
          skipPreflight: true, // Skip preflight to bypass Jito tip checks
          maxRetries: 0, // We handle retries manually
        }
      );

      console.log(`✅ USDC account created successfully!`);
      console.log(`📝 Transaction: ${signature}`);
      console.log(`💰 Platform paid ~0.002 SOL rent`);

      return { 
        address: ataAddress, 
        signature, 
        alreadyExisted: false 
      };

    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      console.log(`⚠️  Attempt ${attempt} failed: ${errorMsg}`);

      if (attempt < maxRetries) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // All retries failed
  throw new Error(
    `Failed to create USDC account after ${maxRetries} attempts. ` +
    `Last error: ${lastError?.message || 'Unknown'}. ` +
    `User may need to create their USDC account manually or ensure platform admin wallet has sufficient SOL.`
  );
}

/**
 * Ensure USDC accounts exist for both seller and buyer
 * Creates them if needed (platform pays)
 * 
 * Call this at the START of agreement creation
 */
export async function ensureUSDCAccountsExist(
  connection: Connection,
  sellerAddress: PublicKey,
  buyerAddress: PublicKey,
  usdcMint: PublicKey
): Promise<{
  sellerAccount: PublicKey;
  buyerAccount: PublicKey;
  accountsCreated: {
    seller: boolean;
    buyer: boolean;
  };
}> {
  console.log('\n💰 Ensuring USDC accounts exist for both parties...\n');

  // Check and create seller account
  console.log('👤 Checking seller USDC account...');
  const sellerResult = await createUSDCAccountForUser(
    connection,
    sellerAddress,
    usdcMint
  );

  // Check and create buyer account
  console.log('\n👤 Checking buyer USDC account...');
  const buyerResult = await createUSDCAccountForUser(
    connection,
    buyerAddress,
    usdcMint
  );

  console.log('\n✅ All USDC accounts ready!');
  console.log(`   Seller: ${sellerResult.address.toBase58()} ${sellerResult.alreadyExisted ? '(existed)' : '(created)'}`);
  console.log(`   Buyer: ${buyerResult.address.toBase58()} ${buyerResult.alreadyExisted ? '(existed)' : '(created)'}\n`);

  return {
    sellerAccount: sellerResult.address,
    buyerAccount: buyerResult.address,
    accountsCreated: {
      seller: !sellerResult.alreadyExisted,
      buyer: !buyerResult.alreadyExisted,
    },
  };
}

/**
 * Get USDC balance for a wallet
 */
export async function getUSDCBalance(
  connection: Connection,
  walletAddress: PublicKey,
  usdcMint: PublicKey
): Promise<number> {
  try {
    const ataAddress = await getAssociatedTokenAddress(
      usdcMint,
      walletAddress,
      false,
      TOKEN_PROGRAM_ID
    );

    const account = await getAccount(connection, ataAddress, 'confirmed');
    
    // USDC has 6 decimals
    return Number(account.amount) / 1_000_000;
  } catch (error: any) {
    if (error.name === 'TokenAccountNotFoundError') {
      return 0;
    }
    throw error;
  }
}

