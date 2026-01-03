/**
 * Unit Tests for DasHttpRateLimiter
 * Tests Redis-backed distributed rate limiting for DAS API calls
 */

// Safety guard: Abort immediately if not running in test environment
if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    `DasHttpRateLimiter tests must run with NODE_ENV=test. ` +
    `Current NODE_ENV: ${process.env.NODE_ENV}. ` +
    `Aborting to prevent running tests against non-test environment.`
  );
}

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon, { SinonSandbox } from 'sinon';

// We need to test with different env values, so we'll test the logic directly
describe('DasHttpRateLimiter', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let sandbox: SinonSandbox;

  beforeEach(() => {
    // Create sandbox for test isolation
    sandbox = sinon.createSandbox();
    // Save original env
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore sandbox (stubs, spies, etc.)
    sandbox.restore();
    // Restore original env
    process.env = originalEnv;
    // Clear module cache to allow re-import with different env
    delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
  });

  describe('DEFAULT_INTERVAL_MS configuration', () => {
    it('should use 100ms as default when no env var is set', async () => {
      // Clear the env var
      delete process.env.DAS_RATE_LIMIT_INTERVAL_MS;

      // Re-import to get fresh instance
      delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
      const { DasHttpRateLimiter } = await import('../../src/services/das-http-rate-limiter');

      const endpoint = 'https://test-default-100ms.com/rpc';

      // First call should complete quickly (just queue setup)
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);

      // Second call should wait approximately 100ms (with jitter ±20% = 80-120ms)
      const start = Date.now();
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);
      const elapsed = Date.now() - start;

      // With jitter (80-120ms), expect elapsed to be in a reasonable range
      // Use wider bounds to account for test environment variability
      expect(elapsed).to.be.at.least(60);
      expect(elapsed).to.be.at.most(200);
    });

    it('should respect DAS_RATE_LIMIT_INTERVAL_MS env var override', async () => {
      process.env.DAS_RATE_LIMIT_INTERVAL_MS = '200';

      // Re-import to get fresh instance with new env
      delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
      const { DasHttpRateLimiter } = await import('../../src/services/das-http-rate-limiter');

      const endpoint = 'https://test-200ms-override.com/rpc';

      // First call
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);

      // Second call should wait approximately 200ms (with jitter ±20% = 160-240ms)
      const start = Date.now();
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);
      const elapsed = Date.now() - start;

      // With jitter, expect elapsed to be around 200ms
      expect(elapsed).to.be.at.least(120);
      expect(elapsed).to.be.at.most(320);
    });

    it('should fall back to 100ms for invalid env values', async () => {
      process.env.DAS_RATE_LIMIT_INTERVAL_MS = 'invalid';

      delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
      const { DasHttpRateLimiter } = await import('../../src/services/das-http-rate-limiter');

      const endpoint = 'https://test-invalid-fallback.com/rpc';

      // First call
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);

      // Second call should use fallback 100ms
      const start = Date.now();
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);
      const elapsed = Date.now() - start;

      // Should fall back to 100ms default
      expect(elapsed).to.be.at.least(60);
      expect(elapsed).to.be.at.most(200);
    });

    it('should fall back to 100ms for negative values', async () => {
      process.env.DAS_RATE_LIMIT_INTERVAL_MS = '-50';

      delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
      const { DasHttpRateLimiter } = await import('../../src/services/das-http-rate-limiter');

      const endpoint = 'https://test-negative-fallback.com/rpc';

      // Should not throw and should use fallback
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);

      const start = Date.now();
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);
      const elapsed = Date.now() - start;

      // Should fall back to 100ms default
      expect(elapsed).to.be.at.least(60);
      expect(elapsed).to.be.at.most(200);
    });

    it('should fall back to 100ms for zero', async () => {
      process.env.DAS_RATE_LIMIT_INTERVAL_MS = '0';

      delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
      const { DasHttpRateLimiter } = await import('../../src/services/das-http-rate-limiter');

      const endpoint = 'https://test-zero-fallback.com/rpc';

      // Should not throw and should use fallback
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);

      const start = Date.now();
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);
      const elapsed = Date.now() - start;

      // Should fall back to 100ms default
      expect(elapsed).to.be.at.least(60);
      expect(elapsed).to.be.at.most(200);
    });
  });

  describe('waitForSlot behavior', () => {
    it('should apply jitter to avoid thundering herd', async () => {
      delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
      const { DasHttpRateLimiter } = await import('../../src/services/das-http-rate-limiter');

      const endpoint = 'https://test-jitter.com/rpc';
      const timings: number[] = [];

      // Make multiple calls and collect timing data
      await DasHttpRateLimiter.waitForSlot(endpoint, 50);

      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        await DasHttpRateLimiter.waitForSlot(endpoint, 50);
        timings.push(Date.now() - start);
      }

      // With jitter, timings should not all be identical
      // At minimum, they should complete and be in a reasonable range
      timings.forEach(t => {
        expect(t).to.be.at.least(30); // 50ms * 0.8 jitter minimum - some tolerance
        expect(t).to.be.at.most(100); // 50ms * 1.2 jitter maximum + tolerance
      });
    });

    it('should accept custom interval override', async () => {
      delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
      const { DasHttpRateLimiter } = await import('../../src/services/das-http-rate-limiter');

      const endpoint = 'https://custom-interval.com/rpc';

      // First call
      await DasHttpRateLimiter.waitForSlot(endpoint, 30);

      // Second call with custom 30ms interval
      const start = Date.now();
      await DasHttpRateLimiter.waitForSlot(endpoint, 30);
      const elapsed = Date.now() - start;

      // Should use the custom 30ms interval (with jitter)
      expect(elapsed).to.be.at.least(15);
      expect(elapsed).to.be.at.most(60);
    });

    it('should use different keys for different endpoints', async () => {
      delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
      const { DasHttpRateLimiter } = await import('../../src/services/das-http-rate-limiter');

      const endpoint1 = 'https://helius.rpc.com';
      const endpoint2 = 'https://quicknode.rpc.com';

      // First call to each endpoint should be fast (no waiting)
      const start1 = Date.now();
      await DasHttpRateLimiter.waitForSlot(endpoint1, 100);
      const elapsed1 = Date.now() - start1;

      const start2 = Date.now();
      await DasHttpRateLimiter.waitForSlot(endpoint2, 100);
      const elapsed2 = Date.now() - start2;

      // Both first calls should complete quickly (different endpoints = independent rate limits)
      expect(elapsed1).to.be.at.most(50);
      expect(elapsed2).to.be.at.most(50);
    });

    it('should handle invalid interval by using default', async () => {
      delete require.cache[require.resolve('../../src/services/das-http-rate-limiter')];
      const { DasHttpRateLimiter } = await import('../../src/services/das-http-rate-limiter');

      const endpoint = 'https://test-invalid-interval.com/rpc';

      // Should not throw for edge cases - falls back to default
      await DasHttpRateLimiter.waitForSlot(endpoint, NaN);
      await DasHttpRateLimiter.waitForSlot(endpoint, -100);

      // Verify it still rate limits (using default interval)
      const start = Date.now();
      await DasHttpRateLimiter.waitForSlot(endpoint, undefined);
      const elapsed = Date.now() - start;

      // Should have some delay from rate limiting
      expect(elapsed).to.be.at.least(50);
    });
  });
});
