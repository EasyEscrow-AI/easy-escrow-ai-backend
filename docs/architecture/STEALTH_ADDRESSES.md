# Stealth Addresses Architecture

## Overview

EasyEscrow.ai uses **Dual-Key Stealth Address Protocol (DKSAP)** to provide address unlinkability for institution escrow USDC transfers. Implemented via the `solana-stealth` npm package.

## How DKSAP Works

1. **Recipient** generates a **meta-address**: a pair of public keys (scan key + spend key)
2. **Sender** derives a one-time **stealth address** from the meta-address using an ephemeral keypair
3. Funds are sent to the stealth address (a regular Solana pubkey)
4. **Recipient** scans for payments using their scan private key + the ephemeral public key
5. **Recipient** derives the spending key to sweep funds from the stealth address

### Key Properties

- **Address Unlinkability**: Each payment goes to a unique address — observers cannot link payments to the recipient's public wallet
- **No on-chain program changes**: Stealth addresses are standard Ed25519 keypairs; the Solana program treats them as regular pubkeys
- **Selective Disclosure**: The scanning key can be shared with auditors for compliance without revealing spending capability

## Architecture Flow

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Recipient   │     │   EasyEscrow.ai  │     │    Sender     │
│ Institution  │     │     Backend      │     │  Institution  │
└──────┬───────┘     └────────┬─────────┘     └───────┬───────┘
       │                      │                       │
       │ 1. Register          │                       │
       │    meta-address      │                       │
       │─────────────────────>│                       │
       │                      │                       │
       │  scan_pk + spend_pk  │                       │
       │<─────────────────────│                       │
       │                      │                       │
       │                      │   2. Create escrow    │
       │                      │   (privacyLevel:      │
       │                      │    STEALTH)           │
       │                      │<──────────────────────│
       │                      │                       │
       │                      │   3. Fund escrow      │
       │                      │<──────────────────────│
       │                      │                       │
       │                      │   4. Release escrow   │
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
