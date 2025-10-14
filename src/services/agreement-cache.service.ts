import { CacheService } from './cache.service';
import { prisma } from '../config/database';
import { Agreement } from '../generated/prisma';

/**
 * Agreement Cache Service
 * 
 * Implements cache-aside pattern for agreement data to improve lookup performance
 * and reduce database load. Handles cache invalidation on agreement updates.
 */

export class AgreementCacheService {
  private cache: CacheService;
  private readonly CACHE_TTL = 1800; // 30 minutes
  private readonly CACHE_PREFIX = 'agreement:';

  constructor() {
    this.cache = new CacheService({
      ttl: this.CACHE_TTL,
      prefix: this.CACHE_PREFIX,
    });
  }

  /**
   * Generate cache key for agreement by ID
   */
  private getAgreementIdKey(agreementId: string): string {
    return `id:${agreementId}`;
  }

  /**
   * Generate cache key for agreement by escrow PDA
   */
  private getAgreementPdaKey(escrowPda: string): string {
    return `pda:${escrowPda}`;
  }

  /**
   * Generate cache key for user agreements
   */
  private getUserAgreementsKey(userId: string): string {
    return `user:${userId}:agreements`;
  }

  /**
   * Get agreement by ID from cache or database (cache-aside pattern)
   */
  async getAgreementById(agreementId: string): Promise<Agreement | null> {
    try {
      const cacheKey = this.getAgreementIdKey(agreementId);
      
      // Try to get from cache first
      const cachedAgreement = await this.cache.get<Agreement>(cacheKey);
      if (cachedAgreement) {
        console.log(`Cache hit for agreement ID: ${agreementId}`);
        return cachedAgreement;
      }

      // Cache miss - fetch from database
      console.log(`Cache miss for agreement ID: ${agreementId}`);
      const agreement = await prisma.agreement.findUnique({
        where: { agreementId: agreementId },
      });

      if (agreement) {
        // Store in cache for future requests
        await this.cacheAgreement(agreement);
      }

      return agreement;
    } catch (error) {
      console.error(`Error getting agreement by ID ${agreementId}:`, error);
      // On error, fall back to database without cache
      return await prisma.agreement.findUnique({
        where: { agreementId: agreementId },
      });
    }
  }

  /**
   * Get agreement by escrow PDA from cache or database
   */
  async getAgreementByPda(escrowPda: string): Promise<Agreement | null> {
    try {
      const cacheKey = this.getAgreementPdaKey(escrowPda);
      
      // Try to get from cache first
      const cachedAgreement = await this.cache.get<Agreement>(cacheKey);
      if (cachedAgreement) {
        console.log(`Cache hit for agreement PDA: ${escrowPda}`);
        return cachedAgreement;
      }

      // Cache miss - fetch from database
      console.log(`Cache miss for agreement PDA: ${escrowPda}`);
      const agreement = await prisma.agreement.findFirst({
        where: { escrowPda },
      });

      if (agreement) {
        // Store in cache for future requests
        await this.cacheAgreement(agreement);
      }

      return agreement;
    } catch (error) {
      console.error(`Error getting agreement by PDA ${escrowPda}:`, error);
      // On error, fall back to database without cache
      return await prisma.agreement.findFirst({
        where: { escrowPda },
      });
    }
  }

  /**
   * Cache an agreement (stores by both ID and PDA)
   */
  async cacheAgreement(agreement: Agreement): Promise<void> {
    try {
      const idKey = this.getAgreementIdKey(agreement.id);
      const pdaKey = this.getAgreementPdaKey(agreement.escrowPda);

      // Store by both ID and PDA for flexible lookups
      await Promise.all([
        this.cache.set(idKey, agreement),
        this.cache.set(pdaKey, agreement),
      ]);

      console.log(`Agreement cached: ${agreement.id}`);
    } catch (error) {
      console.error(`Error caching agreement ${agreement.id}:`, error);
    }
  }

  /**
   * Invalidate cache for a specific agreement
   */
  async invalidateAgreement(agreement: Agreement | { id: string; escrowPda: string }): Promise<void> {
    try {
      const idKey = this.getAgreementIdKey(agreement.id);
      const pdaKey = this.getAgreementPdaKey(agreement.escrowPda);

      await Promise.all([
        this.cache.delete(idKey),
        this.cache.delete(pdaKey),
      ]);

      console.log(`Agreement cache invalidated: ${agreement.id}`);
    } catch (error) {
      console.error(`Error invalidating agreement cache ${agreement.id}:`, error);
    }
  }

  /**
   * Invalidate cache for multiple agreements
   */
  async invalidateAgreements(agreements: Array<{ id: string; escrowPda: string }>): Promise<void> {
    await Promise.all(
      agreements.map(agreement => this.invalidateAgreement(agreement))
    );
  }

  /**
   * Update agreement in cache (updates both database and cache)
   */
  async updateAgreement(
    agreementId: string,
    data: Partial<Agreement>
  ): Promise<Agreement> {
    try {
      // Update in database
      const updatedAgreement = await prisma.agreement.update({
        where: { agreementId: agreementId },
        data,
      });

      // Invalidate old cache
      await this.invalidateAgreement(updatedAgreement);

      // Cache the updated agreement
      await this.cacheAgreement(updatedAgreement);

      return updatedAgreement;
    } catch (error) {
      console.error(`Error updating agreement ${agreementId}:`, error);
      throw error;
    }
  }

  /**
   * Get user agreements with caching
   */
  async getUserAgreements(userId: string): Promise<Agreement[]> {
    try {
      const cacheKey = this.getUserAgreementsKey(userId);
      
      // Try to get from cache first
      const cachedAgreements = await this.cache.get<Agreement[]>(cacheKey);
      if (cachedAgreements) {
        console.log(`Cache hit for user agreements: ${userId}`);
        return cachedAgreements;
      }

      // Cache miss - fetch from database
      console.log(`Cache miss for user agreements: ${userId}`);
      const agreements = await prisma.agreement.findMany({
        where: {
          OR: [
            { buyer: userId },
            { seller: userId },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      // Store in cache with shorter TTL (5 minutes) since lists change more frequently
      await this.cache.set(cacheKey, agreements, 300);

      return agreements;
    } catch (error) {
      console.error(`Error getting user agreements for ${userId}:`, error);
      // On error, fall back to database without cache
      return await prisma.agreement.findMany({
        where: {
          OR: [
            { buyer: userId },
            { seller: userId },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    }
  }

  /**
   * Invalidate user agreements cache
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      const cacheKey = this.getUserAgreementsKey(userId);
      await this.cache.delete(cacheKey);
      console.log(`User agreements cache invalidated: ${userId}`);
    } catch (error) {
      console.error(`Error invalidating user cache ${userId}:`, error);
    }
  }

  /**
   * Warm up cache with frequently accessed agreements
   */
  async warmupCache(agreementIds: string[]): Promise<void> {
    try {
      const agreements = await prisma.agreement.findMany({
        where: {
          agreementId: { in: agreementIds },
        },
      });

      await Promise.all(
        agreements.map(agreement => this.cacheAgreement(agreement))
      );

      console.log(`Cache warmed up with ${agreements.length} agreements`);
    } catch (error) {
      console.error('Error warming up cache:', error);
    }
  }

  /**
   * Clear all agreement caches
   */
  async clearAllCache(): Promise<void> {
    try {
      await this.cache.clear();
      console.log('All agreement caches cleared');
    } catch (error) {
      console.error('Error clearing agreement caches:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalKeys: number;
    hitRate: number;
  }> {
    // This is a simplified version - in production you'd want to track hits/misses
    return {
      totalKeys: 0, // Would need to implement key counting
      hitRate: 0, // Would need to track hit/miss ratio
    };
  }
}

// Export singleton instance
export const agreementCacheService = new AgreementCacheService();

export default agreementCacheService;

