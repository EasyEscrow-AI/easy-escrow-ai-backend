/**
 * Unit Tests for AI Chat FAQ Matcher
 *
 * Tests the FAQ matching system that intercepts common questions
 * and returns pre-built answers without calling the Claude API.
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

import { matchFaq, requiresLiveData } from '../../../src/services/ai-chat-faq-matcher';
import { FAQ_ENTRIES } from '../../../src/data/ai-chat-faq';
import * as redisModule from '../../../src/config/redis';

describe('AI Chat FAQ Matcher', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Stub Redis to avoid real connections
    sandbox.stub(redisModule, 'redisClient').value({
      get: sandbox.stub().resolves(null),
      set: sandbox.stub().resolves('OK'),
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('FAQ Entries', () => {
    it('should have unique IDs', () => {
      const ids = FAQ_ENTRIES.map((e) => e.id);
      const unique = new Set(ids);
      expect(unique.size).to.equal(ids.length, 'Duplicate FAQ entry IDs found');
    });

    it('should have at least 20 FAQ entries', () => {
      expect(FAQ_ENTRIES.length).to.be.at.least(20);
    });

    it('should have non-empty patterns, keywords, and answers for all entries', () => {
      for (const entry of FAQ_ENTRIES) {
        expect(entry.patterns.length, `${entry.id} has no patterns`).to.be.greaterThan(0);
        expect(entry.keywords.length, `${entry.id} has no keywords`).to.be.greaterThan(0);
        expect(entry.answer.length, `${entry.id} has empty answer`).to.be.greaterThan(50);
      }
    });
  });

  describe('matchFaq()', () => {
    // ── Fee questions ──
    it('should match "what is the platform fee"', async () => {
      const result = await matchFaq('What is the platform fee?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('platform-fee');
      expect(result!.confidence).to.be.greaterThan(0.5);
    });

    it('should match "how much does it cost"', async () => {
      const result = await matchFaq('How much does it cost?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('platform-fee');
    });

    it('should match fee comparison question', async () => {
      const result = await matchFaq(
        'Explain the 0.02% platform fee for EasyEscrow stablecoin payments. What does it cover and how does it compare to traditional cross-border payment fees?'
      );
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('platform-fee');
    });

    it('should match "what are the escrow limits"', async () => {
      const result = await matchFaq('What are the escrow limits?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('escrow-limits');
    });

    it('should match "minimum escrow amount"', async () => {
      const result = await matchFaq('What is the minimum escrow amount?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('escrow-limits');
    });

    // ── Platform questions ──
    it('should match "how does escrow work"', async () => {
      const result = await matchFaq('How does escrow work?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('how-escrow-works');
    });

    it('should match "walk me through the escrow process"', async () => {
      const result = await matchFaq('Can you walk me through the escrow process?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('how-escrow-works');
    });

    it('should match "when does escrow expire"', async () => {
      const result = await matchFaq('When does an escrow expire?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('escrow-expiry');
    });

    it('should match "what are the escrow statuses"', async () => {
      const result = await matchFaq('What are the different escrow statuses?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('escrow-statuses');
    });

    it('should match "what does compliance hold mean"', async () => {
      const result = await matchFaq('What does compliance hold mean?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('escrow-statuses');
    });

    it('should match "what corridors are supported"', async () => {
      const result = await matchFaq('Which payment corridors are supported?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('supported-corridors');
    });

    // ── Compliance questions ──
    it('should match "what compliance checks are performed"', async () => {
      const result = await matchFaq('What compliance checks are performed?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('compliance-checks');
    });

    it('should match "how does kyc work"', async () => {
      const result = await matchFaq('How does KYC work?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('kyc-kyb');
    });

    it('should match "what documents are required"', async () => {
      const result = await matchFaq('What documents do I need for an escrow?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('document-requirements');
    });

    it('should match sanctions screening question', async () => {
      const result = await matchFaq('How does sanctions screening work?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('sanctions-screening');
    });

    // ── Technical questions ──
    it('should match "how fast is settlement"', async () => {
      const result = await matchFaq('How fast is settlement on EasyEscrow?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('settlement-time');
    });

    it('should match "what is usdc"', async () => {
      const result = await matchFaq('What is USDC?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('usdc-explained');
    });

    it('should match wallet setup question', async () => {
      const result = await matchFaq('What wallet do I need to use EasyEscrow?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('wallet-setup');
    });

    it('should match "is easyescrow safe"', async () => {
      const result = await matchFaq('How secure is EasyEscrow? Is it safe?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('security');
    });

    it('should match "what happens if a transaction fails"', async () => {
      const result = await matchFaq('What happens if a transaction fails?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('transaction-failed');
    });

    // ── Comparison questions ──
    it('should match SWIFT comparison question', async () => {
      const result = await matchFaq('How does EasyEscrow compare to SWIFT wire transfers?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('swift-comparison');
    });

    it('should match "why use stablecoins instead of swift"', async () => {
      const result = await matchFaq(
        'Why should I use stablecoins instead of traditional wire transfers?'
      );
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('swift-comparison');
    });

    // ── Other questions ──
    it('should match "what is solstice"', async () => {
      const result = await matchFaq('What is Solstice yield?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('solstice-yield');
    });

    it('should match AMINA question', async () => {
      const result = await matchFaq('Tell me about AMINA Group');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('amina-group');
    });

    it('should match "what can you do"', async () => {
      const result = await matchFaq('What can you help me with?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('what-can-you-do');
    });

    it('should match "how do i create an escrow"', async () => {
      const result = await matchFaq('How do I create a new escrow?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('create-escrow-how');
    });

    it('should match cancel escrow question', async () => {
      const result = await matchFaq('How can I cancel an escrow and get a refund?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('cancel-escrow');
    });

    it('should match atomic swaps question', async () => {
      const result = await matchFaq('What are atomic swaps?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('atomic-swaps');
    });

    it('should match travel rule question', async () => {
      const result = await matchFaq('What is the FATF travel rule?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('travel-rule');
    });

    it('should match regulations question', async () => {
      const result = await matchFaq('What regulations apply to stablecoin payments?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('regulations-overview');
    });

    // ── Non-matching questions ──
    it('should NOT match unrelated questions', async () => {
      const result = await matchFaq('What is the weather in Singapore?');
      expect(result).to.be.null;
    });

    it('should NOT match very short inputs', async () => {
      const result = await matchFaq('ok');
      expect(result).to.be.null;
    });

    it('should NOT match gibberish', async () => {
      const result = await matchFaq('asdfghjkl qwerty zxcvbnm');
      expect(result).to.be.null;
    });
  });

  describe('requiresLiveData()', () => {
    it('should return true for specific escrow code', () => {
      expect(requiresLiveData('Show me escrow EE-ABC-123')).to.be.true;
    });

    it('should return true for "my escrows"', () => {
      expect(requiresLiveData('Show me my escrows')).to.be.true;
    });

    it('should return true for "my account"', () => {
      expect(requiresLiveData('What is my account status?')).to.be.true;
    });

    it('should return true for "look up"', () => {
      expect(requiresLiveData('Can you look up my recent transactions?')).to.be.true;
    });

    it('should return true for "my wallet"', () => {
      expect(requiresLiveData('What wallets are registered to my account?')).to.be.true;
    });

    it('should return false for general knowledge questions', () => {
      expect(requiresLiveData('What is the platform fee?')).to.be.false;
    });

    it('should return false for "how does escrow work"', () => {
      expect(requiresLiveData('How does escrow work?')).to.be.false;
    });

    it('should return false for compliance questions', () => {
      expect(requiresLiveData('What compliance checks are performed?')).to.be.false;
    });
  });

  describe('Caching', () => {
    it('should return cached FAQ match on second call', async () => {
      const getStub = redisModule.redisClient.get as sinon.SinonStub;
      const setStub = redisModule.redisClient.set as sinon.SinonStub;

      // First call — cache miss, should match and cache
      const result1 = await matchFaq('What is the platform fee?');
      expect(result1).to.not.be.null;
      expect(setStub.calledOnce).to.be.true;

      // Simulate cache hit on second call
      getStub.resolves(
        JSON.stringify({
          entryId: 'platform-fee',
          confidence: result1!.confidence,
          matchedPattern: result1!.matchedPattern,
        })
      );

      const result2 = await matchFaq('What is the platform fee?');
      expect(result2).to.not.be.null;
      expect(result2!.entry.id).to.equal('platform-fee');
    });

    it('should gracefully handle Redis errors', async () => {
      const getStub = redisModule.redisClient.get as sinon.SinonStub;
      getStub.rejects(new Error('Redis connection refused'));

      // Should still work without cache
      const result = await matchFaq('What is the platform fee?');
      expect(result).to.not.be.null;
      expect(result!.entry.id).to.equal('platform-fee');
    });
  });
});
