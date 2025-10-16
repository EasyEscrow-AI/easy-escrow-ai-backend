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
  admin: PublicKey;
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
  admin: number;
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
 * Creates associated token accounts (ATA) for sender, receiver, admin, and fee collector
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
    admin: Keypair;
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

    const adminAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      wallets.admin.publicKey
    );
    console.log(`  ✅ Admin token account: ${adminAccount.address.toString()}`);

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
      admin: adminAccount.address,
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
    const [senderBalance, receiverBalance, adminBalance, feeCollectorBalance] = await Promise.all([
      getTokenBalance(connection, tokenAccounts.sender),
      getTokenBalance(connection, tokenAccounts.receiver),
      getTokenBalance(connection, tokenAccounts.admin),
      getTokenBalance(connection, tokenAccounts.feeCollector),
    ]);

    return {
      sender: senderBalance,
      receiver: receiverBalance,
      admin: adminBalance,
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
  console.log(`  Admin:        ${balances.admin.toFixed(6)} USDC`);
  console.log(`  FeeCollector: ${balances.feeCollector.toFixed(6)} USDC\n`);
}

/**
 * Complete token setup: uses official devnet USDC mint
 * Sets up accounts for all wallets
 * 
 * NOTE: For devnet E2E tests, we use the official devnet USDC mint.
 * This matches what the API expects and allows proper integration testing.
 * 
 * Official Devnet USDC: Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
 * 
 * @param connection - Solana connection
 * @param wallets - All wallet keypairs (4 wallets)
 * @param initialReceiverAmount - Amount of USDC to mint to receiver (NOT USED - manual funding required)
 * @returns Token setup configuration
 */
export async function setupDevnetTokens(
  connection: Connection,
  wallets: {
    sender: Keypair;
    receiver: Keypair;
    admin: Keypair;
    feeCollector: Keypair;
  },
  initialReceiverAmount: number = 0.5
): Promise<TokenSetupConfig> {
  try {
    console.log('\n=== Devnet Token Setup ===\n');

    // ALWAYS use official devnet USDC mint for E2E tests
    // This ensures compatibility with the API which validates against this address
    const OFFICIAL_DEVNET_USDC = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
    const mint = new PublicKey(OFFICIAL_DEVNET_USDC);
    
    console.log(`✅ Using official devnet USDC mint: ${OFFICIAL_DEVNET_USDC}`);
    console.log(`   This matches the API's expected USDC mint address\n`);

    // Setup token accounts (idempotent - will get existing or create new)
    const tokenAccounts = await setupTokenAccounts(
      connection,
      mint,
      wallets,
      wallets.sender // Use sender as payer
    );

    // Check receiver balance
    const receiverBalance = await getTokenBalance(connection, tokenAccounts.receiver);
    
    // Display balances
    await displayTokenBalances(connection, tokenAccounts);
    
    // Warning if balances are low
    if (receiverBalance < initialReceiverAmount) {
      console.log(`⚠️  WARNING: Receiver has ${receiverBalance.toFixed(6)} USDC`);
      console.log(`   Required: ${initialReceiverAmount.toFixed(6)} USDC`);
      console.log(`   Please fund the receiver wallet with devnet USDC`);
      console.log(`   Get devnet USDC from: https://spl-token-faucet.com/?token-name=USDC-Dev\n`);
    } else {
      console.log(`✅ Receiver has sufficient USDC: ${receiverBalance.toFixed(6)} USDC\n`);
    }

    // Save configuration
    const configPath = path.join(__dirname, '../fixtures/devnet-config.json');
    const config: any = fs.existsSync(configPath) 
      ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      : {};
    
    config.usdcMint = mint.toString();
    config.tokenAccounts = {
      sender: tokenAccounts.sender.toString(),
      receiver: tokenAccounts.receiver.toString(),
      admin: tokenAccounts.admin.toString(),
      feeCollector: tokenAccounts.feeCollector.toString(),
    };
    config.updatedAt = new Date().toISOString();

    // Ensure fixtures directory exists
    const fixturesDir = path.dirname(configPath);
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

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
        admin: new PublicKey(config.tokenAccounts.admin),
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

