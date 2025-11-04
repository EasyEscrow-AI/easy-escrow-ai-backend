import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and DDoS attacks
 */

/**
 * Standard rate limiter for most API endpoints
 * Production: 100 requests per 15 minutes per IP
 * Testing: 1000 requests per 15 minutes per IP
 */
export const standardRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.ENABLE_E2E_TESTING === 'true' ? 1000 : 100, // Higher limit for E2E testing
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  validate: { trustProxy: false }, // Skip trust proxy validation (running behind DO proxy)
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later',
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * Strict rate limiter for sensitive endpoints (e.g., agreement creation)
 * Production: 20 requests per 15 minutes per IP
 * Testing: 500 requests per 15 minutes per IP (allows comprehensive E2E testing)
 */
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.ENABLE_E2E_TESTING === 'true' ? 500 : 20, // Significantly higher limit for E2E testing
  message: {
    error: 'Too Many Requests',
    message: 'Too many creation requests from this IP, please try again later',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // Skip trust proxy validation (running behind DO proxy)
  skipSuccessfulRequests: false, // Count all requests
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many creation requests from this IP, please try again later',
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * Authentication rate limiter for login/auth endpoints
 * Production: 5 attempts per 15 minutes per IP
 * Testing: 50 attempts per 15 minutes per IP
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.ENABLE_E2E_TESTING === 'true' ? 50 : 5, // Higher limit for E2E testing
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts, please try again later',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // Skip trust proxy validation (running behind DO proxy)
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts, please try again later',
      timestamp: new Date().toISOString(),
    });
  },
});

