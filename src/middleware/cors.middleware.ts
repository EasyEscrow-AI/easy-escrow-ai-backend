import { CorsOptions } from 'cors';

/**
 * CORS Configuration Middleware
 * Configures Cross-Origin Resource Sharing for easyescrow.ai domain
 */

/**
 * Allowed origins for CORS
 * In production, only allow easyescrow.ai and its subdomains
 * In development, allow localhost
 */
const getAllowedOrigins = (): string[] => {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    return [
      'https://easyescrow.ai',
      'https://www.easyescrow.ai',
      'https://app.easyescrow.ai',
    ];
  }
  
  // Development and staging environments
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://easyescrow.ai',
    'https://www.easyescrow.ai',
    'https://app.easyescrow.ai',
    'https://staging-api.easyescrow.ai',
  ];
};

/**
 * CORS options configuration
 */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS: Blocked request from origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  },
  credentials: true, // Allow cookies and authentication headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Api-Key',
    'X-Idempotency-Key',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  maxAge: 86400, // Cache preflight response for 24 hours
  optionsSuccessStatus: 200,
};

