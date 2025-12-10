/**
 * Unit Tests: Address Lookup Table (ALT) Service
 * 
 * Tests the ALTService functionality for transaction size estimation
 * and ALT recommendation logic.
 */

import { expect } from 'chai';
import { Connection, PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import sinon from 'sinon';

// Import the ALTService
import { ALTService, createALTService, TransactionSizeEstimate } from '../../src/services/altService';

describe('🔧 ALTService Unit Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockConnection: sinon.SinonStubbedInstance<Connection>;
  let altService: ALTService;
  
  // Test fixtures
  const mockPlatformAuthority = Keypair.generate().publicKey;
  const mockTreasuryPda = Keypair.generate().publicKey;
  const mockALTAddress = Keypair.generate().publicKey;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Create a mock connection
    mockConnection = sandbox.createStubInstance(Connection);
    
    // Create ALT service with mock config
    altService = createALTService(mockConnection as unknown as Connection, {
      platformAuthority: mockPlatformAuthority,
      treasuryPda: mockTreasuryPda,
      lookupTableAddress: mockALTAddress,
    });
  });
  
  afterEach(() => {
    sandbox.restore();
  });
  
  describe('getStaticAddresses()', () => {
    it('should return all required static addresses', () => {
      const addresses = altService.getStaticAddresses();
      
      // Should have at least 8 addresses (6 static + authority + treasury)
      expect(addresses.length).to.be.at.least(8);
      
      // Convert to strings for easier comparison
      const addressStrings = addresses.map(a => a.toBase58());
      
      // Should include TOKEN_PROGRAM_ID
      expect(addressStrings).to.include(TOKEN_PROGRAM_ID.toBase58());
      
      // Should include SystemProgram
      expect(addressStrings).to.include(SystemProgram.programId.toBase58());
      
      // Should include platform authority
      expect(addressStrings).to.include(mockPlatformAuthority.toBase58());
      
      // Should include treasury PDA
      expect(addressStrings).to.include(mockTreasuryPda.toBase58());
    });
    
    it('should not have duplicate addresses', () => {
      const addresses = altService.getStaticAddresses();
      const addressStrings = addresses.map(a => a.toBase58());
      const uniqueAddresses = [...new Set(addressStrings)];
      
      expect(addressStrings.length).to.equal(uniqueAddresses.length);
    });
  });
  
  describe('estimateTransactionSize()', () => {
    it('should estimate size correctly for small transaction (legacy)', () => {
      const estimate = altService.estimateTransactionSize({
        numSigners: 2,
        numAccounts: 10,
        instructionDataSize: 100,
        makerCnftProofNodes: 0,
        takerCnftProofNodes: 0,
      });
      
      expect(estimate).to.have.property('estimatedSize');
      expect(estimate).to.have.property('maxSize', 1232);
      expect(estimate).to.have.property('willFit');
      expect(estimate).to.have.property('recommendation');
      expect(estimate).to.have.property('breakdown');
      expect(estimate).to.have.property('useALT');
      
      // Small transaction should fit in legacy format
      expect(estimate.willFit).to.be.true;
      expect(estimate.recommendation).to.equal('legacy');
      expect(estimate.useALT).to.be.false;
    });
    
    it('should recommend versioned transaction with ALT for large cNFT transaction', () => {
      // Simulate a cNFT with 9 proof nodes (low canopy depth)
      const estimate = altService.estimateTransactionSize({
        numSigners: 3,
        numAccounts: 21, // Typical atomic swap accounts
        instructionDataSize: 104,
        makerCnftProofNodes: 9, // 9 proof nodes = 288 bytes
        takerCnftProofNodes: 0,
      });
      
      // With 9 proof nodes, transaction will be too large for legacy
      expect(estimate.estimatedSize).to.be.greaterThan(1232);
      expect(estimate.willFit).to.be.false;
      
      // Should recommend versioned transaction with ALT
      expect(estimate.recommendation).to.equal('versioned');
      expect(estimate.useALT).to.be.true;
      
      // Should have estimated size with ALT
      expect(estimate.estimatedSizeWithALT).to.exist;
      expect(estimate.estimatedSizeWithALT).to.be.lessThan(1232);
    });
    
    it('should calculate breakdown correctly', () => {
      const estimate = altService.estimateTransactionSize({
        numSigners: 2,
        numAccounts: 15,
        instructionDataSize: 150,
        makerCnftProofNodes: 5,
        takerCnftProofNodes: 0,
      });
      
      const breakdown = estimate.breakdown;
      
      // Verify breakdown components
      expect(breakdown.signatures).to.equal(64 * 2); // 128 bytes
      expect(breakdown.accountKeys).to.equal(32 * 15); // 480 bytes
      expect(breakdown.proofData).to.be.greaterThan(0); // Should include proof data
      
      // Proof data should be: base(108) + nodes(5*32) = 268 bytes
      expect(breakdown.proofData).to.equal(108 + (5 * 32));
    });
    
    it('should handle zero proof nodes', () => {
      const estimate = altService.estimateTransactionSize({
        numSigners: 2,
        numAccounts: 10,
        instructionDataSize: 100,
        makerCnftProofNodes: 0,
        takerCnftProofNodes: 0,
      });
      
      // No proof data when no cNFTs
      expect(estimate.breakdown.proofData).to.equal(0);
    });
    
    it('should handle both maker and taker cNFT proofs', () => {
      const estimate = altService.estimateTransactionSize({
        numSigners: 3,
        numAccounts: 25,
        instructionDataSize: 150,
        makerCnftProofNodes: 5, // 268 bytes
        takerCnftProofNodes: 6, // 300 bytes
      });
      
      // Total proof data should be both proofs
      const expectedProofSize = (108 + 5 * 32) + (108 + 6 * 32);
      expect(estimate.breakdown.proofData).to.equal(expectedProofSize);
    });
    
    it('should return cannot_fit for extremely large transactions', () => {
      // Even with ALT, this would be too big
      const estimate = altService.estimateTransactionSize({
        numSigners: 5,
        numAccounts: 30,
        instructionDataSize: 500,
        makerCnftProofNodes: 15, // Very high proof count
        takerCnftProofNodes: 15,
      });
      
      expect(estimate.willFit).to.be.false;
      expect(estimate.recommendation).to.equal('cannot_fit');
    });
  });
  
  describe('getALTAddress()', () => {
    it('should return configured ALT address', () => {
      const address = altService.getALTAddress();
      
      expect(address).to.exist;
      expect(address?.toBase58()).to.equal(mockALTAddress.toBase58());
    });
    
    it('should return undefined when no ALT configured', () => {
      const serviceWithoutALT = createALTService(mockConnection as unknown as Connection, {
        platformAuthority: mockPlatformAuthority,
        treasuryPda: mockTreasuryPda,
        // No lookupTableAddress
      });
      
      const address = serviceWithoutALT.getALTAddress();
      expect(address).to.be.undefined;
    });
  });
  
  describe('Transaction Size Scenarios', () => {
    // Real-world test scenarios based on actual usage
    
    it('Scenario: SPL NFT for SOL (small, legacy)', () => {
      const estimate = altService.estimateTransactionSize({
        numSigners: 2, // maker + taker
        numAccounts: 12, // typical SPL NFT swap
        instructionDataSize: 80,
        makerCnftProofNodes: 0,
        takerCnftProofNodes: 0,
      });
      
      console.log(`    SPL NFT ↔ SOL: ${estimate.estimatedSize} bytes`);
      expect(estimate.recommendation).to.equal('legacy');
    });
    
    it('Scenario: cNFT with 5 proof nodes (medium, legacy)', () => {
      const estimate = altService.estimateTransactionSize({
        numSigners: 2,
        numAccounts: 18,
        instructionDataSize: 100,
        makerCnftProofNodes: 5, // High canopy depth
        takerCnftProofNodes: 0,
      });
      
      console.log(`    cNFT(5 nodes) ↔ SOL: ${estimate.estimatedSize} bytes`);
      // May fit in legacy if tree has good canopy
      expect(['legacy', 'versioned']).to.include(estimate.recommendation);
    });
    
    it('Scenario: cNFT with 9 proof nodes (large, requires ALT)', () => {
      const estimate = altService.estimateTransactionSize({
        numSigners: 3,
        numAccounts: 21,
        instructionDataSize: 104,
        makerCnftProofNodes: 9, // Low canopy depth
        takerCnftProofNodes: 0,
      });
      
      console.log(`    cNFT(9 nodes) ↔ SOL: ${estimate.estimatedSize} bytes → ALT: ${estimate.estimatedSizeWithALT} bytes`);
      expect(estimate.recommendation).to.equal('versioned');
      expect(estimate.useALT).to.be.true;
    });
    
    it('Scenario: cNFT for cNFT (both with proofs, requires ALT)', () => {
      const estimate = altService.estimateTransactionSize({
        numSigners: 3,
        numAccounts: 25,
        instructionDataSize: 120,
        makerCnftProofNodes: 6,
        takerCnftProofNodes: 6,
      });
      
      console.log(`    cNFT(6) ↔ cNFT(6): ${estimate.estimatedSize} bytes → ALT: ${estimate.estimatedSizeWithALT || 'N/A'} bytes`);
      // cNFT ↔ cNFT likely requires ALT
      expect(['versioned', 'cannot_fit']).to.include(estimate.recommendation);
    });
  });
});

