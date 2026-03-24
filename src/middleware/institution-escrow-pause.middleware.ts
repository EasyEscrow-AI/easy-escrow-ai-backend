import { Request, Response, NextFunction } from 'express';
import { getInstitutionEscrowPauseService } from '../services/institution-escrow-pause.service';

const PAUSE_CHECK_TIMEOUT_MS = 3000;

export async function requireNotPaused(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const pauseService = getInstitutionEscrowPauseService();
    let timer: ReturnType<typeof setTimeout>;
    const state = await Promise.race([
      pauseService.isPaused().finally(() => clearTimeout(timer)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Pause check timed out')), PAUSE_CHECK_TIMEOUT_MS);
      }),
    ]);

    if (state.paused) {
      res.status(503).json({
        error: 'Service Paused',
        message: `Institution escrow operations are temporarily paused: ${
          state.reason || 'No reason provided'
        }`,
        code: 'INSTITUTION_ESCROW_PAUSED',
        pausedAt: state.pausedAt,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  } catch (err) {
    // Fail-open: if pause check fails or times out, allow request through
    console.warn('[PauseMiddleware] Pause check failed, failing open:', (err as Error).message);
    next();
  }
}
