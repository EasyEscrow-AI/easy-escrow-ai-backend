/**
 * Models
 * 
 * This directory contains data models and type definitions.
 * Define interfaces, types, and data structures here.
 */

// Re-export Prisma generated types
export {
  Agreement,
  Deposit,
  Settlement,
  Receipt,
  Webhook,
  IdempotencyKey,
  TransactionLog,
  AgreementStatus,
  DepositType,
  DepositStatus,
  WebhookEventType,
  WebhookDeliveryStatus,
} from '../generated/prisma';

// Export custom types and DTOs
export * from './dto/agreement.dto';
export * from './dto/deposit.dto';
export * from './dto/settlement.dto';
export * from './dto/receipt.dto';
export * from './dto/webhook.dto';

// Export validators
export * from './validators/agreement.validator';
export * from './validators/solana.validator';

