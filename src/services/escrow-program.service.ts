/**
 * Escrow Program Service
 * 
 * Handles interactions with the deployed Anchor escrow program on Solana.
 * Provides methods to call program instructions for settlement and cancellation.
 */

import { AnchorProvider, Program, web3, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config';
import { Escrow } from '../../target/types/escrow';
import escrowIdl from '../../target/idl/escrow.json';
import bs58 from 'bs58';

/**
 * Load admin keypair from environment
 */
function loadAdminKeypair(): Keypair {
  // Try AUTHORITY_KEYPAIR first (preferred)
  let envValue = process.env.AUTHORITY_KEYPAIR;
  let envName = 'AUTHORITY_KEYPAIR';
  
  // Fallback to DEVNET_ADMIN_PRIVATE_KEY for devnet testing
  if (!envValue && process.env.SOLANA_NETWORK === 'devnet') {
    envValue = process.env.DEVNET_ADMIN_PRIVATE_KEY;
    envName = 'DEVNET_ADMIN_PRIVATE_KEY';
  }
  
  if (!envValue) {
    throw new Error('[EscrowProgramService] Admin keypair not configured. Set AUTHORITY_KEYPAIR or DEVNET_ADMIN_PRIVATE_KEY');
  }
  
  try {
    // Try JSON array format [1, 2, 3, ..., 64]
    if (envValue.startsWith('[')) {
      const secretKey = Uint8Array.from(JSON.parse(envValue));
      const keypair = Keypair.fromSecretKey(secretKey);
      console.log(`[EscrowProgramService] Loaded admin keypair from ${envName}: ${keypair.publicKey.toString()}`);
      return keypair;
    }
    
    // Try Base58 format
    const secretKey = bs58.decode(envValue);
    if (secretKey.length === 64) {
      const keypair = Keypair.fromSecretKey(secretKey);
      console.log(`[EscrowProgramService] Loaded admin keypair from ${envName}: ${keypair.publicKey.toString()}`);
      return keypair;
    }
    
    // Try Base64 format
    const base64Key = Buffer.from(envValue, 'base64');
    if (base64Key.length === 64) {
      const keypair = Keypair.fromSecretKey(base64Key);
      console.log(`[EscrowProgramService] Loaded admin keypair from ${envName}: ${keypair.publicKey.toString()}`);
      return keypair;
    }
    
    throw new Error('Unsupported keypair format');
  } catch (error) {
    throw new Error(`[EscrowProgramService] Failed to load admin keypair: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Escrow Program Service Class
 */
export class EscrowProgramService {
  private provider: AnchorProvider;
  private program: Program<Escrow>;
  private adminKeypair: Keypair;
  
  constructor() {
    // Load admin keypair from environment
    this.adminKeypair = loadAdminKeypair();
    
    // Get RPC URL
    if (!config?.solana?.rpcUrl) {
      throw new Error('[EscrowProgramService] Solana RPC URL not configured');
    }
    
    // Create connection
    const connection = new Connection(config.solana.rpcUrl, 'confirmed');
    
    // Create provider
    const wallet = new web3.Wallet(adminKeypair);
    this.provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed' }
    );
    
    // Get program ID
    if (!config?.solana?.escrowProgramId) {
      throw new Error('[EscrowProgramService] Escrow program ID not configured');
    }
    
    const programId = new PublicKey(config.solana.escrowProgramId);
    
    // Initialize program
    this.program = new Program<Escrow>(
      escrowIdl as Escrow,
      programId,
      this.provider
    );
    
    console.log('[EscrowProgramService] Initialized with program:', programId.toString());
  }
  
  /**
   * Derive escrow PDA from escrow ID
   */
  private deriveEscrowPDA(escrowId: BN): [PublicKey, number] {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('escrow'),
        escrowId.toArrayLike(Buffer, 'le', 8)
      ],
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
      throw new Error(`Failed to fetch escrow account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Settle the escrow - transfer NFT to buyer and USDC to seller
   */
  async settle(
    escrowPda: PublicKey,
    seller: PublicKey,
    buyer: PublicKey,
    nftMint: PublicKey,
    usdcMint: PublicKey
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Settling escrow:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        buyer: buyer.toString(),
        nftMint: nftMint.toString(),
        usdcMint: usdcMint.toString(),
      });
      
      // Get escrow ID from on-chain account
      const escrowId = await this.getEscrowIdFromPDA(escrowPda);
      
      // Verify PDA derivation matches
      const [derivedPda] = this.deriveEscrowPDA(escrowId);
      if (!derivedPda.equals(escrowPda)) {
        throw new Error(`PDA mismatch: expected ${derivedPda.toString()}, got ${escrowPda.toString()}`);
      }
      
      // Derive token accounts
      const escrowUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        escrowPda,
        true // allowOwnerOffCurve - for PDAs
      );
      
      const escrowNftAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPda,
        true
      );
      
      const sellerUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        seller
      );
      
      const buyerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        buyer
      );
      
      console.log('[EscrowProgramService] Token accounts:', {
        escrowUsdcAccount: escrowUsdcAccount.toString(),
        escrowNftAccount: escrowNftAccount.toString(),
        sellerUsdcAccount: sellerUsdcAccount.toString(),
        buyerNftAccount: buyerNftAccount.toString(),
      });
      
      // Call settle instruction
      const tx = await this.program.methods
        .settle()
        .accounts({
          escrowState: escrowPda,
          escrowUsdcAccount,
          escrowNftAccount,
          sellerUsdcAccount,
          buyerNftAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      
      console.log('[EscrowProgramService] Settlement transaction:', tx);
      
      return tx;
    } catch (error) {
      console.error('[EscrowProgramService] Settlement failed:', error);
      throw new Error(`Failed to settle escrow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Cancel escrow if expired
   */
  async cancelIfExpired(
    escrowPda: PublicKey,
    buyer: PublicKey,
    seller: PublicKey,
    nftMint: PublicKey,
    usdcMint: PublicKey
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Cancelling expired escrow:', escrowPda.toString());
      
      // Derive token accounts
      const escrowUsdcAccount = await getAssociatedTokenAddress(usdcMint, escrowPda, true);
      const escrowNftAccount = await getAssociatedTokenAddress(nftMint, escrowPda, true);
      const buyerUsdcAccount = await getAssociatedTokenAddress(usdcMint, buyer);
      const sellerNftAccount = await getAssociatedTokenAddress(nftMint, seller);
      
      // Call cancelIfExpired instruction
      const tx = await this.program.methods
        .cancelIfExpired()
        .accounts({
          escrowState: escrowPda,
          escrowUsdcAccount,
          escrowNftAccount,
          buyerUsdcAccount,
          sellerNftAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      
      console.log('[EscrowProgramService] Cancellation transaction:', tx);
      
      return tx;
    } catch (error) {
      console.error('[EscrowProgramService] Cancellation failed:', error);
      throw new Error(`Failed to cancel escrow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Admin cancel escrow (emergency)
   */
  async adminCancel(
    escrowPda: PublicKey,
    buyer: PublicKey,
    seller: PublicKey,
    nftMint: PublicKey,
    usdcMint: PublicKey
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Admin cancelling escrow:', escrowPda.toString());
      
      // Derive token accounts
      const escrowUsdcAccount = await getAssociatedTokenAddress(usdcMint, escrowPda, true);
      const escrowNftAccount = await getAssociatedTokenAddress(nftMint, escrowPda, true);
      const buyerUsdcAccount = await getAssociatedTokenAddress(usdcMint, buyer);
      const sellerNftAccount = await getAssociatedTokenAddress(nftMint, seller);
      
      // Call adminCancel instruction
      const tx = await this.program.methods
        .adminCancel()
        .accounts({
          escrowState: escrowPda,
          admin: this.adminKeypair.publicKey,
          escrowUsdcAccount,
          escrowNftAccount,
          buyerUsdcAccount,
          sellerNftAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([this.adminKeypair])
        .rpc();
      
      console.log('[EscrowProgramService] Admin cancellation transaction:', tx);
      
      return tx;
    } catch (error) {
      console.error('[EscrowProgramService] Admin cancellation failed:', error);
      throw new Error(`Failed to admin cancel escrow: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

