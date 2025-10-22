# Admin Keypair Explained (Environment-Specific)

## What are the Admin Keypair Environment Variables?

The backend uses **environment-specific admin keypairs** to sign blockchain transactions on behalf of the platform. The variable name changes based on the deployment environment:

- **Development/Test**: `DEVNET_ADMIN_PRIVATE_KEY`
- **Staging**: `DEVNET_STAGING_ADMIN_PRIVATE_KEY`
- **Production**: `MAINNET_ADMIN_PRIVATE_KEY` (future)

This approach ensures each environment has its own dedicated admin keypair, preventing accidental cross-environment usage.

## Purpose

The authority keypair is required for:

1. **Cancelling Escrows**: When an admin or automated process needs to cancel an escrow before expiry
2. **Settling Escrows**: When the settlement service automatically settles completed agreements
3. **Administrative Operations**: Any on-chain transaction that requires platform authority

## How It Was Created

The authority keypair was generated using standard Solana keypair generation:

```bash
# Using Solana CLI
solana-keygen new --outfile wallets/staging/devnet-staging-admin.json --no-bip39-passphrase

# This creates a JSON file with 64 bytes:
# [165,5,62,240,173,23,208,223,...]
```

**For Staging**: The keypair at `wallets/staging/devnet-staging-admin.json` represents:
- **Private Key**: 64-byte array (first 32 bytes = seed, last 32 bytes = public key)
- **Public Address**: `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`

## Formats

The same keypair can be represented in two formats:

### 1. JSON Array Format (64 bytes)
```json
[165,5,62,240,173,23,208,223,122,105,20,26,67,123,192,12,34,208,239,137,140,68,105,94,168,96,255,145,229,155,121,70,46,167,236,155,170,224,179,234,164,118,211,28,83,119,250,101,183,57,143,165,30,38,94,11,157,227,221,127,194,1,58,194]
```

### 2. Base58 Format (Solana standard)
```
Eg1TGKLrULrA1Xh2qCE7x48VUjkHYnXBUWfwi5g3z8ZqzJo2ySnAG7ZyAaJbNvxhQr9VLMXNbQKqLZQ5A7VDqy2
```

**Note**: Both formats represent the **exact same keypair**. The backend code accepts either format.

## Environment Variable Names by Environment

The backend automatically selects the correct variable based on `NODE_ENV`:

| Environment | NODE_ENV Value | Variable Name | Network |
|-------------|---------------|---------------|---------|
| **Development** | `development` | `DEVNET_ADMIN_PRIVATE_KEY` | Solana Devnet |
| **Local Testing** | `test` | `DEVNET_ADMIN_PRIVATE_KEY` | Solana Devnet |
| **Staging** | `staging` | `DEVNET_STAGING_ADMIN_PRIVATE_KEY` | Solana Devnet |
| **Production** | `production` | `MAINNET_ADMIN_PRIVATE_KEY` | Solana Mainnet |

## Variable Loading Logic

The backend uses a switch statement based on `NODE_ENV` (from `src/services/escrow-program.service.ts`):

```typescript
function loadAdminKeypair(): Keypair {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  switch (nodeEnv) {
    case 'staging':
      envName = 'DEVNET_STAGING_ADMIN_PRIVATE_KEY';
      envValue = process.env.DEVNET_STAGING_ADMIN_PRIVATE_KEY;
      break;
    case 'production':
      envName = 'MAINNET_ADMIN_PRIVATE_KEY';
      envValue = process.env.MAINNET_ADMIN_PRIVATE_KEY;
      break;
    case 'development':
    case 'test':
    default:
      envName = 'DEVNET_ADMIN_PRIVATE_KEY';
      envValue = process.env.DEVNET_ADMIN_PRIVATE_KEY;
      break;
  }
  
  if (!envValue) {
    throw new Error(`Admin keypair not configured for ${nodeEnv}. Set ${envName}`);
  }
  
  // Parse and return keypair...
}
```

## Configuration by Environment

### For Staging

1. **Set in DigitalOcean** (App Platform → Settings → Environment Variables):
   ```
   DEVNET_STAGING_ADMIN_PRIVATE_KEY = <Base58 or JSON array>
   Type: SECRET
   ```

2. **Set in Local `.env`** (for local staging testing):
   ```bash
   NODE_ENV=staging
   DEVNET_STAGING_ADMIN_PRIVATE_KEY="Eg1TGKLrULrA1Xh2qCE7x48VUjkHYnXBUWfwi5g3z8ZqzJo2ySnAG7ZyAaJbNvxhQr9VLMXNbQKqLZQ5A7VDqy2"
   ```

### For Development

1. **Set in Local `.env`**:
   ```bash
   NODE_ENV=development
   DEVNET_ADMIN_PRIVATE_KEY="<different-keypair-for-dev>"
   ```

## No More Redundancy! ✅

With this refactoring:
- ❌ **Removed**: `AUTHORITY_KEYPAIR` (generic, ambiguous)
- ❌ **Removed**: Fallback/hierarchy logic (confusing)
- ✅ **Added**: Environment-specific variables (clear, explicit)
- ✅ **Added**: Automatic selection based on `NODE_ENV`

## Security Notes

### ⚠️ CRITICAL
- **NEVER commit the private key** to git (Base58 or JSON format)
- **NEVER expose in logs** (the code redacts it)
- **NEVER share publicly** (this gives full control of the account)

### ✅ Safe to Share
- **Public Address**: `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` (can be public)
- **Environment Variable Name**: `AUTHORITY_KEYPAIR` (just the name, not the value)

## How to Rotate the Keypair

If the keypair is compromised or needs rotation:

1. **Generate new keypair**:
   ```bash
   solana-keygen new --outfile wallets/staging/devnet-staging-admin-new.json --no-bip39-passphrase
   ```

2. **Convert to Base58**:
   ```bash
   node temp/convert-keypair.js
   ```

3. **Update environment variables**:
   - DigitalOcean: Update `AUTHORITY_KEYPAIR` secret
   - Local: Update `.env` file

4. **Update address reference**:
   - Update `DEVNET_STAGING_ADMIN_ADDRESS` with new public key

5. **Redeploy backend**:
   ```bash
   npm run deploy:staging
   ```

6. **Securely delete old keypair**:
   ```bash
   # Overwrite and delete
   rm wallets/staging/devnet-staging-admin.json
   ```

## Current Staging Values

### Public Information (Safe to Share)
- **Public Address**: `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`
- **Network**: Solana Devnet
- **Environment Variable**: `AUTHORITY_KEYPAIR`

### Private Information (NEVER Share)
- **Private Key**: Stored in DigitalOcean App Platform secrets
- **Local File**: `wallets/staging/devnet-staging-admin.json` (gitignored)

## Verification

To verify the keypair is loaded correctly, check the backend logs on startup:

```
[EscrowProgramService] Loaded admin keypair from AUTHORITY_KEYPAIR: 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
```

## Related Files

- **Code**: `src/services/escrow-program.service.ts` (keypair loading logic)
- **Wallet File**: `wallets/staging/devnet-staging-admin.json` (gitignored)
- **App Spec**: `staging-app.yaml` (environment variable definition)
- **Security Guide**: `docs/SECRETS_MANAGEMENT.md`

## Summary

| Aspect | Details |
|--------|---------|
| **Purpose** | Backend admin keypair for signing escrow transactions |
| **Variable Names** | `DEVNET_ADMIN_PRIVATE_KEY` (dev), `DEVNET_STAGING_ADMIN_PRIVATE_KEY` (staging), `MAINNET_ADMIN_PRIVATE_KEY` (prod) |
| **Format** | Base58 string or JSON array (64 bytes) |
| **Staging Address** | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` |
| **Network** | Solana Devnet (staging), Mainnet (production) |
| **Selection** | Automatic based on `NODE_ENV` environment variable |
| **Security** | Store as SECRET in DigitalOcean, never commit to git |
| **Redundancy** | ✅ No redundancy - each environment has one specific variable |

---

**Last Updated**: October 22, 2025
**Environment**: Staging (Devnet)

