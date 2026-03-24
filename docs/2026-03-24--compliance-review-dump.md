# Institution Escrow — Compliance Review Dump

> Generated 2026-03-24 from source code. Single reference for all compliance rules, risk scoring, validation, blocking logic, and configurable settings.

---

## Table of Contents

1. [Compliance Service — 12 Checks](#1-compliance-service--12-checks)
2. [Risk Score Calculation](#2-risk-score-calculation)
3. [Rules Engine — 8 Sections](#3-rules-engine--8-sections)
4. [Corridor Analysis](#4-corridor-analysis)
5. [AI Analysis](#5-ai-analysis)
6. [Field Validation](#6-field-validation)
7. [Token Whitelist](#7-token-whitelist)
8. [Wallet Allowlist](#8-wallet-allowlist)
9. [Fee Calculation](#9-fee-calculation)
10. [Status Lifecycle](#10-status-lifecycle)
11. [What Blocks vs What Warns](#11-what-blocks-vs-what-warns)
12. [Environment Variables](#12-environment-variables)
13. [Auth & Rate Limiting](#13-auth--rate-limiting)

---

## 1. Compliance Service — 12 Checks

**Source:** `src/services/compliance.service.ts`

Each check returns `PASS` (0 points), `WARNING`, `FAIL`, or `NOT_APPLICABLE`. Only WARNING and FAIL add risk points. A fully compliant transaction scores **0/100**.

| # | Check ID | Name | Max Score | PASS | WARNING | FAIL |
|---|----------|------|-----------|------|---------|------|
| 1 | `KYC_VERIFICATION` | KYC/KYB Verification | **15** | `kycStatus === 'VERIFIED'` → 0 | `kycStatus === 'PENDING'` → 8 | `kycStatus` is REJECTED/EXPIRED/unknown → 15; client not found → 15 |
| 2 | `SANCTIONS_SCREENING` | Sanctions Screening (OFAC/EU/UN) | **15** | `sanctionsStatus === 'CLEAR'` → 0 | `sanctionsStatus === 'PENDING_REVIEW'` → 8; null/unknown → 8 | `sanctionsStatus` is FLAGGED/BLOCKED → 15; client not found → 15 |
| 3 | `CORRIDOR_RISK` | Corridor Risk Level | **12** | `riskLevel === 'LOW'` → 0 | `riskLevel === 'MEDIUM'` → 6 | `riskLevel === 'HIGH'` or unknown → 12; corridor not found → 12 |
| 4 | `WALLET_ALLOWLIST` | Wallet Allowlist | **12** | Both payer & recipient allowlisted, payer ownership confirmed → 0 | _(no warning state)_ | Any wallet not allowlisted, or payer doesn't belong to client → 12 |
| 5 | `TRANSACTION_LIMITS` | Transaction Limits | **10** | All limits OK → 0 | Amount > 80% of per-tx max → 5 | Per-tx/daily/monthly limit exceeded → 10; corridor not found → 10 |
| 6 | `AMOUNT_THRESHOLD` | Amount Risk | **8** | `amount < $10,000` → 0 | `$10,000 ≤ amount < $100,000` → 4 | `amount ≥ $100,000` → 8 |
| 7 | `SOURCE_OF_FUNDS` | Source of Funds | **8** | Documented (not 'undocumented'/'unknown'/'partial'/'pending') → 0 | `sourceOfFunds` is 'partial'/'pending' → 4; null → 4 | `sourceOfFunds === 'undocumented'` → 8; client not found → 8 |
| 8 | `PEP_SCREENING` | PEP Screening | **5** | `riskRating` is null/LOW/UNRATED → 0 | `riskRating === 'MEDIUM'` → 3 | `riskRating` is HIGH/CRITICAL → 5; client not found → 5 |
| 9 | `REGULATORY_STATUS` | Regulatory Compliance | **5** | `regulatoryStatus` is REGULATED/EXEMPT → 0; null → 0 | `regulatoryStatus === 'PENDING_LICENSE'` → 3 | `regulatoryStatus === 'SUSPENDED'` → 5; UNREGULATED → 5; client not found → 5 |
| 10 | `BRANCH_COMPLIANCE` | Branch Compliance | **4** | No sanctioned/blocked/suspended branches → 0 | Branches under review → 2 | Sanctioned branches → 4; blocked/suspended branches → 4 |
| 11 | `CLIENT_TIER` | Client Tier | **3** | `tier === 'ENTERPRISE'` → 0 | `tier === 'PREMIUM'` → 1 | `tier === 'STANDARD'` → 3; unknown tier → 3 |
| 12 | `CORRIDOR_VALIDITY` | Corridor Active Status | **3** | `corridor.status === 'ACTIVE'` → 0 | _(no warning state)_ | Any non-ACTIVE status → 3; corridor not found → 3 |

**Maximum theoretical score: 100** (15+15+12+12+10+8+8+5+5+4+3+3)

---

## 2. Risk Score Calculation

**Source:** `src/services/compliance.service.ts`

### Aggregate Formula

```
riskScore = min(100, sum of all 12 check scores)
```

### Risk Levels

| Risk Level | Score Range |
|------------|-------------|
| `LOW` | 0–25 |
| `MEDIUM` | 26–50 |
| `HIGH` | 51–75 |
| `CRITICAL` | 76–100 |

### Reject/Hold Thresholds

| Threshold | Default | Configurable? |
|-----------|---------|---------------|
| **Reject** (blocks escrow creation) | **90** | Yes — DB `SystemSetting` key `compliance.riskThresholds` |
| **Hold** (flags as `MEDIUM_RISK`) | **70** | Yes — same DB setting |

- Thresholds are cached in-memory for **5 minutes** (`THRESHOLD_CACHE_TTL_MS = 300000`)
- Validation: `holdScore` must be < `rejectScore`; if invalid, defaults are used
- Both values must be 0–100

### Overall Pass Condition

```
passed = corridorValid AND walletsAllowlisted AND limitsWithinRange AND riskScore < rejectScore
```

### Flags Added at Threshold Boundaries

| Condition | Flag | Additional |
|-----------|------|------------|
| `riskScore ≥ rejectScore` | `HIGH_RISK` | Reason added to `reasons[]` |
| `rejectScore > riskScore ≥ holdScore` | `MEDIUM_RISK` | — |

---

## 3. Rules Engine — 8 Sections

**Source:** `src/services/escrow-rules-engine.ts`

Deterministic local analysis that runs in <1ms. Used by `analyzeEscrowFast()` for instant feedback while the full AI analysis runs in background.

### Section Weights

| Section | Weight | Description |
|---------|--------|-------------|
| `from_account` | **0.25** | Payer wallet, KYC, KYB, risk rating, country |
| `to_account` | **0.10** | Recipient wallet, different from payer |
| `corridor` | **0.20** | Corridor existence, risk level, amount limits |
| `amount` | **0.15** | Amount range, high-value flags |
| `settlement` | **0.10** | Token mint, deposit status, escrow PDA |
| `release` | **0.08** | Condition type, settlement authority |
| `advanced` | **0.07** | Expiry, documents, nonce account |
| `overview` | **0.05** | Aggregate of all sections (excluded from score calculation) |

### Status Scores

| Status | Score |
|--------|-------|
| `pass` | 5 |
| `pending` | 25 |
| `warning` | 45 |
| `fail` | 80 |

### Weighted Risk Score Formula

```
riskScore = round(min(100, max(0, sum(weight_i * statusScore_i) / sum(weight_i))))
```

Note: `overview` section is excluded from the weighted calculation.

### Recommendation Mapping

| Risk Score | Recommendation |
|------------|----------------|
| 0–25 | `APPROVE` |
| 26–60 | `REVIEW` |
| 61–100 | `REJECT` |

### Section Evaluation Rules

**from_account** (`payerWallet`, `client.kycStatus`, `client.kybStatus`, `client.riskRating`, `client.country`):
- `pending` → payerWallet is null
- `fail` → KYC not VERIFIED, or riskRating is HIGH/CRITICAL
- `warning` → KYB not VERIFIED
- `pass` → KYC verified, risk rating acceptable

**to_account** (`recipientWallet`, `payerWallet`):
- `pending` → recipientWallet is null
- `fail` → recipientWallet === payerWallet
- `pass` → Different wallets, both set

**corridor** (`corridor`, `availableCorridors`, `amount`):
- `fail` → No active corridors available; corridor not in available list
- `pending` → Corridor not yet selected (recommends lowest-risk)
- `warning` → HIGH risk corridor; amount out of min/max range
- `pass` → Corridor validated, risk acceptable

**amount** (`amount`, `platformFee`):
- `pending` → Amount is null or 0
- `warning` → Amount > $100K ("enhanced review"); > $1M ("high scrutiny")
- `pass` → Within normal range

**settlement** (`tokenMint`, `hasDeposit`, `depositTxSignature`, `escrowPda`):
- `pending` → tokenMint is null
- `warning` → Token mint not a recognized stablecoin
- `pass` → Known stablecoin, deposit/PDA status reported

Known stablecoins (hardcoded):
- `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` — USDC
- `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` — USDT
- `HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr` — EURC
- `CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM` — PYUSD

**release** (`conditionType`, `settlementAuthority`):
- `pending` → conditionType is null
- `warning` → Settlement authority not set for non-DRAFT escrow
- `pass` → Condition type set, authority configured

**advanced** (`expiresAt`, `fileCount`, `nonceAccount`):
- `pending` → expiresAt null on non-DRAFT
- `warning` → Expires < 24 hours; expiry > 90 days away; no docs for amount > $50K
- `pass` → Expiry set, documents attached

**overview** (aggregate of all other sections):
- `fail` → Any section is `fail`
- `warning` → Any section is `warning`
- `pass` → All sections pass or pending

---

## 4. Corridor Analysis

**Source:** `src/services/corridor-analysis.service.ts`

### Base Risk Scores by Corridor Risk Level

| Corridor Risk Level | Base Score |
|--------------------|------------|
| `LOW` | 6 |
| `MEDIUM` | 15 |
| `HIGH` | 30 |

### Amount-Based Adjustments

| Condition | Score Adjustment |
|-----------|-----------------|
| Amount > corridor `maxAmount` | +20 |
| Amount < corridor `minAmount` | +5 |
| Amount ≥ EDD threshold | +5 |
| Amount ≥ Reporting threshold | +5 |

### Final Risk Score → Risk Level

| Score Range | Risk Level |
|-------------|------------|
| 0–10 | `LOW` |
| 11–25 | `MEDIUM` |
| 26–100 | `HIGH` |

Score is clamped to 0–100.

### Configurable Thresholds

| Threshold | Env Var | Default |
|-----------|---------|---------|
| Travel Rule | `CORRIDOR_TRAVEL_RULE_THRESHOLD` | $1,000 |
| Enhanced Due Diligence (EDD) | `CORRIDOR_EDD_THRESHOLD` | $10,000 |
| Reporting | `CORRIDOR_REPORTING_THRESHOLD` | $15,000 |

### Country Regulators

| Code | Country | Regulator |
|------|---------|-----------|
| AE | United Arab Emirates | CBUAE |
| CH | Switzerland | FINMA |
| DE | Germany | BaFin |
| GB | United Kingdom | FCA |
| HK | Hong Kong | HKMA |
| IT | Italy | Banca d'Italia |
| JP | Japan | FSA |
| SG | Singapore | MAS |
| US | United States | FinCEN |

---

## 5. AI Analysis

**Source:** `src/services/ai-analysis.service.ts`

### Three Analysis Types

1. **Analyze Escrow** — Full AI analysis of escrow details (amounts, corridor, wallets, risk)
2. **Analyze Document** — Single document matched against an escrow (names, amounts, addresses)
3. **Analyze Client** — AI analysis of institution client profile & compliance posture

### Model Selection

| Escrow Status | Model | Max Tokens |
|---------------|-------|------------|
| `DRAFT` | `AI_ANALYSIS_MODEL_DRAFT` (default: `claude-haiku-4-5-20251001`) | 2,048 |
| All other statuses | `AI_ANALYSIS_MODEL` (default: `claude-sonnet-4-20250514`) | 4,096 |
| Client analysis | `AI_ANALYSIS_MODEL` (default: `claude-sonnet-4-20250514`) | 4,096 |

### Rate Limits

| Setting | Value |
|---------|-------|
| Max requests per client | **5 per minute** |
| Window | 60 seconds |
| Redis key prefix | `institution:ai:ratelimit:` |

### Caching

| Cache | TTL | Redis Key Pattern |
|-------|-----|-------------------|
| Analysis result (by escrow ID) | **15 min** (900s) | `institution:ai:analysis:escrow:{escrowId}` |
| Analysis result (by content hash) | **15 min** (900s) | `institution:ai:analysis:escrow:hash:{sha256}` |
| Document analysis (by escrow+file) | **15 min** (900s) | `institution:ai:analysis:{escrowId}:{fileId}` |
| Client analysis | **15 min** (900s) | `institution:ai:analysis:client:{clientId}` |

Content-hash caching: The escrow data is SHA-256 hashed so identical escrow states return cached results even with different escrow IDs. Re-analysis is triggered if escrow status changes.

### Anonymization

- PII is anonymized before sending to AI via `DataAnonymizer`
- Fields are tokenized (e.g., `[COMPANY_1]`, `[WALLET_1]`)
- Results are de-anonymized after AI response
- Sensitive field lists: `ESCROW_SENSITIVE_FIELDS`, `CLIENT_SENSITIVE_FIELDS`

### Prompt Caching

System prompts use Anthropic's `cache_control: { type: 'ephemeral' }` for prompt caching across requests.

### Fast Analysis Pipeline (`analyzeEscrowFast`)

1. Run local rules engine (<1ms) → return `tier: 'preliminary'`
2. Check content-hash cache → if hit, return `tier: 'full'`
3. If no cache: fire background AI call, return preliminary immediately
4. Background AI result is cached for next request

### Escrow System Prompt — Section Rules

The AI evaluates 8 sections (same as rules engine):

1. **from_account**: KYC VERIFIED (fail if not), KYB (warn if not VERIFIED), riskRating (fail if HIGH/CRITICAL)
2. **to_account**: Recipient set (pending if null), different from payer (fail if same)
3. **corridor**: Validate against `availableCorridors`, recommend lowest-risk if unset
4. **amount**: Flag >$100K as warning, >$1M as high scrutiny
5. **settlement**: Known stablecoin check, deposit status, escrow PDA readiness
6. **release**: Condition type set (pending if null), settlement authority (warn if missing for non-DRAFT)
7. **advanced**: Expiry <24h or >90 days = warning, no docs for >$50K = warning
8. **overview**: Aggregate — fail if any fail, warning if any warning

### AI Release Conditions (for `releaseMode: 'ai'`)

| Condition ID | Label | Logic |
|-------------|-------|-------|
| `legal_compliance` | All legal compliance checks pass | `recommendation !== 'REJECT' && riskScore < 70` |
| `invoice_amount_match` | Invoice amount matches exactly | `|extractedAmount - escrowAmount| < 0.01` |
| `client_info_match` | Client information matches exactly | Extracted company name matches client record |
| `document_signature_verified` | Document signature is verified (via DocuSign) | `signatureVerified === true` or `docusignStatus === 'completed'` |

`legal_compliance` is always evaluated for AI mode. Other conditions only if selected.

### Unsupported File Types for AI Document Analysis

- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (xlsx)
- `application/vnd.ms-excel` (xls)
- `text/csv`

Error: "AI analysis does not support {mimeType} files. Please convert to PDF before analyzing."

---

## 6. Field Validation

**Source:** `src/middleware/institution-escrow-validation.middleware.ts`

### Regex Constants

| Pattern | Regex |
|---------|-------|
| Solana address | `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/` |
| Corridor format | `/^[A-Z]{2}-[A-Z]{2}$/` |
| Tx signature | `/^[1-9A-HJ-NP-Za-km-z]{80,90}$/` |

### Allowed Values

| Field | Allowed Values |
|-------|---------------|
| `conditionType` | `ADMIN_RELEASE`, `TIME_LOCK`, `COMPLIANCE_CHECK` |
| `settlementMode` | `escrow`, `direct` |
| `releaseMode` | `manual`, `ai` |
| `releaseConditions[]` | `legal_compliance`, `invoice_amount_match`, `client_info_match`, `document_signature_verified` |
| `status` (list filter) | `DRAFT`, `CREATED`, `FUNDED`, `COMPLIANCE_HOLD`, `RELEASING`, `RELEASED`, `INSUFFICIENT_FUNDS`, `COMPLETE`, `CANCELLING`, `CANCELLED`, `EXPIRED`, `FAILED` |
| `riskLevel` (corridor config) | `LOW`, `MEDIUM`, `HIGH` |

### Create Escrow (`validateCreateInstitutionEscrow`)

| Field | Required | Validation |
|-------|----------|------------|
| `payerWallet` | Yes | Solana address; must differ from `recipientWallet` |
| `recipientWallet` | Yes | Solana address |
| `amount` | Yes | Float, min: 1, max: 10,000,000 |
| `corridor` | Yes | Format `XX-XX` |
| `conditionType` | Yes | One of allowed values |
| `settlementMode` | Yes | `escrow` or `direct` |
| `releaseMode` | Yes | `manual` or `ai` |
| `expiryHours` | Optional | Int, 1–2160 (90 days) |
| `settlementAuthority` | Optional | Solana address |
| `tokenMint` | Optional | Solana address |
| `approvalParties` | Optional | Array of strings, each 1–100 chars |
| `releaseConditions` | Optional | Array of allowed condition values |
| `approvalInstructions` | Optional | String, max 2000 chars |

### Save Draft (`validateSaveDraft`)

| Field | Required | Validation |
|-------|----------|------------|
| `payerWallet` | Yes | Solana address |
| `recipientWallet` | Optional | Solana address; must differ from `payerWallet` |
| `amount` | Optional | Float, min: 0, max: 10,000,000 |
| All other fields | Optional | Same rules as create |

### Update Draft (`validateUpdateDraft`)

| Field | Required | Validation |
|-------|----------|------------|
| `id` (param) | Yes | UUID |
| All body fields | Optional | Same rules as create; cross-check payer ≠ recipient |

### Submit Draft (`validateSubmitDraft`)

| Field | Required | Validation |
|-------|----------|------------|
| `id` (param) | Yes | UUID |
| `expiryHours` | Optional | Int, 1–2160 |

Service-level required fields on submit: `recipientWallet`, `corridor`, `conditionType`, `amount > 0`, `payerWallet ≠ recipientWallet`, `kycStatus === 'VERIFIED'`

### Record Deposit (`validateRecordDeposit`)

| Field | Required | Validation |
|-------|----------|------------|
| `id` (param) | Yes | UUID |
| `txSignature` | Yes | Base58, 80–90 chars |

### Release Funds (`validateReleaseFunds`)

| Field | Required | Validation |
|-------|----------|------------|
| `id` (param) | Yes | UUID |
| `notes` | Optional | String, max 500 chars |

### Cancel Escrow (`validateCancelEscrow`)

| Field | Required | Validation |
|-------|----------|------------|
| `id` (param) | Yes | UUID |
| `reason` | Optional | String, max 500 chars |

### AI Analysis (`validateAiAnalysis`)

| Field | Required | Validation |
|-------|----------|------------|
| `escrow_id` (param) | Yes | UUID |
| `fileId` | Yes | UUID |
| `context` | Optional | Object |
| `context.expectedAmount` | Optional | Float, min: 0 |
| `context.poNumber` | Optional | String, max 100 chars |

### List Escrows (`validateListEscrows`)

| Field | Required | Validation |
|-------|----------|------------|
| `status` | Optional | One of 12 status values |
| `corridor` | Optional | Format `XX-XX` |
| `limit` | Optional | Int, 1–100 |
| `offset` | Optional | Int, min: 0 |

### Pause Escrow (`validatePauseEscrow`)

| Field | Required | Validation |
|-------|----------|------------|
| `reason` | Yes | String, 5–500 chars |

### Configure Corridor (`validateConfigureCorridor`)

| Field | Required | Validation |
|-------|----------|------------|
| `sourceCountry` | Yes | 2-letter uppercase alpha |
| `destCountry` | Yes | 2-letter uppercase alpha |
| `minAmount` | Yes | Float, min: 0 |
| `maxAmount` | Yes | Float, min: 1 |
| `dailyLimit` | Yes | Float, min: 1 |
| `monthlyLimit` | Yes | Float, min: 1 |
| `riskLevel` | Yes | `LOW`, `MEDIUM`, or `HIGH` |
| `requiredDocuments` | Optional | Array |

### Add to Allowlist (`validateAddToAllowlist`)

| Field | Required | Validation |
|-------|----------|------------|
| `wallet` | Yes | Solana address |
| `clientId` | Yes | UUID |

---

## 7. Token Whitelist

**Source:** `src/services/institution-token-whitelist.service.ts`

### Architecture

- DB-managed list in `InstitutionApprovedToken` table
- In-memory cache with **5-minute TTL**
- Only tokens with `isActive: true` AND `aminaApproved: true` are returned
- One token is marked `isDefault: true` (USDC) — used when `tokenMint` is omitted

### AMINA-Approved Core Stablecoins

Configured via database, not hardcoded. Default supported tokens per documentation:

| Symbol | Issuer |
|--------|--------|
| USDC | Circle |
| USDT | Tether |
| RLUSD | Ripple |
| USDG | Paxos |
| EURC | Circle |
| PYUSD | PayPal/Paxos |

### Token Metadata Fields

```typescript
{
  symbol: string;        // e.g. "USDC"
  name: string;          // e.g. "USD Coin"
  mintAddress: string;   // Solana base58 mint
  decimals: number;      // e.g. 6
  issuer: string;        // e.g. "Circle"
  jurisdiction: string | null;
  chain: string;         // e.g. "solana"
  isDefault: boolean;    // true for primary token
  aminaApproved: boolean;
}
```

### Validation Behavior

- `validateMint(address)` → throws if not on approved list, including list of approved symbols in error
- Fallback: if no `isDefault` token in DB, falls back to `USDC_MINT_ADDRESS` env var (only if it's on the approved list)
- New tokens added via policy update — no code changes needed

---

## 8. Wallet Allowlist

**Source:** `src/services/allowlist.service.ts`

### Storage

| Storage | Key/Pattern | TTL |
|---------|-------------|-----|
| Redis SET | `institution:allowlist` | Permanent (until removed) |
| Redis HASH (metadata) | `institution:allowlist:meta:{wallet}` | **24 hours** (86400s) |
| PostgreSQL (source of truth) | `InstitutionClient.primaryWallet` + `settledWallets[]` | Permanent |

### Lookup Logic (`isAllowlisted`)

1. Validate Solana address format (`/^[1-9A-HJ-NP-Za-km-z]{32,44}$/`)
2. Check Redis SET → if present, return `true`
3. Fallback to Prisma: find client with `status: 'ACTIVE'` AND `kycStatus: 'VERIFIED'` where wallet matches `primaryWallet` or is in `settledWallets[]`
4. On DB hit: auto-populate Redis (backfill on cache miss)
5. Redis failures are non-critical — falls through to Prisma

### Auto-Allowlist

Wallets are automatically allowlisted when:
- Client has `status: 'ACTIVE'` and `kycStatus: 'VERIFIED'`
- Wallet is in `primaryWallet` or `settledWallets[]`

### Metadata Stored

```typescript
{
  clientId: string;
  companyName: string;
  kycStatus: string;
  tier: string;
  addedAt: string; // ISO timestamp
}
```

### Sync/Recovery

`syncAllowlist()` reloads all wallets from all active, verified clients into Redis. Used for initialization/recovery.

---

## 9. Fee Calculation

**Source:** `src/services/institution-escrow.service.ts` lines 204–225, `src/config/institution-escrow.config.ts`

### Formula

```
rawFee = (amount * feeBps) / 10000
platformFee = min(maxFee, max(minFee, rawFee))
```

### Defaults

| Setting | Default | Source |
|---------|---------|--------|
| `feeBps` | **20** (0.20%) | `INSTITUTION_ESCROW_FEE_BPS` env var |
| `minFee` | **$0.20** | Hardcoded default |
| `maxFee` | **$20.00** | Hardcoded default |

### Client Overrides

Per-client settings from `InstitutionClientSettings` table:
- `feeBps` — overrides default BPS
- `minFeeUsdc` — overrides minimum fee
- `maxFeeUsdc` — overrides maximum fee

If client settings lookup fails, falls back to defaults.

### Protocol Fee Limits (Absolute Bounds)

**Source:** `src/config/institution-escrow.config.ts`

Admin/client settings **cannot** exceed these protocol-level constraints:

| Limit | Value |
|-------|-------|
| `MIN_FEE_USDC` | $0.20 |
| `MAX_FEE_USDC` | $20.00 |
| `MIN_FEE_BPS` | 1 (0.01%) |
| `MAX_FEE_BPS` | 500 (5.00%) |

---

## 10. Status Lifecycle

**Source:** `prisma/schema.prisma`, `src/services/institution-escrow.service.ts`

### All 12 Statuses

| Status | Label | Description |
|--------|-------|-------------|
| `DRAFT` | Draft | Initial save, no compliance check, no nonce, no expiry |
| `CREATED` | Awaiting Deposit | Compliance passed, on-chain initialized, awaiting funds |
| `FUNDED` | Funded — Awaiting Release | Deposit confirmed, ready for release |
| `COMPLIANCE_HOLD` | Compliance Review | Flagged for manual review (applied at release time) |
| `RELEASING` | Releasing | Release in progress (transient) |
| `RELEASED` | Released | Funds released on-chain (terminal or transitions to COMPLETE) |
| `INSUFFICIENT_FUNDS` | Insufficient Funds | Payer balance too low at release time |
| `COMPLETE` | Complete | Settlement fully complete (terminal) |
| `CANCELLING` | Cancelling | Cancel in progress (transient) |
| `CANCELLED` | Cancelled | Cancelled and refunded (terminal) |
| `EXPIRED` | Expired | Expired without deposit (terminal) |
| `FAILED` | Failed | Unrecoverable failure (terminal) |

### Status Transitions

```
DRAFT → CREATED (submit draft: compliance check + on-chain init)
CREATED → FUNDED (record deposit)
CREATED → EXPIRED (expiry check at deposit time)
CREATED → CANCELLING → CANCELLED
FUNDED → RELEASING → RELEASED → COMPLETE
FUNDED → INSUFFICIENT_FUNDS (balance check at release)
FUNDED → CANCELLING → CANCELLED (cancel with on-chain refund)
INSUFFICIENT_FUNDS → RELEASING → RELEASED → COMPLETE (retry)
INSUFFICIENT_FUNDS → CANCELLING → CANCELLED
COMPLIANCE_HOLD → CANCELLING → CANCELLED
DRAFT → CANCELLING → CANCELLED
```

On-chain release failure: `RELEASING → FUNDED` (rollback to allow retry)
On-chain cancel failure: `CANCELLING → {previous status}` (rollback)

### Cancellable Statuses

```typescript
['DRAFT', 'CREATED', 'FUNDED', 'COMPLIANCE_HOLD', 'INSUFFICIENT_FUNDS']
```

### Releasable Statuses

```typescript
['FUNDED', 'INSUFFICIENT_FUNDS']
```

### Deposit-Eligible Status

```typescript
['CREATED']  // Only CREATED escrows accept deposits
```

### Draft Update-Eligible Status

```typescript
['DRAFT']  // Only DRAFT escrows can be updated
```

---

## 11. What Blocks vs What Warns

### Blocks (Prevents Creation or Throws Error)

| Condition | Where | Effect |
|-----------|-------|--------|
| `riskScore ≥ rejectScore` (default 90) | `createEscrow`, `submitDraft` | Throws error, escrow not created |
| Client `status !== 'ACTIVE'` | `createEscrow`, `submitDraft`, `saveDraft` | Throws error |
| Client `kycStatus !== 'VERIFIED'` | `createEscrow`, `submitDraft` | Throws error |
| Wallet not on allowlist | Compliance check → `WALLET_ALLOWLIST` FAIL | Adds to risk score (12 points) |
| Payer wallet doesn't belong to client | Compliance check → `WALLET_ALLOWLIST` FAIL | Adds to risk score (12 points) |
| Token mint not on AMINA whitelist | `createEscrow`, `saveDraft`, `updateDraft` | Throws error |
| Missing required fields on submit | `submitDraft` | Throws error |
| `payerWallet === recipientWallet` | Validation middleware + service | Throws error |
| System paused | `requireNotPaused` middleware | HTTP 503 |
| No authentication token | `requireInstitutionAuth` | HTTP 401 |
| Invalid/expired token | `requireInstitutionAuth` | HTTP 401 |
| Invalid settlement authority key | `requireSettlementAuthority` | HTTP 403 |
| AI rate limit exceeded | AI analysis service | Throws error |
| AI release conditions not met | `releaseFunds` (releaseMode: 'ai') | Throws error |
| Per-tx/daily/monthly volume limits | Compliance → `TRANSACTION_LIMITS` FAIL | Adds 10 points; blocks if pushes score ≥ reject |
| Corridor not found or not ACTIVE | Compliance checks | Adds 12–15 points; `corridorValid = false` → `passed = false` |
| Sanctioned/blocked branches | Compliance → `BRANCH_COMPLIANCE` FAIL | Adds 4 points |
| On-chain init/release/cancel failure | Service methods | Throws error; rollback status |
| Escrow expired at deposit time | `recordDeposit` | Status → EXPIRED, throws error |
| Insufficient payer balance at release | `releaseFunds` | Status → INSUFFICIENT_FUNDS |

### Warns (Advisory, Does Not Block)

| Condition | Where | Effect |
|-----------|-------|--------|
| `holdScore ≤ riskScore < rejectScore` (70–89) | Compliance result | `MEDIUM_RISK` flag; escrow still created |
| KYC pending | Compliance → `KYC_VERIFICATION` WARNING | +8 points |
| Sanctions pending review | Compliance → `SANCTIONS_SCREENING` WARNING | +8 points |
| Medium-risk corridor | Compliance → `CORRIDOR_RISK` WARNING | +6 points |
| Amount 80%+ of per-tx max | Compliance → `TRANSACTION_LIMITS` WARNING | +5 points |
| Amount $10K–$100K | Compliance → `AMOUNT_THRESHOLD` WARNING | +4 points |
| Source of funds partial/pending/missing | Compliance → `SOURCE_OF_FUNDS` WARNING | +4 points |
| Medium PEP risk rating | Compliance → `PEP_SCREENING` WARNING | +3 points |
| Pending license | Compliance → `REGULATORY_STATUS` WARNING | +3 points |
| Branches under review | Compliance → `BRANCH_COMPLIANCE` WARNING | +2 points |
| Premium tier client | Compliance → `CLIENT_TIER` WARNING | +1 point |
| Unknown stablecoin (rules engine) | Rules → settlement section | `warning` status |
| Expiry < 24h or > 90 days | Rules → advanced section | `warning` status |
| No docs for amount > $50K | Rules → advanced section | `warning` status |
| KYB not verified (rules engine) | Rules → from_account section | `warning` status |
| High-risk corridor (rules engine) | Rules → corridor section | `warning` status |
| Amount > $100K (rules engine) | Rules → amount section | `warning` status |

---

## 12. Environment Variables

### Feature Flag

| Variable | Default | Description |
|----------|---------|-------------|
| `INSTITUTION_ESCROW_ENABLED` | `false` | Master feature flag. All institution escrow config is only validated when `true`. |

### Core Settings

| Variable | Default | Description | Changeable at Runtime? |
|----------|---------|-------------|----------------------|
| `USDC_MINT_ADDRESS` | _(none)_ | USDC SPL token mint address on Solana | No (startup) |
| `INSTITUTION_ESCROW_MIN_USDC` | `100` | Minimum escrow amount in USDC | No (startup) |
| `INSTITUTION_ESCROW_MAX_USDC` | `1000000` | Maximum escrow amount in USDC | No (startup) |
| `INSTITUTION_ESCROW_DEFAULT_EXPIRY_HOURS` | `72` | Default escrow expiry in hours | No (startup) |
| `INSTITUTION_ESCROW_FEE_BPS` | `20` (0.20%) | Default platform fee in basis points | No (startup) |

### Authentication

| Variable | Default | Description | Changeable at Runtime? |
|----------|---------|-------------|----------------------|
| `JWT_SECRET` | _(none, required)_ | Secret for institution JWT tokens (min 32 chars) | No (startup) |
| `JWT_ACCESS_TOKEN_EXPIRY` | `1h` | Access token expiry | No (startup) |
| `JWT_REFRESH_TOKEN_EXPIRY` | `7d` | Refresh token expiry | No (startup) |
| `SETTLEMENT_AUTHORITY_API_KEY` | _(none, required)_ | API key for settlement/release operations | No (startup) |

### AI Analysis

| Variable | Default | Description | Changeable at Runtime? |
|----------|---------|-------------|----------------------|
| `ANTHROPIC_API_KEY` | _(none, required)_ | Claude API key for AI compliance analysis | No (startup) |
| `AI_ANALYSIS_MODEL` | `claude-sonnet-4-20250514` | Claude model for non-DRAFT analysis | No (startup) |
| `AI_ANALYSIS_MODEL_DRAFT` | `claude-haiku-4-5-20251001` | Claude model for DRAFT analysis | No (startup) |

### Corridor Thresholds

| Variable | Default | Description | Changeable at Runtime? |
|----------|---------|-------------|----------------------|
| `CORRIDOR_TRAVEL_RULE_THRESHOLD` | `1000` | Travel rule threshold in USD | No (startup) |
| `CORRIDOR_EDD_THRESHOLD` | `10000` | Enhanced due diligence threshold in USD | No (startup) |
| `CORRIDOR_REPORTING_THRESHOLD` | `15000` | Regulatory reporting threshold in USD | No (startup) |

### Compliance Thresholds (DB-Configurable)

| Setting | Default | Location | Changeable at Runtime? |
|---------|---------|----------|----------------------|
| `rejectScore` | `90` | `SystemSetting` key `compliance.riskThresholds` | **Yes** (DB, cached 5 min) |
| `holdScore` | `70` | Same DB setting | **Yes** (DB, cached 5 min) |

### Document Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `DO_SPACES_KEY` | _(none)_ | DigitalOcean Spaces access key |
| `DO_SPACES_SECRET` | _(none)_ | DigitalOcean Spaces secret key |
| `DO_SPACES_ENDPOINT` | _(none)_ | Spaces endpoint URL |
| `DO_SPACES_BUCKET` / `DO_SPACES_BUCKET_NAME` | _(none)_ | Bucket name |
| `DO_SPACES_REGION` | _(none)_ | Region |

### Infrastructure

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | _(none)_ | PostgreSQL connection string |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Solana RPC endpoint |
| `REDIS_URL` | _(none)_ | Redis connection string |
| `NODE_ENV` | _(none)_ | Environment (production/staging/development) |

---

## 13. Auth & Rate Limiting

**Source:** `src/middleware/institution-jwt.middleware.ts`, `src/middleware/institution-escrow-pause.middleware.ts`

### JWT Authentication (`requireInstitutionAuth`)

- Bearer token in `Authorization` header
- Decoded payload: `{ clientId, email, tier, iat, exp }`
- Attached to `req.institutionClient`
- Error codes: `TOKEN_MISSING` (401), `TOKEN_EXPIRED` (401), `TOKEN_INVALID` (401)

### Optional Auth (`optionalInstitutionAuth`)

- Same as above but allows unauthenticated requests through
- On any error, sets `req.institutionClient = undefined` and continues

### Settlement Authority (`requireSettlementAuthority`)

- Must be used **after** `requireInstitutionAuth`
- Validates `X-Settlement-Authority-Key` header against `SETTLEMENT_AUTHORITY_API_KEY` env var
- Uses constant-time comparison (`crypto.timingSafeEqual`)
- Error codes: `AUTH_REQUIRED` (401), `SETTLEMENT_UNAUTHORIZED` (403)

### Pause Middleware (`requireNotPaused`)

- Checks `InstitutionEscrowPauseService.isPaused()` before allowing requests
- Timeout: **3 seconds** for pause check
- **Fail-open**: If pause check fails or times out, request is allowed through
- When paused: HTTP 503 with `INSTITUTION_ESCROW_PAUSED` code, includes `pausedAt` timestamp and reason
- Pause state managed via `InstitutionEscrowPauseService` (Redis-backed)

### AI Rate Limiting

| Setting | Value |
|---------|-------|
| Max requests | **5 per minute** per client |
| Window | 60 seconds |
| Storage | Redis key `institution:ai:ratelimit:{clientId}` |
| Enforcement | `checkRateLimit()` in `AiAnalysisService` |

### Escrow Cache

| Setting | Value |
|---------|-------|
| TTL | **5 minutes** (300s) |
| Key pattern | `institution:escrow:{escrowId}` |

---

## Prisma Enums Reference

```prisma
enum InstitutionEscrowStatus {
  DRAFT | CREATED | FUNDED | COMPLIANCE_HOLD | RELEASING | RELEASED
  INSUFFICIENT_FUNDS | COMPLETE | CANCELLING | CANCELLED | EXPIRED | FAILED
}

enum InstitutionConditionType {
  ADMIN_RELEASE | TIME_LOCK | COMPLIANCE_CHECK
}

enum ClientTier {
  STANDARD | PREMIUM | ENTERPRISE
}

enum ClientStatus {
  ACTIVE | SUSPENDED | PENDING_VERIFICATION
}

enum DocumentType {
  INVOICE | CONTRACT | SHIPPING_DOC | LETTER_OF_CREDIT | OTHER
}

enum CorridorStatus {
  ACTIVE | SUSPENDED | DEPRECATED
}

enum KybStatus {
  NOT_STARTED | PENDING | IN_REVIEW | VERIFIED | REJECTED | EXPIRED
}

enum RiskRating {
  LOW | MEDIUM | HIGH | CRITICAL | UNRATED
}

enum RegulatoryStatus {
  REGULATED | UNREGULATED | EXEMPT | PENDING_LICENSE | SUSPENDED
}

enum SanctionsStatus {
  CLEAR | FLAGGED | BLOCKED | PENDING_REVIEW
}

enum ApprovalMode {
  AUTO | SINGLE_APPROVAL | MULTI_APPROVAL
}

enum InstitutionAccountType {
  TREASURY | OPERATIONS | SETTLEMENT | COLLATERAL | GENERAL
}
```
