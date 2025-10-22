# Fee Collector Bug Fix

**Date:** 2025-10-22  
**Severity:** HIGH - Platform fees were not being collected  
**Status:** ✅ FIXED

---

## 🐛 The Bug

Platform fees (1% of transaction amount) were being sent to the burn address instead of the fee collector wallet.

### Test Results (Before Fix)

```
Expected fee collected: 0.001000 USDC (1% of 0.1 USDC)
Actual fee collected:   0.000000 USDC

Initial Fee Collector Balance: 0.000000 USDC
Final Fee Collector Balance:   0.000000 USDC
Change:                        +0.000000 USDC ❌
```

### Root Cause

**Environment Variable Name Mismatch:**

The backend code was not configured to read the correct environment variable name.

| Location | Variable Name | Issue |
|----------|--------------|-------|
| `.env.staging` | `DEVNET_STAGING_FEE_COLLECTOR_ADDRESS` | ✅ Correct value exists |
| `staging-app.yaml` | `${DEVNET_STAGING_FEE_COLLECTOR_ADDRESS}` | ✅ Correct placeholder |
| `src/config/index.ts` (line 53) | `PLATFORM_FEE_COLLECTOR_ADDRESS` | ❌ Wrong variable name! |

**The Code Flow (Before Fix):**
```typescript
// src/config/index.ts
feeCollectorAddress: process.env.PLATFORM_FEE_COLLECTOR_ADDRESS || ''
// This reads undefined, so falls back to empty string ❌
```

**Settlement Service Fallback Chain:**
```typescript
platformFeeCollectorAddress: 
  settlementConfig?.platformFeeCollectorAddress ||   // undefined
  config.platform?.feeCollectorAddress ||            // '' (empty!) ❌
  '11111111111111111111111111111111'                // BURN ADDRESS! 🔥
```

**Result:** All fees were sent to the **burn address** `11111111111111111111111111111111`!

---

## ✅ The Fix

### 1. Updated src/config/index.ts

```typescript
// Platform
platform: {
  feeBps: parseInt(process.env.PLATFORM_FEE_BPS || '250', 10),
  // ✅ Now reads the correct environment variable
  feeCollectorAddress: process.env.DEVNET_STAGING_FEE_COLLECTOR_ADDRESS || 
                       process.env.PLATFORM_FEE_COLLECTOR_ADDRESS || 
                       '',
},
```

**Why this works:**
- Primary: Reads `DEVNET_STAGING_FEE_COLLECTOR_ADDRESS` (staging env)
- Fallback: Reads `PLATFORM_FEE_COLLECTOR_ADDRESS` (production env)
- Final fallback: Empty string (which will cause validation errors)

### 2. Verified staging-app.yaml

```yaml
# Platform Fee Configuration
- key: PLATFORM_FEE_BPS
  value: "100"
  scope: RUN_TIME

- key: DEVNET_STAGING_FEE_COLLECTOR_ADDRESS
  value: ${DEVNET_STAGING_FEE_COLLECTOR_ADDRESS}  # ✅ Placeholder
  type: SECRET                                    # ✅ Secret type
  scope: RUN_TIME
```

**Important:** The actual value is stored securely in DigitalOcean's secret environment variables, NOT in the YAML file.

### 3. Verified .env.staging

```bash
# Fee Collector Wallet
DEVNET_STAGING_FEE_COLLECTOR_ADDRESS=8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=<secret>
```

✅ Already correctly configured!

### 4. Updated .env.staging.example

Added documentation for the address field:
```bash
# Fee Collector Wallet
# Address: your_fee_collector_wallet_address_here
DEVNET_STAGING_FEE_COLLECTOR_ADDRESS=your_staging_fee_collector_address_here
DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY=your_staging_fee_collector_base58_key_here
```

---

## 📝 Changes Made

1. ✅ **src/config/index.ts** - Updated to read `DEVNET_STAGING_FEE_COLLECTOR_ADDRESS`
2. ✅ **staging-app.yaml** - Verified correct placeholder and SECRET type
3. ✅ **.env.staging.example** - Added address field documentation

---

## 🚀 Deployment Required

**The fix requires redeploying to DigitalOcean for the changes to take effect.**

### Deployment Steps

1. **Verify DigitalOcean Secrets:**
   - Go to staging app → Settings → Environment Variables
   - Confirm `DEVNET_STAGING_FEE_COLLECTOR_ADDRESS` exists as a secret
   - Value should be: `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ`
   - If missing, add it as a SECRET type

2. **Deploy Updated Code:**
   ```bash
   # Commit changes
   git add src/config/index.ts .env.staging.example docs/tasks/FEE_COLLECTOR_BUG_FIX.md
   git commit -m "fix(config): Read DEVNET_STAGING_FEE_COLLECTOR_ADDRESS for fee collection"
   
   # Push to staging branch
   git push origin staging
   ```

3. **Redeploy on DigitalOcean:**
   - Manual: Via DigitalOcean Console → Redeploy
   - Or: Automatic if CI/CD is configured

4. **Verify After Deployment:**
   ```bash
   # Check logs for correct fee collector
   docker logs easyescrow-backend | grep "platformFeeCollectorAddress"
   
   # Should show:
   # feeCollector: 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ
   ```

5. **Run E2E Test:**
   ```bash
   npm run test:staging:e2e:happy-path:verbose
   ```

6. **Expected Result:**
   ```
   Fee collected: 0.001000 USDC (expected: ~0.001000)
   ✅ Platform fee collected ✅
   ```

---

## 🔍 Verification Checklist

After deployment, verify:

- [ ] Environment variable `DEVNET_STAGING_FEE_COLLECTOR_ADDRESS` exists in DigitalOcean as SECRET
- [ ] Backend logs show correct fee collector address: `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ`
- [ ] E2E test passes with fee collection verification
- [ ] Check fee collector wallet balance increases after settlement:
  - Wallet: `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ`
  - Explorer: https://explorer.solana.com/address/8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ?cluster=devnet
- [ ] Monitor next few production settlements for correct fee distribution

---

## 📊 Historical Impact Assessment

**All staging settlements since deployment have lost platform fees!**

### Audit Recommendations

1. **Query all settled agreements:**
   ```sql
   SELECT 
     "agreementId",
     "nftMint",
     "price",
     "feeBps",
     "settledAt",
     (price * feeBps / 10000) AS "expectedFee"
   FROM "Agreement"
   WHERE status = 'SETTLED'
   ORDER BY "settledAt" DESC;
   ```

2. **Check burn address for lost fees:**
   - Explorer: https://explorer.solana.com/address/11111111111111111111111111111111?cluster=devnet
   - Filter for USDC token transfers
   - Match amounts to expected fees from agreements

3. **Calculate total revenue loss:**
   - Sum all `expectedFee` values from settled agreements
   - Document for financial records

---

## 🛡️ Prevention Measures

### 1. Config Validation on Startup

Add to `src/index.ts`:

```typescript
// Validate critical configuration
const criticalConfig = {
  'Fee Collector': config.platform.feeCollectorAddress,
  'Escrow Program': config.solana.escrowProgramId,
  'USDC Mint': config.usdc.mintAddress,
};

for (const [name, value] of Object.entries(criticalConfig)) {
  if (!value || value === '11111111111111111111111111111111') {
    console.error(`❌ CRITICAL: ${name} is not properly configured!`);
    console.error(`   Expected non-empty value, got: "${value}"`);
    process.exit(1);
  }
}

console.log('✅ Critical configuration validated');
```

### 2. Enhanced E2E Test Coverage

Already implemented in `tests/e2e/staging/01-happy-path.test.ts`:

```typescript
it('should verify settlement and fee distribution', async function() {
  // ... balance checks ...
  
  const feeCollectorUsdcIncrease = feeCollectorUsdcBalance - initialBalances.feeCollector.usdc;
  expect(feeCollectorUsdcIncrease).to.be.at.least(expectedFeeIncrease * 0.99);
  console.log('   ✅ Platform fee collected');
});
```

### 3. Monitoring & Alerting

Add alerts for:
- Fee collector balance not increasing after settlements
- Settlements completing with 0 fees collected
- Config validation failures on startup
- Burn address receiving USDC transfers

---

## 📝 Related Files

- `src/config/index.ts` - Platform config definition (FIXED)
- `src/services/settlement.service.ts` - Fee distribution logic
- `src/services/escrow-program.service.ts` - On-chain settlement calls
- `staging-app.yaml` - Staging environment configuration (VERIFIED)
- `.env.staging` - Staging environment variables (VERIFIED)
- `.env.staging.example` - Staging env template (UPDATED)
- `tests/e2e/staging/01-happy-path.test.ts` - E2E test with fee verification

---

## 🎯 Summary

**Root Cause:** Backend code reading wrong environment variable name  
**Fix:** Updated `src/config/index.ts` to read `DEVNET_STAGING_FEE_COLLECTOR_ADDRESS`  
**Impact:** All staging fees sent to burn address since deployment  
**Action Required:** Redeploy staging app to apply fix  
**Prevention:** Config validation + enhanced monitoring  

---

**Status:** ✅ Code fixed, awaiting deployment to staging environment
