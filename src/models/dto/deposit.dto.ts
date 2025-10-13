import { DepositType, DepositStatus } from '../../generated/prisma';

/**
 * DTO for deposit information
 */
export interface DepositDTO {
  id: string;
  agreementId: string;
  type: DepositType;
  depositor: string;
  amount?: string;
  tokenAccount?: string;
  status: DepositStatus;
  txId?: string;
  blockHeight?: string;
  nftMetadata?: Record<string, unknown>;
  detectedAt: string;
  confirmedAt?: string;
}

/**
 * DTO for deposit creation
 */
export interface CreateDepositDTO {
  agreementId: string;
  type: DepositType;
  depositor: string;
  amount?: string;
  tokenAccount?: string;
  txId?: string;
  blockHeight?: bigint;
  nftMetadata?: Record<string, unknown>;
}

/**
 * DTO for deposit notification
 */
export interface DepositNotificationDTO {
  agreementId: string;
  depositType: DepositType;
  depositor: string;
  amount?: string;
  txId: string;
  blockHeight: string;
  timestamp: string;
}

