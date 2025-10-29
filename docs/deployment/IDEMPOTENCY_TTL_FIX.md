# Idempotency TTL Fix & Stuck Agreement Monitoring

**Date:** October 29, 2025  
**Priority:** 🟡 HIGH (Follow-up to Critical Jito Fix)  
**Status:** ✅ IMPLEMENTED - Ready for Deployment

---

## Executive Summary

This fix addresses a **secondary issue** discovered during production settlement testing: failed settlements create idempotency keys with a 24-hour TTL, **permanently blocking** retry attempts and leaving agreements stuck in `BOTH_LOCKED` status.

Additionally, this implements **monitoring and alerting** for stuck agreements to detect similar issues in the future.

---

## The Idempotency Problem

### Issue Description

When a settlement fails (e.g., due to Jito tip error), the system:
1. ✅ Correctly creates an idempotency key to prevent retry storms
2. ❌ **Uses 24-hour TTL for failed settlements** (same as successful ones)
3. ❌ **Blocks all future retry attempts** for 24 hours
4. ❌ Agreement remains **permanently stuck** in `BOTH_LOCKED` status

### Evidence from Production Logs

```log
Oct 29 01:05:23  [SettlementService] Settlement already processed for AGR-MHBA1NWT-AKNZTRGQ, skipping
Oct 29 01:05:38  [SettlementService] Found 1 agreements ready to settle
Oct 29 01:05:38  [IdempotencyService] Duplicate request detected for key: settlement_AGR-MHBA1NWT-AKNZTRGQ
Oct 29 01:05:38  [SettlementService] Settlement already processed, skipping
Oct 29 01:05:38  [SettlementService] Failed to settle: Transaction must write lock at least one tip account
```

The settlement job found the agreement every 15 seconds, but idempotency blocked every retry attempt.

### Root Cause

The idempotency service uses a **single TTL configuration** for both successful and failed operations:

```typescript
// Before fix - Same TTL for all operations
expirationHours: 24  // 24 hours for EVERYTHING
```

This design prevents:
- ✅ Double-processing of successful settlements (good!)
- ❌ Retry of failed settlements (bad!)

---

## The Solution

### 1. Different TTL for Failed Settlements ⭐

**Implementation:**
- Added `storeIdempotencyWithTTL()` method with optional custom TTL parameter
- Failed settlements now use **5-minute TTL** instead of 24 hours
- Successful settlements continue using 24-hour TTL

**Files Changed:**
- `src/services/idempotency.service.ts` (lines 180-249)
- `src/services/settlement.service.ts` (lines 517-538)

**Configuration:**
```typescript
const FAILED_SETTLEMENT_TTL_SECONDS = 300; // 5 minutes

await idempotencyService.storeIdempotencyWithTTL(
  idempotencyKey,
  'SETTLEMENT',
  { agreementId: agreement.agreementId, operation: 'settle' },
  500,
  errorResult,
  FAILED_SETTLEMENT_TTL_SECONDS  // Custom TTL
);
```

### 2. Stuck Agreement Monitoring

**New Service:** `StuckAgreementMonitorService`

**Features:**
- **Automatic detection** of agreements stuck in `BOTH_LOCKED` status
- **Warning alerts** at 10 minutes stuck time
- **Critical alerts** at 30 minutes stuck time
- **Configurable thresholds** for different environments
- **Alert callbacks** for integration with Slack/PagerDuty/etc.

**Files Created:**
- `src/services/stuck-agreement-monitor.service.ts` (new file)

**Integration:**
- Added to `src/index.ts` startup/shutdown sequence
- Runs every 1 minute checking for stuck agreements
- Console logging with severity indicators (⚠️  WARNING, 🔴 CRITICAL)

---

## Technical Details

### IdempotencyService Enhancement

**New Method: `storeIdempotencyWithTTL()`**

```typescript
async storeIdempotencyWithTTL(
  idempotencyKey: string,
  endpoint: string,
  requestBody: any,
  responseStatus: number,
  responseBody: any,
  customTTLSeconds?: number  // New optional parameter
): Promise<void>
```

**Behavior:**
- If `customTTLSeconds` is provided: Uses custom TTL (for failures)
- If `customTTLSeconds` is undefined: Uses default 24-hour TTL (for successes)
- Logs TTL configuration for debugging

**Backwards Compatibility:**
- Original `storeIdempotency()` method maintained
- Internally calls `storeIdempotencyWithTTL()` without custom TTL
- All existing code continues to work unchanged

### StuckAgreementMonitorService API

**Configuration:**
```typescript
interface MonitorConfig {
  warningThresholdMinutes?: number;   // Default: 10 minutes
  criticalThresholdMinutes?: number;  // Default: 30 minutes
  checkIntervalMs?: number;           // Default: 60 seconds
}
```

**Methods:**
```typescript
start(): Promise<void>              // Start monitoring
stop(): Promise<void>               // Stop monitoring
onAlert(callback): void             // Register alert handler
manualCheck(): Promise<Alert[]>     // Manual trigger (testing)
getStatus(): StatusInfo             // Get current status
```

**Alert Structure:**
```typescript
interface StuckAgreementAlert {
  agreementId: string;
  status: AgreementStatus;
  timeSinceLastUpdate: number;  // milliseconds
  severity: AlertSeverity;      // WARNING | CRITICAL
  message: string;
  timestamp: Date;
}
```

---

## Impact Assessment

### Before Fix

| Scenario | Outcome |
|----------|---------|
| **First settlement failure** | Idempotency key created with 24h TTL |
| **15 seconds later** | Retry blocked by idempotency |
| **Every 15 seconds for 24 hours** | All retries blocked |
| **User experience** | Funds locked, no settlement, no visibility |

### After Fix

| Scenario | Outcome |
|----------|---------|
| **First settlement failure** | Idempotency key created with 5min TTL |
| **Within 5 minutes** | Retries blocked (prevents storm) |
| **After 5 minutes** | Retry allowed, settlement can succeed |
| **Monitoring** | Alerts if stuck >10min (warning), >30min (critical) |

---

## Production Benefits

### 1. Automatic Recovery from Transient Errors

- **Jito Block Engine downtime:** Retries after 5 minutes
- **Network timeouts:** Retries after 5 minutes
- **RPC rate limits:** Retries after 5 minutes
- **Any transient failure:** Self-healing within 5 minutes

### 2. Prevention of Retry Storms

- 5-minute cooldown prevents rapid-fire retries
- Protects against resource exhaustion
- Maintains system stability during failures

### 3. Proactive Monitoring

- **10-minute warning:** Early detection, manual intervention optional
- **30-minute critical:** Requires immediate attention
- **Console logging:** Visible in production logs
- **Extensible:** Ready for Slack/PagerDuty integration

### 4. Operational Visibility

Every idempotency operation now logs:
```log
[IdempotencyService] Using custom TTL: 300s (5min) for key: settlement_AGR-XXX
[IdempotencyService] Stored idempotency key: settlement_AGR-XXX (expires: 2025-10-29T01:10:38.000Z)
```

Stuck agreements trigger:
```log
⚠️  [StuckAgreementAlert] WARNING: Agreement AGR-XXX stuck in BOTH_LOCKED for 10 minutes
🔴 [StuckAgreementAlert] CRITICAL: Agreement AGR-XXX stuck in BOTH_LOCKED for 30 minutes
   🚨 CRITICAL: Agreement requires immediate attention!
```

---

## Configuration

### Environment Variables

No new environment variables required. Uses existing infrastructure.

### Tuneable Parameters

**Failed Settlement TTL (in code):**
```typescript
const FAILED_SETTLEMENT_TTL_SECONDS = 300; // Adjust if needed
```

**Monitor Thresholds (in code):**
```typescript
const stuckAgreementMonitor = getStuckAgreementMonitor({
  warningThresholdMinutes: 10,   // Adjust per environment
  criticalThresholdMinutes: 30,  // Adjust per environment
  checkIntervalMs: 60000,        // Adjust per environment
});
```

**Recommendations:**
- **Production:** Keep defaults (5min TTL, 10/30min thresholds)
- **Staging:** Could reduce to 2min TTL for faster testing
- **Development:** Could use 1min TTL for rapid iteration

---

## Testing Strategy

### Unit Tests

Not included in this PR (can be added separately). Focus areas:
1. `storeIdempotencyWithTTL` with custom TTL
2. `storeIdempotencyWithTTL` without custom TTL (backwards compat)
3. Stuck agreement detection at various thresholds
4. Alert callback triggering

### Manual Testing

**Test 1: Failed Settlement Recovery**
1. Trigger settlement with known failure (e.g., break token account creation)
2. Verify idempotency key created with 5min TTL
3. Wait 6 minutes
4. Fix the failure cause
5. Verify settlement retries and succeeds

**Test 2: Stuck Agreement Detection**
1. Create agreement that reaches BOTH_LOCKED
2. Prevent settlement from executing
3. Wait 11 minutes
4. Verify WARNING alert logged
5. Wait 31 minutes  
6. Verify CRITICAL alert logged

### Production Verification

After deployment:
1. Monitor logs for any stuck agreement alerts
2. Verify no false positives (agreements settling normally)
3. Check idempotency TTL logs show correct values (5min for failures, 24h for successes)

---

## Deployment Plan

### Prerequisites

1. ✅ PR #88 (Jito tip fix) must be merged and deployed first
2. ✅ This fix (PR #TBD) reviewed and approved

### Deployment Steps

1. **Merge to staging**
   ```bash
   git checkout staging
   git merge fix/idempotency-ttl-and-monitoring
   git push origin staging
   ```

2. **Test on staging environment**
   - Create test agreement
   - Force a settlement failure
   - Verify 5-minute retry
   - Verify stuck agreement alerts

3. **Merge to master**
   - Create PR: `staging` → `master`
   - Review and approve
   - Merge

4. **Deploy to production**
   ```bash
   doctl apps create-deployment <production-app-id>
   ```

5. **Monitor production**
   - Watch logs for stuck agreement alerts
   - Verify idempotency TTL logs
   - Check settlement success rate

### Rollback Plan

If issues arise:
1. Revert via DigitalOcean console
2. Investigate logs
3. Fix and redeploy

**Risk Assessment:** Very low risk
- Changes are isolated to idempotency and monitoring
- Backwards compatible
- No database schema changes
- Can be safely reverted

---

## Future Enhancements

### 1. Alert Integration

Add Slack/PagerDuty/email notifications:

```typescript
stuckAgreementMonitor.onAlert(async (alert) => {
  if (alert.severity === AlertSeverity.CRITICAL) {
    await sendSlackAlert(alert);
    await sendPagerDutyAlert(alert);
  }
});
```

### 2. Automatic Remediation

Add automatic idempotency key cleanup for stuck agreements:

```typescript
if (alert.severity === AlertSeverity.CRITICAL) {
  // Automatically clear idempotency key to allow retry
  await idempotencyService.deleteIdempotencyKey(
    `settlement_${alert.agreementId}`
  );
  console.log('Cleared idempotency key to allow retry');
}
```

### 3. Metrics Dashboard

Track metrics:
- Settlement success rate
- Average settlement time
- Stuck agreement frequency
- Idempotency hit rate (successes vs retries)

### 4. Configurable TTL per Error Type

Different TTL based on error:
- Network errors: 2 minutes (likely transient)
- Validation errors: 24 hours (likely permanent)
- Resource errors: 10 minutes (depends on recovery)

---

## Related Documentation

- [CRITICAL_FIX_JITO_SETTLEMENT.md](./CRITICAL_FIX_JITO_SETTLEMENT.md) - Primary settlement fix
- [IDEMPOTENCY_IMPLEMENTATION.md](../architecture/IDEMPOTENCY_IMPLEMENTATION.md) - Original idempotency design
- [SETTLEMENT_SERVICE.md](../architecture/SETTLEMENT_SERVICE.md) - Settlement service docs

---

## Summary

This fix complements the critical Jito tip fix by:
1. ✅ Allowing failed settlements to retry after 5 minutes
2. ✅ Maintaining protection against retry storms
3. ✅ Adding proactive monitoring for stuck agreements
4. ✅ Improving operational visibility

**Result:** More resilient, self-healing settlement system with better observability.

---

**Authors:** AI Assistant  
**Reviewers:** Pending  
**Deployed:** Pending  
**Verified:** Pending

