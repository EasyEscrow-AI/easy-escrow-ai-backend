/**
 * Escrow Program Service
 * 
 * Handles interactions with the deployed Anchor escrow program on Solana.
 * Provides methods to call program instructions for settlement and cancellation.
 */

import { AnchorProvider, Program, BN, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config';
import { Escrow } from '../generated/anchor/escrow';
import escrowIdl from '../generated/anchor/escrow-idl.json';
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
    
    // Create wallet wrapper
    const wallet = new Wallet(this.adminKeypair);
    
    // Create provider
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
    // Note: In Anchor v0.32.1, Program constructor takes (idl, provider)
    // The programId is taken from the IDL's address field
    // We verify it matches our config
    this.program = new Program<Escrow>(
      escrowIdl as any,
      this.provider
    );
    
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
   * Initialize escrow agreement on-chain
   * Creates the escrow PDA account with agreement details
   * 
   * Note: The buyer should call this and pay for the account creation rent
   */
  async initAgreement(
    escrowId: BN,
    buyer: PublicKey,
    seller: PublicKey,
    nftMint: PublicKey,
    usdcAmount: BN,
    expiryTimestamp: BN
  ): Promise<{pda: PublicKey; txId: string}> {
    try {
      console.log('[EscrowProgramService] Initializing escrow agreement:', {
        escrowId: escrowId.toString(),
        buyer: buyer.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
        usdcAmount: usdcAmount.toString(),
        expiryTimestamp: expiryTimestamp.toString(),
      });
      
      // Derive escrow PDA
      const [escrowPda] = this.deriveEscrowPDA(escrowId);
      console.log('[EscrowProgramService] Escrow PDA:', escrowPda.toString());
      
      // Call init_agreement instruction
      // Note: Admin pays for account creation rent, but buyer field must be the actual buyer
      // for proper validation during settlement
      
      // Build instruction manually to bypass Anchor's simulation
      console.log('[EscrowProgramService] Building instruction with accounts:', {
        escrowState: escrowPda.toString(),
        buyer: buyer.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
        admin: this.adminKeypair.publicKey.toString(),
      });
      
      const instruction = await this.program.methods
        .initAgreement(escrowId, usdcAmount, expiryTimestamp)
        .accountsStrict({
          escrowState: escrowPda,
          buyer: buyer, // Actual buyer address (important for settlement constraints!)
          seller,
          nftMint,
          admin: this.adminKeypair.publicKey,
          systemProgram: SystemProgram.programId, // System program
        })
        .instruction();
      
      console.log('[EscrowProgramService] Instruction built, inspecting account metas:');
      instruction.keys.forEach((key, idx) => {
        console.log(`  Account ${idx}: ${key.pubkey.toString()} - isSigner: ${key.isSigner}, isWritable: ${key.isWritable}`);
      });
      
      // FIX: Manually set buyer and seller as NON-signers (Anchor bug workaround)
      // The buyer and seller accounts should NOT be signers according to the on-chain program
      instruction.keys.forEach((key) => {
        if (key.pubkey.equals(buyer) || key.pubkey.equals(seller)) {
          console.log(`[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`);
          key.isSigner = false;
        }
      });
      
      console.log('[EscrowProgramService] After fix, account metas:');
      instruction.keys.forEach((key, idx) => {
        console.log(`  Account ${idx}: ${key.pubkey.toString()} - isSigner: ${key.isSigner}, isWritable: ${key.isWritable}`);
      });
      
      // Create transaction with instruction
      const transaction = new (await import('@solana/web3.js')).Transaction().add(instruction);
      
      // Sign with admin only
      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      transaction.sign(this.adminKeypair);
      
      console.log('[EscrowProgramService] Transaction signed by admin, sending to network...');
      
      // Send signed transaction with skipPreflight to bypass simulation
      const txId = await this.provider.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: true }
      );
      
      console.log('[EscrowProgramService] Escrow initialized:', {
        pda: escrowPda.toString(),
        txId: txId,
      });
      
      return { pda: escrowPda, txId: txId };
    } catch (error) {
      console.error('[EscrowProgramService] Failed to initialize agreement:', error);
      throw new Error(`Failed to initialize escrow agreement: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Deposit NFT into escrow
   * Called by the seller to deposit their NFT into the escrow PDA
   */
  async depositNft(
    escrowPda: PublicKey,
    seller: PublicKey,
    nftMint: PublicKey
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Depositing NFT into escrow:', {
        escrowPda: escrowPda.toString(),
        seller: seller.toString(),
        nftMint: nftMint.toString(),
      });
      
      // Get escrow ID from PDA
      const escrowId = await this.getEscrowIdFromPDA(escrowPda);
      
      // Derive seller's NFT account
      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        seller
      );
      
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
          console.log(`[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`);
          key.isSigner = false;
        }
      });
      
      // Create and sign transaction
      const { Transaction } = await import('@solana/web3.js');
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      transaction.sign(this.adminKeypair);
      
      // Send transaction
      const txId = await this.provider.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: true }
      );
      
      console.log('[EscrowProgramService] NFT deposited, tx:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to deposit NFT:', error);
      throw new Error(`Failed to deposit NFT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Deposit USDC into escrow
   * Called by the buyer to deposit USDC into the escrow PDA
   */
  async depositUsdc(
    escrowPda: PublicKey,
    buyer: PublicKey,
    usdcMint: PublicKey
  ): Promise<string> {
    try {
      console.log('[EscrowProgramService] Depositing USDC into escrow:', {
        escrowPda: escrowPda.toString(),
        buyer: buyer.toString(),
        usdcMint: usdcMint.toString(),
      });
      
      // Get escrow ID from PDA
      const escrowId = await this.getEscrowIdFromPDA(escrowPda);
      
      // Derive buyer's USDC account
      const buyerUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        buyer
      );
      
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
      const instruction = await this.program.methods
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
      instruction.keys.forEach((key) => {
        if (key.pubkey.equals(buyer)) {
          console.log(`[EscrowProgramService] Fixing: Setting ${key.pubkey.toString()} isSigner to false`);
          key.isSigner = false;
        }
      });
      
      // Create and sign transaction
      const { Transaction } = await import('@solana/web3.js');
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = this.adminKeypair.publicKey;
      transaction.recentBlockhash = (await this.provider.connection.getLatestBlockhash()).blockhash;
      transaction.sign(this.adminKeypair);
      
      // Send transaction
      const txId = await this.provider.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: true }
      );
      
      console.log('[EscrowProgramService] USDC deposited, tx:', txId);
      return txId;
    } catch (error) {
      console.error('[EscrowProgramService] Failed to deposit USDC:', error);
      throw new Error(`Failed to deposit USDC: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        seller
      );
      
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
      
      // Create unsigned transaction
      const { Transaction } = await import('@solana/web3.js');
      const transaction = new Transaction().add(instruction);
      
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
      throw new Error(`Failed to build deposit NFT transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      
      // Derive buyer's USDC account
      const buyerUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        buyer
      );
      
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
      const instruction = await this.program.methods
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
      
      // Create unsigned transaction
      const { Transaction } = await import('@solana/web3.js');
      const transaction = new Transaction().add(instruction);
      
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
      throw new Error(`Failed to build deposit USDC transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      
      // Ensure buyer's NFT ATA exists
      const buyerNftAccountInfo = await this.provider.connection.getAccountInfo(buyerNftAccount);
      if (!buyerNftAccountInfo) {
        console.log('[EscrowProgramService] Creating buyer NFT ATA:', buyerNftAccount.toString());
        
        const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
        const createAtaIx = createAssociatedTokenAccountInstruction(
          this.adminKeypair.publicKey, // payer
          buyerNftAccount, // ata
          buyer, // owner
          nftMint // mint
        );
        
        const { Transaction, sendAndConfirmTransaction } = await import('@solana/web3.js');
        const createAtaTx = new Transaction().add(createAtaIx);
        await sendAndConfirmTransaction(
          this.provider.connection,
          createAtaTx,
          [this.adminKeypair]
        );
        
        console.log('[EscrowProgramService] Buyer NFT ATA created successfully');
      } else {
        console.log('[EscrowProgramService] Buyer NFT ATA already exists');
      }
      
      // Call settle instruction
      // Note: In Anchor v0.32.1, we need to use accountsPartial or cast to bypass strict typing
      // The escrowState PDA is validated on-chain against the derived address
      const tx = await this.program.methods
        .settle()
        .accountsPartial({
          escrowState: escrowPda,
          escrowUsdcAccount,
          escrowNftAccount,
          sellerUsdcAccount,
          buyerNftAccount,
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
        .accountsPartial({
          escrowState: escrowPda,
          escrowUsdcAccount,
          escrowNftAccount,
          buyerUsdcAccount,
          sellerNftAccount,
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
        .accountsPartial({
          escrowState: escrowPda,
          admin: this.adminKeypair.publicKey,
          escrowUsdcAccount,
          escrowNftAccount,
          buyerUsdcAccount,
          sellerNftAccount,
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

