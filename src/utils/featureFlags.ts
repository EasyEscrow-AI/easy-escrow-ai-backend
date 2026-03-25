/**
 * Feature Flags
 *
 * Centralized feature flag management for the application.
 * Feature flags allow enabling/disabling features via environment variables.
 */

/**
 * Check if JITO bundles are enabled.
 *
 * JITO bundles provide atomic multi-transaction execution on Solana mainnet.
 * They are automatically enabled on mainnet for SPL/Core NFT bulk swaps.
 *
 * **Note**: cNFT swaps now use two-phase delegation instead of Jito bundles
 * for better reliability (avoids 429 rate limit errors during congestion).
 *
 * @returns true if JITO bundles are enabled, false otherwise
 *
 * @example
 * ```typescript
 * if (isJitoBundlesEnabled()) {
 *   await sendBundleViaJito(transactions);
 * } else {
 *   await sendTransactionsSequentially(transactions);
 * }
 * ```
 *
 * Auto-enabled on mainnet (NODE_ENV=production or SOLANA_NETWORK=mainnet-beta).
 * Can be explicitly disabled via DISABLE_JITO_BUNDLES=true for testing.
 */
export function isJitoBundlesEnabled(): boolean {
  // Allow explicit disable for testing
  const disableValue = process.env.DISABLE_JITO_BUNDLES?.toLowerCase();
  if (disableValue === 'true' || disableValue === '1') {
    return false;
  }

  // Auto-enable on mainnet
  const nodeEnv = process.env.NODE_ENV || 'development';
  const network = process.env.SOLANA_NETWORK || 'devnet';
  const rpcUrl = process.env.SOLANA_RPC_URL || '';

  // Explicit env vars take precedence; RPC URL heuristic is only a fallback
  const isMainnet = nodeEnv === 'production' ||
                    (network === 'mainnet-beta' && nodeEnv !== 'staging') ||
                    (nodeEnv !== 'staging' && network !== 'devnet' && rpcUrl.includes('mainnet'));

  return isMainnet;
}

/**
 * Log the current state of JITO bundles feature flag.
 * Useful for debugging and startup diagnostics.
 */
/**
 * Check if privacy features (stealth addresses) are enabled.
 * Enabled by default for institution endpoints (PRIVACY_ENABLED !== 'false').
 */
export function isPrivacyEnabled(): boolean {
  return process.env.PRIVACY_ENABLED !== 'false';
}

export function logJitoBundlesStatus(): void {
  const enabled = isJitoBundlesEnabled();
  const nodeEnv = process.env.NODE_ENV || 'development';
  const network = process.env.SOLANA_NETWORK || 'devnet';
  const disableOverride = process.env.DISABLE_JITO_BUNDLES;

  console.log(`[FeatureFlags] JITO Bundles: ${enabled ? 'ENABLED' : 'DISABLED'} (NODE_ENV=${nodeEnv}, SOLANA_NETWORK=${network}${disableOverride ? `, DISABLE_JITO_BUNDLES=${disableOverride}` : ''})`);
}
