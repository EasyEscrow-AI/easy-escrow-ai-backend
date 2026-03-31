/**
 * Transaction Pool Type Definitions
 *
 * Types for the transaction pool system that enables batching
 * multiple escrow settlements into a single pooled operation.
 */

export enum TransactionPoolStatus {
  OPEN = 'OPEN',
  LOCKED = 'LOCKED',
  SETTLING = 'SETTLING',
  SETTLED = 'SETTLED',
  PARTIAL_FAIL = 'PARTIAL_FAIL',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PoolMemberStatus {
  PENDING = 'PENDING',
  SETTLING = 'SETTLING',
  SETTLED = 'SETTLED',
  FAILED = 'FAILED',
  REMOVED = 'REMOVED',
}

export enum PoolSettlementMode {
  SEQUENTIAL = 'SEQUENTIAL',
  PARALLEL = 'PARALLEL',
}

export enum PoolAuditAction {
  POOL_CREATED = 'POOL_CREATED',
  MEMBER_ADDED = 'MEMBER_ADDED',
  MEMBER_REMOVED = 'MEMBER_REMOVED',
  POOL_LOCKED = 'POOL_LOCKED',
  POOL_SETTLING = 'POOL_SETTLING',
  MEMBER_SETTLING = 'MEMBER_SETTLING',
  MEMBER_SETTLED = 'MEMBER_SETTLED',
  MEMBER_FAILED = 'MEMBER_FAILED',
  POOL_SETTLED = 'POOL_SETTLED',
  POOL_PARTIAL_FAIL = 'POOL_PARTIAL_FAIL',
  POOL_FAILED = 'POOL_FAILED',
  POOL_CANCELLED = 'POOL_CANCELLED',
  MEMBER_REFUNDED = 'MEMBER_REFUNDED',
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  RECEIPT_CREATED = 'RECEIPT_CREATED',
  RETRY_SETTLEMENT = 'RETRY_SETTLEMENT',
}

// ─── Param Types ────────────────────────────────────────────────

export interface CreatePoolParams {
  clientId: string;
  corridor?: string;
  settlementMode?: PoolSettlementMode;
  expiryHours?: number;
  actorEmail?: string;
}

export interface AddPoolMemberParams {
  clientId: string;
  poolIdOrCode: string;
  escrowId: string;
  actorEmail?: string;
}

export interface RemovePoolMemberParams {
  clientId: string;
  poolIdOrCode: string;
  memberId: string;
  actorEmail?: string;
}

export interface LockPoolParams {
  clientId: string;
  poolIdOrCode: string;
  actorEmail?: string;
}

export interface SettlePoolParams {
  clientId: string;
  poolIdOrCode: string;
  notes?: string;
  actorEmail?: string;
}

export interface RetryFailedMembersParams {
  clientId: string;
  poolIdOrCode: string;
  actorEmail?: string;
}

export interface CancelPoolParams {
  clientId: string;
  poolIdOrCode: string;
  reason?: string;
  actorEmail?: string;
}

export interface GetPoolParams {
  clientId: string;
  poolIdOrCode: string;
}

export interface GetPoolAuditParams {
  clientId: string;
  poolIdOrCode: string;
  limit?: number;
  offset?: number;
}

export interface ListPoolsParams {
  clientId: string;
  status?: string;
  corridor?: string;
  limit?: number;
  offset?: number;
}

// ─── Result Types ───────────────────────────────────────────────

export interface PoolMemberSettlementResult {
  memberId: string;
  escrowId: string;
  status: PoolMemberStatus;
  releaseTxSignature?: string;
  receiptPda?: string;
  commitmentHash?: string;
  errorMessage?: string;
}

export interface PoolSettlementResult {
  poolId: string;
  poolCode: string;
  status: TransactionPoolStatus;
  totalMembers: number;
  settledCount: number;
  failedCount: number;
  members: PoolMemberSettlementResult[];
  settledAt?: Date;
}

export interface PoolComplianceResult {
  passed: boolean;
  aggregateRiskScore: number;
  memberRiskScores: Array<{
    escrowId: string;
    riskScore: number;
  }>;
  flags: string[];
}

// ─── Receipt Types ──────────────────────────────────────────────

export interface ReceiptPlaintext {
  poolId: string;
  poolCode: string;
  escrowId: string;
  escrowCode: string;
  amount: string;
  corridor: string;
  payerWallet: string;
  recipientWallet: string;
  releaseTxSignature: string;
  settledAt: string;
}

export interface ReceiptEncryptionParams {
  plaintext: ReceiptPlaintext;
  aesKey: Buffer;
}

// ─── Integration Types ──────────────────────────────────────────

/**
 * Context passed when releasing escrow funds as part of a pool settlement.
 */
export interface PoolContext {
  poolId: string;
  memberId: string;
  /** When true, skip on-chain release (pool handles its own batched settlement) */
  skipOnChainRelease?: boolean;
}

export interface PoolMetrics {
  totalPools: number;
  openPools: number;
  settledPools: number;
  failedPools: number;
  cancelledPools: number;
  totalSettled: number;
  totalFailed: number;
  avgSettlementTimeMs: number;
}
