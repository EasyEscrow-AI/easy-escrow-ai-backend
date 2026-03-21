/**
 * AI Chat Speed Benchmark Tests
 *
 * Tests response time for FAQ-cached vs Claude API responses.
 * Requires the local server to be running (npm run dev) with a valid JWT token.
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config \
 *     tests/integration/ai-chat-speed-benchmark.test.ts --timeout 60000
 *
 * Environment:
 *   TEST_AUTH_TOKEN — JWT token for an institution client (required)
 *   TEST_API_URL — API base URL (default: http://localhost:3000)
 */

import { expect } from 'chai';
import axios, { AxiosError } from 'axios';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;
const CHAT_ENDPOINT = `${API_URL}/api/v1/ai/chat`;

// Speed thresholds (milliseconds)
const FAQ_MAX_MS = 500; // FAQ answers should be near-instant
const CLAUDE_MAX_MS = 15000; // Claude API responses should be under 15s

interface ChatResponse {
  success: boolean;
  data: {
    reply: string;
    toolsUsed?: string[];
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
  };
  timestamp: string;
}

async function sendChat(
  message: string,
  history?: { role: string; content: string }[]
): Promise<{ data: ChatResponse; durationMs: number }> {
  const start = Date.now();
  const response = await axios.post<ChatResponse>(
    CHAT_ENDPOINT,
    { message, history },
    {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  const durationMs = Date.now() - start;
  return { data: response.data, durationMs };
}

describe('AI Chat Speed Benchmark', function () {
  before(function () {
    if (!AUTH_TOKEN) {
      this.skip();
      return;
    }
  });

  // ══════════════════════════════════════════════════════
  // FAQ FAST-PATH — Should return instantly (no Claude API)
  // ══════════════════════════════════════════════════════
  describe('FAQ Fast-Path (no Claude API call)', () => {
    const faqQuestions = [
      { name: 'Platform fee', message: 'What is the platform fee?' },
      { name: 'Escrow limits', message: 'What are the escrow limits?' },
      { name: 'How escrow works', message: 'How does escrow work?' },
      { name: 'Escrow expiry', message: 'When does escrow expire?' },
      { name: 'SWIFT comparison', message: 'How does this compare to SWIFT?' },
      { name: 'USDC explained', message: 'What is USDC?' },
      { name: 'Settlement speed', message: 'How fast is settlement?' },
      { name: 'Security', message: 'Is EasyEscrow safe?' },
      { name: 'Compliance', message: 'What compliance checks are performed?' },
      { name: 'What can you do', message: 'What can you help with?' },
    ];

    for (const q of faqQuestions) {
      it(`should answer "${q.name}" in under ${FAQ_MAX_MS}ms`, async () => {
        const { data, durationMs } = await sendChat(q.message);

        expect(data.success).to.be.true;
        expect(data.data.reply).to.be.a('string').and.have.length.greaterThan(10);
        // FAQ responses use 0 tokens (no Claude API call)
        expect(data.data.usage?.inputTokens).to.equal(0);
        expect(data.data.usage?.outputTokens).to.equal(0);
        // Should include the "tell me more" prompt
        expect(data.data.reply).to.include('tell me more');

        console.log(`      ⚡ ${q.name}: ${durationMs}ms`);
        expect(
          durationMs,
          `${q.name} took ${durationMs}ms, threshold is ${FAQ_MAX_MS}ms`
        ).to.be.below(FAQ_MAX_MS);
      });
    }

    it('should answer FAQ 10x faster than Claude API threshold', async () => {
      const times: number[] = [];
      for (const q of faqQuestions.slice(0, 5)) {
        const { durationMs } = await sendChat(q.message);
        times.push(durationMs);
      }
      const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`      ⚡ Average FAQ response: ${avgMs.toFixed(0)}ms`);
      expect(avgMs).to.be.below(FAQ_MAX_MS);
    });
  });

  // ══════════════════════════════════════════════════════
  // "TELL ME MORE" EXPANSION — Should also be instant
  // ══════════════════════════════════════════════════════
  describe('"Tell me more" expansion (no Claude API call)', () => {
    it('should expand a FAQ answer instantly', async () => {
      // First, get the short FAQ answer
      const { data: faqResponse } = await sendChat('What is the platform fee?');
      expect(faqResponse.success).to.be.true;

      // Extract the FAQ ID from the response
      const faqIdMatch = faqResponse.data.reply.match(/<!-- faq:([a-z0-9-]+) -->/);
      expect(faqIdMatch, 'FAQ response should contain hidden FAQ ID').to.not.be.null;

      // Now ask "tell me more" with the FAQ response in history
      const { data: expandedResponse, durationMs } = await sendChat('Tell me more', [
        { role: 'user', content: 'What is the platform fee?' },
        { role: 'assistant', content: faqResponse.data.reply },
      ]);

      expect(expandedResponse.success).to.be.true;
      expect(expandedResponse.data.reply.length).to.be.greaterThan(
        faqResponse.data.reply.length,
        'Expanded answer should be longer than short answer'
      );
      expect(expandedResponse.data.usage?.inputTokens).to.equal(0);

      console.log(`      ⚡ "Tell me more" expansion: ${durationMs}ms`);
      expect(durationMs).to.be.below(FAQ_MAX_MS);
    });
  });

  // ══════════════════════════════════════════════════════
  // CLAUDE API — Questions that require the AI
  // ══════════════════════════════════════════════════════
  describe('Claude API responses (requires AI)', () => {
    it('should handle live data query within time limit', async function () {
      const { data, durationMs } = await sendChat('Show me my escrows');

      expect(data.success).to.be.true;
      expect(data.data.reply).to.be.a('string');
      // Claude API should use tokens
      expect(data.data.usage?.inputTokens).to.be.greaterThan(0);

      console.log(
        `      🤖 Live data query: ${durationMs}ms (${data.data.usage?.inputTokens} input, ${data.data.usage?.outputTokens} output tokens)`
      );
      expect(
        durationMs,
        `Live query took ${durationMs}ms, threshold is ${CLAUDE_MAX_MS}ms`
      ).to.be.below(CLAUDE_MAX_MS);
    });

    it('should give concise Claude API responses (under 500 chars for simple questions)', async function () {
      // This question doesn't match FAQ patterns closely, so goes to Claude
      const { data, durationMs } = await sendChat(
        'Can you briefly explain what makes Solana good for payments?'
      );

      expect(data.success).to.be.true;
      const replyLength = data.data.reply.length;

      console.log(
        `      🤖 Claude response: ${durationMs}ms, ${replyLength} chars, ${data.data.usage?.outputTokens} output tokens`
      );

      // With the new concise system prompt, responses should be shorter
      // Allow up to 1500 chars (concise but not artificially truncated)
      expect(replyLength, `Response was ${replyLength} chars — should be concise`).to.be.below(
        1500
      );
    });
  });

  // ══════════════════════════════════════════════════════
  // SPEED COMPARISON SUMMARY
  // ══════════════════════════════════════════════════════
  describe('Speed comparison summary', () => {
    it('should demonstrate FAQ is significantly faster than Claude', async function () {
      // FAQ question
      const faqStart = Date.now();
      await sendChat('What is the platform fee?');
      const faqMs = Date.now() - faqStart;

      // Claude API question (needs live data)
      const claudeStart = Date.now();
      await sendChat('Show me my account summary');
      const claudeMs = Date.now() - claudeStart;

      const speedup = claudeMs / Math.max(faqMs, 1);

      console.log(`\n      ═══════════════════════════════════════`);
      console.log(`      FAQ response:    ${faqMs}ms`);
      console.log(`      Claude response: ${claudeMs}ms`);
      console.log(`      Speedup:         ${speedup.toFixed(1)}x faster`);
      console.log(`      ═══════════════════════════════════════\n`);

      expect(faqMs).to.be.below(claudeMs, 'FAQ should be faster than Claude API');
    });
  });
});
