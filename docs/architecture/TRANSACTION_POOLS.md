# Transaction Pools Architecture

## Overview

Transaction pools enable batching multiple funded institution escrows into a single pooled settlement operation. Instead of releasing each escrow individually, an institution client groups related escrows into a pool, locks the pool for compliance review, and settles all members in one coordinated operation with on-chain receipt encryption.

**Key benefits:**

- Batch settlement reduces per-transaction overhead and operational complexity
- Aggregate compliance check across all pooled escrows before settlement
- On-chain encrypted receipts provide tamper-proof settlement records
- Sequential or parallel settlement modes for different throughput requirements
- Automatic expiry monitoring prevents stale pools from locking funds

**Feature flag:** Gated by `TRANSACTION_POOLS_ENABLED=true` (requires `INSTITUTION_ESCROW_ENABLED=true`).

## Pool Lifecycle

A transaction pool moves through a strict state machine:

```text
  OPEN ──────────> LOCKED ──────────> SETTLING ──────────> SETTLED
   │                 │                    │
   │                 │                    ├──────────> PARTIAL_FAIL ──> SETTLING (retry)
   │                 │                    │
   │                 │                    └──────────> FAILED ─────────> SETTLING (retry)
   │                 │
   ├──> CANCELLED    ├──> CANCELLED
   │                 │
```

### Status Definitions

| Status         | Description                                                                        |
| -------------- | ---------------------------------------------------------------------------------- |
| `OPEN`         | Pool is accepting members. Escrows can be added or removed.                        |
| `LOCKED`       | Membership frozen. Aggregate compliance check has been run. Ready for settlement.  |
| `SETTLING`     | Settlement in progress. Each member is being released sequentially or in parallel. |
| `SETTLED`      | All members settled successfully. On-chain receipts created.                       |
| `PARTIAL_FAIL` | Some members settled, some failed. Failed members can be retried.                  |
| `FAILED`       | All members failed settlement. Can be retried.                                     |
| `CANCELLED`    | Pool cancelled. All members refunded (if applicable). Vault closed.                |

### Lifecycle Operations

| Operation            | From Status             | To Status                                       | Description                                                |
| -------------------- | ----------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| `createPool`         | —                       | `OPEN`                                          | Create pool, init on-chain vault, generate TP-XXX-XXX code |
| `addMember`          | `OPEN`                  | `OPEN`                                          | Add a FUNDED escrow to the pool                            |
| `removeMember`       | `OPEN`                  | `OPEN`                                          | Remove a member, decrement totals                          |
| `lockPool`           | `OPEN`                  | `LOCKED`                                        | Freeze membership, run compliance check                    |
| `settlePool`         | `LOCKED`                | `SETTLING` -> `SETTLED`/`PARTIAL_FAIL`/`FAILED` | Release each member, create receipts                       |
| `retryFailedMembers` | `PARTIAL_FAIL`/`FAILED` | `SETTLING` -> ...                               | Retry only FAILED members                                  |
| `cancelPool`         | `OPEN`/`LOCKED`         | `CANCELLED`                                     | Refund members, close vault                                |

### Member Status Flow

Each pool member tracks its own settlement state:

```text
PENDING ──> SETTLING ──> SETTLED
                │
                └──> FAILED (retryable)

PENDING ──> REMOVED (removed before lock, or cancelled)
```

## On-Chain Architecture

Transaction pools have a corresponding on-chain representation using the EasyEscrow Solana program. Three PDA (Program Derived Address) types are used:

### PoolState PDA

Stores the pool's on-chain state: status, member count, settled count, corridor, and authority.

**Seeds:** `["pool_vault", pool_id_bytes]`

```text
pool_id_bytes = UUID as 32-byte zero-padded buffer
```

### PoolVault PDA

A token account (ATA) that holds pooled USDC during settlement. Funds are deposited when members are added and disbursed during settlement.

**Seeds:** `["pool_vault_token", pool_id_bytes]`

### PoolReceipt PDA

One per settled member. Stores the encrypted receipt payload and commitment hash on-chain.

**Seeds:** `["pool_receipt", pool_id_bytes, escrow_id_bytes]`

### On-Chain Instructions

| Instruction         | Purpose                                                | Signer |
| ------------------- | ------------------------------------------------------ | ------ |
| `initPoolVault`     | Create pool state + vault token account                | Admin  |
| `depositToPool`     | Transfer USDC from payer to vault                      | Payer  |
| `releasePoolMember` | Transfer USDC from vault to recipient + create receipt | Admin  |
| `releasePoolFees`   | Transfer accumulated fees from vault to fee collector  | Admin  |
| `cancelPoolMember`  | Refund USDC from vault back to payer                   | Admin  |
| `closePoolVault`    | Close pool state + vault, reclaim rent                 | Admin  |
| `closePoolReceipt`  | Close a receipt PDA, reclaim rent                      | Admin  |

Each instruction includes a Memo program instruction for audit trail:

- `EasyEscrow:pool:init:TP-XXX-XXX`
- `EasyEscrow:pool:release:TP-XXX-XXX:EE-XXX-XXX`
- `EasyEscrow:pool:cancel:TP-XXX-XXX:EE-XXX-XXX`
- `EasyEscrow:pool:fees:TP-XXX-XXX`
- `EasyEscrow:pool:close:TP-XXX-XXX`

## Settlement Flow

### Sequential Mode (default)

Members are settled one at a time in sequence-number order:

```text
Pool LOCKED ─── settle ───> SETTLING
  │
  ├─ Member 1: PENDING -> SETTLING -> release funds -> encrypt receipt -> SETTLED
  ├─ Member 2: PENDING -> SETTLING -> release funds -> encrypt receipt -> SETTLED
  ├─ Member 3: PENDING -> SETTLING -> release funds -> FAILED (error)
  └─ Member 4: PENDING -> SETTLING -> release funds -> encrypt receipt -> SETTLED
  │
  └── 3 settled, 1 failed ──> PARTIAL_FAIL
```

On failure, sequential mode continues to the next member rather than stopping.

### Parallel Mode

Members are settled in concurrent batches controlled by `POOL_SETTLEMENT_CONCURRENCY` (default: 5):

```text
Pool LOCKED ─── settle ───> SETTLING
  │
  ├─ Batch 1 (members 1-5): Promise.allSettled([...])
  ├─ Batch 2 (members 6-10): Promise.allSettled([...])
  └─ ...
  │
  └── Aggregate results ──> SETTLED / PARTIAL_FAIL / FAILED
```

### Single Member Settlement

For each member, settlement performs:

1. Look up the escrow record from Prisma
2. Mark member as `SETTLING`
3. Call `escrowService.releaseFunds()` with a `PoolContext` to release the escrow
4. Build a receipt plaintext (pool ID, escrow code, amount, corridor, wallets, tx signature, timestamp)
5. Compute SHA-256 commitment hash of the receipt
6. Encrypt receipt with AES-256-GCM into a 512-byte fixed payload
7. Call `releasePoolMemberOnChain()` to store the encrypted receipt on-chain
8. Mark member as `SETTLED` with tx signature, receipt PDA, and commitment hash

If step 3 fails, the member is marked as `FAILED` with the error message. Receipt creation failure (steps 5-7) is non-critical and does not fail the member settlement.

## Privacy

### Fund Mixing

When multiple escrows are pooled, USDC flows through a shared vault PDA rather than direct payer-to-recipient transfers. This provides a degree of fund mixing:

- Observers see deposits into the pool vault from various payers
- Observers see releases from the pool vault to various recipients
- Linking a specific payer to a specific recipient requires decrypting the on-chain receipt

### Stealth Address Integration

Pool members inherit the privacy level of their underlying escrow. When an escrow has `privacyLevel: STEALTH`, the release operation derives a one-time stealth address for the recipient. The `TransactionPoolMember` record tracks `privacyLevel` and `stealthPaymentId`.

### Encrypted Receipts

Each settled member gets an on-chain receipt encrypted with AES-256-GCM. Only the pool operator (with the `POOL_RECEIPT_ENCRYPTION_KEY`) can decrypt receipts. See [POOL_RECEIPT_ENCRYPTION.md](POOL_RECEIPT_ENCRYPTION.md) for the full encryption specification.

## Receipt Encryption

### Payload Layout

Fixed 512-byte payload stored in the `PoolReceipt` PDA:

```text
Offset  Size  Field
──────  ────  ─────
0       12    Initialization Vector (IV)
12      16    AES-GCM Authentication Tag
28       2    Ciphertext Length (uint16BE)
30     482    Ciphertext (zero-padded)
──────  ────
Total  512    bytes
```

### Encrypted Fields (Receipt Plaintext)

```typescript
interface ReceiptPlaintext {
  poolId: string; // Pool UUID
  poolCode: string; // TP-XXX-XXX
  escrowId: string; // Escrow UUID
  escrowCode: string; // EE-XXX-XXX
  amount: string; // USDC amount (6 decimal places)
  corridor: string; // e.g. "SG-CH"
  payerWallet: string; // Solana public key (base58)
  recipientWallet: string; // Solana public key (base58)
  releaseTxSignature: string; // On-chain transaction signature
  settledAt: string; // ISO 8601 timestamp
}
```

### Commitment Hash

A SHA-256 hash of the JSON-serialized receipt plaintext is stored alongside the encrypted payload. This enables verification that a decrypted receipt matches what was originally stored without revealing the plaintext.

### Key Management

- Encryption key: `POOL_RECEIPT_ENCRYPTION_KEY` (64-character hex string = 32 bytes)
- Each receipt uses a unique random 12-byte IV
- Authentication tag (16 bytes) prevents tampering
- Key is loaded once at service initialization; not stored on-chain

## Settlement Modes

| Mode         | Concurrency                         | Use Case                                         |
| ------------ | ----------------------------------- | ------------------------------------------------ |
| `SEQUENTIAL` | 1 at a time                         | Default. Predictable ordering, easier debugging. |
| `PARALLEL`   | Up to `POOL_SETTLEMENT_CONCURRENCY` | High throughput. Batched `Promise.allSettled`.   |

Settlement mode is set at pool creation and cannot be changed after.

## Error Handling

### Settlement Errors

| Scenario                       | Behavior                                                         |
| ------------------------------ | ---------------------------------------------------------------- |
| Single member release fails    | Member marked `FAILED`, settlement continues to next member      |
| All members fail               | Pool status = `FAILED`                                           |
| Some members fail              | Pool status = `PARTIAL_FAIL`                                     |
| Receipt encryption fails       | Non-critical — member still marked `SETTLED` (logged as warning) |
| On-chain receipt storage fails | Non-critical — member still marked `SETTLED`                     |

### Retry Logic

Failed members can be retried via `retryFailedMembers()`:

- Only available when pool status is `PARTIAL_FAIL` or `FAILED`
- Increments `retryCount` on each member before re-attempting
- Recalculates pool totals after retry completes
- Pool transitions to `SETTLED` if all remaining failures resolve

### Cancellation

Cancellation is available from `OPEN` or `LOCKED` status:

- Each `PENDING` member is refunded via `cancelPoolMemberOnChain()`
- Member status set to `REMOVED`
- Pool vault closed on-chain to reclaim rent
- Pool status set to `CANCELLED`
- Notifications sent to the client

### Expiry Monitor

The `PoolExpiryMonitor` runs every 5-10 minutes (configurable) to detect and cancel expired pools:

- Finds pools with `status IN ('OPEN', 'LOCKED')` and `expiresAt < NOW()`
- **DB-only pools** (no vault PDA, or OPEN without members): batch-updated to `CANCELLED`
- **On-chain pools** (LOCKED with vault PDA): members refunded individually, vault closed, then cancelled
- Race condition guard: uses Prisma `WHERE status IN (...)` to prevent double-processing
- Leadership election: only one instance runs the cron job in multi-instance deployments
- Alert after 3 consecutive failures via `alertingService`

## Configuration

### Environment Variables

| Variable                      | Required | Default | Description                                                    |
| ----------------------------- | -------- | ------- | -------------------------------------------------------------- |
| `TRANSACTION_POOLS_ENABLED`   | Yes      | `false` | Feature flag (also requires `INSTITUTION_ESCROW_ENABLED=true`) |
| `POOL_MAX_MEMBERS`            | No       | `50`    | Maximum members per pool                                       |
| `POOL_DEFAULT_EXPIRY_HOURS`   | No       | `24`    | Default pool expiry (hours)                                    |
| `POOL_SETTLEMENT_CONCURRENCY` | No       | `5`     | Max parallel settlement workers                                |
| `POOL_RECEIPT_ENCRYPTION_KEY` | Yes      | —       | 64-char hex string (32 bytes AES-256 key)                      |
| `USDC_MINT_ADDRESS`           | Yes      | —       | USDC SPL token mint address                                    |

### Pool Limits

| Limit                      | Value              | Source                              |
| -------------------------- | ------------------ | ----------------------------------- |
| Max members per pool       | 50                 | `POOL_MAX_MEMBERS`                  |
| Max expiry                 | 168 hours (7 days) | Validation middleware               |
| Min expiry                 | 1 hour             | Validation middleware               |
| Default expiry             | 24 hours           | `POOL_DEFAULT_EXPIRY_HOURS`         |
| Max settlement concurrency | 5                  | `POOL_SETTLEMENT_CONCURRENCY`       |
| Pool code format           | `TP-XXX-XXX`       | 10-char with hyphens (no 0/O/1/I/L) |
| Notes/reason max length    | 500 chars          | Validation middleware               |

## Database Schema

### TransactionPool

```text
transaction_pools
├── id                       UUID PK
├── pool_code                String UNIQUE (TP-XXX-XXX)
├── client_id                String FK -> institution_clients
├── status                   TransactionPoolStatus (OPEN, LOCKED, ...)
├── settlement_mode          PoolSettlementMode (SEQUENTIAL, PARALLEL)
├── corridor                 String? (XX-XX)
├── total_amount             Decimal(20,6)
├── total_fees               Decimal(20,6)
├── member_count             Int
├── settled_count            Int
├── failed_count             Int
├── pool_vault_pda           String?
├── pool_vault_token_account String?
├── pool_risk_score          Decimal(5,2)?
├── compliance_passed        Boolean?
├── settled_by               String?
├── settled_at               DateTime?
├── locked_at                DateTime?
├── created_at               DateTime
├── updated_at               DateTime
├── expires_at               DateTime?
│
├── INDEX (client_id, status)
├── INDEX (status)
├── INDEX (corridor)
└── INDEX (created_at)
```

### TransactionPoolMember

```text
transaction_pool_members
├── id                    UUID PK
├── pool_id               String FK -> transaction_pools
├── escrow_id             String FK -> institution_escrows
├── status                PoolMemberStatus (PENDING, SETTLING, SETTLED, FAILED, REMOVED)
├── amount                Decimal(20,6)
├── platform_fee          Decimal(20,6)
├── corridor              String?
├── release_tx_signature  String?
├── released_at           DateTime?
├── error_message         String?
├── retry_count           Int (default 0)
├── receipt_pda           String?
├── commitment_hash       String?
├── privacy_level         PrivacyLevel?
├── stealth_payment_id    String?
├── sequence_number       Int
├── added_at              DateTime
├── updated_at            DateTime
│
├── UNIQUE (pool_id, escrow_id)
├── INDEX (pool_id)
└── INDEX (escrow_id)
```

### TransactionPoolAuditLog

```text
transaction_pool_audit_logs
├── id          UUID PK
├── pool_id     String FK -> transaction_pools
├── escrow_id   String?
├── action      String (POOL_CREATED, MEMBER_ADDED, ...)
├── actor       String?
├── details     Json?
├── ip_address  String?
├── created_at  DateTime
│
├── INDEX (pool_id)
├── INDEX (escrow_id)
├── INDEX (action)
└── INDEX (created_at)
```

## Audit Trail

Every pool lifecycle event is recorded in `TransactionPoolAuditLog`. Actions include:

| Action              | When                                 |
| ------------------- | ------------------------------------ |
| `POOL_CREATED`      | Pool created                         |
| `MEMBER_ADDED`      | Escrow added to pool                 |
| `MEMBER_REMOVED`    | Member removed from pool             |
| `COMPLIANCE_CHECK`  | Aggregate compliance check result    |
| `POOL_LOCKED`       | Pool membership frozen               |
| `POOL_SETTLING`     | Settlement started                   |
| `MEMBER_SETTLING`   | Individual member settlement started |
| `MEMBER_SETTLED`    | Member settled with tx signature     |
| `MEMBER_FAILED`     | Member settlement failed with error  |
| `RECEIPT_CREATED`   | On-chain receipt stored              |
| `POOL_SETTLED`      | All members settled                  |
| `POOL_PARTIAL_FAIL` | Some members failed                  |
| `POOL_FAILED`       | All members failed                   |
| `POOL_CANCELLED`    | Pool cancelled                       |
| `MEMBER_REFUNDED`   | Member refunded during cancellation  |
| `RETRY_SETTLEMENT`  | Retry of failed members initiated    |

## API Endpoints

All endpoints are under `/api/v1/institution/pools` and require institution JWT authentication.

| #   | Method   | Path                     | Auth             | Rate Limit | Description                        |
| --- | -------- | ------------------------ | ---------------- | ---------- | ---------------------------------- |
| 1   | `POST`   | `/`                      | JWT              | 30/min     | Create pool                        |
| 2   | `GET`    | `/`                      | JWT              | 30/min     | List pools (paginated, filterable) |
| 3   | `GET`    | `/:id`                   | JWT              | 30/min     | Get pool detail with members       |
| 4   | `POST`   | `/:id/add`               | JWT              | 30/min     | Add escrow to pool                 |
| 5   | `DELETE` | `/:id/members/:memberId` | JWT              | 30/min     | Remove member                      |
| 6   | `POST`   | `/:id/lock`              | JWT              | 30/min     | Lock pool                          |
| 7   | `POST`   | `/:id/settle`            | JWT + Settlement | 10/min     | Settle pool                        |
| 8   | `POST`   | `/:id/retry`             | JWT + Settlement | 10/min     | Retry failed members               |
| 9   | `POST`   | `/:id/cancel`            | JWT              | 30/min     | Cancel pool                        |
| 10  | `GET`    | `/:id/audit`             | JWT              | 30/min     | Get audit log                      |
| 11  | `GET`    | `/:id/receipt/:escrowId` | JWT              | 30/min     | Decrypt receipt                    |

The `:id` parameter accepts either a UUID or pool code (`TP-XXX-XXX`).

See [TRANSACTION_POOLS_API.md](../api/TRANSACTION_POOLS_API.md) for full request/response schemas with examples.

## Integration Points

### Institution Escrow Service

Pool settlement calls `escrowService.releaseFunds()` with a `PoolContext`:

```typescript
interface PoolContext {
  poolId: string;
  memberId: string;
  skipOnChainRelease?: boolean;
}
```

The escrow service recognizes the pool context and can skip redundant on-chain operations when the pool vault handles its own batched transfers.

### Compliance Service

Pool lock runs an aggregate compliance check:

- Fetches `riskScore` from each member's escrow
- Calculates weighted average as aggregate risk score
- Flags members with risk score >= 75
- Flags pools with > 20 members or > 100,000 USDC total
- Pool passes if aggregate risk < 75 and no high-risk members

### Notification Service

Pool lifecycle events trigger notifications to the client via `InstitutionNotificationService`:

- `POOL_CREATED`, `POOL_LOCKED`, `POOL_SETTLED`, `POOL_FAILED`, `POOL_CANCELLED`

### Redis Cache

Pools are cached by both `id` and `poolCode` with a 5-minute TTL. Cache is invalidated on any pool mutation (add/remove member, lock, settle, cancel).

## Source Files

| File                                                       | Purpose                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/services/transaction-pool.service.ts`                 | Core orchestrator: lifecycle, settlement, compliance                              |
| `src/services/pool-vault-program.service.ts`               | On-chain operations: PDA derivation, tx building, receipt encryption              |
| `src/services/pool-expiry-monitor.service.ts`              | Cron-based expiry detection and cancellation                                      |
| `src/routes/transaction-pool.routes.ts`                    | Express route handlers                                                            |
| `src/middleware/transaction-pool-validation.middleware.ts` | Request validation (express-validator)                                            |
| `src/types/transaction-pool.ts`                            | TypeScript type definitions                                                       |
| `src/utils/featureFlags.ts`                                | `isTransactionPoolsEnabled()` flag check                                          |
| `prisma/schema.prisma`                                     | Database models (TransactionPool, TransactionPoolMember, TransactionPoolAuditLog) |
