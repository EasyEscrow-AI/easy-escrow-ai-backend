import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import { agreementRoutes } from './routes';
import {
  standardRateLimiter,
  corsOptions,
  helmetConfig,
  sanitizeInput,
  requestSizeLimiter,
  securityHeaders,
} from './middleware';

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
app.use(requestSizeLimiter('10mb'));

// Input sanitization
app.use(sanitizeInput);

// Rate limiting (apply to all routes except health check)
app.use('/v1', standardRateLimiter);

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  
  const status = dbHealthy ? 'healthy' : 'unhealthy';
  const statusCode = dbHealthy ? 200 : 503;
  
  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    service: 'easy-escrow-ai-backend',
    database: dbHealthy ? 'connected' : 'disconnected'
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

// Start server with database connection
const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;

