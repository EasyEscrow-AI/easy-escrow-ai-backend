import { WebhookEventType } from '../generated/prisma';
import {
  webhookService,
  EscrowFundedPayload,
  EscrowAssetLockedPayload,
  EscrowSettledPayload,
  EscrowExpiredPayload,
  EscrowRefundedPayload,
} from './webhook.service';

/**
 * Helper service for publishing webhook events from escrow lifecycle
 */
export class WebhookEventsService {
  /**
   * Publish escrow funded event
   * Triggered when an escrow agreement is successfully funded
   */
  public static async publishEscrowFunded(params: {
    agreementId: string;
    price: string;
    seller: string;
    buyer: string;
    nftMint: string;
    escrowPda: string;
  }): Promise<void> {
    const payload: EscrowFundedPayload = {
      eventType: 'ESCROW_FUNDED',
      timestamp: new Date().toISOString(),
      agreementId: params.agreementId,
      price: params.price,
      seller: params.seller,
      buyer: params.buyer,
      nftMint: params.nftMint,
      escrowPda: params.escrowPda,
    };

    await webhookService.publishEvent(payload);
  }

  /**
   * Publish asset locked event
   * Triggered when SOL or NFT is locked in the escrow
   */
  public static async publishAssetLocked(params: {
    agreementId: string;
    assetType: 'SOL' | 'NFT';
    depositor: string;
    amount?: string;
    tokenAccount?: string;
    txId: string;
  }): Promise<void> {
    const payload: EscrowAssetLockedPayload = {
      eventType: 'ESCROW_ASSET_LOCKED',
      timestamp: new Date().toISOString(),
      agreementId: params.agreementId,
      assetType: params.assetType,
      depositor: params.depositor,
      amount: params.amount,
      tokenAccount: params.tokenAccount,
      txId: params.txId,
    };

    await webhookService.publishEvent(payload);
  }

  /**
   * Publish escrow settled event
   * Triggered when an escrow is successfully settled
   */
  public static async publishEscrowSettled(params: {
    agreementId: string;
    nftMint: string;
    price: string;
    platformFee: string;
    creatorRoyalty?: string;
    sellerReceived: string;
    buyer: string;
    seller: string;
    settleTxId: string;
  }): Promise<void> {
    const payload: EscrowSettledPayload = {
      eventType: 'ESCROW_SETTLED',
      timestamp: new Date().toISOString(),
      agreementId: params.agreementId,
      nftMint: params.nftMint,
      price: params.price,
      platformFee: params.platformFee,
      creatorRoyalty: params.creatorRoyalty,
      sellerReceived: params.sellerReceived,
      buyer: params.buyer,
      seller: params.seller,
      settleTxId: params.settleTxId,
    };

    await webhookService.publishEvent(payload);
  }

  /**
   * Publish escrow expired event
   * Triggered when an escrow agreement expires without settlement
   */
  public static async publishEscrowExpired(params: {
    agreementId: string;
    expiry: string;
    status: string;
  }): Promise<void> {
    const payload: EscrowExpiredPayload = {
      eventType: 'ESCROW_EXPIRED',
      timestamp: new Date().toISOString(),
      agreementId: params.agreementId,
      expiry: params.expiry,
      status: params.status,
    };

    await webhookService.publishEvent(payload);
  }

  /**
   * Publish escrow refunded event
   * Triggered when an escrow is cancelled and funds are refunded
   */
  public static async publishEscrowRefunded(params: {
    agreementId: string;
    cancelTxId: string;
    refundedTo: string;
  }): Promise<void> {
    const payload: EscrowRefundedPayload = {
      eventType: 'ESCROW_REFUNDED',
      timestamp: new Date().toISOString(),
      agreementId: params.agreementId,
      cancelTxId: params.cancelTxId,
      refundedTo: params.refundedTo,
    };

    await webhookService.publishEvent(payload);
  }
}

