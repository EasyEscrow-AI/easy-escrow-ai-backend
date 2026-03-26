# Pool Receipt Encryption

## Overview

Every settled transaction pool member receives an on-chain encrypted receipt stored in a `PoolReceipt` PDA. Receipts use **AES-256-GCM** symmetric encryption with a fixed 512-byte payload format. Only the pool operator — holding the `POOL_RECEIPT_ENCRYPTION_KEY` — can decrypt receipts. On-chain observers see opaque 512-byte blobs.

## Encryption Algorithm

**AES-256-GCM** (Galois/Counter Mode):

- 256-bit key (32 bytes, provided as 64-character hex string)
- 96-bit initialization vector (12 bytes, randomly generated per receipt)
- 128-bit authentication tag (16 bytes, prevents tampering)
- Authenticated encryption: ciphertext integrity is verified on decryption

## Payload Layout

The encrypted receipt is a **fixed 512-byte buffer** stored in the `PoolReceipt` PDA's `encryptedPayload` field:

```
Offset   Size    Field               Description
──────   ────    ─────               ───────────
0        12      IV                  Initialization vector (random per receipt)
12       16      Auth Tag            GCM authentication tag
28        2      Ciphertext Length   uint16BE — actual ciphertext byte count
30      482      Ciphertext          Encrypted JSON, zero-padded to 482 bytes
──────   ────
Total   512      bytes
```

### Why Fixed Size?

On-chain Solana accounts have a fixed size set at creation. Using a fixed 512-byte payload:

- Simplifies PDA account allocation (no dynamic sizing)
- Prevents information leakage from variable payload lengths
- Accommodates typical receipt JSON (~200-350 bytes encrypted)
- Maximum plaintext size: 480 bytes (ciphertext may be slightly larger than plaintext, but AES-GCM ciphertext length equals plaintext length, so 480 bytes plaintext produces 480 bytes ciphertext, well within the 482-byte field)

### Reading the Length Field

The 2-byte ciphertext length at offset 28 (uint16BE) tells the decryptor how many bytes of the 482-byte field are actual ciphertext versus zero-padding. Without this, the decryptor would need to guess where the ciphertext ends.

## Receipt Plaintext

The plaintext is a JSON-serialized `ReceiptPlaintext` object:

```typescript
interface ReceiptPlaintext {
  poolId: string; // Pool UUID
  poolCode: string; // Human-readable pool code (TP-XXX-XXX)
  escrowId: string; // Escrow UUID
  escrowCode: string; // Human-readable escrow code (EE-XXX-XXX)
  amount: string; // USDC amount with 6 decimal places ("1000.500000")
  corridor: string; // Payment corridor (e.g., "SG-CH")
  payerWallet: string; // Payer's Solana public key (base58)
  recipientWallet: string; // Recipient's Solana public key (base58)
  releaseTxSignature: string; // On-chain release transaction signature
  settledAt: string; // ISO 8601 timestamp of settlement
}
```

### Encrypted vs Cleartext Fields

| Field                | On-Chain Visibility             | Rationale                                    |
| -------------------- | ------------------------------- | -------------------------------------------- |
| `poolId`             | Encrypted                       | Prevents linking receipt to pool without key |
| `poolCode`           | Encrypted                       | Human-readable identifier hidden             |
| `escrowId`           | Encrypted                       | Prevents linking to specific escrow          |
| `escrowCode`         | Encrypted                       | Human-readable identifier hidden             |
| `amount`             | Encrypted                       | Payment amount hidden from observers         |
| `corridor`           | Encrypted                       | Payment route hidden                         |
| `payerWallet`        | Encrypted                       | Sender identity hidden                       |
| `recipientWallet`    | Encrypted                       | Receiver identity hidden                     |
| `releaseTxSignature` | Encrypted                       | Prevents cross-referencing with on-chain tx  |
| `settledAt`          | Encrypted                       | Exact timing hidden                          |
| Commitment hash      | **Cleartext** (separate field)  | Enables verification without decryption      |
| Receipt PDA address  | **Cleartext** (account address) | Required for on-chain lookup                 |
| Pool ID bytes        | **Cleartext** (PDA seed)        | Required for PDA derivation                  |
| Member ID bytes      | **Cleartext** (PDA seed)        | Required for PDA derivation                  |

## Commitment Hash

A **SHA-256** hash of the JSON-serialized receipt plaintext is stored as a separate field on the `PoolReceipt` PDA:

```typescript
function computeCommitmentHash(params: ReceiptPlaintext): Buffer {
  return createHash('sha256').update(JSON.stringify(params)).digest();
}
```

### Purpose

The commitment hash enables:

1. **Integrity verification**: After decrypting a receipt, recompute the hash and compare it to the on-chain value. A mismatch indicates tampering.
2. **Non-repudiation**: The hash was stored at settlement time. Even if the encryption key is later compromised, the original commitment hash proves what was encrypted.
3. **Selective disclosure**: Share the commitment hash with an auditor who can later verify a revealed plaintext matches, without needing the encryption key upfront.

### Hash Properties

- Deterministic: same plaintext always produces the same hash
- One-way: cannot derive plaintext from the hash
- Collision-resistant: computationally infeasible to find two plaintexts with the same hash

## Key Management

### Key Generation

Generate a 32-byte (256-bit) random key:

```bash
# Generate a random AES-256 key as hex
openssl rand -hex 32
# Example: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

### Key Storage

- Stored as `POOL_RECEIPT_ENCRYPTION_KEY` environment variable
- 64-character hexadecimal string (32 bytes)
- Loaded once at `PoolVaultProgramService` initialization
- Never stored on-chain or in the database
- Must be identical across all backend instances

### Key Rotation

Key rotation is **not currently supported** for existing receipts. To rotate:

1. Generate new key
2. Decrypt all existing receipts with old key
3. Re-encrypt with new key and update on-chain (costly)
4. Update `POOL_RECEIPT_ENCRYPTION_KEY` env var

In practice, key rotation is a planned future enhancement. Current mitigation: the key is only used server-side and never transmitted over the network.

### Validation

At startup, `PoolVaultProgramService` validates the key:

```typescript
const aesKeyHex = process.env.POOL_RECEIPT_ENCRYPTION_KEY;
if (!aesKeyHex || aesKeyHex.length < 64) {
  throw new Error('POOL_RECEIPT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
}
```

## Encryption Flow

```
1. Build ReceiptPlaintext object from settlement data
2. JSON.stringify(plaintext) → plaintext bytes
3. Validate plaintext.length <= 480 bytes
4. Generate 12 random IV bytes
5. Create AES-256-GCM cipher with key + IV
6. Encrypt plaintext → ciphertext bytes
7. Get 16-byte auth tag from cipher
8. Allocate 512-byte buffer (zero-filled)
9. Write IV at offset 0 (12 bytes)
10. Write auth tag at offset 12 (16 bytes)
11. Write ciphertext length as uint16BE at offset 28 (2 bytes)
12. Write ciphertext at offset 30 (up to 482 bytes)
13. Return 512-byte payload
```

## Decryption Flow

```
1. Validate payload is exactly 512 bytes
2. Read IV from offset 0 (12 bytes)
3. Read auth tag from offset 12 (16 bytes)
4. Read ciphertext length from offset 28 (uint16BE)
5. Read ciphertext from offset 30 (ciphertextLength bytes)
6. Create AES-256-GCM decipher with key + IV
7. Set auth tag on decipher
8. Decrypt ciphertext → plaintext bytes
9. JSON.parse(plaintext) → ReceiptPlaintext
10. Return ReceiptPlaintext object
```

If the auth tag does not match (tampering detected), step 8 throws an error and decryption fails.

## Privacy Guarantees

### What On-Chain Observers Can See

- A 512-byte opaque blob (encrypted receipt)
- A 32-byte commitment hash
- The PDA address (derived from pool ID + member ID seeds)
- The transaction that created the receipt (admin signer, program ID)

### What On-Chain Observers Cannot See

- Payment amount
- Payer or recipient wallet addresses
- Corridor or escrow identifiers
- Settlement timestamp
- Transaction signature cross-references

### Limitations

- Pool ID and member ID are used as PDA seeds in cleartext, so observers can group receipts by pool
- The number of receipts per pool reveals the member count
- Timing analysis of receipt creation transactions can reveal settlement patterns
- The admin wallet that signs receipt creation is visible

## Security Considerations

### Threat Model

| Threat                   | Mitigation                                                                   |
| ------------------------ | ---------------------------------------------------------------------------- |
| Key compromise           | Limit key access to backend env only; rotate if compromised                  |
| Ciphertext tampering     | AES-GCM auth tag detects modification; commitment hash provides second layer |
| IV reuse                 | Each receipt generates a fresh 12-byte random IV via `crypto.randomBytes()`  |
| Plaintext too large      | Validated at encryption time; throws if > 480 bytes                          |
| Payload size analysis    | Fixed 512-byte payload prevents length-based inference                       |
| Replay attack            | PDA uniqueness (one receipt per pool+member) prevents replay                 |
| Commitment hash reversal | SHA-256 is one-way; plaintext cannot be derived from hash                    |

### Dependencies

- Node.js `crypto` module (OpenSSL-backed AES-256-GCM)
- `crypto.randomBytes()` for IV generation (CSPRNG)
- `crypto.createHash('sha256')` for commitment hashes

## Source Files

| File                                         | Purpose                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/services/pool-vault-program.service.ts` | `encryptReceiptPayload()`, `decryptReceiptPayload()`, `computeCommitmentHash()` |
| `src/types/transaction-pool.ts`              | `ReceiptPlaintext`, `ReceiptEncryptionParams` type definitions                  |
| `src/services/transaction-pool.service.ts`   | Calls encryption during `settleSingleMember()`                                  |
