import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import redoc from 'redoc-express';
import YAML from 'yamljs';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import { connectRedis, checkRedisHealth, disconnectRedis } from './config/redis';
// DISABLED: Agreement routes - migrated to atomic swap architecture
// import { agreementRoutes } from './routes';
import {
  expiryCancellationRoutes,
  webhookRoutes,
  receiptRoutes,
  transactionLogRoutes,
  healthRoutes,
  offersRoutes,
  metricsRoutes,
  testRoutes,
  testExecuteRoutes,
  authorizedAppsRoutes,
  noncePoolAdminRoutes,
  assetsRoutes,
  dataSalesRoutes,
} from './routes';
import { noncePoolManager, healthCheckService, assetValidator } from './routes/offers.routes';
import { transactionGroupBuilder } from './routes/test-execute.routes';
import { StaleOfferCleanupScheduler } from './services/stale-offer-cleanup.service';
import { corsOptions, helmetConfig, sanitizeInput, securityHeaders } from './middleware';
import {
  getMonitoringOrchestrator,
  getExpiryCancellationOrchestrator,
  getIdempotencyService,
} from './services';
import {
  getStuckAgreementMonitor,
  AlertSeverity,
} from './services/stuck-agreement-monitor.service';
import {
  getNonceCleanupScheduler,
  getNonceReplenishmentScheduler,
} from './services/nonce-schedulers.service';
import { OfferExpiryScheduler } from './services/offer-expiry-scheduler.service';
// import { backupScheduler } from './services/backup-scheduler.service'; // DISABLED for BETA launch

// Load environment variables
dotenv.config();

// Validate configuration before starting server
import { validateConfig } from './config';
try {
  validateConfig();
} catch (error: any) {
  console.error('❌ Configuration validation failed. Server will not start.');
  console.error('   Error:', error.message);
  process.exit(1);
}

// Initialize Express app
const app: Application = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - Required for DigitalOcean App Platform (and other reverse proxies)
// This allows Express to read X-Forwarded-* headers to get real client IP
// Essential for rate limiting to work correctly
// DigitalOcean App Platform has exactly 1 load balancer - trust 1 hop
app.set('trust proxy', 1);

// Initialize idempotency service for atomic swaps
const idempotencyService = getIdempotencyService({
  expirationHours: 24, // Keep idempotency keys for 24 hours
  cleanupIntervalMinutes: 60, // Clean up expired keys every hour
});

const stuckAgreementMonitor = getStuckAgreementMonitor({
  warningThresholdMinutes: 10, // Warn if stuck for 10 minutes
  criticalThresholdMinutes: 30, // Critical if stuck for 30 minutes
  checkIntervalMs: 60000, // Check every minute
  autoRefundEnabled: true, // ✅ NEW: Automatically refund stuck agreements
  autoRefundThresholdMinutes: 15, // ✅ NEW: Auto-refund after 15 minutes
  maxAgeHours: 24, // ✅ NEW: Only check agreements updated within last 24 hours (prevents accumulation)
});

// Initialize nonce pool schedulers
const nonceCleanupScheduler = getNonceCleanupScheduler(noncePoolManager, {
  cleanupSchedule: '0 * * * *', // Every hour
  timezone: process.env.TZ || 'America/Los_Angeles',
});

const nonceReplenishmentScheduler = getNonceReplenishmentScheduler(noncePoolManager, {
  replenishmentSchedule: '*/30 * * * *', // Every 30 minutes
  timezone: process.env.TZ || 'America/Los_Angeles',
  minPoolSize: 10,
  replenishmentAmount: 5,
});

// Initialize offer expiry scheduler
import { PrismaClient } from './generated/prisma';
const prisma = new PrismaClient();
const offerExpiryScheduler = OfferExpiryScheduler.getInstance(prisma, {
  schedule: '*/15 * * * *', // Every 15 minutes
  batchSize: 200,
  timezone: process.env.TZ || 'America/Los_Angeles',
});

// Initialize stale offer cleanup scheduler
const staleOfferCleanupScheduler = StaleOfferCleanupScheduler.getInstance(
  prisma,
  assetValidator,
  noncePoolManager,
  {
    schedule: '*/30 * * * *', // Every 30 minutes
    batchSize: 50, // Smaller batches due to DAS rate limits
    timezone: process.env.TZ || 'America/Los_Angeles',
  }
);

// Security Middleware (apply first)
app.use(helmetConfig);
app.use(securityHeaders);

// CORS Configuration
app.use(cors(corsOptions));

// Request parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(sanitizeInput);

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Enhanced health check endpoint with treasury PDA, RPC monitoring, and caching
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const healthResult = await healthCheckService.check();
    const statusCode = healthCheckService.getStatusCode(healthResult);

    res.status(statusCode).json(healthResult);
  } catch (error) {
    console.error('[Health Check] Unexpected error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'easy-escrow-ai-backend',
      mode: 'atomic-swap',
      error: error instanceof Error ? error.message : 'Health check failed',
      cached: false,
    });
  }
});

// API Documentation Configuration (Redoc)
const docsPath = process.env.SWAGGER_PATH || '/docs';
let openApiDocument: any = null;

try {
  const openApiFilePath = path.join(__dirname, '../docs/api/openapi.yaml');
  openApiDocument = YAML.load(openApiFilePath);

  // 🔧 Environment-aware server configuration
  const isProd = process.env.NODE_ENV === 'production';
  const isStaging = process.env.NODE_ENV === 'staging';

  if (isProd) {
    openApiDocument.servers = [
      {
        url: 'https://api.easyescrow.ai',
        description: 'Production server',
      },
    ];
  } else if (isStaging) {
    openApiDocument.servers = [
      {
        url: 'https://staging-api.easyescrow.ai',
        description: 'Staging server',
      },
    ];
  } else {
    openApiDocument.servers = [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ];
  }

  console.log(`✅ API documentation loaded successfully from ${openApiFilePath}`);
  console.log(
    `🌐 API servers configured for environment: ${process.env.NODE_ENV || 'development'}`
  );
} catch (error: any) {
  console.warn('⚠️  Warning: Failed to load API documentation');
  console.warn(`   Error: ${error.message}`);
  console.warn(`   Redoc will not be available at ${docsPath}`);
  console.warn('   The API will continue to function normally.');
}

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  const response: any = {
    message: 'EasyEscrow.ai Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      assets: '/api/assets',
      offers: '/api/swaps/offers',
      offersCnft: '/api/swaps/offers/cnft',
      offersBulk: '/api/swaps/offers/bulk',
      receipts: '/v1/receipts',
      transactions: '/v1/transactions',
      expiryCancellation: '/api/expiry-cancellation',
      webhooks: '/api/webhooks',
    },
  };

  // Only include documentation field if OpenAPI spec loaded successfully
  if (openApiDocument) {
    response.documentation = docsPath;
  }

  res.status(200).json(response);
});

// API Documentation with Redoc (only if successfully loaded)
if (openApiDocument) {
  // Serve the OpenAPI spec as JSON for Redoc to consume
  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiDocument);
  });

  // Serve Redoc documentation
  app.get(
    docsPath,
    redoc({
      title: 'EasyEscrow.ai API Documentation',
      specUrl: '/openapi.json',
      redocOptions: {
        theme: {
          colors: {
            primary: {
              main: '#818cf8',
            },
            background: {
              dark: '#0f172a',
              light: '#1e293b',
            },
            text: {
              primary: '#e2e8f0',
              secondary: '#94a3b8',
            },
            http: {
              get: '#22c55e',
              post: '#3b82f6',
              put: '#f59e0b',
              delete: '#ef4444',
            },
            tonalOffset: 0.2,
            border: {
              dark: '#334155',
              light: '#475569',
            },
          },
          typography: {
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '15px',
            headings: {
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            },
            code: {
              backgroundColor: '#1e293b',
            },
          },
          sidebar: {
            width: '280px',
            backgroundColor: '#0f172a',
            textColor: '#e2e8f0',
            activeTextColor: '#818cf8',
          },
          rightPanel: {
            backgroundColor: '#1e293b',
            textColor: '#e2e8f0',
          },
          schema: {
            nestedBackground: '#1e293b',
          },
          spacing: {
            sectionVertical: 16,
          },
        },
        hideDownloadButton: true,
        expandResponses: '200,201',
        pathInMiddlePanel: true,
        sortPropsAlphabetically: false,
        jsonSampleExpandLevel: 2,
        nativeScrollbars: true,
        hideHostname: true,
      },
    })
  );
  console.log(`📚 Redoc documentation available at ${docsPath}`);
} else {
  // Provide a helpful error page if someone tries to access the docs
  app.get(docsPath, (_req: Request, res: Response) => {
    res.status(503).json({
      error: 'Documentation Unavailable',
      message: 'API documentation could not be loaded. Please check server logs for details.',
      timestamp: new Date().toISOString(),
    });
  });
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use(offersRoutes);
app.use(assetsRoutes);
app.use(receiptRoutes);
app.use('/v1/transactions', transactionLogRoutes);
app.use('/api/expiry-cancellation', expiryCancellationRoutes);
app.use('/api', webhookRoutes);
app.use('/health', healthRoutes);
app.use('/metrics', metricsRoutes); // Prometheus metrics endpoint
app.use(authorizedAppsRoutes); // Admin endpoints for zero-fee API key management
app.use('/admin/nonce-pool', noncePoolAdminRoutes); // Admin endpoints for nonce pool management
app.use(testRoutes);
app.use(testExecuteRoutes); // ⚠️ TEST ONLY - Real swap execution with private keys
app.use(dataSalesRoutes); // DataSales.ai settlement layer

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Stop idempotency service
    console.log('Stopping idempotency service...');
    await idempotencyService.stop();

    // Dispose TransactionGroupBuilder (clears cache and intervals)
    console.log('Disposing TransactionGroupBuilder...');
    transactionGroupBuilder.dispose();

    // Disconnect Redis
    console.log('Disconnecting Redis...');
    await disconnectRedis();

    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server with database connection and orchestrators
const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();
    console.log('✅ Database connected');

    // Connect to Redis
    await connectRedis();
    console.log('✅ Redis connected');

    // Start Express server FIRST to respond to health checks
    app.listen(PORT, () => {
      console.log(`\n🚀 Server is running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Redis caching: ACTIVE\n`);

      // Start background services after server is listening
      (async () => {
        try {
          console.log('Starting background services...');

          // Start idempotency service
          console.log('Starting idempotency service...');
          await idempotencyService.start();
          console.log('✅ Idempotency service started');

          // Start offer expiry scheduler
          console.log('Starting offer expiry scheduler...');
          offerExpiryScheduler.start();
          console.log('✅ Offer expiry scheduler started (runs every 15 minutes)');

          // Start stale offer cleanup scheduler
          console.log('Starting stale offer cleanup scheduler...');
          staleOfferCleanupScheduler.start();
          console.log('✅ Stale offer cleanup scheduler started (runs every 30 minutes)');

          // DISABLED for BETA launch - Backup scheduler
          // Manual backups via CLI tools are sufficient for BETA phase
          console.log('⏭️  Backup scheduler disabled (BETA launch - using manual backups)');

          console.log('✅ All background services started');
        } catch (error) {
          console.error('⚠️  Error starting background services:', error);
          console.log('Server will continue running without background services');
        }
      })();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
