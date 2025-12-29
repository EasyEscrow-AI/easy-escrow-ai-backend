/**
 * Unit Tests for CnftDelegationService
 *
 * Tests cNFT delegation operations with mocked DAS API responses.
 * Based on Task 3: Implement cNFT Delegation Service with Bubblegum
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import {
  CnftDelegationService,
  createCnftDelegationService,
  DelegationStatus,
  DelegationFailedError,
  AlreadyDelegatedError,
  NotDelegatedError,
  InvalidDelegateError,
  DELEGATE_PDA_SEEDS,
  ESCROW_PDA_SEEDS,
} from '../../src/services/cnftDelegationService';
import { DasProofResponse, CnftAssetData } from '../../src/types/cnft';
import { BUBBLEGUM_PROGRAM_ID } from '../../src/constants/bubblegum';
import bs58 from 'bs58';

// Store original fetch
const originalFetch = global.fetch;

describe('CnftDelegationService', () => {
  let connection: Connection;
  let delegationService: CnftDelegationService;
  let mockFetch: any;

  // Test keys
  const mockAssetId = 'test-cnft-asset-id-delegation-123';
  const mockTreeAddress = Keypair.generate().publicKey;
  const mockOwnerAddress = Keypair.generate().publicKey;
  const mockDelegatePDA = Keypair.generate().publicKey;
  const mockRecipientAddress = Keypair.generate().publicKey;
  const mockProgramId = Keypair.generate().publicKey;

  // Generate valid base58-encoded 32-byte hashes
  const mockRootHash = bs58.encode(Buffer.alloc(32, 1));
  const mockDataHash = bs58.encode(Buffer.alloc(32, 2));
  const mockCreatorHash = bs58.encode(Buffer.alloc(32, 3));
  const mockAssetHash = bs58.encode(Buffer.alloc(32, 4));
  const mockLeafHash = bs58.encode(Buffer.alloc(32, 5));
  const mockProofNode1 = bs58.encode(Buffer.alloc(32, 6));
  const mockProofNode2 = bs58.encode(Buffer.alloc(32, 7));
  const mockProofNode3 = bs58.encode(Buffer.alloc(32, 8));

  // Mock asset data - not delegated
  const mockAssetDataNotDelegated: CnftAssetData = {
    id: mockAssetId,
    compression: {
      compressed: true,
      tree: mockTreeAddress.toBase58(),
      leaf_id: 0,
      data_hash: mockDataHash,
      creator_hash: mockCreatorHash,
      asset_hash: mockAssetHash,
    },
    ownership: {
      owner: mockOwnerAddress.toBase58(),
      // No delegate field = not delegated
    },
    content: {
      metadata: {
        name: 'Test Delegation cNFT',
        symbol: 'DLGT',
      },
      json_uri: 'https://example.com/metadata.json',
    },
  };

  // Mock asset data - delegated
  const mockAssetDataDelegated: CnftAssetData = {
    ...mockAssetDataNotDelegated,
    ownership: {
      owner: mockOwnerAddress.toBase58(),
      delegate: mockDelegatePDA.toBase58(),
    },
  };

  // Mock proof response
  const mockProofResponse: DasProofResponse = {
    root: mockRootHash,
    proof: [mockProofNode1, mockProofNode2, mockProofNode3],
    node_index: 16384, // 2^14 for leaf_id 0
    leaf: mockLeafHash,
    tree_id: mockTreeAddress.toBase58(),
  };

  beforeEach(() => {
    // Create mock connection
    connection = new Connection('https://api.devnet.solana.com');

    // Default mock fetch - returns not delegated asset
    mockFetch = async (url: string, options?: any) => {
      const body = options?.body ? JSON.parse(options.body) : {};
      const method = body.method;

      if (method === 'getAsset') {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: mockAssetDataNotDelegated,
            }),
        } as Response;
      }

      if (method === 'getAssetProof') {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: mockProofResponse,
            }),
        } as Response;
      }

      if (method === 'getAssetProofBatch') {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: [mockProofResponse],
            }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }),
      } as Response;
    };

    global.fetch = mockFetch as any;

    // Mock getAccountInfo for tree account (for canopy depth detection)
    (connection as any).getAccountInfo = async () => {
      return {
        data: Buffer.alloc(1000),
        owner: BUBBLEGUM_PROGRAM_ID,
        executable: false,
        lamports: 0,
      };
    };

    delegationService = createCnftDelegationService(connection);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ===========================================================================
  // Error Classes Tests
  // ===========================================================================

  describe('Error Classes', () => {
    it('DelegationFailedError should contain asset ID and reason', () => {
      const error = new DelegationFailedError('asset123', 'Test reason');
      expect(error.name).to.equal('DelegationFailedError');
      expect(error.assetId).to.equal('asset123');
      expect(error.reason).to.equal('Test reason');
      expect(error.message).to.include('asset123');
      expect(error.message).to.include('Test reason');
    });

    it('AlreadyDelegatedError should contain asset ID and current delegate', () => {
      const error = new AlreadyDelegatedError('asset123', 'delegate456');
      expect(error.name).to.equal('AlreadyDelegatedError');
      expect(error.assetId).to.equal('asset123');
      expect(error.currentDelegate).to.equal('delegate456');
      expect(error.message).to.include('already delegated');
    });

    it('NotDelegatedError should contain asset ID and expected delegate', () => {
      const error = new NotDelegatedError('asset123', 'delegate456');
      expect(error.name).to.equal('NotDelegatedError');
      expect(error.assetId).to.equal('asset123');
      expect(error.expectedDelegate).to.equal('delegate456');
      expect(error.message).to.include('not delegated');
    });

    it('InvalidDelegateError should contain all delegate info', () => {
      const error = new InvalidDelegateError('asset123', 'provided', 'expected');
      expect(error.name).to.equal('InvalidDelegateError');
      expect(error.assetId).to.equal('asset123');
      expect(error.providedDelegate).to.equal('provided');
      expect(error.expectedDelegate).to.equal('expected');
      expect(error.message).to.include('Invalid delegate');
    });
  });

  // ===========================================================================
  // PDA Derivation Tests
  // ===========================================================================

  describe('PDA Derivation', () => {
    describe('deriveMarketplaceDelegatePDA', () => {
      it('should derive valid PDA from string marketplace ID', () => {
        const [pda, bump] = delegationService.deriveMarketplaceDelegatePDA(
          mockProgramId,
          'marketplace-1'
        );

        expect(pda).to.be.instanceOf(PublicKey);
        expect(bump).to.be.a('number');
        expect(bump).to.be.lessThanOrEqual(255);
      });

      it('should derive valid PDA from Buffer marketplace ID', () => {
        const idBuffer = Buffer.from('marketplace-1');
        const [pda, bump] = delegationService.deriveMarketplaceDelegatePDA(
          mockProgramId,
          idBuffer
        );

        expect(pda).to.be.instanceOf(PublicKey);
        expect(bump).to.be.a('number');
      });

      it('should derive same PDA for same inputs', () => {
        const [pda1] = delegationService.deriveMarketplaceDelegatePDA(
          mockProgramId,
          'marketplace-1'
        );
        const [pda2] = delegationService.deriveMarketplaceDelegatePDA(
          mockProgramId,
          'marketplace-1'
        );

        expect(pda1.toBase58()).to.equal(pda2.toBase58());
      });

      it('should derive different PDAs for different marketplace IDs', () => {
        const [pda1] = delegationService.deriveMarketplaceDelegatePDA(
          mockProgramId,
          'marketplace-1'
        );
        const [pda2] = delegationService.deriveMarketplaceDelegatePDA(
          mockProgramId,
          'marketplace-2'
        );

        expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
      });

      it('should derive different PDAs for different program IDs', () => {
        const [pda1] = delegationService.deriveMarketplaceDelegatePDA(
          mockProgramId,
          'marketplace-1'
        );
        const [pda2] = delegationService.deriveMarketplaceDelegatePDA(
          Keypair.generate().publicKey,
          'marketplace-1'
        );

        expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
      });
    });

    describe('deriveEscrowPDA', () => {
      it('should derive valid escrow PDA', () => {
        const [pda, bump] = delegationService.deriveEscrowPDA(
          mockProgramId,
          'agreement-123'
        );

        expect(pda).to.be.instanceOf(PublicKey);
        expect(bump).to.be.a('number');
      });

      it('should derive same PDA for same agreement ID', () => {
        const [pda1] = delegationService.deriveEscrowPDA(
          mockProgramId,
          'agreement-123'
        );
        const [pda2] = delegationService.deriveEscrowPDA(
          mockProgramId,
          'agreement-123'
        );

        expect(pda1.toBase58()).to.equal(pda2.toBase58());
      });

      it('should derive different PDAs for different agreement IDs', () => {
        const [pda1] = delegationService.deriveEscrowPDA(
          mockProgramId,
          'agreement-123'
        );
        const [pda2] = delegationService.deriveEscrowPDA(
          mockProgramId,
          'agreement-456'
        );

        expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
      });
    });
  });

  // ===========================================================================
  // Delegation Status Tests
  // ===========================================================================

  describe('getDelegationStatus', () => {
    it('should return NOT_DELEGATED when no delegate is set', async () => {
      const status = await delegationService.getDelegationStatus(mockAssetId);

      expect(status.status).to.equal(DelegationStatus.NOT_DELEGATED);
      expect(status.owner).to.equal(mockOwnerAddress.toBase58());
      expect(status.delegate).to.be.undefined;
    });

    it('should return NOT_DELEGATED when delegate equals owner', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  ...mockAssetDataNotDelegated,
                  ownership: {
                    owner: mockOwnerAddress.toBase58(),
                    delegate: mockOwnerAddress.toBase58(), // Same as owner
                  },
                },
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const status = await delegationService.getDelegationStatus(mockAssetId);

      expect(status.status).to.equal(DelegationStatus.NOT_DELEGATED);
    });

    it('should return DELEGATED when delegate is different from owner', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const status = await delegationService.getDelegationStatus(mockAssetId);

      expect(status.status).to.equal(DelegationStatus.DELEGATED);
      expect(status.delegate).to.equal(mockDelegatePDA.toBase58());
    });

    it('should throw error for invalid asset', async () => {
      global.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: null,
            }),
        } as Response;
      }) as typeof fetch;

      try {
        await delegationService.getDelegationStatus('invalid-asset');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to get delegation status');
      }
    });
  });

  describe('isDelegatedToProgram', () => {
    it('should return true when delegated to specified PDA', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const isDelegated = await delegationService.isDelegatedToProgram(
        mockAssetId,
        mockDelegatePDA
      );

      expect(isDelegated).to.be.true;
    });

    it('should return false when not delegated', async () => {
      const isDelegated = await delegationService.isDelegatedToProgram(
        mockAssetId,
        mockDelegatePDA
      );

      expect(isDelegated).to.be.false;
    });

    it('should return false when delegated to different account', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const differentPDA = Keypair.generate().publicKey;
      const isDelegated = await delegationService.isDelegatedToProgram(
        mockAssetId,
        differentPDA
      );

      expect(isDelegated).to.be.false;
    });

    it('should return false on error', async () => {
      global.fetch = (async () => {
        throw new Error('Network error');
      }) as typeof fetch;

      const isDelegated = await delegationService.isDelegatedToProgram(
        mockAssetId,
        mockDelegatePDA
      );

      expect(isDelegated).to.be.false;
    });
  });

  // ===========================================================================
  // Delegation Instruction Tests
  // ===========================================================================

  describe('buildDelegateInstruction', () => {
    it('should build valid delegate instruction', async () => {
      const result = await delegationService.buildDelegateInstruction({
        assetId: mockAssetId,
        ownerPubkey: mockOwnerAddress,
        delegatePDA: mockDelegatePDA,
      });

      expect(result.instruction).to.exist;
      expect(result.treeAddress.toBase58()).to.equal(mockTreeAddress.toBase58());
      expect(result.treeAuthority).to.be.instanceOf(PublicKey);
      expect(result.proofNodes).to.be.an('array');
      expect(result.estimatedSize).to.be.a('number');
    });

    it('should throw DelegationFailedError for ownership mismatch', async () => {
      const wrongOwner = Keypair.generate().publicKey;

      try {
        await delegationService.buildDelegateInstruction({
          assetId: mockAssetId,
          ownerPubkey: wrongOwner,
          delegatePDA: mockDelegatePDA,
        });
        expect.fail('Should have thrown DelegationFailedError');
      } catch (error: any) {
        expect(error).to.be.instanceOf(DelegationFailedError);
        expect(error.message).to.include('Ownership mismatch');
      }
    });

    it('should throw AlreadyDelegatedError when delegated to different account', async () => {
      const differentDelegate = Keypair.generate().publicKey;

      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  ...mockAssetDataNotDelegated,
                  ownership: {
                    owner: mockOwnerAddress.toBase58(),
                    delegate: differentDelegate.toBase58(),
                  },
                },
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      try {
        await delegationService.buildDelegateInstruction({
          assetId: mockAssetId,
          ownerPubkey: mockOwnerAddress,
          delegatePDA: mockDelegatePDA,
        });
        expect.fail('Should have thrown AlreadyDelegatedError');
      } catch (error: any) {
        expect(error).to.be.instanceOf(AlreadyDelegatedError);
        expect(error.currentDelegate).to.equal(differentDelegate.toBase58());
      }
    });

    it('should allow delegating to same delegate (re-delegation)', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }
        if (body.method === 'getAssetProof') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockProofResponse,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      // Should not throw - re-delegating to same delegate is allowed
      const result = await delegationService.buildDelegateInstruction({
        assetId: mockAssetId,
        ownerPubkey: mockOwnerAddress,
        delegatePDA: mockDelegatePDA,
      });

      expect(result.instruction).to.exist;
    });

    it('should allow force re-delegation from stale swap when forceRedelegate is true', async () => {
      const staleSwapDelegate = Keypair.generate().publicKey;
      const newSwapDelegate = Keypair.generate().publicKey;

      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  ...mockAssetDataNotDelegated,
                  ownership: {
                    owner: mockOwnerAddress.toBase58(),
                    // Delegated to a stale swap's PDA
                    delegate: staleSwapDelegate.toBase58(),
                  },
                },
              }),
          } as Response;
        }
        if (body.method === 'getAssetProof') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockProofResponse,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      // Should succeed with forceRedelegate: true
      const result = await delegationService.buildDelegateInstruction({
        assetId: mockAssetId,
        ownerPubkey: mockOwnerAddress,
        delegatePDA: newSwapDelegate,
        forceRedelegate: true,
      });

      expect(result.instruction).to.exist;
      // The previousLeafDelegate in the instruction should be the stale delegate
      expect(result.instruction.keys.some(
        (k: any) => k.pubkey.toBase58() === staleSwapDelegate.toBase58()
      )).to.be.true;
    });

    it('should throw AlreadyDelegatedError when forceRedelegate is false (default)', async () => {
      const staleSwapDelegate = Keypair.generate().publicKey;
      const newSwapDelegate = Keypair.generate().publicKey;

      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  ...mockAssetDataNotDelegated,
                  ownership: {
                    owner: mockOwnerAddress.toBase58(),
                    delegate: staleSwapDelegate.toBase58(),
                  },
                },
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      // Should throw without forceRedelegate
      try {
        await delegationService.buildDelegateInstruction({
          assetId: mockAssetId,
          ownerPubkey: mockOwnerAddress,
          delegatePDA: newSwapDelegate,
          // forceRedelegate defaults to false
        });
        expect.fail('Should have thrown AlreadyDelegatedError');
      } catch (error: any) {
        expect(error).to.be.instanceOf(AlreadyDelegatedError);
        expect(error.currentDelegate).to.equal(staleSwapDelegate.toBase58());
      }
    });
  });

  describe('buildRevokeInstruction', () => {
    it('should build valid revoke instruction (self-delegation)', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }
        if (body.method === 'getAssetProof') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockProofResponse,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const result = await delegationService.buildRevokeInstruction({
        assetId: mockAssetId,
        ownerPubkey: mockOwnerAddress,
      });

      expect(result.instruction).to.exist;
      expect(result.treeAddress).to.be.instanceOf(PublicKey);
    });

    it('should throw error for ownership mismatch', async () => {
      const wrongOwner = Keypair.generate().publicKey;

      try {
        await delegationService.buildRevokeInstruction({
          assetId: mockAssetId,
          ownerPubkey: wrongOwner,
        });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(DelegationFailedError);
      }
    });
  });

  // ===========================================================================
  // High-Level Method Tests
  // ===========================================================================

  describe('delegateCnft', () => {
    it('should delegate cNFT successfully', async () => {
      const result = await delegationService.delegateCnft(
        mockAssetId,
        mockOwnerAddress,
        mockDelegatePDA
      );

      expect(result.instruction).to.exist;
      expect(result.instruction.programId.toBase58()).to.equal(
        BUBBLEGUM_PROGRAM_ID.toBase58()
      );
    });
  });

  describe('revokeDelegation', () => {
    it('should revoke delegation successfully', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }
        if (body.method === 'getAssetProof') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockProofResponse,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const result = await delegationService.revokeDelegation(
        mockAssetId,
        mockOwnerAddress
      );

      expect(result.instruction).to.exist;
    });
  });

  describe('transferAsDelegate', () => {
    it('should build transfer instruction when properly delegated', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }
        if (body.method === 'getAssetProof') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockProofResponse,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const result = await delegationService.transferAsDelegate({
        assetId: mockAssetId,
        fromOwner: mockOwnerAddress,
        toRecipient: mockRecipientAddress,
        delegatePDA: mockDelegatePDA,
      });

      expect(result.instruction).to.exist;
      expect(result.treeAddress).to.be.instanceOf(PublicKey);
    });

    it('should throw NotDelegatedError when not delegated to specified PDA', async () => {
      // Asset is not delegated (uses default mock)
      try {
        await delegationService.transferAsDelegate({
          assetId: mockAssetId,
          fromOwner: mockOwnerAddress,
          toRecipient: mockRecipientAddress,
          delegatePDA: mockDelegatePDA,
        });
        expect.fail('Should have thrown NotDelegatedError');
      } catch (error: any) {
        expect(error).to.be.instanceOf(NotDelegatedError);
        expect(error.expectedDelegate).to.equal(mockDelegatePDA.toBase58());
      }
    });

    it('should throw NotDelegatedError when delegated to different account', async () => {
      const differentDelegate = Keypair.generate().publicKey;

      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  ...mockAssetDataNotDelegated,
                  ownership: {
                    owner: mockOwnerAddress.toBase58(),
                    delegate: differentDelegate.toBase58(),
                  },
                },
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      try {
        await delegationService.transferAsDelegate({
          assetId: mockAssetId,
          fromOwner: mockOwnerAddress,
          toRecipient: mockRecipientAddress,
          delegatePDA: mockDelegatePDA,
        });
        expect.fail('Should have thrown NotDelegatedError');
      } catch (error: any) {
        expect(error).to.be.instanceOf(NotDelegatedError);
      }
    });

    it('should accept pre-fetched proof for batch operations', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const result = await delegationService.transferAsDelegate(
        {
          assetId: mockAssetId,
          fromOwner: mockOwnerAddress,
          toRecipient: mockRecipientAddress,
          delegatePDA: mockDelegatePDA,
        },
        0,
        mockProofResponse
      );

      expect(result.instruction).to.exist;
    });
  });

  // ===========================================================================
  // Batch Operations Tests
  // ===========================================================================

  describe('batchTransferAsDelegate', () => {
    it('should handle empty batch', async () => {
      const results = await delegationService.batchTransferAsDelegate([]);
      expect(results).to.be.an('array').that.is.empty;
    });

    it('should build transfer instructions for multiple cNFTs', async () => {
      const assetId2 = 'asset-id-2';

      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};

        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }

        if (body.method === 'getAssetProofBatch') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: [mockProofResponse, mockProofResponse],
              }),
          } as Response;
        }

        return mockFetch(url, options);
      }) as typeof fetch;

      const results = await delegationService.batchTransferAsDelegate([
        {
          assetId: mockAssetId,
          fromOwner: mockOwnerAddress,
          toRecipient: mockRecipientAddress,
          delegatePDA: mockDelegatePDA,
        },
        {
          assetId: assetId2,
          fromOwner: mockOwnerAddress,
          toRecipient: mockRecipientAddress,
          delegatePDA: mockDelegatePDA,
        },
      ]);

      expect(results).to.have.length(2);
      expect(results[0].instruction).to.exist;
      expect(results[1].instruction).to.exist;
    });
  });

  // ===========================================================================
  // Validation Tests
  // ===========================================================================

  describe('validateCanDelegate', () => {
    it('should return valid for owned, non-delegated asset', async () => {
      const result = await delegationService.validateCanDelegate(
        mockAssetId,
        mockOwnerAddress
      );

      expect(result.valid).to.be.true;
      expect(result.reason).to.be.undefined;
    });

    it('should return invalid for ownership mismatch', async () => {
      const wrongOwner = Keypair.generate().publicKey;

      const result = await delegationService.validateCanDelegate(
        mockAssetId,
        wrongOwner
      );

      expect(result.valid).to.be.false;
      expect(result.reason).to.include('Ownership mismatch');
    });

    it('should return invalid for already delegated to different account', async () => {
      const differentDelegate = Keypair.generate().publicKey;

      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  ...mockAssetDataNotDelegated,
                  ownership: {
                    owner: mockOwnerAddress.toBase58(),
                    delegate: differentDelegate.toBase58(),
                  },
                },
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const result = await delegationService.validateCanDelegate(
        mockAssetId,
        mockOwnerAddress,
        mockDelegatePDA
      );

      expect(result.valid).to.be.false;
      expect(result.reason).to.include('Already delegated');
    });

    it('should return valid when already delegated to target delegate', async () => {
      global.fetch = (async (url: string, options?: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};
        if (body.method === 'getAsset') {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: mockAssetDataDelegated,
              }),
          } as Response;
        }
        return mockFetch(url, options);
      }) as typeof fetch;

      const result = await delegationService.validateCanDelegate(
        mockAssetId,
        mockOwnerAddress,
        mockDelegatePDA
      );

      expect(result.valid).to.be.true;
    });

    it('should handle validation errors gracefully', async () => {
      global.fetch = (async () => {
        throw new Error('Network error');
      }) as typeof fetch;

      const result = await delegationService.validateCanDelegate(
        mockAssetId,
        mockOwnerAddress
      );

      expect(result.valid).to.be.false;
      expect(result.reason).to.include('Validation failed');
    });
  });

  // ===========================================================================
  // Utility Method Tests
  // ===========================================================================

  describe('getCnftService', () => {
    it('should return the underlying CnftService', () => {
      const cnftService = delegationService.getCnftService();
      expect(cnftService).to.exist;
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createCnftDelegationService', () => {
    it('should create service with default config', () => {
      const service = createCnftDelegationService(connection);
      expect(service).to.be.instanceOf(CnftDelegationService);
    });

    it('should create service with custom config', () => {
      const service = createCnftDelegationService(connection, {
        maxRetries: 5,
        retryDelayMs: 2000,
      });
      expect(service).to.be.instanceOf(CnftDelegationService);
    });
  });

  // ===========================================================================
  // PDA Seed Constants Tests
  // ===========================================================================

  describe('PDA Seed Constants', () => {
    it('should have correct delegate PDA prefix', () => {
      expect(DELEGATE_PDA_SEEDS.prefix).to.equal('delegate');
    });

    it('should have correct escrow PDA prefix', () => {
      expect(ESCROW_PDA_SEEDS.prefix).to.equal('escrow');
    });
  });
});
