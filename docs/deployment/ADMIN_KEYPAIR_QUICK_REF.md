# Admin Keypair Quick Reference

## Environment Variables by Environment

| Environment | Variable Name | Example Address |
|-------------|--------------|-----------------|
| **Development** | `DEVNET_ADMIN_PRIVATE_KEY` | (your local dev wallet) |
| **Staging** | `DEVNET_STAGING_ADMIN_PRIVATE_KEY` | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` |
| **Production** | `MAINNET_ADMIN_PRIVATE_KEY` | (future) |

## How It Works

The backend **automatically selects** the correct variable based on `NODE_ENV`:

```typescript
NODE_ENV=staging → Uses DEVNET_STAGING_ADMIN_PRIVATE_KEY
NODE_ENV=development → Uses DEVNET_ADMIN_PRIVATE_KEY  
NODE_ENV=production → Uses MAINNET_ADMIN_PRIVATE_KEY
```

## Setting Variables

### DigitalOcean (Staging)
1. App Platform → Settings → Environment Variables
2. Add `DEVNET_STAGING_ADMIN_PRIVATE_KEY`
3. Type: **SECRET**
4. Value: Base58 or JSON array format
5. Save and redeploy

### Local Development
```bash
# .env file
NODE_ENV=development
DEVNET_ADMIN_PRIVATE_KEY="<your-base58-key>"
```

### Local Staging Testing
```bash
# .env file
NODE_ENV=staging
DEVNET_STAGING_ADMIN_PRIVATE_KEY="<staging-base58-key>"
```

## Supported Formats

The backend accepts three formats:

### 1. Base58 (Recommended)
```
Eg1TGKLrULrA1Xh2qCE7x48VUjkHYnXBUWfwi5g3z8ZqzJo2ySnAG7ZyAaJbNvxhQr9VLMXNbQKqLZQ5A7VDqy2
```

### 2. JSON Array
```json
[165,5,62,240,173,23,208,223,122,105,20,26,67,123,192,12,34,208,239,137,140,68,105,94,168,96,255,145,229,155,121,70,46,167,236,155,170,224,179,234,164,118,211,28,83,119,250,101,183,57,143,165,30,38,94,11,157,227,221,127,194,1,58,194]
```

### 3. Base64
```
pQU+8K0X0N96aRQaQ3vADCLQ74mMRGleqGD/keWbeUYup+ybquCz6qR20xxTd/plt
```

## Verification

### Check Logs
Look for this line on backend startup:

**Staging**:
```
[EscrowProgramService] Loaded admin keypair from DEVNET_STAGING_ADMIN_PRIVATE_KEY (staging): 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
```

**Development**:
```
[EscrowProgramService] Loaded admin keypair from DEVNET_ADMIN_PRIVATE_KEY (development): <your-address>
```

### Error Messages
If not configured:
```
[EscrowProgramService] Admin keypair not configured for staging. Set DEVNET_STAGING_ADMIN_PRIVATE_KEY
```

## Migration from Old System

### Old Variables (REMOVED)
- ❌ `AUTHORITY_KEYPAIR` (generic, ambiguous)
- ❌ Fallback hierarchy (confusing)

### New Variables (CURRENT)
- ✅ `DEVNET_ADMIN_PRIVATE_KEY` (dev)
- ✅ `DEVNET_STAGING_ADMIN_PRIVATE_KEY` (staging)
- ✅ `MAINNET_ADMIN_PRIVATE_KEY` (production)

### Action Required
In DigitalOcean:
1. Rename `AUTHORITY_KEYPAIR` → `DEVNET_STAGING_ADMIN_PRIVATE_KEY`
2. Or create new `DEVNET_STAGING_ADMIN_PRIVATE_KEY` with same value
3. Delete `AUTHORITY_KEYPAIR` after verification

## Security

⚠️ **NEVER**:
- Commit private keys to git
- Share private keys in chat/email
- Use the same keypair across environments

✅ **ALWAYS**:
- Store as SECRET in DigitalOcean
- Use different keypairs for dev/staging/prod
- Keep wallet files in `.gitignore`

## Convert Keypair Formats

```bash
# JSON array → Base58
node temp/convert-keypair.js
```

## Related Docs

- **Full Guide**: [AUTHORITY_KEYPAIR_EXPLAINED.md](AUTHORITY_KEYPAIR_EXPLAINED.md)
- **Refactoring Summary**: [ADMIN_KEYPAIR_REFACTORING.md](ADMIN_KEYPAIR_REFACTORING.md)
- **Code**: `src/services/escrow-program.service.ts`
- **Config**: `staging-app.yaml`

---

**TL;DR**: Each environment has its own admin keypair variable. The backend picks the right one automatically based on `NODE_ENV`. No more redundancy!

