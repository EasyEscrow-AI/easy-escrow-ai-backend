/**
 * DTO for settlement information
 */
export interface SettlementDTO {
  id: string;
  agreementId: string;
  nftMint: string;
  price: string;
  platformFee: string;
  creatorRoyalty?: string;
  sellerReceived: string;
  buyer: string;
  seller: string;
  feeCollector?: string;
  royaltyRecipient?: string;
  settleTxId: string;
  blockHeight: string;
  settledAt: string;
}

/**
 * DTO for settlement execution
 */
export interface ExecuteSettlementDTO {
  agreementId: string;
  platformFee: string;
  creatorRoyalty?: string;
  feeCollector: string;
  royaltyRecipient?: string;
}

/**
 * DTO for fee calculation
 */
export interface FeeCalculationDTO {
  price: string;
  platformFeeBps: number;
  creatorRoyaltyBps?: number;
  platformFee: string;
  creatorRoyalty: string;
  sellerReceives: string;
}

