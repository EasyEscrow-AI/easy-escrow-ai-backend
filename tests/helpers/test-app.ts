import express, { Application, Request, Response, NextFunction } from 'express';
import { agreementRoutes } from '../../src/routes';
import { corsOptions, helmetConfig, sanitizeInput, securityHeaders } from '../../src/middleware';

/**
 * Create test Express app without starting server or orchestrators
 * For integration testing purposes
 */
export const createTestApp = (): Application => {
  const app: Application = express();

  // Security Middleware
  app.use(helmetConfig);
  app.use(securityHeaders);

  // CORS Configuration
  // app.use(cors(corsOptions)); // Disabled for testing

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
      version: '1.0.0',
      endpoints: {
        health: '/health',
        agreements: '/v1/agreements',
      }
    });
  });

  // API Routes
  app.use(agreementRoutes);

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

