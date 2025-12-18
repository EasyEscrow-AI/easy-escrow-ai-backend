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
 * When disabled, the system falls back to standard sequential transaction submission.
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
 * Environment variable: ENABLE_JITO_BUNDLES
 * - 'true' or '1': Enable JITO bundles (recommended for mainnet)
 * - 'false' or '0' or unset: Disable JITO bundles (default for staging)
 */
export function isJitoBundlesEnabled(): boolean {
  const value = process.env.ENABLE_JITO_BUNDLES?.toLowerCase();
  return value === 'true' || value === '1';
}

/**
 * Log the current state of JITO bundles feature flag.
 * Useful for debugging and startup diagnostics.
 */
export function logJitoBundlesStatus(): void {
  const enabled = isJitoBundlesEnabled();
  const envValue = process.env.ENABLE_JITO_BUNDLES;
  console.log(`[FeatureFlags] JITO Bundles: ${enabled ? 'ENABLED' : 'DISABLED'} (ENABLE_JITO_BUNDLES=${envValue || 'not set'})`);
}
