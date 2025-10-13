/**
 * DTO for receipt information
 */
export interface ReceiptDTO {
  id: string;
  agreementId: string;
  nftMint: string;
  price: string;
  platformFee: string;
  creatorRoyalty?: string;
  buyer: string;
  seller: string;
  escrowTxId: string;
  settlementTxId: string;
  receiptHash: string;
  signature: string;
  createdAt: string;
  settledAt: string;
  generatedAt: string;
}

/**
 * DTO for receipt creation
 */
export interface CreateReceiptDTO {
  agreementId: string;
  nftMint: string;
  price: string;
  platformFee: string;
  creatorRoyalty?: string;
  buyer: string;
  seller: string;
  escrowTxId: string;
  settlementTxId: string;
  createdAt: Date | string;
  settledAt: Date | string;
}

/**
 * DTO for receipt verification
 */
export interface ReceiptVerificationDTO {
  receiptHash: string;
  signature: string;
  isValid: boolean;
}

/**
 * DTO for receipt query
 */
export interface ReceiptQueryDTO {
  agreementId?: string;
  buyer?: string;
  seller?: string;
  nftMint?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

