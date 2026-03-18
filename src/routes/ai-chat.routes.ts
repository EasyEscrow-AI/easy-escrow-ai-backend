/**
 * AI Chat Routes — "EasyEscrow AI Assistant"
 *
 * POST /api/v1/ai/chat — Send a message to the AI assistant
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
    .optional()
    .isIn(['user', 'assistant'])
    .withMessage('Each history message role must be "user" or "assistant"'),
  body('history.*.content')
    .optional()
    .isString()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Each history message content must be between 1 and 4000 characters'),
];

// POST /api/v1/ai/chat — conversational AI assistant
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
    } catch (error: any) {
      const status = error.message.includes('rate limit')
        ? 429
        : error.message.includes('not configured')
          ? 503
          : 500;
      res.status(status).json({
        error: 'Chat Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
