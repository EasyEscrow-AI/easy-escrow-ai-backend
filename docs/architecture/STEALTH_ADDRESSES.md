# Stealth Addresses Architecture

## Overview

EasyEscrow.ai uses **Dual-Key Stealth Address Protocol (DKSAP)** to provide address unlinkability for institution escrow USDC transfers. Implemented via the `solana-stealth` npm package.

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

## Cost

- **Key generation**: Free (pure crypto math, no on-chain tx)
- **Address derivation**: Free (pure crypto math)
- **Per stealth payment**: ~0.002 SOL for ATA rent on the stealth address (reclaimable when swept)
- **Sweep tx fee**: Standard Solana tx fee (~0.000005 SOL)

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
