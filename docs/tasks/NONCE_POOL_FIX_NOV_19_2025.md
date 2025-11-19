# Nonce Pool Configuration Fix - November 19, 2025

## 🚨 Issue

Nonce account creation was failing with:
```
Error processing Instruction 0: invalid account data for instruction
```

**Root Cause:** The `NoncePoolManager` was using generic config defaults (`maxConcurrentCreations: 5`) instead of the staging-specific config (`maxConcurrentCreations: 1`).

This caused:
- **5 concurrent nonce creations** overwhelming the RPC
- **Rate limiting** from QuickNode
- **"invalid account data" errors** due to transaction conflicts
- **Pool initialization failures** (0/10 nonce accounts created successfully)

---

## ✅ Fix Applied

**File:** `src/services/noncePoolManager.ts`

**Changes:**
1. Changed `NoncePoolManager` constructor to use `getEnvironmentConfig()` by default instead of `getNoncePoolConfig()`
2. This ensures staging automatically uses the staging-specific config with `maxConcurrentCreations: 1`
3. Added `maxConcurrentCreations` to initialization log for visibility

```typescript
// Before (❌ Wrong)
this.config = config ? { ...getNoncePoolConfig(), ...config } : getNoncePoolConfig();

// After (✅ Correct)
const baseConfig = getEnvironmentConfig(process.env.NODE_ENV);
this.config = config ? { ...baseConfig, ...config } : baseConfig;
```

---

## 📊 Expected Behavior After Fix

### Nonce Creation (Sequential)
```
[NoncePoolManager] Creating batch 1/2 (5 accounts)
[NoncePoolManager] Creating nonce account: xxx... (1 of 5)
[NoncePoolManager] Account creation tx: sig...
[NoncePoolManager] Nonce initialization tx: sig...
✅ Successfully created nonce account
[NoncePoolManager] Creating nonce account: yyy... (2 of 5)
...
```

**Key Indicators of Success:**
- ✅ Nonces created **one at a time** (not 5 simultaneously)
- ✅ Each nonce has **two transaction signatures** (create + initialize)
- ✅ **Zero failures** with "invalid account data" errors
- ✅ **10/10 nonce accounts created successfully**
- ✅ Logs show: `Successfully created 10/10 nonce accounts`

---

## 🔍 Monitoring

### Watch for These Logs

**✅ Good:**
```
[NoncePoolManager] Initialized with config: {
  minPoolSize: 10,
  maxPoolSize: 50,
  maxConcurrentCreations: 1,  <-- Should be 1 for staging
  environment: 'staging'
}
[NoncePoolManager] Successfully created 10/10 nonce accounts
```

**❌ Bad:**
```
[NoncePoolManager] Failed to create nonce account (attempt 1): SendTransactionError
[NoncePoolManager] Successfully created 0/10 nonce accounts  <-- Failures
```

### Health Check
```bash
curl https://easyescrow-backend-staging-c3n2e.ondigitalocean.app/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-19T...",
  "uptime": 123,
  "environment": "staging"
}
```

---

## 🎯 Configuration Reference

### Staging Config (Active)
```typescript
export const STAGING_CONFIG: NoncePoolConfig = {
  minPoolSize: 10,
  maxPoolSize: 50,
  replenishmentThreshold: 15,
  replenishmentBatchSize: 5,
  maxConcurrentCreations: 1,  // ⭐ Key setting
  environment: 'staging',
};
```

### Environment Variables (DigitalOcean)
- `NODE_ENV=staging` ✅ Set
- `NONCE_MAX_CONCURRENT_CREATIONS` ❌ Not needed (using code config)

---

## 🐛 If Issues Persist

If nonce creation still fails after this fix:

### 1. Check RPC Rate Limits
```bash
# Test QuickNode RPC
curl -X POST https://red-quaint-wind.solana-devnet.quiknode.pro/... \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

### 2. Check Platform Authority SOL Balance
```bash
# Need enough SOL for rent-exempt nonce accounts
# Each nonce: ~0.00089784 SOL
# 10 nonces: ~0.0089784 SOL minimum
solana balance 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R --url devnet
```

### 3. Verify Two-Transaction Logic
The fix from earlier ensures nonce creation uses two separate transactions:
1. **Transaction 1:** Create the account
2. **Transaction 2:** Initialize as nonce account

Both should appear in logs with separate signatures.

### 4. Manual Nonce Pool Check
```sql
SELECT COUNT(*), status 
FROM nonce_pool 
GROUP BY status;
```

Expected after successful initialization:
```
 count | status
-------+----------
    10 | AVAILABLE
```

---

## 📝 Related Changes

- **PR #251**: Two-transaction nonce creation fix ✅ Merged
- **PR #252**: Database cleanup and Docker rebuild ✅ Merged
- **This Fix**: Environment-specific config usage 🚀 Deploying

---

## 🚀 Deployment

**Commit:** `d799ff5`  
**Branch:** `staging`  
**Deployed:** 2025-11-19 ~06:40 UTC  
**Next Check:** Monitor logs for successful nonce pool initialization

---

## ✅ Success Criteria

1. ✅ Nonces created sequentially (one at a time)
2. ✅ Zero "invalid account data" errors
3. ✅ 10/10 nonce accounts created successfully
4. ✅ Health check returns 200 OK
5. ✅ Server stays healthy (no 503 errors)

**Once these are confirmed, the atomic swap MVP will be fully operational! 🎉**

