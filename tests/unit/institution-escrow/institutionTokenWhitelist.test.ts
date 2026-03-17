/**
 * Unit Tests for InstitutionTokenWhitelistService
 *
 * Tests token validation, default mint resolution, and listing.
 *
 * Run:
 *   cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/institution-escrow/institutionTokenWhitelist.test.ts --timeout 30000
 */

import { expect } from 'chai';
import sinon from 'sinon';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars!';
process.env.USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
process.env.INSTITUTION_ESCROW_ENABLED = 'true';
process.env.DO_SPACES_ENDPOINT = 'nyc3.digitaloceanspaces.com';
process.env.DO_SPACES_REGION = 'nyc3';
process.env.DO_SPACES_BUCKET = 'test-bucket';
process.env.DO_SPACES_KEY = 'test-key';
process.env.DO_SPACES_SECRET = 'test-secret';

import { InstitutionTokenWhitelistService } from '../../../src/services/institution-token-whitelist.service';

describe('InstitutionTokenWhitelistService', () => {
  let sandbox: sinon.SinonSandbox;
  let service: InstitutionTokenWhitelistService;
  let prismaStub: any;

  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
  const EURC_MINT = 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr';
  const UNKNOWN_MINT = 'UnknownMint1111111111111111111111111111111111';

  const mockTokens = [
    {
      id: '1', symbol: 'USDC', name: 'USD Coin', mintAddress: USDC_MINT,
      decimals: 6, issuer: 'Circle', jurisdiction: 'US', chain: 'solana',
      isDefault: true, isActive: true, aminaApproved: true,
      addedAt: new Date(), updatedAt: new Date(),
    },
    {
      id: '2', symbol: 'USDT', name: 'Tether USD', mintAddress: USDT_MINT,
      decimals: 6, issuer: 'Tether', jurisdiction: 'BVI', chain: 'solana',
      isDefault: false, isActive: true, aminaApproved: true,
      addedAt: new Date(), updatedAt: new Date(),
    },
    {
      id: '3', symbol: 'EURC', name: 'Euro Coin', mintAddress: EURC_MINT,
      decimals: 6, issuer: 'Circle', jurisdiction: 'EU', chain: 'solana',
      isDefault: false, isActive: true, aminaApproved: true,
      addedAt: new Date(), updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    prismaStub = {
      institutionApprovedToken: {
        findMany: sandbox.stub().resolves(mockTokens),
      },
    };

    service = new InstitutionTokenWhitelistService(prismaStub as any);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('isApproved', () => {
    it('should return true for USDC', async () => {
      expect(await service.isApproved(USDC_MINT)).to.be.true;
    });

    it('should return true for USDT', async () => {
      expect(await service.isApproved(USDT_MINT)).to.be.true;
    });

    it('should return true for EURC', async () => {
      expect(await service.isApproved(EURC_MINT)).to.be.true;
    });

    it('should return false for unknown mint', async () => {
      expect(await service.isApproved(UNKNOWN_MINT)).to.be.false;
    });
  });

  describe('getToken', () => {
    it('should return token metadata for USDC', async () => {
      const token = await service.getToken(USDC_MINT);
      expect(token).to.not.be.null;
      expect(token!.symbol).to.equal('USDC');
      expect(token!.issuer).to.equal('Circle');
      expect(token!.aminaApproved).to.be.true;
      expect(token!.isDefault).to.be.true;
    });

    it('should return null for unknown mint', async () => {
      const token = await service.getToken(UNKNOWN_MINT);
      expect(token).to.be.null;
    });
  });

  describe('getDefaultMint', () => {
    it('should return USDC mint as default', async () => {
      const mint = await service.getDefaultMint();
      expect(mint).to.equal(USDC_MINT);
    });

    it('should fallback to env var if no default in DB', async () => {
      prismaStub.institutionApprovedToken.findMany.resolves([
        { ...mockTokens[1], isDefault: false }, // USDT, not default
      ]);
      service.clearCache();

      const mint = await service.getDefaultMint();
      expect(mint).to.equal(USDC_MINT); // from env var
    });
  });

  describe('listApprovedTokens', () => {
    it('should return all active tokens', async () => {
      const tokens = await service.listApprovedTokens();
      expect(tokens).to.have.length(3);
    });

    it('should include symbol, mint, issuer for each token', async () => {
      const tokens = await service.listApprovedTokens();
      for (const t of tokens) {
        expect(t.symbol).to.be.a('string').and.not.empty;
        expect(t.mintAddress).to.be.a('string').and.not.empty;
        expect(t.issuer).to.be.a('string').and.not.empty;
        expect(t.aminaApproved).to.be.true;
      }
    });

    it('should only query DB once within cache TTL', async () => {
      await service.listApprovedTokens();
      await service.listApprovedTokens();
      await service.listApprovedTokens();
      expect(prismaStub.institutionApprovedToken.findMany.callCount).to.equal(1);
    });
  });

  describe('validateMint', () => {
    it('should return token metadata for approved mint', async () => {
      const token = await service.validateMint(USDC_MINT);
      expect(token.symbol).to.equal('USDC');
    });

    it('should throw for unapproved mint', async () => {
      try {
        await service.validateMint(UNKNOWN_MINT);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('not on the approved whitelist');
        expect(err.message).to.include('USDC');
        expect(err.message).to.include('USDT');
        expect(err.message).to.include('EURC');
      }
    });
  });

  describe('clearCache', () => {
    it('should force re-query after cache clear', async () => {
      await service.listApprovedTokens();
      expect(prismaStub.institutionApprovedToken.findMany.callCount).to.equal(1);

      service.clearCache();
      await service.listApprovedTokens();
      expect(prismaStub.institutionApprovedToken.findMany.callCount).to.equal(2);
    });
  });
});

// ─── Integration: Verify seeded data in staging DB ────────────

describe('AMINA Token Whitelist — Staging DB Verification', () => {
  const { PrismaClient } = require('../../../src/generated/prisma');
  const prisma = new PrismaClient();

  after(async () => {
    await prisma.$disconnect();
  });

  it('should have at least 4 active approved tokens', async () => {
    const count = await prisma.institutionApprovedToken.count({ where: { isActive: true } });
    expect(count).to.be.at.least(4);
  });

  it('should have USDC as default token', async () => {
    const usdc = await prisma.institutionApprovedToken.findUnique({ where: { symbol: 'USDC' } });
    expect(usdc).to.not.be.null;
    expect(usdc.isDefault).to.be.true;
    expect(usdc.mintAddress).to.equal('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(usdc.issuer).to.equal('Circle');
    expect(usdc.aminaApproved).to.be.true;
  });

  for (const symbol of ['USDC', 'USDT', 'EURC', 'PYUSD']) {
    it(`should have active ${symbol} token`, async () => {
      const token = await prisma.institutionApprovedToken.findUnique({ where: { symbol } });
      expect(token, `${symbol} not found`).to.not.be.null;
      expect(token.isActive).to.be.true;
      expect(token.aminaApproved).to.be.true;
      expect(token.chain).to.equal('solana');
      expect(token.decimals).to.equal(6);
    });
  }

  for (const symbol of ['RLUSD', 'USDG']) {
    it(`should have pending ${symbol} token (awaiting Solana deployment)`, async () => {
      const token = await prisma.institutionApprovedToken.findUnique({ where: { symbol } });
      expect(token, `${symbol} not found`).to.not.be.null;
      expect(token.isActive).to.be.false;
      expect(token.aminaApproved).to.be.true;
    });
  }

  it('should have unique mint addresses for all active tokens', async () => {
    const tokens = await prisma.institutionApprovedToken.findMany({ where: { isActive: true } });
    const mints = tokens.map((t: any) => t.mintAddress);
    expect(new Set(mints).size).to.equal(mints.length);
  });
});
