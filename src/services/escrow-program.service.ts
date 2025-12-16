/**
 * Escrow Program Service
 *
 * Handles interactions with the deployed Anchor escrow program on Solana.
 * Provides methods to call program instructions for settlement and cancellation.
 */

import { AnchorProvider, Program, BN, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config';
import { Escrow } from '../generated/anchor/escrow';
import { getEscrowIdl } from '../utils/idl-loader';
import bs58 from 'bs58';
import { PriorityFeeService } from './priority-fee.service';

/**
 * Detect Solana network from RPC URL
 * 
 * IMPORTANT: This function determines network-specific behavior:
 * - Mainnet: Uses Jito tips (0.001 SOL), higher priority fees (50k μ), skipPreflight=true
 * - Devnet: No Jito tips, lower priority fees (5k μ), skipPreflight=false
 * 
 * @param connection - Solana connection
 * @returns true if mainnet-beta, false if devnet/testnet
 */
function isMainnetNetwork(connection: Connection): boolean {
  const rpcUrl = connection.rpcEndpoint.toLowerCase();
  
  // CRITICAL: Check for devnet/testnet FIRST to avoid false positives
  // This prevents URLs like "devnet-mainnet-test.com" from being detected as mainnet
  if (rpcUrl.includes('devnet') || rpcUrl.includes('testnet')) {
    console.log(`[EscrowProgramService] Network detection: devnet/testnet (RPC: ${connection.rpcEndpoint})`);
    return false;
  }
  
  // Then check for mainnet-beta indicators
  // Use specific patterns to avoid false positives
  const isMainnet = 
    rpcUrl.includes('mainnet-beta') || 
    rpcUrl.includes('mainnet.beta') ||
    rpcUrl.includes('api.mainnet') ||
    // Fallback: check for "mainnet" but only if devnet/testnet already excluded above
    rpcUrl.includes('mainnet');
  
  console.log(
    `[EscrowProgramService] Network detection: ${
      isMainnet ? 'mainnet-beta' : 'unknown (assuming devnet)'
    } (RPC: ${connection.rpcEndpoint})`
  );
  
  return isMainnet;
}

/**
 * Load admin keypair from environment based on NODE_ENV
 *
 * Environment-specific variables:
 * - development/test: DEVNET_ADMIN_PRIVATE_KEY
 * - staging: DEVNET_STAGING_ADMIN_PRIVATE_KEY
 * - production: MAINNET_ADMIN_PRIVATE_KEY (future)
 */
function loadAdminKeypair(): Keypair {
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Determine which environment variable to use based on NODE_ENV
  let envName: string;
  let envValue: string | undefined;

  switch (nodeEnv) {
    case 'staging':
      envName = 'DEVNET_STAGING_ADMIN_PRIVATE_KEY';
      envValue = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
      break;
    case 'production':
      envName = 'MAINNET_ADMIN_PRIVATE_KEY';
      envValue = process.env.MAINNET_ADMIN_PRIVATE_KEY;
      break;
    case 'development':
    case 'test':
    default:
      envName = 'DEVNET_ADMIN_PRIVATE_KEY';
      envValue = process.env.DEVNET_ADMIN_PRIVATE_KEY;
      break;
  }

  if (!envValue) {
    throw new Error(
      `[EscrowProgramService] Admin keypair not configured for ${nodeEnv}. Set ${envName}`
    );
  }

  try {
    // Try JSON array format [1, 2, 3, ..., 64]
    if (envValue.startsWith('[')) {
      const secretKey = Uint8Array.from(JSON.parse(envValue));
      const keypair = Keypair.fromSecretKey(secretKey);
      console.log(
        `[EscrowProgramService] Loaded admin keypair from ${envName} (${nodeEnv}): ${keypair.publicKey.toString()}`
      );
      return keypair;
    }

    // Try Base58 format (Solana standard)
    const secretKey = bs58.decode(envValue);
    if (secretKey.length === 64) {
      const keypair = Keypair.fromSecretKey(secretKey);
      console.log(
        `[EscrowProgramService] Loaded admin keypair from ${envName} (${nodeEnv}): ${keypair.publicKey.toString()}`
      );
      return keypair;
    }

    // Try Base64 format
    const base64Key = Buffer.from(envValue, 'base64');
    if (base64Key.length === 64) {
      const keypair = Keypair.fromSecretKey(base64Key);
      console.log(
        `[EscrowProgramService] Loaded admin keypair from ${envName} (${nodeEnv}): ${keypair.publicKey.toString()}`
      );
      return keypair;
    }

    throw new Error('Unsupported keypair format (expected Base58, JSON array, or Base64)');
  } catch (error) {
    throw new Error(
      `[EscrowProgramService] Failed to load admin keypair from ${envName}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Escrow Program Service Class
 */
export class EscrowProgramService {
  private provider: AnchorProvider;
  public program: Program<Escrow>; // Made public for access from other services
  private adminKeypair: Keypair;
  
  // Jito rate limiting: 1 request per second across all instances
  private static lastJitoRequestTime: number = 0;
  private static readonly JITO_RATE_LIMIT_MS = 1000; // 1 second between requests

  // Some forwarders do not expose getInflightBundleStatuses. Cache capability per instance.
  private inflightBundleStatusesSupported: boolean | null = null;
  
  // Public getter for programId
  public get programId(): PublicKey {
    return this.program.programId;
  }

  constructor() {
    // Load admin keypair from environment
    this.adminKeypair = loadAdminKeypair();

    // Get RPC URL
    if (!config?.solana?.rpcUrl) {
      throw new Error('[EscrowProgramService] Solana RPC URL not configured');
    }

    // Create connection
    const connection = new Connection(config.solana.rpcUrl, 'confirmed');

    // Create wallet wrapper
    const wallet = new Wallet(this.adminKeypair);

    // Create provider
    this.provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

    // Get program ID
    if (!config?.solana?.escrowProgramId) {
      throw new Error('[EscrowProgramService] Escrow program ID not configured');
    }

    const programId = new PublicKey(config.solana.escrowProgramId);

    // Initialize program
    // Note: In Anchor v0.32.1, Program constructor takes (idl, provider)
    // The programId is taken from the IDL's address field
    // We verify it matches our config
    const escrowIdl = getEscrowIdl();
    this.program = new Program<Escrow>(escrowIdl as any, this.provider);

    // Verify the program ID matches
    if (!this.program.programId.equals(programId)) {
      throw new Error(
        `[EscrowProgramService] Program ID mismatch: ` +
          `IDL has ${this.program.programId.toString()}, ` +
          `config has ${programId.toString()}`
      );
    }

    console.log('[EscrowProgramService] Initialized with program:', programId.toString());
  }

  /**
   * Send transaction directly to Jito Block Engine (FREE alternative to QuickNode's Lil' JIT add-on)
   * 
   * For mainnet: Sends transaction directly to Jito's Block Engine for MEV protection
   * For devnet: Uses regular RPC (no Jito needed)
   * 
   * Cost savings: $0/month vs $89/month for QuickNode Lil' JIT add-on
   * 
   * @param transaction - Signed transaction to send
   * @param isMainnet - Whether this is mainnet (determines Jito vs regular RPC)
   * @returns Transaction signature
   */
  private async sendTransactionViaJito(
    transaction: any,
    isMainnet: boolean
  ): Promise<string> {
    // For devnet, use regular RPC (no Jito needed, cheaper)
    if (!isMainnet) {
      console.log('[EscrowProgramService] Sending via regular RPC (devnet)');
      const txId = await this.provider.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      
      // For devnet, wait for confirmation using standard Solana RPC
      // Devnet doesn't use Jito bundling so confirmTransaction is appropriate
      console.log('[EscrowProgramService] Waiting for devnet transaction confirmation...');
      
      const confirmation = await this.provider.connection.confirmTransaction(txId, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('[EscrowProgramService] Transaction failed on-chain:', confirmation.value.err);
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log('[EscrowProgramService] ✅ Transaction confirmed on-chain');
      return txId;
    }

    // For mainnet, send directly to Jito Block Engine (FREE!)
    const JITO_BLOCK_ENGINE_MAINNET = 'https://mainnet.block-engine.jito.wtf';
    
    const serializedTransaction = transaction.serialize().toString('base64');
    
    console.log('[EscrowProgramService] Sending transaction via Jito Block Engine directly (bypassing QuickNode)');
    
    // Retry logic for rate limiting (429 errors)
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Rate limiting: Ensure at least 1 second between Jito requests
        // Atomically reserve next slot to prevent race conditions
        const now = Date.now();
        const nextAvailableTime = EscrowProgramService.lastJitoRequestTime + EscrowProgramService.JITO_RATE_LIMIT_MS;
        const delayMs = Math.max(0, nextAvailableTime - now);
        
        // Reserve slot BEFORE waiting (prevents concurrent requests from bypassing rate limit)
        EscrowProgramService.lastJitoRequestTime = Math.max(now, nextAvailableTime);
        
        if (delayMs > 0) {
          console.log(`[EscrowProgramService] Rate limiting: Waiting ${delayMs}ms before Jito request (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        const response = await fetch(`${JITO_BLOCK_ENGINE_MAINNET}/api/v1/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sendTransaction',
            params: [serializedTransaction, { encoding: 'base64' }],
          }),
        });

        // Check HTTP response status before attempting to parse JSON
        if (!response.ok) {
          const errorText = await response.text();
          
          // Special handling for rate limit (429) - retry with exponential backoff
          if (response.status === 429 && attempt < MAX_RETRIES) {
            const retryAfter = 1000 * (attempt + 1); // Exponential backoff: 1s, 2s, 3s
            console.warn(
              `[EscrowProgramService] Jito rate limit hit (429). Retry ${attempt + 1}/${MAX_RETRIES} after ${retryAfter}ms`
            );
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            continue; // Retry
          }
          
          console.error(
            `[EscrowProgramService] Jito Block Engine HTTP error: ${response.status} ${response.statusText}`,
            errorText
          );
          throw new Error(
            `Jito Block Engine HTTP ${response.status}: ${response.statusText}. ${errorText.substring(0, 200)}`
          );
        }

        // Parse JSON response
        const result = await response.json() as {
          result?: string;
          error?: { message?: string; [key: string]: any };
        };
        
        // Check for JSON-RPC error in response
        if (result.error) {
          console.error('[EscrowProgramService] Jito Block Engine RPC error:', result.error);
          throw new Error(`Jito sendTransaction failed: ${result.error.message || JSON.stringify(result.error)}`);
        }

        // Verify we got a transaction signature
        if (!result.result) {
          throw new Error('Jito sendTransaction returned no signature');
        }

        console.log('[EscrowProgramService] ✅ Transaction sent via Jito Block Engine:', result.result);
        
        // Return signature immediately - don't wait for confirmation inline
        // Jito's multi-stage pipeline (Relayer 200ms + Simulation 10-50ms + Auction 50-200ms)
        // means transactions take 1-3s to land (5-10s under congestion)
        // Caller should use waitForJitoConfirmation() to poll bundle status asynchronously
        return result.result;
        
      } catch (error) {
        lastError = error as Error;
        console.error(`[EscrowProgramService] Jito request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, error);
        
        // If this is the last attempt, throw the error
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        
        // Otherwise, continue to next retry
      }
    }
    
    // Should never reach here, but if we do, throw the last error
    throw lastError || new Error('Failed to send transaction via Jito after all retries');
  }

  /**
   * Wait for Jito transaction confirmation with proper bundle status polling
   * 
   * Implements research-backed best practices:
   * - Tiered polling: 1-2s for first 15s, 2-3s for next 15s
   * - Bundle status checking via Jito APIs
   * - Blockhash expiration tracking (60-90s lifetime)
   * - Automatic retry with fresh blockhash after timeout
   * 
   * @param signature Transaction signature from Jito sendTransaction
   * @param blockhash Original blockhash used in transaction
   * @param blockhashLastValidHeight Last valid block height for blockhash
   * @param maxAttempts Maximum polling attempts before giving up
   * @param timeoutSeconds Timeout in seconds before recommending fresh blockhash (default: 60 for mainnet)
   * @returns Confirmation result
   */
  async waitForJitoConfirmation(
    signature: string,
    blockhash: string,
    blockhashLastValidHeight: number,
    maxAttempts: number = 30,
    timeoutSeconds: number = 60
  ): Promise<{ confirmed: boolean; error?: string }> {
    console.log(`[EscrowProgramService] Starting Jito confirmation polling for ${signature}`);
    console.log(`[EscrowProgramService] Blockhash: ${blockhash}, Last valid height: ${blockhashLastValidHeight}`);
    
    const startTime = Date.now();
    let attempt = 0;
    
    while (attempt < maxAttempts) {
      attempt++;
      const elapsed = (Date.now() - startTime) / 1000;
      
      // Tiered polling intervals based on research
      // 1-2s for first 15s (aggressive), 2-3s for next 15s (moderate)
      const pollInterval = elapsed < 15 ? 1500 : 2500;
      
      console.log(`[EscrowProgramService] Poll attempt ${attempt}/${maxAttempts} (${elapsed.toFixed(1)}s elapsed)`);
      
      try {
        // Check current block height to detect blockhash expiration
        const currentHeight = await this.provider.connection.getBlockHeight('confirmed');
        
        if (currentHeight > blockhashLastValidHeight) {
          console.error(`[EscrowProgramService] Blockhash expired! Current: ${currentHeight}, Last valid: ${blockhashLastValidHeight}`);
          return {
            confirmed: false,
            error: `Blockhash expired after ${elapsed.toFixed(1)}s. Transaction must be retried with fresh blockhash.`
          };
        }
        
        // Check transaction status using standard Solana RPC
        // Jito transactions appear in regular tx status once landed
        const statuses = await this.provider.connection.getSignatureStatuses([signature]);
        const status = statuses?.value?.[0];
        
        if (status) {
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            // Transaction landed successfully
            if (status.err) {
              console.error(`[EscrowProgramService] Transaction failed on-chain:`, status.err);
              return {
                confirmed: false,
                error: `Transaction failed: ${JSON.stringify(status.err)}`
              };
            }
            
            console.log(`[EscrowProgramService] ✅ Transaction confirmed on-chain after ${elapsed.toFixed(1)}s (${attempt} polls)`);
            return { confirmed: true };
          }
        }
        
        // After timeout, recommend retry with fresh blockhash
        if (elapsed > timeoutSeconds) {
          console.warn(`[EscrowProgramService] Transaction not confirmed after ${timeoutSeconds}s - recommend retry with fresh blockhash`);
          return {
            confirmed: false,
            error: `Transaction not confirmed after ${timeoutSeconds}s. Blockhash may expire soon (${blockhashLastValidHeight - currentHeight} blocks remaining). Retry with fresh blockhash recommended.`
          };
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        console.error(`[EscrowProgramService] Error polling transaction status:`, error);
        // Continue polling despite errors
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    // Max attempts reached
    console.error(`[EscrowProgramService] Max polling attempts (${maxAttempts}) reached after ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return {
      confirmed: false,
      error: `Transaction confirmation timeout after ${maxAttempts} attempts. Status unknown - check explorer.`
    };
  }

  // ==================== JITO BUNDLE SUBMISSION ====================
  // For bulk cNFT swaps requiring multiple transactions

  /**
   * Jito Bundle API endpoints
   */
  private static readonly JITO_BUNDLE_ENDPOINT_MAINNET = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
  private static readonly JITO_TIP_ENDPOINT_MAINNET = 'https://bundles.jito.wtf/api/v1/bundles/tip_floor';
  
  /**
   * Default Jito tip amount in lamports (fallback when tip API fails)
   * 0.001 SOL = 1,000,000 lamports - based on legacy production testing
   * This is above 50th percentile and provides reliable bundle inclusion
   */
  private static readonly DEFAULT_JITO_TIP_LAMPORTS = 1_000_000;
  
  /**
   * Maximum transactions per Jito bundle
   */
  private static readonly MAX_BUNDLE_SIZE = 5;
  
  /**
   * Bundle confirmation timeout in seconds
   * Based on legacy code: Jito's multi-stage pipeline takes 1-3s normal, 5-10s congested
   * 30s allows for blockhash retry recommendation (half of 60-90s lifetime)
   */
  private static readonly BUNDLE_CONFIRMATION_TIMEOUT_SECONDS = 30;
  
  /**
   * Delay between sequential bundle submissions in ms
   * CRITICAL: Learned from stuck-agreement-monitor - multiple parallel requests overwhelm Jito
   * 3 seconds between operations prevents rate limiting issues
   */
  private static readonly BUNDLE_SEQUENTIAL_DELAY_MS = 3000;

  /**
   * Get current Jito tip floor from API
   * Returns tip amount in lamports
   */
  async getJitoTipFloor(): Promise<bigint> {
    try {
      console.log('[EscrowProgramService] Fetching Jito tip floor...');
      
      const response = await fetch(EscrowProgramService.JITO_TIP_ENDPOINT_MAINNET, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        console.warn(`[EscrowProgramService] Jito tip API returned ${response.status}, using default`);
        return BigInt(EscrowProgramService.DEFAULT_JITO_TIP_LAMPORTS);
      }
      
      const data = await response.json() as { landed_tips_25th_percentile?: number; landed_tips_50th_percentile?: number };
      
      // Use 50th percentile for reasonable tip, convert SOL to lamports
      const tipSol = data.landed_tips_50th_percentile || 0.001;
      const tipLamports = BigInt(Math.ceil(tipSol * 1_000_000_000));
      
      console.log(`[EscrowProgramService] Jito tip floor: ${tipSol} SOL (${tipLamports} lamports)`);
      
      return tipLamports;
    } catch (error) {
      console.warn('[EscrowProgramService] Failed to fetch Jito tip floor, using default:', error);
      return BigInt(EscrowProgramService.DEFAULT_JITO_TIP_LAMPORTS);
    }
  }

  /**
   * Simulate a bundle before submission
   * 
   * @param serializedTransactions - Array of base64-encoded serialized transactions
   * @returns Simulation result with success/failure status
   */
  async simulateBundle(serializedTransactions: string[]): Promise<{
    success: boolean;
    error?: string;
    logs?: string[];
  }> {
    console.log(`[EscrowProgramService] Simulating bundle with ${serializedTransactions.length} transactions...`);
    
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 1000; // 1 second base delay
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Rate limiting: ensure minimum 1 second between Jito requests
        const now = Date.now();
        const nextAvailableTime = EscrowProgramService.lastJitoRequestTime + EscrowProgramService.JITO_RATE_LIMIT_MS;
        const delayMs = Math.max(0, nextAvailableTime - now);
        
        if (delayMs > 0 && attempt === 1) {
          console.log(`[EscrowProgramService] Rate limiting: Waiting ${delayMs}ms before bundle simulation`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        EscrowProgramService.lastJitoRequestTime = Math.max(now, nextAvailableTime);
        
        // Jito Block Engine uses JSON-RPC format (as per legacy working code)
        // Endpoint: POST /api/v1/bundles with JSON-RPC body
        const response = await fetch(EscrowProgramService.JITO_BUNDLE_ENDPOINT_MAINNET, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'simulateBundle',
            params: [
              { 
                encodedTransactions: serializedTransactions 
              }
            ],
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          
          // Handle rate limiting (429) with retry
          if (response.status === 429 && attempt < MAX_RETRIES) {
            const retryDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
            console.warn(`[EscrowProgramService] Bundle simulation rate limited (429), retrying in ${retryDelay}ms (attempt ${attempt}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue; // Retry
          }
          
          console.error(`[EscrowProgramService] Bundle simulation HTTP error: ${response.status}`, errorText);
          return {
            success: false,
            error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
          };
        }
        
        const result = await response.json() as {
          result?: { value?: { transactionResults?: Array<{ error?: any; logs?: string[] }> } };
          error?: { message?: string; code?: number };
        };
        
        // Handle RPC-level rate limiting errors
        if (result.error) {
          const isRateLimit = result.error.code === -32097 || 
                             (result.error.message && result.error.message.includes('rate limit'));
          
          if (isRateLimit && attempt < MAX_RETRIES) {
            const retryDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
            console.warn(`[EscrowProgramService] Bundle simulation rate limited (RPC error), retrying in ${retryDelay}ms (attempt ${attempt}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue; // Retry
          }
          
          console.error('[EscrowProgramService] Bundle simulation RPC error:', result.error);
          return {
            success: false,
            error: result.error.message || JSON.stringify(result.error),
          };
        }
        
        // Check if any transaction failed
        const txResults = result.result?.value?.transactionResults || [];
        const failedTx = txResults.find((tx: any) => tx.error);
        
        if (failedTx) {
          console.error('[EscrowProgramService] Bundle simulation: Transaction failed:', failedTx.error);
          return {
            success: false,
            error: `Transaction simulation failed: ${JSON.stringify(failedTx.error)}`,
            logs: failedTx.logs,
          };
        }
        
        console.log('[EscrowProgramService] ✅ Bundle simulation successful');
        return { success: true };
        
      } catch (error) {
        // Network errors - retry with exponential backoff
        if (attempt < MAX_RETRIES) {
          const retryDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[EscrowProgramService] Bundle simulation network error, retrying in ${retryDelay}ms (attempt ${attempt}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue; // Retry
        }
        
        console.error('[EscrowProgramService] Bundle simulation error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown simulation error',
        };
      }
    }
    
    // If we get here, all retries exhausted
    return {
      success: false,
      error: 'Bundle simulation failed after all retries',
    };
  }

  /**
   * Send a bundle of transactions to Jito Block Engine
   * 
   * For bulk cNFT swaps requiring multiple transactions for atomicity.
   * Uses Jito bundles to ensure all transactions land in the same slot or none do.
   * 
   * CRITICAL REQUIREMENTS (from legacy production testing):
   * 
   * 1. **Tip Placement**: Jito tips MUST be the LAST instruction in the LAST transaction
   *    - Tip must be SystemProgram.transfer to one of the 8 official Jito tip accounts
   *    - Use getRandomJitoTipAccount() for load balancing
   * 
   * 2. **Compute Budget**: Each transaction MUST include compute budget instructions
   *    - ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000-300_000 })
   *    - ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000-50_000 })
   * 
   * 3. **skipPreflight**: Mainnet transactions should use skipPreflight: true
   *    - Without this, Jito endpoint simulation checks for tips and may fail
   * 
   * 4. **Rate Limiting**: Max 1 request/second to Jito
   *    - Use BUNDLE_SEQUENTIAL_DELAY_MS (3s) between sequential operations
   * 
   * @param serializedTransactions - Array of base64-encoded serialized transactions (max 5)
   * @param options - Bundle options
   * @returns Bundle submission result with bundle ID
   */
  async sendBundleViaJito(
    serializedTransactions: string[],
    options: {
      /** Skip simulation (use with caution) */
      skipSimulation?: boolean;
      /** Custom tip amount in lamports (overrides dynamic tip) */
      customTipLamports?: bigint;
      /** Description for logging */
      description?: string;
    } = {}
  ): Promise<{
    success: boolean;
    bundleId?: string;
    signatures?: string[];
    error?: string;
  }> {
    const { skipSimulation = false, customTipLamports, description = 'Bulk swap bundle' } = options;
    
    console.log(`[EscrowProgramService] Sending Jito bundle: ${description}`);
    console.log(`[EscrowProgramService] Bundle contains ${serializedTransactions.length} transactions`);
    
    // Validate bundle size
    if (serializedTransactions.length === 0) {
      return { success: false, error: 'Bundle cannot be empty' };
    }
    
    if (serializedTransactions.length > EscrowProgramService.MAX_BUNDLE_SIZE) {
      return {
        success: false,
        error: `Bundle exceeds maximum size (${serializedTransactions.length} > ${EscrowProgramService.MAX_BUNDLE_SIZE})`,
      };
    }
    
    // Extract tx signatures (best-effort) for confirmation fallback.
    // We do this before submission so status polling can fall back to on-chain signature checks.
    const txSignatures: string[] = [];

    // Validate transaction encoding
    for (let i = 0; i < serializedTransactions.length; i++) {
      const tx = serializedTransactions[i];
      if (!tx || typeof tx !== 'string') {
        return {
          success: false,
          error: `Transaction ${i} is invalid: expected base64 string, got ${typeof tx}`,
        };
      }
      
      // Validate base64 format
      // Buffer.from() with 'base64' doesn't throw on invalid input, so we need to validate properly
      // Check if string matches base64 pattern and can be decoded/re-encoded correctly
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(tx)) {
        return {
          success: false,
          error: `Transaction ${i} contains invalid base64 characters`,
        };
      }
      
      try {
        const decoded = Buffer.from(tx, 'base64');
        if (decoded.length === 0) {
          return {
            success: false,
            error: `Transaction ${i} decodes to empty buffer`,
          };
        }
        
        // Verify base64 encoding by re-encoding and comparing
        // This catches cases where Buffer.from() silently ignores invalid characters
        const reEncoded = decoded.toString('base64');
        // Remove padding for comparison (base64 padding can vary)
        const normalizedOriginal = tx.replace(/=+$/, '');
        const normalizedReEncoded = reEncoded.replace(/=+$/, '');
        
        if (normalizedOriginal !== normalizedReEncoded) {
          return {
            success: false,
            error: `Transaction ${i} is not valid base64: decoded and re-encoded string does not match`,
          };
        }
        
        // Log transaction size for debugging
        console.log(`[EscrowProgramService] Transaction ${i} size: ${decoded.length} bytes`);
        
        // Validate that transaction is fully signed (Jito requires this)
        // Note: Transactions are pre-signed with platform authority in TransactionGroupBuilder
        // and then maker/taker signatures are added via partialSign() in test-execute route
        try {
          const isVersioned = (decoded[0] & 0x80) !== 0;
          if (isVersioned) {
            const versionedTx = VersionedTransaction.deserialize(decoded);
            // Check if all signatures are present (not null/empty)
            const validSignatures = versionedTx.signatures.filter(sig => 
              sig && sig.length === 64 && !sig.every(byte => byte === 0)
            );
            if (validSignatures.length !== versionedTx.signatures.length) {
              return {
                success: false,
                error: `Transaction ${i} is not fully signed. Jito requires all signatures to be present. Found ${versionedTx.signatures.length} signature slots, but only ${validSignatures.length} are valid. Missing signatures will cause Jito to reject the bundle.`,
              };
            }
            console.log(`[EscrowProgramService] Transaction ${i} has ${versionedTx.signatures.length} valid signatures (versioned)`);

            // Best-effort: first signature is the transaction id
            if (versionedTx.signatures?.[0]?.length === 64) {
              txSignatures.push(bs58.encode(Buffer.from(versionedTx.signatures[0])));
            }
          } else {
            const legacyTx = Transaction.from(decoded);
            // Check if all signatures are present (not null/empty)
            const validSignatures = legacyTx.signatures.filter(sig => 
              sig && sig.signature && sig.signature.length === 64 && !sig.signature.every(byte => byte === 0)
            );
            if (validSignatures.length !== legacyTx.signatures.length) {
              return {
                success: false,
                error: `Transaction ${i} is not fully signed. Jito requires all signatures to be present. Found ${legacyTx.signatures.length} signature slots, but only ${validSignatures.length} are valid. Missing signatures will cause Jito to reject the bundle.`,
              };
            }
            console.log(`[EscrowProgramService] Transaction ${i} has ${legacyTx.signatures.length} valid signatures (legacy)`);

            // Best-effort: first signature is the transaction id
            const firstSig = legacyTx.signatures?.[0]?.signature;
            if (firstSig && firstSig.length === 64 && !firstSig.every(byte => byte === 0)) {
              txSignatures.push(bs58.encode(Buffer.from(firstSig)));
            }
          }
        } catch (sigError: any) {
          // If we can't deserialize to check signatures, that's also a problem
          return {
            success: false,
            error: `Transaction ${i} could not be decoded to verify signatures: ${sigError.message}. Ensure it is a valid, fully signed transaction.`,
          };
        }
      } catch (error: any) {
        return {
          success: false,
          error: `Transaction ${i} base64 validation error: ${error.message}`,
        };
      }
    }

    // Jito bundle requirement: at least one transaction must write-lock an official tip account.
    // If we don't include it, Jito will reject the bundle with:
    // "Bundles must write lock at least one tip account to be eligible for the auction."
    if (serializedTransactions.length > 1) {
      try {
        const tipAccounts = new Set(this.getJitoTipAccounts());
        let hasTipLock = false;

        for (let i = 0; i < serializedTransactions.length; i++) {
          const decoded = Buffer.from(serializedTransactions[i], 'base64');
          const isVersioned = (decoded[0] & 0x80) !== 0;

          if (isVersioned) {
            const vtx = VersionedTransaction.deserialize(decoded);
            const keys = vtx.message.staticAccountKeys.map(k => k.toBase58());
            for (let k = 0; k < keys.length; k++) {
              if (tipAccounts.has(keys[k]) && vtx.message.isAccountWritable(k)) {
                hasTipLock = true;
                break;
              }
            }
          } else {
            const ltx = Transaction.from(decoded);
            const msg = ltx.compileMessage();
            const keys = msg.accountKeys.map(k => k.toBase58());
            for (let k = 0; k < keys.length; k++) {
              if (tipAccounts.has(keys[k]) && msg.isAccountWritable(k)) {
                hasTipLock = true;
                break;
              }
            }
          }

          if (hasTipLock) break;
        }

        if (!hasTipLock) {
          return {
            success: false,
            error:
              'Jito bundle tip missing: no writable Jito tip account found in any transaction. ' +
              'Ensure a SystemProgram.transfer to an official tip account is included as the last instruction of at least one transaction in the bundle.',
          };
        }
      } catch (tipCheckErr) {
        // Best-effort: do not fail submission due to tip-check parsing issues.
      }
    }
    
    // For devnet, submit transactions individually (Jito bundles don't work on devnet)
    const isMainnet = isMainnetNetwork(this.provider.connection);
    if (!isMainnet) {
      console.log('[EscrowProgramService] Devnet detected - submitting transactions individually');
      return this.submitTransactionsIndividually(serializedTransactions);
    }
    
    try {
      // Rate limiting
      const now = Date.now();
      const nextAvailableTime = EscrowProgramService.lastJitoRequestTime + EscrowProgramService.JITO_RATE_LIMIT_MS;
      const delayMs = Math.max(0, nextAvailableTime - now);
      
      if (delayMs > 0) {
        console.log(`[EscrowProgramService] Rate limiting: Waiting ${delayMs}ms before Jito bundle request`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      EscrowProgramService.lastJitoRequestTime = Math.max(now, nextAvailableTime);
      
      // NOTE: Jito Block Engine API does NOT support simulateBundle method
      // The simulateBundle method returns -32601 "Invalid method" error
      // Instead, we skip simulation for Jito bundles and rely on:
      // 1. Proper transaction validation before bundling
      // 2. Jito's own validation when accepting the bundle
      // 3. Bundle status polling to detect failures
      if (!skipSimulation) {
        console.log('[EscrowProgramService] ⚠️ Bundle simulation skipped - Jito API does not support simulateBundle method');
        console.log('[EscrowProgramService] Relying on transaction validation and Jito bundle status polling');
        // Note: We could simulate transactions individually via regular RPC if needed,
        // but that's expensive and Jito will validate anyway
      }
      
      // Submit bundle to Jito with retry logic for rate limiting
      console.log('[EscrowProgramService] Submitting bundle to Jito Block Engine...');
      
      // Increased retries and delays for global rate limiting
      // Jito has global rate limits that can affect all users during network congestion
      const MAX_BUNDLE_RETRIES = 5; // Increased from 3 to 5
      const BASE_BUNDLE_DELAY_MS = 2000; // Increased from 1s to 2s base delay
      const GLOBAL_RATE_LIMIT_DELAY_MS = 5000; // Special longer delay for global rate limits
      
      for (let attempt = 1; attempt <= MAX_BUNDLE_RETRIES; attempt++) {
        try {
          // Rate limiting: ensure minimum 1 second between Jito requests
          const now = Date.now();
          const nextAvailableTime = EscrowProgramService.lastJitoRequestTime + EscrowProgramService.JITO_RATE_LIMIT_MS;
          const delayMs = Math.max(0, nextAvailableTime - now);
          
          if (delayMs > 0 && attempt === 1) {
            console.log(`[EscrowProgramService] Rate limiting: Waiting ${delayMs}ms before bundle submission`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          
          EscrowProgramService.lastJitoRequestTime = Math.max(now, nextAvailableTime);
          
          // Jito Block Engine uses JSON-RPC format
          // CRITICAL: Must specify encoding: "base64" when sending base64-encoded transactions
          // Without this flag, Jito defaults to base58 and will fail to decode transaction #0
          // Endpoint: POST /api/v1/bundles with JSON-RPC body
          const response = await fetch(EscrowProgramService.JITO_BUNDLE_ENDPOINT_MAINNET, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'sendBundle',
              params: [serializedTransactions, { encoding: 'base64' }],
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            
            // Handle rate limiting (429) with retry
            if (response.status === 429 && attempt < MAX_BUNDLE_RETRIES) {
              const retryDelay = BASE_BUNDLE_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
              console.warn(`[EscrowProgramService] Jito bundle rate limit hit (429), retrying in ${retryDelay}ms (attempt ${attempt}/${MAX_BUNDLE_RETRIES})...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue; // Retry
            }
            
            console.error(`[EscrowProgramService] Jito bundle HTTP error: ${response.status}`, errorText);
            return {
              success: false,
              error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
            };
          }
          
          // Jito JSON-RPC response format (verified with test helper and E2E tests)
          const result = await response.json() as {
            result?: { bundleId?: string } | string;  // Can be object with bundleId or direct string
            error?: { message?: string; code?: number };
          };
          
          // Handle RPC-level rate limiting errors
          if (result.error) {
            const isRateLimit = result.error.code === -32097 || 
                               (result.error.message && result.error.message.includes('rate limit'));
            const isGlobalRateLimit = result.error.code === -32097 && 
                                     (result.error.message?.includes('globally') || result.error.message?.includes('Network congested'));
            
            if (isRateLimit && attempt < MAX_BUNDLE_RETRIES) {
              // Use longer delay for global rate limits (network congestion)
              const retryDelay = isGlobalRateLimit 
                ? GLOBAL_RATE_LIMIT_DELAY_MS * attempt // 5s, 10s, 15s, 20s, 25s for global limits
                : BASE_BUNDLE_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s, 16s, 32s for regular limits
              
              console.warn(`[EscrowProgramService] Jito bundle rate limited (${isGlobalRateLimit ? 'GLOBAL' : 'regular'}), retrying in ${retryDelay}ms (attempt ${attempt}/${MAX_BUNDLE_RETRIES})...`);
              console.warn(`[EscrowProgramService] Rate limit error: ${result.error.message}`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue; // Retry
            }
            
            console.error('[EscrowProgramService] Jito bundle RPC error:', result.error);
            
            // Provide more detailed error information for decode errors
            if (result.error.code === -32602) {
              const errorMsg = result.error.message || '';
              // Check if it's a transaction decode error
              if (errorMsg.includes('could not be decoded') || errorMsg.includes('transaction')) {
                console.error('[EscrowProgramService] Transaction decode error details:', {
                  errorCode: result.error.code,
                  errorMessage: errorMsg,
                  transactionCount: serializedTransactions.length,
                  firstTxLength: serializedTransactions[0]?.length,
                  firstTxPreview: serializedTransactions[0]?.substring(0, 50) + '...',
                });
                
                return {
                  success: false,
                  error: `Transaction encoding error: ${errorMsg}. Transactions must be fully signed and properly base64 encoded. Check transaction serialization.`,
                };
              }
            }
            
            return {
              success: false,
              error: result.error.message || JSON.stringify(result.error),
            };
          }
          
          // Extract bundle ID - support both formats for compatibility
          let bundleId: string | undefined;
          if (typeof result.result === 'string') {
            // Direct string format (legacy)
            bundleId = result.result;
          } else if (result.result && typeof result.result === 'object' && 'bundleId' in result.result) {
            // Nested object format (test helper format, verified working)
            bundleId = result.result.bundleId;
          }
          
          if (!bundleId) {
            return {
              success: false,
              error: 'Jito sendBundle returned no bundle ID',
            };
          }
          console.log(`[EscrowProgramService] ✅ Bundle submitted to Jito: ${bundleId}`);
          
          return {
            success: true,
            bundleId,
            signatures: txSignatures.length === serializedTransactions.length ? txSignatures : undefined,
          };
          
        } catch (error) {
          // Network errors - retry with exponential backoff
          if (attempt < MAX_BUNDLE_RETRIES) {
            const retryDelay = BASE_BUNDLE_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(`[EscrowProgramService] Bundle submission network error, retrying in ${retryDelay}ms (attempt ${attempt}/${MAX_BUNDLE_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue; // Retry
          }
          
          console.error('[EscrowProgramService] Bundle submission error:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown bundle submission error',
          };
        }
      }
      
      // If we get here, all retries exhausted
      return {
        success: false,
        error: 'Bundle submission failed after all retries',
      };
      
    } catch (error) {
      console.error('[EscrowProgramService] Bundle submission error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown bundle submission error',
      };
    }
  }

  /**
   * Get bundle status from Jito
   * 
   * @param bundleIds - Array of bundle IDs to check
   * @returns Bundle status results
   */
  async getBundleStatuses(bundleIds: string[]): Promise<{
    bundleId: string;
    status: 'Invalid' | 'Pending' | 'Failed' | 'Landed';
    slot?: number;
    error?: string;
  }[]> {
    console.log(`[EscrowProgramService] Checking status of ${bundleIds.length} bundle(s)...`);
    
    try {
      // Jito Block Engine uses JSON-RPC format (verified with test helper and E2E tests)
      // For multiple bundle IDs, use nested array format: [[id1], [id2], ...]
      // This matches the test helper format for single IDs: [[bundleId]]
      const response = await fetch(EscrowProgramService.JITO_BUNDLE_ENDPOINT_MAINNET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBundleStatuses',
          params: bundleIds.map(id => [id]), // Nested array format for consistency
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[EscrowProgramService] Bundle status HTTP error: ${response.status}`, errorText);
        // Treat 429 as transient/no-signal. Jito/forwarders can be globally rate limited.
        if (response.status === 429) {
          return bundleIds.map(id => ({ bundleId: id, status: 'Pending' as const, error: 'HTTP 429 rate limited' }));
        }
        return bundleIds.map(id => ({ bundleId: id, status: 'Invalid' as const, error: `HTTP ${response.status}` }));
      }
      
      const result = await response.json() as {
        result?: { value?: Array<{ bundle_id: string; status: string; slot?: number }> };
        error?: { message?: string };
      };
      
      if (result.error) {
        console.error('[EscrowProgramService] Bundle status RPC error:', result.error);
        return bundleIds.map(id => ({ bundleId: id, status: 'Invalid' as const, error: result.error?.message }));
      }
      
      const statuses = result.result?.value || [];
      
      return bundleIds.map(bundleId => {
        const bundleStatus = statuses.find((s: any) => s.bundle_id === bundleId);
        if (!bundleStatus) {
          // "Bundle not found" is common immediately after submission (status plumbing lags).
          // Treat as Pending rather than a definitive failure.
          return { bundleId, status: 'Pending' as const, error: 'Bundle not found' };
        }
        
        // Map Jito status to our enum
        let status: 'Invalid' | 'Pending' | 'Failed' | 'Landed';
        switch (bundleStatus.status) {
          case 'Landed':
          case 'landed':
            status = 'Landed';
            break;
          case 'Pending':
          case 'pending':
            status = 'Pending';
            break;
          case 'Failed':
          case 'failed':
            status = 'Failed';
            break;
          default:
            status = 'Invalid';
        }
        
        return {
          bundleId,
          status,
          slot: bundleStatus.slot,
        };
      });
      
    } catch (error) {
      console.error('[EscrowProgramService] Bundle status check error:', error);
      return bundleIds.map(id => ({
        bundleId: id,
        status: 'Invalid' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  /**
   * Get inflight bundle status (most useful immediately after submission).
   * Some forwarders (e.g. QuickNode) expose getInflightBundleStatuses which looks back ~5 minutes.
   */
  async getInflightBundleStatuses(bundleIds: string[]): Promise<{
    bundleId: string;
    status: 'Invalid' | 'Pending' | 'Failed' | 'Landed';
    slot?: number;
    error?: string;
  }[]> {
    console.log(`[EscrowProgramService] Checking inflight status of ${bundleIds.length} bundle(s)...`);

    try {
      const response = await fetch(EscrowProgramService.JITO_BUNDLE_ENDPOINT_MAINNET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getInflightBundleStatuses',
          params: bundleIds.map(id => [id]),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[EscrowProgramService] Inflight status HTTP error: ${response.status}`, errorText);
        if (response.status === 429) {
          return bundleIds.map(id => ({ bundleId: id, status: 'Pending' as const, error: 'HTTP 429 rate limited' }));
        }
        return bundleIds.map(id => ({ bundleId: id, status: 'Invalid' as const, error: `HTTP ${response.status}` }));
      }

      const result = await response.json() as {
        result?: { value?: Array<{ bundle_id: string; status: string; slot?: number }> } | Array<{ bundle_id: string; status: string; slot?: number }>;
        error?: { message?: string; code?: number };
      };

      if (result.error) {
        console.error('[EscrowProgramService] Inflight status RPC error:', result.error);
        // Some endpoints do not support this method; mark unsupported so callers can fall back.
        const msg = (result.error.message || '').toLowerCase();
        if (result.error.code === -32601 || msg.includes('method not found') || msg.includes('invalid method')) {
          this.inflightBundleStatusesSupported = false;
          return bundleIds.map(id => ({
            bundleId: id,
            status: 'Invalid' as const,
            error: 'Inflight bundle status unsupported (method not found)',
          }));
        }
        // Treat rate limits as no-signal
        if (result.error.code === -32097 || result.error.message?.toLowerCase().includes('rate')) {
          return bundleIds.map(id => ({ bundleId: id, status: 'Pending' as const, error: result.error?.message || 'Rate limited' }));
        }
        return bundleIds.map(id => ({ bundleId: id, status: 'Invalid' as const, error: result.error?.message }));
      }

      // If we got a successful response, mark as supported.
      this.inflightBundleStatusesSupported = true;
      const statuses = Array.isArray(result.result)
        ? result.result
        : result.result?.value || [];

      return bundleIds.map(bundleId => {
        const bundleStatus = statuses.find((s: any) => s.bundle_id === bundleId);
        if (!bundleStatus) {
          return { bundleId, status: 'Pending' as const, error: 'Bundle not found' };
        }

        let status: 'Invalid' | 'Pending' | 'Failed' | 'Landed';
        switch (bundleStatus.status) {
          case 'Landed':
          case 'landed':
            status = 'Landed';
            break;
          case 'Pending':
          case 'pending':
            status = 'Pending';
            break;
          case 'Failed':
          case 'failed':
            status = 'Failed';
            break;
          default:
            status = 'Invalid';
        }

        return { bundleId, status, slot: bundleStatus.slot };
      });
    } catch (error) {
      console.error('[EscrowProgramService] Inflight status check error:', error);
      return bundleIds.map(id => ({
        bundleId: id,
        status: 'Pending' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  /**
   * Wait for bundle confirmation with polling
   * 
   * @param bundleId - Bundle ID to track
   * @param timeoutSeconds - Timeout in seconds (default: 30)
   * @returns Confirmation result
   */
  async waitForBundleConfirmation(
    bundleId: string,
    timeoutSeconds: number = EscrowProgramService.BUNDLE_CONFIRMATION_TIMEOUT_SECONDS,
    txSignatures?: string[]
  ): Promise<{
    confirmed: boolean;
    status: 'Landed' | 'Failed' | 'Pending' | 'Timeout';
    slot?: number;
    error?: string;
  }> {
    console.log(`[EscrowProgramService] Waiting for bundle ${bundleId} confirmation...`);
    
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    let pollCount = 0;

    // Delay briefly before first poll to avoid immediate "not found" and reduce rate limits.
    const initialDelayMs = 2000 + Math.floor(Math.random() * 1000); // 2–3s
    await new Promise(resolve => setTimeout(resolve, initialDelayMs));
    
    while (Date.now() - startTime < timeoutMs) {
      pollCount++;
      
      const elapsed = (Date.now() - startTime) / 1000;

      // Backoff + jitter to avoid global 429s. Cap at ~20s.
      const baseIntervalMs = Math.min(20000, Math.round(3000 * Math.pow(1.6, pollCount - 1))); // 3s, 4.8s, 7.7s, ...
      const jitter = 0.8 + Math.random() * 0.4; // ±20%
      const pollInterval = Math.round(baseIntervalMs * jitter);

      // Prefer inflight status right after submission; fall back to getBundleStatuses when inflight is unsupported.
      let statusResult: { bundleId: string; status: 'Invalid' | 'Pending' | 'Failed' | 'Landed'; slot?: number; error?: string } | undefined;

      if (this.inflightBundleStatusesSupported !== false) {
        const [s] = await this.getInflightBundleStatuses([bundleId]);

        // If inflight method is unsupported, fall back to getBundleStatuses.
        const inflightUnsupported =
          s.status === 'Invalid' && String(s.error || '').toLowerCase().includes('unsupported');

        if (!inflightUnsupported) {
          statusResult = s;
        }
      }

      if (!statusResult) {
        const [s] = await this.getBundleStatuses([bundleId]);
        statusResult = s;
      }
      
      console.log(`[EscrowProgramService] Bundle poll #${pollCount}: ${statusResult.status} (${elapsed.toFixed(1)}s elapsed)`);
      
      if (statusResult.status === 'Landed') {
        console.log(`[EscrowProgramService] ✅ Bundle ${bundleId} landed in slot ${statusResult.slot}`);
        return {
          confirmed: true,
          status: 'Landed',
          slot: statusResult.slot,
        };
      }
      
      if (statusResult.status === 'Failed') {
        console.error(`[EscrowProgramService] ❌ Bundle ${bundleId} failed: ${statusResult.error}`);
        return {
          confirmed: false,
          status: 'Failed',
          error: statusResult.error || 'Bundle execution failed',
        };
      }
      
      if (statusResult.status === 'Invalid') {
        // Invalid is often "bundle not found yet" or "not in inflight window" — not a definitive failure.
        console.warn(`[EscrowProgramService] Bundle ${bundleId} status invalid: ${statusResult.error}`);
      }

      // Fallback confirmation: check on-chain signatures if provided.
      // This protects against status plumbing lag and rate limits.
      if (txSignatures && txSignatures.length > 0 && pollCount % 2 === 0) {
        try {
          const sigStatuses = await this.provider.connection.getSignatureStatuses(txSignatures);
          const values = sigStatuses?.value || [];

          // If any signature has an explicit error, consider the bundle failed.
          const anyErr = values.some(v => v?.err);
          if (anyErr) {
            return {
              confirmed: false,
              status: 'Failed',
              error: 'One or more transactions in the bundle failed on-chain (signature status error)',
            };
          }

          // Consider landed once we see at least one signature confirmed/finalized.
          const anyConfirmed = values.some(v => v && (v.confirmationStatus === 'confirmed' || v.confirmationStatus === 'finalized'));
          if (anyConfirmed) {
            console.log(`[EscrowProgramService] ✅ Bundle ${bundleId} confirmed via on-chain signature status`);
            return { confirmed: true, status: 'Landed' };
          }
        } catch (sigErr) {
          // Ignore; signature status is best-effort
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    // Timeout
    console.warn(`[EscrowProgramService] Bundle ${bundleId} confirmation timeout after ${timeoutSeconds}s`);
    return {
      confirmed: false,
      status: 'Timeout',
      error: `Bundle confirmation timeout after ${timeoutSeconds} seconds`,
    };
  }

  /**
   * Submit transactions individually (for devnet or fallback)
   * 
   * CRITICAL LEARNING from legacy stuck-agreement-monitor:
   * - Must process SEQUENTIALLY with await (not fire-and-forget)
   * - Add delay between transactions to prevent rate limiting
   * - Previously parallel processing overwhelmed Jito's 1 tx/second limit
   */
  private async submitTransactionsIndividually(serializedTransactions: string[]): Promise<{
    success: boolean;
    bundleId?: string;
    signatures?: string[];
    error?: string;
  }> {
    console.log(`[EscrowProgramService] Submitting ${serializedTransactions.length} transactions individually...`);
    
    const signatures: string[] = [];
    
    for (let i = 0; i < serializedTransactions.length; i++) {
      try {
        const txBuffer = Buffer.from(serializedTransactions[i], 'base64');
        
        const signature = await this.provider.connection.sendRawTransaction(txBuffer, {
          skipPreflight: false, // Devnet: use preflight for better error messages
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
        
        console.log(`[EscrowProgramService] Transaction ${i + 1}/${serializedTransactions.length} sent: ${signature}`);
        signatures.push(signature);
        
        // Wait for confirmation before sending next
        const confirmation = await this.provider.connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
          console.error(`[EscrowProgramService] Transaction ${i + 1} failed:`, confirmation.value.err);
          return {
            success: false,
            signatures,
            error: `Transaction ${i + 1} failed: ${JSON.stringify(confirmation.value.err)}`,
          };
        }
        
        console.log(`[EscrowProgramService] ✅ Transaction ${i + 1}/${serializedTransactions.length} confirmed`);
        
        // CRITICAL: Add delay between transactions to prevent rate limiting
        // Learned from stuck-agreement-monitor: 3s delay prevents overwhelming Jito
        if (i < serializedTransactions.length - 1) {
          console.log(`[EscrowProgramService] Waiting ${EscrowProgramService.BUNDLE_SEQUENTIAL_DELAY_MS}ms before next transaction...`);
          await new Promise(resolve => setTimeout(resolve, EscrowProgramService.BUNDLE_SEQUENTIAL_DELAY_MS));
        }
        
      } catch (error) {
        console.error(`[EscrowProgramService] Transaction ${i + 1} error:`, error);
        return {
          success: false,
          signatures,
          error: `Transaction ${i + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    }
    
    return {
      success: true,
      signatures,
    };
  }

  /**
   * Get official Jito tip accounts
   * 
   * IMPORTANT: From legacy JITO_TROUBLESHOOTING.md:
   * - These are the 8 official Jito tip accounts
   * - Tips MUST be the LAST instruction in each transaction
   * - Using verified addresses from Jito documentation
   */
  getJitoTipAccounts(): string[] {
    return [
      'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
      'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
      'HFqU5x63VTqvQss8hp11i4bVmkdzGHnsRRskfJ2J4ybE',
      '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
      '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
      'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
      'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
      'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    ];
  }

  /**
   * Get a random Jito tip account for load balancing
   */
  getRandomJitoTipAccount(): string {
    const accounts = this.getJitoTipAccounts();
    return accounts[Math.floor(Math.random() * accounts.length)];
  }

  // ==================== END JITO BUNDLE SUBMISSION ====================

  /**
   * Derive escrow PDA from escrow ID
   */
  private deriveEscrowPDA(escrowId: BN): [PublicKey, number] {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), escrowId.toArrayLike(Buffer, 'le', 8)],
      this.program.programId
    );
    return [pda, bump];
  }

  /**
   * Get escrow ID from PDA
   * For now, we'll extract it from the on-chain account
   */
  private async getEscrowIdFromPDA(escrowPda: PublicKey): Promise<BN> {
    try {
      const escrowAccount = await this.program.account.escrowState.fetch(escrowPda);
      return escrowAccount.escrowId;
    } catch (error) {
      throw new Error(
        `Failed to fetch escrow account: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Ensure token account exists, create if it doesn't
   * This is used for both USDC and NFT token accounts
   * Admin wallet pays the rent-exemption (~0.002 SOL per account)
   *
   * @param mint - The token mint (USDC or NFT)
   * @param owner - The owner of the token account
   * @param tokenType - Description for logging (e.g., "USDC", "NFT")
   * @returns The token account address
   */
  private async ensureTokenAccountExists(
    mint: PublicKey,
    owner: PublicKey,
    tokenType: string = 'Token'
  ): Promise<PublicKey> {
    const tokenAccount = await getAssociatedTokenAddress(mint, owner);

    const accountInfo = await this.provider.connection.getAccountInfo(tokenAccount);

    if (!accountInfo) {
      console.log(
        `[EscrowProgramService] ${tokenType} account does not exist for ${owner.toBase58()}, creating...`
      );
      console.log(`[EscrowProgramService] Token Account: ${tokenAccount.toBase58()}`);
      console.log(`[EscrowProgramService] Mint: ${mint.toBase58()}`);

      const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      const createAtaIx = createAssociatedTokenAccountInstruction(
        this.adminKeypair.publicKey, // payer (admin pays rent)
        tokenAccount, // ata address
        owner, // owner
        mint // mint
      );

      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const createAtaTx = new Transaction();
      
      // Detect network and add appropriate instructions
      const isMainnet = isMainnetNetwork(this.provider.connection);
      
      if (isMainnet) {
        // Add Jito tip for mainnet
        const JITO_TIP_AMOUNT = 10_000; // 0.00001 SOL tip
        const JITO_TIP_ACCOUNTS = [
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL', // Jito tip account 4
        ];
        
        console.log(`[EscrowProgramService] Adding Jito tip: ${JITO_TIP_AMOUNT} lamports`);
        
        // Add compute budget instructions
        createAtaTx.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })
        );
        
        // Add main instruction
        createAtaTx.add(createAtaIx);
        
        // Add Jito tip as system transfer
        const { SystemProgram } = await import('@solana/web3.js');
        const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[0]);
        createAtaTx.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: tipAccount,
            lamports: JITO_TIP_AMOUNT,
          })
        );
      } else {
        // Devnet: just add the main instruction
        createAtaTx.add(createAtaIx);
      }

      // Get recent blockhash and set fee payer
      const { blockhash, lastValidBlockHeight } = await this.provider.connection.getLatestBlockhash('finalized');
      createAtaTx.recentBlockhash = blockhash;
      createAtaTx.lastValidBlockHeight = lastValidBlockHeight;
      createAtaTx.feePayer = this.adminKeypair.publicKey;

      // Sign transaction
      createAtaTx.sign(this.adminKeypair);

      let signature: string;
      
      // Send transaction via Jito Block Engine (FREE, direct to Jito)
      // This bypasses QuickNode's $89/m Lil' JIT add-on requirement
      signature = await this.sendTransactionViaJito(createAtaTx, isMainnet);

      console.log(`[EscrowProgramService] ${tokenType} account creation transaction sent: ${signature}`);
      console.log(`[EscrowProgramService] Waiting for confirmation to avoid race condition...`);
      
      // CRITICAL: Wait for transaction confirmation before continuing
      // This prevents race conditions where the account isn't yet initialized when used
      try {
        const confirmationStrategy = {
          signature,
          blockhash: createAtaTx.recentBlockhash!,
          lastValidBlockHeight: createAtaTx.lastValidBlockHeight!,
        };
        
        const confirmation = await this.provider.connection.confirmTransaction(
          confirmationStrategy,
          'confirmed' // Wait for 'confirmed' commitment level
        );
        
        if (confirmation.value.err) {
          throw new Error(`ATA creation confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log(`[EscrowProgramService] ✅ ${tokenType} account created and confirmed on-chain`);
        console.log(`[EscrowProgramService] Transaction: ${signature}`);
        console.log(`[EscrowProgramService] Cost: ~0.002 SOL (rent-exemption, one-time per user)${isMainnet ? ' + Jito tip' : ''}`);
      } catch (confirmError) {
        console.error(`[EscrowProgramService] Failed to confirm ${tokenType} account creation:`, confirmError);
        // Still log the transaction details for debugging
        console.log(`[EscrowProgramService] Transaction sent but confirmation failed: ${signature}`);
        throw new Error(
          `Failed to confirm ${tokenType} account creation: ${
            confirmError instanceof Error ? confirmError.message : 'Unknown error'
          }`
        );
      }
    } else {
      console.log(
        `[EscrowProgramService] ${tokenType} account already exists: ${tokenAccount.toBase58()}`
      );
    }

    return tokenAccount;
  }


  /**
   * Deposit NFT into escrow
   * Called by the seller to deposit their NFT into the escrow PDA
   */
  async depositNft(escrowPda: PublicKey, seller: PublicKey, nftMint: PublicKey): Promise<string> {
    try {
      console.log('[EscrowProgramService] Depositing NFT into escrow:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
      });

      // Get escrow ID from PDA
      const escrowId = await this.getEscrowIdFromPDA(escrowPda);

      // Derive seller's NFT account
      const sellerNftAccount = await getAssociatedTokenAddress(nftMint, seller);

      // Derive escrow's NFT account
      const escrowNftAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPda,
        true // allowOwnerOffCurve for PDAs
      );

      console.log('[EscrowProgramService] NFT accounts:', {
        sellerNftAccount: sellerNftAccount.toString(),
        escrowNftAccount: escrowNftAccount.toString(),
      });

      // Build deposit_nft instruction
      const instruction = await this.program.methods
        .depositNft()
        .accountsStrict({
          escrowState: escrowPda,
          seller: seller,
          sellerNftAccount,
          escrowNftAccount,
          nftMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // FIX: Manually set seller as NON-signer (same Anchor bug workaround)
      instruction.keys.forEach((key) => {
        if (key.pubkey.equals(seller)) {
          console.log(
            `[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`
          );
          key.isSigner = false;
        }
      });

      // Create and sign transaction with compute budget
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      // Determine priority fee based on network
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Fetch dynamic priority fee from QuickNode API (with caching and fallback)
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      // Add compute budget instructions (REQUIRED for mainnet)
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      // Add the instruction
      transaction.add(instruction);

      // Add Jito tip transfer for mainnet (REQUIRED for Jito-enabled RPCs like QuickNode)
      // IMPORTANT: Jito tip MUST be the LAST instruction in the transaction
      if (isMainnet) {
        const JITO_TIP_ACCOUNTS = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];
        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        const tipAmount = 1_000_000;
        console.log(
          `[EscrowProgramService] Adding Jito tip: ${tipAmount} lamports to ${jitoTipAccount.toString()}`
        );
        // Add tip transfer instruction as LAST instruction
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: tipAmount,
          })
        );
      }

      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      transaction.sign(this.adminKeypair);

      // Send transaction via Jito Block Engine (FREE, direct to Jito)
      // This bypasses QuickNode's $89/m Lil' JIT add-on requirement
      const txId = await this.sendTransactionViaJito(transaction, isMainnet);

      console.log('[EscrowProgramService] NFT deposited, tx:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to deposit NFT:', error);
      throw new Error(
        `Failed to deposit NFT: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Deposit USDC into escrow (LEGACY - DEPRECATED)
   * @deprecated This method uses USDC instructions that are feature-flagged out.
   * Use depositSol() for SOL-based swaps instead.
   * Called by the buyer to deposit USDC into the escrow PDA
   */
  async depositUsdc(escrowPda: PublicKey, buyer: PublicKey, usdcMint: PublicKey): Promise<string> {
    try {
      console.log('[EscrowProgramService] Depositing USDC into escrow:', {
        escrowPda: escrowPda.toString(),
        buyer: buyer.toString(),
        usdcMint: usdcMint.toString(),
      });

      // Get escrow ID from PDA
      const escrowId = await this.getEscrowIdFromPDA(escrowPda);

      // Ensure buyer's USDC account exists (create if needed)
      const buyerUsdcAccount = await this.ensureTokenAccountExists(usdcMint, buyer, 'Buyer USDC');

      // Derive escrow's USDC account
      const escrowUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        escrowPda,
        true // allowOwnerOffCurve for PDAs
      );

      console.log('[EscrowProgramService] USDC accounts:', {
        buyerUsdcAccount: buyerUsdcAccount.toString(),
        escrowUsdcAccount: escrowUsdcAccount.toString(),
      });

      // Build deposit_usdc instruction
      // @ts-ignore - Legacy USDC method (feature-flagged out)
      const instruction = await (this.program.methods as any)
        .depositUsdc()
        .accountsStrict({
          escrowState: escrowPda,
          buyer: buyer,
          buyerUsdcAccount,
          escrowUsdcAccount,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // FIX: Manually set buyer as NON-signer (same Anchor bug workaround)
      instruction.keys.forEach((key: any) => {
        if (key.pubkey.equals(buyer)) {
          console.log(
            `[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`
          );
          key.isSigner = false;
        }
      });

      // Create and sign transaction with compute budget
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      // Determine priority fee based on network
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Fetch dynamic priority fee from QuickNode API (with caching and fallback)
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      // Add compute budget instructions (REQUIRED for mainnet)
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      // Add the instruction
      transaction.add(instruction);

      // Add Jito tip transfer for mainnet (REQUIRED for Jito-enabled RPCs like QuickNode)
      // IMPORTANT: Jito tip MUST be the LAST instruction in the transaction
      if (isMainnet) {
        const JITO_TIP_ACCOUNTS = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];
        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        const tipAmount = 1_000_000;
        console.log(
          `[EscrowProgramService] Adding Jito tip: ${tipAmount} lamports to ${jitoTipAccount.toString()}`
        );
        // Add tip transfer instruction as LAST instruction
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: tipAmount,
          })
        );
      }

      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      transaction.sign(this.adminKeypair);

      // Send transaction via Jito Block Engine (FREE, direct to Jito)
      // This bypasses QuickNode's $89/m Lil' JIT add-on requirement
      const txId = await this.sendTransactionViaJito(transaction, isMainnet);

      console.log('[EscrowProgramService] USDC deposited, tx:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to deposit USDC:', error);
      throw new Error(
        `Failed to deposit USDC: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Build unsigned deposit NFT transaction for client-side signing
   * PRODUCTION APPROACH: Returns transaction that client must sign
   */
  async buildDepositNftTransaction(
    escrowPda: PublicKey,
    seller: PublicKey,
    nftMint: PublicKey
  ): Promise<{ transaction: string; message: string }> {
    try {
      console.log('[EscrowProgramService] Building unsigned deposit NFT transaction:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
      });

      // Derive seller's NFT account
      const sellerNftAccount = await getAssociatedTokenAddress(nftMint, seller);

      // Derive escrow's NFT account
      const escrowNftAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPda,
        true // allowOwnerOffCurve for PDAs
      );

      console.log('[EscrowProgramService] NFT accounts:', {
        sellerNftAccount: sellerNftAccount.toString(),
        escrowNftAccount: escrowNftAccount.toString(),
      });

      // Build deposit_nft instruction
      const instruction = await this.program.methods
        .depositNft()
        .accountsStrict({
          escrowState: escrowPda,
          seller: seller,
          sellerNftAccount,
          escrowNftAccount,
          nftMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // FIX: Manually set seller as NON-signer (Anchor SDK bug workaround)
      instruction.keys.forEach((key) => {
        if (key.pubkey.equals(seller)) {
          console.log(
            `[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`
          );
          key.isSigner = false;
        }
      });

      // Detect network for priority fees and Jito tips
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Get dynamic priority fee
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      console.log(
        `[EscrowProgramService] Using priority fee: ${priorityFee} microlamports per CU (${
          isMainnet ? 'mainnet' : 'devnet'
        })`
      );

      // Create unsigned transaction with priority fees
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      // Add compute budget instructions FIRST
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 300_000,
        })
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
        })
      );

      // Add main escrow instruction
      transaction.add(instruction);

      // NOTE: Do NOT add Jito tips to prepared transactions (client-side signing)
      // Jito tips are only for server-side signed transactions via Jito Block Engine
      // Client wallets will send via regular RPC and don't need Jito infrastructure

      // Set fee payer to seller (who will sign)
      transaction.feePayer = seller;

      // Get recent blockhash
      const { blockhash } = await this.provider.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Serialize transaction to base64 (unsigned)
      const serialized = transaction.serialize({
        requireAllSignatures: false, // Don't require signatures yet
        verifySignatures: false,
      });
      const base64Transaction = serialized.toString('base64');

      console.log('[EscrowProgramService] Unsigned NFT deposit transaction built');

      return {
        transaction: base64Transaction,
        message: 'Transaction ready for client signing. Seller must sign and submit.',
      };
    } catch (error) {
      console.error('[EscrowProgramService] Failed to build deposit NFT transaction:', error);
      throw new Error(
        `Failed to build deposit NFT transaction: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Build unsigned deposit SELLER NFT transaction (client-side signing)
   * Uses deposit_seller_nft instruction for EscrowState
   * PRODUCTION APPROACH: Returns transaction that client must sign
   */
  async buildDepositSellerNftTransaction(
    escrowPda: PublicKey,
    seller: PublicKey,
    nftMint: PublicKey
  ): Promise<{ transaction: string; message: string }> {
    try {
      console.log('[EscrowProgramService] Building unsigned deposit seller NFT transaction:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
      });

      // Derive token accounts
      const sellerTokenAccount = await getAssociatedTokenAddress(
        nftMint,
        seller,
        false,
        TOKEN_PROGRAM_ID
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPda,
        true, // allowOwnerOffCurve for PDAs
        TOKEN_PROGRAM_ID
      );

      console.log('[EscrowProgramService] NFT accounts:', {
        sellerTokenAccount: sellerTokenAccount.toString(),
        escrowTokenAccount: escrowTokenAccount.toString(),
      });

      // Build deposit_seller_nft instruction
      const instruction = await (this.program.methods as any)
        .depositSellerNft()
        .accountsStrict({
          escrowState: escrowPda,
          seller,
          sellerNftAccount: sellerTokenAccount,
          escrowNftAccount: escrowTokenAccount,
          nftMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // FIX: Manually set seller as NON-signer (Anchor SDK bug workaround)
      instruction.keys.forEach((key: any) => {
        if (key.pubkey.equals(seller)) {
          console.log(
            `[EscrowProgramService] Setting ${key.pubkey.toString()} isSigner to false`
          );
          key.isSigner = false;
        }
      });

      // Detect network for priority fees and Jito tips
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Get dynamic priority fee
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      console.log(
        `[EscrowProgramService] Using priority fee: ${priorityFee} microlamports per CU (${
          isMainnet ? 'mainnet' : 'devnet'
        })`
      );

      // Create unsigned transaction with priority fees
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      // Add compute budget instructions FIRST
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 250_000,
        })
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
        })
      );

      // Add main escrow instruction
      transaction.add(instruction);

      // NOTE: Do NOT add Jito tips to prepared transactions (client-side signing)
      // Jito tips are only for server-side signed transactions via Jito Block Engine
      // Client wallets will send via regular RPC and don't need Jito infrastructure

      // Set fee payer to seller (who will sign)
      transaction.feePayer = seller;

      // Get recent blockhash
      const { blockhash } = await this.provider.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Serialize transaction to base64 (unsigned)
      const serialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const base64Transaction = serialized.toString('base64');

      console.log('[EscrowProgramService] Unsigned seller NFT deposit transaction built');

      return {
        transaction: base64Transaction,
        message: 'Transaction ready for client signing. Seller must sign and submit.',
      };
    } catch (error) {
      console.error('[EscrowProgramService] Failed to build deposit seller NFT transaction:', error);
      throw new Error(
        `Failed to build deposit seller NFT transaction: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Build unsigned deposit USDC transaction for client-side signing
   * PRODUCTION APPROACH: Returns transaction that client must sign
   */
  async buildDepositUsdcTransaction(
    escrowPda: PublicKey,
    buyer: PublicKey,
    usdcMint: PublicKey
  ): Promise<{ transaction: string; message: string }> {
    try {
      console.log('[EscrowProgramService] Building unsigned deposit USDC transaction:', {
        escrowPda: escrowPda.toString(),
        buyer: buyer.toString(),
        usdcMint: usdcMint.toString(),
      });

      // Ensure buyer's USDC account exists (create if needed)
      const buyerUsdcAccount = await this.ensureTokenAccountExists(usdcMint, buyer, 'Buyer USDC');

      // Derive escrow's USDC account
      const escrowUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        escrowPda,
        true // allowOwnerOffCurve for PDAs
      );

      console.log('[EscrowProgramService] USDC accounts:', {
        buyerUsdcAccount: buyerUsdcAccount.toString(),
        escrowUsdcAccount: escrowUsdcAccount.toString(),
      });

      // Build deposit_usdc instruction
      // @ts-ignore - Legacy USDC method (feature-flagged out)
      const instruction = await (this.program.methods as any)
        .depositUsdc()
        .accountsStrict({
          escrowState: escrowPda,
          buyer: buyer,
          buyerUsdcAccount,
          escrowUsdcAccount,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // FIX: Manually set buyer as NON-signer (Anchor SDK bug workaround)
      instruction.keys.forEach((key: any) => {
        if (key.pubkey.equals(buyer)) {
          console.log(
            `[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`
          );
          key.isSigner = false;
        }
      });

      // Detect network for priority fees and Jito tips
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Get dynamic priority fee
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      console.log(
        `[EscrowProgramService] Using priority fee: ${priorityFee} microlamports per CU (${
          isMainnet ? 'mainnet' : 'devnet'
        })`
      );

      // Create unsigned transaction with priority fees
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      // Add compute budget instructions FIRST
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 300_000,
        })
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
        })
      );

      // Add main escrow instruction
      transaction.add(instruction);

      // NOTE: Do NOT add Jito tips to prepared transactions (client-side signing)
      // Jito tips are only for server-side signed transactions via Jito Block Engine
      // Client wallets will send via regular RPC and don't need Jito infrastructure

      // Set fee payer to buyer (who will sign)
      transaction.feePayer = buyer;

      // Get recent blockhash
      const { blockhash } = await this.provider.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Serialize transaction to base64 (unsigned)
      const serialized = transaction.serialize({
        requireAllSignatures: false, // Don't require signatures yet
        verifySignatures: false,
      });
      const base64Transaction = serialized.toString('base64');

      console.log('[EscrowProgramService] Unsigned USDC deposit transaction built');

      return {
        transaction: base64Transaction,
        message: 'Transaction ready for client signing. Buyer must sign and submit.',
      };
    } catch (error) {
      console.error('[EscrowProgramService] Failed to build deposit USDC transaction:', error);
      throw new Error(
        `Failed to build deposit USDC transaction: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Settle escrow - transfer NFT and SOL with platform fees
   * For SOL-based swap types (NFT_FOR_SOL, NFT_FOR_NFT_WITH_FEE, NFT_FOR_NFT_PLUS_SOL)
   */
  async settle(
    escrowPda: PublicKey,
    seller: PublicKey,
    buyer: PublicKey,
    nftMint: PublicKey,
    feeCollector: PublicKey,
    escrowId?: BN, // Optional for backward compatibility, will fetch from chain if not provided
    nftBMint?: PublicKey // Optional: Required for NFT_FOR_NFT swaps (buyer's NFT)
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Settling escrow:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        buyer: buyer.toString(),
        nftMint: nftMint.toString(),
        feeCollector: feeCollector.toString(),
        note: 'SOL and fees handled on-chain via sol_vault PDA',
      });

      // Get escrowId - either from parameter or fetch from on-chain state
      let escrowIdBN: BN;
      if (escrowId) {
        escrowIdBN = escrowId;
      } else {
        // Fetch escrow state to get escrowId
        const escrowState = await this.program.account.escrowState.fetch(escrowPda);
        escrowIdBN = escrowState.escrowId;
      }
      
      // Derive SOL vault PDA
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), escrowIdBN.toArrayLike(Buffer, 'le', 8)],
        this.programId
      );
      console.log('[EscrowProgramService] SOL vault PDA:', solVaultPda.toString());

      // Derive escrow NFT account (seller's NFT held in escrow)
      const escrowNftAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPda,
        true // allowOwnerOffCurve - for PDAs
      );

      // Ensure buyer's NFT account exists (for receiving NFT)
      const buyerNftAccount = await this.ensureTokenAccountExists(nftMint, buyer, 'Buyer NFT');

      console.log('[EscrowProgramService] Token accounts:', {
        escrowNftAccount: escrowNftAccount.toString(),
        buyerNftAccount: buyerNftAccount.toString(),
      });

      // Detect network
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Build settle transaction
      // CRITICAL: Use .accounts() instead of .accountsStrict() to ensure proper writable metadata
      // .accountsStrict() was NOT applying IDL's writable:true flags, causing ConstraintMut error
      // Anchor SDK will automatically apply writable flags from IDL when using .accounts()
      // Note: settle is permissionless - anyone can trigger settlement
      const instructionBuilder = (this.program.methods as any)
        .settle()
        .accounts({
          caller: this.adminKeypair.publicKey, // Permissionless - admin can trigger
          escrowState: escrowPda,
          solVault: solVaultPda, // NEW: Separate vault PDA holding SOL
          seller,
          platformFeeCollector: feeCollector, // Must be writable to receive platform fee
          escrowNftAccount,
          buyerNftAccount,
          buyer,
          nftMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        });

      // Add remaining accounts for NFT B (buyer's NFT in NFT_FOR_NFT swaps)
      if (nftBMint) {
        console.log('[EscrowProgramService] Adding NFT B accounts for settlement:', nftBMint.toString());
        
        const escrowNftBAccount = await getAssociatedTokenAddress(
          nftBMint,
          escrowPda,
          true,
          TOKEN_PROGRAM_ID
        );

        const sellerNftBAccount = await getAssociatedTokenAddress(
          nftBMint,
          seller,
          false,
          TOKEN_PROGRAM_ID
        );

        console.log('[EscrowProgramService] NFT B Token accounts:', {
          escrowNftBAccount: escrowNftBAccount.toString(),
          sellerNftBAccount: sellerNftBAccount.toString(),
        });

        // Add remaining accounts - ORDER MATTERS! Must match smart contract expectations
        // Same order as cancelIfExpired and adminCancel
        instructionBuilder.remainingAccounts([
          { pubkey: nftBMint, isSigner: false, isWritable: false },          // 1. NFT B mint
          { pubkey: escrowNftBAccount, isSigner: false, isWritable: true },  // 2. Source: Escrow's NFT B account
          { pubkey: sellerNftBAccount, isSigner: false, isWritable: true },  // 3. Destination: Seller's NFT B account
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },  // 4. Token program
        ]);
      }

      const transaction = await instructionBuilder.transaction();

      // Add Jito tip for mainnet
      if (isMainnet) {
        const jitoTipAccounts = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];
        const jitoTipAccount = new PublicKey(
          jitoTipAccounts[Math.floor(Math.random() * jitoTipAccounts.length)]
        );
        const tipAmount = 1_000_000; // 0.001 SOL
        
        console.log(
          `[EscrowProgramService] Adding Jito tip: ${tipAmount} lamports to ${jitoTipAccount.toString()}`
        );
        
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: tipAmount,
          })
        );
      }

      // Set transaction properties
      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      
      // Sign transaction
      transaction.sign(this.adminKeypair);

      console.log('[EscrowProgramService] Settlement transaction signed, sending to network...');

      // Send via Jito for mainnet, regular RPC for devnet
      const txId = await this.sendTransactionViaJito(transaction, isMainnet);

      console.log('[EscrowProgramService] Settlement transaction complete:', txId);

      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Settlement failed:', error);
      throw new Error(
        `Failed to settle escrow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
  /**
   * ========================================
   * SOL-BASED ESCROW SWAP METHODS
   * ========================================
   */

  /**
   * Initialize a new SOL-based escrow agreement
   * Supports three swap types:
   * - NFT_FOR_SOL: Direct NFT <> SOL exchange
   * - NFT_FOR_NFT_WITH_FEE: NFT <> NFT with buyer paying separate SOL fee
   * - NFT_FOR_NFT_PLUS_SOL: NFT <> NFT with buyer providing SOL (fee extracted from it)
   */
  async initAgreement(params: {
    escrowId: BN;
    buyer: PublicKey;
    seller: PublicKey;
    nftMint: PublicKey;
    swapType: 'NFT_FOR_SOL' | 'NFT_FOR_NFT_WITH_FEE' | 'NFT_FOR_NFT_PLUS_SOL';
    solAmount?: BN; // Required for NFT_FOR_SOL and NFT_FOR_NFT_PLUS_SOL
    nftBMint?: PublicKey; // Required for NFT_FOR_NFT_WITH_FEE and NFT_FOR_NFT_PLUS_SOL
    expiryTimestamp: BN;
    platformFeeBps: number;
    feePayer?: 'BUYER' | 'SELLER'; // Defaults to BUYER
  }): Promise<{ pda: PublicKey; txId: string }> {
    try {
      const {
        escrowId,
        buyer,
        seller,
        nftMint,
        swapType,
        solAmount,
        nftBMint,
        expiryTimestamp,
        platformFeeBps,
        feePayer = 'BUYER',
      } = params;

      console.log('[EscrowProgramService] Initializing escrow agreement:', {
        escrowId: escrowId.toString(),
        buyer: buyer.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
        swapType,
        solAmount: solAmount?.toString() || 'N/A',
        nftBMint: nftBMint?.toString() || 'N/A',
        expiryTimestamp: expiryTimestamp.toString(),
        platformFeeBps,
        feePayer,
      });

      // Validate parameters based on swap type
      if (
        (swapType === 'NFT_FOR_SOL' || swapType === 'NFT_FOR_NFT_PLUS_SOL') &&
        !solAmount
      ) {
        throw new Error(
          `solAmount is required for swap type ${swapType}`
        );
      }

      if (
        (swapType === 'NFT_FOR_NFT_WITH_FEE' || swapType === 'NFT_FOR_NFT_PLUS_SOL') &&
        !nftBMint
      ) {
        throw new Error(
          `nftBMint is required for swap type ${swapType}`
        );
      }

      // Derive escrow PDA
      const [escrowPda] = this.deriveEscrowPDA(escrowId);
      console.log('[EscrowProgramService] Escrow PDA:', escrowPda.toString());

      // Derive SOL vault PDA - separate zero-data account for holding SOL
      // This mirrors the USDC design where tokens are held in a separate account
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), escrowId.toArrayLike(Buffer, 'le', 8)],
        this.programId
      );
      console.log('[EscrowProgramService] SOL vault PDA:', solVaultPda.toString());

      // Derive escrow NFT A account (seller's NFT held in escrow)
      // Created by admin during agreement initialization
      const escrowNftAAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPda,
        true // allowOwnerOffCurve for PDAs
      );
      console.log('[EscrowProgramService] Escrow NFT A account:', escrowNftAAccount.toString());

      // Derive escrow NFT B account (buyer's NFT held in escrow) - only for NFT<>NFT swaps
      let escrowNftBAccount: PublicKey | undefined;
      if (nftBMint) {
        escrowNftBAccount = await getAssociatedTokenAddress(
          nftBMint,
          escrowPda,
          true // allowOwnerOffCurve for PDAs
        );
        console.log('[EscrowProgramService] Escrow NFT B account:', escrowNftBAccount.toString());
      }

      // Map string swap type to Anchor enum format (PascalCase)
      // NFT_FOR_SOL -> NftForSol, BUYER -> Buyer
      const swapTypeMap: Record<string, string> = {
        'NFT_FOR_SOL': 'NftForSol',
        'NFT_FOR_NFT_WITH_FEE': 'NftForNftWithFee',
        'NFT_FOR_NFT_PLUS_SOL': 'NftForNftPlusSol',
      };
      const feePayerMap: Record<string, string> = {
        'BUYER': 'Buyer',
        'SELLER': 'Seller',
      };
      
      const swapTypeVariant = swapTypeMap[swapType];
      const feePayerVariant = feePayerMap[feePayer];
      
      if (!swapTypeVariant || !feePayerVariant) {
        throw new Error(`Invalid swap type or fee payer: ${swapType}, ${feePayer}`);
      }
      
      // Anchor expects enum as { variantName: {} }
      const swapTypeEnum = { [swapTypeVariant.charAt(0).toLowerCase() + swapTypeVariant.slice(1)]: {} };
      const feePayerEnum = { [feePayerVariant.charAt(0).toLowerCase() + feePayerVariant.slice(1)]: {} };

      // Build accounts object - NFT B accounts are optional
      // For NFT<>SOL swaps, we must use SystemProgram as placeholder to avoid creating duplicate ATAs
      // The Rust program checks nft_b_mint.is_some() - if we pass actual mint, it tries to create ATA
      // CRITICAL: escrow_nft_account has PDA definition in IDL with init_if_needed
      // We pass it explicitly - Anchor will validate it matches PDA derivation
      // escrow_nft_b_account must be a valid account address, even if unused for NFT<>SOL swaps
      // Build accounts object:
      // - escrowNftAccount: Has PDA definition in IDL → Pass explicitly (seed inference not enabled)
      // - escrowNftBAccount: No PDA definition → MUST be passed (UncheckedAccount in Rust)
      // 
      // For NFT_FOR_SOL swaps (no NFT B):
      // - nftBMint parameter: undefined (Rust sees None) ← Program checks this
      // - nftBMint account: SystemProgram.programId (placeholder, never used)
      // - escrowNftBAccount: SystemProgram.programId (placeholder, never used)
      // 
      // The Rust program ONLY uses these if nft_b_mint.is_some() (parameter is Some)
      // When parameter is None, accounts are ignored → safe to pass SystemProgram as placeholder
      const accounts: any = {
        escrowState: escrowPda,
        buyer,
        seller,
        solVault: solVaultPda,
        nftAMint: nftMint,
        escrowNftAccount: escrowNftAAccount,
        nftBMint: nftBMint || PublicKey.default, // Use PublicKey.default (zeros) for NFT_FOR_SOL
        escrowNftBAccount: escrowNftBAccount || PublicKey.default, // Use PublicKey.default (zeros) for NFT_FOR_SOL
        admin: this.adminKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      };
      
      // Validate that we have NFT B mint for NFT<>NFT swaps
      // Note: escrowNftBAccount is derived by Anchor, so we don't validate it here
      if (swapType !== 'NFT_FOR_SOL' && !nftBMint) {
        throw new Error(`nftBMint is required for swap type ${swapType}`);
      }

      console.log('[EscrowProgramService] ===== initAgreement Details =====');
      console.log('[EscrowProgramService] Parameters:', {
        escrowId: escrowId.toString(),
        swapType,
        swapTypeEnum: JSON.stringify(swapTypeEnum),
        solAmount: solAmount?.toString(),
        nftMint: nftMint.toString(),
        nftBMint: nftBMint?.toString() || 'null',
        expiryTimestamp: expiryTimestamp.toString(),
        platformFeeBps,
        feePayer,
        feePayerEnum: JSON.stringify(feePayerEnum),
      });
      console.log('[EscrowProgramService] Accounts:', {
        escrowState: escrowPda.toString(),
        buyer: buyer.toString(),
        seller: seller.toString(),
        solVault: solVaultPda.toString(),
        nftAMint: nftMint.toString(),
        escrowNftAccount: escrowNftAAccount.toString(),
        nftBMint: (nftBMint || PublicKey.default).toString(),
        escrowNftBAccount: (escrowNftBAccount || PublicKey.default).toString(),
        admin: this.adminKeypair.publicKey.toString(),
        hasNftB: !!nftBMint,
        isNftForSol: swapType === 'NFT_FOR_SOL',
        note: 'PublicKey.default (zeros) used as sentinel for NFT_FOR_SOL (Rust checks != Pubkey::default())',
      });
      console.log('[EscrowProgramService] =====================================');

      // Prepare instruction parameters with explicit logging
      // CRITICAL: nft_b_mint now requires a Pubkey (not Option<Pubkey>)
      // Use PublicKey.default (zeros) as sentinel value for "no NFT B"
      // Rust checks: has_nft_b = nft_b_mint != Pubkey::default()
      const initAgreementParams = [
        escrowId,
        swapTypeEnum,
        solAmount ?? null, // Option<u64> - null is OK for BN
        nftMint, // nft_a_mint parameter (seller's NFT)
        nftBMint || PublicKey.default, // Pubkey - use PublicKey.default (zeros) for NFT_FOR_SOL
        expiryTimestamp,
        platformFeeBps,
        feePayerEnum
      ];

      console.log('[EscrowProgramService] ===== Instruction Parameters (DETAILED) =====');
      console.log('[EscrowProgramService] [0] escrowId:', escrowId.toString(), typeof escrowId);
      console.log('[EscrowProgramService] [1] swapTypeEnum:', JSON.stringify(swapTypeEnum), typeof swapTypeEnum);
      console.log('[EscrowProgramService] [2] solAmount:', solAmount?.toString() || 'null', typeof (solAmount || null));
      console.log('[EscrowProgramService] [3] nftMint (nft_a_mint):', nftMint.toString(), typeof nftMint);
      console.log('[EscrowProgramService] [4] nftBMint (nft_b_mint):', 
        (nftBMint || PublicKey.default).toString(), 
        'hasRealNFT:', !!nftBMint,
        'usingSentinel (PublicKey.default):', !nftBMint);
      console.log('[EscrowProgramService] [5] expiryTimestamp:', expiryTimestamp.toString(), typeof expiryTimestamp);
      console.log('[EscrowProgramService] [6] platformFeeBps:', platformFeeBps, typeof platformFeeBps);
      console.log('[EscrowProgramService] [7] feePayerEnum:', JSON.stringify(feePayerEnum), typeof feePayerEnum);
      console.log('[EscrowProgramService] =====================================');

      // Build instruction
      // Note: Anchor converts snake_case (Rust) to camelCase (TypeScript)
      // escrow_nft_account has PDA definition in IDL with init_if_needed
      // Use .accounts() instead of .accountsStrict() to allow Anchor to handle PDA derivation
      // Anchor will automatically derive escrow_nft_account PDA based on escrow_state and nft_a_mint
      let instruction;
      try {
        instruction = await (this.program.methods as any)
          .initAgreement(...initAgreementParams)
          .accounts(accounts)
          .instruction();
      } catch (instructionError: any) {
        console.error('[EscrowProgramService] Failed to build instruction:', instructionError);
        console.error('[EscrowProgramService] Error details:', {
          message: instructionError?.message,
          stack: instructionError?.stack,
          accounts: Object.keys(accounts),
        });
        throw new Error(
          `Failed to build initAgreement instruction: ${instructionError?.message || 'Unknown error'}`
        );
      }

      console.log('[EscrowProgramService] ✅ Instruction built successfully');
      console.log('[EscrowProgramService] Instruction keys count:', instruction.keys.length);
      console.log('[EscrowProgramService] Instruction data length:', instruction.data.length);

      // Fix: Set buyer and seller as NON-signers (Anchor bug workaround)
      instruction.keys.forEach((key: any) => {
        if (key.pubkey.equals(buyer) || key.pubkey.equals(seller)) {
          console.log('[EscrowProgramService] Setting non-signer:', key.pubkey.toString());
          key.isSigner = false;
        }
      });
      
      console.log('[EscrowProgramService] Final instruction keys:');
      instruction.keys.forEach((key: any, index: number) => {
        console.log(`  [${index}] ${key.pubkey.toString()} - signer:${key.isSigner}, writable:${key.isWritable}`);
      });

      // Create transaction with compute budget and instruction
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      // Determine priority fee based on network
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Fetch dynamic priority fee
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      console.log(
        `[EscrowProgramService] Using priority fee: ${priorityFee} microlamports per CU (${
          isMainnet ? 'mainnet' : 'devnet'
        })`
      );

      // Add compute budget instructions
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      // Add the escrow initialization instruction
      transaction.add(instruction);

      // Add Jito tip for mainnet
      if (isMainnet) {
        const JITO_TIP_ACCOUNTS = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];

        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        const tipAmount = 1_000_000; // 0.001 SOL

        console.log(
          `[EscrowProgramService] Adding Jito tip: ${tipAmount} lamports to ${jitoTipAccount.toString()}`
        );

        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: tipAmount,
          })
        );
      }

      // Sign with admin only
      transaction.feePayer = this.adminKeypair.publicKey;
      
      // Get recent blockhash with lastValidBlockHeight for expiration tracking
      // Use 'confirmed' commitment (not 'finalized') to maximize blockhash lifetime
      const { blockhash, lastValidBlockHeight } = await this.provider.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.sign(this.adminKeypair);

      console.log(
        '[EscrowProgramService] Transaction signed by admin, sending to network...'
      );

      // Send transaction via Jito Block Engine (returns immediately)
      const txId = await this.sendTransactionViaJito(transaction, isMainnet);

      console.log('[EscrowProgramService] Transaction sent, waiting for confirmation...');

      // Wait for confirmation using proper Jito polling
      // Mainnet: 60s timeout (handles network congestion), Devnet: 30s timeout
      const timeoutSeconds = isMainnet ? 60 : 30;
      const confirmResult = await this.waitForJitoConfirmation(
        txId,
        blockhash,
        lastValidBlockHeight,
        30, // max 30 polling attempts (~45 seconds with tiered intervals)
        timeoutSeconds // timeout before recommending fresh blockhash
      );

      if (!confirmResult.confirmed) {
        throw new Error(
          `Transaction confirmation failed: ${confirmResult.error || 'Unknown error'}`
        );
      }

      console.log('[EscrowProgramService] Escrow initialized:', {
        pda: escrowPda.toString(),
        txId: txId,
        swapType,
      });

      return { pda: escrowPda, txId: txId };
    } catch (error) {
      console.error('[EscrowProgramService] Failed to initialize agreement:', error);
      throw new Error(
        `Failed to initialize escrow agreement: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Deposit SOL into escrow
   * Used for NFT_FOR_SOL and NFT_FOR_NFT_PLUS_SOL swap types
   * Buyer deposits SOL which is held in the escrow PDA
   */
  async depositSol(
    escrowPda: PublicKey,
    buyer: PublicKey,
    solAmount: BN
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Depositing SOL:', {
        escrowPda: escrowPda.toString(),
        buyer: buyer.toString(),
        solAmount: solAmount.toString(),
      });

      // Fetch escrow state to get escrow ID for sol_vault derivation
      const escrowState = await this.program.account.escrowState.fetch(escrowPda);
      const escrowId = escrowState.escrowId;

      // Derive sol_vault PDA
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), escrowId.toArrayLike(Buffer, 'le', 8)],
        this.programId
      );

      console.log('[EscrowProgramService] Derived sol_vault PDA:', solVaultPda.toString());

      // Build instruction
      // Note: deposit_sol takes NO parameters - amount is read from escrow state
      const instruction = await (this.program.methods as any)
        .depositSol()
        .accountsStrict({
          buyer,
          escrowState: escrowPda,
          solVault: solVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create transaction
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      const isMainnet = isMainnetNetwork(this.provider.connection);
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      transaction.add(instruction);

      if (isMainnet) {
        const JITO_TIP_ACCOUNTS = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];

        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: 1_000_000,
          })
        );
      }

      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (
        await this.provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(this.adminKeypair);

      const txId = await this.sendTransactionViaJito(transaction, isMainnet);

      console.log('[EscrowProgramService] SOL deposited:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to deposit SOL:', error);
      throw new Error(
        `Failed to deposit SOL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Seller deposits SOL fee for NFT_FOR_NFT_WITH_FEE swap type
   * Both buyer and seller pay 0.005 SOL each
   */
  async depositSellerSolFee(
    escrowPda: PublicKey,
    seller: PublicKey,
    feeAmount: BN
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Depositing seller SOL fee:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        feeAmount: feeAmount.toString(),
      });

      // Fetch escrow state to get escrow ID for sol_vault derivation
      const escrowState = await this.program.account.escrowState.fetch(escrowPda);
      const escrowId = escrowState.escrowId;

      // Derive sol_vault PDA
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), escrowId.toArrayLike(Buffer, 'le', 8)],
        this.programId
      );

      console.log('[EscrowProgramService] Derived sol_vault PDA:', solVaultPda.toString());

      // Build instruction for deposit_seller_sol_fee
      const instruction = await (this.program.methods as any)
        .depositSellerSolFee()
        .accountsStrict({
          seller,
          escrowState: escrowPda,
          solVault: solVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create transaction
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      const isMainnet = isMainnetNetwork(this.provider.connection);
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      transaction.add(instruction);

      if (isMainnet) {
        const JITO_TIP_ACCOUNTS = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];

        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: 1_000_000,
          })
        );
      }

      transaction.feePayer = this.adminKeypair.publicKey;
      const latestBlockhash = await this.provider.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latestBlockhash.blockhash;

      // Sign and send
      transaction.partialSign(this.adminKeypair);
      const txId = await this.provider.sendAndConfirm(transaction, [], {
        skipPreflight: false,
        commitment: 'confirmed',
      });

      console.log('[EscrowProgramService] Seller SOL fee deposited successfully:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to deposit seller SOL fee:', error);
      throw new Error(
        `Failed to deposit seller SOL fee: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Build unsigned deposit SOL transaction for client-side signing
   * PRODUCTION APPROACH: Returns transaction that client must sign
   */
  async buildDepositSolTransaction(
    escrowPda: PublicKey,
    buyer: PublicKey,
    solAmount: BN
  ): Promise<{ transaction: string; message: string }> {
    try {
      console.log('[EscrowProgramService] Building unsigned deposit SOL transaction:', {
        escrowPda: escrowPda.toString(),
        buyer: buyer.toString(),
        solAmount: solAmount.toString(),
      });

      // Fetch escrow state to get escrow ID for sol_vault derivation
      const escrowState = await this.program.account.escrowState.fetch(escrowPda);
      const escrowId = escrowState.escrowId;

      // Derive sol_vault PDA
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), escrowId.toArrayLike(Buffer, 'le', 8)],
        this.programId
      );

      console.log('[EscrowProgramService] Derived sol_vault PDA:', solVaultPda.toString());

      // Build deposit_sol instruction
      // Note: deposit_sol takes NO parameters - amount is read from escrow state
      const instruction = await (this.program.methods as any)
        .depositSol()
        .accountsStrict({
          buyer,
          escrowState: escrowPda,
          solVault: solVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // FIX: Manually set buyer as NON-signer (Anchor SDK bug workaround)
      instruction.keys.forEach((key: any) => {
        if (key.pubkey.equals(buyer)) {
          console.log(
            `[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`
          );
          key.isSigner = false;
        }
      });

      // Detect network for priority fees and Jito tips
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Get dynamic priority fee
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      console.log(
        `[EscrowProgramService] Using priority fee: ${priorityFee} microlamports per CU (${
          isMainnet ? 'mainnet' : 'devnet'
        })`
      );

      // Create unsigned transaction with priority fees
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      // Add compute budget instructions FIRST
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 200_000,
        })
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
        })
      );

      // Add main escrow instruction
      transaction.add(instruction);

      // NOTE: Do NOT add Jito tips to prepared transactions (client-side signing)
      // Jito tips are only for server-side signed transactions via Jito Block Engine
      // Client wallets will send via regular RPC and don't need Jito infrastructure

      // Set fee payer to buyer (who will sign)
      transaction.feePayer = buyer;

      // Get recent blockhash
      const { blockhash } = await this.provider.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Serialize transaction to base64 (unsigned)
      const serialized = transaction.serialize({
        requireAllSignatures: false, // Don't require signatures yet
        verifySignatures: false,
      });
      const base64Transaction = serialized.toString('base64');

      console.log('[EscrowProgramService] Unsigned SOL deposit transaction built');

      return {
        transaction: base64Transaction,
        message: 'Transaction ready for client signing. Buyer must sign and submit.',
      };
    } catch (error) {
      console.error('[EscrowProgramService] Failed to build deposit SOL transaction:', error);
      throw new Error(
        `Failed to build deposit SOL transaction: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Build unsigned deposit seller SOL fee transaction for client-side signing
   * For NFT_FOR_NFT_WITH_FEE swap type - seller pays 0.005 SOL
   * PRODUCTION APPROACH: Returns transaction that seller must sign
   */
  async buildDepositSellerSolFeeTransaction(
    escrowPda: PublicKey,
    seller: PublicKey,
    feeAmount: BN
  ): Promise<{ transaction: string; message: string }> {
    try {
      console.log('[EscrowProgramService] Building unsigned deposit seller SOL fee transaction:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        feeAmount: feeAmount.toString(),
      });

      // Fetch escrow state to get escrow ID for sol_vault derivation
      const escrowState = await this.program.account.escrowState.fetch(escrowPda);
      const escrowId = escrowState.escrowId;

      // Derive sol_vault PDA
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), escrowId.toArrayLike(Buffer, 'le', 8)],
        this.programId
      );

      console.log('[EscrowProgramService] Derived sol_vault PDA:', solVaultPda.toString());

      // Build deposit_seller_sol_fee instruction
      const instruction = await (this.program.methods as any)
        .depositSellerSolFee()
        .accountsStrict({
          seller,
          escrowState: escrowPda,
          solVault: solVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // FIX: Manually set seller as NON-signer (Anchor SDK bug workaround)
      instruction.keys.forEach((key: any) => {
        if (key.pubkey.equals(seller)) {
          console.log(
            `[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`
          );
          key.isSigner = false;
        }
      });

      // Detect network for priority fees and Jito tips
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Get dynamic priority fee
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      console.log(
        `[EscrowProgramService] Using priority fee: ${priorityFee} microlamports per CU (${
          isMainnet ? 'mainnet' : 'devnet'
        })`
      );

      // Create unsigned transaction with priority fees
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      // Add compute budget instructions FIRST
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 200_000,
        })
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
        })
      );

      // Add main deposit instruction
      transaction.add(instruction);

      // NOTE: Do NOT add Jito tips to prepared transactions (client-side signing)
      // Jito tips are only for server-side signed transactions via Jito Block Engine
      // Client wallets will send via regular RPC and don't need Jito infrastructure

      // Set fee payer to seller (who will sign)
      transaction.feePayer = seller;

      // Get recent blockhash
      const { blockhash } = await this.provider.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Serialize transaction to base64 (unsigned)
      const serialized = transaction.serialize({
        requireAllSignatures: false, // Don't require signatures yet
        verifySignatures: false,
      });
      const base64Transaction = serialized.toString('base64');

      console.log('[EscrowProgramService] Unsigned seller SOL fee deposit transaction built');

      return {
        transaction: base64Transaction,
        message: 'Transaction ready for client signing. Seller must sign and submit.',
      };
    } catch (error) {
      console.error('[EscrowProgramService] Failed to build deposit seller SOL fee transaction:', error);
      throw new Error(
        `Failed to build deposit seller SOL fee transaction: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Deposit Seller's NFT (NFT A) into escrow
   * Used for all swap types - seller always deposits their NFT
   */
  async depositSellerNft(
    escrowPda: PublicKey,
    seller: PublicKey,
    nftMint: PublicKey
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Depositing Seller NFT:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
      });

      // Derive token accounts
      const sellerTokenAccount = await getAssociatedTokenAddress(
        nftMint,
        seller,
        false,
        TOKEN_PROGRAM_ID
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPda,
        true,
        TOKEN_PROGRAM_ID
      );

      // Build instruction
      const instruction = await (this.program.methods as any)
        .depositSellerNft()
        .accountsStrict({
          escrowState: escrowPda,
          seller,
          nftMint,
          sellerTokenAccount,
          escrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create transaction
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      const isMainnet = isMainnetNetwork(this.provider.connection);
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      transaction.add(instruction);

      if (isMainnet) {
        const JITO_TIP_ACCOUNTS = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];

        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: 1_000_000,
          })
        );
      }

      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (
        await this.provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(this.adminKeypair);

      const txId = await this.sendTransactionViaJito(transaction, isMainnet);

      console.log('[EscrowProgramService] Seller NFT deposited:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to deposit seller NFT:', error);
      throw new Error(
        `Failed to deposit seller NFT: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Deposit Buyer's NFT (NFT B) into escrow
   * Used for NFT_FOR_NFT_WITH_FEE and NFT_FOR_NFT_PLUS_SOL swap types
   */
  async depositBuyerNft(
    escrowPda: PublicKey,
    buyer: PublicKey,
    nftBMint: PublicKey
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Depositing Buyer NFT:', {
        escrowPda: escrowPda.toString(),
        buyer: buyer.toString(),
        nftBMint: nftBMint.toString(),
      });

      // Derive token accounts
      const buyerTokenAccount = await getAssociatedTokenAddress(
        nftBMint,
        buyer,
        false,
        TOKEN_PROGRAM_ID
      );

      const escrowTokenAccountB = await getAssociatedTokenAddress(
        nftBMint,
        escrowPda,
        true,
        TOKEN_PROGRAM_ID
      );

      // Build instruction with proper accounts
      const instruction = await (this.program.methods as any)
        .depositBuyerNft()
        .accountsStrict({
          buyer,
          escrowState: escrowPda,
          buyerNftAccount: buyerTokenAccount,
          escrowNftBAccount: escrowTokenAccountB,
          nftMint: nftBMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create transaction
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      const isMainnet = isMainnetNetwork(this.provider.connection);
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      transaction.add(instruction);

      if (isMainnet) {
        const JITO_TIP_ACCOUNTS = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];

        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: 1_000_000,
          })
        );
      }

      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (
        await this.provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(this.adminKeypair);

      const txId = await this.sendTransactionViaJito(transaction, isMainnet);

      console.log('[EscrowProgramService] Buyer NFT deposited:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to deposit buyer NFT:', error);
      throw new Error(
        `Failed to deposit buyer NFT: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Build unsigned deposit buyer NFT transaction for client-side signing
   * For NFT_FOR_NFT_WITH_FEE and NFT_FOR_NFT_PLUS_SOL swap types
   * PRODUCTION APPROACH: Returns transaction that buyer must sign
   */
  async buildDepositBuyerNftTransaction(
    escrowPda: PublicKey,
    buyer: PublicKey,
    nftBMint: PublicKey
  ): Promise<{ transaction: string; message: string }> {
    try {
      console.log('[EscrowProgramService] Building unsigned deposit buyer NFT transaction:', {
        escrowPda: escrowPda.toString(),
        buyer: buyer.toString(),
        nftBMint: nftBMint.toString(),
      });

      // Derive token accounts
      const buyerTokenAccount = await getAssociatedTokenAddress(
        nftBMint,
        buyer,
        false,
        TOKEN_PROGRAM_ID
      );

      const escrowTokenAccountB = await getAssociatedTokenAddress(
        nftBMint,
        escrowPda,
        true, // allowOwnerOffCurve for PDAs
        TOKEN_PROGRAM_ID
      );

      console.log('[EscrowProgramService] Buyer NFT B accounts:', {
        buyerTokenAccount: buyerTokenAccount.toString(),
        escrowTokenAccountB: escrowTokenAccountB.toString(),
      });

      // Build deposit_buyer_nft instruction
      const instruction = await (this.program.methods as any)
        .depositBuyerNft()
        .accountsStrict({
          buyer,
          escrowState: escrowPda,
          buyerNftAccount: buyerTokenAccount,
          escrowNftBAccount: escrowTokenAccountB,
          nftMint: nftBMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // FIX: Manually set buyer as NON-signer (Anchor SDK bug workaround)
      instruction.keys.forEach((key: any) => {
        if (key.pubkey.equals(buyer)) {
          console.log(
            `[EscrowProgramService] Setting ${key.pubkey.toString()} isSigner to false`
          );
          key.isSigner = false;
        }
      });

      // Detect network for priority fees and Jito tips
      const isMainnet = isMainnetNetwork(this.provider.connection);

      // Get dynamic priority fee
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      console.log(
        `[EscrowProgramService] Using priority fee: ${priorityFee} microlamports per CU (${
          isMainnet ? 'mainnet' : 'devnet'
        })`
      );

      // Create unsigned transaction with priority fees
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      // Add compute budget instructions FIRST
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 250_000,
        })
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
        })
      );

      // Add main deposit instruction
      transaction.add(instruction);

      // NOTE: Do NOT add Jito tips to prepared transactions (client-side signing)
      // Jito tips are only for server-side signed transactions via Jito Block Engine
      // Client wallets will send via regular RPC and don't need Jito infrastructure

      // Set fee payer to buyer (who will sign)
      transaction.feePayer = buyer;

      // Get recent blockhash
      const { blockhash } = await this.provider.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Serialize transaction to base64 (unsigned)
      const serialized = transaction.serialize({
        requireAllSignatures: false, // Don't require signatures yet
        verifySignatures: false,
      });
      const base64Transaction = serialized.toString('base64');

      console.log('[EscrowProgramService] Unsigned buyer NFT deposit transaction built');

      return {
        transaction: base64Transaction,
        message: 'Transaction ready for client signing. Buyer must sign and submit.',
      };
    } catch (error) {
      console.error('[EscrowProgramService] Failed to build deposit buyer NFT transaction:', error);
      throw new Error(
        `Failed to build deposit buyer NFT transaction: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Cancel expired escrow and refund assets
   * Handles refunding both SOL and NFTs based on swap type
   */
  async cancelIfExpired(params: {
    escrowPda: PublicKey;
    buyer: PublicKey;
    seller: PublicKey;
    nftMint: PublicKey;
    swapType: 'NFT_FOR_SOL' | 'NFT_FOR_NFT_WITH_FEE' | 'NFT_FOR_NFT_PLUS_SOL';
    nftBMint?: PublicKey;
    escrowId?: BN; // Optional, will fetch from chain if not provided
  }): Promise<string> {
    try {
      const { escrowPda, buyer, seller, nftMint, swapType, nftBMint, escrowId } = params;

      console.log('[EscrowProgramService] Canceling expired escrow:', {
        escrowPda: escrowPda.toString(),
        buyer: buyer.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
        swapType,
        nftBMint: nftBMint?.toString() || 'N/A',
      });

      // Get escrowId - either from parameter or fetch from on-chain state
      let escrowIdBN: BN;
      if (escrowId) {
        escrowIdBN = escrowId;
      } else {
        const escrowState = await this.program.account.escrowState.fetch(escrowPda);
        escrowIdBN = escrowState.escrowId;
      }
      
      // Derive SOL vault PDA
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), escrowIdBN.toArrayLike(Buffer, 'le', 8)],
        this.programId
      );
      console.log('[EscrowProgramService] SOL vault PDA for cancel:', solVaultPda.toString());

      // Derive NFT A accounts (seller's NFT to refund) - now required in accountsStrict
      const escrowNftAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPda,
        true,
        TOKEN_PROGRAM_ID
      );

      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        seller,
        false,
        TOKEN_PROGRAM_ID
      );

      // Build instruction matching new IDL structure
      // NFT A (seller's NFT): Now required accounts in accountsStrict
      // NFT B (buyer's NFT): Still uses remainingAccounts for NFT_FOR_NFT swaps
      const instructionBuilder = (this.program.methods as any)
        .cancelIfExpired()
        .accountsStrict({
          caller: this.adminKeypair.publicKey, // Caller receives rent refund as cleanup reward
          escrowState: escrowPda,
          solVault: solVaultPda,
          buyer,
          seller, // Required for seller SOL refunds in NFT_FOR_NFT_WITH_FEE
          sellerNftAccount, // NFT A: Now required
          escrowNftAccount, // NFT A: Now required
          tokenProgram: TOKEN_PROGRAM_ID, // Now required
          systemProgram: SystemProgram.programId,
        });

      // Build remaining accounts for NFT B (buyer's NFT in NFT_FOR_NFT swaps)
      const remainingAccountsForNftB: any[] = [];

      if (
        (swapType === 'NFT_FOR_NFT_WITH_FEE' || swapType === 'NFT_FOR_NFT_PLUS_SOL') &&
        nftBMint
      ) {
        const escrowNftBAccount = await getAssociatedTokenAddress(
          nftBMint,
          escrowPda,
          true,
          TOKEN_PROGRAM_ID
        );

        const buyerNftBAccount = await getAssociatedTokenAddress(
          nftBMint,
          buyer,
          false,
          TOKEN_PROGRAM_ID
        );

        remainingAccountsForNftB.push(
          { pubkey: nftBMint, isSigner: false, isWritable: false },
          { pubkey: escrowNftBAccount, isSigner: false, isWritable: true },
          { pubkey: buyerNftBAccount, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
        );
      }

      // Add remaining accounts for NFT B if this is an NFT_FOR_NFT swap
      if (remainingAccountsForNftB.length > 0) {
        instructionBuilder.remainingAccounts(remainingAccountsForNftB);
      }

      const instruction = await instructionBuilder.instruction();

      // Create transaction
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      const isMainnet = isMainnetNetwork(this.provider.connection);
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      transaction.add(instruction);

      if (isMainnet) {
        const JITO_TIP_ACCOUNTS = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];

        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: 1_000_000,
          })
        );
      }

      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (
        await this.provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(this.adminKeypair);

      const txId = await this.sendTransactionViaJito(transaction, isMainnet);

      console.log('[EscrowProgramService] Expired escrow canceled:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to cancel expired escrow:', error);
      throw new Error(
        `Failed to cancel expired escrow: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Admin cancel escrow with full refunds
   * Emergency cancellation with asset refunds for all swap types
   */
  async adminCancel(params: {
    escrowPda: PublicKey;
    buyer: PublicKey;
    seller: PublicKey;
    nftMint: PublicKey;
    swapType: 'NFT_FOR_SOL' | 'NFT_FOR_NFT_WITH_FEE' | 'NFT_FOR_NFT_PLUS_SOL';
    nftBMint?: PublicKey;
    escrowId?: BN; // Optional, will fetch from chain if not provided
  }): Promise<string> {
    try {
      const { escrowPda, buyer, seller, nftMint, swapType, nftBMint, escrowId } = params;

      console.log('[EscrowProgramService] Admin canceling escrow:', {
        escrowPda: escrowPda.toString(),
        buyer: buyer.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
        swapType,
        nftBMint: nftBMint?.toString() || 'N/A',
      });

      // Get escrowId - either from parameter or fetch from on-chain state
      let escrowIdBN: BN;
      if (escrowId) {
        escrowIdBN = escrowId;
      } else {
        const escrowState = await this.program.account.escrowState.fetch(escrowPda);
        escrowIdBN = escrowState.escrowId;
      }
      
      // Derive SOL vault PDA
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), escrowIdBN.toArrayLike(Buffer, 'le', 8)],
        this.programId
      );
      console.log('[EscrowProgramService] SOL vault PDA for admin cancel:', solVaultPda.toString());

      // Derive NFT A accounts (seller's NFT to refund)
      const escrowNftAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPda,
        true,
        TOKEN_PROGRAM_ID
      );

      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        seller,
        false,
        TOKEN_PROGRAM_ID
      );

      // Build remaining accounts for NFT B (buyer's NFT in NFT_FOR_NFT swaps)
      // NFT A accounts are now in accountsStrict, but NFT B still needs remainingAccounts
      const remainingAccounts: any[] = [];

      if (
        (swapType === 'NFT_FOR_NFT_WITH_FEE' || swapType === 'NFT_FOR_NFT_PLUS_SOL') &&
        nftBMint
      ) {
        const escrowNftBAccount = await getAssociatedTokenAddress(
          nftBMint,
          escrowPda,
          true,
          TOKEN_PROGRAM_ID
        );

        const buyerNftBAccount = await getAssociatedTokenAddress(
          nftBMint,
          buyer,
          false,
          TOKEN_PROGRAM_ID
        );

        // Add NFT B accounts to remaining accounts for buyer's NFT refund
        remainingAccounts.push(
          { pubkey: nftBMint, isSigner: false, isWritable: false },
          { pubkey: escrowNftBAccount, isSigner: false, isWritable: true },
          { pubkey: buyerNftBAccount, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
        );
      }

      // Build instruction matching new IDL structure
      // NFT A (seller's NFT): Now required accounts in accountsStrict
      // NFT B (buyer's NFT): Still uses remainingAccounts for NFT_FOR_NFT swaps
      const instructionBuilder = (this.program.methods as any)
        .adminCancel()
        .accountsStrict({
          admin: this.adminKeypair.publicKey,
          escrowState: escrowPda,
          solVault: solVaultPda,
          buyer,
          seller, // ADDED: Required for seller SOL refunds in NFT_FOR_NFT_WITH_FEE
          sellerNftAccount, // NFT A: Now required (was in remainingAccounts)
          escrowNftAccount, // NFT A: Now required (was in remainingAccounts)
          tokenProgram: TOKEN_PROGRAM_ID, // Now required
          systemProgram: SystemProgram.programId,
        });

      // Add remaining accounts for NFT B if this is an NFT_FOR_NFT swap
      if (remainingAccounts.length > 0) {
        instructionBuilder.remainingAccounts(remainingAccounts);
      }

      const instruction = await instructionBuilder.instruction();

      // Create transaction
      const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const transaction = new Transaction();

      const isMainnet = isMainnetNetwork(this.provider.connection);
      const priorityFee = await PriorityFeeService.getRecommendedPriorityFee(
        this.provider.connection,
        isMainnet
      );

      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );

      transaction.add(instruction);

      if (isMainnet) {
        const JITO_TIP_ACCOUNTS = [
          '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
          'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
          'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
          'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
          'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
          'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
          'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
          '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        ];

        const jitoTipAccount = new PublicKey(
          JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
        );
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.adminKeypair.publicKey,
            toPubkey: jitoTipAccount,
            lamports: 1_000_000,
          })
        );
      }

      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (
        await this.provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(this.adminKeypair);

      const txId = await this.sendTransactionViaJito(transaction, isMainnet);

      console.log('[EscrowProgramService] Escrow admin canceled:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to admin cancel escrow:', error);
      throw new Error(
        `Failed to admin cancel escrow: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Close escrow account and recover rent-exempt reserve
   * Can only be called after escrow reaches terminal state (Completed or Cancelled)
   * Returns rent to admin wallet (who paid for account creation)
   * 
   * @param escrowPda - Escrow PDA address
   * @returns Transaction signature
   */
  async closeEscrow(escrowPda: PublicKey): Promise<string> {
    try {
      console.log('[EscrowProgramService] Closing escrow account:', escrowPda.toString());

      // Fetch escrow state with retry logic to handle timing issues
      // After settlement, the on-chain state may not be immediately available due to:
      // - RPC node cache invalidation delay
      // - Network propagation time
      // - Transaction confirmation vs. account state update timing
      const maxRetries = 5;
      const retryDelayMs = 3000; // 3 seconds between retries (up to 15s total wait)
      let escrowState: any;
      let status: any;
      let isCompleted = false;
      let isCancelled = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          escrowState = await this.program.account.escrowState.fetch(escrowPda);
          console.log(`[EscrowProgramService] Escrow status (attempt ${attempt}/${maxRetries}):`, escrowState.status);

          // Validate terminal state
          // Status is an enum object: { pending: {} } | { completed: {} } | { cancelled: {} }
          status = escrowState.status as any;
          isCompleted = status.completed !== undefined;
          isCancelled = status.cancelled !== undefined;

          if (isCompleted || isCancelled) {
            // Terminal state reached
            break;
          }

          if (attempt < maxRetries) {
            console.log(`[EscrowProgramService] Status still pending, waiting ${retryDelayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          }
        } catch (fetchError: any) {
          // Handle transient RPC errors (network issues, timeouts, etc.)
          console.warn(`[EscrowProgramService] Failed to fetch escrow state (attempt ${attempt}/${maxRetries}):`, fetchError.message);
          
          if (attempt < maxRetries) {
            console.log(`[EscrowProgramService] Retrying after ${retryDelayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          } else {
            // All retries exhausted, throw the fetch error
            throw new Error(`Failed to fetch escrow state after ${maxRetries} attempts: ${fetchError.message}`);
          }
        }
      }
      
      if (!isCompleted && !isCancelled) {
        throw new Error(`Cannot close escrow in status: ${JSON.stringify(status)} after ${maxRetries} attempts. The escrow state may not have propagated yet.`);
      }

      // Build close instruction
      const instruction = await (this.program.methods as any)
        .closeEscrow()
        .accountsStrict({
          admin: this.adminKeypair.publicKey,
          escrowState: escrowPda,
        })
        .instruction();

      // Create transaction
      const { Transaction } = await import('@solana/web3.js');
      const transaction = new Transaction().add(instruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } =
        await this.provider.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.adminKeypair.publicKey;

      // Sign transaction
      transaction.sign(this.adminKeypair);

      // Send and confirm transaction
      const signature = await this.provider.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
        }
      );

      console.log('[EscrowProgramService] Close escrow transaction sent:', signature);

      // Confirm transaction
      await this.provider.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      console.log('[EscrowProgramService] Escrow account closed successfully');
      return signature;
    } catch (error: any) {
      console.error('[EscrowProgramService] Failed to close escrow:', error);
      throw new Error(`Failed to close escrow account: ${error.message}`);
    }
  }

  /**
   * Get connection
   */
  getConnection(): Connection {
    return this.provider.connection;
  }

  /**
   * Get program
   */
  getProgram(): Program<Escrow> {
    return this.program;
  }
}

/**
 * Singleton instance
 */
let escrowProgramServiceInstance: EscrowProgramService | null = null;

/**
 * Initialize the escrow program service
 * Loads admin keypair from environment variables
 */
export const initEscrowProgramService = (): void => {
  if (escrowProgramServiceInstance) {
    console.warn('[EscrowProgramService] Service already initialized');
    return;
  }

  escrowProgramServiceInstance = new EscrowProgramService();
  console.log('[EscrowProgramService] Service initialized successfully');
};

/**
 * Get the escrow program service instance
 * Auto-initializes if not already initialized
 */
export const getEscrowProgramService = (): EscrowProgramService => {
  if (!escrowProgramServiceInstance) {
    initEscrowProgramService();
  }
  return escrowProgramServiceInstance!;
};
