# STAGING Key Format Decision

## Decision: Use Base58 Format for Private Keys

**Date**: 2025-01-20  
**Status**: ✅ Implemented

---

## Problem

When setting up STAGING environment, we initially stored wallet private keys in **byte array format**:

```env
# ❌ Initial approach (byte array)
DEVNET_STAGING_SENDER_PRIVATE_KEY=[50,125,181,45,213,166,215,201,...]
```

However, our DEV environment uses **Base58 format**:

```env
# ✅ DEV format (Base58)
DEVNET_SENDER_PRIVATE_KEY=57CjnFUDN2rJwYfSTunKb22raU4ffzPTi5jU1FXY9mVSyf1...
```

This inconsistency could cause confusion and compatibility issues.

---

## Decision

**Use Base58 format for all STAGING wallet private keys** to maintain consistency with DEV environment.

### Rationale

1. **Consistency**: DEV and STAGING should use the same format for easier maintenance
2. **Readability**: Base58 is more compact and human-readable
3. **Compatibility**: Standard Solana format used by CLI tools and SDKs
4. **Error Detection**: Base58 includes checksums for better error detection
5. **Portability**: Works seamlessly across all Solana tooling

---

## Implementation

### Before (Byte Array)
```env
DEVNET_STAGING_SENDER_PRIVATE_KEY=[50,125,181,45,213,166,215,201,43,186,216,134,178,56,38,71,91,19,100,178,148,111,31,5,100,160,51,35,131,54,145,61,145,143,69,140,51,79,209,218,93,173,145,127,131,116,205,10,53,235,203,169,2,190,144,5,185,109,173,176,226,187,197,201]
```

### After (Base58)
```env
DEVNET_STAGING_SENDER_PRIVATE_KEY=21YtDf3GptHmEL414KRMjJs9yV6R7A61tjvWc6ZXi8yodGekfQA56sfqgxBKWVGfJRfMBomaxqpDH2sp7HYiqiGp
```

---

## Technical Details

### Conversion Process

We used the `bs58` library to convert keypair JSON files to Base58:

```javascript
const bs58 = require('bs58');
const keypairJson = JSON.parse(fs.readFileSync('wallet.json', 'utf8'));
const keypairBytes = Uint8Array.from(keypairJson);
const base58Key = bs58.encode(keypairBytes);
```

### Wallet Addresses

All 4 STAGING wallets were converted:

| Wallet | Address | Format |
|--------|---------|--------|
| Sender | `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` | Base58 |
| Receiver | `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` | Base58 |
| Admin | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` | Base58 |
| Fee Collector | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` | Base58 |

---

## Compatibility

### ✅ Compatible With

- Solana CLI tools (`solana`, `solana-keygen`)
- Anchor framework
- `@solana/web3.js` SDK
- Backend services (Express, TypeScript)
- DigitalOcean App Platform (environment variables)

### Format Support

Both formats are technically valid in Solana SDK:

```typescript
// Both work, but Base58 is preferred
const keypair1 = Keypair.fromSecretKey(bs58.decode(base58Key));  // ✅ Preferred
const keypair2 = Keypair.fromSecretKey(Uint8Array.from(byteArray)); // ✅ Works
```

However, Base58 is the **standard format** used throughout the Solana ecosystem.

---

## Files Updated

1. ✅ `.env.staging` - Updated all 4 wallet keys to Base58
2. ✅ `.env.staging.example` - Updated template with Base58 placeholders
3. ✅ `scripts/convert-keys-to-base58.js` - Conversion utility (can be archived)
4. ✅ `docs/STAGING_WALLETS.md` - Reflects Base58 format

---

## Verification

To verify the format is correct:

```bash
# Check key length (Base58 format is typically 87-88 characters)
echo "21YtDf3GptHmEL414KRMjJs9yV6R7A61tjvWc6ZXi8yodGekfQA56sfqgxBKWVGfJRfMBomaxqpDH2sp7HYiqiGp" | wc -c
# Output: 88

# Verify it decodes to 64 bytes (32 bytes private key + 32 bytes public key)
# In Node.js:
bs58.decode("21YtDf3GptHmEL...").length
# Output: 64
```

---

## Best Practices

### Going Forward

1. **Always use Base58 for private keys** in environment variables
2. **Keep keypair JSON files** as backups (in `/temp` or secure storage)
3. **Never commit** `.env.staging` or keypair files to git
4. **Use the same format** across all environments (DEV, STAGING, PROD)

### Format Decision Matrix

| Use Case | Format | Reason |
|----------|--------|--------|
| Environment variables | Base58 | Standard, compact, CLI-compatible |
| Keypair file storage | JSON array | Solana-keygen output format |
| SDK operations | Either | Both work, Base58 preferred |
| Documentation/sharing | Base58 | Human-readable, error detection |

---

## References

- [Solana Keypair Documentation](https://docs.solana.com/cli/keypair-file)
- [Base58 Encoding](https://en.wikipedia.org/wiki/Base58)
- [bs58 Library](https://www.npmjs.com/package/bs58)
- [Solana Web3.js Keypair](https://solana-labs.github.io/solana-web3.js/classes/Keypair.html)

---

## Related Tasks

- ✅ **Task 63**: Generate Escrow Program Keypair for STAGING
- ✅ **Task 64**: Generate Devnet Wallets for STAGING
- ✅ **Task 65**: Fund STAGING Wallets with Devnet SOL
- ⏳ **Task 66**: Build and Deploy Escrow Program to Devnet for STAGING

