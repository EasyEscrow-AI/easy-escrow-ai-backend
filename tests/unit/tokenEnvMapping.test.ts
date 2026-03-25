import { expect } from 'chai';
import { getEffectiveMint, normalizeSymbol } from '../../src/utils/token-env-mapping';

describe('token-env-mapping', () => {
  const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const DEVNET_USDC_MINT = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

  describe('getEffectiveMint', () => {
    it('returns DB mint when no env override is set', () => {
      delete process.env.USDC_MINT_ADDRESS;
      expect(getEffectiveMint('USDC', MAINNET_USDC_MINT)).to.equal(MAINNET_USDC_MINT);
    });

    it('returns env mint when USDC_MINT_ADDRESS is set', () => {
      process.env.USDC_MINT_ADDRESS = DEVNET_USDC_MINT;
      expect(getEffectiveMint('USDC', MAINNET_USDC_MINT)).to.equal(DEVNET_USDC_MINT);
      delete process.env.USDC_MINT_ADDRESS;
    });

    it('returns env mint for USDT when override is set', () => {
      const devnetUsdt = 'FakeDevnetUSDTMint1234567890abcdefghijklmnop';
      process.env.USDT_MINT_ADDRESS = devnetUsdt;
      expect(getEffectiveMint('USDT', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')).to.equal(
        devnetUsdt
      );
      delete process.env.USDT_MINT_ADDRESS;
    });

    it('returns DB mint for unknown tokens', () => {
      const customMint = 'CustomTokenMintAddress12345678901234567890ab';
      expect(getEffectiveMint('CUSTOM', customMint)).to.equal(customMint);
    });

    it('is case-insensitive for symbol lookup', () => {
      process.env.USDC_MINT_ADDRESS = DEVNET_USDC_MINT;
      expect(getEffectiveMint('usdc', MAINNET_USDC_MINT)).to.equal(DEVNET_USDC_MINT);
      delete process.env.USDC_MINT_ADDRESS;
    });
  });

  describe('normalizeSymbol', () => {
    it('strips -DEV suffix', () => {
      expect(normalizeSymbol('USDC-DEV')).to.equal('USDC');
    });

    it('strips -dev suffix (lowercase)', () => {
      expect(normalizeSymbol('USDC-dev')).to.equal('USDC');
    });

    it('strips -Dev suffix (mixed case)', () => {
      expect(normalizeSymbol('USDC-Dev')).to.equal('USDC');
    });

    it('leaves canonical symbols unchanged', () => {
      expect(normalizeSymbol('USDC')).to.equal('USDC');
      expect(normalizeSymbol('USDT')).to.equal('USDT');
      expect(normalizeSymbol('EURC')).to.equal('EURC');
    });

    it('does not strip DEV without hyphen', () => {
      expect(normalizeSymbol('USDCDEV')).to.equal('USDCDEV');
    });
  });
});
