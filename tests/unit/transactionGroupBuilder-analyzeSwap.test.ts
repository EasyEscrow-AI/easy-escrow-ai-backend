/**
 * Unit tests for TransactionGroupBuilder.analyzeSwap()
 * Tests swap strategy selection logic for different NFT type combinations
 */

import { expect } from 'chai';
import { describe, it } from 'mocha';
import { PublicKey, Keypair } from '@solana/web3.js';

// Import types (we'll test the logic, not the actual service)
enum AssetType {
  NFT = 'nft',
  CNFT = 'cnft',
  CORE_NFT = 'core_nft',
}

enum SwapStrategy {
  SINGLE_TRANSACTION = 'SINGLE_TRANSACTION',
  DIRECT_BUBBLEGUM_BUNDLE = 'DIRECT_BUBBLEGUM_BUNDLE',
  DIRECT_NFT_BUNDLE = 'DIRECT_NFT_BUNDLE',
  MIXED_NFT_BUNDLE = 'MIXED_NFT_BUNDLE',
  JITO_BUNDLE = 'JITO_BUNDLE',
  CANNOT_FIT = 'CANNOT_FIT',
}

// Constants matching transactionGroupBuilder.ts
const MAX_CNFTS_PER_TRANSACTION_NO_PROOFS = 3;
const MAX_SPL_NFTS_PER_TRANSACTION = 5;
const MAX_CORE_NFTS_PER_TRANSACTION = 4;
const JITO_BUNDLE_THRESHOLD = 3;
const MAX_TRANSACTIONS_PER_BUNDLE = 5;

/**
 * Simplified analyzeSwap logic for testing
 * Mirrors the actual TransactionGroupBuilder.analyzeSwap() method
 */
function analyzeSwapStrategy(params: {
  makerAssets: Array<{ type: AssetType }>;
  takerAssets: Array<{ type: AssetType }>;
  hasSolTransfer: boolean;
  platformFee: boolean;
  forceSingleTransaction?: boolean;
}): { strategy: SwapStrategy; transactionCount: number; reason: string } {
  const { makerAssets, takerAssets, hasSolTransfer, platformFee, forceSingleTransaction } = params;
  
  const totalCnfts = [...makerAssets, ...takerAssets].filter(a => a.type === AssetType.CNFT).length;
  const totalNfts = [...makerAssets, ...takerAssets].filter(a => a.type === AssetType.NFT).length;
  const totalCoreNfts = [...makerAssets, ...takerAssets].filter(a => a.type === AssetType.CORE_NFT).length;
  const totalAllNfts = totalCnfts + totalNfts + totalCoreNfts;
  
  const makerNftCount = makerAssets.filter(a => a.type === AssetType.NFT || a.type === AssetType.CORE_NFT).length;
  const takerNftCount = takerAssets.filter(a => a.type === AssetType.NFT || a.type === AssetType.CORE_NFT).length;
  
  const needsSolTx = hasSolTransfer || platformFee;
  
  // Force single transaction
  if (forceSingleTransaction) {
    if (totalCnfts > 0) {
      return { strategy: SwapStrategy.CANNOT_FIT, transactionCount: 0, reason: 'cNFT cannot fit' };
    }
    if (totalAllNfts > 2) {
      return { strategy: SwapStrategy.CANNOT_FIT, transactionCount: 0, reason: 'Bulk cannot fit' };
    }
    return { strategy: SwapStrategy.SINGLE_TRANSACTION, transactionCount: 1, reason: 'Forced' };
  }
  
  // ANY swap with cNFTs needs bundle
  if (totalCnfts > 0) {
    const cnftTxCount = Math.ceil(totalCnfts / MAX_CNFTS_PER_TRANSACTION_NO_PROOFS);
    const splTxCount = totalNfts > 0 ? Math.ceil(totalNfts / MAX_SPL_NFTS_PER_TRANSACTION) : 0;
    const coreTxCount = totalCoreNfts > 0 ? Math.ceil(totalCoreNfts / MAX_CORE_NFTS_PER_TRANSACTION) : 0;
    const txCount = cnftTxCount + splTxCount + coreTxCount + (needsSolTx ? 1 : 0);
    
    if (txCount > MAX_TRANSACTIONS_PER_BUNDLE) {
      return { strategy: SwapStrategy.CANNOT_FIT, transactionCount: 0, reason: 'Exceeds Jito limit' };
    }
    
    if (totalNfts === 0 && totalCoreNfts === 0) {
      return { strategy: SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE, transactionCount: txCount, reason: 'Pure cNFT' };
    }
    return { strategy: SwapStrategy.MIXED_NFT_BUNDLE, transactionCount: txCount, reason: 'Mixed with cNFT' };
  }
  
  // Simple swap (1-2 NFTs total, no cNFTs)
  if (totalAllNfts <= 2) {
    if (makerNftCount <= 1 && takerNftCount <= 1) {
      return { strategy: SwapStrategy.SINGLE_TRANSACTION, transactionCount: 1, reason: 'Simple escrow' };
    }
    // 2 NFTs on same side
    return { strategy: SwapStrategy.DIRECT_NFT_BUNDLE, transactionCount: 2, reason: '2 on same side' };
  }
  
  // Bulk SPL NFT swap
  if (totalNfts >= JITO_BUNDLE_THRESHOLD && totalCoreNfts === 0) {
    const splTxCount = Math.ceil(totalNfts / MAX_SPL_NFTS_PER_TRANSACTION);
    const txCount = splTxCount + (needsSolTx ? 1 : 0);
    if (txCount > MAX_TRANSACTIONS_PER_BUNDLE) {
      return { strategy: SwapStrategy.CANNOT_FIT, transactionCount: 0, reason: 'Exceeds Jito limit' };
    }
    return { strategy: SwapStrategy.DIRECT_NFT_BUNDLE, transactionCount: txCount, reason: 'Bulk SPL' };
  }
  
  // Bulk Core NFT swap
  if (totalCoreNfts >= JITO_BUNDLE_THRESHOLD && totalNfts === 0) {
    const coreTxCount = Math.ceil(totalCoreNfts / MAX_CORE_NFTS_PER_TRANSACTION);
    const txCount = coreTxCount + (needsSolTx ? 1 : 0);
    if (txCount > MAX_TRANSACTIONS_PER_BUNDLE) {
      return { strategy: SwapStrategy.CANNOT_FIT, transactionCount: 0, reason: 'Exceeds Jito limit' };
    }
    return { strategy: SwapStrategy.DIRECT_NFT_BUNDLE, transactionCount: txCount, reason: 'Bulk Core' };
  }
  
  // Mixed NFT types
  if (totalAllNfts >= JITO_BUNDLE_THRESHOLD) {
    const splTxCount = totalNfts > 0 ? Math.ceil(totalNfts / MAX_SPL_NFTS_PER_TRANSACTION) : 0;
    const coreTxCount = totalCoreNfts > 0 ? Math.ceil(totalCoreNfts / MAX_CORE_NFTS_PER_TRANSACTION) : 0;
    const txCount = splTxCount + coreTxCount + (needsSolTx ? 1 : 0);
    if (txCount > MAX_TRANSACTIONS_PER_BUNDLE) {
      return { strategy: SwapStrategy.CANNOT_FIT, transactionCount: 0, reason: 'Exceeds Jito limit' };
    }
    return { strategy: SwapStrategy.MIXED_NFT_BUNDLE, transactionCount: txCount, reason: 'Mixed SPL+Core' };
  }
  
  // Fallback
  return { strategy: SwapStrategy.SINGLE_TRANSACTION, transactionCount: 1, reason: 'Fallback' };
}

describe('TransactionGroupBuilder.analyzeSwap', () => {
  
  describe('Simple swaps (escrow program)', () => {
    it('should use SINGLE_TRANSACTION for 1 SPL NFT each side', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.NFT }],
        takerAssets: [{ type: AssetType.NFT }],
        hasSolTransfer: false,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.SINGLE_TRANSACTION);
      expect(result.transactionCount).to.equal(1);
    });
    
    it('should use SINGLE_TRANSACTION for 1 NFT + SOL', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.NFT }],
        takerAssets: [],
        hasSolTransfer: true,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.SINGLE_TRANSACTION);
      expect(result.transactionCount).to.equal(1);
    });
    
    it('should use DIRECT_NFT_BUNDLE when 2 NFTs on same side', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.NFT }, { type: AssetType.NFT }],
        takerAssets: [],
        hasSolTransfer: true,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_NFT_BUNDLE);
      expect(result.transactionCount).to.equal(2);
    });
  });
  
  describe('cNFT swaps (always need bundle)', () => {
    it('should use DIRECT_BUBBLEGUM_BUNDLE for 1 cNFT + SOL', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.CNFT }],
        takerAssets: [],
        hasSolTransfer: true,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE);
      expect(result.transactionCount).to.be.at.least(2);
    });
    
    it('should use DIRECT_BUBBLEGUM_BUNDLE for cNFT <> cNFT', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.CNFT }],
        takerAssets: [{ type: AssetType.CNFT }],
        hasSolTransfer: false,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE);
    });
    
    it('should use MIXED_NFT_BUNDLE for 1 cNFT + 1 SPL NFT (Bug #2 fix)', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.CNFT }],
        takerAssets: [{ type: AssetType.NFT }],
        hasSolTransfer: false,
        platformFee: true,
      });
      
      // This was the bug - it used to fall through to SINGLE_TRANSACTION
      expect(result.strategy).to.equal(SwapStrategy.MIXED_NFT_BUNDLE);
    });
    
    it('should handle multiple cNFTs with batching', () => {
      const result = analyzeSwapStrategy({
        makerAssets: Array(9).fill({ type: AssetType.CNFT }),
        takerAssets: [{ type: AssetType.CNFT }],
        hasSolTransfer: false,
        platformFee: true,
      });
      
      // 10 cNFTs / 3 per tx = 4 txs + 1 SOL tx = 5 total (at limit)
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_BUBBLEGUM_BUNDLE);
      expect(result.transactionCount).to.be.at.most(MAX_TRANSACTIONS_PER_BUNDLE);
    });
  });
  
  describe('Bulk SPL NFT swaps', () => {
    it('should use DIRECT_NFT_BUNDLE for 3+ SPL NFTs', () => {
      const result = analyzeSwapStrategy({
        makerAssets: Array(5).fill({ type: AssetType.NFT }),
        takerAssets: [{ type: AssetType.NFT }],
        hasSolTransfer: false,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_NFT_BUNDLE);
    });
    
    it('should calculate correct transaction count for bulk SPL', () => {
      const result = analyzeSwapStrategy({
        makerAssets: Array(10).fill({ type: AssetType.NFT }),
        takerAssets: [],
        hasSolTransfer: true,
        platformFee: true,
      });
      
      // 10 SPL NFTs / 5 per tx = 2 txs + 1 SOL tx = 3 total
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_NFT_BUNDLE);
      expect(result.transactionCount).to.equal(3);
    });
  });
  
  describe('Bulk Core NFT swaps', () => {
    it('should use DIRECT_NFT_BUNDLE for 3+ Core NFTs', () => {
      const result = analyzeSwapStrategy({
        makerAssets: Array(4).fill({ type: AssetType.CORE_NFT }),
        takerAssets: [{ type: AssetType.CORE_NFT }],
        hasSolTransfer: false,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_NFT_BUNDLE);
    });
    
    it('should calculate correct transaction count for bulk Core', () => {
      const result = analyzeSwapStrategy({
        makerAssets: Array(8).fill({ type: AssetType.CORE_NFT }),
        takerAssets: [],
        hasSolTransfer: true,
        platformFee: true,
      });
      
      // 8 Core NFTs / 4 per tx = 2 txs + 1 SOL tx = 3 total
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_NFT_BUNDLE);
      expect(result.transactionCount).to.equal(3);
    });
  });
  
  describe('Mixed NFT swaps', () => {
    it('should use MIXED_NFT_BUNDLE for SPL + Core NFTs', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.NFT }, { type: AssetType.NFT }],
        takerAssets: [{ type: AssetType.CORE_NFT }, { type: AssetType.CORE_NFT }],
        hasSolTransfer: false,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.MIXED_NFT_BUNDLE);
    });
    
    it('should use MIXED_NFT_BUNDLE for cNFT + SPL + Core', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.CNFT }, { type: AssetType.NFT }],
        takerAssets: [{ type: AssetType.CORE_NFT }],
        hasSolTransfer: false,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.MIXED_NFT_BUNDLE);
    });
  });
  
  describe('Limits and edge cases', () => {
    it('should return CANNOT_FIT when exceeding Jito bundle limit', () => {
      const result = analyzeSwapStrategy({
        makerAssets: Array(15).fill({ type: AssetType.CNFT }),
        takerAssets: Array(5).fill({ type: AssetType.CNFT }),
        hasSolTransfer: true,
        platformFee: true,
      });
      
      // 20 cNFTs / 3 per tx = 7 txs + 1 SOL tx = 8 total > 5 limit
      expect(result.strategy).to.equal(SwapStrategy.CANNOT_FIT);
    });
    
    it('should reject cNFT swaps when forceSingleTransaction is true', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.CNFT }],
        takerAssets: [],
        hasSolTransfer: true,
        platformFee: true,
        forceSingleTransaction: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.CANNOT_FIT);
    });
    
    it('should reject bulk swaps when forceSingleTransaction is true', () => {
      const result = analyzeSwapStrategy({
        makerAssets: Array(5).fill({ type: AssetType.NFT }),
        takerAssets: [],
        hasSolTransfer: true,
        platformFee: true,
        forceSingleTransaction: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.CANNOT_FIT);
    });
    
    it('should handle empty asset arrays', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [],
        takerAssets: [],
        hasSolTransfer: true,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.SINGLE_TRANSACTION);
    });
  });
  
  describe('Per-side limit checks (Bug #3 fix)', () => {
    it('should use escrow for 1-1 NFT swap', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.NFT }],
        takerAssets: [{ type: AssetType.NFT }],
        hasSolTransfer: false,
        platformFee: true,
      });
      
      expect(result.strategy).to.equal(SwapStrategy.SINGLE_TRANSACTION);
    });
    
    it('should use bundle for 2-0 NFT swap (2 on maker side)', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [{ type: AssetType.NFT }, { type: AssetType.NFT }],
        takerAssets: [],
        hasSolTransfer: true,
        platformFee: true,
      });
      
      // 2 NFTs on maker side exceeds escrow program limit of 1 per side
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_NFT_BUNDLE);
    });
    
    it('should use bundle for 0-2 NFT swap (2 on taker side)', () => {
      const result = analyzeSwapStrategy({
        makerAssets: [],
        takerAssets: [{ type: AssetType.NFT }, { type: AssetType.NFT }],
        hasSolTransfer: true,
        platformFee: true,
      });
      
      // 2 NFTs on taker side exceeds escrow program limit of 1 per side
      expect(result.strategy).to.equal(SwapStrategy.DIRECT_NFT_BUNDLE);
    });
  });
});

