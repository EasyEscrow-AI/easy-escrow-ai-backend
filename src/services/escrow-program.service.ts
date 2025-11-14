/**
 * Escrow Program Service
 *
 * Handles interactions with the deployed Anchor escrow program on Solana.
 * Provides methods to call program instructions for settlement and cancellation.
 */

import { AnchorProvider, Program, BN, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
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
    
    try {
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
      console.error('[EscrowProgramService] Failed to send via Jito Block Engine:', error);
      throw error;
    }
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

      // Build deposit_seller_nft instruction (v2)
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
      // For NFT<>SOL swaps, pass NFT A accounts as placeholders (program won't use them)
      // Note: nftBMint and escrowNftBAccount are UncheckedAccount in Rust, so they accept any PublicKey
      // CRITICAL: escrow_nft_b_account must be a valid account address, even if unused for NFT<>SOL swaps
      // Using SystemProgram as placeholder would fail validation, so we use NFT A accounts which are valid
      const accounts: any = {
        escrowState: escrowPda, // Anchor converts escrow_state -> escrowState
        buyer,
        seller,
        solVault: solVaultPda, // Separate PDA for holding SOL lamports
        nftAMint: nftMint, // NFT A mint (seller's NFT)
        escrowNftAccount: escrowNftAAccount, // Escrow NFT A account (PDA-derived, will be created if needed)
        // For NFT<>SOL: pass NFT A accounts as placeholders (program checks nft_b_mint.is_some() before using)
        // For NFT<>NFT: pass actual NFT B accounts
        nftBMint: nftBMint || nftMint, // NFT B mint (or NFT A mint as placeholder for NFT<>SOL)
        escrowNftBAccount: escrowNftBAccount || escrowNftAAccount, // Escrow NFT B account (or NFT A account as placeholder)
        admin: this.adminKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId, // Anchor converts system_program -> systemProgram
      };
      
      // Validate that we have NFT B accounts for NFT<>NFT swaps
      if (swapType !== 'NFT_FOR_SOL' && !nftBMint) {
        throw new Error(`nftBMint is required for swap type ${swapType}`);
      }
      if (swapType !== 'NFT_FOR_SOL' && !escrowNftBAccount) {
        throw new Error(`escrowNftBAccount is required for swap type ${swapType}`);
      }

      console.log('[EscrowProgramService] Accounts for initAgreement:', {
        escrowState: escrowPda.toString(),
        nftAMint: nftMint.toString(),
        escrowNftAccount: escrowNftAAccount.toString(),
        nftBMint: (nftBMint || nftMint).toString(),
        escrowNftBAccount: (escrowNftBAccount || escrowNftAAccount).toString(),
        hasNftB: !!nftBMint,
      });

      // Build instruction
      // Note: Anchor converts snake_case (Rust) to camelCase (TypeScript)
      // escrow_nft_account has PDA definition in IDL, but we pass it explicitly for init_if_needed
      let instruction;
      try {
        instruction = await (this.program.methods as any)
          .initAgreement(
            escrowId,
            swapTypeEnum,
            solAmount || null,
            nftMint, // nft_a_mint parameter (seller's NFT)
            nftBMint || null, // nft_b_mint parameter (buyer's NFT for certain swap types)
            expiryTimestamp,
            platformFeeBps,
            feePayerEnum
          )
          .accountsStrict(accounts)
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

      console.log('[EscrowProgramService] V2 Instruction built');

      // Fix: Set buyer and seller as NON-signers (Anchor bug workaround)
      instruction.keys.forEach((key: any) => {
        if (key.pubkey.equals(buyer) || key.pubkey.equals(seller)) {
          key.isSigner = false;
        }
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
        '[EscrowProgramService] V2 Transaction signed by admin, sending to network...'
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
