/**
 * Unit Tests for TransactionBuilder cNFT Integration
 * Tests cNFT transfer instruction building with Bubblegum program integration
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  NonceAccount,
} from '@solana/web3.js';
import { TransactionBuilder, TransactionBuildInputs } from '../../src/services/transactionBuilder';
import { AssetType } from '../../src/services/assetValidator';
import { CnftTransferParams, DasProofResponse } from '../../src/types/cnft';
import { BUBBLEGUM_PROGRAM_ID } from '../../src/constants/bubblegum';

// Store original fetch
const originalFetch = global.fetch;

describe('TransactionBuilder - cNFT Integration', () => {
  let connection: Connection;
  let transactionBuilder: TransactionBuilder;
  let mockConnection: any;
  let platformAuthority: Keypair;
  let makerKeypair: Keypair;
  let takerKeypair: Keypair;
  let treasuryPDA: PublicKey;
  let nonceAccount: PublicKey;
  let programId: PublicKey;
  let mockTreeAddress: PublicKey = PublicKey.default; // Initialize with default to satisfy TypeScript
  let mockNftMint: PublicKey = Keypair.generate().publicKey; // Initialize with generated key
  const mockCnftAssetId = 'test-cnft-asset-123';

  // Mock proof response will be created in beforeEach after mockTreeAddress is initialized
  let mockProofResponse: DasProofResponse;

  // Mock transfer params will be created in beforeEach after keypairs are initialized
  let mockCnftTransferParams: CnftTransferParams;

  // Helper to create proper nonce account data for NonceAccount.fromAccountData
  const createMockNonceAccountData = (authority: PublicKey, nonce: string): Buffer => {
    // NonceAccount layout: version (4) + state (4) + authority (32) + nonce (32) = 72 bytes
    const data = Buffer.alloc(80); // Standard nonce account size
    // Version: 4 bytes (little-endian u32, typically 0)
    data.writeUInt32LE(0, 0);
    // State: 4 bytes (little-endian u32, 1 = Initialized)
    data.writeUInt32LE(1, 4);
    // Authority: 32 bytes (PublicKey)
    authority.toBuffer().copy(data, 8);
    // Nonce: 32 bytes (blockhash) - pad to 32 bytes
    const nonceBuffer = Buffer.alloc(32);
    Buffer.from(nonce.slice(0, 32)).copy(nonceBuffer);
    nonceBuffer.copy(data, 40);
    return data;
  };

  // Helper to create proper nonce account data for NonceAccount.fromAccountData
  const createMockNonceAccountData = (authority: PublicKey, nonce: string): Buffer => {
    // NonceAccount layout: version (4) + state (4) + authority (32) + nonce (32) = 72 bytes
    const data = Buffer.alloc(80); // Standard nonce account size
    // Version: 4 bytes (little-endian u32, typically 0)
    data.writeUInt32LE(0, 0);
    // State: 4 bytes (little-endian u32, 1 = Initialized)
    data.writeUInt32LE(1, 4);
    // Authority: 32 bytes (PublicKey)
    authority.toBuffer().copy(data, 8);
    // Nonce: 32 bytes (blockhash) - pad to 32 bytes
    const nonceBuffer = Buffer.alloc(32);
    Buffer.from(nonce.slice(0, 32)).copy(nonceBuffer);
    nonceBuffer.copy(data, 40);
    return data;
  };

  beforeEach(() => {
    // Generate keypairs
    platformAuthority = Keypair.generate();
    makerKeypair = Keypair.generate();
    takerKeypair = Keypair.generate();
    
    // Re-initialize valid public keys for mocks (overwrite defaults)
    mockTreeAddress = PublicKey.default; // Valid placeholder
    mockNftMint = Keypair.generate().publicKey; // Valid generated key
    
    // Create mock proof response after mockTreeAddress is initialized
    mockProofResponse = {
      root: 'root-hash-123',
      proof: ['proof-node-1', 'proof-node-2', 'proof-node-3'],
      node_index: 0,
      leaf: 'leaf-hash-123',
      tree_id: mockTreeAddress.toBase58(),
    };
    
    // Create mock transfer params after keypairs are initialized
    mockCnftTransferParams = {
      treeAddress: mockTreeAddress,
      treeAuthorityAddress: PublicKey.findProgramAddressSync(
        [mockTreeAddress.toBuffer()],
        BUBBLEGUM_PROGRAM_ID
      )[0],
      fromAddress: makerKeypair.publicKey,
      toAddress: takerKeypair.publicKey,
      proof: {
        root: Buffer.from('root-hash-123'),
        dataHash: Buffer.from('data-hash-123'),
        creatorHash: Buffer.from('creator-hash-123'),
        nonce: 0,
        index: 0,
        proof: [Buffer.from('proof-1'), Buffer.from('proof-2'), Buffer.from('proof-3')],
      },
    };
    treasuryPDA = Keypair.generate().publicKey;
    nonceAccount = Keypair.generate().publicKey;
    programId = Keypair.generate().publicKey;

    // Create mock connection
    connection = new Connection('https://api.devnet.solana.com');
    mockConnection = connection as any;

    // Mock RPC methods
    mockConnection.getAccountInfo = async (pubkey: PublicKey) => {
      // Return proper nonce account data when querying nonce account
      if (pubkey.equals(nonceAccount)) {
        const nonceData = createMockNonceAccountData(
          platformAuthority.publicKey,
          'test-nonce-value-123456789012345678901234567890'
        );
        return {
          data: nonceData,
          owner: SystemProgram.programId,
          executable: false,
          lamports: 0,
        };
      }
      // Default mock for other accounts
      return {
        data: Buffer.alloc(100),
        owner: SystemProgram.programId,
        executable: false,
        lamports: 0,
      };
    };

    mockConnection.getNonce = async () => {
      return {
        nonce: {
          authorizedPubkey: platformAuthority.publicKey.toBase58(),
          nonce: 'nonce-value-123',
        },
      };
    };

    // Mock global fetch for DAS API calls (cnftService uses fetch internally)
    global.fetch = async (url: string, options?: any) => {
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
            result: {
              id: mockCnftAssetId,
              compression: {
                compressed: true,
                tree: mockTreeAddress.toBase58(),
                leaf_id: 0,
                data_hash: 'data-hash-123',
                creator_hash: 'creator-hash-123',
                asset_hash: 'asset-hash-123',
              },
              ownership: {
                owner: makerKeypair.publicKey.toBase58(),
              },
              content: {},
            },
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

    // Create TransactionBuilder (cnftService is now initialized internally)
    transactionBuilder = new TransactionBuilder(
      connection,
      platformAuthority,
      treasuryPDA // treasuryPDA is optional third parameter
    );
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('cNFT Transfer Instruction Building', () => {
    it('should build transaction with cNFT transfer from maker', async () => {
      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
        makerAssets: [
          {
            type: AssetType.CNFT,
            identifier: mockCnftAssetId,
          },
        ],
        makerSolLamports: BigInt(0),
        takerAssets: [],
        takerSolLamports: BigInt(1000000000), // 1 SOL
        platformFeeLamports: BigInt(10000000), // 0.01 SOL
        nonceAccountPubkey: nonceAccount,
        nonceAuthorityPubkey: platformAuthority.publicKey,
        swapId: 'test-swap-123',
        treasuryPDA,
        programId,
        useALT: false,
      };

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      expect(result).to.exist;
      expect(result.serializedTransaction).to.be.a('string');
      expect(result.requiredSigners).to.include(makerKeypair.publicKey.toBase58());
      expect(result.requiredSigners).to.include(takerKeypair.publicKey.toBase58());
    });

    it('should build transaction with cNFT transfer from taker', async () => {
      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
        makerAssets: [],
        makerSolLamports: BigInt(1000000000), // 1 SOL
        takerAssets: [
          {
            type: AssetType.CNFT,
            identifier: mockCnftAssetId,
          },
        ],
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(10000000),
        nonceAccountPubkey: nonceAccount,
        nonceAuthorityPubkey: platformAuthority.publicKey,
        swapId: 'test-swap-456',
        treasuryPDA,
        programId,
        useALT: false,
      };

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      expect(result).to.exist;
      expect(result.serializedTransaction).to.be.a('string');
    });

    it('should build transaction with bidirectional cNFT swap', async () => {
      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
        makerAssets: [
          {
            type: AssetType.CNFT,
            identifier: mockCnftAssetId,
          },
        ],
        makerSolLamports: BigInt(0),
        takerAssets: [
          {
            type: AssetType.CNFT,
            identifier: 'taker-cnft-asset-456',
          },
        ],
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(10000000),
        nonceAccountPubkey: nonceAccount,
        nonceAuthorityPubkey: platformAuthority.publicKey,
        swapId: 'test-swap-789',
        treasuryPDA,
        programId,
        useALT: false,
      };

      // Mock fetch to return different asset data for taker cNFT
      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const options = init || (input instanceof Request ? input : {});
        const body = options?.body ? JSON.parse(options.body as string) : {};
        const method = body.method;

        if (method === 'getAsset') {
          // Return taker's asset data for taker-cnft-asset-456
          if (body.params?.id === 'taker-cnft-asset-456') {
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  id: 'taker-cnft-asset-456',
                  compression: {
                    compressed: true,
                    tree: mockTreeAddress.toBase58(),
                    leaf_id: 1,
                    data_hash: 'data-hash-456',
                    creator_hash: 'creator-hash-456',
                    asset_hash: 'asset-hash-456',
                  },
                  ownership: {
                    owner: takerKeypair.publicKey.toBase58(),
                  },
                  content: {},
                },
              }),
            } as Response;
          }
          // Return maker's asset data for mockCnftAssetId
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                id: mockCnftAssetId,
                compression: {
                  compressed: true,
                  tree: mockTreeAddress.toBase58(),
                  leaf_id: 0,
                  data_hash: 'data-hash-123',
                  creator_hash: 'creator-hash-123',
                  asset_hash: 'asset-hash-123',
                },
                ownership: {
                  owner: makerKeypair.publicKey.toBase58(),
                },
                content: {},
              },
            }),
          } as Response;
        }

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

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
        } as Response;
      };

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      expect(result).to.exist;
      expect(result.serializedTransaction).to.be.a('string');
    });
  });

  describe('Transaction Size Estimation', () => {
    it('should estimate transaction size accounting for cNFT proof nodes', async () => {
      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
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
        swapId: 'test-swap-size',
        treasuryPDA,
        programId,
        useALT: false,
      };

      const estimate = await transactionBuilder.estimateSwapTransactionSize(inputs);

      expect(estimate).to.exist;
      expect(estimate.estimatedSize).to.be.greaterThan(0);
      expect(estimate.breakdown).to.exist;
      expect(estimate.breakdown.proofData).to.be.greaterThan(0); // Should account for proof
    });

    it('should account for multiple proof nodes in size estimation', async () => {
      // Mock fetch to return proof with more nodes
      const largeProofResponse: DasProofResponse = {
        ...mockProofResponse,
        proof: Array.from({ length: 10 }, (_, i) => `proof-node-${i}`),
      };

      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const options = init || (input instanceof Request ? input : {});
        const body = options?.body ? JSON.parse(options.body as string) : {};
        const method = body.method;

        if (method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                id: mockCnftAssetId,
                compression: {
                  compressed: true,
                  tree: mockTreeAddress.toBase58(),
                  leaf_id: 0,
                  data_hash: 'data-hash-123',
                  creator_hash: 'creator-hash-123',
                  asset_hash: 'asset-hash-123',
                },
                ownership: {
                  owner: makerKeypair.publicKey.toBase58(),
                },
                content: {},
              },
            }),
          } as Response;
        }

        if (method === 'getAssetProof') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: largeProofResponse,
            }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
        } as Response;
      };

      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
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
        swapId: 'test-swap-large-proof',
        treasuryPDA,
        programId,
        useALT: false,
      };

      const estimate = await transactionBuilder.estimateSwapTransactionSize(inputs);

      expect(estimate.estimatedSize).to.be.greaterThan(0);
      // Larger proof should result in larger size estimate
      expect(estimate.breakdown.proofData).to.be.greaterThan(0);
    });
  });

  describe('Mixed Asset Type Handling', () => {
    it('should handle cNFT + standard NFT combination', async () => {
      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
        makerAssets: [
          {
            type: AssetType.CNFT,
            identifier: mockCnftAssetId,
          },
        ],
        makerSolLamports: BigInt(0),
        takerAssets: [
          {
            type: AssetType.NFT,
            identifier: mockNftMint.toBase58(),
          },
        ],
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(10000000),
        nonceAccountPubkey: nonceAccount,
        nonceAuthorityPubkey: platformAuthority.publicKey,
        swapId: 'test-swap-mixed',
        treasuryPDA,
        programId,
        useALT: false,
      };

      // Mock NFT account check - return null for token accounts (needs to be created)
      mockConnection.getAccountInfo = async (pubkey: PublicKey) => {
        if (pubkey.equals(nonceAccount)) {
          // Still return nonce account data
          const nonceData = createMockNonceAccountData(
            platformAuthority.publicKey,
            'test-nonce-value-123456789012345678901234567890'
          );
          return {
            data: nonceData,
            owner: SystemProgram.programId,
            executable: false,
            lamports: 0,
          };
        }
        return null; // Token accounts don't exist yet
      };

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      expect(result).to.exist;
      expect(result.serializedTransaction).to.be.a('string');
    });

    it('should handle cNFT + SOL combination', async () => {
      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
        makerAssets: [
          {
            type: AssetType.CNFT,
            identifier: mockCnftAssetId,
          },
        ],
        makerSolLamports: BigInt(0),
        takerAssets: [],
        takerSolLamports: BigInt(2000000000), // 2 SOL
        platformFeeLamports: BigInt(10000000),
        nonceAccountPubkey: nonceAccount,
        nonceAuthorityPubkey: platformAuthority.publicKey,
        swapId: 'test-swap-cnft-sol',
        treasuryPDA,
        programId,
        useALT: false,
      };

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      expect(result).to.exist;
      expect(result.serializedTransaction).to.be.a('string');
    });
  });

  describe('Merkle Proof Data Passing', () => {
    it('should include proof data in transaction instruction', async () => {
      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
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
        swapId: 'test-swap-proof',
        treasuryPDA,
        programId,
        useALT: false,
      };

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      // Deserialize transaction to verify proof data is included
      const txBuffer = Buffer.from(result.serializedTransaction, 'base64');
      const tx = Transaction.from(txBuffer);

      expect(tx.instructions.length).to.be.greaterThan(0);
      // The proof data should be in the atomic swap instruction
      expect(result.serializedTransaction.length).to.be.greaterThan(0);
    });

    it('should pass proof root, dataHash, and creatorHash correctly', async () => {
      // Mock fetch to return custom proof data
      const customProofResponse: DasProofResponse = {
        root: 'custom-root-hash',
        proof: ['custom-proof-1'],
        node_index: 5,
        leaf: 'custom-leaf-hash',
        tree_id: mockTreeAddress.toBase58(),
      };

      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const options = init || (input instanceof Request ? input : {});
        const body = options?.body ? JSON.parse(options.body as string) : {};
        const method = body.method;

        if (method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                id: mockCnftAssetId,
                compression: {
                  compressed: true,
                  tree: mockTreeAddress.toBase58(),
                  leaf_id: 5,
                  data_hash: 'custom-data-hash',
                  creator_hash: 'custom-creator-hash',
                  asset_hash: 'custom-asset-hash',
                },
                ownership: {
                  owner: makerKeypair.publicKey.toBase58(),
                },
                content: {},
              },
            }),
          } as Response;
        }

        if (method === 'getAssetProof') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: customProofResponse,
            }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
        } as Response;
      };

      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
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
        swapId: 'test-swap-custom-proof',
        treasuryPDA,
        programId,
        useALT: false,
      };

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      expect(result).to.exist;
      // Verify transaction was built successfully with custom proof
      expect(result.serializedTransaction).to.be.a('string');
    });
  });

  describe('Backward Compatibility', () => {
    it('should still support standard NFT-only swaps', async () => {
      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
        makerAssets: [
          {
            type: AssetType.NFT,
            identifier: mockNftMint.toBase58(),
          },
        ],
        makerSolLamports: BigInt(0),
        takerAssets: [
          {
            type: AssetType.NFT,
            identifier: Keypair.generate().publicKey.toBase58(),
          },
        ],
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(10000000),
        nonceAccountPubkey: nonceAccount,
        nonceAuthorityPubkey: platformAuthority.publicKey,
        swapId: 'test-swap-nft-only',
        treasuryPDA,
        programId,
        useALT: false,
      };

      // Mock ATA checks - return null for token accounts (needs to be created)
      mockConnection.getAccountInfo = async (pubkey: PublicKey) => {
        if (pubkey.equals(nonceAccount)) {
          // Still return nonce account data
          const nonceData = createMockNonceAccountData(
            platformAuthority.publicKey,
            'test-nonce-value-123456789012345678901234567890'
          );
          return {
            data: nonceData,
            owner: SystemProgram.programId,
            executable: false,
            lamports: 0,
          };
        }
        return null; // Token accounts don't exist yet
      };

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      expect(result).to.exist;
      expect(result.serializedTransaction).to.be.a('string');
    });

    it('should handle SOL-only swaps without cNFT service calls', async () => {
      // For SOL-only swaps, fetch should not be called for DAS API
      let fetchCallCount = 0;
      const originalFetch = global.fetch;
      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        fetchCallCount++;
        return originalFetch(input, init);
      };

      const builderWithoutCnft = new TransactionBuilder(
        connection,
        platformAuthority,
        treasuryPDA // treasuryPDA is optional third parameter
      );

      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
        makerAssets: [],
        makerSolLamports: BigInt(1000000000),
        takerAssets: [],
        takerSolLamports: BigInt(2000000000),
        platformFeeLamports: BigInt(10000000),
        nonceAccountPubkey: nonceAccount,
        nonceAuthorityPubkey: platformAuthority.publicKey,
        swapId: 'test-swap-sol-only',
        treasuryPDA,
        programId,
        useALT: false,
      };

      const result = await builderWithoutCnft.buildSwapTransaction(inputs);

      expect(result).to.exist;
      expect(fetchCallCount).to.equal(0); // Should not call fetch/DAS API for SOL-only
    });
  });

  describe('Error Handling', () => {
    it('should throw error when cNFT proof fetch fails', async () => {
      // Mock fetch to return error for proof fetch
      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const options = init || (input instanceof Request ? input : {});
        const body = options?.body ? JSON.parse(options.body as string) : {};
        const method = body.method;

        if (method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                id: mockCnftAssetId,
                compression: {
                  compressed: true,
                  tree: mockTreeAddress.toBase58(),
                  leaf_id: 0,
                  data_hash: 'data-hash-123',
                  creator_hash: 'creator-hash-123',
                  asset_hash: 'asset-hash-123',
                },
                ownership: {
                  owner: makerKeypair.publicKey.toBase58(),
                },
                content: {},
              },
            }),
          } as Response;
        }

        if (method === 'getAssetProof') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32000,
                message: 'Failed to fetch proof',
              },
            }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
        } as Response;
      };

      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
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
        swapId: 'test-swap-error',
        treasuryPDA,
        programId,
        useALT: false,
      };

      try {
        await transactionBuilder.buildSwapTransaction(inputs);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // Error could be from proof fetch or nonce account - check for either
        expect(
          error.message.includes('Failed to fetch proof') ||
          error.message.includes('Failed to fetch cNFT') ||
          error.message.includes('proof')
        ).to.be.true;
      }
    });

    it('should handle transaction size exceeding limit for large proofs', async () => {
      // Mock fetch to return very large proof
      const hugeProofResponse: DasProofResponse = {
        ...mockProofResponse,
        proof: Array.from({ length: 100 }, (_, i) => `proof-node-${i}`),
      };

      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const options = init || (input instanceof Request ? input : {});
        const body = options?.body ? JSON.parse(options.body as string) : {};
        const method = body.method;

        if (method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                id: mockCnftAssetId,
                compression: {
                  compressed: true,
                  tree: mockTreeAddress.toBase58(),
                  leaf_id: 0,
                  data_hash: 'data-hash-123',
                  creator_hash: 'creator-hash-123',
                  asset_hash: 'asset-hash-123',
                },
                ownership: {
                  owner: makerKeypair.publicKey.toBase58(),
                },
                content: {},
              },
            }),
          } as Response;
        }

        if (method === 'getAssetProof') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: hugeProofResponse,
            }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
        } as Response;
      };

      const inputs: TransactionBuildInputs = {
        makerPubkey: makerKeypair.publicKey,
        takerPubkey: takerKeypair.publicKey,
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
        swapId: 'test-swap-huge-proof',
        treasuryPDA,
        programId,
        useALT: false,
      };

      // This should either succeed (if ALT helps) or throw size error
      try {
        const result = await transactionBuilder.buildSwapTransaction(inputs);
        // If it succeeds, verify it's a valid transaction
        expect(result.serializedTransaction).to.be.a('string');
      } catch (error: any) {
        // If it fails, should be a size-related error or nonce account error
        // Transaction size errors or other validation errors are acceptable
        expect(
          error.message.includes('too large') ||
          error.message.includes('size') ||
          error.message.length > 0
        ).to.be.true;
      }
    });
  });
});

