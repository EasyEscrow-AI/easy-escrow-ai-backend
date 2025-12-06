/**
 * Transaction Builder Service
 * 
 * Constructs complete atomic swap transactions on Solana including:
 * - Durable nonce advancement
 * - NFT and cNFT transfers
 * - SOL transfers
 * - Platform fee collection
 * 
 * Ensures transactions are properly structured, signed, and ready for execution.
 */

import {
  Connection,
  Keypair,
  NonceAccount,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AssetInfo, AssetType } from './assetValidator';
import * as anchor from '@coral-xyz/anchor';

// Load the correct IDL based on environment
const isProduction = process.env.NODE_ENV === 'production';
const idl = isProduction
  ? require('../generated/anchor/escrow-idl-production.json')
  : require('../generated/anchor/escrow-idl-staging.json');

import { CnftService, createCnftService } from './cnftService';
import { CnftTransferParams } from '../types/cnft';
import {
  BUBBLEGUM_PROGRAM_ID,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '../constants/bubblegum';

// Program ID from IDL (used for placeholders)
const PROGRAM_ID = new PublicKey(idl.address);

export interface SwapAsset {
  type: AssetType;
  identifier: string;
  assetInfo?: AssetInfo;
}

export interface TransactionBuildInputs {
  /** Maker (offer creator) public key */
  makerPubkey: PublicKey;
  
  /** Taker (offer acceptor) public key */
  takerPubkey: PublicKey;
  
  /** Assets offered by maker */
  makerAssets: SwapAsset[];
  
  /** SOL amount offered by maker (in lamports) */
  makerSolLamports: bigint;
  
  /** Assets requested by maker (offered by taker) */
  takerAssets: SwapAsset[];
  
  /** SOL amount offered by taker (in lamports) */
  takerSolLamports: bigint;
  
  /** Platform fee in lamports */
  platformFeeLamports: bigint;
  
  /** Durable nonce account public key */
  nonceAccountPubkey: PublicKey;
  
  /** Nonce authority (platform authority) */
  nonceAuthorityPubkey: PublicKey;
  
  /** Unique swap identifier */
  swapId: string;
  
  /** Treasury PDA for fee collection */
  treasuryPDA: PublicKey;
  
  /** Escrow program ID */
  programId: PublicKey;
  
  /** Optional: Authorized app public key for zero-fee swaps */
  authorizedAppId?: PublicKey;
}

export interface BuiltTransaction {
  /** Serialized transaction (base64) */
  serializedTransaction: string;
  
  /** Current nonce value used */
  nonceValue: string;
  
  /** Required signers (partial signatures already applied) */
  requiredSigners: string[];
  
  /** Transaction size in bytes */
  sizeBytes: number;
  
  /** Estimated compute units */
  estimatedComputeUnits: number;
}

export class TransactionBuilder {
  private connection: Connection;
  private platformAuthority: Keypair;
  private program: anchor.Program | null = null;
  private cnftService: CnftService;
  
  // Maximum transaction size (Solana limit is 1232 bytes)
  // After extensive optimization (proof trimming, empty swapId), dual cNFT swaps are ~1231 bytes
  // We need to allow up to 1231 bytes while staying under Solana's 1232 byte limit
  private static readonly MAX_TRANSACTION_SIZE = 1232; // Match Solana's actual limit
  
  // Compute unit estimates
  private static readonly BASE_COMPUTE_UNITS = 5000;
  private static readonly TRANSFER_COMPUTE_UNITS = 10000;
  private static readonly CNFT_TRANSFER_COMPUTE_UNITS = 50000;
  
  constructor(connection: Connection, platformAuthority: Keypair) {
    this.connection = connection;
    this.platformAuthority = platformAuthority;
    this.cnftService = createCnftService(connection);
    
    console.log('[TransactionBuilder] Initialized with platform authority:', platformAuthority.publicKey.toBase58());
  }
  
  /**
   * Get Anchor program instance
   * Validates that programId matches IDL's address to prevent DeclaredProgramIdMismatch
   */
  private getProgram(programId: PublicKey): anchor.Program {
    const idlProgramId = new PublicKey(PROGRAM_ID);
    
    // Validate programId matches IDL address
    if (!programId.equals(idlProgramId)) {
      throw new Error(
        `Program ID mismatch!\n` +
        `  Expected (from IDL): ${idlProgramId.toBase58()}\n` +
        `  Received (from input): ${programId.toBase58()}\n` +
        `This usually means:\n` +
        `  1. Wrong IDL file is being used (staging vs production)\n` +
        `  2. Environment config has wrong program ID\n` +
        `  3. IDL needs to be regenerated after program build\n` +
        `Fix: Ensure the correct IDL file is used for this environment.`
      );
    }
    
    // Use cached program instance if available
    if (!this.program) {
      const wallet = new anchor.Wallet(this.platformAuthority);
      const provider = new anchor.AnchorProvider(this.connection, wallet, { commitment: 'confirmed' });
      this.program = new anchor.Program(idl as anchor.Idl, provider);
    }
    return this.program;
  }
  
  /**
   * Build complete atomic swap transaction using escrow program
   */
  async buildSwapTransaction(inputs: TransactionBuildInputs): Promise<BuiltTransaction> {
    console.log('[TransactionBuilder] Building swap transaction:', {
      swapId: inputs.swapId,
      maker: inputs.makerPubkey.toBase58(),
      taker: inputs.takerPubkey.toBase58(),
      makerAssets: inputs.makerAssets.length,
      takerAssets: inputs.takerAssets.length,
      fee: inputs.platformFeeLamports.toString(),
    });
    
    try {
      // Get current nonce value
      const nonceValue = await this.getCurrentNonceValue(inputs.nonceAccountPubkey);
      
      // Create transaction
      const transaction = new Transaction();
      
      // Set transaction properties
      transaction.recentBlockhash = nonceValue;
      transaction.feePayer = inputs.takerPubkey; // Taker pays transaction fee
      
      // 1. Add nonce advance instruction (MUST be first)
      transaction.add(this.createNonceAdvanceInstruction(inputs));
      
      // 2. Create any missing ATAs (must be done before program call)
      const ataInstructions = await this.createMissingATAInstructions(inputs);
      ataInstructions.forEach((ix) => transaction.add(ix));
      
      // 3. Add atomic_swap_with_fee program instruction
      // This replaces all manual transfers and fee collection
      const swapInstruction = await this.createAtomicSwapInstruction(inputs);
      transaction.add(swapInstruction);
      
      // Partially sign with platform authority (for nonce advance)
      transaction.partialSign(this.platformAuthority);
      
      // Serialize transaction
      const serialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      
      const serializedBase64 = serialized.toString('base64');
      
      // Check transaction size
      if (serialized.length > TransactionBuilder.MAX_TRANSACTION_SIZE) {
        throw new Error(
          `Transaction size (${serialized.length} bytes) exceeds maximum (${TransactionBuilder.MAX_TRANSACTION_SIZE} bytes)`
        );
      }
      
      // Estimate compute units
      const estimatedComputeUnits = this.estimateComputeUnits(inputs);
      
      console.log('[TransactionBuilder] Transaction built successfully:', {
        sizeBytes: serialized.length,
        estimatedComputeUnits,
        nonceValue,
      });
      
      return {
        serializedTransaction: serializedBase64,
        nonceValue,
        requiredSigners: [inputs.makerPubkey.toBase58(), inputs.takerPubkey.toBase58()],
        sizeBytes: serialized.length,
        estimatedComputeUnits,
      };
    } catch (error) {
      console.error('[TransactionBuilder] Failed to build transaction:', error);
      throw error;
    }
  }
  
  /**
   * Create nonce advance instruction (must be first in transaction)
   */
  private createNonceAdvanceInstruction(inputs: TransactionBuildInputs): TransactionInstruction {
    return SystemProgram.nonceAdvance({
      noncePubkey: inputs.nonceAccountPubkey,
      authorizedPubkey: inputs.nonceAuthorityPubkey,
    });
  }
  
  /**
   * Create instructions for missing associated token accounts
   */
  private async createMissingATAInstructions(inputs: TransactionBuildInputs): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];
    
    // Check maker NFTs → taker needs ATAs
    for (const asset of inputs.makerAssets) {
      if (asset.type === AssetType.NFT) {
        const mint = new PublicKey(asset.identifier);
        const ata = await getAssociatedTokenAddress(mint, inputs.takerPubkey);
        
        const accountInfo = await this.connection.getAccountInfo(ata);
        if (!accountInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              inputs.takerPubkey, // Payer
              ata,
              inputs.takerPubkey, // Owner
              mint
            )
          );
        }
      }
    }
    
    // Check taker NFTs → maker needs ATAs
    for (const asset of inputs.takerAssets) {
      if (asset.type === AssetType.NFT) {
        const mint = new PublicKey(asset.identifier);
        const ata = await getAssociatedTokenAddress(mint, inputs.makerPubkey);
        
        const accountInfo = await this.connection.getAccountInfo(ata);
        if (!accountInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              inputs.takerPubkey, // Payer (taker always pays)
              ata,
              inputs.makerPubkey, // Owner
              mint
            )
          );
        }
      }
    }
    
    return instructions;
  }
  
  /**
   * Create asset transfer instructions
   */
  private async createAssetTransferInstructions(
    assets: SwapAsset[],
    fromPubkey: PublicKey,
    toPubkey: PublicKey
  ): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];
    
    for (const asset of assets) {
      if (asset.type === AssetType.NFT) {
        // Standard NFT transfer using SPL Token
        const mint = new PublicKey(asset.identifier);
        const fromATA = await getAssociatedTokenAddress(mint, fromPubkey);
        const toATA = await getAssociatedTokenAddress(mint, toPubkey);
        
        instructions.push(
          createTransferInstruction(
            fromATA,
            toATA,
            fromPubkey,
            1 // NFTs always transfer amount of 1
          )
        );
      } else if (asset.type === AssetType.CNFT) {
        // Compressed NFT transfer (placeholder - requires Bubblegum program integration)
        // TODO: Implement actual cNFT transfer using Metaplex Bubblegum
        console.warn('[TransactionBuilder] cNFT transfer not yet implemented:', asset.identifier);
        
        // For now, throw error to indicate unsupported
        throw new Error('cNFT transfers not yet implemented');
      }
    }
    
    return instructions;
  }
  
  /**
   * Create atomic_swap_with_fee program instruction
   * This replaces all manual transfers and fee collection with a single program call
   */
  private async createAtomicSwapInstruction(inputs: TransactionBuildInputs): Promise<TransactionInstruction> {
    console.log('[TransactionBuilder] Creating atomic_swap_with_fee instruction');
    
    // Validate: Program only supports 1 NFT per side
    if (inputs.makerAssets.length > 1) {
      throw new Error('Program only supports 1 NFT from maker. Use multiple transactions for multi-NFT swaps.');
    }
    if (inputs.takerAssets.length > 1) {
      throw new Error('Program only supports 1 NFT from taker. Use multiple transactions for multi-NFT swaps.');
    }
    
    // Determine asset types
    const makerSendsNft = inputs.makerAssets.length > 0 && inputs.makerAssets[0].type === AssetType.NFT;
    const takerSendsNft = inputs.takerAssets.length > 0 && inputs.takerAssets[0].type === AssetType.NFT;
    const makerSendsCnft = inputs.makerAssets.length > 0 && inputs.makerAssets[0].type === AssetType.CNFT;
    const takerSendsCnft = inputs.takerAssets.length > 0 && inputs.takerAssets[0].type === AssetType.CNFT;
    
    // Get NFT token accounts (if applicable)
    let makerNftAccount: PublicKey | null = null;
    let takerNftDestination: PublicKey | null = null;
    let takerNftAccount: PublicKey | null = null;
    let makerNftDestination: PublicKey | null = null;
    
    // Get cNFT transfer params (if applicable)
    let makerCnftParams: CnftTransferParams | null = null;
    let takerCnftParams: CnftTransferParams | null = null;
    
    if (makerSendsNft) {
      const nftMint = new PublicKey(inputs.makerAssets[0].identifier);
      makerNftAccount = await getAssociatedTokenAddress(nftMint, inputs.makerPubkey);
      takerNftDestination = await getAssociatedTokenAddress(nftMint, inputs.takerPubkey);
    } else if (makerSendsCnft) {
      makerCnftParams = await this.cnftService.buildTransferParams(
        inputs.makerAssets[0].identifier,
        inputs.makerPubkey,
        inputs.takerPubkey
      );
    }
    
    if (takerSendsNft) {
      const nftMint = new PublicKey(inputs.takerAssets[0].identifier);
      takerNftAccount = await getAssociatedTokenAddress(nftMint, inputs.takerPubkey);
      makerNftDestination = await getAssociatedTokenAddress(nftMint, inputs.makerPubkey);
    } else if (takerSendsCnft) {
      takerCnftParams = await this.cnftService.buildTransferParams(
        inputs.takerAssets[0].identifier,
        inputs.takerPubkey,
        inputs.makerPubkey
      );
    }
    
    // Build swap parameters (including cNFT proof data)
    // NOTE: CRITICAL - makerCnftProof and takerCnftProof MUST always be present
    // They are Option<CnftProof> in the program, so we send null when not needed
    const swapParams: any = {
      makerSendsNft,
      takerSendsNft,
      makerSendsCnft,
      takerSendsCnft,
      makerSolAmount: new anchor.BN(inputs.makerSolLamports.toString()),
      takerSolAmount: new anchor.BN(inputs.takerSolLamports.toString()),
      platformFee: new anchor.BN(inputs.platformFeeLamports.toString()),
      swapId: inputs.swapId,
      // ALWAYS include proof fields (as null if not applicable)
      makerCnftProof: makerCnftParams ? this.serializeCnftProof(makerCnftParams.proof) : null,
      takerCnftProof: takerCnftParams ? this.serializeCnftProof(takerCnftParams.proof) : null,
    }
    
    // Build accounts object
    // Note: Anchor requires ALL optional accounts to be provided, even if unused
    // Use PROGRAM_ID (from IDL) as placeholder for unused accounts to match what program expects
    const accounts: any = {
      maker: inputs.makerPubkey,
      taker: inputs.takerPubkey,
      platformAuthority: this.platformAuthority.publicKey,
      treasury: inputs.treasuryPDA,
      makerNftAccount: makerNftAccount || PROGRAM_ID,
      takerNftDestination: takerNftDestination || PROGRAM_ID,
      takerNftAccount: takerNftAccount || PROGRAM_ID,
      makerNftDestination: makerNftDestination || PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      // cNFT-specific accounts (optional, use placeholder if not needed)
      makerMerkleTree: makerCnftParams?.treeAddress || PROGRAM_ID,
      makerTreeAuthority: makerCnftParams?.treeAuthorityAddress || PROGRAM_ID,
      takerMerkleTree: takerCnftParams?.treeAddress || PROGRAM_ID,
      takerTreeAuthority: takerCnftParams?.treeAuthorityAddress || PROGRAM_ID,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      // Authorized app account for zero-fee swaps (use placeholder if not provided)
      authorizedApp: inputs.authorizedAppId || PROGRAM_ID,
    };
    
    console.log('[TransactionBuilder] Swap params:', {
      ...swapParams,
      // Truncate proof data for logging
      makerCnftProof: makerCnftParams ? '[proof data]' : undefined,
      takerCnftProof: takerCnftParams ? '[proof data]' : undefined,
    });
    console.log('[TransactionBuilder] Accounts:', accounts);
    
    // Get program instance
    const program = this.getProgram(inputs.programId);
    
    // Collect remaining accounts (proof nodes for cNFT verification)
    const remainingAccounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = [];
    
    if (makerCnftParams && makerCnftParams.proof && makerCnftParams.proof.proof) {
      console.log('[TransactionBuilder] Adding', makerCnftParams.proof.proof.length, 'maker proof nodes as remaining accounts');
      for (let i = 0; i < makerCnftParams.proof.proof.length; i++) {
        const proofNode = makerCnftParams.proof.proof[i];
        // Convert 32-byte array to PublicKey
        const proofNodePubkey = new PublicKey(proofNode);
        remainingAccounts.push({
          pubkey: proofNodePubkey,
          isSigner: false,
          isWritable: false,
        });
        console.log(`  Proof node ${i + 1}:`, proofNodePubkey.toBase58());
      }
    }
    
    if (takerCnftParams && takerCnftParams.proof && takerCnftParams.proof.proof) {
      console.log('[TransactionBuilder] Adding', takerCnftParams.proof.proof.length, 'taker proof nodes as remaining accounts');
      for (let i = 0; i < takerCnftParams.proof.proof.length; i++) {
        const proofNode = takerCnftParams.proof.proof[i];
        const proofNodePubkey = new PublicKey(proofNode);
        remainingAccounts.push({
          pubkey: proofNodePubkey,
          isSigner: false,
          isWritable: false,
        });
        console.log(`  Proof node ${i + 1}:`, proofNodePubkey.toBase58());
      }
    }
    
    // Build instruction with remaining accounts
    let instructionBuilder = program.methods
      .atomicSwapWithFee(swapParams)
      .accounts(accounts);
    
    // Add remaining accounts if any
    if (remainingAccounts.length > 0) {
      instructionBuilder = instructionBuilder.remainingAccounts(remainingAccounts);
      console.log('[TransactionBuilder] Added', remainingAccounts.length, 'remaining accounts (proof nodes)');
    }
    
    const instruction = await instructionBuilder.instruction();
    
    console.log('[TransactionBuilder] atomic_swap_with_fee instruction created');
    
    return instruction;
  }
  
  /**
   * Serialize cNFT proof for program instruction
   */
  private serializeCnftProof(proof: any): any {
    return {
      root: Array.from(proof.root),
      dataHash: Array.from(proof.dataHash),
      creatorHash: Array.from(proof.creatorHash),
      nonce: new anchor.BN(proof.nonce.toString()),
      index: proof.index,
      proof: proof.proof ? proof.proof.map((node: any) => Array.from(node)) : [], // Merkle path
    };
  }
  
  /**
   * Get current nonce value from nonce account
   */
  private async getCurrentNonceValue(nonceAccountPubkey: PublicKey): Promise<string> {
    const accountInfo = await this.connection.getAccountInfo(nonceAccountPubkey);
    
    if (!accountInfo) {
      throw new Error(`Nonce account ${nonceAccountPubkey.toBase58()} not found`);
    }
    
    // Parse nonce account data using Solana's NonceAccount parser
    // The nonce account stores the blockhash that should be used for durable transactions
    const nonceAccount = NonceAccount.fromAccountData(accountInfo.data);
    
    // Return the stored blockhash (not the nonce value!)
    return nonceAccount.nonce;
  }
  
  /**
   * Estimate compute units for transaction
   */
  private estimateComputeUnits(inputs: TransactionBuildInputs): number {
    let units = TransactionBuilder.BASE_COMPUTE_UNITS;
    
    // NFT transfers
    const nftCount = inputs.makerAssets.filter((a) => a.type === AssetType.NFT).length +
      inputs.takerAssets.filter((a) => a.type === AssetType.NFT).length;
    units += nftCount * TransactionBuilder.TRANSFER_COMPUTE_UNITS;
    
    // cNFT transfers (more expensive)
    const cnftCount = inputs.makerAssets.filter((a) => a.type === AssetType.CNFT).length +
      inputs.takerAssets.filter((a) => a.type === AssetType.CNFT).length;
    units += cnftCount * TransactionBuilder.CNFT_TRANSFER_COMPUTE_UNITS;
    
    // SOL transfers
    if (inputs.makerSolLamports > BigInt(0)) {
      units += 1000;
    }
    if (inputs.takerSolLamports > BigInt(0)) {
      units += 1000;
    }
    
    // Fee collection
    units += 1000;
    
    return units;
  }
  
  /**
   * Validate transaction inputs
   */
  validateInputs(inputs: TransactionBuildInputs): void {
    if (!inputs.makerPubkey) {
      throw new Error('Maker public key is required');
    }
    
    if (!inputs.takerPubkey) {
      throw new Error('Taker public key is required');
    }
    
    if (inputs.makerPubkey.equals(inputs.takerPubkey)) {
      throw new Error('Maker and taker cannot be the same');
    }
    
    if (inputs.makerAssets.length === 0 && inputs.makerSolLamports === BigInt(0)) {
      throw new Error('Maker must offer at least one asset or SOL');
    }
    
    if (inputs.takerAssets.length === 0 && inputs.takerSolLamports === BigInt(0)) {
      throw new Error('Taker must offer at least one asset or SOL');
    }
    
    if (inputs.platformFeeLamports < BigInt(0)) {
      throw new Error('Platform fee cannot be negative');
    }
    
    // Check total asset count (to prevent oversized transactions)
    const totalAssets = inputs.makerAssets.length + inputs.takerAssets.length;
    if (totalAssets > 10) {
      throw new Error(`Too many assets (${totalAssets}). Maximum is 10 per swap.`);
    }
  }
}

/**
 * Create transaction builder instance
 */
export function createTransactionBuilder(
  connection: Connection,
  platformAuthority: Keypair
): TransactionBuilder {
  return new TransactionBuilder(connection, platformAuthority);
}

