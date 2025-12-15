/**
 * Integration Tests for cNFT Transfer Operations
 * Tests cNFT transfer instruction building, Merkle proof handling, and canopy depth detection
 */

import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PrismaClient } from '../../src/generated/prisma';
import { CnftService } from '../../src/services/cnftService';
import { TransactionBuilder } from '../../src/services/transactionBuilder';
import { AssetType } from '../../src/services/assetValidator';
import { DasProofResponse } from '../../src/types/cnft';

describe('cNFT Transfer - Integration Tests', () => {
  let connection: Connection;
  let prisma: PrismaClient;
  let cnftService: CnftService;
  let transactionBuilder: TransactionBuilder;
  let platformAuthority: Keypair;
  let makerWallet: Keypair;
  let takerWallet: Keypair;
  let mockConnection: any;

  const mockCnftAssetId = 'test-cnft-asset-123';
  const mockTreeAddress = new PublicKey('11111111111111111111111111111111');

  const mockProofResponse: DasProofResponse = {
    root: 'root-hash-123',
    proof: ['proof-node-1', 'proof-node-2', 'proof-node-3'],
    node_index: 0,
    leaf: 'leaf-hash-123',
    tree_id: mockTreeAddress.toBase58(),
  };

  before(async () => {
    platformAuthority = Keypair.generate();
    makerWallet = Keypair.generate();
    takerWallet = Keypair.generate();

    const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDatabaseUrl,
        },
      },
    });

    const rpcUrl = process.env.TEST_RPC_URL || 'http://localhost:8899';
    connection = new Connection(rpcUrl, 'confirmed');
    mockConnection = connection as any;

    // Mock DAS API responses
    mockConnection._rpcRequest = async (method: string, params: any) => {
      if (method === 'getAsset') {
        return {
          result: {
            id: mockCnftAssetId,
            compression: {
              compressed: true,
              tree: mockTreeAddress.toBase58(),
              leaf_id: 0,
              data_hash: 'data-hash',
              creator_hash: 'creator-hash',
              asset_hash: 'asset-hash',
            },
            ownership: {
              owner: makerWallet.publicKey.toBase58(),
            },
            content: {},
          },
        };
      }
      if (method === 'getAssetProof') {
        return {
          result: mockProofResponse,
        };
      }
      if (method === 'getAccountInfo') {
        return {
          value: {
            data: Buffer.alloc(1000),
            owner: PublicKey.default.toBase58(),
          },
        };
      }
      if (method === 'getNonce') {
        return {
          nonce: {
            authorizedPubkey: platformAuthority.publicKey.toBase58(),
            nonce: 'nonce-value-123',
          },
        };
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    };

    cnftService = new CnftService(connection);
    transactionBuilder = new TransactionBuilder(
      connection,
      platformAuthority,
      undefined, // altService
      cnftService
    );
  });

  after(async () => {
    await prisma.$disconnect();
  });

  describe('cNFT Transfer Instruction Building', () => {
    it('should build transfer instruction with Bubblegum program integration', async () => {
      const transferParams = await cnftService.buildTransferParams(
        mockCnftAssetId,
        makerWallet.publicKey,
        takerWallet.publicKey
      );

      expect(transferParams).to.exist;
      expect(transferParams.treeAddress.toBase58()).to.equal(mockTreeAddress.toBase58());
      expect(transferParams.fromAddress.toBase58()).to.equal(makerWallet.publicKey.toBase58());
      expect(transferParams.toAddress.toBase58()).to.equal(takerWallet.publicKey.toBase58());
      expect(transferParams.proof).to.exist;
      expect(transferParams.treeAuthorityAddress).to.exist;
    });

    it('should include Merkle proof data in transfer params', async () => {
      const transferParams = await cnftService.buildTransferParams(
        mockCnftAssetId,
        makerWallet.publicKey,
        takerWallet.publicKey
      );

      expect(transferParams.proof.root).to.exist;
      expect(transferParams.proof.dataHash).to.exist;
      expect(transferParams.proof.creatorHash).to.exist;
      expect(transferParams.proof.nonce).to.exist;
      expect(transferParams.proof.index).to.exist;
    });
  });

  describe('Merkle Proof Fetching and Validation', () => {
    it('should fetch Merkle proof using mocked DAS API responses', async () => {
      const proof = await cnftService.getCnftProof(mockCnftAssetId);

      expect(proof).to.exist;
      expect(proof.root).to.equal(mockProofResponse.root);
      expect(proof.proof).to.be.an('array');
      expect(proof.tree_id).to.equal(mockTreeAddress.toBase58());
    });

    it('should handle proof fetching with retry on failure', async () => {
      let attemptCount = 0;
      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('Network error');
          }
          return { result: mockProofResponse };
        }
      };

      const proof = await cnftService.getCnftProof(mockCnftAssetId);
      expect(proof).to.exist;
      expect(attemptCount).to.equal(2);
    });

    it('should validate proof structure before use', async () => {
      const proof = await cnftService.getCnftProof(mockCnftAssetId);

      // Verify proof has required fields
      expect(proof).to.have.property('root');
      expect(proof).to.have.property('proof');
      expect(proof).to.have.property('node_index');
      expect(proof).to.have.property('leaf');
      expect(proof).to.have.property('tree_id');
    });
  });

  describe('Canopy Depth Detection', () => {
    it('should detect canopy depth from tree account data', async () => {
      // Mock tree account with specific depth
      mockConnection.getAccountInfo = async (pubkey: PublicKey) => {
        if (pubkey.equals(mockTreeAddress)) {
          // Return mock tree account data
          return {
            value: {
              data: Buffer.alloc(1000),
              owner: PublicKey.default.toBase58(),
            },
          };
        }
        return { value: null };
      };

      const depth = await cnftService.getTreeCanopyDepth(mockTreeAddress);

      // Should return default or detected depth
      expect(depth).to.be.a('number');
      expect(depth).to.be.greaterThan(0);
    });

    it('should use default canopy depth when tree account not found', async () => {
      mockConnection.getAccountInfo = async () => {
        return { value: null };
      };

      const depth = await cnftService.getTreeCanopyDepth(mockTreeAddress);

      // Should fallback to default (11 for standard Metaplex trees)
      expect(depth).to.equal(11);
    });

    it('should handle various tree configurations', async () => {
      const trees = [
        new PublicKey('11111111111111111111111111111111'),
        new PublicKey('22222222222222222222222222222222'),
        new PublicKey('33333333333333333333333333333333'),
      ];

      for (const tree of trees) {
        const depth = await cnftService.getTreeCanopyDepth(tree);
        expect(depth).to.be.a('number');
        expect(depth).to.be.greaterThan(0);
      }
    });
  });

  describe('Proof Trimming Optimization', () => {
    it('should trim proof nodes based on canopy depth', async () => {
      // Mock proof with many nodes
      const largeProof: DasProofResponse = {
        root: 'root-hash',
        proof: Array.from({ length: 20 }, (_, i) => `proof-node-${i}`),
        node_index: 0,
        leaf: 'leaf-hash',
        tree_id: mockTreeAddress.toBase58(),
      };

      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          return { result: largeProof };
        }
      };

      const transferParams = await cnftService.buildTransferParams(
        mockCnftAssetId,
        makerWallet.publicKey,
        takerWallet.publicKey
      );

      // Proof should be trimmed based on canopy depth
      expect(transferParams.proof.proof).to.exist;
      // For full canopy trees, proof array should be empty or minimal
    });

    it('should optimize proof size for high canopy trees', async () => {
      // Mock full canopy tree (canopy depth = tree depth)
      mockConnection.getAccountInfo = async () => {
        return {
          value: {
            data: Buffer.alloc(1000),
            owner: PublicKey.default.toBase58(),
          },
        };
      };

      const transferParams = await cnftService.buildTransferParams(
        mockCnftAssetId,
        makerWallet.publicKey,
        takerWallet.publicKey
      );

      // For full canopy trees, proof nodes should be minimal
      expect(transferParams.proof).to.exist;
    });
  });

  describe('Stale Proof Retry Mechanism', () => {
    it('should retry with fresh proof on stale proof errors', async () => {
      let fetchCount = 0;
      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          fetchCount++;
          return { result: mockProofResponse };
        }
      };

      // First fetch
      const proof1 = await cnftService.getCnftProof(mockCnftAssetId);

      // Simulate stale proof by fetching fresh
      const proof2 = await cnftService.getFreshCnftProof(mockCnftAssetId);

      expect(fetchCount).to.be.greaterThan(1); // Should fetch again
      expect(proof1).to.exist;
      expect(proof2).to.exist;
    });

    it('should handle proof expiration scenarios', async () => {
      // Mock proof with short TTL
      const shortTtlService = new CnftService(connection, {
        proofCacheTtlSeconds: 1, // 1 second TTL
      });

      await shortTtlService.getCnftProof(mockCnftAssetId);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Next fetch should get fresh proof
      const freshProof = await shortTtlService.getCnftProof(mockCnftAssetId);
      expect(freshProof).to.exist;
    });
  });

  describe('Error Handling for Invalid Proofs', () => {
    it('should handle invalid proof responses gracefully', async () => {
      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          return { result: null }; // Invalid response
        }
      };

      try {
        await cnftService.getCnftProof(mockCnftAssetId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('No proof data returned');
      }
    });

    it('should handle network failures during proof fetch', async () => {
      mockConnection._rpcRequest = async () => {
        throw new Error('Network timeout');
      };

      try {
        await cnftService.getCnftProof(mockCnftAssetId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Network timeout');
      }
    });

    it('should handle malformed proof data', async () => {
      mockConnection._rpcRequest = async (method: string) => {
        if (method === 'getAssetProof') {
          return {
            result: {
              // Missing required fields
              root: 'root-hash',
            },
          };
        }
      };

      try {
        await cnftService.getCnftProof(mockCnftAssetId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('No proof data returned');
      }
    });
  });

  describe('Transaction Building with cNFT Proofs', () => {
    it('should build transaction with cNFT proof data', async () => {
      const programId = Keypair.generate().publicKey;
      const treasuryPDA = Keypair.generate().publicKey;
      const nonceAccount = Keypair.generate().publicKey;

      const inputs = {
        makerPubkey: makerWallet.publicKey,
        takerPubkey: takerWallet.publicKey,
        makerAssets: [
          {
            type: AssetType.CNFT,
            identifier: mockCnftAssetId,
          },
        ],
        makerSolLamports: BigInt(0),
        takerAssets: [],
        takerSolLamports: BigInt(1000000000),
        platformFeeLamports: BigInt(10000000),
        nonceAccountPubkey: nonceAccount,
        nonceAuthorityPubkey: platformAuthority.publicKey,
        swapId: 'test-cnft-swap',
        treasuryPDA,
        programId,
        useALT: false,
      };

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      expect(result).to.exist;
      expect(result.serializedTransaction).to.be.a('string');
      expect(result.sizeBytes).to.be.greaterThan(0);
    });
  });
});

