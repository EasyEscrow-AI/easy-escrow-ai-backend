import { Request, Response, NextFunction } from 'express';

/**
 * Authentication Middleware
 * Protects endpoints that require authentication
 */

/**
 * Extended Request interface with authenticated user info
 */
export interface AuthenticatedRequest extends Request {
  apiKey?: string;
  authenticated?: boolean;
}

/**
 * Simple API Key authentication middleware
 * Validates X-Api-Key header against allowed API keys
 * 
 * For MVP, this provides basic protection for admin/sensitive endpoints.
 * Future enhancement: Implement JWT-based auth with user roles
 */
export const authenticateApiKey = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Get API key from header
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key is required. Please provide X-Api-Key header',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Validate API key against allowed keys
    if (!validateApiKey(apiKey)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid or expired API key',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Attach API key info to request
    req.apiKey = apiKey;
    req.authenticated = true;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate request',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Validate API key against allowed keys
 */
const validateApiKey = (apiKey: string): boolean => {
  // Get allowed API keys from environment
  const allowedKeys = process.env.API_KEYS?.split(',').map(k => k.trim()) || [];
  
  // For development, allow a default test key
  if (process.env.NODE_ENV === 'development' && apiKey === 'test-api-key-dev') {
    return true;
  }
  
  return allowedKeys.includes(apiKey);
};

/**
 * Optional authentication middleware
 * Validates API key if provided, but doesn't require it
 * Useful for endpoints that have different behavior for authenticated users
 */
export const optionalAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (apiKey && validateApiKey(apiKey)) {
      req.apiKey = apiKey;
      req.authenticated = true;
    } else {
      req.authenticated = false;
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors
    req.authenticated = false;
    next();
  }
};

/**
 * Admin authentication middleware
 * Requires special admin API key for sensitive operations
 */
export const authenticateAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Admin API key is required',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Validate against admin API keys
    const adminKeys = process.env.ADMIN_API_KEYS?.split(',').map(k => k.trim()) || [];
    
    // For development
    if (process.env.NODE_ENV === 'development' && apiKey === 'test-admin-key-dev') {
      req.authenticated = true;
      req.apiKey = apiKey;
      next();
      return;
    }
    
    if (!adminKeys.includes(apiKey)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Admin privileges required',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    req.authenticated = true;
    req.apiKey = apiKey;
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate admin request',
      timestamp: new Date().toISOString(),
    });
  }
};

