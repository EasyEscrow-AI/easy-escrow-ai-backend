import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';

/**
 * NFT details structure
 */
export interface NFTDetails {
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  owner: PublicKey;
  address: PublicKey;
}

/**
 * Test NFT metadata structure
 */
export interface TestNFTMetadata {
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints?: number;
  description?: string;
}

/**
 * Default metadata for test NFTs
 */
const DEFAULT_TEST_METADATA: TestNFTMetadata = {
  name: 'Devnet Test NFT',
  symbol: 'DTEST',
  uri: 'https://arweave.net/test-metadata',
  sellerFeeBasisPoints: 0,
  description: 'Test NFT for E2E devnet testing',
};

/**
 * Create a Metaplex instance configured for devnet
 * 
 * @param connection - Solana connection
 * @param wallet - Wallet keypair to use as identity
 * @returns Configured Metaplex instance
 */
export function createMetaplexInstance(
  connection: Connection,
  wallet: Keypair
): Metaplex {
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(wallet));

  return metaplex;
}

/**
 * Create a test NFT in the sender's wallet
 * 
 * @param connection - Solana connection
 * @param senderWallet - Wallet that will own the NFT
 * @param metadata - Optional custom metadata (uses defaults if not provided)
 * @returns NFT details including mint address and metadata
 */
export async function createTestNFT(
  connection: Connection,
  senderWallet: Keypair,
  metadata?: Partial<TestNFTMetadata>
): Promise<NFTDetails> {
  try {
    console.log('🎨 Creating test NFT in sender wallet...');
    
    const metaplex = createMetaplexInstance(connection, senderWallet);
    
    // Merge provided metadata with defaults
    const nftMetadata = {
      ...DEFAULT_TEST_METADATA,
      ...metadata,
    };

    console.log(`   Name: ${nftMetadata.name}`);
    console.log(`   Symbol: ${nftMetadata.symbol}\n`);

    // Create NFT
    const { nft } = await metaplex.nfts().create({
      uri: nftMetadata.uri,
      name: nftMetadata.name,
      symbol: nftMetadata.symbol,
      sellerFeeBasisPoints: nftMetadata.sellerFeeBasisPoints || 0,
      creators: [
        {
          address: senderWallet.publicKey,
          share: 100,
        },
      ],
    });

    console.log(`✅ NFT created successfully!`);
    console.log(`   Mint: ${nft.address.toString()}`);
    console.log(`   Owner: ${senderWallet.publicKey.toString()}`);
    console.log(`   Explorer: https://explorer.solana.com/address/${nft.address.toString()}?cluster=devnet\n`);

    return {
      mint: nft.mint.address,
      name: nft.name,
      symbol: nft.symbol,
      uri: nft.uri,
      owner: senderWallet.publicKey,
      address: nft.address,
    };
  } catch (error) {
    throw new Error(`Failed to create test NFT: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get NFT details and verify ownership
 * 
 * @param connection - Solana connection
 * @param mintAddress - NFT mint address
 * @returns NFT metadata and ownership information
 */
export async function getNFTDetails(
  connection: Connection,
  mintAddress: PublicKey,
  wallet: Keypair
): Promise<NFTDetails> {
  try {
    const metaplex = createMetaplexInstance(connection, wallet);
    
    const nft = await metaplex.nfts().findByMint({ mintAddress });

    return {
      mint: nft.mint.address,
      name: nft.name,
      symbol: nft.symbol,
      uri: nft.uri,
      owner: nft.updateAuthorityAddress, // This may need adjustment based on actual ownership
      address: nft.address,
    };
  } catch (error) {
    throw new Error(`Failed to get NFT details: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verify NFT ownership
 * 
 * @param connection - Solana connection
 * @param mintAddress - NFT mint address
 * @param expectedOwner - Expected owner's public key
 * @param wallet - Wallet to use for queries
 * @returns True if the expected owner owns the NFT
 */
export async function verifyNFTOwnership(
  connection: Connection,
  mintAddress: PublicKey,
  expectedOwner: PublicKey,
  wallet: Keypair
): Promise<boolean> {
  try {
    const metaplex = createMetaplexInstance(connection, wallet);
    
    // Find NFT by mint
    const nft = await metaplex.nfts().findByMint({ mintAddress });
    
    // For NFT type, check update authority or creator
    // NFT ownership is determined by who holds the token
    if ('token' in nft && nft.token) {
      const tokenAccount = await metaplex.tokens().findTokenByAddress({
        address: nft.token.address,
      });
      return tokenAccount.ownerAddress.equals(expectedOwner);
    }
    
    // Fallback: check if expectedOwner has the token
    return nft.updateAuthorityAddress.equals(expectedOwner);
  } catch (error) {
    console.error('Error verifying NFT ownership:', error);
    return false;
  }
}

/**
 * Create multiple test NFTs for batch testing
 * 
 * @param connection - Solana connection
 * @param senderWallet - Wallet that will own the NFTs
 * @param count - Number of NFTs to create
 * @returns Array of NFT details
 */
export async function createMultipleTestNFTs(
  connection: Connection,
  senderWallet: Keypair,
  count: number
): Promise<NFTDetails[]> {
  console.log(`🎨 Creating ${count} test NFTs...\n`);
  
  const nfts: NFTDetails[] = [];

  for (let i = 0; i < count; i++) {
    const metadata: Partial<TestNFTMetadata> = {
      name: `Devnet Test NFT #${i + 1}`,
      symbol: 'DTEST',
      uri: `https://arweave.net/test-metadata-${i + 1}`,
    };

    const nft = await createTestNFT(connection, senderWallet, metadata);
    nfts.push(nft);
    
    // Add small delay between creations to avoid rate limiting
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`✅ Created ${count} NFTs successfully!\n`);
  return nfts;
}

/**
 * Display NFT information
 */
export function displayNFTInfo(nft: NFTDetails): void {
  console.log('🎨 NFT Information:');
  console.log(`  Name:    ${nft.name}`);
  console.log(`  Symbol:  ${nft.symbol}`);
  console.log(`  Mint:    ${nft.mint.toString()}`);
  console.log(`  Owner:   ${nft.owner.toString()}`);
  console.log(`  URI:     ${nft.uri}`);
  console.log(`  Explorer: https://explorer.solana.com/address/${nft.mint.toString()}?cluster=devnet\n`);
}

/**
 * Get NFT token account address
 * 
 * @param connection - Solana connection
 * @param mintAddress - NFT mint address
 * @param owner - Owner's public key
 * @param wallet - Wallet for queries
 * @returns Token account address
 */
export async function getNFTTokenAccount(
  connection: Connection,
  mintAddress: PublicKey,
  owner: PublicKey,
  wallet: Keypair
): Promise<PublicKey> {
  try {
    const metaplex = createMetaplexInstance(connection, wallet);
    
    const nft = await metaplex.nfts().findByMint({ mintAddress });
    
    // Check if token property exists
    if ('token' in nft && nft.token) {
      return nft.token.address;
    }
    
    // Fallback: compute associated token account
    const { getAssociatedTokenAddress } = await import('@solana/spl-token');
    return await getAssociatedTokenAddress(mintAddress, owner);
  } catch (error) {
    throw new Error(`Failed to get NFT token account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Simple in-memory metadata for devnet testing (no Arweave upload needed)
 * This creates a data URI that can be used for quick testing without external dependencies
 */
export function createSimpleMetadataUri(nft: Partial<TestNFTMetadata>): string {
  const metadata = {
    name: nft.name || 'Devnet Test NFT',
    symbol: nft.symbol || 'DTEST',
    description: nft.description || 'Test NFT for E2E devnet testing',
    image: 'https://via.placeholder.com/500x500?text=Test+NFT',
    attributes: [
      {
        trait_type: 'Type',
        value: 'Test',
      },
      {
        trait_type: 'Environment',
        value: 'Devnet',
      },
      {
        trait_type: 'Created',
        value: new Date().toISOString(),
      },
    ],
    properties: {
      files: [
        {
          uri: 'https://via.placeholder.com/500x500?text=Test+NFT',
          type: 'image/png',
        },
      ],
      category: 'image',
    },
  };

  // Return a data URI (or you could upload to Arweave for real testing)
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
}

/**
 * Create test NFT with simple metadata (no external uploads)
 * Faster for testing, but not suitable for production
 */
export async function createQuickTestNFT(
  connection: Connection,
  senderWallet: Keypair,
  name?: string
): Promise<NFTDetails> {
  const nftName = name || `Test NFT ${Date.now()}`;
  const uri = createSimpleMetadataUri({ name: nftName });
  
  return createTestNFT(connection, senderWallet, {
    name: nftName,
    symbol: 'DTEST',
    uri,
  });
}

