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
          // Note: Different RPC providers may use different interface names
          // IMPORTANT: cNFTs must be explicitly excluded - they have compression.compressed = true
          const coreNfts = dasData.result.items
            .filter((asset: any) => {
              // FIRST: Exclude compressed NFTs (cNFTs) - they are NOT Core NFTs
              const isCompressed = asset.compression?.compressed === true;
              if (isCompressed) {
                return false; // This is a cNFT, not a Core NFT
              }
              
              // Metaplex Core NFTs have specific interface names
              const interfaceName = asset.interface?.toLowerCase() || '';
              // Be more specific - only match exact Metaplex Core interface names
              const isCoreNft = interfaceName === 'mplcoreasset' ||
                               interfaceName === 'mplcorecollection' ||
                               asset.interface === 'MplCoreAsset' || 
                               asset.interface === 'MplCoreCollection';
              // Note: Removed 'includes("core")' check as it was too broad and caught non-Core NFTs
              // Also removed V1_NFT check as that's typically standard SPL NFTs
              
              const isOwned = asset.ownership?.owner === address;
              const notBurnt = !asset.burnt;
              const notFrozen = !asset.frozen;
              
              const isValid = isCoreNft && isOwned && notBurnt && notFrozen;
              
              // Log Core NFT detection for debugging
              if (isCoreNft || (asset.interface && isValid)) {
                console.log(`[Test Route] Asset ${asset.id} Core NFT check:`, {
                  interface: asset.interface,
                  interfaceLower: interfaceName,
                  isCompressed,
                  isCoreNft,
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
          
          // Log any unclassified assets (for debugging)
          const classifiedIds = new Set([
            ...filteredCNfts.map((a: any) => a.id),
            ...coreNfts.map((a: any) => a.id),
          ]);
          const unclassified = dasData.result.items.filter((asset: any) => {
            const isOwned = asset.ownership?.owner === address;
            return isOwned && !asset.burnt && !asset.frozen && !classifiedIds.has(asset.id);
          });
          
          if (unclassified.length > 0) {
            console.log(`[Test Route] ⚠️ Unclassified DAS assets (not cNFT or Core):`, 
              unclassified.map((a: any) => ({
                id: a.id,
                interface: a.interface,
                compressed: a.compression?.compressed,
                name: a.content?.metadata?.name,
              }))
            );
          }
          
          console.log(`[Test Route] Total DAS assets for ${address}:`, {
            totalFromDAS: totalAssets,
            cNfts: mappedCNfts.length,
            coreNfts: mappedCoreNfts.length,
            unclassified: unclassified.length,
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

    // Ensure all NFTs have required fields (preserve isCoreNft flag!)
    const finalNfts = nftsWithMetadata.map(nft => ({
      mint: nft.mint,
      tokenAccount: nft.tokenAccount,
      name: nft.name || 'Unknown NFT',
      image: nft.image || null,
      symbol: nft.symbol || '',
      isCompressed: nft.isCompressed || false,
      isCoreNft: nft.isCoreNft || false, // IMPORTANT: Preserve Core NFT flag
    }));

    // Calculate counts for each NFT type
    const splNftCount = finalNfts.filter(n => !n.isCompressed && !n.isCoreNft).length;
    const cNftCount = finalNfts.filter(n => n.isCompressed).length;
    const coreNftCount = finalNfts.filter(n => n.isCoreNft).length;

    res.json({
      success: true,
      data: {
        address: address,
        solBalance: solBalance,
        solBalanceLamports: balance,
        nfts: finalNfts,
        nftCount: finalNfts.length,
        splNftCount,
        cNftCount,
        coreNftCount, // Add Core NFT count
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

/**
 * POST /api/test/estimate-size
 * Estimate transaction size for a potential swap
 */
router.post('/api/test/estimate-size', async (req: Request, res: Response) => {
  // Our production ALT contains exactly 10 addresses (programs, treasury, authority)
  const ACTUAL_ALT_ADDRESSES = 10;
  
  try {
    const { offeredAssets, requestedAssets } = req.body;
    
    const makerAssets = offeredAssets || [];
    const takerAssets = requestedAssets || [];
    
    // Count different asset types (cNFT, CORE, SPL)
    const makerCnfts = makerAssets.filter((a: any) => a.isCompressed && !a.isCoreNft);
    const takerCnfts = takerAssets.filter((a: any) => a.isCompressed && !a.isCoreNft);
    const makerCoreNfts = makerAssets.filter((a: any) => a.isCoreNft);
    const takerCoreNfts = takerAssets.filter((a: any) => a.isCoreNft);
    const makerSplNfts = makerAssets.filter((a: any) => !a.isCompressed && !a.isCoreNft);
    const takerSplNfts = takerAssets.filter((a: any) => !a.isCompressed && !a.isCoreNft);
    
    // Total NFT counts
    const totalMakerNfts = makerAssets.length;
    const totalTakerNfts = takerAssets.length;
    
    // Check for multi-asset limitation (current program only supports 1 NFT per side)
    const exceedsLimit = totalMakerNfts > 1 || totalTakerNfts > 1;
    
    // Base transaction size components
    const numSigners = 3; // maker, taker, platform authority
    
    // Base accounts: maker, taker, platform_authority, treasury, token_program, system_program, 
    // nonce_account, nonce_authority, plus optional accounts for NFT/cNFT transfers
    let numAccounts = 10; // Base accounts
    
    // Each SPL NFT requires 4 accounts: mint, maker_token_account, taker_token_account, token_program (shared)
    // Since token_program is already counted, add 3 per NFT
    const splNftAccounts = (makerSplNfts.length + takerSplNfts.length) * 3;
    numAccounts += splNftAccounts;
    
    // cNFT accounts: merkle_tree, tree_authority, bubblegum_program, compression_program, log_wrapper
    // These are shared per side, so add 5 accounts if any cNFTs on that side
    if (makerCnfts.length > 0) numAccounts += 5;
    if (takerCnfts.length > 0) numAccounts += 5;
    
    // CORE NFT accounts: asset, collection, mpl_core_program (3 per NFT)
    const coreNftAccounts = (makerCoreNfts.length + takerCoreNfts.length) * 3;
    numAccounts += coreNftAccounts;
    
    // Estimate proof nodes based on actual cNFT data if available
    // DAS API provides proof length which equals maxDepth
    // We need: maxDepth - canopyDepth nodes
    // Standard trees: maxDepth=14, canopy=11 → 3 nodes
    // Low canopy trees: maxDepth=14, canopy=5 → 9 nodes  
    // No canopy trees: maxDepth=14, canopy=0 → 14 nodes
    // 
    // IMPORTANT: cNFTs with 8+ proof nodes likely won't fit even with ALT!
    // The transaction limit is 1232 bytes, and each proof node adds 32 bytes.
    // 
    // WARNING: Proof size varies per cNFT based on tree canopy depth.
    // We use WORST CASE (14 nodes) for estimates since we can't fetch the actual
    // proof until the swap is executed. This may over-estimate size.
    let makerProofNodes = 0;
    let takerProofNodes = 0;
    let cnftWarning: string | null = null;
    
    // Check if assets have proof data from DAS API
    if (makerCnfts.length > 0) {
      const firstMakerCnft = makerCnfts[0];
      // Use actual proof length if available, otherwise use WORST CASE
      if (firstMakerCnft.proofNodes !== undefined) {
        makerProofNodes = firstMakerCnft.proofNodes * makerCnfts.length;
      } else {
        // WORST CASE: assume no canopy (14 nodes) for safety
        // Many cNFTs have low or no canopy, making them incompatible with atomic swaps
        makerProofNodes = 14 * makerCnfts.length;
        cnftWarning = 'cNFT proof size varies by tree. Estimate uses worst case (14 nodes). Actual may be smaller.';
      }
    }
    
    if (takerCnfts.length > 0) {
      const firstTakerCnft = takerCnfts[0];
      if (firstTakerCnft.proofNodes !== undefined) {
        takerProofNodes = firstTakerCnft.proofNodes * takerCnfts.length;
      } else {
        // WORST CASE: assume no canopy (14 nodes) for safety
        takerProofNodes = 14 * takerCnfts.length;
        cnftWarning = 'cNFT proof size varies by tree. Estimate uses worst case (14 nodes). Actual may be smaller.';
      }
    }
    
    // Proof nodes are passed as remaining accounts
    numAccounts += makerProofNodes + takerProofNodes;
    
    // Calculate sizes more accurately
    const signatureSize = 64 * numSigners;
    // Account keys: for NON-ALT estimate, include ALL accounts
    const accountKeySize = 32 * numAccounts;
    const instructionDataSize = 150; // Base instruction data (more realistic)
    const proofBaseSize = 108; // root + hashes + nonce + index PER cNFT
    // Proof data = base overhead PER cNFT + 32 bytes per proof node (inside instruction data)
    const makerProofDataSize = makerCnfts.length > 0 ? (proofBaseSize * makerCnfts.length) + (32 * makerProofNodes) : 0;
    const takerProofDataSize = takerCnfts.length > 0 ? (proofBaseSize * takerCnfts.length) + (32 * takerProofNodes) : 0;
    
    const estimatedSize = signatureSize + 3 + accountKeySize + 4 + instructionDataSize + makerProofDataSize + takerProofDataSize;
    const maxSize = 1232;
    
    // ALT savings calculation
    // CRITICAL: Only STATIC addresses are in the ALT (programs, treasury, authority)
    // Proof nodes for cNFTs are NOT in ALT - they're unique to each transaction
    // Our production ALT has exactly 10 addresses
    // Signers and proof nodes can't use ALT
    const accountsNotInALT = numSigners + makerProofNodes + takerProofNodes;
    const accountsInALT = Math.min(Math.max(0, numAccounts - accountsNotInALT), ACTUAL_ALT_ADDRESSES);
    const altSavings = accountsInALT * 31; // Save 31 bytes per account (32 byte key -> 1 byte index)
    const estimatedSizeWithALT = estimatedSize - altSavings + 32; // +32 for ALT address reference
    
    const willFit = estimatedSize <= maxSize;
    const willFitWithALT = estimatedSizeWithALT <= maxSize;
    
    let recommendation: string;
    if (willFit) {
      recommendation = 'legacy';
    } else if (willFitWithALT) {
      recommendation = 'versioned';
    } else {
      recommendation = 'cannot_fit';
    }
    
    // Check if ALT is configured
    const altAddress = process.env.PRODUCTION_ALT_ADDRESS || process.env.STAGING_ALT_ADDRESS;
    const altAvailable = !!altAddress;
    
    // Override recommendation if exceeds multi-asset limit
    let finalRecommendation = recommendation;
    let warning: string | null = null;
    
    if (exceedsLimit) {
      finalRecommendation = 'cannot_fit';
      warning = 'Current program only supports 1 NFT per side. Multi-NFT swaps require program upgrade.';
    }
    
    // Add warning for cNFTs with too many proof nodes
    if (!exceedsLimit && !willFitWithALT && (makerProofNodes >= 8 || takerProofNodes >= 8)) {
      warning = `cNFT estimated at ${Math.max(makerProofNodes, takerProofNodes)} proof nodes (worst case). Most cNFTs exceed the ~7 node limit for atomic swaps. Try an SPL NFT instead.`;
    }
    
    // Add cNFT estimate uncertainty warning if not already showing a more critical warning
    if (!warning && cnftWarning) {
      warning = cnftWarning;
    }
    
    res.json({
      success: true,
      data: {
        estimatedSize,
        estimatedSizeWithALT: willFitWithALT ? estimatedSizeWithALT : null,
        maxSize,
        willFit: exceedsLimit ? false : willFit,
        willFitWithALT: exceedsLimit ? false : willFitWithALT,
        recommendation: finalRecommendation,
        altAvailable,
        useALT: !willFit && willFitWithALT && altAvailable && !exceedsLimit,
        warning,
        breakdown: {
          signatures: signatureSize,
          accountKeys: accountKeySize,
          instructions: instructionDataSize + 4,
          proofData: makerProofDataSize + takerProofDataSize,
        },
        details: {
          numSigners,
          numAccounts,
          totalMakerNfts,
          totalTakerNfts,
          makerSplNfts: makerSplNfts.length,
          takerSplNfts: takerSplNfts.length,
          makerCnfts: makerCnfts.length,
          takerCnfts: takerCnfts.length,
          makerCoreNfts: makerCoreNfts.length,
          takerCoreNfts: takerCoreNfts.length,
          makerProofNodes,
          takerProofNodes,
          exceedsLimit,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error estimating transaction size:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to estimate transaction size',
      timestamp: new Date().toISOString(),
    });
  }
});

// ========================================
// SOL PRICE CACHING
// ========================================
interface CachedSolPrice {
  price: number;
  timestamp: number;
}

let cachedSolPrice: CachedSolPrice | null = null;
const SOL_PRICE_CACHE_TTL_MS = 60000; // 1 minute cache

async function fetchSolPriceUSD(): Promise<number | null> {
  // Check cache first
  if (cachedSolPrice && Date.now() - cachedSolPrice.timestamp < SOL_PRICE_CACHE_TTL_MS) {
    return cachedSolPrice.price;
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );

    if (!response.ok) {
      console.warn(`[Quote] CoinGecko API error: ${response.status}`);
      return cachedSolPrice?.price || null;
    }

    const data = await response.json();
    if (data?.solana?.usd) {
      cachedSolPrice = {
        price: data.solana.usd,
        timestamp: Date.now(),
      };
      return data.solana.usd;
    }
  } catch (error) {
    console.warn('[Quote] Failed to fetch SOL price:', error);
  }

  return cachedSolPrice?.price || null;
}

// ========================================
// QUOTE ENDPOINT
// ========================================

interface QuoteAsset {
  mint: string;
  isCompressed?: boolean;
  isCoreNft?: boolean;
  name?: string;
  image?: string;
  symbol?: string;
  proofNodes?: number;
}

interface QuoteRequest {
  makerAssets: QuoteAsset[];
  takerAssets: QuoteAsset[];
  makerSolLamports?: number;
  takerSolLamports?: number;
  apiKey?: string; // For zero-fee apps
}

/**
 * POST /api/test/quote
 * Get comprehensive swap quote including fees, time estimates, and transaction size
 */
router.post('/api/test/quote', async (req: Request, res: Response) => {
  const ACTUAL_ALT_ADDRESSES = 10;
  
  try {
    const {
      makerAssets = [],
      takerAssets = [],
      makerSolLamports = 0,
      takerSolLamports = 0,
      apiKey,
    } = req.body as QuoteRequest;

    // ========================================
    // 1. FETCH SOL PRICE
    // ========================================
    const solPriceUSD = await fetchSolPriceUSD();

    // ========================================
    // 2. CALCULATE SOL AMOUNTS
    // ========================================
    const makerSolAmount = makerSolLamports / LAMPORTS_PER_SOL;
    const takerSolAmount = takerSolLamports / LAMPORTS_PER_SOL;
    const totalSolAmount = makerSolAmount + takerSolAmount;

    // ========================================
    // 3. CATEGORIZE ASSETS
    // ========================================
    const makerCnfts = makerAssets.filter(a => a.isCompressed && !a.isCoreNft);
    const takerCnfts = takerAssets.filter(a => a.isCompressed && !a.isCoreNft);
    const makerCoreNfts = makerAssets.filter(a => a.isCoreNft);
    const takerCoreNfts = takerAssets.filter(a => a.isCoreNft);
    const makerSplNfts = makerAssets.filter(a => !a.isCompressed && !a.isCoreNft);
    const takerSplNfts = takerAssets.filter(a => !a.isCompressed && !a.isCoreNft);

    const totalMakerNfts = makerAssets.length;
    const totalTakerNfts = takerAssets.length;
    const totalNfts = totalMakerNfts + totalTakerNfts;
    const cNFTCount = makerCnfts.length + takerCnfts.length;
    const regularNFTCount = totalNfts - cNFTCount;

    // ========================================
    // 4. ESTIMATE TIME
    // ========================================
    let estimatedTimeSeconds = 5;
    let estimatedTimeDisplay = '~5 seconds';
    if (totalNfts > 10 || cNFTCount > 5) {
      estimatedTimeSeconds = 20;
      estimatedTimeDisplay = '~20 seconds';
    } else if (totalNfts > 5 || cNFTCount > 2) {
      estimatedTimeSeconds = 10;
      estimatedTimeDisplay = '~10 seconds';
    }

    // ========================================
    // 5. CALCULATE NETWORK FEES
    // ========================================
    // Solana signature fee: 5,000 lamports = 0.000005 SOL per signature
    // Atomic swaps typically use 3 signatures = 15,000 lamports = 0.000015 SOL
    const baseFee = 0.00002; // 3-4 signatures worth as buffer
    const perRegularNFTFee = 0.000005; // Small buffer per SPL/Core NFT
    const perCNFTFee = 0.00002; // Higher buffer per cNFT (more compute)
    const networkFeeSol = baseFee + (regularNFTCount * perRegularNFTFee) + (cNFTCount * perCNFTFee);

    // ========================================
    // 6. CALCULATE PLATFORM FEE
    // ========================================
    // Check for zero-fee API key
    const hasValidApiKey = apiKey && apiKey.trim().length > 0;
    
    let platformFeeSol: number;
    let platformFeeType: 'percentage' | 'flat' | 'zero';
    let platformFeeRate: number;

    if (hasValidApiKey) {
      // Zero fee for API key users (validation happens on actual swap)
      platformFeeSol = 0;
      platformFeeType = 'zero';
      platformFeeRate = 0;
    } else if (totalSolAmount > 0) {
      // Percentage-based fee for SOL swaps (1% with 0.001 SOL minimum)
      platformFeeSol = Math.max(totalSolAmount * 0.01, 0.001);
      platformFeeType = 'percentage';
      platformFeeRate = 0.01;
    } else {
      // Flat fee for NFT-only swaps
      platformFeeSol = 0.005;
      platformFeeType = 'flat';
      platformFeeRate = 0.005;
    }
    const platformFeeUSD = solPriceUSD ? platformFeeSol * solPriceUSD : null;

    // ========================================
    // 7. ESTIMATE TRANSACTION SIZE
    // ========================================
    const exceedsMultiAssetLimit = totalMakerNfts > 1 || totalTakerNfts > 1;

    // Base accounts
    const numSigners = 3;
    let numAccounts = 10; // Base accounts

    // SPL NFT accounts (3 per NFT)
    numAccounts += (makerSplNfts.length + takerSplNfts.length) * 3;

    // cNFT accounts (5 per side if any cNFTs)
    if (makerCnfts.length > 0) numAccounts += 5;
    if (takerCnfts.length > 0) numAccounts += 5;

    // Core NFT accounts (3 per NFT)
    numAccounts += (makerCoreNfts.length + takerCoreNfts.length) * 3;

    // Proof nodes estimation (WORST CASE for cNFTs without actual proof data)
    let makerProofNodes = 0;
    let takerProofNodes = 0;
    let cnftSizeWarning: string | null = null;

    if (makerCnfts.length > 0) {
      const firstCnft = makerCnfts[0];
      if (firstCnft.proofNodes !== undefined) {
        makerProofNodes = firstCnft.proofNodes * makerCnfts.length;
      } else {
        // WORST CASE: 14 nodes (no canopy)
        makerProofNodes = 14 * makerCnfts.length;
        cnftSizeWarning = 'cNFT proof size varies by tree. Estimate uses worst case (14 nodes).';
      }
    }

    if (takerCnfts.length > 0) {
      const firstCnft = takerCnfts[0];
      if (firstCnft.proofNodes !== undefined) {
        takerProofNodes = firstCnft.proofNodes * takerCnfts.length;
      } else {
        takerProofNodes = 14 * takerCnfts.length;
        cnftSizeWarning = 'cNFT proof size varies by tree. Estimate uses worst case (14 nodes).';
      }
    }

    numAccounts += makerProofNodes + takerProofNodes;

    // Calculate sizes
    const signatureSize = 64 * numSigners;
    // Account keys: for NON-ALT estimate, include ALL accounts
    const accountKeySize = 32 * numAccounts;
    const instructionDataSize = 150;
    const proofBaseSize = 108; // root + hashes + nonce + index PER cNFT
    // Proof data = base overhead PER cNFT + 32 bytes per proof node
    const makerProofDataSize = makerCnfts.length > 0 ? (proofBaseSize * makerCnfts.length) + (32 * makerProofNodes) : 0;
    const takerProofDataSize = takerCnfts.length > 0 ? (proofBaseSize * takerCnfts.length) + (32 * takerProofNodes) : 0;

    const estimatedSize = signatureSize + 3 + accountKeySize + 4 + instructionDataSize + makerProofDataSize + takerProofDataSize;
    const maxSize = 1232;

    // ALT savings calculation
    // Signers and proof nodes can't use ALT - only static program/treasury addresses
    const accountsNotInALT = numSigners + makerProofNodes + takerProofNodes;
    const accountsInALT = Math.min(Math.max(0, numAccounts - accountsNotInALT), ACTUAL_ALT_ADDRESSES);
    const altSavings = accountsInALT * 31; // Save 31 bytes per account (32 byte key -> 1 byte index)
    const estimatedSizeWithALT = estimatedSize - altSavings + 32; // +32 for ALT address reference

    const willFit = estimatedSize <= maxSize;
    const willFitWithALT = estimatedSizeWithALT <= maxSize;

    // ALT availability
    const altAddress = process.env.PRODUCTION_ALT_ADDRESS || process.env.STAGING_ALT_ADDRESS;
    const altAvailable = !!altAddress;
    const useALT = !willFit && willFitWithALT && altAvailable && !exceedsMultiAssetLimit;

    // ========================================
    // 8. DETERMINE STATUS AND WARNINGS
    // ========================================
    let transactionStatus: 'ok' | 'alt_required' | 'near_limit' | 'too_large';
    let warnings: string[] = [];

    if (exceedsMultiAssetLimit) {
      transactionStatus = 'too_large';
      warnings.push('Current program only supports 1 NFT per side. Multi-NFT swaps require program upgrade.');
    } else if (!willFit && !willFitWithALT) {
      transactionStatus = 'too_large';
      if (makerProofNodes >= 8 || takerProofNodes >= 8) {
        warnings.push(`cNFT estimated at ${Math.max(makerProofNodes, takerProofNodes)} proof nodes (worst case). Most cNFTs exceed the ~7 node limit for atomic swaps. Try an SPL NFT instead.`);
      } else {
        warnings.push('Transaction exceeds size limit even with Address Lookup Table.');
      }
    } else if (!willFit && willFitWithALT) {
      transactionStatus = 'alt_required';
    } else if ((estimatedSize / maxSize) > 0.8) {
      transactionStatus = 'near_limit';
    } else {
      transactionStatus = 'ok';
    }

    if (cnftSizeWarning && transactionStatus !== 'too_large') {
      warnings.push(cnftSizeWarning);
    }

    // ========================================
    // 9. FORMAT RESPONSE
    // ========================================
    const formatSolWithUSD = (sol: number) => ({
      sol,
      lamports: Math.round(sol * LAMPORTS_PER_SOL),
      usd: solPriceUSD ? sol * solPriceUSD : null,
      display: solPriceUSD
        ? `${sol.toFixed(4)} SOL (~$${(sol * solPriceUSD).toFixed(2)} USD)`
        : `${sol.toFixed(4)} SOL`,
    });

    res.json({
      success: true,
      data: {
        // Price data
        solPriceUSD,

        // Asset summary
        maker: {
          assets: makerAssets,
          assetCount: totalMakerNfts,
          sol: makerSolAmount > 0 ? formatSolWithUSD(makerSolAmount) : null,
          breakdown: {
            splNfts: makerSplNfts.length,
            cNfts: makerCnfts.length,
            coreNfts: makerCoreNfts.length,
          },
        },
        taker: {
          assets: takerAssets,
          assetCount: totalTakerNfts,
          sol: takerSolAmount > 0 ? formatSolWithUSD(takerSolAmount) : null,
          breakdown: {
            splNfts: takerSplNfts.length,
            cNfts: takerCnfts.length,
            coreNfts: takerCoreNfts.length,
          },
        },

        // Timing
        estimatedTime: {
          seconds: estimatedTimeSeconds,
          display: estimatedTimeDisplay,
        },

        // Fees
        networkFee: {
          ...formatSolWithUSD(networkFeeSol),
          display: `~${formatSolWithUSD(networkFeeSol).display}`,
        },
        platformFee: {
          ...formatSolWithUSD(platformFeeSol),
          type: platformFeeType,
          rate: platformFeeRate,
          label: platformFeeType === 'zero'
            ? 'Platform Fee (API Key):'
            : platformFeeType === 'percentage'
              ? 'Platform Fee (1%):'
              : 'Platform Fee (flat):',
          display: platformFeeType === 'zero'
            ? '0 SOL (zero fee) 🎉'
            : platformFeeType === 'flat'
              ? `${formatSolWithUSD(platformFeeSol).display} (flat fee)`
              : formatSolWithUSD(platformFeeSol).display,
        },

        // Transaction size
        transactionSize: {
          estimated: estimatedSize,
          estimatedWithALT: willFitWithALT ? estimatedSizeWithALT : null,
          maxSize,
          willFit: exceedsMultiAssetLimit ? false : willFit,
          willFitWithALT: exceedsMultiAssetLimit ? false : willFitWithALT,
          altAvailable,
          useALT,
          altSavings: useALT ? altSavings : null,
          status: transactionStatus,
          breakdown: {
            signatures: signatureSize,
            accounts: accountKeySize,
            instructions: instructionDataSize + 4,
            cnftProofs: makerProofDataSize + takerProofDataSize,
          },
          details: {
            numSigners,
            numAccounts,
            makerProofNodes,
            takerProofNodes,
          },
        },

        // Warnings
        warnings,

        // Can proceed with swap?
        canSwap: transactionStatus !== 'too_large' && !exceedsMultiAssetLimit,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating quote:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate quote',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

