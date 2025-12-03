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
  feeCollector: Keypair; // Cold storage (long-term fee storage)
  treasury: Keypair;    // Hot wallet (active fee collection, weekly withdrawals)
}

/**
 * Wallet balance information
 */
export interface WalletBalances {
  sender: number;
  receiver: number;
  admin: number;
  feeCollector: number;
  treasury: number;
}

/**
 * Wallet configuration from environment or file
 */
export interface WalletConfig {
  senderPrivateKey?: string;
  receiverPrivateKey?: string;
  adminPrivateKey?: string;
  feeCollectorPrivateKey?: string;
  treasuryPrivateKey?: string;
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
    // Support both DEVNET_* (local) and DEVNET_STAGING_* (staging) prefixes
    const senderKey = process.env.DEVNET_STAGING_SENDER_PRIVATE_KEY || process.env.DEVNET_SENDER_PRIVATE_KEY;
    const receiverKey = process.env.DEVNET_STAGING_RECEIVER_PRIVATE_KEY || process.env.DEVNET_RECEIVER_PRIVATE_KEY;
    const adminKey = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY || process.env.DEVNET_ADMIN_PRIVATE_KEY;
    const feeCollectorKey = process.env.DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY || process.env.DEVNET_FEE_COLLECTOR_PRIVATE_KEY;
    const treasuryKey = process.env.DEVNET_STAGING_TREASURY_PRIVATE_KEY || process.env.DEVNET_TREASURY_PRIVATE_KEY;

    let sender: Keypair;
    let receiver: Keypair;
    let admin: Keypair;
    let feeCollector: Keypair;
    let treasury: Keypair;

    if (senderKey && receiverKey && adminKey && feeCollectorKey) {
      // Load from environment
      console.log('✅ Loading wallets from environment variables');
      sender = Keypair.fromSecretKey(bs58.decode(senderKey));
      receiver = Keypair.fromSecretKey(bs58.decode(receiverKey));
      admin = Keypair.fromSecretKey(bs58.decode(adminKey));
      feeCollector = Keypair.fromSecretKey(bs58.decode(feeCollectorKey));
      
      // Try to load treasury from environment or file
      if (treasuryKey) {
        treasury = Keypair.fromSecretKey(bs58.decode(treasuryKey));
      } else {
        // Load from staging treasury wallet file  
        const treasuryPath = path.join(__dirname, '../../wallets/staging/staging-treasury.json');
        if (fs.existsSync(treasuryPath)) {
          const treasurySecret = JSON.parse(fs.readFileSync(treasuryPath, 'utf8'));
          treasury = Keypair.fromSecretKey(new Uint8Array(treasurySecret));
        } else {
          // Fallback to fee collector if treasury not found
          treasury = feeCollector;
        }
      }
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
          
          // Load treasury from config or wallet file
          if (config.walletKeys?.treasury) {
            treasury = Keypair.fromSecretKey(bs58.decode(config.walletKeys.treasury));
          } else {
            // Load from staging treasury wallet file
            const treasuryPath = path.join(__dirname, '../../wallets/staging/staging-treasury.json');
            if (fs.existsSync(treasuryPath)) {
              const treasurySecret = JSON.parse(fs.readFileSync(treasuryPath, 'utf8'));
              treasury = Keypair.fromSecretKey(new Uint8Array(treasurySecret));
            } else {
              // Fallback to fee collector if treasury not found
              treasury = feeCollector;
            }
          }
        } else {
          throw new Error('Config file missing wallet keys');
        }
      } else {
        // Check if we should generate new wallets
        const forceGenerate = process.env.FORCE_GENERATE_WALLETS === 'true';
        
        if (!forceGenerate) {
          throw new Error(
            '❌ No wallet configuration found!\n\n' +
            '⚠️  GUARDRAIL: Automatic wallet generation is disabled to prevent overwriting existing wallets.\n\n' +
            'Options:\n' +
            '1. Set environment variables (RECOMMENDED):\n' +
            '   - DEVNET_SENDER_PRIVATE_KEY\n' +
            '   - DEVNET_RECEIVER_PRIVATE_KEY\n' +
            '   - DEVNET_ADMIN_PRIVATE_KEY\n' +
            '   - DEVNET_FEE_COLLECTOR_PRIVATE_KEY\n\n' +
            '2. Use the setup script to create static wallets:\n' +
            '   scripts/deployment/devnet/setup-static-devnet-wallets.ps1\n\n' +
            '3. Create tests/fixtures/devnet-config.json manually with your wallet keys\n\n' +
            '4. Force generation of NEW wallets (USE WITH CAUTION):\n' +
            '   Set FORCE_GENERATE_WALLETS=true environment variable\n\n' +
            'For setup instructions, see: docs/ENV_TEMPLATE.md'
          );
        }

        // Force generate mode - warn heavily
        console.warn('\n⚠️⚠️⚠️  WARNING: FORCE GENERATING NEW WALLETS  ⚠️⚠️⚠️\n');
        console.warn('This will create NEW wallet addresses that may differ from your funded wallets!');
        console.warn('If you have existing funded wallets, this will create DIFFERENT addresses.\n');
        
        sender = Keypair.generate();
        receiver = Keypair.generate();
        admin = Keypair.generate();
        feeCollector = Keypair.generate();
        treasury = Keypair.generate();

        // Save to config file
        const config = {
          walletKeys: {
            sender: bs58.encode(sender.secretKey),
            receiver: bs58.encode(receiver.secretKey),
            admin: bs58.encode(admin.secretKey),
            feeCollector: bs58.encode(feeCollector.secretKey),
            treasury: bs58.encode(treasury.secretKey),
          },
          wallets: {
            sender: sender.publicKey.toString(),
            receiver: receiver.publicKey.toString(),
            admin: admin.publicKey.toString(),
            feeCollector: feeCollector.publicKey.toString(),
            treasury: treasury.publicKey.toString(),
          },
          createdAt: new Date().toISOString(),
          description: 'AUTO-GENERATED wallets - Set FORCE_GENERATE_WALLETS=false to prevent regeneration',
        };

        // Ensure fixtures directory exists
        const fixturesDir = path.join(__dirname, '../fixtures');
        if (!fs.existsSync(fixturesDir)) {
          fs.mkdirSync(fixturesDir, { recursive: true });
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log('\n📝 New wallets generated and saved to:', configPath);
        console.warn('\n⚠️  IMPORTANT: These are NEW addresses. You must fund them before testing.\n');
        console.log('💡 Fund these wallets using:');
        console.log(`   scripts/deployment/devnet/fund-devnet-wallets.ps1 -Buyer ${receiver.publicKey.toString()} -Seller ${sender.publicKey.toString()} -Admin ${admin.publicKey.toString()} -FeeCollector ${feeCollector.publicKey.toString()}`);
        console.log('\nWallet Addresses:');
        console.log(`  Sender:       ${sender.publicKey.toString()}`);
        console.log(`  Receiver:     ${receiver.publicKey.toString()}`);
        console.log(`  Admin:        ${admin.publicKey.toString()}`);
        console.log(`  FeeCollector: ${feeCollector.publicKey.toString()}\n`);
        console.warn('⚠️  To use standardized wallets instead, see: docs/DEVNET_WALLET_STANDARDIZATION.md\n');
      }
    }

    return {
      sender,
      receiver,
      admin,
      feeCollector,
      treasury,
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
    const [senderBalance, receiverBalance, adminBalance, feeCollectorBalance, treasuryBalance] = await Promise.all([
      connection.getBalance(wallets.sender.publicKey),
      connection.getBalance(wallets.receiver.publicKey),
      connection.getBalance(wallets.admin.publicKey),
      connection.getBalance(wallets.feeCollector.publicKey),
      connection.getBalance(wallets.treasury.publicKey),
    ]);

    return {
      sender: senderBalance / LAMPORTS_PER_SOL,
      receiver: receiverBalance / LAMPORTS_PER_SOL,
      admin: adminBalance / LAMPORTS_PER_SOL,
      feeCollector: feeCollectorBalance / LAMPORTS_PER_SOL,
      treasury: treasuryBalance / LAMPORTS_PER_SOL,
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
  console.log(`  FeeCollector: ${balances.feeCollector.toFixed(4)} SOL`);
  console.log(`  Treasury:     ${balances.treasury.toFixed(4)} SOL (active collection)\n`);

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
      `Run: scripts/deployment/devnet/fund-devnet-wallets.ps1 -Buyer ${wallets.receiver.publicKey.toString()} ` +
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

