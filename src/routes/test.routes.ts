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

    // Get token accounts (NFTs)
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });

    // Filter for NFTs (amount = 1, decimals = 0)
    const nfts = tokenAccounts.value
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
        };
      });

    // If Helius API key is available, get metadata
    const heliusApiKey = process.env.HELIUS_API_KEY;
    let nftsWithMetadata = nfts;

    if (heliusApiKey && nfts.length > 0) {
      try {
        // Determine Helius endpoint based on Solana RPC URL
        const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const isDevnet = rpcUrl.includes('devnet');
        const heliusUrl = isDevnet 
          ? `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`
          : `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
        
        const response = await fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'test-page',
            method: 'getAssetBatch',
            params: {
              ids: nfts.map((nft) => nft.mint),
            },
          }),
        });

        const data = await response.json() as any;
        if (data.result) {
          nftsWithMetadata = nfts.map((nft, index) => {
            const metadata = data.result[index];
            return {
              ...nft,
              name: metadata?.content?.metadata?.name || 'Unknown NFT',
              image: metadata?.content?.files?.[0]?.uri || metadata?.content?.links?.image || null,
              isCompressed: metadata?.compression?.compressed || false,
            };
          });
        }
      } catch (error) {
        console.warn('Failed to fetch NFT metadata from Helius:', error);
        // Continue with basic NFT data
      }
    }

    res.json({
      success: true,
      data: {
        address: address,
        solBalance: solBalance,
        solBalanceLamports: balance,
        nfts: nftsWithMetadata,
        nftCount: nftsWithMetadata.length,
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

