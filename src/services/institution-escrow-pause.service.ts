import { prisma } from '../config/database';
import { redisClient } from '../config/redis';

const REDIS_KEY = 'institution:escrow:system:paused';
const DB_KEY = 'institution_escrow_pause';

export interface PauseState {
  paused: boolean;
  reason?: string;
  pausedBy?: string;
  pausedAt?: string;
}

class InstitutionEscrowPauseService {
  async isPaused(): Promise<PauseState> {
    // Check Redis first (fast path)
    try {
      const cached = await redisClient.get(REDIS_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.warn('[PauseService] Redis read failed, falling back to DB:', (err as Error).message);
    }

    // Fall back to DB
    try {
      const setting = await prisma.systemSetting.findUnique({ where: { key: DB_KEY } });
      if (setting) {
        const value = setting.value as any;
        if (value.paused) {
          const state: PauseState = {
            paused: true,
            reason: value.reason,
            pausedBy: setting.updatedBy || undefined,
            pausedAt: value.pausedAt,
          };
          // Re-populate Redis cache
          try {
            await redisClient.set(REDIS_KEY, JSON.stringify(state));
          } catch {
            // Ignore Redis write failure
          }
          return state;
        }
      }
    } catch (err) {
      console.warn('[PauseService] DB read failed, failing open:', (err as Error).message);
    }

    return { paused: false };
  }

  async pause(reason: string, adminIdentifier: string): Promise<PauseState> {
    // Check if already paused
    const current = await this.isPaused();
    if (current.paused) {
      const error = new Error('Institution escrow operations are already paused');
      (error as any).code = 'ALREADY_PAUSED';
      throw error;
    }

    const pausedAt = new Date().toISOString();
    const state: PauseState = {
      paused: true,
      reason,
      pausedBy: adminIdentifier,
      pausedAt,
    };

    // Write to DB
    await prisma.systemSetting.upsert({
      where: { key: DB_KEY },
      create: {
        key: DB_KEY,
        value: { paused: true, reason, pausedAt } as any,
        updatedBy: adminIdentifier,
      },
      update: {
        value: { paused: true, reason, pausedAt } as any,
        updatedBy: adminIdentifier,
      },
    });

    // Write to Redis
    try {
      await redisClient.set(REDIS_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('[PauseService] Redis write failed on pause:', (err as Error).message);
    }

    // Audit log
    try {
      await prisma.institutionAuditLog.create({
        data: {
          action: 'SYSTEM_PAUSED',
          actor: adminIdentifier,
          details: { reason, pausedAt } as any,
        },
      });
    } catch (err) {
      console.error('[PauseService] Failed to write audit log:', (err as Error).message);
    }

    return state;
  }

  async unpause(adminIdentifier: string): Promise<void> {
    // Check if actually paused
    const current = await this.isPaused();
    if (!current.paused) {
      const error = new Error('Institution escrow operations are not currently paused');
      (error as any).code = 'NOT_PAUSED';
      throw error;
    }

    // Update DB
    await prisma.systemSetting.upsert({
      where: { key: DB_KEY },
      create: {
        key: DB_KEY,
        value: { paused: false } as any,
        updatedBy: adminIdentifier,
      },
      update: {
        value: { paused: false } as any,
        updatedBy: adminIdentifier,
      },
    });

    // Clear Redis cache
    try {
      await redisClient.del(REDIS_KEY);
    } catch (err) {
      console.warn('[PauseService] Redis delete failed on unpause:', (err as Error).message);
    }

    // Audit log
    try {
      await prisma.institutionAuditLog.create({
        data: {
          action: 'SYSTEM_UNPAUSED',
          actor: adminIdentifier,
          details: { unpausedAt: new Date().toISOString() } as any,
        },
      });
    } catch (err) {
      console.error('[PauseService] Failed to write audit log:', (err as Error).message);
    }
  }

  async getStatus(): Promise<PauseState> {
    return this.isPaused();
  }
}

let instance: InstitutionEscrowPauseService | null = null;
export function getInstitutionEscrowPauseService(): InstitutionEscrowPauseService {
  if (!instance) {
    instance = new InstitutionEscrowPauseService();
  }
  return instance;
}
