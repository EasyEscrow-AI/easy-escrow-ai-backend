import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import { connectRedis, checkRedisHealth, disconnectRedis } from './config/redis';
import { agreementRoutes, expiryCancellationRoutes, webhookRoutes, receiptRoutes, transactionLogRoutes, healthRoutes } from './routes';
import {
  corsOptions,
  helmetConfig,
  sanitizeInput,
  securityHeaders,
} from './middleware';
import { 
  getMonitoringOrchestrator, 
  getExpiryCancellationOrchestrator,
  getIdempotencyService 
} from './services';
import { getStuckAgreementMonitor, AlertSeverity } from './services/stuck-agreement-monitor.service';

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
app.set('trust proxy', true);

// Initialize orchestrator instances (before route handlers)
// Use environment-based intervals to allow tuning in production
const monitoringOrchestrator = getMonitoringOrchestrator({
  autoRestart: true,
  maxRestarts: 5,
  restartDelayMs: 5000,
  healthCheckIntervalMs: (() => {
    const parsed = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '60000', 10);
    return isNaN(parsed) ? 60000 : parsed; // Fallback to 60s if invalid
  })(),
  metricsIntervalMs: (() => {
    const parsed = parseInt(process.env.METRICS_INTERVAL_MS || '120000', 10);
    return isNaN(parsed) ? 120000 : parsed; // Fallback to 120s if invalid
  })(),
});

const expiryCancellationOrchestrator = getExpiryCancellationOrchestrator({
  expiryCheckIntervalMs: (() => {
    const parsed = parseInt(process.env.EXPIRY_CHECK_INTERVAL_MS || '300000', 10);
    return isNaN(parsed) ? 300000 : parsed; // Fallback to 5min if invalid
  })(),
  autoProcessRefunds: true,
  refundProcessingBatchSize: 10,
  enableMonitoring: true,
});

const idempotencyService = getIdempotencyService({
  expirationHours: 24, // Keep idempotency keys for 24 hours
  cleanupIntervalMinutes: 60, // Clean up expired keys every hour
});

const stuckAgreementMonitor = getStuckAgreementMonitor({
  warningThresholdMinutes: 10, // Warn if stuck for 10 minutes
  criticalThresholdMinutes: 30, // Critical if stuck for 30 minutes
  checkIntervalMs: 60000, // Check every minute
});

// Register alert handlers for stuck agreements
stuckAgreementMonitor.onAlert((alert) => {
  const emoji = alert.severity === AlertSeverity.CRITICAL ? '🔴' : '⚠️';
  console.error(`${emoji} [StuckAgreementAlert] ${alert.severity}: ${alert.message}`);
  
  // TODO: In production, send to Slack/email/monitoring service
  // For now, just log to console with clear formatting
  if (alert.severity === AlertSeverity.CRITICAL) {
    console.error(`   🚨 CRITICAL: Agreement requires immediate attention!`);
    console.error(`   Agreement ID: ${alert.agreementId}`);
    console.error(`   Status: ${alert.status}`);
    console.error(`   Time stuck: ${Math.round(alert.timeSinceLastUpdate / 60000)} minutes`);
  }
});

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

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  const redisHealthy = await checkRedisHealth();
  
  // Get monitoring orchestrator health with error handling
  let monitoringHealth;
  let monitoringError = null;
  
  try {
    // Use the module-level orchestrator instance to ensure consistency
    monitoringHealth = monitoringOrchestrator.getHealth();
  } catch (error) {
    // If getHealth() throws, log it and return a safe default
    console.error('[Health Check] Failed to get monitoring health:', error);
    monitoringError = error instanceof Error ? error.message : 'Unknown error';
    monitoringHealth = {
      healthy: false,
      uptime: 0,
      monitoredAccounts: 0,
      solanaHealthy: false,
      restartCount: 0,
    };
  }
  
  // Get expiry-cancellation orchestrator health
  const expiryCancellationHealth = await expiryCancellationOrchestrator.healthCheck();
  
  // Get idempotency service status
  const idempotencyStatus = idempotencyService.getStatus();
  
  const allHealthy = dbHealthy && redisHealthy && monitoringHealth.healthy && expiryCancellationHealth.healthy && idempotencyStatus.isRunning;
  const status = allHealthy ? 'healthy' : 'unhealthy';
  const statusCode = allHealthy ? 200 : 503;
  
  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    service: 'easy-escrow-ai-backend',
    database: dbHealthy ? 'connected' : 'disconnected',
    redis: redisHealthy ? 'connected' : 'disconnected',
    monitoring: {
      status: monitoringHealth.healthy ? 'running' : 'stopped',
      monitoredAccounts: monitoringHealth.monitoredAccounts,
      uptime: `${Math.floor(monitoringHealth.uptime / 1000 / 60)} minutes`,
      restartCount: monitoringHealth.restartCount,
      solanaHealthy: monitoringHealth.solanaHealthy,
      ...(monitoringError && { error: monitoringError }),
    },
    expiryCancellation: {
      status: expiryCancellationHealth.healthy ? 'running' : 'stopped',
      services: expiryCancellationHealth.services,
      recentErrors: expiryCancellationHealth.recentErrors,
    },
    idempotency: {
      status: idempotencyStatus.isRunning ? 'running' : 'stopped',
      expirationHours: idempotencyStatus.expirationHours,
      cleanupIntervalMinutes: idempotencyStatus.cleanupIntervalMinutes,
    }
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  const swaggerPath = process.env.SWAGGER_PATH || '/docs';
  res.status(200).json({
    message: 'EasyEscrow.ai Backend API',
    version: '1.0.0',
    documentation: swaggerPath,
    endpoints: {
      health: '/health',
      agreements: '/v1/agreements',
      receipts: '/v1/receipts',
      transactions: '/v1/transactions',
      expiryCancellation: '/api/expiry-cancellation',
      webhooks: '/api/webhooks'
    }
  });
});

// Swagger Documentation
const swaggerPath = process.env.SWAGGER_PATH || '/docs';
const swaggerDocument = YAML.load(path.join(__dirname, '../docs/api/openapi.yaml'));
app.use(swaggerPath, swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'EasyEscrow.ai API Documentation',
  customfavIcon: '/favicon.ico'
}));

// API Routes
app.use(agreementRoutes);
app.use(receiptRoutes);
app.use('/v1/transactions', transactionLogRoutes);
app.use('/api/expiry-cancellation', expiryCancellationRoutes);
app.use('/api', webhookRoutes);
app.use('/health', healthRoutes);

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
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Stop monitoring orchestrator
    console.log('Stopping monitoring orchestrator...');
    await monitoringOrchestrator.stop();
    
    // Stop expiry-cancellation orchestrator
    console.log('Stopping expiry-cancellation orchestrator...');
    await expiryCancellationOrchestrator.stop();
    
    // Stop stuck agreement monitor
    console.log('Stopping stuck agreement monitor...');
    await stuckAgreementMonitor.stop();
    
    // Stop idempotency service
    console.log('Stopping idempotency service...');
    await idempotencyService.stop();
    
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
      
      // Start orchestrators in background after server is listening
      (async () => {
        try {
          console.log('Starting background services...');
          
          // Start monitoring orchestrator
          console.log('Starting monitoring orchestrator...');
          await monitoringOrchestrator.start();
          console.log('✅ Monitoring orchestrator started');
          
          // Start expiry-cancellation orchestrator
          console.log('Starting expiry-cancellation orchestrator...');
          await expiryCancellationOrchestrator.start();
          console.log('✅ Expiry-cancellation orchestrator started');
          
          // Start idempotency service
          console.log('Starting idempotency service...');
          await idempotencyService.start();
          console.log('✅ Idempotency service started');
          
          // Start stuck agreement monitor
          console.log('Starting stuck agreement monitor...');
          await stuckAgreementMonitor.start();
          console.log('✅ Stuck agreement monitor started');
          
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
