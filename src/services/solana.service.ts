/**
 * Solana Service
 * 
 * Handles Solana RPC connections, account monitoring, and blockchain interactions.
 * Provides connection pooling, failover mechanisms, and WebSocket subscriptions.
 */

import { 
  Connection, 
  PublicKey, 
  ConnectionConfig,
  Commitment,
  Context,
  AccountInfo,
  KeyedAccountInfo,
} from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { config } from '../config';

/**
 * Configuration for Solana connection
 */
interface SolanaConnectionConfig {
  rpcUrl: string;
  wsUrl?: string;
  commitment?: Commitment;
  confirmTransactionInitialTimeout?: number;
}

/**
 * Account change callback type
 */
export type AccountChangeCallback = (
  accountInfo: AccountInfo<Buffer> | null,
  context: Context
) => void | Promise<void>;

/**
 * Account subscription
 */
interface AccountSubscription {
  subscriptionId: number;
  publicKey: string;
  callback: AccountChangeCallback;
}

/**
 * Solana Service Class
 * 
 * Manages Solana RPC connections with connection pooling and failover support.
 * Provides WebSocket-based account monitoring for real-time updates.
 */
export class SolanaService {
  private connection: Connection;
  private wsConnection?: Connection;
  private subscriptions: Map<string, AccountSubscription> = new Map();
  private isHealthy: boolean = false;
  private lastHealthCheck: Date | null = null;
  private readonly healthCheckInterval: number = 30000; // 30 seconds
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(connectionConfig?: SolanaConnectionConfig) {
    // Validate config.solana exists
    if (!config?.solana) {
      throw new Error('[SolanaService] Configuration error: config.solana is undefined');
    }

    const rpcUrl = connectionConfig?.rpcUrl || config.solana?.rpcUrl;
    
    // Validate RPC URL is provided
    if (!rpcUrl) {
      throw new Error('[SolanaService] Configuration error: Solana RPC URL is not configured');
    }

    const commitment = connectionConfig?.commitment || 'confirmed';
    
    // HTTP/HTTPS connection for transactions
    const httpConnectionConfig: ConnectionConfig = {
      commitment,
      confirmTransactionInitialTimeout: connectionConfig?.confirmTransactionInitialTimeout || 60000,
    };
    
    console.log(`[SolanaService] Creating connection with URL: ${rpcUrl}`);
    this.connection = new Connection(rpcUrl, httpConnectionConfig);
    
    // Note: Solana's Connection class handles WebSocket subscriptions internally.
    // The same HTTP/HTTPS connection is used for both RPC calls and WebSocket subscriptions.
    // We don't need a separate WebSocket connection.
    this.wsConnection = this.connection;
    
    console.log(`[SolanaService] Initialized with RPC: ${rpcUrl}`);
    console.log(`[SolanaService] Commitment: ${commitment}`);
  }

  /**
   * Derive WebSocket URL from HTTP RPC URL
   */
  private deriveWsUrl(rpcUrl: string): string | null {
    try {
      // Replace http with ws and https with wss
      if (rpcUrl.startsWith('http://')) {
        return rpcUrl.replace('http://', 'ws://');
      } else if (rpcUrl.startsWith('https://')) {
        return rpcUrl.replace('https://', 'wss://');
      }
      return null;
    } catch (error) {
      console.error('[SolanaService] Error deriving WebSocket URL:', error);
      return null;
    }
  }

  /**
   * Get the main RPC connection
   */
  public getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get the WebSocket connection (if available)
   */
  public getWsConnection(): Connection | undefined {
    return this.wsConnection || this.connection;
  }

  /**
   * Start the service and perform initial health check
   */
  public async start(): Promise<void> {
    console.log('[SolanaService] Starting service...');
    
    // Perform initial health check
    await this.checkHealth();
    
    // Start periodic health checks
    this.startHealthChecks();
    
    console.log('[SolanaService] Service started successfully');
  }

  /**
   * Stop the service and clean up resources
   */
  public async stop(): Promise<void> {
    console.log('[SolanaService] Stopping service...');
    
    // Stop health checks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    
    // Unsubscribe from all accounts
    await this.unsubscribeAll();
    
    this.isHealthy = false;
    console.log('[SolanaService] Service stopped');
  }

  /**
   * Check connection health
   */
  public async checkHealth(): Promise<boolean> {
    try {
      const startTime = Date.now();
      const version = await this.connection.getVersion();
      const latency = Date.now() - startTime;
      
      this.isHealthy = true;
      this.lastHealthCheck = new Date();
      
      console.log(`[SolanaService] Health check passed - Solana version: ${version['solana-core']}, Latency: ${latency}ms`);
      return true;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = new Date();
      console.error('[SolanaService] Health check failed:', error);
      return false;
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.checkHealth();
    }, this.healthCheckInterval);
  }

  /**
   * Get service health status
   */
  public getHealthStatus(): { healthy: boolean; lastCheck: Date | null } {
    return {
      healthy: this.isHealthy,
      lastCheck: this.lastHealthCheck,
    };
  }

  /**
   * Subscribe to account changes
   * 
   * @param publicKey - Account public key to monitor
   * @param callback - Callback function to handle account changes
   * @returns Subscription ID
   */
  public async subscribeToAccount(
    publicKey: PublicKey | string,
    callback: AccountChangeCallback
  ): Promise<number> {
    const pubKey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;
    const pubKeyStr = pubKey.toBase58();
    
    // Check if already subscribed
    if (this.subscriptions.has(pubKeyStr)) {
      console.log(`[SolanaService] Already subscribed to account: ${pubKeyStr}`);
      return this.subscriptions.get(pubKeyStr)!.subscriptionId;
    }
    
    try {
      const connection = this.getWsConnection()!;
      
      // Subscribe to account changes
      const subscriptionId = connection.onAccountChange(
        pubKey,
        async (accountInfo, context) => {
          try {
            await callback(accountInfo, context);
          } catch (error) {
            console.error(`[SolanaService] Error in account change callback for ${pubKeyStr}:`, error);
          }
        },
        'confirmed'
      );
      
      // Store subscription
      this.subscriptions.set(pubKeyStr, {
        subscriptionId,
        publicKey: pubKeyStr,
        callback,
      });
      
      console.log(`[SolanaService] Subscribed to account: ${pubKeyStr} (ID: ${subscriptionId})`);
      return subscriptionId;
    } catch (error) {
      console.error(`[SolanaService] Failed to subscribe to account ${pubKeyStr}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from account changes
   * 
   * @param publicKey - Account public key to unsubscribe from
   */
  public async unsubscribeFromAccount(publicKey: PublicKey | string): Promise<void> {
    const pubKeyStr = typeof publicKey === 'string' ? publicKey : publicKey.toBase58();
    
    const subscription = this.subscriptions.get(pubKeyStr);
    if (!subscription) {
      console.log(`[SolanaService] No subscription found for account: ${pubKeyStr}`);
      return;
    }
    
    try {
      const connection = this.getWsConnection()!;
      await connection.removeAccountChangeListener(subscription.subscriptionId);
      
      this.subscriptions.delete(pubKeyStr);
      console.log(`[SolanaService] Unsubscribed from account: ${pubKeyStr}`);
    } catch (error) {
      console.error(`[SolanaService] Failed to unsubscribe from account ${pubKeyStr}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from all accounts
   */
  public async unsubscribeAll(): Promise<void> {
    console.log(`[SolanaService] Unsubscribing from ${this.subscriptions.size} accounts...`);
    
    const promises = Array.from(this.subscriptions.keys()).map(pubKey =>
      this.unsubscribeFromAccount(pubKey).catch(error =>
        console.error(`[SolanaService] Failed to unsubscribe from ${pubKey}:`, error)
      )
    );
    
    await Promise.all(promises);
    console.log('[SolanaService] All accounts unsubscribed');
  }

  /**
   * Get account info
   */
  public async getAccountInfo(publicKey: PublicKey | string): Promise<AccountInfo<Buffer> | null> {
    const pubKey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;
    return await this.connection.getAccountInfo(pubKey);
  }

  /**
   * Get multiple accounts info
   */
  public async getMultipleAccountsInfo(
    publicKeys: (PublicKey | string)[]
  ): Promise<(AccountInfo<Buffer> | null)[]> {
    const pubKeys = publicKeys.map(pk =>
      typeof pk === 'string' ? new PublicKey(pk) : pk
    );
    return await this.connection.getMultipleAccountsInfo(pubKeys);
  }

  /**
   * Get active subscriptions count
   */
  public getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get all subscribed account addresses
   */
  public getSubscribedAccounts(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}

// Singleton instance
let solanaServiceInstance: SolanaService | null = null;

/**
 * Get or create Solana service singleton instance
 */
export function getSolanaService(connectionConfig?: SolanaConnectionConfig): SolanaService {
  if (!solanaServiceInstance) {
    solanaServiceInstance = new SolanaService(connectionConfig);
  }
  return solanaServiceInstance;
}

/**
 * Reset Solana service instance (useful for testing)
 */
export function resetSolanaService(): void {
  if (solanaServiceInstance) {
    solanaServiceInstance.stop().catch(console.error);
    solanaServiceInstance = null;
  }
}

export default SolanaService;

/**
 * Escrow-specific Functions
 */

export interface EscrowPDAResult {
  escrowPda: string;
  depositAddresses: {
    usdc: string;
    nft: string;
  };
  transactionId: string;
}

export interface InitEscrowParams {
  nftMint: string;
  price: string | number | any;
  seller: string;
  buyer?: string;
  expiry: Date;
  feeBps: number;
  honorRoyalties: boolean;
}

/**
 * Derive escrow PDA from agreement parameters
 */
export const deriveEscrowPDA = async (
  programId: PublicKey,
  seller: PublicKey,
  nftMint: PublicKey,
  buyer?: PublicKey
): Promise<[PublicKey, number]> => {
  const seeds = [
    Buffer.from('escrow'),
    seller.toBuffer(),
    nftMint.toBuffer(),
  ];

  if (buyer) {
    seeds.push(buyer.toBuffer());
  }

  return PublicKey.findProgramAddress(seeds, programId);
};

/**
 * Derive deposit addresses (USDC and NFT token accounts)
 * Creates Associated Token Accounts (ATAs) for the escrow PDA
 */
export const deriveDepositAddresses = async (
  escrowPda: PublicKey,
  usdcMint: PublicKey,
  nftMint: PublicKey
): Promise<{ usdc: string; nft: string }> => {
  // Derive Associated Token Account addresses for the escrow PDA
  // These are the proper SPL token accounts that can receive tokens
  const usdcAta = await getAssociatedTokenAddress(
    usdcMint,
    escrowPda,
    true // allowOwnerOffCurve - PDAs are off-curve
  );

  const nftAta = await getAssociatedTokenAddress(
    nftMint,
    escrowPda,
    true // allowOwnerOffCurve - PDAs are off-curve
  );

  console.log('[SolanaService] Derived deposit addresses:', {
    escrowPda: escrowPda.toString(),
    usdcMint: usdcMint.toString(),
    nftMint: nftMint.toString(),
    usdcAta: usdcAta.toString(),
    nftAta: nftAta.toString(),
  });

  return {
    usdc: usdcAta.toString(),
    nft: nftAta.toString(),
  };
};

/**
 * Initialize escrow on-chain
 * This is a placeholder implementation that will be replaced with actual Anchor program calls
 */
export const initializeEscrow = async (
  params: InitEscrowParams
): Promise<EscrowPDAResult> => {
  try {
    // Validate config.solana exists
    if (!config?.solana) {
      throw new Error('[SolanaService] Configuration error: config.solana is undefined');
    }

    // Validate config.usdc exists
    if (!config?.usdc) {
      throw new Error('[SolanaService] Configuration error: config.usdc is undefined');
    }

    console.log('[SolanaService] Initializing escrow with config:', {
      rpcUrl: config.solana?.rpcUrl,
      network: config.solana?.network,
      programId: config.solana?.escrowProgramId,
    });

    // Use default devnet if RPC URL is not configured properly
    const rpcUrl = config.solana?.rpcUrl && config.solana.rpcUrl.startsWith('http') 
      ? config.solana.rpcUrl 
      : 'https://api.devnet.solana.com';
    
    console.log('[SolanaService] Using RPC URL:', rpcUrl);
    
    // Parse addresses
    const nftMintPubkey = new PublicKey(params.nftMint);
    const sellerPubkey = new PublicKey(params.seller);
    const buyerPubkey = params.buyer ? new PublicKey(params.buyer) : undefined;
    
    // Get program ID - MUST be set in environment
    if (!config.solana?.escrowProgramId) {
      throw new Error(
        'ESCROW_PROGRAM_ID not configured. ' +
        'Set ESCROW_PROGRAM_ID environment variable to your deployed program address.'
      );
    }
    const programId = new PublicKey(config.solana.escrowProgramId);
    
    // Get USDC mint address (use devnet USDC for testing)
    const usdcMintStr = config.usdc?.mintAddress || 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'; // Devnet USDC
    console.log('[SolanaService] USDC Config:', {
      configured: config.usdc?.mintAddress,
      using: usdcMintStr,
      isDefault: !config.usdc?.mintAddress
    });
    const usdcMint = new PublicKey(usdcMintStr);

    // Call on-chain init_agreement instruction
    const { BN } = await import('@coral-xyz/anchor');
    const { getEscrowProgramService } = await import('./escrow-program.service');
    const escrowProgramService = getEscrowProgramService();
    
    // Generate unique escrow ID (use timestamp as u64)
    const escrowId = new BN(Date.now());
    
    // Convert price to lamports (USDC has 6 decimals)
    const usdcAmount = new BN(Math.floor(params.price * 1_000_000));
    
    // Convert expiry to unix timestamp
    const expiryTimestamp = new BN(Math.floor(params.expiry.getTime() / 1000));
    
    console.log('[SolanaService] Calling on-chain init_agreement:', {
      escrowId: escrowId.toString(),
      buyer: buyerPubkey?.toString(),
      seller: sellerPubkey.toString(),
      nftMint: nftMintPubkey.toString(),
      usdcAmount: usdcAmount.toString(),
      expiryTimestamp: expiryTimestamp.toString(),
    });
    
    // Initialize escrow agreement on-chain
    const initResult = await escrowProgramService.initAgreement(
      escrowId,
      buyerPubkey || sellerPubkey, // Use seller as buyer if buyer not specified
      sellerPubkey,
      nftMintPubkey,
      usdcAmount,
      expiryTimestamp
    );
    
    console.log('[SolanaService] Escrow initialized on-chain:', {
      escrowPda: initResult.pda.toString(),
      transactionId: initResult.txId,
    });

    // Derive deposit addresses (ATAs for the escrow PDA) using the correct PDA from init
    const depositAddresses = await deriveDepositAddresses(
      initResult.pda,
      usdcMint,
      nftMintPubkey
    );
    
    console.log('[SolanaService] Deposit addresses derived:', JSON.stringify(depositAddresses, null, 2));

    const result = {
      escrowPda: initResult.pda.toString(),
      depositAddresses,
      transactionId: initResult.txId,
    };
    
    return result;

  } catch (error) {
    console.error('[SolanaService] Error initializing escrow:', error);
    throw new Error(`Failed to initialize escrow: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Validate Solana address format
 */
export const validateSolanaAddress = (address: string): boolean => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};
