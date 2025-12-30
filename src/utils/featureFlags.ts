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
 * When disabled, the system falls back to sequential RPC transaction submission
 * with Just-In-Time (JIT) proof validation for cNFT swaps.
 *
 * **Recommended: Enable JITO bundles for mainnet cNFT swaps** to avoid stale
 * Merkle proof issues. JITO bundles execute atomically, so all transactions
 * share the same proof snapshot.
 *
 * When disabled (sequential RPC mode), each cNFT transaction validates its
 * proof immediately before submission and rebuilds with fresh proof if stale.
 * This adds latency but handles high-activity Merkle trees that change between
 * transactions.
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
 * - 'true' or '1': Enable JITO bundles (recommended for mainnet cNFT swaps)
 * - 'false' or '0' or unset: Disable JITO bundles, use sequential RPC with JIT
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
