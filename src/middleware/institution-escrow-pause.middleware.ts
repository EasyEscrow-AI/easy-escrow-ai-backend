import { Request, Response, NextFunction } from 'express';
import { getInstitutionEscrowPauseService } from '../services/institution-escrow-pause.service';

export async function requireNotPaused(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const pauseService = getInstitutionEscrowPauseService();
    const state = await pauseService.isPaused();

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
    // Fail-open: if pause check fails, allow request through
    console.warn('[PauseMiddleware] Pause check failed, failing open:', (err as Error).message);
    next();
  }
}
