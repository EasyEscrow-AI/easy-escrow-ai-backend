import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

/**
 * Security Middleware
 * General security configurations using Helmet and custom middleware
 */

/**
 * Helmet configuration for security headers
 */
export const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.coingecko.com'], // Allow CoinGecko API for SOL price
    },
  },
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // Frame options
  frameguard: {
    action: 'deny',
  },
  // XSS Protection
  xssFilter: true,
  // Prevent MIME type sniffing
  noSniff: true,
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
});

/**
 * Input sanitization middleware
 * Removes potentially dangerous characters from request data
 */
export const sanitizeInput = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    // Sanitize query parameters
    if (req.query) {
      Object.keys(req.query).forEach((key) => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = sanitizeString(req.query[key] as string);
        }
      });
    }
    
    // Sanitize body parameters (except for specific fields that need raw values)
    if (req.body) {
      const skipFields = ['signature', 'transaction', 'memo']; // Fields to skip sanitization
      
      Object.keys(req.body).forEach((key) => {
        if (!skipFields.includes(key) && typeof req.body[key] === 'string') {
          req.body[key] = sanitizeString(req.body[key]);
        }
      });
    }
    
    next();
  } catch (error) {
    console.error('Input sanitization error:', error);
    next(); // Don't block request on sanitization errors
  }
};

/**
 * Sanitize a string by removing potentially dangerous characters
 */
const sanitizeString = (str: string): string => {
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
};

/**
 * Note: Request size limiting is handled by Express body parsers
 * 
 * Express's express.json() and express.urlencoded() already enforce
 * the 'limit' option (e.g., { limit: '10mb' }), which rejects oversized
 * requests with 413 Payload Too Large before any custom middleware runs.
 * 
 * A custom requestSizeLimiter would be redundant and is therefore not implemented.
 */

/**
 * Security headers middleware
 * Adds custom security headers to responses
 */
export const securityHeaders = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  // API version header
  res.setHeader('X-API-Version', '1.0.0');
  
  // Content type options
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Frame options
  res.setHeader('X-Frame-Options', 'DENY');
  
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

