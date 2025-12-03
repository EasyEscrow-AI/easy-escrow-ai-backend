# Staging RPC URL Quotes Issue

**Issue:** DAS API calls timing out on staging backend  
**Root Cause:** `SOLANA_RPC_URL` environment variable has quotes around the value  
**Impact:** cNFT operations fail (asset fetching, proof retrieval)

---

## Problem

When the environment variable is set like this in DigitalOcean:

```
SOLANA_RPC_URL="https://red-quaint-wind.solana-devnet.quiknode.pro/7306a6f82b57d473dd2bb175986828be9c121355"
```

Node.js reads it as:
```javascript
process.env.SOLANA_RPC_URL === '"https://red-quaint-wind.solana-devnet.quiknode.pro/7306a6f82b57d473dd2bb175986828be9c121355"'
// ^-- Literal quote characters included!
```

This makes the URL **invalid** when passed to HTTP clients or Solana Connection.

---

## Symptoms

1. Health endpoint works fine (doesn't use DAS API)
2. DAS API calls timeout after 10 seconds
3. cNFT asset fetching fails
4. Smoke test shows: `❌ DAS API - Fetch Asset: timeout of 10000ms exceeded`

---

## Solution

### Option 1: Remove Quotes in DigitalOcean (Recommended)

1. Go to: https://cloud.digitalocean.com/apps
2. Select: `easyescrow-backend-staging`
3. Settings → Environment Variables
4. Find: `SOLANA_RPC_URL`
5. Update value to (NO QUOTES):
   ```
   https://red-quaint-wind.solana-devnet.quiknode.pro/7306a6f82b57d473dd2bb175986828be9c121355
   ```
6. Save and redeploy

### Option 2: Add Quote Stripping in Code (Fallback)

Add to `src/config/index.ts`:

```typescript
solana: {
  rpcUrl: (process.env.SOLANA_RPC_URL || 'http://localhost:8899').replace(/^["']|["']$/g, ''),
  // Strip leading/trailing quotes
  // ...
}
```

**Recommendation:** Use Option 1 (fix at source) rather than adding workarounds in code.

---

## Verification

After fixing, run:

```powershell
npm run staging:smoke-test-rpc
```

**Expected output:**
```
✅ DAS API - Fetch Asset: Backend fetched cNFT in <1000ms
✅ RPC Configuration: Backend is using QuickNode RPC
```

---

## Why This Happens

### **DigitalOcean Environment Variables**

DigitalOcean's environment variable UI doesn't require quotes, but if you add them:
- They're treated as **literal characters**
- Not stripped by the system
- Passed directly to Node.js

### **Local `.env` Files**

In `.env` files, quotes ARE optional:
```bash
# Both work the same locally:
SOLANA_RPC_URL=https://example.com
SOLANA_RPC_URL="https://example.com"
```

Because `dotenv` package strips quotes automatically.

### **DigitalOcean App Platform**

Does NOT strip quotes - treats them as part of the value.

---

## Related Issues

This same issue could affect:
- `STAGING_API_URL` (seen earlier with Invalid URL error)
- Any URL environment variables
- Database connection strings
- API keys (though less likely to cause issues)

---

## Prevention

### **Rule for DigitalOcean Environment Variables:**

❌ **DON'T:**
```
SOLANA_RPC_URL="https://example.com"
DATABASE_URL="postgresql://..."
```

✅ **DO:**
```
SOLANA_RPC_URL=https://example.com
DATABASE_URL=postgresql://...
```

**Exception:** Only use quotes if the value contains spaces or special characters that need escaping.

---

## Testing

To verify the fix worked:

1. **Smoke Test:**
   ```powershell
   npm run staging:smoke-test-rpc
   ```

2. **Health Check:**
   ```powershell
   curl https://staging-api.easyescrow.ai/health
   ```

3. **cNFT E2E Test:**
   ```powershell
   npm run test:staging:e2e:atomic:cnft-for-sol
   ```

4. **Manual Verification:**
   ```powershell
   # Check logs on DigitalOcean
   # Look for successful DAS API calls
   ```

---

## Timeline

- **Issue Identified:** December 1, 2025
- **Root Cause:** Environment variable quotes
- **Fix Time:** ~5 minutes (remove quotes + redeploy)
- **Verification:** ~5 minutes (run smoke test)

**Total Downtime:** ~10 minutes

---

## Lessons Learned

1. **Always check for quotes** in cloud platform environment variables
2. **Local testing with .env files may not catch this** (dotenv strips quotes)
3. **Add quote stripping logic** for critical URLs (defense in depth)
4. **Document platform-specific quirks** (DigitalOcean vs Heroku vs AWS)

---

## Action Items

- [ ] Remove quotes from `SOLANA_RPC_URL` on DigitalOcean
- [ ] Redeploy staging backend
- [ ] Run smoke test to verify
- [ ] Check all other env vars for quotes
- [ ] Update deployment documentation with this warning
- [ ] Consider adding quote-stripping logic for URLs

---

**Status:** 🔴 **BLOCKED** - Requires DigitalOcean env var update  
**Priority:** 🔥 **CRITICAL** - Blocks all cNFT functionality  
**Owner:** User (needs DigitalOcean access)

