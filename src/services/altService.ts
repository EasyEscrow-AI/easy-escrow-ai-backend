/**
 * Address Lookup Table (ALT) Service
 * 
 * Manages Address Lookup Tables for optimizing transaction sizes.
 * ALTs allow compressing 32-byte addresses into 1-byte indices,
 * enabling cNFT swaps that would otherwise exceed Solana's 1232-byte limit.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  AddressLookupTableProgram,
  AddressLookupTableAccount,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  BUBBLEGUM_PROGRAM_ID,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '../constants/bubblegum';

// Load the correct IDL based on environment
const isProduction = process.env.NODE_ENV === 'production';
const idl = isProduction
  ? require('../generated/anchor/escrow-idl-production.json')
  : require('../generated/anchor/escrow-idl-staging.json');

const PROGRAM_ID = new PublicKey(idl.address);

export interface ALTConfig {
  /** Platform authority for deriving treasury PDA */
  platformAuthority: PublicKey;
  /** Treasury PDA address */
  treasuryPda: PublicKey;
  /** Pre-created ALT address (if exists) */
  lookupTableAddress?: PublicKey;
}

export interface TransactionSizeEstimate {
  /** Estimated transaction size in bytes */
  estimatedSize: number;
  /** Maximum transaction size (1232) */
  maxSize: number;
  /** Whether transaction will fit in legacy format */
  willFit: boolean;
  /** Recommendation for transaction type */
  recommendation: 'legacy' | 'versioned' | 'cannot_fit';
  /** Size breakdown by component */
  breakdown: {
    signatures: number;
    accountKeys: number;
    instructions: number;
    proofData: number;
  };
  /** Whether ALT should be used */
  useALT: boolean;
  /** Estimated size with ALT */
  estimatedSizeWithALT?: number;
}

export class ALTService {
  private connection: Connection;
  private config: ALTConfig;
  private cachedLookupTable: AddressLookupTableAccount | null = null;
  private cacheTimestamp: number = 0;
  private static readonly CACHE_TTL_MS = 60000; // 1 minute cache
  
  // Static addresses that should always be in the ALT
  private static readonly STATIC_ADDRESSES: PublicKey[] = [
    TOKEN_PROGRAM_ID,
    SystemProgram.programId,
    BUBBLEGUM_PROGRAM_ID,
    SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    SPL_NOOP_PROGRAM_ID,
    PROGRAM_ID,
  ];
  
  constructor(connection: Connection, config: ALTConfig) {
    this.connection = connection;
    this.config = config;
    console.log('[ALTService] Initialized');
    console.log('[ALTService] Platform Authority:', config.platformAuthority.toBase58());
    console.log('[ALTService] Treasury PDA:', config.treasuryPda.toBase58());
    if (config.lookupTableAddress) {
      console.log('[ALTService] Pre-configured ALT:', config.lookupTableAddress.toBase58());
    }
  }
  
  /**
   * Get all static addresses that should be in the platform ALT
   */
  getStaticAddresses(): PublicKey[] {
    return [
      ...ALTService.STATIC_ADDRESSES,
      this.config.platformAuthority,
      this.config.treasuryPda,
    ];
  }
  
  /**
   * Create a new Address Lookup Table
   */
  async createLookupTable(payer: Keypair): Promise<{
    lookupTableAddress: PublicKey;
    createInstruction: TransactionInstruction;
  }> {
    console.log('[ALTService] Creating new lookup table...');
    
    const recentSlot = await this.connection.getSlot('finalized');
    
    const [createInstruction, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
      authority: payer.publicKey,
      payer: payer.publicKey,
      recentSlot,
    });
    
    console.log('[ALTService] Lookup table address:', lookupTableAddress.toBase58());
    console.log('[ALTService] Recent slot:', recentSlot);
    
    return { lookupTableAddress, createInstruction };
  }
  
  /**
   * Extend a lookup table with additional addresses
   */
  async extendLookupTable(
    lookupTableAddress: PublicKey,
    addresses: PublicKey[],
    authority: Keypair
  ): Promise<TransactionInstruction> {
    console.log(`[ALTService] Extending lookup table with ${addresses.length} addresses`);
    
    // Filter out duplicates
    const addressStrings = addresses.map(a => a.toBase58());
    const uniqueStrings = Array.from(new Set(addressStrings));
    const uniqueAddresses = uniqueStrings.map(s => new PublicKey(s));
    
    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
      lookupTable: lookupTableAddress,
      authority: authority.publicKey,
      payer: authority.publicKey,
      addresses: uniqueAddresses,
    });
    
    return extendInstruction;
  }
  
  /**
   * Get a lookup table account
   */
  async getLookupTable(address: PublicKey): Promise<AddressLookupTableAccount | null> {
    // Check cache
    const now = Date.now();
    if (
      this.cachedLookupTable &&
      this.cacheTimestamp > now - ALTService.CACHE_TTL_MS &&
      this.config.lookupTableAddress?.equals(address)
    ) {
      return this.cachedLookupTable;
    }
    
    console.log('[ALTService] Fetching lookup table:', address.toBase58());
    
    const result = await this.connection.getAddressLookupTable(address);
    
    if (result.value) {
      this.cachedLookupTable = result.value;
      this.cacheTimestamp = now;
      console.log('[ALTService] Lookup table found with', result.value.state.addresses.length, 'addresses');
    } else {
      console.log('[ALTService] Lookup table not found');
    }
    
    return result.value;
  }
  
  /**
   * Get the platform ALT (creates if needed and payer is provided)
   */
  async getPlatformALT(): Promise<AddressLookupTableAccount | null> {
    if (!this.config.lookupTableAddress) {
      console.log('[ALTService] No platform ALT configured');
      return null;
    }
    
    return this.getLookupTable(this.config.lookupTableAddress);
  }
  
  /**
   * Create and initialize a new platform ALT with all static addresses
   * This is a one-time setup operation
   */
  async createAndInitializePlatformALT(payer: Keypair): Promise<PublicKey> {
    console.log('[ALTService] Creating and initializing platform ALT...');
    
    // Step 1: Create the lookup table
    const { lookupTableAddress, createInstruction } = await this.createLookupTable(payer);
    
    // Get static addresses
    const staticAddresses = this.getStaticAddresses();
    console.log('[ALTService] Static addresses to add:', staticAddresses.length);
    
    // Step 2: Create transaction for table creation
    const recentBlockhash = await this.connection.getLatestBlockhash();
    
    const createMessage = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [createInstruction],
    }).compileToV0Message();
    
    const createTx = new VersionedTransaction(createMessage);
    createTx.sign([payer]);
    
    // Send create transaction
    const createSig = await this.connection.sendTransaction(createTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    
    console.log('[ALTService] Create transaction sent:', createSig);
    await this.connection.confirmTransaction({
      signature: createSig,
      blockhash: recentBlockhash.blockhash,
      lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
    }, 'confirmed');
    
    console.log('[ALTService] Lookup table created, waiting for activation...');
    
    // Wait for the lookup table to be active (1 slot)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Extend with static addresses
    const extendInstruction = await this.extendLookupTable(lookupTableAddress, staticAddresses, payer);
    
    const extendBlockhash = await this.connection.getLatestBlockhash();
    const extendMessage = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: extendBlockhash.blockhash,
      instructions: [extendInstruction],
    }).compileToV0Message();
    
    const extendTx = new VersionedTransaction(extendMessage);
    extendTx.sign([payer]);
    
    const extendSig = await this.connection.sendTransaction(extendTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    
    console.log('[ALTService] Extend transaction sent:', extendSig);
    await this.connection.confirmTransaction({
      signature: extendSig,
      blockhash: extendBlockhash.blockhash,
      lastValidBlockHeight: extendBlockhash.lastValidBlockHeight,
    }, 'confirmed');
    
    console.log('[ALTService] Platform ALT created and initialized:', lookupTableAddress.toBase58());
    
    // Update config
    this.config.lookupTableAddress = lookupTableAddress;
    
    return lookupTableAddress;
  }
  
  /**
   * Estimate transaction size and determine if ALT is needed
   */
  estimateTransactionSize(params: {
    numSigners: number;
    numAccounts: number;
    instructionDataSize: number;
    makerCnftProofNodes?: number;
    takerCnftProofNodes?: number;
  }): TransactionSizeEstimate {
    const { numSigners, numAccounts, instructionDataSize, makerCnftProofNodes = 0, takerCnftProofNodes = 0 } = params;
    
    // Size calculations (based on Solana transaction format)
    const signatureSize = 64 * numSigners;
    const accountKeySize = 32 * numAccounts;
    const headerSize = 3; // numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts
    const instructionHeaderSize = 4; // program index + accounts count + data length (varies)
    
    // cNFT proof data size: root(32) + dataHash(32) + creatorHash(32) + nonce(8) + index(4) + proof(32*nodes)
    const proofBaseSize = 32 + 32 + 32 + 8 + 4; // 108 bytes
    const makerProofSize = makerCnftProofNodes > 0 ? proofBaseSize + (32 * makerCnftProofNodes) : 0;
    const takerProofSize = takerCnftProofNodes > 0 ? proofBaseSize + (32 * takerCnftProofNodes) : 0;
    const totalProofSize = makerProofSize + takerProofSize;
    
    // Total estimate
    const estimatedSize = signatureSize + headerSize + accountKeySize + instructionHeaderSize + instructionDataSize + totalProofSize;
    
    // With ALT, account keys become 1-byte indices for addresses in the table
    // Assume we can move ~20 accounts to ALT (static program addresses)
    const accountsInALT = Math.min(numAccounts - numSigners, 20); // Signers can't be in ALT
    const altSavings = accountsInALT * 31; // Save 31 bytes per address (32 - 1)
    const estimatedSizeWithALT = estimatedSize - altSavings + 32; // Add 32 bytes for ALT address
    
    const maxSize = 1232;
    const willFit = estimatedSize <= maxSize;
    const willFitWithALT = estimatedSizeWithALT <= maxSize;
    
    let recommendation: 'legacy' | 'versioned' | 'cannot_fit';
    if (willFit) {
      recommendation = 'legacy';
    } else if (willFitWithALT) {
      recommendation = 'versioned';
    } else {
      recommendation = 'cannot_fit';
    }
    
    const useALT = !willFit && willFitWithALT;
    
    console.log('[ALTService] Size estimate:', {
      estimatedSize,
      estimatedSizeWithALT,
      maxSize,
      recommendation,
      useALT,
    });
    
    return {
      estimatedSize,
      maxSize,
      willFit,
      recommendation,
      breakdown: {
        signatures: signatureSize,
        accountKeys: accountKeySize,
        instructions: instructionHeaderSize + instructionDataSize,
        proofData: totalProofSize,
      },
      useALT,
      estimatedSizeWithALT: useALT ? estimatedSizeWithALT : undefined,
    };
  }
  
  /**
   * Check if ALT is available and ready to use
   */
  async isALTAvailable(): Promise<boolean> {
    if (!this.config.lookupTableAddress) {
      return false;
    }
    
    const alt = await this.getPlatformALT();
    return alt !== null && alt.state.addresses.length > 0;
  }
  
  /**
   * Get the configured ALT address
   */
  getALTAddress(): PublicKey | undefined {
    return this.config.lookupTableAddress;
  }
}

/**
 * Create ALT service instance
 */
export function createALTService(connection: Connection, config: ALTConfig): ALTService {
  return new ALTService(connection, config);
}

