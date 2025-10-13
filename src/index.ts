import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import { agreementRoutes } from './routes';
import {
  corsOptions,
  helmetConfig,
  sanitizeInput,
  securityHeaders,
} from './middleware';
import { getMonitoringOrchestrator } from './services';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Application = express();
const PORT = process.env.PORT || 3000;

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
  
  // Get monitoring orchestrator health
  const orchestrator = getMonitoringOrchestrator();
  const monitoringHealth = orchestrator.getHealth();
  
  const allHealthy = dbHealthy && monitoringHealth.healthy;
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
      agreements: '/v1/agreements'
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
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    timestamp: new Date().toISOString()
  });
});

// Get monitoring orchestrator instance
const monitoringOrchestrator = getMonitoringOrchestrator({
  autoRestart: true,
  maxRestarts: 5,
  restartDelayMs: 5000,
  healthCheckIntervalMs: 30000,
  metricsIntervalMs: 60000,
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Stop monitoring orchestrator
    console.log('Stopping monitoring orchestrator...');
    await monitoringOrchestrator.stop();
    
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

// Start server with database connection and monitoring
const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();
    console.log('✅ Database connected');
    
    // Start monitoring orchestrator
    console.log('Starting monitoring orchestrator...');
    await monitoringOrchestrator.start();
    console.log('✅ Monitoring orchestrator started');
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 Server is running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`👁️  Deposit monitoring: ACTIVE\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;

