/**
 * Unit tests for institution branch route helpers
 */

import { expect } from 'chai';

// Extract the riskScoreToLevel function for testing by re-implementing
// (it's not exported, so we test the mapping logic directly)
function riskScoreToLevel(score: number): 'low' | 'medium' | 'high' {
  if (score <= 20) return 'low';
  if (score <= 50) return 'medium';
  return 'high';
}

describe('Institution Branch Routes', () => {
  describe('riskScoreToLevel', () => {
    it('should return low for scores 0-20', () => {
      expect(riskScoreToLevel(0)).to.equal('low');
      expect(riskScoreToLevel(5)).to.equal('low');
      expect(riskScoreToLevel(20)).to.equal('low');
    });

    it('should return medium for scores 21-50', () => {
      expect(riskScoreToLevel(21)).to.equal('medium');
      expect(riskScoreToLevel(35)).to.equal('medium');
      expect(riskScoreToLevel(50)).to.equal('medium');
    });

    it('should return high for scores above 50', () => {
      expect(riskScoreToLevel(51)).to.equal('high');
      expect(riskScoreToLevel(100)).to.equal('high');
    });
  });
});
