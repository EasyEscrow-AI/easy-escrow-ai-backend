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
import { BN } from '@coral-xyz/anchor';
import { config } from '../config';

/**
 * Configuration for Solana connection
 */
interface SolanaConnectionConfig {
  rpcUrl: string;
  rpcUrlFallback?: string;
  wsUrl?: string;
  commitment?: Commitment;
  confirmTransactionInitialTimeout?: number;
  timeout?: number;
  maxRetries?: number;
  healthCheckInterval?: number;
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
 * RPC endpoint status tracking
 */
interface RpcEndpointStatus {
  url: string;
  isHealthy: boolean;
  lastCheck: Date | null;
  lastResponseTime: number | null;
  failureCount: number;
  totalRequests: number;
  successfulRequests: number;
}

/**
 * Solana Service Class
 * 
 * Manages Solana RPC connections with connection pooling and failover support.
 * Provides WebSocket-based account monitoring for real-time updates.
 * Features:
 * - Automatic failover to backup RPC endpoints
 * - Retry logic with exponential backoff
 * - Response time tracking and monitoring
 * - Health checks and status reporting
 */
export class SolanaService {
  private connection: Connection;
  private fallbackConnection?: Connection;
  private wsConnection?: Connection;
  private subscriptions: Map<string, AccountSubscription> = new Map();
  private isHealthy: boolean = false;
  private usingFallback: boolean = false;
  private lastHealthCheck: Date | null = null;
  private readonly healthCheckInterval: number;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private healthCheckTimer?: NodeJS.Timeout;
  
  // RPC endpoint tracking
  private primaryRpcStatus: RpcEndpointStatus;
  private fallbackRpcStatus?: RpcEndpointStatus;

  constructor(connectionConfig?: SolanaConnectionConfig) {
    // Validate config.solana exists
    if (!config?.solana) {
      throw new Error('[SolanaService] Configuration error: config.solana is undefined');
    }

    const rpcUrl = connectionConfig?.rpcUrl || config.solana?.rpcUrl;
    const rpcUrlFallback = connectionConfig?.rpcUrlFallback || config.solana?.rpcUrlFallback;
    
    // Validate RPC URL is provided and properly formatted
    if (!rpcUrl) {
      throw new Error('[SolanaService] Configuration error: Solana RPC URL is not configured');
    }

    // Check for common configuration errors
    if (rpcUrl.includes('${') || rpcUrl.includes('}')) {
      throw new Error(
        `[SolanaService] Configuration error: SOLANA_RPC_URL contains placeholder syntax '${rpcUrl}'. ` +
        `This means the environment variable is not set in DigitalOcean App Platform. ` +
        `Please set the actual RPC URL value in the App Platform console under Settings > Environment Variables.`
      );
    }

    // Validate URL format (must start with http:// or https://)
    if (!/^https?:\/\//i.test(rpcUrl)) {
      throw new Error(
        `[SolanaService] Configuration error: SOLANA_RPC_URL must start with 'http://' or 'https://'. ` +
        `Got: '${rpcUrl?.slice(0, 50)}...' ` +
        `Please check the environment variable value in DigitalOcean App Platform.`
      );
    }

    // Set configuration parameters
    this.timeout = connectionConfig?.timeout || config.solana?.rpcTimeout || 30000;
    this.maxRetries = connectionConfig?.maxRetries || config.solana?.rpcRetries || 3;
    this.healthCheckInterval = connectionConfig?.healthCheckInterval || config.solana?.rpcHealthCheckInterval || 30000;

    const commitment = connectionConfig?.commitment || 'confirmed';
    
    // HTTP/HTTPS connection for transactions
    const httpConnectionConfig: ConnectionConfig = {
      commitment,
      confirmTransactionInitialTimeout: connectionConfig?.confirmTransactionInitialTimeout || 60000,
    };
    
    // Initialize primary connection
    // Log only the first 30 characters for security
    console.log(`[SolanaService] Creating primary connection with URL: ${rpcUrl.slice(0, 30)}...`);
    this.connection = new Connection(rpcUrl, httpConnectionConfig);
    
    // Initialize primary RPC status tracking
    this.primaryRpcStatus = {
      url: rpcUrl,
      isHealthy: false,
      lastCheck: null,
      lastResponseTime: null,
      failureCount: 0,
      totalRequests: 0,
      successfulRequests: 0,
    };
    
    // Initialize fallback connection if configured
    if (rpcUrlFallback) {
      // Validate fallback URL format
      if (!/^https?:\/\//i.test(rpcUrlFallback)) {
        console.warn(
          `[SolanaService] Warning: SOLANA_RPC_URL_FALLBACK has invalid format: '${rpcUrlFallback?.slice(0, 50)}...'. ` +
          `Fallback connection will not be available.`
        );
      } else {
        console.log(`[SolanaService] Creating fallback connection with URL: ${rpcUrlFallback.slice(0, 30)}...`);
        this.fallbackConnection = new Connection(rpcUrlFallback, httpConnectionConfig);
        
        this.fallbackRpcStatus = {
          url: rpcUrlFallback,
          isHealthy: false,
          lastCheck: null,
          lastResponseTime: null,
          failureCount: 0,
          totalRequests: 0,
          successfulRequests: 0,
        };
      }
    }
    
    // Note: Solana's Connection class handles WebSocket subscriptions internally.
    // The same HTTP/HTTPS connection is used for both RPC calls and WebSocket subscriptions.
    // We don't need a separate WebSocket connection.
    this.wsConnection = this.connection;
    
    console.log(`[SolanaService] Initialized with primary RPC: ${rpcUrl}`);
    if (rpcUrlFallback) {
      console.log(`[SolanaService] Fallback RPC configured: ${rpcUrlFallback}`);
    }
    console.log(`[SolanaService] Commitment: ${commitment}`);
    console.log(`[SolanaService] Timeout: ${this.timeout}ms`);
    console.log(`[SolanaService] Max retries: ${this.maxRetries}`);
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
   * Get the main RPC connection (with automatic fallback if primary is unhealthy)
   */
  public getConnection(): Connection {
    // If primary is unhealthy and fallback is available and healthy, use fallback
    if (!this.primaryRpcStatus.isHealthy && this.fallbackConnection && this.fallbackRpcStatus?.isHealthy) {
      if (!this.usingFallback) {
        console.warn('[SolanaService] Primary RPC unhealthy, switching to fallback');
        this.usingFallback = true;
      }
      return this.fallbackConnection;
    }
    
    // If using fallback but primary is now healthy, switch back
    if (this.usingFallback && this.primaryRpcStatus.isHealthy) {
      console.log('[SolanaService] Primary RPC recovered, switching back from fallback');
      this.usingFallback = false;
    }
    
    return this.connection;
  }
  
  /**
   * Get current RPC endpoint status
   */
  public getRpcStatus(): { primary: RpcEndpointStatus; fallback?: RpcEndpointStatus; usingFallback: boolean } {
    return {
      primary: { ...this.primaryRpcStatus },
      fallback: this.fallbackRpcStatus ? { ...this.fallbackRpcStatus } : undefined,
      usingFallback: this.usingFallback,
    };
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
   * Execute RPC call with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'RPC call',
    retryCount: number = 0
  ): Promise<T> {
    try {
      const startTime = Date.now();
      const result = await operation();
      const responseTime = Date.now() - startTime;
      
      // Update success metrics
      const status = this.usingFallback ? this.fallbackRpcStatus : this.primaryRpcStatus;
      if (status) {
        status.totalRequests++;
        status.successfulRequests++;
        status.lastResponseTime = responseTime;
        status.failureCount = 0; // Reset failure count on success
      }
      
      return result;
    } catch (error) {
      const status = this.usingFallback ? this.fallbackRpcStatus : this.primaryRpcStatus;
      if (status) {
        status.totalRequests++;
        status.failureCount++;
      }
      
      // If we have retries left, retry with exponential backoff
      if (retryCount < this.maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10s delay
        console.warn(`[SolanaService] ${operationName} failed (attempt ${retryCount + 1}/${this.maxRetries}), retrying in ${delayMs}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.executeWithRetry(operation, operationName, retryCount + 1);
      }
      
      // If all retries exhausted and fallback is available, try switching
      if (!this.usingFallback && this.fallbackConnection && this.fallbackRpcStatus) {
        console.warn(`[SolanaService] ${operationName} failed on primary after ${this.maxRetries} retries, attempting fallback...`);
        this.usingFallback = true;
        this.primaryRpcStatus.isHealthy = false;
        
        try {
          return await this.executeWithRetry(operation, `${operationName} (fallback)`, 0);
        } catch (fallbackError) {
          console.error(`[SolanaService] ${operationName} also failed on fallback:`, fallbackError);
          throw fallbackError;
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Check health of a specific connection
   */
  private async checkConnectionHealth(
    connection: Connection,
    status: RpcEndpointStatus
  ): Promise<boolean> {
    try {
      const startTime = Date.now();
      const version = await Promise.race([
        connection.getVersion(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), this.timeout)
        )
      ]) as any;
      
      const responseTime = Date.now() - startTime;
      
      status.isHealthy = true;
      status.lastCheck = new Date();
      status.lastResponseTime = responseTime;
      status.failureCount = 0;
      
      console.log(`[SolanaService] Health check passed for ${status.url} - Solana version: ${version['solana-core']}, Latency: ${responseTime}ms`);
      return true;
    } catch (error) {
      status.isHealthy = false;
      status.lastCheck = new Date();
      status.failureCount++;
      
      console.error(`[SolanaService] Health check failed for ${status.url}:`, error);
      return false;
    }
  }

  /**
   * Check connection health for all endpoints
   */
  public async checkHealth(): Promise<boolean> {
    // Check primary connection
    const primaryHealthy = await this.checkConnectionHealth(this.connection, this.primaryRpcStatus);
    
    // Check fallback connection if configured
    let fallbackHealthy = false;
    if (this.fallbackConnection && this.fallbackRpcStatus) {
      fallbackHealthy = await this.checkConnectionHealth(this.fallbackConnection, this.fallbackRpcStatus);
    }
    
    // Overall health is true if either endpoint is healthy
    this.isHealthy = primaryHealthy || fallbackHealthy;
    this.lastHealthCheck = new Date();
    
    if (!this.isHealthy) {
      console.error('[SolanaService] All RPC endpoints are unhealthy');
    }
    
    return this.isHealthy;
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
   * Get account info (with retry logic)
   */
  public async getAccountInfo(publicKey: PublicKey | string): Promise<AccountInfo<Buffer> | null> {
    const pubKey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;
    return await this.executeWithRetry(
      () => this.getConnection().getAccountInfo(pubKey),
      `getAccountInfo(${pubKey.toString()})`
    );
  }

  /**
   * Get multiple accounts info (with retry logic)
   */
  public async getMultipleAccountsInfo(
    publicKeys: (PublicKey | string)[]
  ): Promise<(AccountInfo<Buffer> | null)[]> {
    const pubKeys = publicKeys.map(pk =>
      typeof pk === 'string' ? new PublicKey(pk) : pk
    );
    return await this.executeWithRetry(
      () => this.getConnection().getMultipleAccountsInfo(pubKeys),
      `getMultipleAccountsInfo(${pubKeys.length} accounts)`
    );
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

  /**
   * Get most recent transaction signature for an account
   * Used to capture deposit transaction signatures when monitoring detects account changes
   * 
   * @param publicKey - Account public key
   * @param limit - Number of signatures to fetch (default 1)
   * @returns Most recent transaction signature or null
   */
  public async getRecentTransactionSignature(
    publicKey: PublicKey | string,
    limit: number = 1
  ): Promise<string | null> {
    try {
      const pubKey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;
      
      const signatures = await this.connection.getSignaturesForAddress(
        pubKey,
        { limit },
        'confirmed'
      );
      
      if (signatures.length === 0) {
        console.log(`[SolanaService] No transactions found for account: ${pubKey.toBase58()}`);
        return null;
      }
      
      const mostRecent = signatures[0];
      console.log(`[SolanaService] Found recent transaction for ${pubKey.toBase58()}: ${mostRecent.signature}`);
      
      return mostRecent.signature;
    } catch (error) {
      console.error(`[SolanaService] Error fetching transaction signatures:`, error);
      return null;
    }
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

    const rpcUrl = config.solana?.rpcUrl;
    
    // Validate RPC URL
    if (!rpcUrl || !rpcUrl.startsWith('http')) {
      throw new Error(
        `[SolanaService] Invalid RPC URL configuration: '${rpcUrl}'. ` +
        `SOLANA_RPC_URL must be set to a valid HTTP/HTTPS endpoint.`
      );
    }

    console.log('[SolanaService] Initializing escrow with config:', {
      rpcUrl: rpcUrl.slice(0, 30) + '...',
      network: config.solana?.network,
      programId: config.solana?.escrowProgramId,
    });
    
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
    
    // Derive escrow PDA
    const [escrowPda, bump] = await deriveEscrowPDA(
      programId,
      sellerPubkey,
      nftMintPubkey,
      buyerPubkey
    );

    // Get USDC mint address (use devnet USDC for testing)
    const usdcMintStr = config.usdc?.mintAddress || 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'; // Devnet USDC
    console.log('[SolanaService] USDC Config:', {
      configured: config.usdc?.mintAddress,
      using: usdcMintStr,
      isDefault: !config.usdc?.mintAddress
    });
    const usdcMint = new PublicKey(usdcMintStr);

    // Generate a unique escrow ID (timestamp-based)
    // This will be used to derive the PDA on-chain
    const escrowId = new BN(Date.now());
    
    console.log('[SolanaService] Generated escrow ID:', escrowId.toString());
    
    // Call Anchor program to initialize escrow on-chain
    const { getEscrowProgramService } = await import('./escrow-program.service');
    const escrowService = getEscrowProgramService();
    
    // Convert price to USDC amount (assuming 6 decimals for USDC)
    const usdcAmount = new BN(parseFloat(params.price.toString()) * 1_000_000);
    
    // Convert expiry to Unix timestamp
    const expiryTimestamp = new BN(Math.floor(params.expiry.getTime() / 1000));
    
    console.log('[SolanaService] Initializing escrow on-chain:', {
      escrowId: escrowId.toString(),
      buyer: buyerPubkey?.toString() || sellerPubkey.toString(),
      seller: sellerPubkey.toString(),
      nftMint: nftMintPubkey.toString(),
      usdcAmount: usdcAmount.toString(),
      expiryTimestamp: expiryTimestamp.toString(),
    });
    
    // Initialize escrow on-chain
    // Note: Using seller as buyer for now since buyer might be optional
    const { pda: anchorEscrowPda, txId } = await escrowService.initAgreement(
      escrowId,
      buyerPubkey || sellerPubkey, // Use seller if buyer not specified
      sellerPubkey,
      nftMintPubkey,
      usdcAmount,
      expiryTimestamp
    );
    
    console.log('[SolanaService] Escrow initialized on-chain:', {
      escrowPda: anchorEscrowPda.toString(),
      txId,
    });
    
    // Derive deposit addresses using the Anchor-derived PDA
    const depositAddresses = await deriveDepositAddresses(
      anchorEscrowPda,
      usdcMint,
      nftMintPubkey
    );
    
    console.log('[SolanaService] Deposit addresses:', JSON.stringify(depositAddresses, null, 2));

    const result = {
      escrowPda: anchorEscrowPda.toString(),
      depositAddresses,
      transactionId: txId,
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
