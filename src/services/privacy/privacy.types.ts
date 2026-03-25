/**
 * Privacy Types
 *
 * Type definitions for stealth address privacy features
 * in the institution escrow system.
 */

export enum PrivacyLevel {
  NONE = 'NONE',
  STEALTH = 'STEALTH',
}

export interface StealthMetaAddress {
  scanPublicKey: string; // Base58
  spendPublicKey: string; // Base58
}

export interface StealthPaymentResult {
  stealthAddress: string;
  ephemeralPublicKey: string;
}

export interface PrivacyPreferences {
  level: PrivacyLevel;
  useJito?: boolean;
  metaAddressId?: string;
}

export interface StealthKeyPair {
  publicKey: string; // Base58
  secretKey: string; // Base58
}

export interface StealthMetaAddressRecord {
  id: string;
  institutionClientId: string;
  label: string | null;
  scanPublicKey: string;
  spendPublicKey: string;
  encryptedScanKey: string;
  encryptedSpendKey: string;
  viewingKeyShared: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StealthPaymentRecord {
  id: string;
  metaAddressId: string;
  stealthAddress: string;
  ephemeralPublicKey: string;
  escrowId: string | null;
  tokenMint: string;
  amountRaw: bigint;
  status: StealthPaymentStatus;
  releaseTxSignature: string | null;
  sweepTxSignature: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  sweptAt: Date | null;
}

export enum StealthPaymentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SWEPT = 'SWEPT',
  FAILED = 'FAILED',
}

export interface SweepResult {
  txSignature: string;
  destinationWallet: string;
  amount: string;
}

export interface ScanResult {
  paymentId: string;
  stealthAddress: string;
  amount: string;
  status: StealthPaymentStatus;
  createdAt: Date;
}
