/**
 * Treasury Withdrawal Service Unit Tests
 * 
 * Tests the treasury withdrawal timing logic and state management.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { TreasuryWithdrawalService } from '../../src/services/treasury-withdrawal.service';

describe('TreasuryWithdrawalService', () => {
  let service: TreasuryWithdrawalService;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    service = new TreasuryWithdrawalService();
  });

  afterEach(() => {
    if (clock) {
      clock.restore();
    }
  });

  describe('isWithdrawalTime()', () => {
    it('should return true on Sunday at 23:59 UTC', () => {
      // Set fake time to Sunday, Nov 24, 2024 23:59:00 UTC
      clock = sinon.useFakeTimers(new Date('2024-11-24T23:59:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.true;
    });

    it('should return false on Sunday at 23:58 UTC', () => {
      // Set fake time to Sunday, Nov 24, 2024 23:58:00 UTC
      clock = sinon.useFakeTimers(new Date('2024-11-24T23:58:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.false;
    });

    it('should return false on Sunday at 00:00 UTC', () => {
      // Set fake time to Sunday, Nov 24, 2024 00:00:00 UTC
      clock = sinon.useFakeTimers(new Date('2024-11-24T00:00:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.false;
    });

    it('should return false on Monday at 23:59 UTC', () => {
      // Set fake time to Monday, Nov 25, 2024 23:59:00 UTC
      clock = sinon.useFakeTimers(new Date('2024-11-25T23:59:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.false;
    });

    it('should return false on Saturday at 23:59 UTC', () => {
      // Set fake time to Saturday, Nov 23, 2024 23:59:00 UTC
      clock = sinon.useFakeTimers(new Date('2024-11-23T23:59:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.false;
    });

    it('should return false on Wednesday at 12:00 UTC', () => {
      // Set fake time to Wednesday, Nov 20, 2024 12:00:00 UTC
      clock = sinon.useFakeTimers(new Date('2024-11-20T12:00:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.false;
    });

    it('should work across different years', () => {
      // Set fake time to Sunday, Dec 31, 2023 23:59:00 UTC
      clock = sinon.useFakeTimers(new Date('2023-12-31T23:59:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.true;
    });
  });

  describe('Timing Edge Cases', () => {
    it('should handle first Sunday of month', () => {
      // Set fake time to Sunday, Dec 1, 2024 23:59:00 UTC
      clock = sinon.useFakeTimers(new Date('2024-12-01T23:59:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.true;
    });

    it('should handle last Sunday of month', () => {
      // Set fake time to Sunday, Nov 24, 2024 23:59:00 UTC
      clock = sinon.useFakeTimers(new Date('2024-11-24T23:59:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.true;
    });

    it('should handle leap year', () => {
      // Set fake time to Sunday, Feb 25, 2024 23:59:00 UTC (leap year)
      clock = sinon.useFakeTimers(new Date('2024-02-25T23:59:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.true;
    });

    it('should handle daylight saving time transition', () => {
      // Set fake time to Sunday, Mar 10, 2024 23:59:00 UTC (DST transition in US)
      clock = sinon.useFakeTimers(new Date('2024-03-10T23:59:00.000Z'));
      
      const result = service.isWithdrawalTime();
      
      expect(result).to.be.true;
    });
  });

  describe('Weekly Schedule Verification', () => {
    const testWeek = [
      { day: 'Sunday', date: '2024-11-24T23:59:00.000Z', expected: true },
      { day: 'Monday', date: '2024-11-25T23:59:00.000Z', expected: false },
      { day: 'Tuesday', date: '2024-11-26T23:59:00.000Z', expected: false },
      { day: 'Wednesday', date: '2024-11-27T23:59:00.000Z', expected: false },
      { day: 'Thursday', date: '2024-11-28T23:59:00.000Z', expected: false },
      { day: 'Friday', date: '2024-11-29T23:59:00.000Z', expected: false },
      { day: 'Saturday', date: '2024-11-30T23:59:00.000Z', expected: false },
    ];

    testWeek.forEach(({ day, date, expected }) => {
      it(`should return ${expected} for ${day} at 23:59 UTC`, () => {
        clock = sinon.useFakeTimers(new Date(date));
        
        const result = service.isWithdrawalTime();
        
        expect(result).to.equal(expected);
      });
    });
  });

  describe('Service Initialization', () => {
    it('should initialize without errors', () => {
      expect(() => new TreasuryWithdrawalService()).to.not.throw();
    });

    it('should have required methods', () => {
      expect(service).to.have.property('isWithdrawalTime');
      expect(service).to.have.property('getTreasuryPda');
      expect(service).to.have.property('getTreasuryData');
      expect(service).to.have.property('executeWeeklyWithdrawal');
      expect(service).to.have.property('emergencyPause');
      expect(service).to.have.property('unpause');
    });

    it('should have methods as functions', () => {
      expect(service.isWithdrawalTime).to.be.a('function');
      expect(service.getTreasuryPda).to.be.a('function');
      expect(service.getTreasuryData).to.be.a('function');
      expect(service.executeWeeklyWithdrawal).to.be.a('function');
      expect(service.emergencyPause).to.be.a('function');
      expect(service.unpause).to.be.a('function');
    });
  });
});

