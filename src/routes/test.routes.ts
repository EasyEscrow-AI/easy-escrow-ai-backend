/**
 * Test Page Routes
 * 
 * Development/testing endpoints for visualizing and testing atomic swap functionality
 */

import { Router, Request, Response } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import path from 'path';

const router = Router();

// Initialize connection
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

/**
 * GET /test/config
 * Get test page configuration including wallet addresses
 */
router.get('/api/test/config', (_req: Request, res: Response) => {
  // Determine wallet addresses based on environment
  // IMPORTANT: This logic must match test-execute.routes.ts exactly
  const nodeEnv = process.env.NODE_ENV || 'development';
  const network = process.env.SOLANA_NETWORK || 'devnet';
  const rpcUrl = process.env.SOLANA_RPC_URL || '';
  
  // Unified mainnet detection: NODE_ENV=production OR SOLANA_NETWORK=mainnet-beta OR RPC URL contains mainnet
  const isMainnet = nodeEnv === 'production' || network === 'mainnet-beta' || rpcUrl.includes('mainnet');
  
  let makerAddress: string | undefined;
  let takerAddress: string | undefined;
  
  // Production (Mainnet)
  if (isMainnet) {
    makerAddress = process.env.MAINNET_PROD_SENDER_ADDRESS;
    takerAddress = process.env.MAINNET_PROD_RECEIVER_ADDRESS;
  }
  // Staging (Devnet)
  else if (nodeEnv === 'staging') {
    makerAddress = process.env.DEVNET_STAGING_SENDER_ADDRESS;
    takerAddress = process.env.DEVNET_STAGING_RECEIVER_ADDRESS;
  }
  // Development (Localnet)
  else {
    makerAddress = process.env.LOCALNET_ADMIN_ADDRESS || process.env.DEVNET_STAGING_SENDER_ADDRESS;
    takerAddress = process.env.LOCALNET_RECEIVER_ADDRESS || process.env.DEVNET_STAGING_RECEIVER_ADDRESS;
  }
  
  const detectedNetwork = isMainnet ? 'mainnet-beta' : 'devnet';
  
  res.json({
    success: true,
    data: {
      makerAddress,
      takerAddress,
      environment: nodeEnv,
      network: detectedNetwork,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /test
 * Serve the atomic swap test page
 */
router.get('/test', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/test-page.html'));
});

/**
 * GET /api/test/wallet-info
 * Get wallet balance and NFTs
 */
router.get('/api/test/wallet-info', async (req: Request, res: Response) => {
  try {
    const { address } = req.query;

    if (!address || typeof address !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Wallet address is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate address
    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(address);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Invalid wallet address',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Get SOL balance
    const balance = await connection.getBalance(publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;

    // Get SPL token accounts (regular NFTs)
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });

    // Filter for SPL NFTs (amount = 1, decimals = 0)
    const splNfts = tokenAccounts.value
      .filter((account) => {
        const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
        const decimals = account.account.data.parsed.info.tokenAmount.decimals;
        const owner = account.account.data.parsed.info.owner;
        
        // Only include NFTs that:
        // 1. Have exactly 1 token (not 0)
        // 2. Have 0 decimals (NFT standard)
        // 3. Are owned by the specified address
        const isOwnedNFT = amount === 1 && decimals === 0 && owner === address;
        
        if (!isOwnedNFT && decimals === 0) {
          console.log(`[Test Route] Filtered out SPL token: ${account.account.data.parsed.info.mint} (amount: ${amount})`);
        }
        
        return isOwnedNFT;
      })
      .map((account) => {
        const info = account.account.data.parsed.info;
        return {
          mint: info.mint,
          tokenAccount: account.pubkey.toBase58(),
          isCompressed: false,
        };
      });

    // Get compressed NFTs (cNFTs) using DAS API
    let cNfts: any[] = [];
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    
    // Check if using QuickNode or Helius (both support DAS API)
    const isDasSupported = rpcUrl.includes('quiknode') || rpcUrl.includes('helius');
    
    if (isDasSupported) {
      try {
        const dasResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'get-assets',
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: address,
              page: 1,
              limit: 1000,
            },
          }),
        });

        const dasData = await dasResponse.json() as any;
        
        if (dasData.result && dasData.result.items) {
          const totalAssets = dasData.result.items.length;
          
          // DEDICATED TEST TREE - Only show cNFTs from our private tree
          // If not set, show all cNFTs (for backwards compatibility)
          const DEDICATED_TEST_TREE = process.env.STAGING_TEST_TREE;
          console.log(`[Test Route] STAGING_TEST_TREE env var: ${DEDICATED_TEST_TREE || 'NOT SET (showing all trees)'}`);
          console.log(`[Test Route] DAS API returned ${totalAssets} total assets for ${address}`);
          
          // Log all asset types for debugging
          const assetTypes = dasData.result.items.reduce((acc: any, asset: any) => {
            const type = asset.interface || (asset.compression?.compressed ? 'cNFT' : 'unknown');
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {});
          console.log(`[Test Route] Asset types found:`, assetTypes);
          
          // Filter for cNFTs (compressed NFTs)
          const filteredCNfts = dasData.result.items
            .filter((asset: any) => {
              // Only include compressed NFTs that are:
              // 1. Actually compressed
              // 2. Currently owned by this wallet
              // 3. Not burnt
              // 4. Not frozen
              // 5. IN OUR DEDICATED TEST TREE (if configured - prevents cross-tree swap failures)
              const isCompressed = asset.compression?.compressed === true;
              const isOwned = asset.ownership?.owner === address;
              const notBurnt = !asset.burnt;
              const notFrozen = !asset.frozen;
              const inDedicatedTree = DEDICATED_TEST_TREE 
                ? asset.compression?.tree === DEDICATED_TEST_TREE 
                : true; // If no tree specified, allow all trees
              
              const isValid = isCompressed && isOwned && notBurnt && notFrozen && inDedicatedTree;
              
              // Log filtered out cNFTs for debugging
              if (!isValid && isCompressed) {
                console.log(`[Test Route] Filtered out cNFT: ${asset.id}`, {
                  isCompressed,
                  isOwned,
                  notBurnt,
                  notFrozen,
                  inDedicatedTree,
                  tree: asset.compression?.tree,
                  expectedTree: DEDICATED_TEST_TREE,
                  actualOwner: asset.ownership?.owner,
                  expectedOwner: address,
                });
              }
              
              return isValid;
            });
          
          console.log(`[Test Route] After cNFT filtering: ${filteredCNfts.length} valid cNFTs found`);
          
          // Filter for Metaplex Core NFTs (MplCoreAsset)
          const coreNfts = dasData.result.items
            .filter((asset: any) => {
              // Metaplex Core NFTs have interface "MplCoreAsset" or similar
              const isCoreNft = asset.interface === 'MplCoreAsset' || 
                               asset.interface === 'MplCoreCollection' ||
                               (asset.interface && asset.interface.includes('Core'));
              const isOwned = asset.ownership?.owner === address;
              const notBurnt = !asset.burnt;
              const notFrozen = !asset.frozen;
              
              const isValid = isCoreNft && isOwned && notBurnt && notFrozen;
              
              if (isCoreNft) {
                console.log(`[Test Route] Found Metaplex Core NFT: ${asset.id}`, {
                  interface: asset.interface,
                  isOwned,
                  notBurnt,
                  notFrozen,
                  isValid,
                });
              }
              
              return isValid;
            });
          
          console.log(`[Test Route] Found ${coreNfts.length} valid Metaplex Core NFTs`);
          
          // Map cNFTs to our format
          let isFirstLog = true;
          const mappedCNfts = filteredCNfts.map((asset: any) => {
              // Debug: Log the asset structure for the first cNFT
              if (isFirstLog) {
                isFirstLog = false;
                console.log('Sample cNFT asset structure:', JSON.stringify({
                  id: asset.id,
                  uri: asset.uri,
                  content: asset.content,
                  interface: asset.interface,
                }, null, 2));
              }
              
              // For cNFTs minted with image URL directly in uri field (non-standard but works for testing)
              // Try: content structure, then fall back to root uri field (where we set it during minting)
              const imageUrl = asset.content?.files?.[0]?.uri || 
                              asset.content?.links?.image || 
                              asset.content?.json_uri ||
                              asset.content?.metadata?.uri ||
                              asset.uri || // Root uri field (set during minting)
                              null;
              
              return {
                mint: asset.id,
                tokenAccount: null, // cNFTs don't have token accounts
                isCompressed: true,
                isCoreNft: false,
                name: asset.content?.metadata?.name || 'Unknown cNFT',
                image: imageUrl,
                symbol: asset.content?.metadata?.symbol || '',
              };
            });
          
          // Map Metaplex Core NFTs to our format
          const mappedCoreNfts = coreNfts.map((asset: any) => {
              console.log('Metaplex Core NFT asset structure:', JSON.stringify({
                id: asset.id,
                uri: asset.uri,
                content: asset.content,
                interface: asset.interface,
              }, null, 2));
              
              const imageUrl = asset.content?.files?.[0]?.uri || 
                              asset.content?.links?.image || 
                              asset.content?.json_uri ||
                              asset.content?.metadata?.image ||
                              asset.uri ||
                              null;
              
              return {
                mint: asset.id,
                tokenAccount: null, // Core NFTs don't have token accounts like SPL tokens
                isCompressed: false,
                isCoreNft: true,
                name: asset.content?.metadata?.name || 'Unknown Core NFT',
                image: imageUrl,
                symbol: asset.content?.metadata?.symbol || '',
              };
            });
          
          // Combine cNFTs and Core NFTs
          cNfts = [...mappedCNfts, ...mappedCoreNfts];
          
          console.log(`[Test Route] Total DAS assets for ${address}:`, {
            totalFromDAS: totalAssets,
            cNfts: mappedCNfts.length,
            coreNfts: mappedCoreNfts.length,
            total: cNfts.length,
          });
        }
      } catch (error) {
        console.warn('Failed to fetch cNFTs via DAS API:', error);
      }
    }

    // Combine SPL NFTs and cNFTs
    const nfts = [...splNfts, ...cNfts];

    // Enrich SPL NFTs with metadata (cNFTs already have metadata from DAS API)
    let nftsWithMetadata = nfts;
    
    const splNftsToEnrich = nfts.filter(nft => !nft.isCompressed && !nft.name);
    
    if (isDasSupported && splNftsToEnrich.length > 0) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'get-asset-batch',
            method: 'getAssetBatch',
            params: {
              ids: splNftsToEnrich.map((nft) => nft.mint),
            },
          }),
        });

        const data = await response.json() as any;
        if (data.result) {
          // Update SPL NFTs with metadata
          nftsWithMetadata = nfts.map((nft) => {
            if (nft.isCompressed || nft.name) {
              return nft; // Already has metadata
            }
            
            const metadataIndex = splNftsToEnrich.findIndex(n => n.mint === nft.mint);
            if (metadataIndex >= 0) {
              const metadata = data.result[metadataIndex];
              return {
                ...nft,
                name: metadata?.content?.metadata?.name || 'Unknown NFT',
                image: metadata?.content?.files?.[0]?.uri || metadata?.content?.links?.image || null,
                symbol: metadata?.content?.metadata?.symbol || '',
              };
            }
            
            return nft;
          });
        }
      } catch (error) {
        console.warn('Failed to fetch SPL NFT metadata:', error);
      }
    }

    // Ensure all NFTs have required fields
    const finalNfts = nftsWithMetadata.map(nft => ({
      mint: nft.mint,
      tokenAccount: nft.tokenAccount,
      name: nft.name || 'Unknown NFT',
      image: nft.image || null,
      symbol: nft.symbol || '',
      isCompressed: nft.isCompressed || false,
    }));

    res.json({
      success: true,
      data: {
        address: address,
        solBalance: solBalance,
        solBalanceLamports: balance,
        nfts: finalNfts,
        nftCount: finalNfts.length,
        splNftCount: finalNfts.filter(n => !n.isCompressed).length,
        cNftCount: finalNfts.filter(n => n.isCompressed).length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching wallet info:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch wallet info',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/test/transaction-fee
 * Get the fee for a confirmed transaction
 */
router.get('/api/test/transaction-fee', async (req: Request, res: Response) => {
  try {
    const { signature } = req.query;

    if (!signature || typeof signature !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Transaction signature is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Fetch transaction details
    const transaction = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction) {
      res.status(404).json({
        success: false,
        error: 'Transaction not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Get the fee from transaction metadata
    const fee = transaction.meta?.fee || 0;

    res.json({
      success: true,
      data: {
        signature,
        fee, // Fee in lamports
        feeSol: fee / LAMPORTS_PER_SOL,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching transaction fee:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch transaction fee',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

