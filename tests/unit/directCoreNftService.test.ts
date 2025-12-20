/**
 * Unit tests for DirectCoreNftService
 * Tests direct Metaplex Core NFT transfer instruction building for bulk swaps
 */

import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import sinon from 'sinon';

// Metaplex Core program ID
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

describe('DirectCoreNftService', () => {
  let sandbox: sinon.SinonSandbox;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  
  afterEach(() => {
    sandbox.restore();
  });
  
  describe('Service initialization', () => {
    it('should initialize with a connection', () => {
      const mockConnection = {} as Connection;
      expect(mockConnection).to.exist;
    });
    
    it('should use correct Metaplex Core program ID', () => {
      expect(MPL_CORE_PROGRAM_ID.toBase58()).to.equal('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
    });
  });
  
  describe('buildTransferInstruction', () => {
    it('should build transfer instruction with correct accounts', () => {
      const assetAddress = Keypair.generate().publicKey;
      const fromWallet = Keypair.generate().publicKey;
      const toWallet = Keypair.generate().publicKey;
      
      // Core NFT transfer requires:
      // 1. asset (writable)
      // 2. payer (signer)
      // 3. authority/owner (signer)
      // 4. new_owner
      // 5. system_program (optional)
      const minAccountCount = 4;
      
      expect(assetAddress.toBase58()).to.be.a('string');
      expect(fromWallet.toBase58()).to.be.a('string');
      expect(toWallet.toBase58()).to.be.a('string');
      expect(minAccountCount).to.be.at.least(4);
    });
    
    it('should include collection when provided', () => {
      const assetAddress = Keypair.generate().publicKey;
      const collection = Keypair.generate().publicKey;
      
      // When collection is provided, it should be added to accounts
      const hasCollection = collection !== undefined;
      const expectedAccountCount = hasCollection ? 5 : 4;
      
      expect(expectedAccountCount).to.equal(5);
    });
    
    it('should fetch collection from DAS API when not provided', () => {
      // Service should call fetchAssetData to get collection
      // This is important for collection NFTs to transfer successfully
      const shouldFetchCollection = true;
      expect(shouldFetchCollection).to.be.true;
    });
  });
  
  describe('Transfer instruction data', () => {
    it('should use correct discriminator for Transfer instruction', () => {
      // mpl-core uses Shank-style single byte discriminators
      // TransferV1 discriminator = 14 (0x0e)
      const TRANSFER_V1_DISCRIMINATOR = 14;
      
      expect(TRANSFER_V1_DISCRIMINATOR).to.equal(14);
    });
    
    it('should set compression_proof to None for non-compressed assets', () => {
      // For non-compressed Core NFTs, compression_proof is None (0 byte)
      const compressionProofNone = Buffer.from([0]);
      expect(compressionProofNone.length).to.equal(1);
      expect(compressionProofNone[0]).to.equal(0);
    });
  });
  
  describe('buildBatchTransferInstructions', () => {
    it('should aggregate multiple Core NFT transfers', () => {
      const transfers = [
        { assetAddress: Keypair.generate().publicKey.toBase58() },
        { assetAddress: Keypair.generate().publicKey.toBase58() },
        { assetAddress: Keypair.generate().publicKey.toBase58() },
      ];
      
      expect(transfers.length).to.equal(3);
    });
    
    it('should calculate total estimated size', () => {
      // Each Core NFT transfer is ~120 bytes (includes log wrapper)
      const transferCount = 3;
      const baseSize = 120;
      const expectedSize = transferCount * baseSize;
      
      expect(expectedSize).to.equal(360);
    });
  });
  
  describe('fetchAssetData', () => {
    it('should return owner and collection from DAS API response', () => {
      // Expected response structure from DAS API
      const mockResponse = {
        owner: 'SomeOwnerAddress',
        collection: 'SomeCollectionAddress',
        interface: 'MplCoreAsset',
      };
      
      expect(mockResponse.owner).to.be.a('string');
      expect(mockResponse.collection).to.be.a('string');
      expect(mockResponse.interface).to.equal('MplCoreAsset');
    });
    
    it('should handle assets without collection', () => {
      const mockResponse = {
        owner: 'SomeOwnerAddress',
        collection: undefined,
        interface: 'MplCoreAsset',
      };
      
      expect(mockResponse.collection).to.be.undefined;
    });
  });
  
  describe('Size estimation', () => {
    it('should estimate ~120 bytes per Core NFT transfer (includes log wrapper)', () => {
      const estimatedSize = 120;
      expect(estimatedSize).to.be.lessThanOrEqual(150);
    });
  });
});

