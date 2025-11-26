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
  res.json({
    success: true,
    data: {
      makerAddress: process.env.DEVNET_STAGING_SENDER_ADDRESS,
      takerAddress: process.env.DEVNET_STAGING_RECEIVER_ADDRESS,
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
        return amount === 1 && decimals === 0;
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
          cNfts = dasData.result.items
            .filter((asset: any) => asset.compression?.compressed === true)
            .map((asset: any) => ({
              mint: asset.id,
              tokenAccount: null, // cNFTs don't have token accounts
              isCompressed: true,
              name: asset.content?.metadata?.name || 'Unknown cNFT',
              image: asset.content?.files?.[0]?.uri || asset.content?.links?.image || null,
              symbol: asset.content?.metadata?.symbol || '',
            }));
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

export default router;

