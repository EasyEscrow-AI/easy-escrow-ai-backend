/**
 * Unit Tests for DasParallelFetcher
 * Tests parallel DAS provider racing and rate limit configuration
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';

describe('DasParallelFetcher', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Save original env and fetch
    originalEnv = { ...process.env };
    originalFetch = global.fetch;
  });

  afterEach(() => {
    // Restore original env and fetch
    process.env = originalEnv;
    global.fetch = originalFetch;

    // Clear module cache to allow re-import with different env
    delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
    sinon.restore();
  });

  describe('Rate limit configuration', () => {
    it('should use 100ms default for QuickNode (hardcoded paid tier)', async () => {
      // Set up env for QuickNode
      process.env.QUICKNODE_RPC_URL = 'https://test.quicknode.pro/rpc';
      delete process.env.HELIUS_RPC_URL;
      delete process.env.SOLANA_RPC_URL;

      // Mock fetch to prevent actual network calls
      global.fetch = sinon.stub().resolves({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response);

      delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
      const { DasParallelFetcher } = await import('../../src/services/das-parallel-fetcher');

      const fetcher = new DasParallelFetcher();
      const providers = fetcher.getProviders();

      // Find QuickNode provider
      const quicknode = providers.find(p => p.name === 'QuickNode');
      expect(quicknode).to.exist;
      expect(quicknode!.rateLimitIntervalMs).to.equal(100);
    });

    it('should use 100ms default for Helius when env var not set', async () => {
      // Set up env for Helius only
      process.env.HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=test';
      delete process.env.QUICKNODE_RPC_URL;
      delete process.env.SOLANA_RPC_URL;
      delete process.env.HELIUS_DAS_RATE_LIMIT_INTERVAL_MS;

      global.fetch = sinon.stub().resolves({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response);

      delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
      const { DasParallelFetcher } = await import('../../src/services/das-parallel-fetcher');

      const fetcher = new DasParallelFetcher();
      const providers = fetcher.getProviders();

      // Find Helius provider
      const helius = providers.find(p => p.name === 'Helius');
      expect(helius).to.exist;
      expect(helius!.rateLimitIntervalMs).to.equal(100);
    });

    it('should respect HELIUS_DAS_RATE_LIMIT_INTERVAL_MS env var', async () => {
      // Set up env for Helius with custom rate limit
      process.env.HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=test';
      process.env.HELIUS_DAS_RATE_LIMIT_INTERVAL_MS = '50'; // 20 req/s
      delete process.env.QUICKNODE_RPC_URL;
      delete process.env.SOLANA_RPC_URL;

      global.fetch = sinon.stub().resolves({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response);

      delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
      const { DasParallelFetcher } = await import('../../src/services/das-parallel-fetcher');

      const fetcher = new DasParallelFetcher();
      const providers = fetcher.getProviders();

      const helius = providers.find(p => p.name === 'Helius');
      expect(helius).to.exist;
      expect(helius!.rateLimitIntervalMs).to.equal(50);
    });

    it('should NOT have QUICKNODE_DAS_RATE_LIMIT_INTERVAL_MS env var support', async () => {
      // QuickNode rate limit should be hardcoded, not configurable via env
      process.env.QUICKNODE_RPC_URL = 'https://test.quicknode.pro/rpc';
      process.env.QUICKNODE_DAS_RATE_LIMIT_INTERVAL_MS = '200'; // This should be IGNORED
      delete process.env.HELIUS_RPC_URL;
      delete process.env.SOLANA_RPC_URL;

      global.fetch = sinon.stub().resolves({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response);

      delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
      const { DasParallelFetcher } = await import('../../src/services/das-parallel-fetcher');

      const fetcher = new DasParallelFetcher();
      const providers = fetcher.getProviders();

      const quicknode = providers.find(p => p.name === 'QuickNode');
      expect(quicknode).to.exist;
      // Should still be 100ms, NOT 200ms - env var should be ignored
      expect(quicknode!.rateLimitIntervalMs).to.equal(100);
    });
  });

  describe('Provider initialization', () => {
    it('should initialize both providers when both URLs are set', async () => {
      process.env.HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=test';
      process.env.QUICKNODE_RPC_URL = 'https://test.quicknode.pro/rpc';
      delete process.env.SOLANA_RPC_URL;

      global.fetch = sinon.stub().resolves({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response);

      delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
      const { DasParallelFetcher } = await import('../../src/services/das-parallel-fetcher');

      const fetcher = new DasParallelFetcher();
      const providers = fetcher.getProviders();

      expect(providers.length).to.be.at.least(2);
      expect(providers.some(p => p.name === 'Helius')).to.be.true;
      expect(providers.some(p => p.name === 'QuickNode')).to.be.true;
    });

    it('should report parallel racing as available with multiple providers', async () => {
      process.env.HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=test';
      process.env.QUICKNODE_RPC_URL = 'https://test.quicknode.pro/rpc';
      delete process.env.SOLANA_RPC_URL;

      global.fetch = sinon.stub().resolves({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response);

      delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
      const { DasParallelFetcher } = await import('../../src/services/das-parallel-fetcher');

      const fetcher = new DasParallelFetcher();
      expect(fetcher.isParallelAvailable()).to.be.true;
    });

    it('should report parallel racing as unavailable with single provider', async () => {
      process.env.HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=test';
      delete process.env.QUICKNODE_RPC_URL;
      delete process.env.SOLANA_RPC_URL;

      global.fetch = sinon.stub().resolves({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response);

      delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
      const { DasParallelFetcher } = await import('../../src/services/das-parallel-fetcher');

      const fetcher = new DasParallelFetcher();
      expect(fetcher.isParallelAvailable()).to.be.false;
    });

    it('should fall back to SOLANA_RPC_URL when no specific providers configured', async () => {
      delete process.env.HELIUS_RPC_URL;
      delete process.env.QUICKNODE_RPC_URL;
      process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

      global.fetch = sinon.stub().resolves({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response);

      delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
      const { DasParallelFetcher } = await import('../../src/services/das-parallel-fetcher');

      const fetcher = new DasParallelFetcher();
      const providers = fetcher.getProviders();

      expect(providers.length).to.be.at.least(1);
      expect(providers.some(p => p.name === 'Default')).to.be.true;
    });
  });

  describe('Metrics tracking', () => {
    it('should initialize metrics for each provider', async () => {
      process.env.HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=test';
      process.env.QUICKNODE_RPC_URL = 'https://test.quicknode.pro/rpc';
      delete process.env.SOLANA_RPC_URL;

      global.fetch = sinon.stub().resolves({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', result: {} }),
      } as Response);

      delete require.cache[require.resolve('../../src/services/das-parallel-fetcher')];
      const { DasParallelFetcher } = await import('../../src/services/das-parallel-fetcher');

      const fetcher = new DasParallelFetcher();
      const metrics = fetcher.getMetrics();

      expect(metrics).to.have.property('Helius');
      expect(metrics).to.have.property('QuickNode');
      expect(metrics.Helius.totalCalls).to.equal(0);
      expect(metrics.QuickNode.totalCalls).to.equal(0);
    });
  });

  describe('Rate limit constants documentation', () => {
    it('should have correct rate limit values in source code', async () => {
      // This test documents and verifies the expected rate limit configuration
      const fs = await import('fs');
      const path = await import('path');
      const sourcePath = path.join(__dirname, '../../src/services/das-parallel-fetcher.ts');
      const source = fs.readFileSync(sourcePath, 'utf-8');

      // Verify QuickNode default is 100ms (hardcoded)
      expect(source).to.include('DEFAULT_QUICKNODE_RATE_LIMIT = 100');

      // Verify Helius default is 100ms
      expect(source).to.include('DEFAULT_HELIUS_RATE_LIMIT = 100');

      // Verify QuickNode uses hardcoded value (not env var)
      expect(source).to.include('const quicknodeRateLimit = DEFAULT_QUICKNODE_RATE_LIMIT');

      // Verify Helius still supports env var override
      expect(source).to.include('HELIUS_DAS_RATE_LIMIT_INTERVAL_MS');

      // Verify paid tier comment
      expect(source).to.include('10 req/s');
    });
  });
});
