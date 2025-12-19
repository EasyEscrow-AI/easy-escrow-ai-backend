/**
 * Assets Routes
 *
 * Provides information about supported assets and their chains
 * for the EasyEscrow.ai atomic swap platform.
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Supported asset types for atomic swaps
 */
interface SupportedAsset {
  id: string;
  name: string;
  description: string;
  chain: string;
  chainId: string;
  status: 'active' | 'coming_soon' | 'deprecated';
  type: 'nft' | 'token';
  standard?: string;
}

const SUPPORTED_ASSETS: SupportedAsset[] = [
  {
    id: 'spl-nft',
    name: 'SPL NFT',
    description: 'Solana SPL Token NFT (Metaplex standard)',
    chain: 'Solana',
    chainId: 'solana',
    status: 'active',
    type: 'nft',
    standard: 'Metaplex Token Metadata',
  },
  {
    id: 'core-nft',
    name: 'Core NFT',
    description: 'Solana Metaplex Core NFT',
    chain: 'Solana',
    chainId: 'solana',
    status: 'active',
    type: 'nft',
    standard: 'Metaplex Core',
  },
  {
    id: 'cnft',
    name: 'cNFT',
    description: 'Solana Compressed NFT (Metaplex Bubblegum)',
    chain: 'Solana',
    chainId: 'solana',
    status: 'active',
    type: 'nft',
    standard: 'Metaplex Bubblegum',
  },
  {
    id: 'sol',
    name: 'SOL',
    description: 'Solana native token',
    chain: 'Solana',
    chainId: 'solana',
    status: 'active',
    type: 'token',
  },
];

/**
 * GET /api/assets
 *
 * Returns a list of all supported assets and their chains.
 * This endpoint provides information about what asset types
 * can be used in atomic swaps on the platform.
 */
router.get('/api/assets', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    data: {
      assets: SUPPORTED_ASSETS,
      chains: [
        {
          id: 'solana',
          name: 'Solana',
          status: 'active',
        },
      ],
      summary: {
        totalAssets: SUPPORTED_ASSETS.length,
        activeAssets: SUPPORTED_ASSETS.filter((a) => a.status === 'active').length,
        supportedChains: 1,
      },
    },
  });
});

/**
 * GET /api/assets/:assetId
 *
 * Returns detailed information about a specific asset type.
 */
router.get('/api/assets/:assetId', (req: Request, res: Response) => {
  const { assetId } = req.params;

  const asset = SUPPORTED_ASSETS.find((a) => a.id === assetId);

  if (!asset) {
    return res.status(404).json({
      success: false,
      error: 'Asset not found',
      message: `Asset '${assetId}' is not supported. Available assets: ${SUPPORTED_ASSETS.map(
        (a) => a.id
      ).join(', ')}`,
    });
  }

  res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    data: asset,
  });
});

export default router;
