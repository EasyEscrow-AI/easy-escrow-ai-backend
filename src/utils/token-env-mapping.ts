/**
 * Token Environment Mapping
 *
 * On staging/devnet the DB stores mainnet mint addresses but the actual on-chain
 * tokens use different mints. This utility resolves the correct mint per environment
 * using env vars, and normalises display symbols (e.g. "USDC-DEV" → "USDC").
 *
 * Env vars checked (set only on staging/devnet):
 *   USDC_MINT_ADDRESS, USDT_MINT_ADDRESS, EURC_MINT_ADDRESS, PYUSD_MINT_ADDRESS
 */

/** Map from canonical symbol → env var name that overrides its mint */
const TOKEN_ENV_OVERRIDES: Record<string, string> = {
  USDC: 'USDC_MINT_ADDRESS',
  USDT: 'USDT_MINT_ADDRESS',
  EURC: 'EURC_MINT_ADDRESS',
  PYUSD: 'PYUSD_MINT_ADDRESS',
  RLUSD: 'RLUSD_MINT_ADDRESS',
  USDG: 'USDG_MINT_ADDRESS',
};

/**
 * Return the effective mint address for a token, respecting env overrides.
 * On mainnet the env vars are unset so the DB mint is used as-is.
 */
export function getEffectiveMint(symbol: string, dbMint: string): string {
  const envKey = TOKEN_ENV_OVERRIDES[symbol.toUpperCase()];
  if (envKey) {
    const envMint = process.env[envKey];
    if (envMint) return envMint;
  }
  return dbMint;
}

/**
 * Strip "-DEV" / "-dev" suffixes that devnet tokens carry in their on-chain metadata.
 * "USDC-DEV" → "USDC", "usdc-dev" → "usdc", "USDC" → "USDC" (no-op).
 */
export function normalizeSymbol(symbol: string): string {
  return symbol.replace(/-[Dd][Ee][Vv]$/, '');
}
