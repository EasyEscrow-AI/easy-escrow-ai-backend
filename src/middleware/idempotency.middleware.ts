/**
 * Idempotency Middleware
 *
 * Handles idempotency key validation and duplicate request detection
 * for critical endpoints to prevent double-processing.
 */

import { Request, Response, NextFunction } from 'express';
import { getIdempotencyService } from '../services/idempotency.service';

/**
 * Standard idempotency header name
 */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * Extended Request interface with idempotency key
 */
export interface IdempotentRequest extends Request {
  idempotencyKey?: string;
  originalSend?: any;
}

/**
 * Idempotency middleware
 * 
 * Checks for idempotency key in request headers and validates against stored keys.
 * If duplicate request is detected, returns the cached response.
 * If new request, allows it to proceed and stores the response.
 * 
 * @param required - If true, idempotency key is required for the request
 */
export function idempotencyMiddleware(required: boolean = true) {
  return async (req: IdempotentRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idempotencyService = getIdempotencyService();
      
      // Extract idempotency key from header
      const idempotencyKey = req.header(IDEMPOTENCY_KEY_HEADER);

      // If idempotency key is required but not provided
      if (required && !idempotencyKey) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: `Missing required header: ${IDEMPOTENCY_KEY_HEADER}`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // If no idempotency key and not required, skip middleware
      if (!idempotencyKey) {
        next();
        return;
      }

      // Validate idempotency key format
      if (!idempotencyService.validateKeyFormat(idempotencyKey)) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Invalid idempotency key format. Key must be at least 16 characters and contain only alphanumeric characters, hyphens, and underscores.',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Store idempotency key in request for later use
      req.idempotencyKey = idempotencyKey;

      // Get endpoint identifier
      const endpoint = `${req.method} ${req.path}`;

      // Check if this is a duplicate request
      const checkResult = await idempotencyService.checkIdempotency(
        idempotencyKey,
        endpoint,
        req.body
      );

      if (checkResult.isDuplicate && checkResult.existingResponse) {
        // Return cached response for duplicate request
        console.log(`[IdempotencyMiddleware] Returning cached response for duplicate request`);
        
        res.status(checkResult.existingResponse.status).json(checkResult.existingResponse.body);
        return;
      }

      // This is a new request - intercept response to store it
      const originalSend = res.json.bind(res);
      
      res.json = function (body: any): Response {
        // Store the response with idempotency key (async, don't wait)
        idempotencyService.storeIdempotency(
          idempotencyKey,
          endpoint,
          req.body,
          res.statusCode,
          body
        ).catch((error) => {
          console.error('[IdempotencyMiddleware] Error storing idempotency response:', error);
          // Don't fail the request if storage fails
        });

        // Send the response normally
        return originalSend(body);
      };

      next();
    } catch (error) {
      console.error('[IdempotencyMiddleware] Error processing idempotency:', error);
      
      // If it's a validation error (e.g., key used with different endpoint/body), return 422
      if (error instanceof Error && 
          (error.message.includes('different endpoint') || error.message.includes('different request body'))) {
        res.status(422).json({
          success: false,
          error: 'Unprocessable Entity',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // For other errors, pass to error handler
      next(error);
    }
  };
}

/**
 * Optional idempotency middleware
 * Idempotency key is not required, but if provided, it will be validated and used
 */
export const optionalIdempotency = idempotencyMiddleware(false);

/**
 * Required idempotency middleware
 * Idempotency key must be provided in the request
 */
export const requiredIdempotency = idempotencyMiddleware(true);

