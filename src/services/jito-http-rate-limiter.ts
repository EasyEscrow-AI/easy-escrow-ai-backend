import { redisClient } from '../config/redis';

/**
 * Distributed (Redis-backed) rate limiter for Jito HTTP endpoints.
 *
 * Why: Jito rate limits are effectively per public IP / region. In production we can have
 * multiple processes/pods behind the same NAT, so an in-process limiter is insufficient.
 *
 * This limiter reserves a "slot" in Redis *before* awaiting, preventing race conditions
 * where multiple callers wake up and fire simultaneously.
 */
export class JitoHttpRateLimiter {
  private static readonly DEFAULT_INTERVAL_MS = 1000;
  private static readonly DEFAULT_REDIS_KEY = 'rate_limit:jito:http';

  // Fallback in-memory limiter (used when Redis is unavailable)
  private static inMemoryNextTimeMs = 0;

  // Lua script: atomically reserve the next allowed time and return delay ms
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

  static async waitForSlot(options?: {
    /** Redis key for the limiter (shared across all Jito HTTP calls) */
    redisKey?: string;
    /** Minimum time between requests in ms (default: 1000) */
    intervalMs?: number;
  }): Promise<void> {
    const redisKey = options?.redisKey || JitoHttpRateLimiter.DEFAULT_REDIS_KEY;
    const intervalMs = options?.intervalMs ?? JitoHttpRateLimiter.DEFAULT_INTERVAL_MS;
    const now = Date.now();

    // Prefer Redis to coordinate across pods; fall back to in-memory if Redis errors.
    try {
      // ioredis eval: eval(script, numKeys, key1, arg1, arg2, ...)
      const delayMs = await (redisClient as any).eval(
        JitoHttpRateLimiter.RESERVE_LUA,
        1,
        redisKey,
        String(now),
        String(intervalMs)
      );

      const delay = typeof delayMs === 'number' ? delayMs : parseInt(String(delayMs), 10);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return;
    } catch {
      // In-memory fallback: claim slot before awaiting to avoid race condition.
      const scheduled = Math.max(now, JitoHttpRateLimiter.inMemoryNextTimeMs);
      JitoHttpRateLimiter.inMemoryNextTimeMs = scheduled + intervalMs;
      const delay = scheduled - now;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}


