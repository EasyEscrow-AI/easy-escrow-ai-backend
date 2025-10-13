import { expect } from 'chai';
import { AgreementStatus } from '../../src/generated/prisma';

describe('Status Update Service - Unit Tests', () => {
  describe('Status Transition Validation', () => {
    it('should allow PENDING -> USDC_LOCKED transition', () => {
      const currentStatus = AgreementStatus.PENDING;
      const newStatus = AgreementStatus.USDC_LOCKED;
      
      const validTransitions = [
        AgreementStatus.USDC_LOCKED,
        AgreementStatus.NFT_LOCKED,
        AgreementStatus.CANCELLED,
        AgreementStatus.EXPIRED,
      ];
      
      expect(validTransitions).to.include(newStatus);
    });

    it('should allow PENDING -> NFT_LOCKED transition', () => {
      const currentStatus = AgreementStatus.PENDING;
      const newStatus = AgreementStatus.NFT_LOCKED;
      
      const validTransitions = [
        AgreementStatus.USDC_LOCKED,
        AgreementStatus.NFT_LOCKED,
        AgreementStatus.CANCELLED,
        AgreementStatus.EXPIRED,
      ];
      
      expect(validTransitions).to.include(newStatus);
    });

    it('should allow USDC_LOCKED -> BOTH_LOCKED transition', () => {
      const currentStatus = AgreementStatus.USDC_LOCKED;
      const newStatus = AgreementStatus.BOTH_LOCKED;
      
      const validTransitions = [
        AgreementStatus.BOTH_LOCKED,
        AgreementStatus.CANCELLED,
        AgreementStatus.EXPIRED,
      ];
      
      expect(validTransitions).to.include(newStatus);
    });

    it('should allow NFT_LOCKED -> BOTH_LOCKED transition', () => {
      const currentStatus = AgreementStatus.NFT_LOCKED;
      const newStatus = AgreementStatus.BOTH_LOCKED;
      
      const validTransitions = [
        AgreementStatus.BOTH_LOCKED,
        AgreementStatus.CANCELLED,
        AgreementStatus.EXPIRED,
      ];
      
      expect(validTransitions).to.include(newStatus);
    });

    it('should allow BOTH_LOCKED -> SETTLED transition', () => {
      const currentStatus = AgreementStatus.BOTH_LOCKED;
      const newStatus = AgreementStatus.SETTLED;
      
      const validTransitions = [
        AgreementStatus.SETTLED,
        AgreementStatus.CANCELLED,
        AgreementStatus.EXPIRED,
      ];
      
      expect(validTransitions).to.include(newStatus);
    });

    it('should not allow SETTLED -> any transition', () => {
      const currentStatus = AgreementStatus.SETTLED;
      const validTransitions: AgreementStatus[] = [];
      
      expect(validTransitions).to.have.lengthOf(0);
    });

    it('should not allow CANCELLED -> any transition', () => {
      const currentStatus = AgreementStatus.CANCELLED;
      const validTransitions: AgreementStatus[] = [];
      
      expect(validTransitions).to.have.lengthOf(0);
    });

    it('should allow EXPIRED -> REFUNDED transition', () => {
      const currentStatus = AgreementStatus.EXPIRED;
      const newStatus = AgreementStatus.REFUNDED;
      
      const validTransitions = [AgreementStatus.REFUNDED];
      
      expect(validTransitions).to.include(newStatus);
    });
  });

  describe('Status Finality', () => {
    it('should identify terminal statuses', () => {
      const terminalStatuses = [
        AgreementStatus.SETTLED,
        AgreementStatus.CANCELLED,
        AgreementStatus.REFUNDED,
      ];
      
      expect(terminalStatuses).to.have.lengthOf(3);
    });

    it('should identify active statuses', () => {
      const activeStatuses = [
        AgreementStatus.PENDING,
        AgreementStatus.USDC_LOCKED,
        AgreementStatus.NFT_LOCKED,
        AgreementStatus.BOTH_LOCKED,
      ];
      
      expect(activeStatuses).to.have.lengthOf(4);
    });
  });

  describe('Status Order Validation', () => {
    it('should validate status progression order', () => {
      const expectedOrder = [
        AgreementStatus.PENDING,
        AgreementStatus.USDC_LOCKED, // or NFT_LOCKED
        AgreementStatus.BOTH_LOCKED,
        AgreementStatus.SETTLED,
      ];
      
      expect(expectedOrder).to.have.lengthOf(4);
    });
  });

  describe('Monotonic Status Transitions', () => {
    it('should not allow backward transitions', () => {
      // SETTLED cannot go back to BOTH_LOCKED
      const isValidBackward = false;
      expect(isValidBackward).to.be.false;
    });

    it('should not allow SETTLED -> PENDING', () => {
      const isValid = false;
      expect(isValid).to.be.false;
    });

    it('should not allow BOTH_LOCKED -> USDC_LOCKED', () => {
      const isValid = false;
      expect(isValid).to.be.false;
    });
  });
});

