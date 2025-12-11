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
   * Helper: Sign and send multiple transactions for Jito bundle (devnet sequential mode)
   * 
   * For bulk swaps (cNFT swaps), the API returns multiple transactions:
   * - Transaction 0: SOL transfers (signed by maker + taker)
   * - Transaction 1+: cNFT transfers (signed by the cNFT owner)
   * 
   * On devnet, these are submitted sequentially. On mainnet, they'd be bundled via Jito.
   */
  static async signAndSendBulkSwapTransactions(
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
    console.log(`[AtomicSwapApiClient] Processing bulk swap with ${bulkSwapData.transactions.length} transactions`);
    
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
        
        // Small delay between transactions to avoid rate limiting
        if (tx.index < bulkSwapData.transactions.length - 1) {
          console.log('  Waiting 1s before next transaction...');
          await new Promise(resolve => setTimeout(resolve, 1000));
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

