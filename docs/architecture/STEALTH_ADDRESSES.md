# Stealth Addresses Architecture

## Overview

EasyEscrow.ai uses **Dual-Key Stealth Address Protocol (DKSAP)** to provide address unlinkability for institution escrow USDC transfers. Implemented natively using `@noble/ed25519` for all elliptic curve operations.

**Privacy is enabled by default for all institutional endpoints.** Every institution account automatically receives a stealth meta-address on creation. Escrow releases use stealth addresses when available, falling back to standard addresses when no meta-address exists.

## Default Behavior

| Scenario | Privacy Level | Behavior |
|----------|--------------|----------|
| Recipient has meta-address | `STEALTH` (default) | USDC sent to one-time stealth address |
| Recipient has no meta-address | `NONE` (fallback) | USDC sent to standard wallet address |
| `PRIVACY_ENABLED=false` | `NONE` (forced) | All stealth features disabled |
| Explicit `privacyLevel: NONE` on request | `NONE` (override) | Standard address despite meta-address |

## How DKSAP Works

1. **Account creation** auto-generates a **meta-address**: a pair of public keys (scan key + spend key)
2. **Sender** (or backend on release) derives a one-time **stealth address** from the meta-address using an ephemeral keypair
3. Funds are sent to the stealth address (a regular Solana pubkey)
4. **Recipient** scans for payments using their scan private key + the ephemeral public key
5. **Recipient** derives the spending key to sweep funds from the stealth address

### Key Properties

- **Privacy by default**: No per-request opt-in needed — stealth is automatic for all institution accounts
- **Address Unlinkability**: Each payment goes to a unique address — observers cannot link payments to the recipient's public wallet
- **No on-chain program changes**: Stealth addresses are standard Ed25519 keypairs; the Solana program treats them as regular pubkeys
- **Selective Disclosure**: The scanning key can be shared with auditors for compliance without revealing spending capability
- **Graceful fallback**: If a recipient hasn't registered a meta-address, the system silently falls back to standard transfer

## Architecture Flow

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Recipient   │     │   EasyEscrow.ai  │     │    Sender     │
│ Institution  │     │     Backend      │     │  Institution  │
└──────┬───────┘     └────────┬─────────┘     └───────┬───────┘
       │                      │                       │
       │ 1. Create account    │                       │
       │    (auto-generates   │                       │
       │     meta-address)    │                       │
       │─────────────────────>│                       │
       │                      │                       │
       │                      │   2. Create escrow    │
       │                      │   (STEALTH by default)│
       │                      │<──────────────────────│
       │                      │                       │
       │                      │   3. Fund escrow      │
       │                      │<──────────────────────│
       │                      │                       │
       │                      │   4. Release escrow   │
       │                      │   → auto-lookup       │
       │                      │     meta-address      │
       │                      │   → derive stealth    │
       │                      │     address           │
       │                      │   → send USDC to      │
       │                      │     stealth addr      │
       │                      │                       │
       │ 5. Scan for          │                       │
       │    payments          │                       │
       │─────────────────────>│                       │
       │                      │                       │
       │ 6. Sweep to          │                       │
       │    real wallet       │                       │
       │─────────────────────>│                       │
       │                      │                       │
```

## Account ↔ Stealth Meta-Address (1:1)

Each `InstitutionAccount` has a `stealthMetaAddressId` field linking to its dedicated `StealthMetaAddress`. This is auto-populated on account creation:

```
InstitutionAccount (wallet: 7xKX...)
  └── StealthMetaAddress (scan_pk: ..., spend_pk: ...)
        └── StealthPayment[] (one-time addresses)
```

On release, the system:
1. Looks up the recipient wallet → finds the `InstitutionAccount`
2. Reads `stealthMetaAddressId` → gets the meta-address
3. Derives a one-time stealth address → sends USDC there
4. If no meta-address found → falls back to standard wallet

## Key Management

### Storage
- Private keys (scan + spend) encrypted with **AES-256-GCM**
- Per-key unique initialization vector (IV)
- Encryption secret from `STEALTH_KEY_ENCRYPTION_SECRET` env var (min 32 chars)
- Decryption only when needed (sweep/scan operations)

### Rotation
- Generate new meta-address, deactivate old one
- Old payments remain sweepable (keys preserved)
- New payments use new meta-address

## Fee Payer Model

Stealth addresses are ephemeral one-time addresses — they hold USDC but never have SOL. Transaction fees are paid by other wallets:

| Operation | Who Pays SOL Fees | Who Signs |
|-----------|-------------------|-----------|
| **Send USDC to stealth** (release) | Sender / escrow program | Sender |
| **Create stealth ATA** | Sender (during release tx) | Sender |
| **Sweep from stealth** | Admin wallet (`loadAdminKeypair`) | Admin (fees) + Stealth keypair (token authority) |
| **Create destination ATA** (during sweep) | Admin wallet | Admin |

The admin/platform wallet is loaded via `loadAdminKeypair()` using:
- Staging: `DEVNET_STAGING_ADMIN_PRIVATE_KEY`
- Production: `MAINNET_ADMIN_PRIVATE_KEY`

### Why the admin wallet?

The stealth address only holds USDC (SPL tokens). It has zero SOL, so it cannot pay for:
- Sweep transaction fees (~0.000005 SOL)
- Destination ATA rent if needed (~0.002 SOL)

The admin wallet signs as `feePayer` on the sweep transaction. The stealth keypair (derived from scan + spend private keys) signs only as the token transfer authority.

## Cost

- **Key generation**: Free (pure crypto math, no on-chain tx)
- **Address derivation**: Free (pure crypto math)
- **Per stealth payment**: ~0.002 SOL for stealth ATA rent (paid by sender, reclaimable)
- **Sweep tx fee**: ~0.000005 SOL (paid by admin wallet)
- **Destination ATA rent** (if new): ~0.002 SOL (paid by admin wallet, one-time per destination)

## Compliance Model

### Selective Disclosure
- **Scanning key** can be shared with auditors → reveals payment amounts and timing
- **Spending key** never shared → only recipient can move funds
- `viewingKeyShared` flag tracks whether scanning key has been disclosed

### Audit Trail
- All stealth operations logged in `InstitutionAuditLog`
- `StealthPayment` records link stealth addresses to escrow IDs
- On-chain transaction signatures recorded for both release and sweep

## Interaction with Existing Systems

### Durable Nonces
- Stealth addresses are compatible with durable nonce transactions
- Release transactions use the same nonce pool as standard releases

### Jito Bundles
- **Independent toggle**: `useJito` can be combined with any privacy level
- `NONE` + Jito = mempool privacy only (transaction not visible before confirmation)
- `STEALTH` + Jito = address unlinkability + mempool privacy
- `STEALTH` + no Jito = address unlinkability only

### Program PDAs
- Stealth addresses are passed as the `recipientWallet` to `releaseInstitutionEscrow`
- The on-chain program creates an ATA for the stealth address (standard SPL token flow)
- No program modifications needed

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVACY_ENABLED` | No | `true` | Set to `false` to disable all stealth features |
| `STEALTH_KEY_ENCRYPTION_SECRET` | Yes (when enabled) | — | Min 32 chars. Encrypts scan/spend private keys (AES-256-GCM via HKDF) |
| `DEFAULT_PRIVACY_LEVEL` | No | `STEALTH` | `STEALTH` or `NONE` |
| `PRIVACY_JITO_DEFAULT` | No | `false` | Use Jito bundles by default for privacy payments |

### Startup Validation

Privacy config is validated at server boot via `validatePrivacyStartupConfig()`. If `PRIVACY_ENABLED` is not `false` and `STEALTH_KEY_ENCRYPTION_SECRET` is missing or too short, the server will **fail to start** with a clear error.

## API Endpoints

All endpoints require institution JWT authentication (`Authorization: Bearer <token>`).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/privacy/meta-address` | Register a stealth meta-address (optional `label`, max 100 chars) |
| `GET` | `/api/v1/privacy/meta-address/:clientId` | List active meta-addresses (own client only, 403 for others) |
| `DELETE` | `/api/v1/privacy/meta-address/:id` | Soft-deactivate a meta-address |
| `POST` | `/api/v1/privacy/scan` | Scan for incoming stealth payments (optional `status` filter) |
| `GET` | `/api/v1/privacy/payments` | List stealth payments (paginated: `limit`, `offset`, `status`) |
| `GET` | `/api/v1/privacy/payments/:id` | Get single payment details (ownership verified) |
| `POST` | `/api/v1/privacy/sweep/:paymentId` | Sweep USDC from stealth address to `destinationWallet` |

### Rate Limits
- Standard endpoints: 30 req/min
- Sweep endpoint: 10 req/min (strict)

## Database Models

### StealthMetaAddress
Stores encrypted scan + spend keypairs per institution client.

| Field | Description |
|-------|-------------|
| `scanPublicKey` | Base58 public scan key (shared for detection) |
| `spendPublicKey` | Base58 public spend key |
| `encryptedScanKey` | AES-256-GCM encrypted scan private key (`iv:tag:ciphertext`) |
| `encryptedSpendKey` | AES-256-GCM encrypted spend private key |
| `label` | Optional, unique per client |
| `isActive` | Soft-delete flag |

### StealthPayment
Tracks one-time stealth addresses derived from meta-addresses.

| Field | Description |
|-------|-------------|
| `stealthAddress` | Derived one-time address |
| `ephemeralPublicKey` | Ephemeral key needed for recipient detection |
| `status` | `PENDING` → `CONFIRMED` → `SWEPT` (or `FAILED`) |
| `releaseTxSignature` | On-chain tx when funds sent to stealth address |
| `sweepTxSignature` | On-chain tx when funds swept to destination |

### Modified Tables
- `InstitutionEscrow`: Added `privacyLevel` (default `STEALTH`) and `stealthPaymentId`
- `InstitutionAccount`: Added `stealthMetaAddressId` (1:1 link to meta-address)

## Source Files

| File | Purpose |
|------|---------|
| `src/services/privacy/stealth-crypto.ts` | Native DKSAP implementation (Ed25519 math) |
| `src/services/privacy/stealth-adapter.ts` | Wrapper: key gen, address derivation, on-chain sweep |
| `src/services/privacy/stealth-address.service.ts` | DB lifecycle: register, create payment, scan, sweep |
| `src/services/privacy/stealth-key-manager.ts` | AES-256-GCM key encryption/decryption |
| `src/services/privacy/privacy-router.service.ts` | Routes escrow releases to stealth or standard addresses |
| `src/services/privacy/privacy.config.ts` | Config loading + validation |
| `src/routes/privacy.routes.ts` | HTTP API endpoints |
