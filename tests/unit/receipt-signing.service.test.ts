/**
 * Unit tests for Receipt Signing Service
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { 
  ReceiptSigningService, 
  getReceiptSigningService, 
  resetReceiptSigningService,
  ReceiptData 
} from '../../src/services/receipt-signing.service';

describe('ReceiptSigningService', () => {
  let service: ReceiptSigningService;

  beforeEach(() => {
    // Reset singleton before each test
    resetReceiptSigningService();
    service = new ReceiptSigningService('test-signing-key-1234567890abcdef');
  });

  afterEach(() => {
    resetReceiptSigningService();
  });

  const mockReceiptData: ReceiptData = {
    agreementId: 'test-agreement-123',
    nftMint: 'NFT1234567890',
    price: '100000000',
    platformFee: '2500000',
    creatorRoyalty: '5000000',
    buyer: 'buyer-address-123',
    seller: 'seller-address-456',
    escrowTxId: 'escrow-tx-789',
    settlementTxId: 'settlement-tx-101112',
    createdAt: '2024-01-01T00:00:00.000Z',
    settledAt: '2024-01-02T00:00:00.000Z',
  };

  describe('generateReceiptHash', () => {
    it('should generate a deterministic hash for receipt data', () => {
      const hash1 = service.generateReceiptHash(mockReceiptData);
      const hash2 = service.generateReceiptHash(mockReceiptData);

      expect(hash1).to.equal(hash2);
      expect(hash1).to.have.lengthOf(64); // SHA-256 produces 64 hex characters
    });

    it('should generate different hashes for different data', () => {
      const hash1 = service.generateReceiptHash(mockReceiptData);
      
      const modifiedData = { ...mockReceiptData, price: '200000000' };
      const hash2 = service.generateReceiptHash(modifiedData);

      expect(hash1).to.not.equal(hash2);
    });

    it('should handle missing optional fields (creatorRoyalty)', () => {
      const dataWithoutRoyalty = { ...mockReceiptData };
      delete dataWithoutRoyalty.creatorRoyalty;

      const hash = service.generateReceiptHash(dataWithoutRoyalty);
      
      expect(hash).to.not.be.undefined;
      expect(hash).to.have.lengthOf(64);
    });
  });

  describe('signReceiptHash', () => {
    it('should generate a signature for a hash', () => {
      const hash = service.generateReceiptHash(mockReceiptData);
      const signature = service.signReceiptHash(hash);

      expect(signature).to.not.be.undefined;
      expect(signature).to.have.lengthOf(64); // HMAC-SHA256 produces 64 hex characters
    });

    it('should generate the same signature for the same hash', () => {
      const hash = service.generateReceiptHash(mockReceiptData);
      const signature1 = service.signReceiptHash(hash);
      const signature2 = service.signReceiptHash(hash);

      expect(signature1).to.equal(signature2);
    });

    it('should generate different signatures for different hashes', () => {
      const hash1 = 'abc123';
      const hash2 = 'def456';

      const signature1 = service.signReceiptHash(hash1);
      const signature2 = service.signReceiptHash(hash2);

      expect(signature1).to.not.equal(signature2);
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid signature', () => {
      const hash = service.generateReceiptHash(mockReceiptData);
      const signature = service.signReceiptHash(hash);

      const isValid = service.verifySignature(hash, signature);

      expect(isValid).to.equal(true);
    });

    it('should reject an invalid signature', () => {
      const hash = service.generateReceiptHash(mockReceiptData);
      const invalidSignature = 'invalid-signature-1234567890';

      const isValid = service.verifySignature(hash, invalidSignature);

      expect(isValid).to.equal(false);
    });

    it('should reject a signature with wrong hash', () => {
      const hash = service.generateReceiptHash(mockReceiptData);
      const signature = service.signReceiptHash(hash);

      const differentHash = service.generateReceiptHash({
        ...mockReceiptData,
        price: '999999999',
      });

      const isValid = service.verifySignature(differentHash, signature);

      expect(isValid).to.equal(false);
    });
  });

  describe('generateHashAndSignature', () => {
    it('should generate both hash and signature', () => {
      const result = service.generateHashAndSignature(mockReceiptData);

      expect(result.receiptHash).to.not.be.undefined;
      expect(result.signature).to.not.be.undefined;
      expect(result.receiptHash).to.have.lengthOf(64);
      expect(result.signature).to.have.lengthOf(64);
    });

    it('should generate verifiable hash and signature', () => {
      const result = service.generateHashAndSignature(mockReceiptData);

      const isValid = service.verifySignature(result.receiptHash, result.signature);

      expect(isValid).to.equal(true);
    });
  });

  describe('verifyReceipt', () => {
    it('should verify a valid receipt', () => {
      const { signature } = service.generateHashAndSignature(mockReceiptData);

      const verification = service.verifyReceipt(mockReceiptData, signature);

      expect(verification.isValid).to.equal(true);
      expect(verification.receiptHash).to.not.be.undefined;
    });

    it('should reject a receipt with invalid signature', () => {
      const invalidSignature = 'invalid-signature';

      const verification = service.verifyReceipt(mockReceiptData, invalidSignature);

      expect(verification.isValid).to.equal(false);
    });

    it('should detect tampered receipt data', () => {
      const { signature } = service.generateHashAndSignature(mockReceiptData);

      // Tamper with the data
      const tamperedData = { ...mockReceiptData, price: '999999999' };

      const verification = service.verifyReceipt(tamperedData, signature);

      expect(verification.isValid).to.equal(false);
    });
  });

  describe('getReceiptSigningService', () => {
    it('should return a singleton instance', () => {
      const instance1 = getReceiptSigningService();
      const instance2 = getReceiptSigningService();

      expect(instance1).to.equal(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getReceiptSigningService();
      resetReceiptSigningService();
      const instance2 = getReceiptSigningService();

      expect(instance1).to.not.equal(instance2);
    });
  });

  describe('Security considerations', () => {
    it('should use timing-safe comparison for signature verification', () => {
      // This test ensures the verifySignature method doesn't throw on different length inputs
      const hash = service.generateReceiptHash(mockReceiptData);
      const validSignature = service.signReceiptHash(hash);
      
      // Test with various invalid signatures
      const invalidSignatures = [
        'short',
        validSignature.substring(0, 32), // Half length
        validSignature + 'extra', // Extra characters
      ];

      invalidSignatures.forEach((invalidSig) => {
        const result = service.verifySignature(hash, invalidSig);
        // Should not throw and should return false
        expect(result).to.equal(false);
      });
    });

    it('should generate cryptographically random keys', () => {
      // Create two services without providing keys
      resetReceiptSigningService();
      const service1 = new ReceiptSigningService();
      
      resetReceiptSigningService();
      const service2 = new ReceiptSigningService();

      const hash = service1.generateReceiptHash(mockReceiptData);
      const sig1 = service1.signReceiptHash(hash);
      const sig2 = service2.signReceiptHash(hash);

      // Different keys should produce different signatures
      expect(sig1).to.not.equal(sig2);
    });
  });
});

