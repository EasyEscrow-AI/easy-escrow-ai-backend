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
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AssetInfo, AssetType } from './assetValidator';
import * as anchor from '@coral-xyz/anchor';
import { ALTService, createALTService, TransactionSizeEstimate } from './altService';

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

// Metaplex Core program ID for Core NFT transfers
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

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
  
  /** Optional: Use Address Lookup Table for versioned transaction */
  useALT?: boolean;
  
  /** Optional: Address Lookup Table account (if using ALT) */
  lookupTableAccount?: AddressLookupTableAccount;
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
  
  /** Whether this is a versioned transaction (v0) */
  isVersioned?: boolean;
  
  /** Whether Address Lookup Table was used */
  usedALT?: boolean;
  
  /** Size estimate breakdown */
  sizeEstimate?: TransactionSizeEstimate;
}

export class TransactionBuilder {
  private connection: Connection;
  private platformAuthority: Keypair;
  private program: anchor.Program | null = null;
  private cnftService: CnftService;
  private altService: ALTService | null = null;
  
  // Maximum transaction size (Solana limit is 1232 bytes)
  // After extensive optimization (proof trimming, empty swapId), dual cNFT swaps are ~1231 bytes
  // We need to allow up to 1231 bytes while staying under Solana's 1232 byte limit
  private static readonly MAX_TRANSACTION_SIZE = 1232; // Match Solana's actual limit
  
  // Compute unit estimates
  private static readonly BASE_COMPUTE_UNITS = 5000;
  private static readonly TRANSFER_COMPUTE_UNITS = 10000;
  private static readonly CNFT_TRANSFER_COMPUTE_UNITS = 50000;
  
  constructor(connection: Connection, platformAuthority: Keypair, treasuryPda?: PublicKey) {
    this.connection = connection;
    this.platformAuthority = platformAuthority;
    this.cnftService = createCnftService(connection);
    
    // Initialize ALT service if treasury PDA is provided
    if (treasuryPda) {
      const altAddress = process.env.MAINNET_PROD_ALT_ADDRESS || process.env.DEVNET_STAGING_ALT_ADDRESS;
      this.altService = createALTService(connection, {
        platformAuthority: platformAuthority.publicKey,
        treasuryPda,
        lookupTableAddress: altAddress ? new PublicKey(altAddress) : undefined,
      });
    }
    
    console.log('[TransactionBuilder] Initialized with platform authority:', platformAuthority.publicKey.toBase58());
    console.log('[TransactionBuilder] ALT service:', this.altService ? 'enabled' : 'disabled');
  }
  
  /**
   * Get ALT service instance
   */
  getALTService(): ALTService | null {
    return this.altService;
  }
  
  /**
   * Set ALT service (for manual configuration)
   */
  setALTService(altService: ALTService): void {
    this.altService = altService;
    console.log('[TransactionBuilder] ALT service updated');
  }
  
  /**
   * Estimate transaction size for swap inputs
   */
  async estimateSwapTransactionSize(inputs: TransactionBuildInputs): Promise<TransactionSizeEstimate> {
    // Count signers: maker, taker, platform authority
    const numSigners = 3;
    
    // Count accounts (base + cNFT accounts)
    let numAccounts = 15; // Base accounts for atomic swap
    
    const makerSendsCnft = inputs.makerAssets.length > 0 && inputs.makerAssets[0].type === AssetType.CNFT;
    const takerSendsCnft = inputs.takerAssets.length > 0 && inputs.takerAssets[0].type === AssetType.CNFT;
    
    if (makerSendsCnft) numAccounts += 5; // cNFT-specific accounts
    if (takerSendsCnft) numAccounts += 5;
    
    // Estimate instruction data size
    let instructionDataSize = 100; // Base instruction data
    
    // cNFT proof sizes
    let makerCnftProofNodes = 0;
    let takerCnftProofNodes = 0;
    
    if (makerSendsCnft) {
      // Fetch proof to get actual size
      try {
        const params = await this.cnftService.buildTransferParams(
          inputs.makerAssets[0].identifier,
          inputs.makerPubkey,
          inputs.takerPubkey
        );
        makerCnftProofNodes = params.proof.proof?.length || 0;
        numAccounts += makerCnftProofNodes; // Proof nodes are remaining accounts
      } catch (error) {
        // Estimate based on typical tree (14 levels, canopy 11 = 3 nodes)
        makerCnftProofNodes = 3;
      }
    }
    
    if (takerSendsCnft) {
      try {
        const params = await this.cnftService.buildTransferParams(
          inputs.takerAssets[0].identifier,
          inputs.takerPubkey,
          inputs.makerPubkey
        );
        takerCnftProofNodes = params.proof.proof?.length || 0;
        numAccounts += takerCnftProofNodes;
      } catch (error) {
        takerCnftProofNodes = 3;
      }
    }
    
    // Use ALT service for estimation if available
    if (this.altService) {
      return this.altService.estimateTransactionSize({
        numSigners,
        numAccounts,
        instructionDataSize,
        makerCnftProofNodes,
        takerCnftProofNodes,
      });
    }
    
    // Fallback estimation without ALT service
    const signatureSize = 64 * numSigners;
    const accountKeySize = 32 * numAccounts;
    const proofBaseSize = 108; // root + hashes + nonce + index
    const makerProofSize = makerCnftProofNodes > 0 ? proofBaseSize + (32 * makerCnftProofNodes) : 0;
    const takerProofSize = takerCnftProofNodes > 0 ? proofBaseSize + (32 * takerCnftProofNodes) : 0;
    const estimatedSize = signatureSize + 3 + accountKeySize + 4 + instructionDataSize + makerProofSize + takerProofSize;
    
    return {
      estimatedSize,
      maxSize: TransactionBuilder.MAX_TRANSACTION_SIZE,
      willFit: estimatedSize <= TransactionBuilder.MAX_TRANSACTION_SIZE,
      recommendation: estimatedSize <= TransactionBuilder.MAX_TRANSACTION_SIZE ? 'legacy' : 'cannot_fit',
      breakdown: {
        signatures: signatureSize,
        accountKeys: accountKeySize,
        instructions: instructionDataSize,
        proofData: makerProofSize + takerProofSize,
      },
      useALT: false,
    };
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
   * Automatically uses versioned transactions with ALT if needed
   */
  async buildSwapTransaction(inputs: TransactionBuildInputs): Promise<BuiltTransaction> {
    console.log('[TransactionBuilder] Building swap transaction:', {
      swapId: inputs.swapId,
      maker: inputs.makerPubkey.toBase58(),
      taker: inputs.takerPubkey.toBase58(),
      makerAssets: inputs.makerAssets.length,
      takerAssets: inputs.takerAssets.length,
      fee: inputs.platformFeeLamports.toString(),
      useALT: inputs.useALT,
    });
    
    try {
      // Get current nonce value
      const nonceValue = await this.getCurrentNonceValue(inputs.nonceAccountPubkey);
      
      // First, estimate if ALT is needed
      const sizeEstimate = await this.estimateSwapTransactionSize(inputs);
      const shouldUseALT = inputs.useALT || (sizeEstimate.useALT && this.altService);
      
      console.log('[TransactionBuilder] Size estimate:', {
        estimatedSize: sizeEstimate.estimatedSize,
        willFit: sizeEstimate.willFit,
        recommendation: sizeEstimate.recommendation,
        shouldUseALT,
      });
      
      // If ALT is needed and available, build versioned transaction
      if (shouldUseALT && this.altService) {
        const lookupTable = inputs.lookupTableAccount || await this.altService.getPlatformALT();
        
        if (lookupTable) {
          console.log('[TransactionBuilder] Building versioned transaction with ALT');
          return this.buildVersionedSwapTransaction(inputs, nonceValue, lookupTable, sizeEstimate);
        } else {
          console.warn('[TransactionBuilder] ALT not available, falling back to legacy transaction');
        }
      }
      
      // Build legacy transaction
      return this.buildLegacySwapTransaction(inputs, nonceValue, sizeEstimate);
      
    } catch (error) {
      console.error('[TransactionBuilder] Failed to build transaction:', error);
      throw error;
    }
  }
  
  /**
   * Build legacy (non-versioned) swap transaction
   */
  private async buildLegacySwapTransaction(
    inputs: TransactionBuildInputs,
    nonceValue: string,
    sizeEstimate: TransactionSizeEstimate
  ): Promise<BuiltTransaction> {
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
      const hasCnft = inputs.makerAssets.some(a => a.type === AssetType.CNFT) ||
                      inputs.takerAssets.some(a => a.type === AssetType.CNFT);
      
      let errorMessage = `Transaction too large: ${serialized.length} > ${TransactionBuilder.MAX_TRANSACTION_SIZE}`;
      
      if (hasCnft) {
        // Check if ALT would help
        if (this.altService && sizeEstimate.estimatedSizeWithALT && 
            sizeEstimate.estimatedSizeWithALT <= TransactionBuilder.MAX_TRANSACTION_SIZE) {
          errorMessage += '. This transaction could fit using Address Lookup Tables (ALT). ' +
            'Enable ALT support or configure MAINNET_PROD_ALT_ADDRESS environment variable.';
        } else {
          errorMessage += '. cNFT transfers require Merkle proofs which can exceed Solana\'s transaction size limit. ' +
            'This cNFT\'s Merkle tree may have a low canopy depth, requiring more proof data. ' +
            'Try using a different cNFT from a collection with higher canopy depth, or swap NFTs instead of cNFTs.';
        }
      }
      
      throw new Error(errorMessage);
    }
    
    // Estimate compute units
    const estimatedComputeUnits = this.estimateComputeUnits(inputs);
    
    console.log('[TransactionBuilder] Legacy transaction built successfully:', {
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
      isVersioned: false,
      usedALT: false,
      sizeEstimate,
    };
  }
  
  /**
   * Build versioned swap transaction with Address Lookup Table
   */
  private async buildVersionedSwapTransaction(
    inputs: TransactionBuildInputs,
    nonceValue: string,
    lookupTable: AddressLookupTableAccount,
    sizeEstimate: TransactionSizeEstimate
  ): Promise<BuiltTransaction> {
    console.log('[TransactionBuilder] Building versioned transaction with ALT:', lookupTable.key.toBase58());
    
    // Collect all instructions
    const instructions: TransactionInstruction[] = [];
    
    // 1. Add nonce advance instruction (MUST be first)
    instructions.push(this.createNonceAdvanceInstruction(inputs));
    
    // 2. Create any missing ATAs
    const ataInstructions = await this.createMissingATAInstructions(inputs);
    instructions.push(...ataInstructions);
    
    // 3. Add atomic_swap_with_fee program instruction
    const swapInstruction = await this.createAtomicSwapInstruction(inputs);
    instructions.push(swapInstruction);
    
    // Create versioned transaction message with lookup table
    const message = new TransactionMessage({
      payerKey: inputs.takerPubkey,
      recentBlockhash: nonceValue,
      instructions,
    }).compileToV0Message([lookupTable]);
    
    // Create versioned transaction
    const versionedTx = new VersionedTransaction(message);
    
    // Sign with platform authority
    versionedTx.sign([this.platformAuthority]);
    
    // Serialize
    const serialized = versionedTx.serialize();
    const serializedBase64 = Buffer.from(serialized).toString('base64');
    
    // Check size
    if (serialized.length > TransactionBuilder.MAX_TRANSACTION_SIZE) {
      throw new Error(
        `Versioned transaction too large: ${serialized.length} > ${TransactionBuilder.MAX_TRANSACTION_SIZE}. ` +
        'Even with Address Lookup Tables, this transaction exceeds the size limit. ' +
        'The cNFT Merkle proof data is too large for atomic swaps.'
      );
    }
    
    // Estimate compute units
    const estimatedComputeUnits = this.estimateComputeUnits(inputs);
    
    console.log('[TransactionBuilder] Versioned transaction built successfully:', {
      sizeBytes: serialized.length,
      estimatedComputeUnits,
      nonceValue,
      lookupTableAddresses: lookupTable.state.addresses.length,
    });
    
    return {
      serializedTransaction: serializedBase64,
      nonceValue,
      requiredSigners: [inputs.makerPubkey.toBase58(), inputs.takerPubkey.toBase58()],
      sizeBytes: serialized.length,
      estimatedComputeUnits,
      isVersioned: true,
      usedALT: true,
      sizeEstimate,
    };
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
        // Compressed NFT transfers are handled by the atomic swap program via Bubblegum CPI
        // This code path is only for standalone transfers (not atomic swaps)
        // For atomic swaps, use createAtomicSwapInstruction() which properly handles cNFT proofs
        console.log('[TransactionBuilder] cNFT transfer handled by atomic swap program:', asset.identifier);
        // No additional instructions needed here - the atomic swap instruction handles everything
      } else if (asset.type === AssetType.CORE_NFT) {
        // Metaplex Core NFT transfer - handled by the program via mpl-core CPI
        // Core NFTs are single-account assets - the asset address is the NFT mint/ID
        console.log('[TransactionBuilder] Core NFT transfer will be handled by program:', asset.identifier);
        // No additional ATA instructions needed - Core NFTs don't use token accounts
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
    
    // Validate: Single transaction supports 1 NFT per side
    // For bulk swaps with multiple NFTs, use TransactionGroupBuilder (Task 44)
    if (inputs.makerAssets.length > 1) {
      throw new Error(
        `Single transaction supports max 1 NFT from maker (got ${inputs.makerAssets.length}). ` +
        'For bulk swaps, use transaction splitting via TransactionGroupBuilder.'
      );
    }
    if (inputs.takerAssets.length > 1) {
      throw new Error(
        `Single transaction supports max 1 NFT from taker (got ${inputs.takerAssets.length}). ` +
        'For bulk swaps, use transaction splitting via TransactionGroupBuilder.'
      );
    }
    
    // Determine asset types
    // Use explicit string comparison to handle JSON-parsed values robustly
    // JSON from Prisma gives plain strings, which may not match enum directly in all cases
    const getAssetTypeString = (type: any): string => {
      if (typeof type === 'string') return type.toLowerCase();
      return String(type).toLowerCase();
    };
    
    // DEBUG: Log exact types for troubleshooting
    if (inputs.makerAssets.length > 0) {
      const makerType = getAssetTypeString(inputs.makerAssets[0].type);
      console.log('[TransactionBuilder] Maker asset[0] type debug:', {
        rawType: inputs.makerAssets[0].type,
        normalizedType: makerType,
        typeofType: typeof inputs.makerAssets[0].type,
        isNFT: makerType === 'nft',
        isCNFT: makerType === 'cnft',
        isCoreNFT: makerType === 'core_nft',
        assetTypeNFT: AssetType.NFT,
        assetTypeCNFT: AssetType.CNFT,
        assetTypeCoreNFT: AssetType.CORE_NFT,
      });
    }
    if (inputs.takerAssets.length > 0) {
      const takerType = getAssetTypeString(inputs.takerAssets[0].type);
      console.log('[TransactionBuilder] Taker asset[0] type debug:', {
        rawType: inputs.takerAssets[0].type,
        normalizedType: takerType,
        typeofType: typeof inputs.takerAssets[0].type,
        isNFT: takerType === 'nft',
        isCNFT: takerType === 'cnft',
        isCoreNFT: takerType === 'core_nft',
        assetTypeNFT: AssetType.NFT,
        assetTypeCNFT: AssetType.CNFT,
        assetTypeCoreNFT: AssetType.CORE_NFT,
      });
    }
    
    // Use string comparison for robustness (handles JSON-parsed plain strings)
    const makerTypeStr = inputs.makerAssets.length > 0 ? getAssetTypeString(inputs.makerAssets[0].type) : '';
    const takerTypeStr = inputs.takerAssets.length > 0 ? getAssetTypeString(inputs.takerAssets[0].type) : '';
    
    const makerSendsNft = makerTypeStr === 'nft';
    const takerSendsNft = takerTypeStr === 'nft';
    const makerSendsCnft = makerTypeStr === 'cnft';
    const takerSendsCnft = takerTypeStr === 'cnft';
    const makerSendsCoreNft = makerTypeStr === 'core_nft';
    const takerSendsCoreNft = takerTypeStr === 'core_nft';
    
    console.log('[TransactionBuilder] Asset type detection results:', {
      makerSendsNft,
      takerSendsNft,
      makerSendsCnft,
      takerSendsCnft,
      makerSendsCoreNft,
      takerSendsCoreNft,
    });
    
    // Get NFT token accounts (if applicable)
    let makerNftAccount: PublicKey | null = null;
    let takerNftDestination: PublicKey | null = null;
    let takerNftAccount: PublicKey | null = null;
    let makerNftDestination: PublicKey | null = null;
    
    // Get cNFT transfer params (if applicable)
    let makerCnftParams: CnftTransferParams | null = null;
    let takerCnftParams: CnftTransferParams | null = null;
    
    // Get Core NFT asset accounts (if applicable)
    let makerCoreAsset: PublicKey | null = null;
    let takerCoreAsset: PublicKey | null = null;
    // Core NFT collection accounts (required if NFT belongs to a collection)
    let makerCoreCollection: PublicKey | null = null;
    let takerCoreCollection: PublicKey | null = null;
    
    if (makerSendsNft) {
      const nftMint = new PublicKey(inputs.makerAssets[0].identifier);
      makerNftAccount = await getAssociatedTokenAddress(nftMint, inputs.makerPubkey);
      takerNftDestination = await getAssociatedTokenAddress(nftMint, inputs.takerPubkey);
      
      // Validate token account exists and has correct mint
      const makerAccountInfo = await this.connection.getAccountInfo(makerNftAccount);
      if (!makerAccountInfo) {
        throw new Error(
          `Maker NFT token account does not exist: ${makerNftAccount.toBase58()}. ` +
          `The maker must own the NFT with mint ${nftMint.toBase58()} before creating a swap.`
        );
      }
      
      // Verify it's a token account (owned by Token Program)
      if (!makerAccountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
        throw new Error(
          `Invalid token account: ${makerNftAccount.toBase58()} is not owned by Token Program. ` +
          `Owner: ${makerAccountInfo.owner.toBase58()}`
        );
      }
      
      // Parse token account to verify mint matches
      try {
        const { getAccount } = await import('@solana/spl-token');
        const tokenAccount = await getAccount(this.connection, makerNftAccount);
        if (!tokenAccount.mint.equals(nftMint)) {
          throw new Error(
            `Token account mint mismatch: account ${makerNftAccount.toBase58()} has mint ${tokenAccount.mint.toBase58()}, ` +
            `but expected ${nftMint.toBase58()}`
          );
        }
        if (tokenAccount.amount !== BigInt(1)) {
          throw new Error(
            `Invalid NFT amount: token account has ${tokenAccount.amount} tokens, expected 1 for NFT`
          );
        }
        if (!tokenAccount.owner.equals(inputs.makerPubkey)) {
          throw new Error(
            `Token account owner mismatch: account owned by ${tokenAccount.owner.toBase58()}, ` +
            `but maker is ${inputs.makerPubkey.toBase58()}`
          );
        }
      } catch (error: any) {
        if (error.message.includes('InvalidAccountOwner') || error.message.includes('could not find account')) {
          throw new Error(
            `Maker NFT token account does not exist or is invalid: ${makerNftAccount.toBase58()}. ` +
            `Error: ${error.message}`
          );
        }
        throw error;
      }
    } else if (makerSendsCnft) {
      makerCnftParams = await this.cnftService.buildTransferParams(
        inputs.makerAssets[0].identifier,
        inputs.makerPubkey,
        inputs.takerPubkey
      );
      
      // Pre-flight check: Estimate transaction size based on proof length
      const proofLength = makerCnftParams.proof.proof?.length || 0;
      const estimatedProofBytes = proofLength * 32 + 32 + 32 + 32 + 8 + 4; // proof nodes + root + dataHash + creatorHash + nonce + index
      const baseTransactionSize = 900; // Approximate base size without proof
      const estimatedSize = baseTransactionSize + estimatedProofBytes;
      
      // Calculate estimated size with ALT (saves ~500-600 bytes by compressing account addresses)
      const altSavings = this.altService ? 526 : 0; // Approximate ALT savings
      const estimatedSizeWithALT = estimatedSize - altSavings;
      const hasALT = this.altService !== null;
      
      console.log(`[TransactionBuilder] cNFT proof size estimate: ${proofLength} nodes, ~${estimatedProofBytes} bytes, total ~${estimatedSize} bytes`);
      console.log(`[TransactionBuilder] ALT available: ${hasALT}, size with ALT: ~${estimatedSizeWithALT} bytes`);
      
      // Only reject if too large even WITH ALT
      const effectiveSize = hasALT ? estimatedSizeWithALT : estimatedSize;
      if (effectiveSize > TransactionBuilder.MAX_TRANSACTION_SIZE) {
        throw new Error(
          `cNFT transaction would be too large (~${estimatedSize} bytes${hasALT ? `, ~${estimatedSizeWithALT} with ALT` : ''}, limit: ${TransactionBuilder.MAX_TRANSACTION_SIZE}). ` +
          `This cNFT's Merkle tree has ${proofLength} proof nodes (low canopy depth). ` +
          `Please use a different cNFT from a collection with higher canopy depth, or use a regular SPL NFT instead.`
        );
      }
    } else if (makerSendsCoreNft) {
      // Core NFT - the asset account is the NFT's mint address (which is also its asset address)
      makerCoreAsset = new PublicKey(inputs.makerAssets[0].identifier);
      console.log('[TransactionBuilder] Maker sending Core NFT:', makerCoreAsset.toBase58());
      
      // Fetch collection address if the Core NFT belongs to a collection
      // This is REQUIRED by mpl-core for collection NFTs, otherwise transfer fails with "Missing collection"
      const makerCoreCollectionAddress = await this.fetchCoreNftCollection(inputs.makerAssets[0].identifier);
      if (makerCoreCollectionAddress) {
        makerCoreCollection = new PublicKey(makerCoreCollectionAddress);
        console.log('[TransactionBuilder] Maker Core NFT collection:', makerCoreCollection.toBase58());
      }
    }
    
    if (takerSendsNft) {
      const nftMint = new PublicKey(inputs.takerAssets[0].identifier);
      takerNftAccount = await getAssociatedTokenAddress(nftMint, inputs.takerPubkey);
      makerNftDestination = await getAssociatedTokenAddress(nftMint, inputs.makerPubkey);
      
      // Validate token account exists and has correct mint
      const takerAccountInfo = await this.connection.getAccountInfo(takerNftAccount);
      if (!takerAccountInfo) {
        throw new Error(
          `Taker NFT token account does not exist: ${takerNftAccount.toBase58()}. ` +
          `The taker must own the NFT with mint ${nftMint.toBase58()} before accepting a swap.`
        );
      }
      
      // Verify it's a token account (owned by Token Program)
      if (!takerAccountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
        throw new Error(
          `Invalid token account: ${takerNftAccount.toBase58()} is not owned by Token Program. ` +
          `Owner: ${takerAccountInfo.owner.toBase58()}`
        );
      }
      
      // Parse token account to verify mint matches
      try {
        const { getAccount } = await import('@solana/spl-token');
        const tokenAccount = await getAccount(this.connection, takerNftAccount);
        if (!tokenAccount.mint.equals(nftMint)) {
          throw new Error(
            `Token account mint mismatch: account ${takerNftAccount.toBase58()} has mint ${tokenAccount.mint.toBase58()}, ` +
            `but expected ${nftMint.toBase58()}`
          );
        }
        if (tokenAccount.amount !== BigInt(1)) {
          throw new Error(
            `Invalid NFT amount: token account has ${tokenAccount.amount} tokens, expected 1 for NFT`
          );
        }
        if (!tokenAccount.owner.equals(inputs.takerPubkey)) {
          throw new Error(
            `Token account owner mismatch: account owned by ${tokenAccount.owner.toBase58()}, ` +
            `but taker is ${inputs.takerPubkey.toBase58()}`
          );
        }
      } catch (error: any) {
        if (error.message.includes('InvalidAccountOwner') || error.message.includes('could not find account')) {
          throw new Error(
            `Taker NFT token account does not exist or is invalid: ${takerNftAccount.toBase58()}. ` +
            `Error: ${error.message}`
          );
        }
        throw error;
      }
    } else if (takerSendsCnft) {
      takerCnftParams = await this.cnftService.buildTransferParams(
        inputs.takerAssets[0].identifier,
        inputs.takerPubkey,
        inputs.makerPubkey
      );
      
      // Pre-flight check: Estimate transaction size based on proof length
      const proofLength = takerCnftParams.proof.proof?.length || 0;
      const estimatedProofBytes = proofLength * 32 + 32 + 32 + 32 + 8 + 4; // proof nodes + root + dataHash + creatorHash + nonce + index
      const baseTransactionSize = 900; // Approximate base size without proof
      const estimatedSize = baseTransactionSize + estimatedProofBytes;
      
      // Calculate estimated size with ALT (saves ~500-600 bytes by compressing account addresses)
      const altSavings = this.altService ? 526 : 0; // Approximate ALT savings
      const estimatedSizeWithALT = estimatedSize - altSavings;
      const hasALT = this.altService !== null;
      
      console.log(`[TransactionBuilder] cNFT proof size estimate: ${proofLength} nodes, ~${estimatedProofBytes} bytes, total ~${estimatedSize} bytes`);
      console.log(`[TransactionBuilder] ALT available: ${hasALT}, size with ALT: ~${estimatedSizeWithALT} bytes`);
      
      // Only reject if too large even WITH ALT
      const effectiveSize = hasALT ? estimatedSizeWithALT : estimatedSize;
      if (effectiveSize > TransactionBuilder.MAX_TRANSACTION_SIZE) {
        throw new Error(
          `cNFT transaction would be too large (~${estimatedSize} bytes${hasALT ? `, ~${estimatedSizeWithALT} with ALT` : ''}, limit: ${TransactionBuilder.MAX_TRANSACTION_SIZE}). ` +
          `This cNFT's Merkle tree has ${proofLength} proof nodes (low canopy depth). ` +
          `Please use a different cNFT from a collection with higher canopy depth, or use a regular SPL NFT instead.`
        );
      }
    } else if (takerSendsCoreNft) {
      // Core NFT - the asset account is the NFT's mint address (which is also its asset address)
      takerCoreAsset = new PublicKey(inputs.takerAssets[0].identifier);
      console.log('[TransactionBuilder] Taker sending Core NFT:', takerCoreAsset.toBase58());
      
      // Fetch collection address if the Core NFT belongs to a collection
      // This is REQUIRED by mpl-core for collection NFTs, otherwise transfer fails with "Missing collection"
      const takerCoreCollectionAddress = await this.fetchCoreNftCollection(inputs.takerAssets[0].identifier);
      if (takerCoreCollectionAddress) {
        takerCoreCollection = new PublicKey(takerCoreCollectionAddress);
        console.log('[TransactionBuilder] Taker Core NFT collection:', takerCoreCollection.toBase58());
      }
    }
    
    // Build swap parameters (including cNFT proof data)
    // NOTE: CRITICAL - makerCnftProof and takerCnftProof MUST always be present
    // They are Option<CnftProof> in the program, so we send null when not needed
    const swapParams: any = {
      makerSendsNft,
      takerSendsNft,
      makerSendsCnft,
      takerSendsCnft,
      makerSendsCoreNft,
      takerSendsCoreNft,
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
      // Core NFT accounts (optional, use placeholder if not needed)
      makerCoreAsset: makerCoreAsset || PROGRAM_ID,
      makerCoreCollection: makerCoreCollection || PROGRAM_ID,
      takerCoreAsset: takerCoreAsset || PROGRAM_ID,
      takerCoreCollection: takerCoreCollection || PROGRAM_ID,
      mplCoreProgram: (makerSendsCoreNft || takerSendsCoreNft) ? MPL_CORE_PROGRAM_ID : PROGRAM_ID,
    };
    
    // CRITICAL VALIDATION: Log and verify mplCoreProgram setting
    const shouldUseMplCore = makerSendsCoreNft || takerSendsCoreNft;
    const actualMplCoreProgramId = accounts.mplCoreProgram.toBase58();
    const expectedMplCoreProgramId = shouldUseMplCore ? MPL_CORE_PROGRAM_ID.toBase58() : PROGRAM_ID.toBase58();
    
    console.log('[TransactionBuilder] *** Core NFT Configuration ***');
    console.log('[TransactionBuilder] makerSendsCoreNft:', makerSendsCoreNft);
    console.log('[TransactionBuilder] takerSendsCoreNft:', takerSendsCoreNft);
    console.log('[TransactionBuilder] shouldUseMplCore:', shouldUseMplCore);
    console.log('[TransactionBuilder] MPL_CORE_PROGRAM_ID:', MPL_CORE_PROGRAM_ID.toBase58());
    console.log('[TransactionBuilder] PROGRAM_ID (escrow):', PROGRAM_ID.toBase58());
    console.log('[TransactionBuilder] accounts.mplCoreProgram:', actualMplCoreProgramId);
    
    if (shouldUseMplCore && actualMplCoreProgramId !== MPL_CORE_PROGRAM_ID.toBase58()) {
      throw new Error(
        `CRITICAL BUG: Core NFT detected (maker: ${makerSendsCoreNft}, taker: ${takerSendsCoreNft}) ` +
        `but mplCoreProgram is ${actualMplCoreProgramId} instead of ${MPL_CORE_PROGRAM_ID.toBase58()}`
      );
    }
    
    // Also validate makerCoreAsset and takerCoreAsset
    if (makerSendsCoreNft && !makerCoreAsset) {
      throw new Error(
        `CRITICAL BUG: makerSendsCoreNft is true but makerCoreAsset is null. ` +
        `makerTypeStr: '${makerTypeStr}', rawType: '${inputs.makerAssets[0]?.type}'`
      );
    }
    if (takerSendsCoreNft && !takerCoreAsset) {
      throw new Error(
        `CRITICAL BUG: takerSendsCoreNft is true but takerCoreAsset is null. ` +
        `takerTypeStr: '${takerTypeStr}', rawType: '${inputs.takerAssets[0]?.type}'`
      );
    }
    
    // Add authorized app for zero-fee swaps
    accounts.authorizedApp = inputs.authorizedAppId || null;
    
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
    
    // Check per-side asset count limits
    // Maximum 10 assets per side - bulk swaps use transaction splitting (Task 44)
    const MAX_ASSETS_PER_SIDE = 10;
    
    if (inputs.makerAssets.length > MAX_ASSETS_PER_SIDE) {
      throw new Error(
        `Too many maker assets (${inputs.makerAssets.length}). ` +
        `Maximum is ${MAX_ASSETS_PER_SIDE} per side.`
      );
    }
    
    if (inputs.takerAssets.length > MAX_ASSETS_PER_SIDE) {
      throw new Error(
        `Too many taker assets (${inputs.takerAssets.length}). ` +
        `Maximum is ${MAX_ASSETS_PER_SIDE} per side.`
      );
    }
  }
  
  /**
   * Fetch collection address for a Metaplex Core NFT
   * 
   * Core NFTs that belong to a collection require the collection account
   * to be passed in the transfer instruction. This method fetches the
   * collection address from the NFT's on-chain data via DAS API.
   * 
   * @param assetId - The Core NFT asset ID
   * @returns The collection address or null if NFT is not in a collection
   * @throws Error if DAS API fails (prevents confusing downstream errors)
   */
  private async fetchCoreNftCollection(assetId: string, retryCount = 0): Promise<string | null> {
    const MAX_RETRIES = 2;
    
    try {
      console.log('[TransactionBuilder] Fetching Core NFT collection for:', assetId);
      
      // Use DAS API to get asset data
      const response = await (this.connection as any)._rpcRequest('getAsset', {
        id: assetId,
      });
      
      // Check for JSON-RPC error response (like assetValidator.ts does)
      if (response?.error) {
        const errorMsg = response.error.message || JSON.stringify(response.error);
        console.error('[TransactionBuilder] DAS API returned error:', errorMsg);
        throw new Error(`DAS API error fetching Core NFT ${assetId}: ${errorMsg}`);
      }
      
      if (!response) {
        throw new Error(`No response from DAS API for Core NFT ${assetId}`);
      }
      
      // Handle JSON-RPC wrapper
      const assetData = response.result || response;
      
      if (!assetData) {
        throw new Error(`No asset data returned from DAS API for Core NFT ${assetId}`);
      }
      
      // Check for collection in grouping data
      // DAS API returns collection info in the "grouping" array
      const grouping = assetData.grouping || [];
      const collectionGroup = grouping.find((g: any) => g.group_key === 'collection');
      
      if (collectionGroup && collectionGroup.group_value) {
        console.log('[TransactionBuilder] Found collection:', collectionGroup.group_value);
        return collectionGroup.group_value;
      }
      
      // Also check update_authority structure (alternative format)
      // Some Core NFTs have collection in update_authority
      if (assetData.update_authority?.collection) {
        console.log('[TransactionBuilder] Found collection in update_authority:', assetData.update_authority.collection);
        return assetData.update_authority.collection;
      }
      
      // Successfully fetched data - NFT is genuinely not in a collection
      console.log('[TransactionBuilder] Core NFT is not in a collection (confirmed by DAS API)');
      return null;
      
    } catch (error) {
      console.error(`[TransactionBuilder] Error fetching Core NFT collection (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
      
      // Retry on transient errors (rate limiting, network issues)
      if (retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 500; // 500ms, 1000ms
        console.log(`[TransactionBuilder] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchCoreNftCollection(assetId, retryCount + 1);
      }
      
      // After retries exhausted, throw a clear error
      // This prevents the confusing "Missing collection" error downstream
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to fetch Core NFT collection info for ${assetId} after ${MAX_RETRIES + 1} attempts: ${errorMessage}. ` +
        `Cannot proceed - if this NFT belongs to a collection, the transaction would fail with "Missing collection" error.`
      );
    }
  }
}

/**
 * Create transaction builder instance
 */
export function createTransactionBuilder(
  connection: Connection,
  platformAuthority: Keypair,
  treasuryPda?: PublicKey
): TransactionBuilder {
  return new TransactionBuilder(connection, platformAuthority, treasuryPda);
}

