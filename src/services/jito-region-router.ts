import { redisClient } from '../config/redis';
import { isJitoBundlesEnabled } from '../utils/featureFlags';

/**
 * Picks a Jito Block Engine region for bundle submission, and keeps that region "sticky" for
 * status polling for the same bundleId.
 *
 * Goal: avoid a single congested region / endpoint returning HTTP 429 / -32097, while ensuring
 * we never poll bundle status from a different region than the one used for submission.
 */
export class JitoRegionRouter {
  /**
   * Hardcoded region base URLs (no env var required).
   * These are the region endpoints commonly referenced for Jito Block Engine.
   */
  static readonly REGIONS: ReadonlyArray<string> = [
    'https://ny.mainnet.block-engine.jito.wtf',
    'https://frankfurt.mainnet.block-engine.jito.wtf',
    'https://tokyo.mainnet.block-engine.jito.wtf',
    'https://slc.mainnet.block-engine.jito.wtf',
    'https://amsterdam.mainnet.block-engine.jito.wtf',
  ];

  private static readonly REGION_COOLDOWN_PREFIX = 'jito:region:cooldownUntil:';
  private static readonly BUNDLE_REGION_PREFIX = 'jito:bundle:region:';

  // In-memory fallback (per process) if Redis is unavailable.
  private static regionCooldownUntilMs: Map<string, number> = new Map();
  private static bundleRegion: Map<string, string> = new Map();

  /**
   * Pick a region, preferring those not currently in cooldown.
   * If all are in cooldown, choose the region with the soonest cooldown expiry.
   */
  static async pickRegion(): Promise<string> {
    // If JITO bundles are disabled, return first region as fallback (won't actually be used)
    if (!isJitoBundlesEnabled()) {
      return JitoRegionRouter.REGIONS[0];
    }
    
    const now = Date.now();
    const regions = JitoRegionRouter.REGIONS;

    try {
      const cooldowns = await Promise.all(
        regions.map(async (r) => {
          const v = await (redisClient as any).get(JitoRegionRouter.REGION_COOLDOWN_PREFIX + r);
          const until = v ? parseInt(String(v), 10) : 0;
          return { region: r, until: Number.isFinite(until) ? until : 0 };
        })
      );

      const available = cooldowns.filter(c => c.until <= now);
      if (available.length > 0) {
        // Simple: pick the first available (stable) to avoid thrash.
        return available[0].region;
      }

      // All in cooldown -> pick the soonest expiry.
      cooldowns.sort((a, b) => a.until - b.until);
      return cooldowns[0].region;
    } catch {
      // In-memory fallback
      const cooldowns = regions.map(r => ({
        region: r,
        until: JitoRegionRouter.regionCooldownUntilMs.get(r) || 0,
      }));
      const available = cooldowns.filter(c => c.until <= now);
      if (available.length > 0) return available[0].region;
      cooldowns.sort((a, b) => a.until - b.until);
      return cooldowns[0].region;
    }
  }

  /**
   * Mark a region as rate limited until now + cooldownMs.
   * We keep a TTL so Redis doesn't grow unbounded.
   */
  static async markRateLimited(regionBaseUrl: string, cooldownMs: number): Promise<void> {
    const now = Date.now();
    const until = now + Math.max(0, cooldownMs);
    const ttlSeconds = Math.max(1, Math.ceil((cooldownMs + 30_000) / 1000));

    // In-memory always (cheap)
    JitoRegionRouter.regionCooldownUntilMs.set(regionBaseUrl, until);

    try {
      await (redisClient as any).setex(
        JitoRegionRouter.REGION_COOLDOWN_PREFIX + regionBaseUrl,
        ttlSeconds,
        String(until)
      );
    } catch {
      // ignore
    }
  }

  /**
   * Store bundleId -> region mapping for sticky polling (short-lived).
   */
  static async rememberBundleRegion(bundleId: string, regionBaseUrl: string, ttlMs = 10 * 60_000): Promise<void> {
    const ttlSeconds = Math.max(30, Math.ceil(ttlMs / 1000));
    JitoRegionRouter.bundleRegion.set(bundleId, regionBaseUrl);

    try {
      await (redisClient as any).setex(
        JitoRegionRouter.BUNDLE_REGION_PREFIX + bundleId,
        ttlSeconds,
        regionBaseUrl
      );
    } catch {
      // ignore
    }
  }

  static async getBundleRegion(bundleId: string): Promise<string | null> {
    const inMem = JitoRegionRouter.bundleRegion.get(bundleId);
    if (inMem) return inMem;

    try {
      const v = await (redisClient as any).get(JitoRegionRouter.BUNDLE_REGION_PREFIX + bundleId);
      return v ? String(v) : null;
    } catch {
      return null;
    }
  }
}


