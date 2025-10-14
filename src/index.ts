import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import { agreementRoutes, expiryCancellationRoutes, webhookRoutes, receiptRoutes } from './routes';
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

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Application = express();
const PORT = process.env.PORT || 3000;

// Initialize orchestrator instances (before route handlers)
const monitoringOrchestrator = getMonitoringOrchestrator({
  autoRestart: true,
  maxRestarts: 5,
  restartDelayMs: 5000,
  healthCheckIntervalMs: 30000,
  metricsIntervalMs: 60000,
});

const expiryCancellationOrchestrator = getExpiryCancellationOrchestrator({
  expiryCheckIntervalMs: 60000, // Check every minute
  autoProcessRefunds: true,
  refundProcessingBatchSize: 10,
  enableMonitoring: true,
});

const idempotencyService = getIdempotencyService({
  expirationHours: 24, // Keep idempotency keys for 24 hours
  cleanupIntervalMinutes: 60, // Clean up expired keys every hour
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
  
  const allHealthy = dbHealthy && monitoringHealth.healthy && expiryCancellationHealth.healthy && idempotencyStatus.isRunning;
  const status = allHealthy ? 'healthy' : 'unhealthy';
  const statusCode = allHealthy ? 200 : 503;
  
  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    service: 'easy-escrow-ai-backend',
    database: dbHealthy ? 'connected' : 'disconnected',
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
  res.status(200).json({
    message: 'EasyEscrow.ai Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      agreements: '/v1/agreements',
      receipts: '/v1/receipts',
      expiryCancellation: '/api/expiry-cancellation',
      webhooks: '/api/webhooks'
    }
  });
});

// API Routes
app.use(agreementRoutes);
app.use(receiptRoutes);
app.use('/api/expiry-cancellation', expiryCancellationRoutes);
app.use('/api', webhookRoutes);

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
    
    // Stop idempotency service
    console.log('Stopping idempotency service...');
    await idempotencyService.stop();
    
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
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 Server is running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`👁️  Deposit monitoring: ACTIVE`);
      console.log(`⏰ Expiry checking: ACTIVE`);
      console.log(`🔑 Idempotency protection: ACTIVE\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
