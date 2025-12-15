/**
 * Atomic Swap API Client for E2E Tests
 * 
 * Helper functions for interacting with the atomic swap API endpoints
 */

import axios, { AxiosInstance } from 'axios';
import { PublicKey, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export interface CreateOfferParams {
  makerWallet: string;
  takerWallet?: string; // Optional for open offers
  offeredAssets?: Array<{
    mint: string;
    isCompressed: boolean;
    merkleTree?: string;
  }>;
  requestedAssets?: Array<{
    mint: string;
    isCompressed: boolean;
    merkleTree?: string;
  }>;
  offeredSol?: number; // In lamports
  requestedSol?: number; // In lamports
  customFee?: {
    type: 'percentage' | 'fixed' | 'zero';
    value?: number; // Basis points for percentage, lamports for fixed
    payer?: 'maker' | 'taker' | 'platform';
  };
}

export interface OfferResponse {
  success: boolean;
  data?: {
    offer: {
      id: string;
      status: string;
      makerWallet: string;
      takerWallet: string | null;
      offeredAssets: any[];
      requestedAssets: any[];
      offeredSol: string;
      requestedSol: string;
      createdAt: string;
    };
    transaction: {
      serialized: string;
      nonceAccount: string;
    };
  };
  error?: string;
  message?: string;
}

export interface AcceptOfferResponse {
  success: boolean;
  data?: {
    offer: any;
    transaction: {
      serialized: string;
    };
  };
  error?: string;
  message?: string;
}

export class AtomicSwapApiClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(baseURL: string, apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    });
  }

  /**
   * Create a new swap offer
   */
  async createOffer(params: CreateOfferParams, idempotencyKey?: string): Promise<OfferResponse> {
    const headers: any = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    try {
      const response = await this.client.post<OfferResponse>(
        '/api/offers',
        params,
        { headers }
      );
      return response.data;
    } catch (error: any) {
      if (error.response) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Get offer by ID
   */
  async getOffer(offerId: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/offers/${offerId}`);
      return response.data;
    } catch (error: any) {
      if (error.response) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * List offers with filters
   */
  async listOffers(filters?: {
    status?: string;
    makerWallet?: string;
    takerWallet?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    try {
      const response = await this.client.get('/api/offers', {
        params: filters,
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Accept an offer
   */
  async acceptOffer(offerId: string, takerWallet: string, idempotencyKey?: string): Promise<AcceptOfferResponse> {
    const headers: any = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    try {
      const response = await this.client.post<AcceptOfferResponse>(
        `/api/offers/${offerId}/accept`,
        { takerWallet },
        { headers }
      );
      return response.data;
    } catch (error: any) {
      if (error.response) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Cancel an offer
   */
  async cancelOffer(offerId: string): Promise<any> {
    try {
      const response = await this.client.post(`/api/offers/${offerId}/cancel`);
      return response.data;
    } catch (error: any) {
      if (error.response) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Rebuild transaction with fresh cNFT proofs
   */
  async rebuildTransaction(offerId: string, idempotencyKey?: string): Promise<AcceptOfferResponse> {
    const headers: any = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    } else {
      // Generate default idempotency key if not provided
      headers['idempotency-key'] = AtomicSwapApiClient.generateIdempotencyKey(`rebuild-${offerId}`);
    }
    
    try {
      const response = await this.client.post<AcceptOfferResponse>(
        `/api/offers/${offerId}/rebuild-transaction`,
        {},
        { headers }
      );
      return response.data;
    } catch (error: any) {
      if (error.response) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Confirm on-chain execution
   */
  async confirmOffer(offerId: string, signature: string, idempotencyKey?: string): Promise<any> {
    const headers: any = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    } else {
      // Generate default idempotency key if not provided
      headers['idempotency-key'] = AtomicSwapApiClient.generateIdempotencyKey(`confirm-${offerId}`);
    }
    
    try {
      const response = await this.client.post(
        `/api/offers/${offerId}/confirm`,
        { signature },
        { headers }
      );
      return response.data;
    } catch (error: any) {
      if (error.response) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Helper: Sign and send a transaction
   */
  static async signAndSendTransaction(
    serializedTx: string,
    signers: Keypair[],
    connection: any
  ): Promise<string> {
    // Decode the base64 serialized transaction
    const txBuffer = Buffer.from(serializedTx, 'base64');
    
    let transaction: Transaction | VersionedTransaction;
    
    // Try to deserialize as VersionedTransaction first
    try {
      transaction = VersionedTransaction.deserialize(txBuffer);
      
      // Sign versioned transaction with all signers at once
      // FIX: Spread signers array for VersionedTransaction.sign()
      if (transaction instanceof VersionedTransaction) {
        transaction.sign(signers as [Keypair, ...Keypair[]]);
      }
    } catch (versionedError) {
      // Fall back to legacy transaction
      transaction = Transaction.from(txBuffer);
      
      // Sign legacy transaction
      if (transaction instanceof Transaction) {
        transaction.partialSign(...signers);
      }
    }

    // Send and confirm
    const rawTransaction = transaction.serialize();
    const signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      maxRetries: 3,
    });

    // Wait for confirmation
    // FIX: Use proper confirmation method with blockhash
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, 'confirmed');

    return signature;
  }

  /**
   * Helper: Sign and send multiple transactions for bulk swaps
   * 
   * For bulk swaps, the API returns multiple transactions:
   * - Transaction 0: SOL transfers (signed by maker + taker)
   * - Transaction 1+: NFT transfers (signed by the NFT owner)
   * 
   * Uses Jito bundles on mainnet for atomic execution (prevents blockhash expiration).
   * Falls back to sequential submission on devnet or if Jito is unavailable.
   */
  static async signAndSendBulkSwapTransactions(
    bulkSwapData: {
      transactions: Array<{
        index: number;
        purpose: string;
        serializedTransaction: string;
        requiredSigners?: string[];
      }>;
      requiresJitoBundle?: boolean;
    },
    maker: Keypair,
    taker: Keypair,
    connection: any
  ): Promise<{ signatures: string[]; success: boolean; error?: string; bundleId?: string }> {
    console.log(`[AtomicSwapApiClient] Processing bulk swap with ${bulkSwapData.transactions.length} transactions`);
    
    // Check if Jito bundle is required (mainnet production)
    const requiresJito = bulkSwapData.requiresJitoBundle !== false; // Default to true for mainnet
    const isMainnet = connection.rpcEndpoint?.includes('mainnet') || 
                      process.env.MAINNET_RPC_URL?.includes('mainnet');
    
    if (requiresJito && isMainnet) {
      console.log(`[AtomicSwapApiClient] Using Jito bundle for atomic execution`);
      return await this.submitJitoBundle(bulkSwapData, maker, taker, connection);
    } else {
      console.log(`[AtomicSwapApiClient] Using sequential submission (devnet or Jito disabled)`);
      return await this.submitSequentially(bulkSwapData, maker, taker, connection);
    }
  }
  
  /**
   * Submit transactions as a Jito bundle for atomic execution
   */
  private static async submitJitoBundle(
    bulkSwapData: {
      transactions: Array<{
        index: number;
        purpose: string;
        serializedTransaction: string;
        requiredSigners?: string[];
      }>;
    },
    maker: Keypair,
    taker: Keypair,
    connection: any
  ): Promise<{ signatures: string[]; success: boolean; error?: string; bundleId?: string }> {
    const JITO_BUNDLE_ENDPOINT = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
    
    console.log(`[AtomicSwapApiClient] Preparing Jito bundle with ${bulkSwapData.transactions.length} transactions...`);
    
    // Sign all transactions first
    const signedTransactions: string[] = [];
    
    for (const tx of bulkSwapData.transactions) {
      try {
        // Determine which signers are needed
        const signers: Keypair[] = [];
        const requiredSigners = tx.requiredSigners || [];
        
        if (requiredSigners.includes(maker.publicKey.toBase58())) {
          signers.push(maker);
        }
        if (requiredSigners.includes(taker.publicKey.toBase58())) {
          signers.push(taker);
        }
        
        // Default signers based on transaction purpose
        if (signers.length === 0 && tx.purpose.toLowerCase().includes('sol')) {
          signers.push(maker, taker);
        } else if (signers.length === 0 && tx.purpose.toLowerCase().includes('maker')) {
          signers.push(maker);
        } else if (signers.length === 0 && tx.purpose.toLowerCase().includes('taker')) {
          signers.push(taker);
        } else if (signers.length === 0) {
          signers.push(maker, taker);
        }
        
        // Deserialize, sign, and re-serialize
        const { Transaction, VersionedTransaction } = await import('@solana/web3.js');
        const txBuffer = Buffer.from(tx.serializedTransaction, 'base64');
        
        // Try to deserialize as VersionedTransaction first, fallback to Transaction
        let transaction: Transaction | VersionedTransaction;
        try {
          transaction = VersionedTransaction.deserialize(txBuffer);
          // Sign versioned transaction
          transaction.sign(signers);
        } catch {
          transaction = Transaction.from(txBuffer);
          transaction.sign(...signers);
        }
        
        const serialized = transaction.serialize();
        signedTransactions.push(serialized.toString('base64'));
        
        console.log(`  ✅ Transaction ${tx.index + 1} signed: ${tx.purpose}`);
      } catch (error: any) {
        console.error(`  ❌ Failed to sign transaction ${tx.index + 1}:`, error.message);
        return {
          success: false,
          signatures: [],
          error: `Failed to sign transaction ${tx.index + 1}: ${error.message}`,
        };
      }
    }
    
    // Submit bundle to Jito
    try {
      console.log(`[AtomicSwapApiClient] Submitting bundle to Jito...`);
      
      const response = await fetch(JITO_BUNDLE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: [signedTransactions],
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jito bundle submission failed: HTTP ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as {
        result?: { bundleId?: string };
        error?: { message?: string };
      };
      
      if (result.error) {
        throw new Error(`Jito bundle error: ${result.error.message}`);
      }
      
      const bundleId = result.result?.bundleId;
      if (!bundleId) {
        throw new Error('Jito bundle submission succeeded but no bundle ID returned');
      }
      
      console.log(`[AtomicSwapApiClient] ✅ Bundle submitted: ${bundleId}`);
      console.log(`[AtomicSwapApiClient] ⏳ Waiting for bundle confirmation...`);
      
      // Poll for bundle status
      const confirmation = await this.waitForBundleConfirmation(bundleId);
      
      if (confirmation.confirmed) {
        console.log(`[AtomicSwapApiClient] ✅ Bundle landed in slot ${confirmation.slot}`);
        // Extract signatures from bundle (we'll need to track them separately)
        // For now, return bundle ID - signatures will be in the bundle status
        return {
          success: true,
          signatures: [bundleId], // Bundle ID as placeholder
          bundleId,
        };
      } else {
        return {
          success: false,
          signatures: [],
          bundleId,
          error: `Bundle ${confirmation.status}: ${confirmation.error || 'Unknown error'}`,
        };
      }
    } catch (error: any) {
      console.error(`[AtomicSwapApiClient] ❌ Jito bundle submission failed:`, error.message);
      return {
        success: false,
        signatures: [],
        error: `Jito bundle failed: ${error.message}`,
      };
    }
  }
  
  /**
   * Wait for Jito bundle confirmation
   */
  private static async waitForBundleConfirmation(
    bundleId: string,
    timeoutSeconds: number = 30
  ): Promise<{ confirmed: boolean; status: string; slot?: number; error?: string }> {
    const JITO_BUNDLE_ENDPOINT = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    let pollCount = 0;
    
    while (Date.now() - startTime < timeoutMs) {
      pollCount++;
      const elapsed = (Date.now() - startTime) / 1000;
      
      try {
        const response = await fetch(JITO_BUNDLE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBundleStatuses',
            params: [[bundleId]],
          }),
        });
        
        const result = await response.json() as {
          result?: { value?: Array<{ bundle_id: string; status: string; slot?: number }> };
          error?: { message?: string };
        };
        
        if (result.error) {
          console.warn(`[AtomicSwapApiClient] Bundle status error: ${result.error.message}`);
        } else {
          const statuses = result.result?.value || [];
          const bundleStatus = statuses.find(s => s.bundle_id === bundleId);
          
          if (bundleStatus) {
            console.log(`[AtomicSwapApiClient] Bundle poll #${pollCount}: ${bundleStatus.status} (${elapsed.toFixed(1)}s)`);
            
            if (bundleStatus.status === 'Landed' || bundleStatus.status === 'landed') {
              return {
                confirmed: true,
                status: 'Landed',
                slot: bundleStatus.slot,
              };
            }
            
            if (bundleStatus.status === 'Failed' || bundleStatus.status === 'failed') {
              return {
                confirmed: false,
                status: 'Failed',
                error: 'Bundle execution failed',
              };
            }
          }
        }
      } catch (error: any) {
        console.warn(`[AtomicSwapApiClient] Bundle status check error: ${error.message}`);
      }
      
      // Poll interval: faster at start, slower after 15s
      const pollInterval = elapsed < 15 ? 1500 : 2500;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    return {
      confirmed: false,
      status: 'Timeout',
      error: `Bundle confirmation timeout after ${timeoutSeconds}s`,
    };
  }
  
  /**
   * Submit transactions sequentially (fallback for devnet or when Jito unavailable)
   */
  private static async submitSequentially(
    bulkSwapData: {
      transactions: Array<{
        index: number;
        purpose: string;
        serializedTransaction: string;
        requiredSigners?: string[];
      }>;
    },
    maker: Keypair,
    taker: Keypair,
    connection: any
  ): Promise<{ signatures: string[]; success: boolean; error?: string }> {
    const signatures: string[] = [];
    
    for (const tx of bulkSwapData.transactions) {
      try {
        console.log(`\n[AtomicSwapApiClient] Processing transaction ${tx.index + 1}: ${tx.purpose}`);
        
        // Determine which signers are needed for this transaction
        const signers: Keypair[] = [];
        const requiredSigners = tx.requiredSigners || [];
        
        if (requiredSigners.includes(maker.publicKey.toBase58())) {
          signers.push(maker);
        }
        if (requiredSigners.includes(taker.publicKey.toBase58())) {
          signers.push(taker);
        }
        
        // If no specific signers listed, default to both for SOL transactions
        if (signers.length === 0 && tx.purpose.toLowerCase().includes('sol')) {
          signers.push(maker, taker);
        }
        // For cNFT transfers, maker signs their cNFT transfers, taker signs theirs
        else if (signers.length === 0 && tx.purpose.toLowerCase().includes('maker')) {
          signers.push(maker);
        } else if (signers.length === 0 && tx.purpose.toLowerCase().includes('taker')) {
          signers.push(taker);
        } else if (signers.length === 0) {
          // Fallback: both sign
          signers.push(maker, taker);
        }
        
        console.log(`  Signers: ${signers.map(s => s.publicKey.toBase58().slice(0, 8) + '...').join(', ')}`);
        
        // Sign and send
        const signature = await this.signAndSendTransaction(
          tx.serializedTransaction,
          signers,
          connection
        );
        
        signatures.push(signature);
        console.log(`  ✅ Transaction ${tx.index + 1} confirmed: ${signature}`);
        
        // Minimal delay between transactions - cNFT proofs can become stale quickly
        // For cNFT transfers, we want to send as fast as possible
        if (tx.index < bulkSwapData.transactions.length - 1) {
          const isCnftNext = bulkSwapData.transactions[tx.index + 1]?.purpose?.toLowerCase().includes('cnft');
          if (isCnftNext) {
            console.log('  Sending next cNFT tx immediately (proof freshness)...');
            // No delay for cNFT transactions - proof freshness is critical
          } else {
            console.log('  Waiting 500ms before next transaction...');
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
      } catch (error: any) {
        console.error(`  ❌ Transaction ${tx.index + 1} failed:`, error.message);
        return {
          success: false,
          signatures,
          error: `Transaction ${tx.index + 1} (${tx.purpose}) failed: ${error.message}`,
        };
      }
    }
    
    return { success: true, signatures };
  }

  /**
   * Helper: Generate idempotency key
   */
  static generateIdempotencyKey(prefix: string = 'test'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * Create a client instance for E2E tests
 */
export function createAtomicSwapClient(
  baseURL?: string,
  apiKey?: string
): AtomicSwapApiClient {
  const url = baseURL || process.env.STAGING_API_URL || 'http://localhost:3000';
  const key = apiKey || process.env.ATOMIC_SWAP_API_KEY || '';

  if (!key) {
    throw new Error(
      'ATOMIC_SWAP_API_KEY environment variable is required for API client. ' +
      'Set it in your .env file for local testing.'
    );
  }

  return new AtomicSwapApiClient(url, key);
}

