import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';

/**
 * Devnet wallet structure for E2E testing
 * 4 separate wallets for proper role separation
 */
export interface DevnetWallets {
  sender: Keypair;      // NFT owner (seller)
  receiver: Keypair;    // USDC payer (buyer)
  admin: Keypair;       // System admin (escrow operations)
  feeCollector: Keypair; // Treasury (receives fees only)
}

/**
 * Wallet balance information
 */
export interface WalletBalances {
  sender: number;
  receiver: number;
  admin: number;
  feeCollector: number;
}

/**
 * Wallet configuration from environment or file
 */
export interface WalletConfig {
  senderPrivateKey?: string;
  receiverPrivateKey?: string;
  adminPrivateKey?: string;
  feeCollectorPrivateKey?: string;
}

/**
 * Load devnet wallets from environment variables or generate new ones
 * 
 * Expects private keys in base58 format in environment variables:
 * - DEVNET_SENDER_PRIVATE_KEY
 * - DEVNET_RECEIVER_PRIVATE_KEY
 * - DEVNET_ADMIN_PRIVATE_KEY
 * - DEVNET_FEE_COLLECTOR_PRIVATE_KEY
 * 
 * If environment variables are not set, generates new keypairs and logs them
 */
export async function loadDevnetWallets(): Promise<DevnetWallets> {
  try {
    // Try to load from environment variables
    const senderKey = process.env.DEVNET_SENDER_PRIVATE_KEY;
    const receiverKey = process.env.DEVNET_RECEIVER_PRIVATE_KEY;
    const adminKey = process.env.DEVNET_ADMIN_PRIVATE_KEY;
    const feeCollectorKey = process.env.DEVNET_FEE_COLLECTOR_PRIVATE_KEY;

    let sender: Keypair;
    let receiver: Keypair;
    let admin: Keypair;
    let feeCollector: Keypair;

    if (senderKey && receiverKey && adminKey && feeCollectorKey) {
      // Load from environment
      console.log('✅ Loading wallets from environment variables');
      sender = Keypair.fromSecretKey(bs58.decode(senderKey));
      receiver = Keypair.fromSecretKey(bs58.decode(receiverKey));
      admin = Keypair.fromSecretKey(bs58.decode(adminKey));
      feeCollector = Keypair.fromSecretKey(bs58.decode(feeCollectorKey));
    } else {
      // Try to load from config file
      const configPath = path.join(__dirname, '../fixtures/devnet-config.json');
      
      if (fs.existsSync(configPath)) {
        console.log('✅ Loading wallets from config file');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        
        if (config.walletKeys?.sender && config.walletKeys?.receiver && 
            config.walletKeys?.admin && config.walletKeys?.feeCollector) {
          sender = Keypair.fromSecretKey(bs58.decode(config.walletKeys.sender));
          receiver = Keypair.fromSecretKey(bs58.decode(config.walletKeys.receiver));
          admin = Keypair.fromSecretKey(bs58.decode(config.walletKeys.admin));
          feeCollector = Keypair.fromSecretKey(bs58.decode(config.walletKeys.feeCollector));
        } else {
          throw new Error('Config file missing wallet keys');
        }
      } else {
        // Generate new wallets and save to config
        console.log('⚠️  No wallet configuration found. Generating new wallets...');
        sender = Keypair.generate();
        receiver = Keypair.generate();
        admin = Keypair.generate();
        feeCollector = Keypair.generate();

        // Save to config file
        const config = {
          walletKeys: {
            sender: bs58.encode(sender.secretKey),
            receiver: bs58.encode(receiver.secretKey),
            admin: bs58.encode(admin.secretKey),
            feeCollector: bs58.encode(feeCollector.secretKey),
          },
          wallets: {
            sender: sender.publicKey.toString(),
            receiver: receiver.publicKey.toString(),
            admin: admin.publicKey.toString(),
            feeCollector: feeCollector.publicKey.toString(),
          },
          createdAt: new Date().toISOString(),
        };

        // Ensure fixtures directory exists
        const fixturesDir = path.join(__dirname, '../fixtures');
        if (!fs.existsSync(fixturesDir)) {
          fs.mkdirSync(fixturesDir, { recursive: true });
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log('\n📝 New wallets generated and saved to:', configPath);
        console.log('\n💡 Fund these wallets using:');
        console.log(`   scripts/fund-devnet-wallets.ps1 -Buyer ${receiver.publicKey.toString()} -Seller ${sender.publicKey.toString()} -Admin ${admin.publicKey.toString()} -FeeCollector ${feeCollector.publicKey.toString()}`);
        console.log('\nWallet Addresses:');
        console.log(`  Sender:       ${sender.publicKey.toString()}`);
        console.log(`  Receiver:     ${receiver.publicKey.toString()}`);
        console.log(`  Admin:        ${admin.publicKey.toString()}`);
        console.log(`  FeeCollector: ${feeCollector.publicKey.toString()}\n`);
      }
    }

    return {
      sender,
      receiver,
      admin,
      feeCollector,
    };
  } catch (error) {
    throw new Error(`Failed to load devnet wallets: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check SOL balances for all devnet wallets
 */
export async function checkWalletBalances(
  connection: Connection,
  wallets: DevnetWallets
): Promise<WalletBalances> {
  try {
    const [senderBalance, receiverBalance, adminBalance, feeCollectorBalance] = await Promise.all([
      connection.getBalance(wallets.sender.publicKey),
      connection.getBalance(wallets.receiver.publicKey),
      connection.getBalance(wallets.admin.publicKey),
      connection.getBalance(wallets.feeCollector.publicKey),
    ]);

    return {
      sender: senderBalance / LAMPORTS_PER_SOL,
      receiver: receiverBalance / LAMPORTS_PER_SOL,
      admin: adminBalance / LAMPORTS_PER_SOL,
      feeCollector: feeCollectorBalance / LAMPORTS_PER_SOL,
    };
  } catch (error) {
    throw new Error(`Failed to check wallet balances: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Ensure wallet has minimum SOL balance
 * Throws error if balance is below minimum
 */
export async function ensureMinimumBalance(
  connection: Connection,
  wallet: Keypair,
  minSOL: number = 0.05
): Promise<void> {
  const balance = await connection.getBalance(wallet.publicKey);
  const balanceInSOL = balance / LAMPORTS_PER_SOL;

  if (balanceInSOL < minSOL) {
    throw new Error(
      `Wallet ${wallet.publicKey.toString()} has insufficient balance: ${balanceInSOL.toFixed(4)} SOL (minimum: ${minSOL} SOL)\n` +
      `Please fund the wallet using: solana airdrop ${minSOL} ${wallet.publicKey.toString()} --url devnet`
    );
  }
}

/**
 * Verify all wallets have minimum SOL balance
 */
export async function verifyWalletBalances(
  connection: Connection,
  wallets: DevnetWallets,
  minSOL: number = 0.05
): Promise<WalletBalances> {
  const balances = await checkWalletBalances(connection, wallets);

  console.log('\n💰 Current Wallet Balances:');
  console.log(`  Sender:       ${balances.sender.toFixed(4)} SOL`);
  console.log(`  Receiver:     ${balances.receiver.toFixed(4)} SOL`);
  console.log(`  Admin:        ${balances.admin.toFixed(4)} SOL`);
  console.log(`  FeeCollector: ${balances.feeCollector.toFixed(4)} SOL\n`);

  // Check each wallet
  const errors: string[] = [];
  
  if (balances.sender < minSOL) {
    errors.push(`Sender wallet needs ${minSOL - balances.sender} more SOL`);
  }
  if (balances.receiver < minSOL) {
    errors.push(`Receiver wallet needs ${minSOL - balances.receiver} more SOL`);
  }
  if (balances.admin < minSOL) {
    errors.push(`Admin wallet needs ${minSOL - balances.admin} more SOL`);
  }
  if (balances.feeCollector < minSOL) {
    errors.push(`FeeCollector wallet needs ${minSOL - balances.feeCollector} more SOL`);
  }

  if (errors.length > 0) {
    throw new Error(
      `⚠️  Insufficient wallet balances (minimum ${minSOL} SOL required):\n` +
      errors.map(e => `  - ${e}`).join('\n') + '\n\n' +
      `Run: scripts/fund-devnet-wallets.ps1 -Buyer ${wallets.receiver.publicKey.toString()} ` +
      `-Seller ${wallets.sender.publicKey.toString()} -Admin ${wallets.admin.publicKey.toString()} ` +
      `-FeeCollector ${wallets.feeCollector.publicKey.toString()}`
    );
  }

  console.log('✅ All wallets have sufficient SOL balance\n');
  return balances;
}

/**
 * Display wallet information
 */
export function displayWalletInfo(wallets: DevnetWallets): void {
  console.log('\n🔑 Devnet Wallet Addresses:');
  console.log(`  Sender:       ${wallets.sender.publicKey.toString()}`);
  console.log(`  Receiver:     ${wallets.receiver.publicKey.toString()}`);
  console.log(`  Admin:        ${wallets.admin.publicKey.toString()}`);
  console.log(`  FeeCollector: ${wallets.feeCollector.publicKey.toString()}`);
  console.log(`\n  💡 Note: FeeCollector is receive-only (treasury wallet)\n`);
}

/**
 * Get Solana Explorer URL for an address on devnet
 */
export function getExplorerUrl(address: string, type: 'address' | 'tx' = 'address'): string {
  return `https://explorer.solana.com/${type}/${address}?cluster=devnet`;
}

