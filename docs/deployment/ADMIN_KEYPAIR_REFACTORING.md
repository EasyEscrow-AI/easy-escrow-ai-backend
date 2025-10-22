# Admin Keypair Refactoring Summary

**Date**: October 22, 2025  
**Purpose**: Remove redundant environment variables and implement environment-specific admin keypairs

## Problem

Previously, the backend used a confusing hierarchy of environment variables for the admin keypair:
1. `AUTHORITY_KEYPAIR` (checked first)
2. `DEVNET_STAGING_ADMIN_PRIVATE_KEY` (fallback for staging)
3. `DEVNET_ADMIN_PRIVATE_KEY` (fallback for dev)

This created:
- **Redundancy**: Multiple variables could contain the same keypair
- **Ambiguity**: Unclear which variable would be used
- **Confusion**: Generic `AUTHORITY_KEYPAIR` name didn't indicate environment

## Solution

Refactored to use **environment-specific variables** selected automatically based on `NODE_ENV`:

| Environment | NODE_ENV | Variable Name |
|-------------|----------|---------------|
| Development | `development` or `test` | `DEVNET_ADMIN_PRIVATE_KEY` |
| Staging | `staging` | `DEVNET_STAGING_ADMIN_PRIVATE_KEY` |
| Production | `production` | `MAINNET_ADMIN_PRIVATE_KEY` |

## Changes Made

### 1. Code Changes

**File**: `src/services/escrow-program.service.ts`

**Before**:
```typescript
function loadAdminKeypair(): Keypair {
  // Try AUTHORITY_KEYPAIR first (preferred)
  let envValue = process.env.AUTHORITY_KEYPAIR;
  let envName = 'AUTHORITY_KEYPAIR';
  
  // Fallback to DEVNET_ADMIN_PRIVATE_KEY for devnet testing
  if (!envValue && process.env.SOLANA_NETWORK === 'devnet') {
    envValue = process.env.DEVNET_ADMIN_PRIVATE_KEY;
    envName = 'DEVNET_ADMIN_PRIVATE_KEY';
  }
  // ...
}
```

**After**:
```typescript
function loadAdminKeypair(): Keypair {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Determine which environment variable to use based on NODE_ENV
  let envName: string;
  let envValue: string | undefined;
  
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
  // ...
}
```

### 2. Configuration Changes

**File**: `staging-app.yaml`

**Before**:
```yaml
# Admin keypair for signing escrow transactions
# Application code reads AUTHORITY_KEYPAIR
- key: AUTHORITY_KEYPAIR
  type: SECRET
  scope: RUN_TIME
```

**After**:
```yaml
# Admin keypair for signing escrow transactions
# Application code reads DEVNET_STAGING_ADMIN_PRIVATE_KEY (based on NODE_ENV=staging)
- key: DEVNET_STAGING_ADMIN_PRIVATE_KEY
  type: SECRET
  scope: RUN_TIME
```

### 3. Documentation Updates

**File**: `docs/deployment/AUTHORITY_KEYPAIR_EXPLAINED.md`

- Renamed to reflect environment-specific approach
- Updated all references from `AUTHORITY_KEYPAIR` to environment-specific variables
- Added clear table showing variable names by environment
- Updated code examples and configuration instructions
- Removed sections about redundancy (no longer applicable)

## Benefits

✅ **Clarity**: Each environment has one specific variable name  
✅ **No Redundancy**: No overlapping or fallback variables  
✅ **Explicit**: Variable names indicate which environment they're for  
✅ **Automatic**: Backend selects correct variable based on `NODE_ENV`  
✅ **Future-Ready**: Easy to add production variables when needed  

## Migration Steps

### For DigitalOcean Staging Deployment

1. **In DigitalOcean App Platform Console**:
   - Go to your staging app → Settings → Environment Variables
   - Find `AUTHORITY_KEYPAIR`
   - Copy its value
   - Create new variable: `DEVNET_STAGING_ADMIN_PRIVATE_KEY`
   - Paste the same value
   - Mark as SECRET
   - **After confirming new variable works, delete `AUTHORITY_KEYPAIR`**

2. **Verify `NODE_ENV` is set to `staging`** (should already be in `staging-app.yaml`)

3. **Deploy the updated backend**:
   ```bash
   git add .
   git commit -m "refactor: use environment-specific admin keypairs"
   git push origin staging
   ```

4. **Check logs** to confirm keypair loaded:
   ```
   [EscrowProgramService] Loaded admin keypair from DEVNET_STAGING_ADMIN_PRIVATE_KEY (staging): 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
   ```

### For Local Development

1. **Update your local `.env` file**:
   ```bash
   # Remove this line (if it exists):
   # AUTHORITY_KEYPAIR=...
   
   # Keep/add this line:
   NODE_ENV=development
   DEVNET_ADMIN_PRIVATE_KEY="<your-dev-keypair>"
   ```

2. **For local staging testing**:
   ```bash
   NODE_ENV=staging
   DEVNET_STAGING_ADMIN_PRIVATE_KEY="<staging-keypair>"
   ```

## Verification

### Expected Log Output

**Development**:
```
[EscrowProgramService] Loaded admin keypair from DEVNET_ADMIN_PRIVATE_KEY (development): <address>
```

**Staging**:
```
[EscrowProgramService] Loaded admin keypair from DEVNET_STAGING_ADMIN_PRIVATE_KEY (staging): 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
```

**Production** (future):
```
[EscrowProgramService] Loaded admin keypair from MAINNET_ADMIN_PRIVATE_KEY (production): <mainnet-address>
```

### Error Messages

If the variable is not set, you'll see a clear error:

**Development**:
```
[EscrowProgramService] Admin keypair not configured for development. Set DEVNET_ADMIN_PRIVATE_KEY
```

**Staging**:
```
[EscrowProgramService] Admin keypair not configured for staging. Set DEVNET_STAGING_ADMIN_PRIVATE_KEY
```

## Rollback Plan

If you need to rollback (unlikely):

1. **Revert code changes**:
   ```bash
   git revert <commit-hash>
   ```

2. **In DigitalOcean**:
   - Keep `DEVNET_STAGING_ADMIN_PRIVATE_KEY` but also add back `AUTHORITY_KEYPAIR`
   - The old code will use `AUTHORITY_KEYPAIR` first

3. **Deploy**:
   ```bash
   git push origin staging
   ```

## Related Files

- **Code**: `src/services/escrow-program.service.ts` (keypair loading logic)
- **Config**: `staging-app.yaml` (environment variable definition)
- **Docs**: `docs/deployment/AUTHORITY_KEYPAIR_EXPLAINED.md` (updated documentation)
- **Wallets**: `wallets/staging/devnet-staging-admin.json` (keypair file, gitignored)

## Testing Checklist

Before considering this complete:

- [ ] Code changes committed to `staging` branch
- [ ] `staging-app.yaml` updated with new variable name
- [ ] Documentation updated to reflect changes
- [ ] DigitalOcean environment variable `DEVNET_STAGING_ADMIN_PRIVATE_KEY` set
- [ ] Staging app redeployed
- [ ] Logs show correct keypair loaded from `DEVNET_STAGING_ADMIN_PRIVATE_KEY`
- [ ] E2E tests pass (can create/settle/cancel escrows)
- [ ] Old `AUTHORITY_KEYPAIR` variable removed from DigitalOcean (after verification)

## Summary

This refactoring eliminates redundancy and improves clarity by using environment-specific admin keypair variables. Each environment now has exactly one variable, selected automatically based on `NODE_ENV`, with clear naming that indicates its purpose.

---

**Status**: ✅ Refactoring Complete  
**Next Step**: Update DigitalOcean environment variable and deploy

