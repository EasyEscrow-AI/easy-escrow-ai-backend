/**
 * API Authentication Middleware
 * 
 * Protects atomic swap endpoints from unauthorized access.
 * Only authorized clients (our frontend) can create offers.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * API Key authentication for atomic swap endpoints
 * 
 * Validates that requests come from authorized sources only.
 * This prevents direct program usage outside of our apps.
 */
export const requireApiKey = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Get API key from header
    const providedKey = req.headers['x-api-key'] as string;
    
    // Get expected API key from environment
    const expectedKey = process.env.ATOMIC_SWAP_API_KEY;
    
    if (!expectedKey) {
      console.error('[API Auth] ATOMIC_SWAP_API_KEY not configured in environment');
      res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'API authentication not configured',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    if (!providedKey) {
      console.warn('[API Auth] Missing API key in request');
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'API key required',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Use constant-time comparison to prevent timing attacks
    const providedKeyBuffer = Buffer.from(providedKey);
    const expectedKeyBuffer = Buffer.from(expectedKey);
    
    if (providedKeyBuffer.length !== expectedKeyBuffer.length) {
      console.warn('[API Auth] Invalid API key length');
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Invalid API key',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    const isValid = crypto.timingSafeEqual(providedKeyBuffer, expectedKeyBuffer);
    
    if (!isValid) {
      console.warn('[API Auth] Invalid API key provided');
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Invalid API key',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // API key is valid, proceed to next middleware
    next();
  } catch (error) {
    console.error('[API Auth] Error validating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Authentication error',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Optional API key middleware
 * Allows requests with valid API key to bypass certain restrictions
 */
export const optionalApiKey = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const providedKey = req.headers['x-api-key'] as string;
    const expectedKey = process.env.ATOMIC_SWAP_API_KEY;
    
    if (providedKey && expectedKey) {
      const providedKeyBuffer = Buffer.from(providedKey);
      const expectedKeyBuffer = Buffer.from(expectedKey);
      
      if (providedKeyBuffer.length === expectedKeyBuffer.length) {
        const isValid = crypto.timingSafeEqual(providedKeyBuffer, expectedKeyBuffer);
        
        if (isValid) {
          // Mark request as authenticated
          (req as any).isAuthenticated = true;
        }
      }
    }
    
    // Continue regardless of authentication status
    next();
  } catch (error) {
    console.error('[API Auth] Error in optional API key check:', error);
    // Continue even on error for optional authentication
    next();
  }
};

/**
 * Generate a secure API key
 * Usage: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

