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
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
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
 * Request size limiter middleware
 * Prevents large payload attacks
 */
export const requestSizeLimiter = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength, 10);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        res.status(413).json({
          error: 'Payload Too Large',
          message: `Request body exceeds maximum size of ${maxSize}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }
    
    next();
  };
};

/**
 * Parse size string to bytes (e.g., '10mb' -> 10485760)
 */
const parseSize = (size: string): number => {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  
  if (!match) {
    return 10 * 1024 * 1024; // Default to 10MB
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * units[unit]);
};

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

