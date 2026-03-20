import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { Prisma } from '../generated/prisma';

const REDIS_KEY = 'institution:escrow:system:paused';
const REDIS_TTL_SECONDS = 300; // 5 minutes
const DB_KEY = 'institution_escrow_pause';
const MAX_SERIALIZATION_RETRIES = 5;

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
      const setting = await prisma.systemSetting.findUnique({
        where: { key: DB_KEY },
      });

      const state: PauseState = setting && (setting.value as any)?.paused
        ? {
            paused: true,
            reason: (setting.value as any).reason,
            pausedBy: setting.updatedBy || undefined,
            pausedAt: (setting.value as any).pausedAt,
          }
        : { paused: false };

      // Cache the result (both paused and unpaused) to reduce DB lookups
      try {
        await redisClient.set(REDIS_KEY, JSON.stringify(state), 'EX', REDIS_TTL_SECONDS);
      } catch {
        // Ignore Redis write failure
      }

      return state;
    } catch (err) {
      // Fail-closed: treat DB errors as paused to prevent operations during indeterminate state
      console.error('[PauseService] DB read failed, failing closed:', (err as Error).message);
      return { paused: true, reason: 'System state indeterminate — DB read failed' };
    }
  }

  async pause(reason: string, adminIdentifier: string): Promise<PauseState> {
    const pausedAt = new Date().toISOString();

    // Atomic check-and-set with serialization retry
    let state: PauseState | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        state = await prisma.$transaction(
          async (tx) => {
            const setting = await tx.systemSetting.findUnique({
              where: { key: DB_KEY },
            });
            const value = setting?.value as any;
            if (value?.paused === true) {
              return null; // Already paused
            }

            await tx.systemSetting.upsert({
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

            return {
              paused: true,
              reason,
              pausedBy: adminIdentifier,
              pausedAt,
            } as PauseState;
          },
          { isolationLevel: 'Serializable' }
        );
        lastError = null;
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034'
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    if (lastError) throw lastError;

    if (!state) {
      const error = new Error('Institution escrow operations are already paused');
      (error as any).code = 'ALREADY_PAUSED';
      throw error;
    }

    // Write to Redis with TTL
    try {
      await redisClient.set(REDIS_KEY, JSON.stringify(state), 'EX', REDIS_TTL_SECONDS);
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
    // Atomic check-and-set with serialization retry
    let wasPaused = false;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        wasPaused = await prisma.$transaction(
          async (tx) => {
            const setting = await tx.systemSetting.findUnique({
              where: { key: DB_KEY },
            });
            const value = setting?.value as any;
            if (!value?.paused) {
              return false; // Not currently paused
            }

            await tx.systemSetting.update({
              where: { key: DB_KEY },
              data: {
                value: { paused: false } as any,
                updatedBy: adminIdentifier,
              },
            });

            return true;
          },
          { isolationLevel: 'Serializable' }
        );
        lastError = null;
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034'
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    if (lastError) throw lastError;

    if (!wasPaused) {
      const error = new Error('Institution escrow operations are not currently paused');
      (error as any).code = 'NOT_PAUSED';
      throw error;
    }

    // Write unpaused state to Redis (keeps cache warm)
    const unpausedState: PauseState = { paused: false };
    try {
      await redisClient.set(REDIS_KEY, JSON.stringify(unpausedState), 'EX', REDIS_TTL_SECONDS);
    } catch (err) {
      console.warn('[PauseService] Redis write failed on unpause:', (err as Error).message);
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
