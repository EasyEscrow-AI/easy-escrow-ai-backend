# Task 9: Monitoring & Background Jobs Infrastructure Audit

**Date:** December 1, 2025  
**Branch:** `feature/monitoring-and-background-jobs`  
**Task:** 9.1 - Audit Existing Services and Background Jobs Infrastructure  
**Status:** ✅ Complete

---

## 🎯 Audit Objective

Identify existing monitoring services, background jobs, health checks, cleanup jobs, and logging infrastructure that can be reused or adapted for atomic swap requirements.

---

## 📊 Audit Findings Summary

| Component | Status | Implementation | Adaptation Needed |
|-----------|--------|----------------|-------------------|
| **Health Check Endpoint** | ✅ Exists | `/health` in `src/index.ts` | ✅ Minor - Add treasury check |
| **Background Job Framework** | ✅ Exists | `node-cron` package | ✅ Already installed |
| **Offer Expiry Job** | ❌ Missing | N/A | 🔨 Create new |
| **Nonce Cleanup Job** | ❌ Missing | N/A | 🔨 Create new |
| **Nonce Replenishment Job** | ❌ Missing | N/A | 🔨 Create new |
| **Structured Logging** | ❌ Basic Only | `console.log` | 🔨 Implement Winston/Pino |
| **Error Alerting** | ❌ Missing | N/A | 🔨 Create new |
| **Job Scheduling** | ✅ Exists | `BackupScheduler` pattern | ✅ Can reuse pattern |

---

## 1. ✅ Health Check Endpoint (EXISTING)

### Current Implementation

**File:** `src/index.ts` (lines 70-117)

**What it checks:**
- ✅ Database connectivity (`checkDatabaseHealth()`)
- ✅ Redis connectivity (`checkRedisHealth()`)
- ✅ Idempotency service status
- ✅ Nonce pool status (total, available, in-use, expired)

**Response Example:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-01T...",
  "service": "easy-escrow-ai-backend",
  "mode": "atomic-swap",
  "database": "connected",
  "redis": "connected",
  "idempotency": {
    "status": "running",
    "expirationHours": 24,
    "cleanupIntervalMinutes": 60
  },
  "noncePool": {
    "status": "running",
    "total": 20,
    "available": 18,
    "inUse": 1,
    "expired": 1,
    "health": "healthy"
  }
}
```

### What's Missing for Atomic Swaps

- ❌ Treasury PDA balance check
- ❌ RPC connectivity test (for atomic swap operations)
- ❌ Health check caching (currently no TTL)

### Adaptation Required

**Minor changes needed:**
1. Add treasury balance validation
2. Add RPC connectivity test
3. Implement response caching (30-60s TTL)

---

## 2. ✅ Background Job Framework (EXISTING)

### node-cron Package

**Status:** ✅ Already installed  
**Used by:** `BackupScheduler` service

**File:** `src/services/backup-scheduler.service.ts`

**Example Usage:**
```typescript
import * as cron from 'node-cron';

// Schedule weekly backups (Sunday at 2 AM)
this.weeklyTask = cron.schedule(
  '0 2 * * 0',
  async () => {
    await this.executeBackup();
  },
  {
    scheduled: true,
    timezone: process.env.TZ || 'America/New_York',
  }
);
```

### Features Already Implemented

- ✅ Leader election (multi-instance safe)
- ✅ Manual trigger capability
- ✅ Graceful shutdown handling
- ✅ Status tracking
- ✅ Error handling

### Adaptation Required

**Can reuse this exact pattern** for:
- Offer expiry job
- Nonce cleanup job  
- Nonce replenishment job

---

## 3. ✅ Existing Expiry Infrastructure (FOR AGREEMENTS)

### ExpiryService (Legacy)

**File:** `src/services/expiry.service.ts`

**What it does:**
- Monitors escrow **agreements** (not atomic swap **offers**)
- Runs every 60 seconds (configurable)
- Batch processing (200 records per batch)
- Updates status to `EXPIRED`

**Key Methods:**
```typescript
start() // Start periodic checks
stop() // Stop periodic checks
checkExpiredAgreements() // Manual check execution
```

### Orchestrator Pattern

**File:** `src/services/expiry-cancellation-orchestrator.service.ts`

**What it does:**
- Coordinates expiry, refund, cancellation, and status updates
- Provides unified health check
- Event system for monitoring
- Error tracking and statistics

### Adaptation Required

**Need NEW service for atomic swap offers:**
- Different table (`swap_offer` not `agreement`)
- Different status values (`expired` not `EXPIRED`)
- Different expiry logic (simpler - just timestamp check)

**Can reuse:**
- Batch processing pattern
- Error handling pattern
- Timer-based execution
- Health check pattern

---

## 4. ❌ Nonce Pool Management Jobs (MISSING)

### NoncePoolManager Service

**File:** `src/services/noncePoolManager.ts`

**What it provides:**
- `getPoolStats()` - Get current pool statistics
- `assignNonceToUser()` - Assign nonce account
- `releaseNonce()` - Release nonce back to pool
- `advanceNonce()` - Advance nonce value
- `cleanup()` - Manual cleanup method

### What's Missing

1. **Automated Cleanup Job** (hourly)
   - Query for unused nonces (not used > 24h)
   - Verify on-chain validity
   - Reclaim SOL from unused accounts
   - Remove from database

2. **Automated Replenishment Job** (every 30 min)
   - Check if pool < minimum threshold
   - Create new nonce accounts
   - Fund with rent-exempt balance
   - Add to pool

### Implementation Required

Create **NEW services:**
- `NonceCleanupScheduler` (follows `BackupScheduler` pattern)
- `NonceReplenishmentScheduler` (follows `BackupScheduler` pattern)

---

## 5. ❌ Structured Logging System (MISSING)

### Current Logging

**Implementation:** Basic `console.log` / `console.error`

**Example:**
```typescript
console.log('[OfferManager] Creating offer:', { maker, taker });
console.error('[TransactionBuilder] Failed:', error);
```

**Issues:**
- ❌ No structured format (not JSON)
- ❌ No log levels (ERROR, WARN, INFO, DEBUG)
- ❌ No correlation IDs
- ❌ No log rotation
- ❌ No metadata enrichment
- ❌ Difficult to parse/search

### What's Needed

**Implement structured logging with:**
- Winston or Pino (industry standard)
- JSON format for log aggregation
- Log levels: ERROR, WARN, INFO, DEBUG
- Correlation IDs for request tracking
- Contextual metadata (user_wallet, offer_id, tx_signature)
- Log rotation (30 day retention)

### Where to Add

**All critical operations:**
- Offer creation/acceptance
- Transaction building/submission
- Nonce management
- Fee collection
- Error handling

---

## 6. ❌ Error Alerting System (MISSING)

### Current State

**No alerting infrastructure exists.**

**Current error handling:**
- Errors logged to console
- No notifications
- No alert throttling
- No severity levels
- Manual monitoring required

### What's Needed

**Implement alerting for:**

#### Critical Alerts (Immediate Action)
- Database connection loss
- RPC endpoint failures
- Nonce pool completely depleted
- Treasury balance < 1 SOL

#### High Alerts (Action Within Hours)
- Nonce pool low (< 20% threshold)
- High transaction failure rate (> 10%)
- Treasury balance < 10 SOL

#### Medium Alerts (Monitor Closely)
- Individual transaction failures
- Slow RPC response times
- High nonce churn rate

### Implementation Required

Create **NEW service:**
- `AlertingService`
- Integration with notification providers
- Alert throttling (max 1 per error per 15 min)
- Recovery notifications
- Alert metrics tracking

---

## 7. ✅ Job Scheduling Pattern (EXISTING - CAN REUSE)

### BackupScheduler Pattern

**File:** `src/services/backup-scheduler.service.ts`

**Features:**
- ✅ Leader election (multi-instance safe)
- ✅ Cron scheduling with timezone support
- ✅ Manual trigger capability
- ✅ Status tracking
- ✅ Error handling
- ✅ Graceful shutdown
- ✅ Production-only execution

**Code Pattern:**
```typescript
export class BackupScheduler {
  private static instance: BackupScheduler;
  private weeklyTask?: cron.ScheduledTask;
  private isRunning: boolean = false;
  private isLeader: boolean = false;

  private constructor() {
    // Leader election
    this.isLeader = process.env.DYNO === 'web.1' 
      || !process.env.DYNO;
  }

  public static getInstance(): BackupScheduler {
    if (!BackupScheduler.instance) {
      BackupScheduler.instance = new BackupScheduler();
    }
    return BackupScheduler.instance;
  }

  public startWeeklyBackup(): void {
    if (!this.isLeader) return;
    
    this.weeklyTask = cron.schedule('0 2 * * 0', async () => {
      await this.executeBackup();
    });
  }
}
```

### Can Reuse For

- ✅ Offer expiry scheduler
- ✅ Nonce cleanup scheduler
- ✅ Nonce replenishment scheduler
- ✅ Any future scheduled jobs

---

## 8. ✅ Additional Infrastructure Discovered

### IdempotencyService

**File:** `src/services/idempotency.service.ts`

**Features:**
- ✅ Background cleanup timer (every 60 minutes)
- ✅ Expired key removal
- ✅ Status tracking
- ✅ Start/stop methods
- ✅ Health check method

**Pattern to reuse:**
```typescript
private startCleanupTimer(): void {
  this.cleanupTimer = setInterval(async () => {
    await this.cleanupExpiredKeys();
  }, this.config.cleanupIntervalMinutes * 60 * 1000);
}
```

### NoncePoolManager Service

**File:** `src/services/noncePoolManager.ts`

**Features:**
- ✅ Pool statistics tracking
- ✅ Health status reporting
- ✅ Account assignment/release
- ✅ Cleanup method (manual only)
- ✅ Initialization logic

**What it provides for monitoring:**
- Pool size tracking
- Availability metrics
- Usage statistics
- Expired account detection

---

## 📋 Implementation Plan

### ✅ What We Can Reuse (Minimal Work)

1. **Health Check Endpoint**
   - Already 80% complete
   - Add treasury balance check
   - Add caching layer
   - Effort: 30 minutes

2. **Job Scheduling Pattern**
   - Copy `BackupScheduler` pattern
   - Adapt for new job types
   - Effort: 15 minutes per job

3. **Existing Services**
   - `NoncePoolManager` for pool operations
   - `IdempotencyService` for cleanup pattern
   - Orchestrator pattern for coordination

### 🔨 What We Need to Build (New Work)

1. **Offer Expiry Job** (Subtask 3)
   - New service using existing pattern
   - Query `swap_offer` table
   - Batch processing
   - Effort: 1-2 hours

2. **Nonce Cleanup Job** (Subtask 4)
   - New scheduler service
   - Integrate with `NoncePoolManager`
   - SOL reclamation logic
   - Effort: 2-3 hours

3. **Nonce Replenishment Job** (Subtask 4)
   - New scheduler service
   - Integrate with `NoncePoolManager`
   - Threshold-based triggering
   - Effort: 1-2 hours

4. **Structured Logging** (Subtask 5)
   - Install Winston or Pino
   - Create logger service
   - Replace console.log throughout
   - Add correlation IDs
   - Effort: 3-4 hours

5. **Error Alerting System** (Subtask 6)
   - New AlertingService
   - Notification integrations
   - Alert throttling
   - Severity levels
   - Effort: 4-5 hours

---

## 🎯 Recommended Approach

### Phase 1: Quick Wins (2-3 hours)
1. ✅ Enhance health check endpoint (30 min)
2. ✅ Implement offer expiry job (1-2 hours)
3. ✅ Implement nonce cleanup job (1 hour)

### Phase 2: Core Infrastructure (4-5 hours)
4. ✅ Implement nonce replenishment job (1-2 hours)
5. ✅ Add structured logging (3-4 hours)

### Phase 3: Advanced (4-5 hours)
6. ✅ Implement error alerting system (4-5 hours)

**Total Estimated Effort:** 10-13 hours for complete implementation

---

## 📦 Dependencies to Install

### Required
```json
{
  "dependencies": {
    "winston": "^3.11.0",  // Structured logging
    "node-cron": "^3.0.3"  // Already installed ✅
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11"  // Already installed ✅
  }
}
```

### Optional (for alerting)
```json
{
  "dependencies": {
    "nodemailer": "^6.9.7",      // Email notifications
    "@slack/webhook": "^7.0.2",  // Slack notifications
    "@datadog/browser-rum": "^5.0.0"  // Monitoring integration
  }
}
```

---

## 🔍 Detailed Component Analysis

### Component 1: Health Check Endpoint

**Location:** `src/index.ts:70-117`

**Current Checks:**
```typescript
✅ Database: checkDatabaseHealth()
✅ Redis: checkRedisHealth()
✅ Idempotency: idempotencyService.getStatus()
✅ Nonce Pool: noncePoolManager.getPoolStats()
```

**Missing Checks:**
```typescript
❌ Treasury PDA balance
❌ RPC connectivity (atomic swap specific)
❌ Response caching
```

**Adaptation:** Add missing checks + caching layer

---

### Component 2: Existing Expiry Service (FOR AGREEMENTS)

**Location:** `src/services/expiry.service.ts`

**Features:**
- Runs every 60 seconds
- Batch processing (200 records)
- Updates agreement status to `EXPIRED`
- Error handling and statistics

**Can we adapt for offers?**
- ❌ No - Different table schema
- ❌ No - Different business logic
- ✅ Yes - Can copy pattern

**Decision:** Create NEW `OfferExpiryScheduler` using same pattern

---

### Component 3: Existing BackupScheduler

**Location:** `src/services/backup-scheduler.service.ts`

**Features:**
- Singleton pattern
- Leader election (multi-instance safe)
- Cron scheduling
- Manual trigger
- Status tracking
- Production-only execution

**Pattern Quality:** ⭐⭐⭐⭐⭐ Excellent

**Reuse Strategy:**
1. Copy `BackupScheduler` structure
2. Adapt for offer expiry
3. Adapt for nonce cleanup
4. Adapt for nonce replenishment

---

### Component 4: NoncePoolManager

**Location:** `src/services/noncePoolManager.ts`

**Public Methods:**
- `getPoolStats()` - Get pool statistics
- `assignNonceToUser()` - Assign nonce
- `releaseNonce()` - Release nonce
- `advanceNonce()` - Advance nonce
- `cleanup()` - Manual cleanup (no automation)

**Missing Automation:**
- ❌ No scheduled cleanup
- ❌ No automated replenishment
- ❌ No threshold monitoring

**Integration Points:**
- `NonceCleanupScheduler` → calls `noncePoolManager.cleanup()`
- `NonceReplenishmentScheduler` → calls `noncePoolManager.replenish()`

---

### Component 5: IdempotencyService

**Location:** `src/services/idempotency.service.ts`

**Background Job Pattern:**
```typescript
private startCleanupTimer(): void {
  this.cleanupTimer = setInterval(async () => {
    console.log('[IdempotencyService] Running expired keys cleanup...');
    await this.cleanupExpiredKeys();
  }, this.config.cleanupIntervalMinutes * 60 * 1000);
}
```

**Features:**
- Timer-based execution (not cron)
- Periodic cleanup
- Status tracking
- Start/stop lifecycle

**Can reuse pattern for:**
- Simple interval-based jobs
- Non-cron scheduled operations

---

### Component 6: Logging Infrastructure

**Current State:** Basic console logging

**Examples from codebase:**
```typescript
console.log('[OfferManager] Creating offer:', params);
console.error('[TransactionBuilder] Failed:', error);
console.warn('[NoncePoolManager] Pool low:', stats);
```

**Issues:**
- Not structured (not JSON)
- No log levels (all mixed together)
- No correlation IDs
- No metadata standardization
- Difficult to parse in production

**Required Changes:**
- Install Winston or Pino
- Create `LoggerService`
- Replace all console.log calls
- Add correlation ID middleware
- Implement log rotation

---

### Component 7: Error Alerting

**Current State:** None exists

**No infrastructure for:**
- Email alerts
- Slack notifications
- PagerDuty integration
- Alert throttling
- Severity classification

**Completely New Implementation Required**

---

## 📁 Key Files Identified

### Files to Modify (Enhancement)
1. `src/index.ts` - Health check endpoint
2. `src/services/noncePoolManager.ts` - Add replenish methods

### Files to Create (New)
1. `src/services/offer-expiry-scheduler.service.ts`
2. `src/services/nonce-cleanup-scheduler.service.ts`
3. `src/services/nonce-replenishment-scheduler.service.ts`
4. `src/services/logger.service.ts` (Winston/Pino)
5. `src/services/alerting.service.ts`
6. `src/types/logging.types.ts`
7. `src/types/alerting.types.ts`

### Files to Reference (Patterns)
1. `src/services/backup-scheduler.service.ts` - Cron pattern
2. `src/services/expiry.service.ts` - Batch processing pattern
3. `src/services/idempotency.service.ts` - Cleanup timer pattern

---

## 🎯 Subtask Breakdown

### Subtask 1: Audit ✅ (DONE)
**Effort:** 30 minutes  
**Output:** This document

### Subtask 2: Health Check Enhancement
**Effort:** 30 minutes  
**Changes:** Add treasury + RPC checks, add caching

### Subtask 3: Offer Expiry Job
**Effort:** 1-2 hours  
**Create:** `OfferExpiryScheduler` service

### Subtask 4: Nonce Jobs
**Effort:** 2-3 hours  
**Create:** Cleanup + Replenishment schedulers

### Subtask 5: Structured Logging
**Effort:** 3-4 hours  
**Install:** Winston, replace all logging

### Subtask 6: Error Alerting
**Effort:** 4-5 hours  
**Create:** `AlertingService` + integrations

---

## 💡 Key Insights

### What Works Well ✅
1. **Existing health check is comprehensive** - only minor additions needed
2. **BackupScheduler pattern is excellent** - can reuse for all new jobs
3. **NoncePoolManager is well-designed** - just needs automation layer
4. **Batch processing patterns exist** - can adapt from ExpiryService

### What Needs Work 🔨
1. **No structured logging** - currently basic console.log only
2. **No alerting system** - completely missing
3. **No automated nonce jobs** - manual cleanup only
4. **No offer expiry job** - different from agreement expiry

### Quick Wins 🚀
1. Health check enhancement (30 min)
2. Offer expiry job (1-2 hours) - copy BackupScheduler pattern
3. Nonce cleanup job (1 hour) - integrate with existing NoncePoolManager

### Longer Investments ⏰
1. Structured logging (3-4 hours) - requires replacing logging throughout
2. Error alerting (4-5 hours) - completely new system

---

## ✅ Conclusion

**Audit Complete!** We have:
- ✅ Solid foundation to build on
- ✅ Excellent patterns to reuse (BackupScheduler, ExpiryService)
- ✅ Working health check endpoint
- ✅ node-cron already installed
- 🔨 3 new scheduler services to create
- 🔨 2 new infrastructure services to create (logging, alerting)

**Estimated Total Effort:** 10-13 hours for full implementation

**Recommended Approach:** Implement in phases (Quick Wins → Core → Advanced)

---

## 📈 Next Steps

1. Mark Subtask 9.1 as complete ✅
2. Begin Subtask 9.2: Enhance health check endpoint
3. Proceed with Subtasks 9.3-9.6 in priority order

**Ready to proceed with implementation!**

