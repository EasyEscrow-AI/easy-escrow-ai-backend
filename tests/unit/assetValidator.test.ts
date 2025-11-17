/**
 * Unit Tests for AssetValidator Service
 * Tests NFT and cNFT ownership validation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AssetValidator, AssetInfo, AssetType } from '../../src/services/assetValidator';

// Mock Solana Connection
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getTokenAccountsByOwner: jest.fn(),
      getAccountInfo: jest.fn(),
    })),
    PublicKey: actual.PublicKey,
  };
});

// Mock fetch for Helius API calls
global.fetch = jest.fn();

describe('AssetValidator', () => {
  let assetValidator: AssetValidator;
  let mockConnection: jest.Mocked<Connection>;
  const mockHeliusApiKey = 'test-helius-api-key';
  
  beforeEach(() => {
    mockConnection = new Connection('http://localhost:8899') as jest.Mocked<Connection>;
    assetValidator = new AssetValidator(mockConnection, { heliusApiKey: mockHeliusApiKey });
    
    // Clear fetch mock
    (global.fetch as jest.Mock).mockClear();
  });
  
  describe('Initialization', () => {
    it('should create instance with default configuration', () => {
      const validator = new AssetValidator(mockConnection);
      
      expect(validator).toBeInstanceOf(AssetValidator);
    });
    
    it('should create instance with custom configuration', () => {
      const validator = new AssetValidator(mockConnection, {
        heliusApiKey: 'custom-key',
        maxRetries: 5,
        retryDelayMs: 2000,
      });
      
      expect(validator).toBeInstanceOf(AssetValidator);
    });
  });
  
  describe('SPL NFT Validation', () => {
    it('should validate owned SPL NFT successfully', async () => {
      const walletAddress = 'test-wallet-address';
      const mintAddress = 'test-mint-address';
      
      const asset: AssetInfo = {
        standard: AssetType.NFT,
        mint: mintAddress,
        amount: 1,
      };
      
      // Mock token account response
      (mockConnection.getTokenAccountsByOwner as jest.Mock).mockResolvedValue({
        value: [
          {
            pubkey: new PublicKey('mock-token-account'),
            account: {
              data: {
                parsed: {
                  info: {
                    mint: mintAddress,
                    tokenAmount: {
                      amount: '1',
                      decimals: 0,
                    },
                  },
                },
              },
            },
          },
        ],
      });
      
      const result = await assetValidator.validateAssets(walletAddress, [asset]);
      
      expect(result.valid).toBe(true);
      expect(result.validatedAssets).toHaveLength(1);
      expect(result.validatedAssets[0].mint).toBe(mintAddress);
    });
    
    it('should reject SPL NFT if not owned', async () => {
      const walletAddress = 'test-wallet-address';
      const mintAddress = 'test-mint-address';
      
      const asset: AssetInfo = {
        standard: AssetType.NFT,
        mint: mintAddress,
        amount: 1,
      };
      
      // Mock empty token accounts
      (mockConnection.getTokenAccountsByOwner as jest.Mock).mockResolvedValue({
        value: [],
      });
      
      const result = await assetValidator.validateAssets(walletAddress, [asset]);
      
      expect(result.valid).toBe(false);
      expect(result.invalidAssets).toHaveLength(1);
      expect(result.invalidAssets[0].reason).toContain('not found');
    });
    
    it('should validate multiple SPL NFTs', async () => {
      const walletAddress = 'test-wallet-address';
      const assets: AssetInfo[] = [
        { standard: AssetType.NFT, mint: 'mint-1', amount: 1 },
        { standard: AssetType.NFT, mint: 'mint-2', amount: 1 },
      ];
      
      // Mock token accounts for both mints
      (mockConnection.getTokenAccountsByOwner as jest.Mock).mockResolvedValue({
        value: [
          {
            pubkey: new PublicKey('token-account-1'),
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'mint-1',
                    tokenAmount: { amount: '1', decimals: 0 },
                  },
                },
              },
            },
          },
          {
            pubkey: new PublicKey('token-account-2'),
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'mint-2',
                    tokenAmount: { amount: '1', decimals: 0 },
                  },
                },
              },
            },
          },
        ],
      });
      
      const result = await assetValidator.validateAssets(walletAddress, assets);
      
      expect(result.valid).toBe(true);
      expect(result.validatedAssets).toHaveLength(2);
    });
    
    it('should reject SPL NFT with wrong amount', async () => {
      const walletAddress = 'test-wallet-address';
      const asset: AssetInfo = {
        standard: AssetType.NFT,
        mint: 'test-mint',
        amount: 2, // NFTs should have amount = 1
      };
      
      (mockConnection.getTokenAccountsByOwner as jest.Mock).mockResolvedValue({
        value: [
          {
            pubkey: new PublicKey('token-account'),
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'test-mint',
                    tokenAmount: { amount: '1', decimals: 0 },
                  },
                },
              },
            },
          },
        ],
      });
      
      const result = await assetValidator.validateAssets(walletAddress, [asset]);
      
      expect(result.valid).toBe(false);
      expect(result.invalidAssets[0].reason).toContain('amount mismatch');
    });
  });
  
  describe('cNFT Validation', () => {
    it('should validate owned cNFT successfully', async () => {
      const walletAddress = 'test-wallet-address';
      const assetId = 'test-cnft-asset-id';
      
      const asset: AssetInfo = {
        standard: AssetType.CNFT,
        assetId,
        amount: 1,
      };
      
      // Mock Helius API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: assetId,
          ownership: {
            owner: walletAddress,
            frozen: false,
          },
          compression: {
            tree: 'test-tree-id',
            leaf_id: 42,
          },
          burnt: false,
        }),
      });
      
      const result = await assetValidator.validateAssets(walletAddress, [asset]);
      
      expect(result.valid).toBe(true);
      expect(result.validatedAssets).toHaveLength(1);
      expect(result.validatedAssets[0].assetId).toBe(assetId);
      expect(result.validatedAssets[0].tree).toBe('test-tree-id');
      expect(result.validatedAssets[0].leafIndex).toBe(42);
    });
    
    it('should reject cNFT if not owned', async () => {
      const walletAddress = 'test-wallet-address';
      const asset: AssetInfo = {
        standard: AssetType.CNFT,
        assetId: 'test-cnft-asset-id',
        amount: 1,
      };
      
      // Mock Helius API response with different owner
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-cnft-asset-id',
          ownership: {
            owner: 'different-wallet-address',
            frozen: false,
          },
          compression: {
            tree: 'test-tree-id',
            leaf_id: 42,
          },
          burnt: false,
        }),
      });
      
      const result = await assetValidator.validateAssets(walletAddress, [asset]);
      
      expect(result.valid).toBe(false);
      expect(result.invalidAssets[0].reason).toContain('Owner mismatch');
    });
    
    it('should reject frozen cNFT', async () => {
      const walletAddress = 'test-wallet-address';
      const asset: AssetInfo = {
        standard: AssetType.CNFT,
        assetId: 'test-cnft-asset-id',
        amount: 1,
      };
      
      // Mock Helius API response with frozen asset
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-cnft-asset-id',
          ownership: {
            owner: walletAddress,
            frozen: true, // Frozen
          },
          compression: {
            tree: 'test-tree-id',
            leaf_id: 42,
          },
          burnt: false,
        }),
      });
      
      const result = await assetValidator.validateAssets(walletAddress, [asset]);
      
      expect(result.valid).toBe(false);
      expect(result.invalidAssets[0].reason).toContain('frozen');
    });
    
    it('should reject burnt cNFT', async () => {
      const walletAddress = 'test-wallet-address';
      const asset: AssetInfo = {
        standard: AssetType.CNFT,
        assetId: 'test-cnft-asset-id',
        amount: 1,
      };
      
      // Mock Helius API response with burnt asset
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-cnft-asset-id',
          ownership: {
            owner: walletAddress,
            frozen: false,
          },
          compression: {
            tree: 'test-tree-id',
            leaf_id: 42,
          },
          burnt: true, // Burnt
        }),
      });
      
      const result = await assetValidator.validateAssets(walletAddress, [asset]);
      
      expect(result.valid).toBe(false);
      expect(result.invalidAssets[0].reason).toContain('burnt');
    });
    
    it('should handle Helius API errors with retries', async () => {
      const walletAddress = 'test-wallet-address';
      const asset: AssetInfo = {
        standard: AssetType.CNFT,
        assetId: 'test-cnft-asset-id',
        amount: 1,
      };
      
      // First two calls fail, third succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test-cnft-asset-id',
            ownership: {
              owner: walletAddress,
              frozen: false,
            },
            compression: {
              tree: 'test-tree-id',
              leaf_id: 42,
            },
            burnt: false,
          }),
        });
      
      const result = await assetValidator.validateAssets(walletAddress, [asset]);
      
      expect(result.valid).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('Mixed Asset Validation', () => {
    it('should validate mixed SPL NFTs and cNFTs', async () => {
      const walletAddress = 'test-wallet-address';
      const assets: AssetInfo[] = [
        { standard: AssetType.NFT, mint: 'spl-mint-1', amount: 1 },
        { standard: AssetType.CNFT, assetId: 'cnft-id-1', amount: 1 },
      ];
      
      // Mock SPL NFT validation
      (mockConnection.getTokenAccountsByOwner as jest.Mock).mockResolvedValue({
        value: [
          {
            pubkey: new PublicKey('token-account'),
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'spl-mint-1',
                    tokenAmount: { amount: '1', decimals: 0 },
                  },
                },
              },
            },
          },
        ],
      });
      
      // Mock cNFT validation
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'cnft-id-1',
          ownership: {
            owner: walletAddress,
            frozen: false,
          },
          compression: {
            tree: 'test-tree',
            leaf_id: 10,
          },
          burnt: false,
        }),
      });
      
      const result = await assetValidator.validateAssets(walletAddress, assets);
      
      expect(result.valid).toBe(true);
      expect(result.validatedAssets).toHaveLength(2);
    });
    
    it('should report partial validation failures', async () => {
      const walletAddress = 'test-wallet-address';
      const assets: AssetInfo[] = [
        { standard: AssetType.NFT, mint: 'spl-mint-1', amount: 1 }, // Valid
        { standard: AssetType.CNFT, assetId: 'cnft-id-1', amount: 1 }, // Invalid
      ];
      
      // Mock SPL NFT validation (valid)
      (mockConnection.getTokenAccountsByOwner as jest.Mock).mockResolvedValue({
        value: [
          {
            pubkey: new PublicKey('token-account'),
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'spl-mint-1',
                    tokenAmount: { amount: '1', decimals: 0 },
                  },
                },
              },
            },
          },
        ],
      });
      
      // Mock cNFT validation (invalid - burnt)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'cnft-id-1',
          ownership: {
            owner: walletAddress,
            frozen: false,
          },
          compression: {
            tree: 'test-tree',
            leaf_id: 10,
          },
          burnt: true,
        }),
      });
      
      const result = await assetValidator.validateAssets(walletAddress, assets);
      
      expect(result.valid).toBe(false);
      expect(result.validatedAssets).toHaveLength(1);
      expect(result.invalidAssets).toHaveLength(1);
    });
  });
  
  describe('Merkle Proof Fetching', () => {
    it('should fetch Merkle proof for cNFT', async () => {
      const assetId = 'test-cnft-asset-id';
      
      // Mock Helius Merkle proof response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tree_id: 'test-tree-id',
          leaf_index: 42,
          proof: ['hash1', 'hash2', 'hash3'],
          root: 'root-hash',
        }),
      });
      
      const proof = await assetValidator.fetchMerkleProof(assetId);
      
      expect(proof).toEqual({
        treeId: 'test-tree-id',
        leafIndex: 42,
        proof: ['hash1', 'hash2', 'hash3'],
        root: 'root-hash',
      });
    });
    
    it('should retry Merkle proof fetching on failure', async () => {
      const assetId = 'test-cnft-asset-id';
      
      // First call fails, second succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            tree_id: 'test-tree-id',
            leaf_index: 42,
            proof: ['hash1', 'hash2'],
            root: 'root-hash',
          }),
        });
      
      const proof = await assetValidator.fetchMerkleProof(assetId);
      
      expect(proof).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    
    it('should throw error after max retries', async () => {
      const assetId = 'test-cnft-asset-id';
      
      // All calls fail
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Persistent API error'));
      
      await expect(assetValidator.fetchMerkleProof(assetId)).rejects.toThrow();
    });
  });
  
  describe('Revalidation', () => {
    it('should revalidate assets when flag is set', async () => {
      const walletAddress = 'test-wallet-address';
      const asset: AssetInfo = {
        standard: AssetType.NFT,
        mint: 'test-mint',
        amount: 1,
      };
      
      (mockConnection.getTokenAccountsByOwner as jest.Mock).mockResolvedValue({
        value: [
          {
            pubkey: new PublicKey('token-account'),
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'test-mint',
                    tokenAmount: { amount: '1', decimals: 0 },
                  },
                },
              },
            },
          },
        ],
      });
      
      // First validation
      await assetValidator.validateAssets(walletAddress, [asset]);
      
      // Second validation with revalidate flag
      await assetValidator.validateAssets(walletAddress, [asset], { revalidate: true });
      
      // Should have called RPC twice
      expect(mockConnection.getTokenAccountsByOwner).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle empty asset array', async () => {
      const result = await assetValidator.validateAssets('test-wallet', []);
      
      expect(result.valid).toBe(true);
      expect(result.validatedAssets).toHaveLength(0);
      expect(result.invalidAssets).toHaveLength(0);
    });
    
    it('should handle invalid asset type', async () => {
      const asset: any = {
        standard: 'invalid-type',
        mint: 'test-mint',
        amount: 1,
      };
      
      const result = await assetValidator.validateAssets('test-wallet', [asset]);
      
      expect(result.valid).toBe(false);
      expect(result.invalidAssets).toHaveLength(1);
    });
    
    it('should handle missing required fields', async () => {
      const asset: any = {
        standard: AssetType.NFT,
        // Missing mint
        amount: 1,
      };
      
      const result = await assetValidator.validateAssets('test-wallet', [asset]);
      
      expect(result.valid).toBe(false);
      expect(result.invalidAssets[0].reason).toContain('Missing required field');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle RPC errors gracefully', async () => {
      const asset: AssetInfo = {
        standard: AssetType.NFT,
        mint: 'test-mint',
        amount: 1,
      };
      
      (mockConnection.getTokenAccountsByOwner as jest.Mock).mockRejectedValue(
        new Error('RPC node down')
      );
      
      await expect(
        assetValidator.validateAssets('test-wallet', [asset])
      ).rejects.toThrow('RPC node down');
    });
    
    it('should handle Helius API errors gracefully', async () => {
      const asset: AssetInfo = {
        standard: AssetType.CNFT,
        assetId: 'test-cnft',
        amount: 1,
      };
      
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Helius API unavailable'));
      
      await expect(
        assetValidator.validateAssets('test-wallet', [asset])
      ).rejects.toThrow();
    });
  });
});

