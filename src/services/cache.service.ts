import { redisClient } from '../config/redis';

/**
 * Cache Service
 * 
 * Implements cache-aside pattern with TTL configuration for improved performance
 * and reduced database load
 */

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Cache key prefix
}

export class CacheService {
  private defaultTTL: number = 3600; // 1 hour default
  private prefix: string = 'cache:';

  constructor(options?: CacheOptions) {
    if (options?.ttl) this.defaultTTL = options.ttl;
    if (options?.prefix) this.prefix = options.prefix;
  }

  /**
   * Generate cache key with prefix
   */
  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = this.getKey(key);
      const data = await redisClient.get(cacheKey);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data) as T;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key);
      const data = JSON.stringify(value);
      const expirySeconds = ttl || this.defaultTTL;

      await redisClient.setex(cacheKey, expirySeconds, data);
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key);
      const result = await redisClient.del(cacheKey);
      return result > 0;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const cachePattern = this.getKey(pattern);
      const keys = await redisClient.keys(cachePattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await redisClient.del(...keys);
      return result;
    } catch (error) {
      console.error(`Cache delete pattern error for pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key);
      const result = await redisClient.exists(cacheKey);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      const cacheKey = this.getKey(key);
      return await redisClient.ttl(cacheKey);
    } catch (error) {
      console.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Increment a counter in cache
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      const cacheKey = this.getKey(key);
      return await redisClient.incrby(cacheKey, amount);
    } catch (error) {
      console.error(`Cache increment error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set expiry on an existing key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const cacheKey = this.getKey(key);
      const result = await redisClient.expire(cacheKey, seconds);
      return result === 1;
    } catch (error) {
      console.error(`Cache expire error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const cacheKeys = keys.map(k => this.getKey(k));
      const values = await redisClient.mget(...cacheKeys);
      
      return values.map(value => {
        if (!value) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      console.error(`Cache mget error:`, error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values in cache
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<boolean> {
    try {
      const pipeline = redisClient.pipeline();
      
      for (const entry of entries) {
        const cacheKey = this.getKey(entry.key);
        const data = JSON.stringify(entry.value);
        const expirySeconds = entry.ttl || this.defaultTTL;
        
        pipeline.setex(cacheKey, expirySeconds, data);
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      console.error(`Cache mset error:`, error);
      return false;
    }
  }

  /**
   * Clear all keys with this cache prefix
   */
  async clear(): Promise<number> {
    return await this.deletePattern('*');
  }
}

// Export default cache service instance
export const cacheService = new CacheService();

export default cacheService;

