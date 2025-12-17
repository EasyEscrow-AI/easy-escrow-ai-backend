import { redisClient } from '../config/redis';
import crypto from 'crypto';

/**
 * Distributed (Redis-backed) rate limiter for DAS JSON-RPC calls.
 *
 * Why: QuickNode DAS can enforce very low RPS limits (e.g. 2/sec). With multiple pods behind
 * one NAT, a per-process limiter is insufficient. This limiter coordinates across instances.
 *
 * We rate limit per RPC endpoint to avoid slowing other providers unnecessarily.
 */
export class DasHttpRateLimiter {
  private static readonly DEFAULT_INTERVAL_MS = 650; // ~1.5 rps (safer than 2 rps under congestion)
  private static readonly DEFAULT_KEY_PREFIX = 'rate_limit:das:http:';

  // In-memory fallback
  private static inMemoryNextTimeMs: Map<string, number> = new Map();

  private static readonly RESERVE_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local last = tonumber(redis.call("GET", key) or "0")
local scheduled = now
if last + interval > scheduled then
  scheduled = last + interval
end
redis.call("SET", key, tostring(scheduled), "PX", interval * 10)
return scheduled - now
`;

  private static keyForEndpoint(endpoint: string): string {
    const hash = crypto.createHash('sha1').update(endpoint).digest('hex').slice(0, 12);
    return `${DasHttpRateLimiter.DEFAULT_KEY_PREFIX}${hash}`;
  }

  static async waitForSlot(endpoint: string, intervalMs?: number): Promise<void> {
    const baseInterval = intervalMs ?? DasHttpRateLimiter.DEFAULT_INTERVAL_MS;
    const interval =
      Number.isFinite(baseInterval) && baseInterval > 0
        ? Math.floor(baseInterval)
        : DasHttpRateLimiter.DEFAULT_INTERVAL_MS;

    // jitter +/- 20% to avoid sync-thundering-herd across pods
    const jitter = 0.8 + Math.random() * 0.4;
    const effectiveInterval = Math.max(1, Math.floor(interval * jitter));

    const now = Date.now();
    const key = DasHttpRateLimiter.keyForEndpoint(endpoint);

    try {
      const delayMs = await (redisClient as any).eval(
        DasHttpRateLimiter.RESERVE_LUA,
        1,
        key,
        String(now),
        String(effectiveInterval)
      );

      const delay = typeof delayMs === 'number' ? delayMs : parseInt(String(delayMs), 10);
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      return;
    } catch {
      const current = DasHttpRateLimiter.inMemoryNextTimeMs.get(key) || 0;
      const scheduled = Math.max(now, current);
      DasHttpRateLimiter.inMemoryNextTimeMs.set(key, scheduled + effectiveInterval);
      const delay = scheduled - now;
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}


