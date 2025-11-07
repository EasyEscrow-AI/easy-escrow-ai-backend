# Staging E2E Test Debug Analysis

**Date:** 2025-11-06  
**Test:** `tests/staging/e2e/01-nft-for-sol-happy-path.test.ts`  
**Issue:** Test fails at settlement - agreement reaches `BOTH_LOCKED` but never settles

## Root Cause Analysis

### Issue #1: Monitoring Service Not Reloading New Agreements (CRITICAL)

**Problem:**
- Monitoring service only loaded pending agreements **once** during startup
- Any agreements created after service startup were never monitored for deposits
- This caused deposits to never be detected, status never updated to `BOTH_LOCKED`, and settlement never triggered

**Evidence from Logs:**
```
[MonitoringOrchestrator] Health check: {
  solanaHealthy: true,
  monitoringRunning: true,
  monitoredAccounts: 0,  <-- NO AGREEMENTS BEING MONITORED
  restartCount: 0
}

[SettlementService] Checking for agreements ready to settle...
[SettlementService] Found 0 agreements ready to settle  <-- NO BOTH_LOCKED AGREEMENTS
```

**Fix Applied:**
1. Added `agreementReloadTimer` that periodically calls `loadPendingAgreements()` every 5 seconds
2. Ensures agreements created after service startup are picked up for monitoring
3. Timer is properly cleaned up on service stop

**Commit:** `56f3a6b` - "fix(monitoring): add periodic reload of pending agreements"

### Issue #2: Race Condition Between Agreement Creation and Deposit Detection

**Problem:**
- Agreement created → `reloadAgreements()` called immediately
- `loadPendingAgreements()` queries database and calls `monitorAccount()` for escrow PDA
- `subscribeToAccount()` starts WebSocket subscription (**async, takes time to establish**)
- If NFT/SOL deposits happen **before** WebSocket subscription is fully established, they are missed
- Fallback polling might catch them eventually, but creates unpredictable delays

**Timeline of Race Condition:**
```
Time    Event
------  -----
T+0s    Agreement created (AGR-MHMNPE98-X2KTACI0)
T+0s    reloadAgreements() called
T+0s    loadPendingAgreements() fetches from DB
T+0.1s  monitorAccount() called for escrow PDA
T+0.1s  subscribeToAccount() starts (async)
T+5s    NFT deposited by test
T+10s   SOL deposited by test
T+???   WebSocket subscription finally established (might be after deposits!)
```

**Fix Applied:**
1. Reduced periodic reload interval from 30 seconds to 5 seconds
2. This minimizes the window where deposits can be missed
3. Provides faster recovery if WebSocket subscription fails

**Commit:** `41794bc` - "perf(monitoring): reduce agreement reload interval from 30s to 5s"

## Additional Context

### How Deposit Detection Works

1. **Agreement Creation:**
   - `createAgreement()` stores agreement in database
   - Immediately calls `orchestrator.reloadAgreements()` (line 182 of agreement.service.ts)
   - This triggers `loadPendingAgreements()` which queries for `PENDING`, `NFT_LOCKED`, `USDC_LOCKED` agreements

2. **Monitoring Setup:**
   - For each agreement, calls `monitorAccount(escrowPda, agreementId, 'sol')`
   - Subscribes to escrow PDA via WebSocket: `solanaService.subscribeToAccount()`
   - Adds to `monitoredAccounts` map

3. **Deposit Detection (Primary Path):**
   - WebSocket receives account change notification
   - Calls `handleAccountChange()` → `handleSolAccountChange()`
   - `SolDepositService.handleSolAccountChange()` detects SOL deposit
   - Updates database: creates deposit record, sets status to `BOTH_LOCKED`

4. **Deposit Detection (Fallback):**
   - Polling timer runs every 30 seconds (configurable via `MONITORING_POLL_INTERVAL_MS`)
   - Calls `pollAccounts()` which fetches current account state
   - Processes any detected deposits

5. **Settlement:**
   - Settlement service polls every 3 seconds (staging) or 15 seconds (production)
   - Queries for agreements with `status = BOTH_LOCKED` and `expiry > now()`
   - Calls `executeSettlement()` for each ready agreement

### Why the Test Failed

1. **Pre-fix scenario:**
   - Agreement created at T+0
   - Monitoring service had 0 monitored accounts (never reloaded)
   - Deposits happened but were never detected (no monitoring)
   - Status remained `PENDING` instead of `BOTH_LOCKED`
   - Settlement service found 0 ready agreements
   - Test timed out after 90 seconds

2. **With fixes:**
   - Agreement created at T+0
   - Immediate reload starts monitoring
   - Even if WebSocket subscription is slow, periodic reload (every 5s) ensures monitoring starts
   - Deposits detected via WebSocket or fallback polling (max 30s delay)
   - Status updates to `BOTH_LOCKED`
   - Settlement service finds and processes agreement
   - Test should pass within 10-40 seconds

## Expiry Logic Validation

The user mentioned potential expiry logic issues. Analysis:

### Agreement Creation (agreement.service.ts:55-74)
```typescript
const expiryValidation = validateExpiry(expiryInput);
const expiryDate = expiryValidation.expiryDate;

// Add 60-second buffer to expiry
const EXPIRY_BUFFER_SECONDS = 60;
const expiryTimestamp = Math.floor(expiryDate.getTime() / 1000) + EXPIRY_BUFFER_SECONDS;
const bufferedExpiry = new Date(expiryDate.getTime() + EXPIRY_BUFFER_SECONDS * 1000);
```

**Adds 60 seconds to user-provided expiry**

### Settlement Validation (settlement.service.ts:234-248)
```typescript
private validateNotExpired(agreement: any): boolean {
  const now = new Date();
  const bufferTimeMs = 60000; // 1 minute buffer
  
  // Check if current time is before expiry (with buffer)
  const isValid = now.getTime() < agreement.expiry.getTime() - bufferTimeMs;
  
  return isValid;
}
```

**Subtracts 60 seconds from stored expiry for validation**

### Net Effect
- User provides: 1 hour expiry
- Stored in DB: 1 hour + 60s
- Settlement validation: DB expiry - 60s = **exactly 1 hour window**
- This is correct and not causing issues

### Test Configuration
```typescript
const expiry = new Date(Date.now() + 62 * 60 * 1000).toISOString(); // 62 minutes
```

**Test uses 62 minutes**, which provides plenty of buffer even with the staging validation quirks.

## Verification Steps

After deployment completes:

1. **Check monitoring is active:**
   ```bash
   curl https://easyescrow-backend-staging-mwx9s.ondigitalocean.app/health
   # Look for: monitoredAccounts > 0 after test starts
   ```

2. **Run the test:**
   ```bash
   npm run test:staging:e2e:nft-sol
   ```

3. **Expected timeline:**
   - Agreement created: T+0
   - NFT deposited: T+6s
   - SOL deposited: T+12s
   - Monitoring picks up agreement: T+0 to T+5s (immediate or next reload)
   - Deposits detected: Immediately or within 30s (polling)
   - Settlement triggered: Within 3s after BOTH_LOCKED
   - **Total time: 15-45 seconds** (down from never completing)

4. **Check server logs for:**
   - `[AgreementService] Started monitoring for agreement: AGR-...`
   - `[MonitoringService] Successfully monitoring sol account: ...`
   - `[SolDepositService] Both NFT and SOL deposited, updating status to BOTH_LOCKED`
   - `[SettlementService] Found 1 agreements ready to settle`
   - `[SettlementService] Successfully settled agreement ...`

## Related Files

- `src/services/monitoring.service.ts` - Monitoring service with fixes
- `src/services/agreement.service.ts` - Agreement creation with immediate monitoring trigger
- `src/services/settlement.service.ts` - Settlement polling and execution
- `src/services/sol-deposit.service.ts` - SOL deposit detection and status updates
- `tests/staging/e2e/01-nft-for-sol-happy-path.test.ts` - The failing test

## Commits

1. `56f3a6b` - fix(monitoring): add periodic reload of pending agreements
2. `41794bc` - perf(monitoring): reduce agreement reload interval from 30s to 5s

## Update: Monitoring Fixes Successful, New Issue Discovered

**Status:** ✅ Monitoring service fixed, ❌ New Solana program error discovered

After deployment, the test showed:
- ✅ Status correctly updates to `BOTH_LOCKED`
- ✅ Settlement service finds the agreement
- ✅ Settlement attempt is made
- ❌ Settlement fails with Solana program error: `sum of account balances before and after instruction do not match`

This is a **different issue** - the Solana program's `settle_v2` instruction is failing on-chain. This requires investigation of the on-chain program logic itself, not the backend monitoring service.

See: `docs/tasks/SOLANA_PROGRAM_SETTLEMENT_ERROR.md` for details on the new issue.

