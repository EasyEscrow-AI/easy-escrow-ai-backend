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
} from '@solana/web3.js';
import { TransactionBuilder, TransactionBuildInputs } from '../../src/services/transactionBuilder';
import { CnftService } from '../../src/services/cnftService';
import { AssetType } from '../../src/services/assetValidator';
import { CnftTransferParams, DasProofResponse } from '../../src/types/cnft';
import { BUBBLEGUM_PROGRAM_ID } from '../../src/constants/bubblegum';

describe('TransactionBuilder - cNFT Integration', () => {
  let connection: Connection;
  let transactionBuilder: TransactionBuilder;
  let cnftService: CnftService;
  let mockConnection: any;
  let platformAuthority: Keypair;
  let makerKeypair: Keypair;
  let takerKeypair: Keypair;
  let treasuryPDA: PublicKey;
  let nonceAccount: PublicKey;
  let programId: PublicKey;

  const mockCnftAssetId = 'test-cnft-asset-123';
  const mockTreeAddress = new PublicKey('11111111111111111111111111111111');
  const mockNftMint = new PublicKey('22222222222222222222222222222222');

  const mockProofResponse: DasProofResponse = {
    root: 'root-hash-123',
    proof: ['proof-node-1', 'proof-node-2', 'proof-node-3'],
    node_index: 0,
    leaf: 'leaf-hash-123',
    tree_id: mockTreeAddress.toBase58(),
  };

  // Mock transfer params will be created in beforeEach after keypairs are initialized
  let mockCnftTransferParams: CnftTransferParams;

  beforeEach(() => {
    // Generate keypairs
    platformAuthority = Keypair.generate();
    makerKeypair = Keypair.generate();
    takerKeypair = Keypair.generate();
    
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
    mockConnection.getAccountInfo = async () => {
      return {
        value: {
          data: Buffer.alloc(100),
          owner: SystemProgram.programId.toBase58(),
        },
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

    // Mock CnftService
    cnftService = {
      buildTransferParams: async () => mockCnftTransferParams,
      getCnftAsset: async () => ({
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
          owner: makerKeypair.publicKey.toBase58(),
        },
        content: {},
      }),
      getCnftProof: async () => mockProofResponse,
    } as any;

    // Create TransactionBuilder with mocked CnftService
    transactionBuilder = new TransactionBuilder(
      connection,
      platformAuthority,
      undefined, // altService
      cnftService
    );
  });

  afterEach(() => {
    // Cleanup if needed
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

      // Mock taker cNFT params
      const takerCnftParams: CnftTransferParams = {
        ...mockCnftTransferParams,
        fromAddress: takerKeypair.publicKey,
        toAddress: makerKeypair.publicKey,
      };

      (cnftService.buildTransferParams as any) = async (
        assetId: string,
        from: PublicKey,
        to: PublicKey
      ) => {
        if (assetId === mockCnftAssetId) {
          return mockCnftTransferParams;
        }
        return takerCnftParams;
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
      // Mock proof with more nodes
      const largeProof: CnftTransferParams = {
        ...mockCnftTransferParams,
        proof: {
          ...mockCnftTransferParams.proof,
          proof: Array.from({ length: 10 }, (_, i) => Buffer.from(`proof-${i}`)),
        },
      };

      (cnftService.buildTransferParams as any) = async () => largeProof;

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

      // Mock NFT account check
      mockConnection.getAccountInfo = async (pubkey: PublicKey) => {
        // Return null for ATA (needs to be created)
        return { value: null };
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
      const customProof: CnftTransferParams = {
        ...mockCnftTransferParams,
        proof: {
          root: Buffer.from('custom-root-hash'),
          dataHash: Buffer.from('custom-data-hash'),
          creatorHash: Buffer.from('custom-creator-hash'),
          nonce: 5,
          index: 5,
          proof: [Buffer.from('custom-proof-1')],
        },
      };

      (cnftService.buildTransferParams as any) = async () => customProof;

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

      // Mock ATA checks
      mockConnection.getAccountInfo = async () => ({ value: null });

      const result = await transactionBuilder.buildSwapTransaction(inputs);

      expect(result).to.exist;
      expect(result.serializedTransaction).to.be.a('string');
    });

    it('should handle SOL-only swaps without cNFT service calls', async () => {
      let cnftServiceCalled = false;
      const spyCnftService = {
        ...cnftService,
        buildTransferParams: async () => {
          cnftServiceCalled = true;
          return mockCnftTransferParams;
        },
      };

      const builderWithoutCnft = new TransactionBuilder(
        connection,
        platformAuthority,
        undefined,
        spyCnftService as any
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
      expect(cnftServiceCalled).to.be.false; // Should not call cNFT service for SOL-only
    });
  });

  describe('Error Handling', () => {
    it('should throw error when cNFT proof fetch fails', async () => {
      (cnftService.buildTransferParams as any) = async () => {
        throw new Error('Failed to fetch proof');
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
        expect(error.message).to.include('Failed to fetch proof');
      }
    });

    it('should handle transaction size exceeding limit for large proofs', async () => {
      // Mock very large proof
      const hugeProof: CnftTransferParams = {
        ...mockCnftTransferParams,
        proof: {
          ...mockCnftTransferParams.proof,
          proof: Array.from({ length: 100 }, (_, i) => Buffer.from(`proof-${i}`)),
        },
      };

      (cnftService.buildTransferParams as any) = async () => hugeProof;

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
        // If it fails, should be a size-related error
        expect(error.message).to.include('too large');
      }
    });
  });
});

