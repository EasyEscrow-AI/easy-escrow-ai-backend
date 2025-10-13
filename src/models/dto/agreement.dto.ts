import { Decimal } from '@prisma/client/runtime/library';
import { AgreementStatus } from '../../generated/prisma';

/**
 * DTO for creating a new agreement
 */
export interface CreateAgreementDTO {
  nftMint: string;
  price: string | number | Decimal;
  seller: string;
  buyer?: string;
  expiry: Date | string;
  feeBps: number;
  honorRoyalties: boolean;
}

/**
 * DTO for agreement response
 */
export interface AgreementResponseDTO {
  agreementId: string;
  nftMint: string;
  price: string;
  seller: string;
  buyer?: string;
  status: AgreementStatus;
  expiry: string;
  feeBps: number;
  honorRoyalties: boolean;
  escrowPda: string;
  usdcDepositAddr?: string;
  nftDepositAddr?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO for agreement creation response
 */
export interface CreateAgreementResponseDTO {
  agreementId: string;
  escrowPda: string;
  depositAddresses: {
    usdc: string;
    nft: string;
  };
  expiry: string;
  transactionId: string;
}

/**
 * DTO for agreement query filters
 */
export interface AgreementQueryDTO {
  status?: AgreementStatus;
  seller?: string;
  buyer?: string;
  nftMint?: string;
  page?: number;
  limit?: number;
}

/**
 * DTO for agreement balance information
 */
export interface AgreementBalanceDTO {
  agreementId: string;
  status: AgreementStatus;
  balances: {
    usdcLocked: boolean;
    nftLocked: boolean;
    expectedUsdcAmount: string;
  };
  deadline: string;
}

