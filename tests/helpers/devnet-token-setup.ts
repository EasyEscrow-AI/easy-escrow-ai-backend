import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Token account structure for all wallets
 */
export interface TokenAccounts {
  sender: PublicKey;
  receiver: PublicKey;
  feeCollector: PublicKey;
}

/**
 * Token setup configuration
 */
export interface TokenSetupConfig {
  usdcMint: PublicKey;
  tokenAccounts: TokenAccounts;
  decimals: number;
}

/**
 * USDC token balance information
 */
export interface TokenBalances {
  sender: number;
  receiver: number;
  feeCollector: number;
}

/**
 * Create a devnet USDC mint (test token with 6 decimals like real USDC)
 * 
 * @param connection - Solana connection
 * @param payer - Payer for transaction fees
 * @param mintAuthority - Authority that can mint new tokens (defaults to payer)
 * @returns Public key of created mint
 */
export async function createDevnetUSDCMint(
  connection: Connection,
  payer: Keypair,
  mintAuthority?: Keypair
): Promise<PublicKey> {
  try {
    console.log('🪙  Creating devnet USDC mint...');
    
    const authority = mintAuthority || payer;
    
    const mint = await createMint(
      connection,
      payer,
      authority.publicKey,
      null, // No freeze authority
      6, // USDC has 6 decimals
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log(`✅ USDC mint created: ${mint.toString()}`);
    console.log(`   Explorer: https://explorer.solana.com/address/${mint.toString()}?cluster=devnet\n`);
    
    return mint;
  } catch (error) {
    throw new Error(`Failed to create USDC mint: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Setup token accounts for all wallets
 * Creates associated token accounts (ATA) for sender, receiver, and fee collector
 * 
 * @param connection - Solana connection
 * @param mint - Token mint address
 * @param wallets - Object containing all wallet keypairs
 * @param payer - Payer for transaction fees
 * @returns Object containing all token account addresses
 */
export async function setupTokenAccounts(
  connection: Connection,
  mint: PublicKey,
  wallets: {
    sender: Keypair;
    receiver: Keypair;
    feeCollector: Keypair;
  },
  payer: Keypair
): Promise<TokenAccounts> {
  try {
    console.log('🏦 Creating token accounts for all wallets...\n');

    // Create associated token accounts for all wallets
    const senderAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      wallets.sender.publicKey
    );
    console.log(`  ✅ Sender token account: ${senderAccount.address.toString()}`);

    const receiverAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      wallets.receiver.publicKey
    );
    console.log(`  ✅ Receiver token account: ${receiverAccount.address.toString()}`);

    const feeCollectorAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      wallets.feeCollector.publicKey
    );
    console.log(`  ✅ FeeCollector token account: ${feeCollectorAccount.address.toString()}\n`);

    return {
      sender: senderAccount.address,
      receiver: receiverAccount.address,
      feeCollector: feeCollectorAccount.address,
    };
  } catch (error) {
    throw new Error(`Failed to setup token accounts: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Mint USDC tokens to a specific wallet
 * 
 * @param connection - Solana connection
 * @param mint - Token mint address
 * @param tokenAccount - Destination token account
 * @param amount - Amount in USDC (e.g., 0.2 for 0.2 USDC)
 * @param authority - Mint authority keypair
 * @returns Transaction signature
 */
export async function mintUSDCToWallet(
  connection: Connection,
  mint: PublicKey,
  tokenAccount: PublicKey,
  amount: number,
  authority: Keypair
): Promise<string> {
  try {
    // Convert USDC amount to token amount (6 decimals)
    const tokenAmount = Math.floor(amount * 1_000_000);
    
    console.log(`💵 Minting ${amount} USDC to ${tokenAccount.toString()}...`);
    
    const signature = await mintTo(
      connection,
      authority,
      mint,
      tokenAccount,
      authority,
      tokenAmount
    );

    console.log(`  ✅ Minted ${amount} USDC`);
    console.log(`     Signature: ${signature}`);
    console.log(`     Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet\n`);
    
    return signature;
  } catch (error) {
    throw new Error(`Failed to mint USDC: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get token balance for an account
 * 
 * @param connection - Solana connection
 * @param tokenAccount - Token account address
 * @returns Balance in USDC (converted from token amount)
 */
export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<number> {
  try {
    const accountInfo = await getAccount(connection, tokenAccount);
    // Convert from token amount (6 decimals) to USDC
    return Number(accountInfo.amount) / 1_000_000;
  } catch (error) {
    // Return 0 if account doesn't exist or has no balance
    return 0;
  }
}

/**
 * Check USDC balances for all wallets
 * 
 * @param connection - Solana connection
 * @param tokenAccounts - Token accounts for all wallets
 * @returns Object with balances in USDC
 */
export async function checkTokenBalances(
  connection: Connection,
  tokenAccounts: TokenAccounts
): Promise<TokenBalances> {
  try {
    const [senderBalance, receiverBalance, feeCollectorBalance] = await Promise.all([
      getTokenBalance(connection, tokenAccounts.sender),
      getTokenBalance(connection, tokenAccounts.receiver),
      getTokenBalance(connection, tokenAccounts.feeCollector),
    ]);

    return {
      sender: senderBalance,
      receiver: receiverBalance,
      feeCollector: feeCollectorBalance,
    };
  } catch (error) {
    throw new Error(`Failed to check token balances: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Display token balance information
 */
export async function displayTokenBalances(
  connection: Connection,
  tokenAccounts: TokenAccounts
): Promise<void> {
  const balances = await checkTokenBalances(connection, tokenAccounts);
  
  console.log('💰 Current USDC Token Balances:');
  console.log(`  Sender:       ${balances.sender.toFixed(6)} USDC`);
  console.log(`  Receiver:     ${balances.receiver.toFixed(6)} USDC`);
  console.log(`  FeeCollector: ${balances.feeCollector.toFixed(6)} USDC\n`);
}

/**
 * Complete token setup: create mint, setup accounts, and mint initial USDC
 * Saves configuration to devnet-config.json for reuse
 * 
 * @param connection - Solana connection
 * @param wallets - All wallet keypairs
 * @param initialReceiverAmount - Amount of USDC to mint to receiver (default 0.5)
 * @returns Token setup configuration
 */
export async function setupDevnetTokens(
  connection: Connection,
  wallets: {
    sender: Keypair;
    receiver: Keypair;
    feeCollector: Keypair;
  },
  initialReceiverAmount: number = 0.5
): Promise<TokenSetupConfig> {
  try {
    console.log('\n=== Devnet Token Setup ===\n');

    // Check if config already exists
    const configPath = path.join(__dirname, '../fixtures/devnet-config.json');
    let config: any = {};

    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      // If USDC mint already exists, try to reuse it
      if (config.usdcMint) {
        console.log(`ℹ️  Found existing USDC mint: ${config.usdcMint}`);
        
        try {
          const mint = new PublicKey(config.usdcMint);
          
          // Setup token accounts (idempotent - will get existing or create new)
          const tokenAccounts = await setupTokenAccounts(
            connection,
            mint,
            wallets,
            wallets.sender // Use sender as payer
          );

          // Mint USDC to receiver if needed
          const receiverBalance = await getTokenBalance(connection, tokenAccounts.receiver);
          
          if (receiverBalance < initialReceiverAmount) {
            const amountToMint = initialReceiverAmount - receiverBalance;
            await mintUSDCToWallet(
              connection,
              mint,
              tokenAccounts.receiver,
              amountToMint,
              wallets.sender // Sender is mint authority
            );
          } else {
            console.log(`ℹ️  Receiver already has ${receiverBalance.toFixed(6)} USDC, skipping mint\n`);
          }

          await displayTokenBalances(connection, tokenAccounts);

          // Update config
          config.tokenAccounts = {
            sender: tokenAccounts.sender.toString(),
            receiver: tokenAccounts.receiver.toString(),
            feeCollector: tokenAccounts.feeCollector.toString(),
          };
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

          return {
            usdcMint: mint,
            tokenAccounts,
            decimals: 6,
          };
        } catch (error) {
          console.log('⚠️  Existing mint not accessible, creating new one...\n');
        }
      }
    }

    // Create new mint
    const mint = await createDevnetUSDCMint(connection, wallets.sender);

    // Setup token accounts
    const tokenAccounts = await setupTokenAccounts(
      connection,
      mint,
      wallets,
      wallets.sender
    );

    // Mint initial USDC to receiver
    await mintUSDCToWallet(
      connection,
      mint,
      tokenAccounts.receiver,
      initialReceiverAmount,
      wallets.sender
    );

    await displayTokenBalances(connection, tokenAccounts);

    // Save configuration
    config.usdcMint = mint.toString();
    config.tokenAccounts = {
      sender: tokenAccounts.sender.toString(),
      receiver: tokenAccounts.receiver.toString(),
      feeCollector: tokenAccounts.feeCollector.toString(),
    };
    config.updatedAt = new Date().toISOString();

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ Token setup saved to: ${configPath}\n`);

    return {
      usdcMint: mint,
      tokenAccounts,
      decimals: 6,
    };
  } catch (error) {
    throw new Error(`Failed to setup devnet tokens: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Load token configuration from saved config file
 * Returns undefined if config doesn't exist
 */
export function loadTokenConfig(): TokenSetupConfig | undefined {
  try {
    const configPath = path.join(__dirname, '../fixtures/devnet-config.json');
    
    if (!fs.existsSync(configPath)) {
      return undefined;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    if (!config.usdcMint || !config.tokenAccounts) {
      return undefined;
    }

    return {
      usdcMint: new PublicKey(config.usdcMint),
      tokenAccounts: {
        sender: new PublicKey(config.tokenAccounts.sender),
        receiver: new PublicKey(config.tokenAccounts.receiver),
        feeCollector: new PublicKey(config.tokenAccounts.feeCollector),
      },
      decimals: 6,
    };
  } catch (error) {
    return undefined;
  }
}

/**
 * Convert USDC amount to token amount (with 6 decimals)
 */
export function usdcToTokenAmount(usdc: number): bigint {
  return BigInt(Math.floor(usdc * 1_000_000));
}

/**
 * Convert token amount to USDC (from 6 decimals)
 */
export function tokenAmountToUsdc(tokenAmount: bigint): number {
  return Number(tokenAmount) / 1_000_000;
}

