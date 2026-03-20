/**
 * AI Chat Routes — "EasyEscrow AI Assistant"
 *
 * POST /api/v1/ai/chat        — Send a message (JSON response, backward compatible)
 * POST /api/v1/ai/chat/stream — Send a message with SSE streaming response
 *
 * Requires institution JWT authentication.
 * Uses the anonymization pipeline to protect PII before sending to Claude.
 */

import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import {
  requireInstitutionAuth,
  InstitutionAuthenticatedRequest,
} from '../middleware/institution-jwt.middleware';
import { getAiChatService } from '../services/ai-chat.service';

const router = Router();

const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Rate limit exceeded', message: 'Too many chat requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const validateChatMessage = [
  body('message')
    .isString()
    .trim()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Message must be between 1 and 4000 characters'),
  body('history')
    .optional()
    .isArray({ max: 50 })
    .withMessage('History must be an array with at most 50 messages'),
  body('history.*.role')
    .exists()
    .isIn(['user', 'assistant'])
    .withMessage('Each history message role must be "user" or "assistant"'),
  body('history.*.content')
    .exists()
    .isString()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Each history message content must be between 1 and 4000 characters'),
];

// POST /api/v1/ai/chat — conversational AI assistant (JSON response)
router.post(
  '/api/v1/ai/chat',
  chatRateLimiter,
  requireInstitutionAuth,
  validateChatMessage,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation Error',
        details: errors.array(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const service = getAiChatService();
      const result = await service.chat(
        req.institutionClient!.clientId,
        {
          message: req.body.message,
          history: req.body.history,
        },
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('rate limit')
        ? 429
        : message.includes('not configured')
          ? 503
          : 500;
      res.status(status).json({
        error: 'Chat Error',
        message: status === 500 ? 'An internal error occurred' : message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// POST /api/v1/ai/chat/stream — SSE streaming response
//
// Response is a text/event-stream with these events:
//   event: text        data: {"delta":"..."}           — text chunk
//   event: tool_start  data: {"tool":"search_escrows"} — tool invocation started
//   event: tool_end    data: {"tool":"search_escrows"} — tool invocation done
//   event: done        data: {"usage":{...}}           — stream finished
//   event: error       data: {"message":"..."}         — error
router.post(
  '/api/v1/ai/chat/stream',
  chatRateLimiter,
  requireInstitutionAuth,
  validateChatMessage,
  async (req: InstitutionAuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation Error',
        details: errors.array(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Handle client disconnect
    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    try {
      const service = getAiChatService();
      await service.chatStream(
        req.institutionClient!.clientId,
        {
          message: req.body.message,
          history: req.body.history,
        },
        res,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!aborted) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      }
    } finally {
      if (!aborted) {
        res.end();
      }
    }
  },
);

export default router;
