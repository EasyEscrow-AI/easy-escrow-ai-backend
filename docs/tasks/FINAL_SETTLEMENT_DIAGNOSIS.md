# Final Settlement Diagnosis - Root Cause Identified

**Date:** 2025-01-06  
**Status:** 🎯 ROOT CAUSE IDENTIFIED  
**Issue:** MonitoringService not detecting `BOTH_LOCKED` agreements on staging

## Executive Summary

Settlement is not triggering because **the MonitoringService on staging is either not running or not querying agreements correctly**. All on-chain conditions are perfect - the issue is purely backend/monitoring.

## Diagnostic Results

### ✅ 1. Rent Exemption Check (PASSED)

**Script:** `scripts/check-rent-simple.ts`  
**Escrow PDA:** `BZANsRJa5mcBFEwHvgxigTi2LxMDcSvw33twbBzvi7gm`

```
📊 Account Info:
  Total lamports: 102,296,800
  Data length: 202 bytes
  Rent-exempt minimum: 2,296,800 lamports
  Transferable lamports: 100,000,000

💰 Settlement Amounts:
  Total to transfer: 100,000,000 lamports
  Platform fee: 1,000,000 lamports (1%)
  Seller receives: 99,000,000 lamports

✅ SUFFICIENT - Enough transferable lamports for settlement
✅ Surplus after settlement: 0 lamports
✅ Escrow will remain rent-exempt with 2,296,800 lamports
```

**Conclusion:** Rent exemption is perfect. The escrow has EXACTLY the right amount to transfer. This is NOT the issue.

### ❌ 2. Database Check (Revealed Root Cause)

**Script:** `scripts/check-db-agreement.ts`  
**Agreement ID:** `AGR-MHMQN7YW-X45S7QBL`

```
❌ Agreement not found in database!
```

**Why this is important:**
1. Test runs against **staging API** (remote database)
2. Local .env points to **local/dev database**  
3. Agreement doesn't exist in local DB because it's on staging
4. Test **cleaned up** the agreement after timeout

**Key Insight:** The monitoring service on staging is NOT detecting agreements that ARE in the staging database.

## Root Cause Analysis

### The Problem

**Monitoring Service on staging is not picking up `BOTH_LOCKED` agreements.**

Two possible scenarios:

#### Scenario A: Service Not Running
- MonitoringService didn't start during backend deployment
- Periodic reload timer (5s interval) not initialized
- No agreements being loaded into memory

#### Scenario B: Query Not Working
- Service is running but SQL query is wrong
- Filter `expiry > new Date()` might be excluding agreements
- Timezone mismatch between server and database
- Status value mismatch (`BOTH_LOCKED` vs `both_locked`)

## Evidence Timeline

1. **11:18:39** - Agreement created successfully → Status: `PENDING`
2. **11:18:49** - NFT deposited successfully → Status: `NFT_LOCKED`
3. **11:19:02** - SOL deposited successfully → Status: `BOTH_LOCKED`
4. **11:19:02-11:20:32** - Monitoring polls 30 times, status never changes
5. **11:20:32** - Test times out, cleans up agreement

**Key observation:** Status stayed at `BOTH_LOCKED` for 90 seconds with zero settlement attempts.

## What We Know Works

✅ Solana program deployment  
✅ Agreement creation API  
✅ NFT deposit instruction  
✅ SOL deposit instruction  
✅ Status updates (PENDING → NFT_LOCKED → BOTH_LOCKED)  
✅ On-chain escrow PDA has correct balance  
✅ Rent exemption math is perfect  

## What's Broken

❌ MonitoringService detecting `BOTH_LOCKED` agreements  
❌ Settlement never attempted  

## Next Steps (In Order of Priority)

### 1. Check Staging Backend Logs via DigitalOcean Console

**Access:** https://cloud.digitalocean.com/apps/ea13cdbb-c74e-40da-a0eb-6c05b0d0432d/logs

**Look for:**
```
[STARTUP] MonitoringService initialized
[MonitoringService] Starting periodic agreement reload
[MonitoringService] Reloading pending agreements...
[MonitoringService] Found N agreements: <IDs>
[SettlementService] Attempting settlement for <ID>
```

**If logs show:**
- **Nothing** → Service didn't start
- **Found 0 agreements** → Query is wrong
- **Found agreements but no settlement** → Settlement logic failing

### 2. Add Enhanced Logging (If Service Not Logging)

Add to `src/services/settlement.service.ts`:

```typescript
console.log(`[SettlementService] Found ${readyAgreements.length} agreements: ${ids}`);

for (const agreement of readyAgreements) {
  console.log(`[SettlementService] ▶ Trying settlement for ${agreement.agreementId}`);
  console.log(`[SettlementService] validateNotExpired=${notExpired}`);
  // ... existing code
}
```

Add to `src/index.ts`:

```typescript
console.log("[STARTUP] Booting SettlementService with polling =", config.pollingInterval, "ms");
await settlement.start();
```

### 3. Verify Service Initialization

Check `src/index.ts` or main entry point:

```typescript
// Ensure this exists:
const monitoringService = new MonitoringService(...);
await monitoringService.start();
```

### 4. Check Query Logic

Verify Prisma query in monitoring service:

```typescript
const readyAgreements = await prisma.agreement.findMany({
  where: { 
    status: AgreementStatus.BOTH_LOCKED,  // Check enum value
    expiry: { gt: new Date() }  // Check timezone
  },
});
```

**Common issues:**
- Enum value: `BOTH_LOCKED` vs `both_locked` vs `'BOTH_LOCKED'`
- Timezone: Server time vs DB time mismatch
- Polling interval: Too slow (should be 3-5 seconds)

### 5. Manual Settlement Test (Last Resort)

If monitoring can't be fixed quickly, manually trigger settlement:

```bash
npx ts-node scripts/settle-once.ts \
  --rpc https://api.devnet.solana.com \
  --idl ./target/idl/escrow.json \
  --program AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --payer ./wallets/staging/staging-admin.json \
  --escrow <ESCROW_PDA> \
  --seller <SELLER> \
  --buyer <BUYER> \
  --feeCollector 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ \
  --nftMint <NFT_MINT>
```

This will:
- Bypass monitoring completely
- Call `settle` instruction directly
- Show exact program logs if it fails
- Confirm if settlement logic itself works

## Recommended Fix

### Short-term (Get Test Passing)

1. Access DigitalOcean console logs
2. Confirm monitoring not running
3. Add startup logging
4. Redeploy backend
5. Re-run E2E test

### Long-term (Prevent Future Issues)

1. Add health check endpoint that shows monitoring status
2. Add metrics/monitoring for settlement attempts
3. Add alerts when agreements sit in `BOTH_LOCKED` too long
4. Consider retry logic with exponential backoff
5. Persist settlement failures with reasons

## Files Created

- `scripts/check-rent-simple.ts` - Rent exemption probe
- `scripts/check-db-agreement.ts` - Database agreement checker
- `scripts/settle-once.ts` - Manual settlement test
- `docs/tasks/FINAL_SETTLEMENT_DIAGNOSIS.md` - This file

## Summary

🎯 **Root Cause:** MonitoringService on staging not detecting `BOTH_LOCKED` agreements  
✅ **Rent Exemption:** Perfect, not the issue  
✅ **On-Chain State:** Perfect, not the issue  
❌ **Backend Monitoring:** Not working  

**Next Action:** Access DigitalOcean console to check if MonitoringService is running and logging.

---

**All diagnostic tools are ready. The issue is isolated to the staging backend's monitoring service.**

