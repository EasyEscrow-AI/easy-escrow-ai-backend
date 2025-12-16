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

// Store original fetch
const originalFetch = global.fetch;

describe('CnftService', () => {
  let connection: Connection;
  let cnftService: CnftService;
  let mockFetch: any;

  const mockAssetId = 'test-cnft-asset-id-123';
  // Use valid base58 public keys
  const mockTreeAddress = PublicKey.default; // Valid placeholder
  const mockOwnerAddress = Keypair.generate().publicKey; // Valid generated key
  const mockToAddress = Keypair.generate().publicKey; // Valid generated key

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

    // Mock global fetch for DAS API calls
    mockFetch = async (url: string, options?: any) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      const method = body.method;

      // Mock getAsset
      if (method === 'getAsset') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: mockAssetData,
          }),
        } as Response;
      }

      // Mock getAssetProof
      if (method === 'getAssetProof') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: mockProofResponse,
          }),
        } as Response;
      }

      // Default response
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
      } as Response;
    };

    global.fetch = mockFetch as any;

    // Mock getAccountInfo for tree account
    (connection as any).getAccountInfo = async () => {
      return {
        data: Buffer.alloc(1000), // Mock account data
        owner: BUBBLEGUM_PROGRAM_ID,
        executable: false,
        lamports: 0,
      };
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
    // Restore original fetch
    global.fetch = originalFetch;
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
      global.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              ...mockAssetData,
              compression: { compressed: false },
            },
          }),
        } as Response;
      }) as typeof fetch;

      try {
        await cnftService.getCnftAsset(mockAssetId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('not a compressed NFT');
      }
    });

    it('should handle invalid asset ID', async () => {
      global.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: null,
          }),
        } as Response;
      }) as typeof fetch;

      try {
        await cnftService.getCnftAsset('invalid-id');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('No asset data returned');
      }
    });

    it('should handle network failures with retries', async () => {
      let attemptCount = 0;
      global.fetch = (async () => {
        attemptCount++;
        if (attemptCount < 2) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: async () => 'Network error',
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: mockAssetData,
          }),
        } as Response;
      }) as typeof fetch;

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
      global.fetch = (async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: mockProofResponse,
          }),
        } as Response;
      }) as typeof fetch;

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
      global.fetch = (async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: mockProofResponse,
          }),
        } as Response;
      }) as typeof fetch;

      await cnftService.getCnftProof(mockAssetId);
      await cnftService.getCnftProof(mockAssetId, true); // Skip cache
      expect(fetchCount).to.equal(2);
    });

    it('should handle proof fetch failures', async () => {
      global.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: null,
          }),
        } as Response;
      }) as typeof fetch;

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

      global.fetch = (async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: mockProofResponse,
          }),
        } as Response;
      }) as typeof fetch;

      const results = await cnftService.batchGetCnftProofs(assetIds, 2);

      expect(results.size).to.equal(3);
      expect(fetchCount).to.equal(3);
    });

    it('should use cache for repeated asset IDs', async () => {
      const assetIds = [mockAssetId, mockAssetId, mockAssetId];
      let fetchCount = 0;

      global.fetch = (async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: mockProofResponse,
          }),
        } as Response;
      }) as typeof fetch;

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

      global.fetch = (async (url: string, options?: any) => {
        fetchCount++;
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.params?.id === 'asset-2') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32000,
                message: 'Proof fetch failed',
              },
            }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: mockProofResponse,
          }),
        } as Response;
      }) as typeof fetch;

      const results = await cnftService.batchGetCnftProofs(assetIds, 2);

      // Should still return successful proofs
      expect(results.size).to.equal(2);
      expect(results.has('asset-1')).to.be.true;
      expect(results.has('asset-3')).to.be.true;
      expect(results.has('asset-2')).to.be.false;
    });
  });

  describe('getAssetProofBatch', () => {
    it('should fetch multiple proofs in a single batch call (array format)', async () => {
      const assetIds = [mockAssetId, 'asset-2', 'asset-3'];
      let fetchCount = 0;

      global.fetch = (async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: [
              mockProofResponse,
              { ...mockProofResponse, root: 'root-2' },
              { ...mockProofResponse, root: 'root-3' },
            ],
          }),
        } as Response;
      }) as typeof fetch;

      const results = await cnftService.getAssetProofBatch(assetIds, true);

      expect(results.size).to.equal(3);
      expect(fetchCount).to.equal(1); // Single batch call
      expect(results.get(mockAssetId)?.root).to.equal(mockProofResponse.root);
      expect(results.get('asset-2')?.root).to.equal('root-2');
      expect(results.get('asset-3')?.root).to.equal('root-3');
    });

    it('should handle object/map format response from DAS API', async () => {
      const assetIds = [mockAssetId, 'asset-2'];
      let fetchCount = 0;

      global.fetch = (async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              [mockAssetId]: mockProofResponse,
              'asset-2': { ...mockProofResponse, root: 'root-2' },
            },
          }),
        } as Response;
      }) as typeof fetch;

      const results = await cnftService.getAssetProofBatch(assetIds, true);

      expect(results.size).to.equal(2);
      expect(fetchCount).to.equal(1); // Single batch call
      expect(results.get(mockAssetId)?.root).to.equal(mockProofResponse.root);
      expect(results.get('asset-2')?.root).to.equal('root-2');
    });

    it('should fallback to individual fetches on batch failure', async () => {
      const assetIds = [mockAssetId, 'asset-2'];
      let fetchCount = 0;

      global.fetch = (async (url: string, options?: any) => {
        fetchCount++;
        const body = options?.body ? JSON.parse(options.body) : {};
        
        // First call (batch) fails
        if (body.method === 'getAssetProofBatch') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32000,
                message: 'Batch proof fetch failed',
              },
            }),
          } as Response;
        }
        
        // Fallback to individual calls
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: mockProofResponse,
          }),
        } as Response;
      }) as typeof fetch;

      const results = await cnftService.getAssetProofBatch(assetIds, true);

      // Should fallback to individual fetches
      expect(results.size).to.equal(2);
      expect(fetchCount).to.be.greaterThan(1); // Multiple calls (batch failed, then individual)
    });

    it('should handle partial failures in batch with fallback', async () => {
      const assetIds = [mockAssetId, 'asset-2', 'asset-3'];
      let fetchCount = 0;

      global.fetch = (async (url: string, options?: any) => {
        fetchCount++;
        const body = options?.body ? JSON.parse(options.body) : {};
        
        // Batch call returns array with missing proof for asset-2
        if (body.method === 'getAssetProofBatch') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: [
                mockProofResponse,
                null, // Missing proof for asset-2
                { ...mockProofResponse, root: 'root-3' },
              ],
            }),
          } as Response;
        }
        
        // Fallback individual call for asset-2
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { ...mockProofResponse, root: 'root-2-fallback' },
          }),
        } as Response;
      }) as typeof fetch;

      const results = await cnftService.getAssetProofBatch(assetIds, true);

      expect(results.size).to.equal(3);
      expect(results.get(mockAssetId)?.root).to.equal(mockProofResponse.root);
      expect(results.get('asset-2')?.root).to.equal('root-2-fallback');
      expect(results.get('asset-3')?.root).to.equal('root-3');
    });

    it('should split large batches exceeding max size', async () => {
      const assetIds = Array.from({ length: 60 }, (_, i) => `asset-${i}`);
      let fetchCount = 0;

      global.fetch = (async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: assetIds.slice(0, 50).map(() => mockProofResponse),
          }),
        } as Response;
      }) as typeof fetch;

      const results = await cnftService.getAssetProofBatch(assetIds, true);

      // Should split into 2 batches (50 + 10)
      expect(fetchCount).to.equal(2);
      expect(results.size).to.equal(60);
    });

    it('should use cache when skipCache is false', async () => {
      const assetIds = [mockAssetId];
      let fetchCount = 0;

      global.fetch = (async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: [mockProofResponse],
          }),
        } as Response;
      }) as typeof fetch;

      // First call
      await cnftService.getAssetProofBatch(assetIds, false);
      expect(fetchCount).to.equal(1);

      // Second call should use cache
      await cnftService.getAssetProofBatch(assetIds, false);
      expect(fetchCount).to.equal(1); // Still only one fetch
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
      const tree1 = Keypair.generate().publicKey; // Use valid generated key
      const tree2 = Keypair.generate().publicKey; // Use valid generated key

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
      const wrongOwner = Keypair.generate().publicKey; // Use valid generated key

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

      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        const method = body.method;

        if (method === 'getAsset') {
          assetFetched = true;
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: mockAssetData,
            }),
          } as Response;
        }
        if (method === 'getAssetProof') {
          proofFetched = true;
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: mockProofResponse,
            }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
        } as Response;
      }) as typeof fetch;

      await cnftService.buildTransferParams(mockAssetId, mockOwnerAddress, mockToAddress);

      expect(assetFetched).to.be.true;
      expect(proofFetched).to.be.true;
    });
  });

  describe('getTreeCanopyDepth', () => {
    it('should return default canopy depth when tree account not found', async () => {
      (connection as any).getAccountInfo = async () => {
        return null; // Account not found
      };

      const depth = await cnftService.getTreeCanopyDepth(mockTreeAddress);
      expect(depth).to.equal(11); // Default for standard Metaplex trees
    });

    it('should handle tree account fetch errors gracefully', async () => {
      (connection as any).getAccountInfo = async () => {
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

      global.fetch = (async () => {
        activeRequests++;
        maxConcurrent = Math.max(maxConcurrent, activeRequests);
        await new Promise(resolve => setTimeout(resolve, 50));
        activeRequests--;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: mockProofResponse,
          }),
        } as Response;
      }) as typeof fetch;

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
      global.fetch = (async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: mockProofResponse,
          }),
        } as Response;
      }) as typeof fetch;

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
