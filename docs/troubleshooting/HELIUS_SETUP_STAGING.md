# Setting Up Helius for Staging cNFT Support

**Date:** December 1, 2025  
**Environment:** Staging (Devnet)  
**Issue:** QuickNode endpoint doesn't have DAS API enabled  
**Solution:** Use Helius for both RPC and DAS API

---

## ⚠️ IMPORTANT: Use `SOLANA_RPC_URL`, NOT `HELIUS_RPC_URL`

The backend code looks for **`SOLANA_RPC_URL`**, not `HELIUS_RPC_URL`.

### ❌ WRONG:
```bash
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=5a8c5d8d-15c2-4dc3-8ceb-109cd9baa8b8
```

### ✅ CORRECT:
```bash
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=5a8c5d8d-15c2-4dc3-8ceb-109cd9baa8b8
```

---

## DigitalOcean Configuration

### Environment Variables to SET:

```bash
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=5a8c5d8d-15c2-4dc3-8ceb-109cd9baa8b8
```

### Environment Variables to REMOVE (not needed):

```bash
HELIUS_RPC_URL           # ← Not used by code, remove this
CNFT_INDEXER_API_URL     # ← Not needed with Helius
CNFT_INDEXER_API_KEY     # ← Not needed with Helius
```

---

## How It Works

### Code Logic:

```typescript
// src/config/index.ts
solana: {
  rpcUrl: process.env.SOLANA_RPC_URL || 'http://localhost:8899',
  // ↑ The code reads SOLANA_RPC_URL
}

// src/config/atomicSwap.config.ts
const DEFAULT_CNFT_CONFIG: CNFTIndexerConfig = {
  apiUrl: '', // Empty = use SOLANA_RPC_URL for DAS API
  apiKey: '', // Empty = auth is in URL
}
```

When `CNFT_INDEXER_API_URL` is empty (or not set):
- Backend uses `SOLANA_RPC_URL` for **both** regular RPC **and** DAS API calls
- Helius supports both on the same endpoint ✓

---

## Steps to Fix

### 1. Update DigitalOcean Environment Variables

1. Go to: https://cloud.digitalocean.com/apps
2. Select: `easyescrow-backend-staging`
3. Navigate to: **Settings → Environment Variables**
4. **Update** `SOLANA_RPC_URL`:
   ```
   https://devnet.helius-rpc.com/?api-key=5a8c5d8d-15c2-4dc3-8ceb-109cd9baa8b8
   ```
5. **Remove** these (if they exist):
   - `HELIUS_RPC_URL`
   - `CNFT_INDEXER_API_URL`
   - `CNFT_INDEXER_API_KEY`
6. **Save** changes
7. **Redeploy** the app (should take ~5 minutes)

---

### 2. Verify the Fix

After redeployment completes, run smoke test:

```powershell
npm run staging:smoke-test-rpc
```

**Expected Output:**
```
✅ Test 1: Backend Health Check
   Backend is responsive (XXXms)
   Status: healthy

✅ Test 2: Load Test cNFT Config
   Config loaded successfully

✅ Test 3: Backend DAS API - Fetch cNFT Asset
   Backend fetched cNFT in <1000ms

✅ Test 4: RPC Configuration
   Backend is using Helius RPC with DAS API

✅ ALL TESTS PASSED!
```

---

### 3. Run cNFT E2E Test

Once smoke test passes, verify cNFT swaps work:

```powershell
npm run test:staging:e2e:atomic:cnft-for-sol
```

**Should now pass** (assuming cNFT indexing is complete).

---

## Why This Fix Works

### **Before (QuickNode without DAS API):**
```
SOLANA_RPC_URL = QuickNode endpoint
                    ↓
    Backend tries to call DAS API
                    ↓
         QuickNode: "Method not found"
                    ↓
              TIMEOUT (10s)
```

### **After (Helius with DAS API):**
```
SOLANA_RPC_URL = Helius endpoint
                    ↓
    Backend calls DAS API
                    ↓
      Helius: Returns cNFT data
                    ↓
           SUCCESS (<1s)
```

---

## Helius vs QuickNode

| Feature | Helius | QuickNode |
|---------|--------|-----------|
| **Devnet RPC** | ✅ Free | ✅ Free |
| **DAS API** | ✅ Included | ❌ Requires paid add-on |
| **Speed** | Fast | Fast |
| **Cost** | $0 (devnet) | $0 (devnet) + $$ (DAS add-on) |

**For staging/devnet:** Helius is better (free DAS API)  
**For production/mainnet:** Either works (both require payment)

---

## Troubleshooting

### Issue: Smoke test still fails after update

**Check:**
1. Verify `SOLANA_RPC_URL` is set correctly (not `HELIUS_RPC_URL`)
2. Ensure redeployment completed (check DigitalOcean logs)
3. Wait 2-3 minutes after deployment for services to restart
4. Check backend logs for startup errors

**Re-run smoke test:**
```powershell
npm run staging:smoke-test-rpc
```

---

### Issue: cNFT E2E test still fails

**Possible causes:**
1. **cNFT not fully indexed yet**
   - Wait 10-15 more minutes
   - Run: `npm run staging:verify-cnft-indexed`
   - Should show asset fetch <1s and consistent proofs

2. **Different issue**
   - Check test output for specific error
   - May be wallet issue, nonce issue, or other

---

## API Key Security

⚠️ **Note:** The Helius API key is in the URL query parameter:
```
?api-key=5a8c5d8d-15c2-4dc3-8ceb-109cd9baa8b8
```

**This is normal and expected for Helius.** The key is:
- ✅ Encrypted in transit (HTTPS)
- ✅ Stored securely in DigitalOcean Secrets
- ✅ Only for devnet (low risk)

For production:
- Use a separate Helius mainnet key
- Consider IP restrictions (if Helius supports it)
- Monitor usage for anomalies

---

## Next Steps

After verification:

1. ✅ Smoke test passes
2. ✅ cNFT indexing complete
3. ✅ E2E test passes
4. ✅ Update security audit report
5. ✅ Complete Task 9 (monitoring)
6. ✅ Re-run full staging test suite
7. ✅ Prepare for production deployment

---

## Related Documentation

- `docs/ATOMIC_SWAP_ENVIRONMENT_VARIABLES.md` - Full env var reference
- `docs/QUICKNODE_CNFT_INTEGRATION.md` - QuickNode DAS API info
- `docs/security/STAGING_SECURITY_AUDIT_2025-12-01.md` - Security audit
- `docs/troubleshooting/STAGING_RPC_URL_QUOTES_ISSUE.md` - Quote issue

---

**Status:** 🟡 **Pending DigitalOcean Update**  
**ETA:** ~10 minutes (5 min redeploy + 5 min verification)  
**Priority:** 🔥 **CRITICAL** - Blocks all cNFT functionality

