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
 * Custom error class for validation errors
 * Used to distinguish validation errors from other errors
 */
export class ValidationError extends Error {
  public details?: Record<string, any>;
  
  constructor(message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

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
  /**
   * Get recent transaction signature for an account with retry logic
   * Includes delay and retries to handle RPC indexing lag after account changes
   * 
   * @param publicKey Account public key
   * @param targetSlot Optional slot to find transaction near (from context)
   * @param limit Number of signatures to fetch
   * @param maxRetries Maximum number of retry attempts
   * @param retryDelayMs Delay between retries in milliseconds
   * @returns Transaction signature or null if not found
   */
  public async getRecentTransactionSignature(
    publicKey: PublicKey | string,
    targetSlot?: number,
    limit: number = 10,
    maxRetries: number = 3,
    retryDelayMs: number = 1000
  ): Promise<string | null> {
    try {
      const pubKey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Add delay before retry (except first attempt)
          if (attempt > 1) {
            console.log(`[SolanaService] Retry ${attempt}/${maxRetries} after ${retryDelayMs}ms delay...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          }
          
          const signatures = await this.connection.getSignaturesForAddress(
            pubKey,
            { limit },
            'confirmed'
          );
          
          if (signatures.length === 0) {
            if (attempt < maxRetries) {
              console.log(`[SolanaService] No transactions found yet for account: ${pubKey.toBase58()} (attempt ${attempt}/${maxRetries})`);
              continue; // Retry
            }
            console.log(`[SolanaService] No transactions found for account after ${maxRetries} attempts: ${pubKey.toBase58()}`);
            return null;
          }
          
          // If targetSlot provided, try to find transaction near that slot
          if (targetSlot !== undefined) {
            const matchingSignature = signatures.find(sig => 
              sig.slot === targetSlot || Math.abs((sig.slot || 0) - targetSlot) <= 5
            );
            
            if (matchingSignature) {
              console.log(`[SolanaService] Found transaction near slot ${targetSlot} for ${pubKey.toBase58()}: ${matchingSignature.signature}`);
              return matchingSignature.signature;
            }
            
            // If no exact match but we have signatures, log and continue
            console.log(`[SolanaService] No exact slot match found, checking if any recent transaction works...`);
          }
          
          // Return most recent if no slot match or slot not provided
          const mostRecent = signatures[0];
          console.log(`[SolanaService] Found recent transaction for ${pubKey.toBase58()}: ${mostRecent.signature} (slot: ${mostRecent.slot})`);
          
          return mostRecent.signature;
          
        } catch (retryError) {
          if (attempt < maxRetries) {
            console.warn(`[SolanaService] Attempt ${attempt}/${maxRetries} failed:`, retryError);
            continue; // Retry
          }
          throw retryError; // Last attempt failed, throw
        }
      }
      
      return null; // All retries exhausted
      
    } catch (error) {
      console.error(`[SolanaService] Error fetching transaction signatures:`, error);
      return null;
    }
  }

  /**
   * Derive SOL vault PDA from escrow PDA
   * The vault is a separate zero-data PDA that holds SOL for settlement
   */
  public async deriveSolVaultPda(escrowPdaString: string): Promise<string> {
    return deriveSolVaultPda(escrowPdaString);
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
    usdc: undefined; // Deprecated - SOL sent directly to escrowPda
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
 * Derive SOL vault PDA from escrow PDA
 * The vault is a separate zero-data PDA that holds SOL for settlement
 * Seeds: [b"sol_vault", escrow_id.to_le_bytes()]
 */
export const deriveSolVaultPda = async (
  escrowPdaString: string
): Promise<string> => {
  const { getEscrowProgramService } = await import('./escrow-program.service');
  const escrowService = getEscrowProgramService();
  
  const escrowPda = new PublicKey(escrowPdaString);
  
  // Fetch escrow state to get escrow ID
  const escrowState = await escrowService.program.account.escrowState.fetch(escrowPda);
  const escrowId = escrowState.escrowId;
  
  // Derive sol_vault PDA using same program ID
  const [solVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sol_vault'), escrowId.toArrayLike(Buffer, 'le', 8)],
    escrowService.programId
  );
  
  return solVaultPda.toString();
};

/**
 * Derive deposit addresses for NFT token accounts
 * Creates Associated Token Accounts (ATAs) for the escrow PDA
 * 
 * NOTE: USDC deposits are deprecated in V2. SOL is sent directly to escrowPda.
 * This function kept for backwards compatibility.
 */
export const deriveDepositAddresses = async (
  escrowPda: PublicKey,
  nftMint: PublicKey
): Promise<{ usdc: undefined; nft: string }> => {
  // Derive Associated Token Account addresses for the escrow PDA
  // Note: USDC deposits are deprecated - SOL is sent directly to escrowPda
  const nftAta = await getAssociatedTokenAddress(
    nftMint,
    escrowPda,
    true // allowOwnerOffCurve - PDAs are off-curve
  );

  console.log('[SolanaService] Derived deposit addresses:', {
    escrowPda: escrowPda.toString(),
    nftMint: nftMint.toString(),
    nftAta: nftAta.toString(),
  });

  return {
    usdc: undefined, // Deprecated - SOL sent directly to escrowPda
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

    // LEGACY: USDC config validation (V1 only)
    // NOTE: V2 doesn't use USDC config, but kept for backwards compatibility
    // if (!config?.usdc) {
    //   throw new Error('[SolanaService] Configuration error: config.usdc is undefined');
    // }

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
    
    // Validate NFT mint exists on-chain before proceeding
    console.log('[SolanaService] Validating NFT mint exists on-chain...');
    const solanaService = getSolanaService();
    const connection = solanaService.getConnection();
    
    try {
      const mintInfo = await connection.getAccountInfo(nftMintPubkey);
      
      if (!mintInfo) {
        throw new ValidationError(
          `NFT mint address ${params.nftMint} does not exist on-chain. ` +
          `Please verify the mint address is correct and deployed to the network.`
        );
      }
      
      console.log('[SolanaService] ✅ NFT mint validated on-chain');
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      // RPC error or network issue
      console.error('[SolanaService] Failed to validate NFT mint:', error);
      throw new ValidationError(
        `Failed to validate NFT mint address: ${error instanceof Error ? error.message : 'Network error'}`
      );
    }
    
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

    // Generate a unique escrow ID (timestamp-based)
    // This will be used to derive the PDA on-chain
    const escrowId = new BN(Date.now());
    
    console.log('[SolanaService] Generated escrow ID:', escrowId.toString());
    
    // Call Anchor program to initialize escrow on-chain
    const { getEscrowProgramService } = await import('./escrow-program.service');
    const escrowService = getEscrowProgramService();
    
    // Convert price to SOL amount in lamports (1 SOL = 1,000,000,000 lamports)
    const solAmount = new BN(parseFloat(params.price.toString()) * 1_000_000_000);
    
    // Convert expiry to Unix timestamp with 60-second buffer
    // IMPORTANT: Add buffer to account for network delays and avoid 0x1771 (InvalidExpiry) error
    // The on-chain program validates: expiry_timestamp > Clock::get()?.unix_timestamp
    // Network latency (2-10 seconds) can cause the timestamp to be in the past by the time it reaches the chain
    const BUFFER_SECONDS = 60; // 60-second safety buffer
    const expiryTimestamp = new BN(Math.floor(params.expiry.getTime() / 1000) + BUFFER_SECONDS);
    
    console.log('[SolanaService] Initializing escrow on-chain:', {
      escrowId: escrowId.toString(),
      buyer: buyerPubkey?.toString() || sellerPubkey.toString(),
      seller: sellerPubkey.toString(),
      nftMint: nftMintPubkey.toString(),
      solAmount: solAmount.toString(),
      expiryTimestamp: expiryTimestamp.toString(),
      platformFeeBps: params.feeBps,
    });
    
    // Initialize escrow on-chain with admin-controlled platform fee
    // The fee is set during initialization and stored in escrow state
    // This prevents users from bypassing fees during settlement
    // Note: Using seller as buyer for now since buyer might be optional
    const { pda: anchorEscrowPda, txId } = await escrowService.initAgreement({
      escrowId,
      buyer: buyerPubkey || sellerPubkey, // Use seller if buyer not specified
      seller: sellerPubkey,
      nftMint: nftMintPubkey,
      swapType: 'NFT_FOR_SOL',
      solAmount,
      expiryTimestamp,
      platformFeeBps: params.feeBps, // Platform fee in basis points (set by authorized admin)
    });
    
    console.log('[SolanaService] Escrow initialized on-chain:', {
      escrowPda: anchorEscrowPda.toString(),
      txId,
    });
    
    // Derive deposit addresses using the Anchor-derived PDA
    const depositAddresses = await deriveDepositAddresses(
      anchorEscrowPda,
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

/**
 * =================================
 * SOL TRANSFER UTILITIES (V2)
 * =================================
 */

/**
 * Get SOL balance for an address
 * @param address - Wallet address to check balance for
 * @param connection - Optional Solana connection (uses default if not provided)
 * @returns Balance in lamports
 */
export const getSolBalance = async (
  address: string | PublicKey,
  connection?: Connection
): Promise<number> => {
  try {
    const conn = connection || getSolanaService().getConnection();
    const pubkey = typeof address === 'string' ? new PublicKey(address) : address;
    
    const balance = await conn.getBalance(pubkey);
    console.log(`[SolanaService] SOL balance for ${pubkey.toBase58()}: ${balance} lamports (${lamportsToSol(balance)} SOL)`);
    
    return balance;
  } catch (error) {
    console.error(`[SolanaService] Failed to get SOL balance:`, error);
    throw new Error(`Failed to get SOL balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Convert lamports to SOL (with 9 decimal places)
 * @param lamports - Amount in lamports
 * @returns Amount in SOL
 */
export const lamportsToSol = (lamports: number | BN): number => {
  const lamportsNum = typeof lamports === 'number' ? lamports : lamports.toNumber();
  return lamportsNum / 1_000_000_000;
};

/**
 * Convert SOL to lamports
 * @param sol - Amount in SOL
 * @returns Amount in lamports as BN
 */
export const solToLamports = (sol: number): BN => {
  return new BN(Math.floor(sol * 1_000_000_000));
};

/**
 * Validate SOL amount for escrow (beta limits: 0.01 - 15 SOL)
 * @param lamports - Amount in lamports
 * @returns Validation result with error message if invalid
 */
export const validateSolAmount = (
  lamports: number | BN
): { valid: boolean; error?: string } => {
  const MIN_SOL = 0.01; // 10_000_000 lamports
  const MAX_SOL = 15.0;   // 15_000_000_000 lamports
  
  const lamportsNum = typeof lamports === 'number' ? lamports : lamports.toNumber();
  const solAmount = lamportsToSol(lamportsNum);
  
  if (lamportsNum < MIN_SOL * 1_000_000_000) {
    return {
      valid: false,
      error: `SOL amount below minimum: ${MIN_SOL} SOL (BETA limit). Provided: ${solAmount} SOL`
    };
  }
  
  if (lamportsNum > MAX_SOL * 1_000_000_000) {
    return {
      valid: false,
      error: `SOL amount exceeds maximum: ${MAX_SOL} SOL (BETA limit). Provided: ${solAmount} SOL`
    };
  }
  
  return { valid: true };
};

/**
 * Check if an address has sufficient SOL balance
 * @param address - Wallet address to check
 * @param requiredLamports - Required amount in lamports
 * @param connection - Optional Solana connection
 * @returns True if balance is sufficient, false otherwise
 */
export const hasSufficientSolBalance = async (
  address: string | PublicKey,
  requiredLamports: number | BN,
  connection?: Connection
): Promise<boolean> => {
  try {
    const balance = await getSolBalance(address, connection);
    const required = typeof requiredLamports === 'number' ? requiredLamports : requiredLamports.toNumber();
    
    const sufficient = balance >= required;
    console.log(`[SolanaService] Balance check: ${balance} >= ${required}? ${sufficient}`);
    
    return sufficient;
  } catch (error) {
    console.error(`[SolanaService] Failed to check SOL balance:`, error);
    return false;
  }
};

/**
 * Calculate platform fee from SOL amount
 * @param solAmount - Total SOL amount in lamports
 * @param feeBps - Fee in basis points (100 bps = 1%)
 * @returns Fee amount in lamports
 */
export const calculateSolPlatformFee = (
  solAmount: number | BN,
  feeBps: number
): BN => {
  if (feeBps < 0 || feeBps > 10000) {
    throw new Error(`Invalid fee basis points: ${feeBps}. Must be 0-10000`);
  }
  
  const amount = typeof solAmount === 'number' ? new BN(solAmount) : solAmount;
  
  // fee = amount * feeBps / 10000
  const fee = amount.mul(new BN(feeBps)).div(new BN(10000));
  
  return fee;
};

/**
 * Calculate seller's net SOL amount after platform fee
 * @param solAmount - Total SOL amount in lamports
 * @param feeBps - Fee in basis points
 * @returns Net amount seller receives in lamports
 */
export const calculateSellerNetSol = (
  solAmount: number | BN,
  feeBps: number
): BN => {
  const amount = typeof solAmount === 'number' ? new BN(solAmount) : solAmount;
  const fee = calculateSolPlatformFee(amount, feeBps);
  
  return amount.sub(fee);
};