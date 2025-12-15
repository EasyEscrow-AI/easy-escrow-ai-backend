/**
 * Unit Tests for CnftService
 * Tests cNFT service operations with mocked DAS API responses
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { CnftService, CnftServiceConfig } from '../../src/services/cnftService';
import { DasProofResponse, CnftAssetData } from '../../src/types/cnft';
import { BUBBLEGUM_PROGRAM_ID } from '../../src/constants/bubblegum';

describe('CnftService', () => {
  let connection: Connection;
  let cnftService: CnftService;
  let mockConnection: any;
  let originalRpcRequest: any;

  const mockAssetId = 'test-cnft-asset-id-123';
  const mockTreeAddress = new PublicKey('11111111111111111111111111111111');
  const mockOwnerAddress = new PublicKey('22222222222222222222222222222222');
  const mockToAddress = new PublicKey('33333333333333333333333333333333');

  const mockAssetData: CnftAssetData = {
    id: mockAssetId,
    compression: {
      compressed: true,
      tree: mockTreeAddress.toBase58(),
      leaf_id: 0,
      data_hash: 'data-hash-123',
      creator_hash: 'creator-hash-123',
      asset_hash: 'asset-hash-123',
    },
    ownership: {
      owner: mockOwnerAddress.toBase58(),
    },
    content: {
      metadata: {
        name: 'Test cNFT',
        symbol: 'TEST',
      },
      json_uri: 'https://example.com/metadata.json',
    },
  };

  const mockProofResponse: DasProofResponse = {
    root: 'root-hash-123',
    proof: ['proof-node-1', 'proof-node-2', 'proof-node-3'],
    node_index: 0,
    leaf: 'leaf-hash-123',
    tree_id: mockTreeAddress.toBase58(),
  };

  beforeEach(() => {
    // Create mock connection
    connection = new Connection('https://api.devnet.solana.com');
    mockConnection = connection as any;

    // Mock _rpcRequest method
    originalRpcRequest = mockConnection._rpcRequest;
    mockConnection._rpcRequest = async (method: string, params: any) => {
      if (method === 'getAsset') {
        return {
          result: mockAssetData,
        };
      }
      if (method === 'getAssetProof') {
        return {
          result: mockProofResponse,
        };
      }
      if (method === 'getAccountInfo') {
        // Mock tree account info
        return {
          value: {
            data: Buffer.alloc(1000), // Mock account data
            owner: BUBBLEGUM_PROGRAM_ID.toBase58(),
          },
        };
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    };

    const config: Partial<CnftServiceConfig> = {
      requestTimeout: 5000,
      maxRetries: 2,
      maxConcurrentRequests: 3,
      batchDelayMs: 100,
      proofCacheTtlSeconds: 30,
    };

    cnftService = new CnftService(connection, config);
  });

  afterEach(() => {
    // Restore original RPC request
    if (originalRpcRequest) {
      mockConnection._rpcRequest = originalRpcRequest;
    }
  });

  describe('getCnftAsset', () => {
    it('should fetch cNFT asset data from DAS API', async () => {
      const asset = await cnftService.getCnftAsset(mockAssetId);

      expect(asset).to.exist;
      expect(asset.id).to.equal(mockAssetId);
      expect(asset.compression.compressed).to.be.true;
      expect(asset.compression.tree).to.equal(mockTreeAddress.toBase58());
      expect(asset.ownership.owner).to.equal(mockOwnerAddress.toBase58());
    });

    it('should throw error for non-compressed asset', async () => {
      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAsset') {
          return {
            result: {
              ...mockAssetData,
              compression: { compressed: false },
            },
          };
        }
      };

      try {
        await cnftService.getCnftAsset(mockAssetId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('not a compressed NFT');
      }
    });

    it('should handle invalid asset ID', async () => {
      mockConnection._rpcRequest = async () => {
        return { result: null };
      };

      try {
        await cnftService.getCnftAsset('invalid-id');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('No asset data returned');
      }
    });

    it('should handle network failures with retries', async () => {
      let attemptCount = 0;
      mockConnection._rpcRequest = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Network error');
        }
        return { result: mockAssetData };
      };

      const asset = await cnftService.getCnftAsset(mockAssetId);
      expect(asset).to.exist;
      expect(attemptCount).to.equal(2);
    });
  });

  describe('getCnftProof', () => {
    it('should fetch Merkle proof from DAS API', async () => {
      const proof = await cnftService.getCnftProof(mockAssetId);

      expect(proof).to.exist;
      expect(proof.root).to.equal(mockProofResponse.root);
      expect(proof.proof).to.be.an('array');
      expect(proof.proof.length).to.equal(3);
      expect(proof.tree_id).to.equal(mockTreeAddress.toBase58());
    });

    it('should cache proof and return cached version', async () => {
      let fetchCount = 0;
      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          fetchCount++;
          return { result: mockProofResponse };
        }
      };

      // First fetch
      const proof1 = await cnftService.getCnftProof(mockAssetId);
      expect(fetchCount).to.equal(1);

      // Second fetch should use cache
      const proof2 = await cnftService.getCnftProof(mockAssetId);
      expect(fetchCount).to.equal(1); // Should not fetch again
      expect(proof1.root).to.equal(proof2.root);
    });

    it('should skip cache when skipCache is true', async () => {
      let fetchCount = 0;
      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          fetchCount++;
          return { result: mockProofResponse };
        }
      };

      await cnftService.getCnftProof(mockAssetId);
      await cnftService.getCnftProof(mockAssetId, true); // Skip cache
      expect(fetchCount).to.equal(2);
    });

    it('should handle proof fetch failures', async () => {
      mockConnection._rpcRequest = async () => {
        return { result: null };
      };

      try {
        await cnftService.getCnftProof(mockAssetId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('No proof data returned');
      }
    });

    it('should track metrics for proof fetches', async () => {
      await cnftService.getCnftProof(mockAssetId);
      const metrics = cnftService.getMetrics();

      expect(metrics.totalProofFetches).to.be.greaterThan(0);
      expect(metrics.proofCacheMisses).to.be.greaterThan(0);
    });
  });

  describe('batchGetCnftProofs', () => {
    it('should fetch multiple proofs in batches', async () => {
      const assetIds = [mockAssetId, 'asset-2', 'asset-3'];
      let fetchCount = 0;

      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          fetchCount++;
          return { result: mockProofResponse };
        }
      };

      const results = await cnftService.batchGetCnftProofs(assetIds, 2);

      expect(results.size).to.equal(3);
      expect(fetchCount).to.equal(3);
    });

    it('should use cache for repeated asset IDs', async () => {
      const assetIds = [mockAssetId, mockAssetId, mockAssetId];
      let fetchCount = 0;

      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          fetchCount++;
          return { result: mockProofResponse };
        }
      };

      // First batch
      await cnftService.batchGetCnftProofs(assetIds, 3);
      expect(fetchCount).to.equal(1); // Only one unique asset

      // Second batch should use cache
      const results = await cnftService.batchGetCnftProofs(assetIds, 3);
      expect(fetchCount).to.equal(1); // Still only one fetch
      expect(results.size).to.equal(1); // Map has unique keys, so size is 1 for duplicate assetIds
    });

    it('should handle partial failures in batch', async () => {
      const assetIds = ['asset-1', 'asset-2', 'asset-3'];
      let fetchCount = 0;

      mockConnection._rpcRequest = async (method: string, params: any) => {
        if (method === 'getAssetProof') {
          fetchCount++;
          if (params.id === 'asset-2') {
            throw new Error('Proof fetch failed');
          }
          return { result: mockProofResponse };
        }
      };

      const results = await cnftService.batchGetCnftProofs(assetIds, 2);

      // Should still return successful proofs
      expect(results.size).to.equal(2);
      expect(results.has('asset-1')).to.be.true;
      expect(results.has('asset-3')).to.be.true;
      expect(results.has('asset-2')).to.be.false;
    });
  });

  describe('deriveTreeAuthority', () => {
    it('should derive correct tree authority PDA', () => {
      const treeAuthority = cnftService.deriveTreeAuthority(mockTreeAddress);

      expect(treeAuthority).to.exist;
      expect(treeAuthority.toBase58()).to.be.a('string');
      expect(treeAuthority.toBase58().length).to.equal(44); // Base58 encoded public key
    });

    it('should derive same authority for same tree', () => {
      const authority1 = cnftService.deriveTreeAuthority(mockTreeAddress);
      const authority2 = cnftService.deriveTreeAuthority(mockTreeAddress);

      expect(authority1.toBase58()).to.equal(authority2.toBase58());
    });

    it('should derive different authority for different trees', () => {
      const tree1 = new PublicKey('11111111111111111111111111111111');
      const tree2 = new PublicKey('22222222222222222222222222222222');

      const authority1 = cnftService.deriveTreeAuthority(tree1);
      const authority2 = cnftService.deriveTreeAuthority(tree2);

      expect(authority1.toBase58()).to.not.equal(authority2.toBase58());
    });
  });

  describe('buildTransferParams', () => {
    it('should build transfer params from asset and proof', async () => {
      const params = await cnftService.buildTransferParams(
        mockAssetId,
        mockOwnerAddress,
        mockToAddress
      );

      expect(params).to.exist;
      expect(params.treeAddress.toBase58()).to.equal(mockTreeAddress.toBase58());
      expect(params.fromAddress.toBase58()).to.equal(mockOwnerAddress.toBase58());
      expect(params.toAddress.toBase58()).to.equal(mockToAddress.toBase58());
      expect(params.proof).to.exist;
      expect(params.treeAuthorityAddress).to.exist;
    });

    it('should throw error for ownership mismatch', async () => {
      const wrongOwner = new PublicKey('99999999999999999999999999999999');

      try {
        await cnftService.buildTransferParams(mockAssetId, wrongOwner, mockToAddress);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Ownership mismatch');
      }
    });

    it('should fetch asset and proof in parallel', async () => {
      let assetFetched = false;
      let proofFetched = false;

      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAsset') {
          assetFetched = true;
          return { result: mockAssetData };
        }
        if (method === 'getAssetProof') {
          proofFetched = true;
          return { result: mockProofResponse };
        }
      };

      await cnftService.buildTransferParams(mockAssetId, mockOwnerAddress, mockToAddress);

      expect(assetFetched).to.be.true;
      expect(proofFetched).to.be.true;
    });
  });

  describe('getTreeCanopyDepth', () => {
    it('should return default canopy depth when tree account not found', async () => {
      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAccountInfo') {
          return { value: null };
        }
      };

      const depth = await cnftService.getTreeCanopyDepth(mockTreeAddress);
      expect(depth).to.equal(11); // Default for standard Metaplex trees
    });

    it('should handle tree account fetch errors gracefully', async () => {
      mockConnection._rpcRequest = async () => {
        throw new Error('RPC error');
      };

      const depth = await cnftService.getTreeCanopyDepth(mockTreeAddress);
      expect(depth).to.equal(11); // Should fallback to default
    });
  });

  describe('verifyProofFreshness', () => {
    it('should verify proof freshness (delegated to on-chain validation)', async () => {
      const isValid = await cnftService.verifyProofFreshness(
        mockTreeAddress,
        Buffer.from('proof-root-123')
      );

      // Currently delegates to on-chain validation, returns true
      expect(isValid).to.be.true;
    });
  });

  describe('Rate Limiting', () => {
    it('should respect max concurrent requests', async () => {
      const config: Partial<CnftServiceConfig> = {
        maxConcurrentRequests: 2,
      };
      const limitedService = new CnftService(connection, config);

      let activeRequests = 0;
      let maxConcurrent = 0;

      mockConnection._rpcRequest = async () => {
        activeRequests++;
        maxConcurrent = Math.max(maxConcurrent, activeRequests);
        await new Promise(resolve => setTimeout(resolve, 50));
        activeRequests--;
        return { result: mockProofResponse };
      };

      // Start 5 concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        limitedService.getCnftProof('asset-' + Math.random())
      );

      await Promise.all(promises);

      // Should not exceed max concurrent
      expect(maxConcurrent).to.be.at.most(2);
    });
  });

  describe('Cache Management', () => {
    it('should expire cached proofs after TTL', async () => {
      const config: Partial<CnftServiceConfig> = {
        proofCacheTtlSeconds: 1, // 1 second TTL
      };
      const shortTtlService = new CnftService(connection, config);

      let fetchCount = 0;
      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          fetchCount++;
          return { result: mockProofResponse };
        }
      };

      // First fetch
      await shortTtlService.getCnftProof(mockAssetId);
      expect(fetchCount).to.equal(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Second fetch should fetch again
      await shortTtlService.getCnftProof(mockAssetId);
      expect(fetchCount).to.equal(2);
    });
  });
});

