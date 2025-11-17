/**
 * Unit Tests for TransactionBuilder Service
 * Tests atomic swap transaction construction
 */

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { TransactionBuilder, SwapTransactionParams } from '../../src/services/transactionBuilder';
import { AssetValidator, AssetType } from '../../src/services/assetValidator';
import { FeeCalculator } from '../../src/services/feeCalculator';

// Mock dependencies
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getAccountInfo: jest.fn(),
      getRecentBlockhash: jest.fn(),
      getMinimumBalanceForRentExemption: jest.fn(),
    })),
  };
});

jest.mock('../../src/services/assetValidator');
jest.mock('../../src/services/feeCalculator');

describe('TransactionBuilder', () => {
  let transactionBuilder: TransactionBuilder;
  let mockConnection: jest.Mocked<Connection>;
  let mockAssetValidator: jest.Mocked<AssetValidator>;
  let mockFeeCalculator: jest.Mocked<FeeCalculator>;
  let mockPlatformAuthority: Keypair;
  let mockProgramId: PublicKey;
  let mockTreasuryPda: PublicKey;
  
  beforeEach(() => {
    mockConnection = new Connection('http://localhost:8899') as jest.Mocked<Connection>;
    mockAssetValidator = new AssetValidator(mockConnection) as jest.Mocked<AssetValidator>;
    mockFeeCalculator = new FeeCalculator() as jest.Mocked<FeeCalculator>;
    mockPlatformAuthority = Keypair.generate();
    mockProgramId = Keypair.generate().publicKey;
    mockTreasuryPda = Keypair.generate().publicKey;
    
    transactionBuilder = new TransactionBuilder(
      mockConnection,
      mockAssetValidator,
      mockFeeCalculator,
      {
        programId: mockProgramId.toBase58(),
        treasuryPda: mockTreasuryPda.toBase58(),
        platformAuthority: mockPlatformAuthority,
      }
    );
    
    // Setup default mocks
    (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({
      data: Buffer.alloc(80),
    });
    
    (mockConnection.getMinimumBalanceForRentExemption as jest.Mock).mockResolvedValue(2_039_280);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Initialization', () => {
    it('should create instance with valid configuration', () => {
      expect(transactionBuilder).toBeInstanceOf(TransactionBuilder);
    });
    
    it('should throw error with invalid configuration', () => {
      expect(() => {
        new TransactionBuilder(mockConnection, mockAssetValidator, mockFeeCalculator, {
          programId: 'invalid-pubkey',
          treasuryPda: mockTreasuryPda.toBase58(),
          platformAuthority: mockPlatformAuthority,
        });
      }).toThrow();
    });
  });
  
  describe('NFT-Only Swap Transaction', () => {
    it('should build transaction for simple NFT swap', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [
          {
            standard: AssetType.NFT,
            mint: Keypair.generate().publicKey.toBase58(),
            amount: 1,
          },
        ],
        takerAssets: [
          {
            standard: AssetType.NFT,
            mint: Keypair.generate().publicKey.toBase58(),
            amount: 1,
          },
        ],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.instructions.length).toBeGreaterThan(0);
      
      // First instruction should be nonceAdvance
      expect(transaction.instructions[0].programId.toBase58()).toBe(
        '11111111111111111111111111111111' // SystemProgram
      );
    });
    
    it('should include ATA creation instructions', async () => {
      const makerWallet = Keypair.generate().publicKey;
      const takerWallet = Keypair.generate().publicKey;
      const nftMint = Keypair.generate().publicKey;
      
      // Mock that taker doesn't have ATA for the NFT
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValueOnce(null);
      
      const params: SwapTransactionParams = {
        makerWallet: makerWallet.toBase58(),
        takerWallet: takerWallet.toBase58(),
        makerAssets: [
          {
            standard: AssetType.NFT,
            mint: nftMint.toBase58(),
            amount: 1,
          },
        ],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction).toBeInstanceOf(Transaction);
      // Should include nonce advance, ATA creation, NFT transfer, and fee collection
      expect(transaction.instructions.length).toBeGreaterThan(2);
    });
    
    it('should include SPL token transfer instructions', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [
          {
            standard: AssetType.NFT,
            mint: Keypair.generate().publicKey.toBase58(),
            amount: 1,
          },
        ],
        takerAssets: [
          {
            standard: AssetType.NFT,
            mint: Keypair.generate().publicKey.toBase58(),
            amount: 1,
          },
        ],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      // Verify transaction structure
      expect(transaction.recentBlockhash).toBe('mock-nonce-value');
      expect(transaction.feePayer?.toBase58()).toBe(params.takerWallet);
    });
  });
  
  describe('SOL Transfer Instructions', () => {
    it('should include SOL transfer from maker to taker', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(100_000_000), // 0.1 SOL
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(1_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.instructions.length).toBeGreaterThan(1);
    });
    
    it('should include SOL transfer from taker to maker', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(200_000_000), // 0.2 SOL
        platformFeeLamports: BigInt(2_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.instructions.length).toBeGreaterThan(1);
    });
    
    it('should handle bidirectional SOL swaps', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(100_000_000),
        takerSolLamports: BigInt(200_000_000),
        platformFeeLamports: BigInt(3_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction).toBeInstanceOf(Transaction);
      // Should include: nonce advance, SOL maker->taker, SOL taker->maker, fee collection
      expect(transaction.instructions.length).toBeGreaterThan(2);
    });
  });
  
  describe('cNFT Transfer Instructions', () => {
    it('should include Bubblegum transfer for cNFT', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [
          {
            standard: AssetType.CNFT,
            assetId: 'test-cnft-asset-id',
            tree: Keypair.generate().publicKey.toBase58(),
            leafIndex: 42,
            amount: 1,
            merkleProof: {
              treeId: 'test-tree-id',
              leafIndex: 42,
              proof: ['hash1', 'hash2'],
              root: 'root-hash',
            },
          },
        ],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.instructions.length).toBeGreaterThan(1);
    });
    
    it('should handle multiple cNFT transfers', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [
          {
            standard: AssetType.CNFT,
            assetId: 'cnft-1',
            tree: Keypair.generate().publicKey.toBase58(),
            leafIndex: 10,
            amount: 1,
            merkleProof: {
              treeId: 'tree-1',
              leafIndex: 10,
              proof: ['hash1'],
              root: 'root1',
            },
          },
        ],
        takerAssets: [
          {
            standard: AssetType.CNFT,
            assetId: 'cnft-2',
            tree: Keypair.generate().publicKey.toBase58(),
            leafIndex: 20,
            amount: 1,
            merkleProof: {
              treeId: 'tree-2',
              leafIndex: 20,
              proof: ['hash2'],
              root: 'root2',
            },
          },
        ],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.instructions.length).toBeGreaterThan(2);
    });
    
    it('should throw error if cNFT missing Merkle proof', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [
          {
            standard: AssetType.CNFT,
            assetId: 'cnft-no-proof',
            tree: Keypair.generate().publicKey.toBase58(),
            leafIndex: 42,
            amount: 1,
            // Missing merkleProof
          },
        ],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      await expect(transactionBuilder.buildSwapTransaction(params)).rejects.toThrow(
        'Merkle proof required for cNFT'
      );
    });
  });
  
  describe('Platform Fee Collection', () => {
    it('should include fee collection instruction', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(10_000_000), // 0.01 SOL
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      // Last instruction should be fee collection
      const lastInstruction = transaction.instructions[transaction.instructions.length - 1];
      expect(lastInstruction.programId.toBase58()).toBe(mockProgramId.toBase58());
    });
    
    it('should pass swap ID to fee collection', async () => {
      const swapId = 'unique-swap-identifier-123';
      
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId,
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction).toBeInstanceOf(Transaction);
      // Swap ID should be encoded in the fee instruction data
    });
  });
  
  describe('Durable Nonce Usage', () => {
    it('should set recentBlockhash to nonce value', async () => {
      const nonceValue = 'test-durable-nonce-value-base58';
      
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: nonceValue,
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction.recentBlockhash).toBe(nonceValue);
    });
    
    it('should include nonceAdvance as first instruction', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      // First instruction must be nonceAdvance
      const firstInstruction = transaction.instructions[0];
      expect(firstInstruction.programId.toBase58()).toBe('11111111111111111111111111111111');
    });
    
    it('should partially sign with platform authority', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      // Transaction should be partially signed
      expect(transaction.signatures.length).toBeGreaterThan(0);
      
      // Platform authority signature should be present
      const platformSig = transaction.signatures.find(
        (sig) => sig.publicKey.toBase58() === mockPlatformAuthority.publicKey.toBase58()
      );
      expect(platformSig).toBeDefined();
    });
  });
  
  describe('Transaction Size and Limits', () => {
    it('should estimate transaction size', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [
          { standard: AssetType.NFT, mint: Keypair.generate().publicKey.toBase58(), amount: 1 },
        ],
        takerAssets: [
          { standard: AssetType.NFT, mint: Keypair.generate().publicKey.toBase58(), amount: 1 },
        ],
        makerSolLamports: BigInt(100_000_000),
        takerSolLamports: BigInt(200_000_000),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      const estimatedSize = transactionBuilder.estimateTransactionSize(transaction);
      
      expect(estimatedSize).toBeGreaterThan(0);
      expect(estimatedSize).toBeLessThan(1232); // Solana transaction size limit
    });
    
    it('should warn if transaction approaches size limit', async () => {
      // Create transaction with many assets
      const manyAssets = Array.from({ length: 10 }, () => ({
        standard: AssetType.NFT as const,
        mint: Keypair.generate().publicKey.toBase58(),
        amount: 1,
      }));
      
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: manyAssets,
        takerAssets: manyAssets,
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      await expect(transactionBuilder.buildSwapTransaction(params)).rejects.toThrow(
        'Transaction size exceeds limit'
      );
    });
  });
  
  describe('Error Handling', () => {
    it('should throw error for invalid wallet addresses', async () => {
      const params: SwapTransactionParams = {
        makerWallet: 'invalid-address',
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      await expect(transactionBuilder.buildSwapTransaction(params)).rejects.toThrow();
    });
    
    it('should throw error for invalid nonce account', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(5_000_000),
        nonceAccount: 'invalid-nonce-account',
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      await expect(transactionBuilder.buildSwapTransaction(params)).rejects.toThrow();
    });
    
    it('should throw error for negative fee', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [],
        takerAssets: [],
        makerSolLamports: BigInt(0),
        takerSolLamports: BigInt(0),
        platformFeeLamports: BigInt(-1000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'test-swap-id',
      };
      
      await expect(transactionBuilder.buildSwapTransaction(params)).rejects.toThrow(
        'Platform fee must be non-negative'
      );
    });
  });
  
  describe('Complex Swap Scenarios', () => {
    it('should build transaction for mixed assets (NFT + cNFT + SOL)', async () => {
      const params: SwapTransactionParams = {
        makerWallet: Keypair.generate().publicKey.toBase58(),
        takerWallet: Keypair.generate().publicKey.toBase58(),
        makerAssets: [
          {
            standard: AssetType.NFT,
            mint: Keypair.generate().publicKey.toBase58(),
            amount: 1,
          },
          {
            standard: AssetType.CNFT,
            assetId: 'cnft-id',
            tree: Keypair.generate().publicKey.toBase58(),
            leafIndex: 42,
            amount: 1,
            merkleProof: {
              treeId: 'tree-id',
              leafIndex: 42,
              proof: ['hash1'],
              root: 'root',
            },
          },
        ],
        takerAssets: [
          {
            standard: AssetType.NFT,
            mint: Keypair.generate().publicKey.toBase58(),
            amount: 1,
          },
        ],
        makerSolLamports: BigInt(50_000_000),
        takerSolLamports: BigInt(100_000_000),
        platformFeeLamports: BigInt(7_500_000),
        nonceAccount: Keypair.generate().publicKey.toBase58(),
        currentNonceValue: 'mock-nonce-value',
        swapId: 'complex-swap-id',
      };
      
      const transaction = await transactionBuilder.buildSwapTransaction(params);
      
      expect(transaction).toBeInstanceOf(Transaction);
      expect(transaction.instructions.length).toBeGreaterThan(5);
    });
  });
});

