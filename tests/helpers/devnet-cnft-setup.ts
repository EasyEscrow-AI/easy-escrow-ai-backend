/**
 * Devnet cNFT (Compressed NFT) Setup Helper
 * 
 * Creates test cNFTs on Solana devnet for E2E testing.
 * Uses Metaplex Bubblegum to mint compressed NFTs into a Merkle tree.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ValidDepthSizePair,
  createAllocTreeIx,
  getConcurrentMerkleTreeAccountSize,
} from '@solana/spl-account-compression';
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createCreateTreeInstruction,
  createMintV1Instruction,
  MetadataArgs,
  TokenProgramVersion,
  TokenStandard,
} from '@metaplex-foundation/mpl-bubblegum';

/**
 * cNFT Details returned after minting
 */
export interface CnftDetails {
  /** Asset ID (used for DAS API queries) */
  assetId: PublicKey;
  /** Merkle tree address */
  treeAddress: PublicKey;
  /** Tree authority PDA */
  treeAuthority: PublicKey;
  /** Leaf index in the tree */
  leafIndex: number;
  /** Owner wallet */
  owner: PublicKey;
  /** Metadata */
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
}

/**
 * Configuration for Merkle tree creation
 */
export interface TreeConfig {
  /** Maximum depth of the tree (14 = 16,384 NFTs) */
  maxDepth: ValidDepthSizePair['maxDepth'];
  /** Maximum buffer size (64 recommended) */
  maxBufferSize: ValidDepthSizePair['maxBufferSize'];
  /** Canopy depth (11 recommended for lower proof sizes) */
  canopyDepth: number;
}

/**
 * Default tree configuration for testing
 * - Depth 14 = up to 16,384 cNFTs
 * - Buffer 64 = concurrent updates
 * - Canopy 11 = minimal proof sizes
 */
export const DEFAULT_TREE_CONFIG: TreeConfig = {
  maxDepth: 14 as ValidDepthSizePair['maxDepth'],
  maxBufferSize: 64 as ValidDepthSizePair['maxBufferSize'],
  canopyDepth: 11,
};

/**
 * Create a Merkle tree for storing cNFTs
 * 
 * @param connection - Solana connection
 * @param payer - Payer and tree creator
 * @param config - Tree configuration
 * @returns Tree keypair and authority PDA
 */
export async function createMerkleTree(
  connection: Connection,
  payer: Keypair,
  config: TreeConfig = DEFAULT_TREE_CONFIG
): Promise<{ tree: Keypair; treeAuthority: PublicKey }> {
  console.log('\n🌳 Creating Merkle tree for cNFTs...');
  console.log(`   Depth: ${config.maxDepth} (capacity: ${2 ** config.maxDepth} NFTs)`);
  console.log(`   Buffer: ${config.maxBufferSize}`);
  console.log(`   Canopy: ${config.canopyDepth}`);

  // Generate tree keypair
  const tree = Keypair.generate();
  console.log(`   Tree Address: ${tree.publicKey.toBase58()}`);

  // Derive tree authority PDA
  // Note: Bubblegum uses [tree_address] only, NOT ['TreeConfig', tree_address]
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [tree.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  console.log(`   Tree Authority: ${treeAuthority.toBase58()}`);

  // Calculate space required
  const depthSizePair = {
    maxDepth: config.maxDepth,
    maxBufferSize: config.maxBufferSize,
  } as ValidDepthSizePair;
  const space = getConcurrentMerkleTreeAccountSize(
    depthSizePair.maxDepth,
    depthSizePair.maxBufferSize,
    config.canopyDepth
  );
  console.log(`   Space Required: ${space} bytes`);

  // Get rent
  const rent = await connection.getMinimumBalanceForRentExemption(space);
  console.log(`   Rent: ${(rent / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // Create transaction
  const transaction = new Transaction();

  // 1. Allocate tree account
  const allocTreeIx = await createAllocTreeIx(
    connection,
    tree.publicKey,
    payer.publicKey,
    depthSizePair,
    config.canopyDepth
  );
  transaction.add(allocTreeIx);

  // 2. Create tree (initialize for Bubblegum)
  const createTreeIx = createCreateTreeInstruction(
    {
      treeAuthority,
      merkleTree: tree.publicKey,
      payer: payer.publicKey,
      treeCreator: payer.publicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      maxBufferSize: config.maxBufferSize,
      maxDepth: config.maxDepth,
      public: false, // Private tree (only creator can mint)
    }
  );
  transaction.add(createTreeIx);

  // Send transaction
  console.log('   📤 Sending transaction...');
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer, tree],
    { commitment: 'confirmed' }
  );

  console.log(`   ✅ Tree created!`);
  console.log(`   Signature: ${signature}`);

  return { tree, treeAuthority };
}

/**
 * Mint a test cNFT into a Merkle tree
 * 
 * @param connection - Solana connection
 * @param tree - Merkle tree to mint into
 * @param treeAuthority - Tree authority PDA
 * @param payer - Payer (must be tree creator)
 * @param owner - NFT owner
 * @param metadata - NFT metadata
 * @param leafIndex - Current leaf index (starts at 0)
 * @returns cNFT details
 */
export async function mintTestCNFT(
  connection: Connection,
  tree: PublicKey,
  treeAuthority: PublicKey,
  payer: Keypair,
  owner: PublicKey,
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  },
  leafIndex: number = 0
): Promise<CnftDetails> {
  console.log(`\n🎨 Minting cNFT: "${metadata.name}"...`);
  console.log(`   Tree: ${tree.toBase58()}`);
  console.log(`   Owner: ${owner.toBase58()}`);
  console.log(`   Leaf Index: ${leafIndex}`);

  // Derive collection metadata PDA (optional, using null for test)
  const [bubblegumSigner] = PublicKey.findProgramAddressSync(
    [Buffer.from('collection_cpi')],
    BUBBLEGUM_PROGRAM_ID
  );

  // Prepare metadata args
  const metadataArgs: MetadataArgs = {
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    sellerFeeBasisPoints: 0,
    primarySaleHappened: false,
    isMutable: true,
    editionNonce: null,
    tokenStandard: TokenStandard.NonFungible,
    collection: null, // No collection for test NFTs
    uses: null,
    tokenProgramVersion: TokenProgramVersion.Original,
    creators: [
      {
        address: payer.publicKey,
        verified: true,
        share: 100,
      },
    ],
  };

  // Create mint instruction
  const mintIx = createMintV1Instruction(
    {
      treeAuthority,
      leafOwner: owner,
      leafDelegate: owner,
      merkleTree: tree,
      payer: payer.publicKey,
      treeDelegate: payer.publicKey,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      message: metadataArgs,
    }
  );

  // Send transaction
  const transaction = new Transaction().add(mintIx);
  console.log('   📤 Sending mint transaction...');
  
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  console.log(`   ✅ cNFT minted!`);
  console.log(`   Signature: ${signature}`);

  // Derive asset ID (used for DAS API queries)
  // Asset ID = hash of (tree address + leaf index)
  const assetId = await getLeafAssetId(tree, new BN(leafIndex));
  console.log(`   Asset ID: ${assetId.toBase58()}`);

  return {
    assetId,
    treeAddress: tree,
    treeAuthority,
    leafIndex,
    owner,
    metadata,
  };
}

/**
 * Helper to derive asset ID from tree and leaf index
 * Asset ID = hash(tree_id, leaf_index)
 */
async function getLeafAssetId(tree: PublicKey, leafIndex: BN): Promise<PublicKey> {
  const [assetId] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('asset'),
      tree.toBuffer(),
      Uint8Array.from(leafIndex.toArray('le', 8)),
    ],
    BUBBLEGUM_PROGRAM_ID
  );
  return assetId;
}

/**
 * Create a test cNFT with sensible defaults
 * 
 * @param connection - Solana connection
 * @param payer - Payer and tree creator
 * @param owner - NFT owner
 * @param options - Optional customization
 * @returns cNFT details
 */
export async function createTestCNFT(
  connection: Connection,
  payer: Keypair,
  owner: PublicKey,
  options?: {
    name?: string;
    symbol?: string;
    uri?: string;
    treeConfig?: TreeConfig;
  }
): Promise<CnftDetails> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CREATE TEST cNFT (Compressed NFT)                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Use existing tree or create new one
  // For testing, we'll create a new tree each time for simplicity
  const { tree, treeAuthority } = await createMerkleTree(
    connection,
    payer,
    options?.treeConfig
  );

  // Mint cNFT
  const cnft = await mintTestCNFT(
    connection,
    tree.publicKey,
    treeAuthority,
    payer,
    owner,
    {
      name: options?.name || `Test cNFT ${Date.now()}`,
      symbol: options?.symbol || 'TCNFT',
      uri: options?.uri || 'https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/test-cnft.json',
    },
    0 // First NFT in tree
  );

  console.log('\n✅ Test cNFT creation complete!');
  console.log('═'.repeat(70));

  return cnft;
}

/**
 * Display cNFT information in console
 */
export function displayCNFTInfo(cnft: CnftDetails): void {
  console.log('\n📦 cNFT Details:');
  console.log('═'.repeat(70));
  console.log(`  Asset ID: ${cnft.assetId.toBase58()}`);
  console.log(`  Tree: ${cnft.treeAddress.toBase58()}`);
  console.log(`  Tree Authority: ${cnft.treeAuthority.toBase58()}`);
  console.log(`  Leaf Index: ${cnft.leafIndex}`);
  console.log(`  Owner: ${cnft.owner.toBase58()}`);
  console.log(`  Name: ${cnft.metadata.name}`);
  console.log(`  Symbol: ${cnft.metadata.symbol}`);
  console.log(`  URI: ${cnft.metadata.uri}`);
  console.log('═'.repeat(70));
}

// Re-export BN for convenience
import BN from 'bn.js';
export { BN };

