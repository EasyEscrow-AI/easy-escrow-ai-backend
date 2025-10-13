import { WebhookEventType, WebhookDeliveryStatus } from '../../generated/prisma';

/**
 * DTO for webhook information
 */
export interface WebhookDTO {
  id: string;
  agreementId: string;
  eventType: WebhookEventType;
  targetUrl: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  lastResponseCode?: number;
  lastResponseBody?: string;
  deliveredAt?: string;
  signature?: string;
  createdAt: string;
  scheduledFor: string;
}

/**
 * DTO for webhook creation
 */
export interface CreateWebhookDTO {
  agreementId: string;
  eventType: WebhookEventType;
  targetUrl: string;
  payload: Record<string, unknown>;
  scheduledFor?: Date;
}

/**
 * DTO for webhook payload types
 */
export interface WebhookPayloadBase {
  agreementId: string;
  timestamp: string;
}

export interface EscrowFundedPayload extends WebhookPayloadBase {
  type: 'escrow.funded';
  amount: string;
  depositor: string;
  txId: string;
}

export interface EscrowAssetLockedPayload extends WebhookPayloadBase {
  type: 'escrow.asset_locked';
  assetType: 'USDC' | 'NFT';
  depositor: string;
  txId: string;
}

export interface EscrowSettledPayload extends WebhookPayloadBase {
  type: 'escrow.settled';
  buyer: string;
  seller: string;
  nftMint: string;
  price: string;
  platformFee: string;
  creatorRoyalty?: string;
  txId: string;
}

export interface EscrowExpiredPayload extends WebhookPayloadBase {
  type: 'escrow.expired';
  expiryDate: string;
}

export interface EscrowRefundedPayload extends WebhookPayloadBase {
  type: 'escrow.refunded';
  refundedTo: string;
  amount: string;
  txId: string;
}

export type WebhookPayload = 
  | EscrowFundedPayload 
  | EscrowAssetLockedPayload 
  | EscrowSettledPayload 
  | EscrowExpiredPayload 
  | EscrowRefundedPayload;

