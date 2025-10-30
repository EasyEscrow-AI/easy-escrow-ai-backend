/**
 * Metaplex Metadata Parser Utility
 * 
 * Parses on-chain Metaplex metadata without fetching off-chain JSON.
 * This provides fast access to NFT metadata by only reading the on-chain account data.
 * 
 * Performance: ~100ms vs 2-10 seconds for full off-chain fetch
 */

import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Metaplex Metadata Program ID
 */
export const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/**
 * Parsed on-chain metadata structure
 */
export interface OnChainMetadata {
  key: number;
  updateAuthority: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: Array<{
    address: string;
    verified: boolean;
    share: number;
  }> | null;
}

/**
 * Derive Metaplex metadata PDA for a given mint
 */
export function deriveMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Fetch and parse on-chain Metaplex metadata
 * Does NOT fetch off-chain JSON from URI - only reads on-chain data
 * 
 * @param connection Solana connection
 * @param mintAddress NFT mint address
 * @returns Parsed metadata or null if not found
 */
export async function fetchOnChainMetadata(
  connection: Connection,
  mintAddress: PublicKey
): Promise<OnChainMetadata | null> {
  try {
    // Derive metadata PDA
    const metadataPDA = deriveMetadataPDA(mintAddress);
    
    // Fetch account data
    const accountInfo = await connection.getAccountInfo(metadataPDA);
    
    if (!accountInfo) {
      console.log(`[MetaplexParser] No metadata account found for ${mintAddress.toBase58()}`);
      return null;
    }
    
    // Parse the account data
    return parseMetadataAccount(accountInfo.data);
  } catch (error) {
    console.error('[MetaplexParser] Error fetching on-chain metadata:', error);
    return null;
  }
}

/**
 * Parse Metaplex metadata account data
 * 
 * Metaplex Metadata V1 Structure:
 * - key (1 byte) - should be 4 for Metadata
 * - update_authority (32 bytes)
 * - mint (32 bytes)
 * - name (string with 4-byte length prefix + data)
 * - symbol (string with 4-byte length prefix + data)
 * - uri (string with 4-byte length prefix + data)
 * - seller_fee_basis_points (2 bytes)
 * - creators (optional - 1 byte option flag + array if present)
 */
export function parseMetadataAccount(data: Buffer): OnChainMetadata | null {
  try {
    let offset = 0;
    
    // Read key (should be 4 for Metadata)
    const key = data.readUInt8(offset);
    offset += 1;
    
    if (key !== 4) {
      console.warn(`[MetaplexParser] Invalid metadata key: ${key} (expected 4)`);
      return null;
    }
    
    // Read update authority (32 bytes)
    const updateAuthority = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    // Read mint (32 bytes)
    const mint = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    // Read name (string with 4-byte length prefix)
    const { value: name, newOffset: nameOffset } = readString(data, offset);
    offset = nameOffset;
    
    // Read symbol (string with 4-byte length prefix)
    const { value: symbol, newOffset: symbolOffset } = readString(data, offset);
    offset = symbolOffset;
    
    // Read uri (string with 4-byte length prefix)
    const { value: uri, newOffset: uriOffset } = readString(data, offset);
    offset = uriOffset;
    
    // Read seller_fee_basis_points (2 bytes)
    const sellerFeeBasisPoints = data.readUInt16LE(offset);
    offset += 2;
    
    // Read creators (optional)
    const hasCreators = data.readUInt8(offset);
    offset += 1;
    
    let creators: Array<{ address: string; verified: boolean; share: number }> | null = null;
    
    if (hasCreators === 1) {
      // Read number of creators (4 bytes)
      const creatorCount = data.readUInt32LE(offset);
      offset += 4;
      
      creators = [];
      for (let i = 0; i < creatorCount; i++) {
        // Each creator: address (32 bytes) + verified (1 byte) + share (1 byte)
        const address = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;
        
        const verified = data.readUInt8(offset) === 1;
        offset += 1;
        
        const share = data.readUInt8(offset);
        offset += 1;
        
        creators.push({ address, verified, share });
      }
    }
    
    return {
      key,
      updateAuthority,
      mint,
      name: name.replace(/\0/g, '').trim(), // Remove null bytes and trim
      symbol: symbol.replace(/\0/g, '').trim(),
      uri: uri.replace(/\0/g, '').trim(),
      sellerFeeBasisPoints,
      creators,
    };
  } catch (error) {
    console.error('[MetaplexParser] Error parsing metadata account:', error);
    return null;
  }
}

/**
 * Helper function to read a string from buffer
 * Metaplex strings are stored as: 4-byte length + string data
 */
function readString(data: Buffer, offset: number): { value: string; newOffset: number } {
  // Validate we have enough bytes to read the length
  if (offset + 4 > data.length) {
    throw new Error(`Buffer overflow: cannot read string length at offset ${offset}, buffer size ${data.length}`);
  }
  
  // Read string length (4 bytes, little-endian)
  const length = data.readUInt32LE(offset);
  offset += 4;
  
  // Validate the string length is reasonable and within buffer bounds
  if (length > data.length || offset + length > data.length) {
    throw new Error(`Buffer overflow: string length ${length} at offset ${offset} exceeds buffer size ${data.length}`);
  }
  
  // Read string data
  const stringData = data.slice(offset, offset + length);
  const value = stringData.toString('utf8');
  offset += length;
  
  return { value, newOffset: offset };
}

/**
 * Get simplified metadata info suitable for logging/display
 */
export function getMetadataDisplayInfo(metadata: OnChainMetadata): {
  name: string;
  symbol: string;
  hasRoyalties: boolean;
  royaltyPercent: number;
  creatorsCount: number;
} {
  return {
    name: metadata.name,
    symbol: metadata.symbol,
    hasRoyalties: metadata.sellerFeeBasisPoints > 0,
    royaltyPercent: metadata.sellerFeeBasisPoints / 100, // Convert basis points to percentage
    creatorsCount: metadata.creators?.length || 0,
  };
}

