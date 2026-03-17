import express, { Application, Request, Response, NextFunction } from 'express';
import { offersRoutes, healthRoutes, testRoutes } from '../../src/routes';
import { helmetConfig, sanitizeInput, securityHeaders } from '../../src/middleware';

/**
 * Create test Express app without starting server or orchestrators
 * For integration testing purposes
 * 
 * NOTE: Updated to use atomic swap architecture (offers routes)
 * Legacy agreement routes have been removed.
 */
export const createTestApp = (): Application => {
  const app: Application = express();

  // Security Middleware
  app.use(helmetConfig);
  app.use(securityHeaders);

  // Request parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Input sanitization
  app.use(sanitizeInput);

  // Health check endpoint (simplified for testing)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'easy-escrow-ai-backend-test',
    });
  });

  // Root endpoint
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      message: 'EasyEscrow.ai Backend API - Test Mode',
      version: '1.1.0',
      endpoints: {
        health: '/health',
        offers: '/api/swaps/offers',
      }
    });
  });

  // API Routes - Atomic Swap Architecture
  app.use(offersRoutes);
  app.use(healthRoutes);
  app.use(testRoutes); // Includes /api/quote endpoint

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Cannot ${req.method} ${req.path}`,
      timestamp: new Date().toISOString()
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  });

  return app;
};

