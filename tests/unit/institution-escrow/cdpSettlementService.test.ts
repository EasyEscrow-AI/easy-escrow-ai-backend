/**
 * Unit Tests for CdpSettlementService
 *
 * Tests the CDP (Coinbase Developer Platform) settlement authority wrapper:
 * - getOrCreateAccount: named Solana account creation/retrieval
 * - getPublicKey: PublicKey derivation from CDP account
 * - signTransaction: partially-signed tx signing via CDP
 * - isHealthy: connectivity health check
 *
 * Uses proxyquire to mock @coinbase/cdp-sdk since it has ESM-only dependencies.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import proxyquire from 'proxyquire';
import { PublicKey } from '@solana/web3.js';

// Capture original env values before overriding
const originalEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'NODE_ENV', 'INSTITUTION_ESCROW_ENABLED', 'CDP_ENABLED',
  'CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET',
  'CDP_ACCOUNT_NAME', 'USDC_MINT_ADDRESS', 'JWT_SECRET',
];
for (const key of ENV_KEYS) {
  originalEnv[key] = process.env[key];
}

// Set env before imports
process.env.NODE_ENV = 'test';
process.env.INSTITUTION_ESCROW_ENABLED = 'true';
process.env.CDP_ENABLED = 'true';
process.env.CDP_API_KEY_ID = 'test-key-id';
process.env.CDP_API_KEY_SECRET = 'test-key-secret';
process.env.CDP_WALLET_SECRET = 'test-wallet-secret';
process.env.CDP_ACCOUNT_NAME = 'test-settlement-account';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';

import { resetInstitutionEscrowConfig } from '../../../src/config/institution-escrow.config';

describe('CdpSettlementService', () => {
  let sandbox: sinon.SinonSandbox;
  let CdpSettlementService: any;
  let resetCdpSettlementService: any;
  let service: any;
  let mockAccount: any;
  let MockCdpClient: sinon.SinonStub;

  const FAKE_CDP_ADDRESS = '7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u';

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    resetInstitutionEscrowConfig();

    // Create a mock account
    mockAccount = {
      address: FAKE_CDP_ADDRESS,
      signTransaction: sandbox.stub().resolves({
        signedTransaction: new Uint8Array([1, 2, 3, 4]),
      }),
    };

    // Create mock CdpClient class
    MockCdpClient = sandbox.stub().returns({
      solana: {
        getOrCreateAccount: sandbox.stub().resolves(mockAccount),
      },
    });

    // Use proxyquire to inject mock CdpClient (@noCallThru prevents loading ESM-only deps)
    const cdpModule = proxyquire('../../../src/services/cdp-settlement.service', {
      '@coinbase/cdp-sdk': { CdpClient: MockCdpClient, '@noCallThru': true },
    });

    CdpSettlementService = cdpModule.CdpSettlementService;
    resetCdpSettlementService = cdpModule.resetCdpSettlementService;

    service = new CdpSettlementService();
  });

  afterEach(() => {
    sandbox.restore();
    resetInstitutionEscrowConfig();
    if (resetCdpSettlementService) resetCdpSettlementService();
  });

  after(() => {
    // Restore original env values so subsequent test suites aren't affected
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  // ─── getOrCreateAccount ────────────────────────────────────

  describe('getOrCreateAccount', () => {
    it('should create named Solana account via CDP SDK', async () => {
      const account = await service.getOrCreateAccount();

      const client = MockCdpClient.firstCall.returnValue;
      expect(client.solana.getOrCreateAccount.calledOnce).to.be.true;
      expect(client.solana.getOrCreateAccount.firstCall.args[0]).to.deep.equal({
        name: 'test-settlement-account',
      });
      expect(account.address).to.equal(FAKE_CDP_ADDRESS);
    });

    it('should cache account after first call', async () => {
      await service.getOrCreateAccount();
      await service.getOrCreateAccount();

      const client = MockCdpClient.firstCall.returnValue;
      // Only called once due to caching
      expect(client.solana.getOrCreateAccount.calledOnce).to.be.true;
    });

    it('should throw if CDP API fails', async () => {
      const client = MockCdpClient.firstCall.returnValue;
      client.solana.getOrCreateAccount.rejects(new Error('CDP API unavailable'));
      // Reset cached account
      (service as any).account = null;

      try {
        await service.getOrCreateAccount();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.equal('CDP API unavailable');
      }
    });
  });

  // ─── getPublicKey ──────────────────────────────────────────

  describe('getPublicKey', () => {
    it('should return PublicKey from CDP account address', async () => {
      const pubkey = await service.getPublicKey();

      expect(pubkey).to.be.instanceOf(PublicKey);
      expect(pubkey.toBase58()).to.equal(FAKE_CDP_ADDRESS);
    });

    it('should return cached key on subsequent calls', async () => {
      const key1 = await service.getPublicKey();
      const key2 = await service.getPublicKey();

      expect(key1.toBase58()).to.equal(key2.toBase58());
      const client = MockCdpClient.firstCall.returnValue;
      // getOrCreateAccount should only be called once
      expect(client.solana.getOrCreateAccount.calledOnce).to.be.true;
    });
  });

  // ─── signTransaction ──────────────────────────────────────

  describe('signTransaction', () => {
    it('should send serialized tx to CDP and return signed result', async () => {
      const fakeTx = Buffer.from([10, 20, 30]);

      const result = await service.signTransaction(fakeTx);

      expect(mockAccount.signTransaction.calledOnce).to.be.true;
      expect(mockAccount.signTransaction.firstCall.args[0]).to.deep.equal({
        transaction: fakeTx,
      });
      expect(result).to.be.instanceOf(Buffer);
      expect(result).to.deep.equal(Buffer.from([1, 2, 3, 4]));
    });

    it('should throw descriptive error if CDP rejects (policy violation)', async () => {
      mockAccount.signTransaction.rejects(new Error('Policy violation: unauthorized program'));

      try {
        await service.signTransaction(Buffer.from([1]));
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Policy violation');
      }
    });

    it('should throw if CDP API is unreachable', async () => {
      mockAccount.signTransaction.rejects(new Error('ECONNREFUSED'));

      try {
        await service.signTransaction(Buffer.from([1]));
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('ECONNREFUSED');
      }
    });
  });

  // ─── isHealthy ─────────────────────────────────────────────

  describe('isHealthy', () => {
    it('should return true when CDP account is accessible', async () => {
      const healthy = await service.isHealthy();
      expect(healthy).to.be.true;
    });

    it('should bypass cache and make a fresh remote call', async () => {
      // Prime the cache
      await service.getOrCreateAccount();
      const client = MockCdpClient.firstCall.returnValue;
      expect(client.solana.getOrCreateAccount.callCount).to.equal(1);

      // isHealthy should clear cache and call again
      await service.isHealthy();
      expect(client.solana.getOrCreateAccount.callCount).to.equal(2);
    });

    it('should return false when CDP API fails', async () => {
      const client = MockCdpClient.firstCall.returnValue;
      client.solana.getOrCreateAccount.rejects(new Error('API down'));
      // Reset cached account
      (service as any).account = null;

      const healthy = await service.isHealthy();
      expect(healthy).to.be.false;
    });
  });
});
