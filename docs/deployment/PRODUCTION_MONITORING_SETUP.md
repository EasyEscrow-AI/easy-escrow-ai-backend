# Production Monitoring Setup - Complete Guide

**Date:** December 6, 2025  
**Environment:** Production (Mainnet)  
**Status:** Deployed and Monitoring Active

---

## 🎯 **Overview**

This document provides step-by-step instructions for setting up comprehensive production monitoring for the Easy Escrow AI atomic swap system, including dashboards, alerts, log analysis, and incident response.

---

## 1. DigitalOcean Monitoring Dashboard Setup

### 1.1 App Platform Insights

**Access:** https://cloud.digitalocean.com/apps → easyescrow-backend-production → **Insights**

**Built-in Metrics (No Setup Required):**
- ✅ CPU Usage (%)
- ✅ Memory Usage (MB)
- ✅ HTTP Requests/Second
- ✅ HTTP Error Rate (%)
- ✅ HTTP Response Time (p50, p95, p99)
- ✅ Network Traffic (in/out)

**Recommended Monitoring Frequency:**
- **First 24 hours:** Check every hour
- **First week:** Check twice daily (morning/evening)
- **Ongoing:** Check daily or when alerts fire

### 1.2 Database Metrics Dashboard

**Access:** https://cloud.digitalocean.com/databases → easyescrow-production-postgres → **Metrics**

**Monitor These Metrics:**
- CPU Usage (<80%)
- Memory Usage (<85%)
- Disk Usage (<80%)
- Active Connections (<50)
- Queries Per Second
- Average Query Time (<100ms)

**Alert Thresholds:**
- ⚠️ CPU >80% sustained for 5 minutes
- ⚠️ Memory >85% sustained for 5 minutes
- 🚨 Disk >90%
- 🚨 Active connections >80

### 1.3 Redis Metrics (if using DO Managed Redis)

**Access:** https://cloud.digitalocean.com/databases → redis-instance → **Metrics**

**Monitor:**
- Memory Usage (<90%)
- Hit Rate (>95% ideal)
- Connected Clients
- Operations Per Second

---

## 2. Alert Configuration

### 2.1 DigitalOcean Alert Policies

**Setup Steps:**

1. **Navigate to:** https://cloud.digitalocean.com/settings/alerts
2. **Click:** "Create Alert Policy"
3. **Create these policies:**

#### **Alert Policy 1: Deployment Failures**
```
Name: Production Deployment Failure
Resource Type: App Platform
Resource: easyescrow-backend-production
Trigger: Deployment fails
Notification: Email to <your-email>
```

####** Alert Policy 2: High Error Rate**
```
Name: Production High Error Rate
Resource Type: App Platform
Resource: easyescrow-backend-production
Metric: HTTP Error Rate
Condition: >5% for 5 minutes
Notification: Email to <your-email>
```

#### **Alert Policy 3: High CPU Usage**
```
Name: Production High CPU
Resource Type: App Platform
Resource: easyescrow-backend-production
Metric: CPU Usage
Condition: >80% for 10 minutes
Notification: Email to <your-email>
```

#### **Alert Policy 4: High Memory Usage**
```
Name: Production High Memory
Resource Type: App Platform
Resource: easyescrow-backend-production
Metric: Memory Usage
Condition: >85% for 5 minutes
Notification: Email to <your-email>
```

#### **Alert Policy 5: Database Issues**
```
Name: Production Database CPU High
Resource Type: Database
Resource: easyescrow-production-postgres
Metric: CPU Usage
Condition: >80% for 10 minutes
Notification: Email to <your-email>
```

### 2.2 Email Notification Setup

**Configure in DigitalOcean:**
1. Go to: Account → Settings → Notifications
2. Add team email addresses
3. Verify emails are confirmed
4. Test notification delivery

---

## 3. Log Monitoring Strategy

### 3.1 Real-Time Log Monitoring

**Via Web Console:**
1. Go to: Apps → Production → **Runtime Logs**
2. Enable auto-refresh
3. Filter by log level (INFO, WARN, ERROR)

**Via CLI:**
```bash
# Follow real-time logs
doctl apps logs <app-id> --type=run --follow

# Filter errors only
doctl apps logs <app-id> --type=run --follow | grep "ERROR"

# Filter warnings
doctl apps logs <app-id> --type=run --follow | grep "WARN"
```

### 3.2 Log Analysis Patterns

**Watch for These Error Patterns:**

| Pattern | Severity | Action |
|---------|----------|--------|
| `Database connection failed` | 🚨 CRITICAL | Check DATABASE_URL, database status |
| `Redis connection failed` | ⚠️ HIGH | Check REDIS_URL, restart if needed |
| `RPC request failed` | ⚠️ HIGH | Check SOLANA_RPC_URL, switch to fallback |
| `Transaction simulation failed` | ⚠️ MEDIUM | Check program ID, investigate transaction |
| `Nonce account not found` | ⚠️ MEDIUM | Run nonce pool cleanup/reseed |
| `Unauthorized zero-fee attempt` | ℹ️ INFO | Security working as expected |

### 3.3 Daily Log Review Checklist

**Run these checks daily (5 minutes):**

```bash
# 1. Check error count (last 24 hours)
doctl apps logs <app-id> --type=run --since=24h | grep -c "ERROR"
# Target: <10 errors per day

# 2. Check warning count
doctl apps logs <app-id> --type=run --since=24h | grep -c "WARN"
# Target: <50 warnings per day

# 3. Check for repeated errors
doctl apps logs <app-id> --type=run --since=24h | grep "ERROR" | sort | uniq -c
# Look for patterns

# 4. Check swap success rate
doctl apps logs <app-id> --type=run --since=24h | grep "Atomic swap completed"
# Should see successful swaps if users are active
```

---

## 4. System Health Dashboard

### 4.1 Quick Health Check Script

Use the provided health check script for rapid manual verification:

```bash
# Run health check
./scripts/check-production-health.sh

# Expected output:
# ✅ API Health: OK
# ✅ Database: OK
# ✅ Redis: OK
# ✅ Error Rate: Low (X errors in last 100 logs)
```

### 4.2 Key Metrics to Monitor

**Application Metrics:**
- ✅ Health Endpoint Response Time (<1s)
- ✅ API Response Time (p95 <2s)
- ✅ HTTP Error Rate (<1%)
- ✅ CPU Usage (<70% average)
- ✅ Memory Usage (<75%)

**Transaction Metrics:**
- ✅ Swaps Per Hour
- ✅ Swap Success Rate (>99%)
- ✅ Average Transaction Confirmation Time (<30s)
- ✅ Treasury PDA Fee Collection (increasing)

**External Service Metrics:**
- ✅ Database Query Time (p95 <100ms)
- ✅ Redis Hit Rate (>95%)
- ✅ Solana RPC Success Rate (>99%)

---

## 5. Treasury PDA Monitoring

### 5.1 Fee Collection Verification

**Manual Check (Weekly):**
```bash
# Check Treasury PDA balance
solana balance FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu --url mainnet-beta

# View Treasury PDA on explorer
# https://solscan.io/account/FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu
```

**Expected:**
- Balance increases with each swap
- Platform fee (1% = 100 bps) collected correctly
- No unexpected debits

### 5.2 Fee Calculation Audit

**Verify in database:**
```sql
-- Check recent swaps and fees
SELECT 
  signature,
  maker_wallet,
  taker_wallet,
  platform_fee_lamports,
  created_at
FROM swap_transactions
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 10;

-- Calculate total fees collected
SELECT 
  SUM(platform_fee_lamports) as total_fees_collected_lamports,
  COUNT(*) as total_swaps
FROM swap_transactions
WHERE status = 'CONFIRMED'
  AND created_at > NOW() - INTERVAL '7 days';
```

---

## 6. Security Monitoring

### 6.1 Zero-Fee Authorization Monitoring

**Check authorized apps usage:**
```sql
-- Zero-fee swap activity (last 7 days)
SELECT 
  a.name,
  COUNT(z.id) as zero_fee_swaps,
  SUM(z.total_value_lamports) as total_value_lamports,
  MAX(z.created_at) as last_used
FROM authorized_apps a
LEFT JOIN zero_fee_swap_logs z ON a.id = z.authorized_app_id
WHERE a.zero_fee_enabled = true
  AND z.created_at > NOW() - INTERVAL '7 days'
GROUP BY a.id, a.name;
```

**Monitor for:**
- Unauthorized zero-fee attempts (should be logged as WARN)
- Unexpected zero-fee usage patterns
- Rate limit violations

### 6.2 Test Page Security

**Monitor failed authentication attempts:**
```bash
# Check for /test page access attempts
doctl apps logs <app-id> --type=run | grep "/test"

# Look for failed auth (if implemented)
doctl apps logs <app-id> --type=run | grep "Unauthorized.*test"
```

---

## 7. Incident Response Procedures

### 7.1 Critical Issues (Response Time: <15 minutes)

#### **Incident: API Down / Health Check Failing**

**Symptoms:**
- Health check endpoint returns 503 or timeout
- DigitalOcean shows component as "Unhealthy"
- Users cannot access API

**Immediate Actions:**
1. Check DigitalOcean console: Apps → Production → Components
2. View recent logs: `doctl apps logs <app-id> --type=run --tail=50`
3. Identify error pattern (database, Redis, RPC failure?)
4. If unclear, restart app: Actions → Restart

**Common Causes:**
- Database connection pool exhausted
- Redis connection timeout
- Solana RPC rate limit hit
- Memory leak causing OOM

**Resolution:**
- Database: Check connection pool settings, restart if needed
- Redis: Verify REDIS_URL, check Redis Cloud status
- RPC: Switch to fallback RPC or contact Helius support
- Memory: Restart app, investigate memory leak

#### **Incident: Swap Transaction Failing**

**Symptoms:**
- User reports swap not completing
- Transaction signature not appearing on Solscan
- Error logs show transaction simulation failures

**Immediate Actions:**
1. Get transaction signature from logs
2. Check Solscan: https://solscan.io/tx/SIGNATURE
3. Review error message in logs
4. Check Treasury PDA exists and is initialized

**Common Causes:**
- Insufficient SOL for transaction fees
- Invalid nonce account
- Program instruction data mismatch
- Merkle proof invalid (for cNFTs)

**Resolution:**
- Insufficient SOL: User needs to fund wallet
- Nonce issues: Run nonce cleanup script
- Program issues: Verify program ID matches deployed version
- Proof issues: Check DAS API and proof generation

#### **Incident: High Error Rate (>5%)

**

**Symptoms:**
- DigitalOcean alert: High error rate
- Many 500 errors in logs
- Users experiencing failures

**Immediate Actions:**
1. Check recent logs for error patterns
2. Identify most common error type
3. Check if related to specific endpoint
4. Review recent code deployments

**Common Causes:**
- Recent bad deployment
- Database query timeout
- External service (RPC) degradation
- Memory/CPU exhaustion

**Resolution:**
- Bad deployment: Rollback to previous version
- Database: Optimize queries, scale database
- RPC: Switch to fallback or upgrade plan
- Resources: Scale up app instance size

### 7.2 Non-Critical Issues (Response Time: <1 hour)

#### **Incident: Slow API Response Times**

**Symptoms:**
- p95 response time >5 seconds
- Users report slow page loads

**Investigation:**
1. Check database query performance
2. Review Redis hit rate
3. Check RPC response times
4. Review recent code changes

**Resolution:**
- Add database indexes
- Optimize Redis caching strategy
- Upgrade Solana RPC plan
- Code optimization if needed

#### **Incident: Memory Usage Creeping Up**

**Symptoms:**
- Memory usage slowly increasing over hours/days
- Eventual OOM and restart

**Investigation:**
1. Check for memory leaks in logs
2. Review event listeners (not cleaned up?)
3. Check for large object caching

**Resolution:**
- Restart app (immediate fix)
- Investigate code for leaks
- Add proper cleanup in event handlers
- Deploy fix and monitor

---

## 8. Post-Deployment Validation (First 72 Hours)

### Hour 1 Checklist:
- [ ] Verify deployment successful (app shows "Live")
- [ ] Run smoke tests (5/5 passing)
- [ ] Check health endpoint (/health returns 200)
- [ ] Verify all secrets loaded correctly
- [ ] Check initial logs for errors
- [ ] Test test page loads (/test with password)

### Hour 6 Checklist:
- [ ] Review logs for any ERROR entries
- [ ] Check CPU/memory usage trends
- [ ] Verify database connections stable
- [ ] Check Redis connection stable
- [ ] Monitor for any user-reported issues

### Day 1 Checklist:
- [ ] Review 24-hour error count (<10)
- [ ] Check if any swaps occurred (if users active)
- [ ] Verify Treasury PDA balance increased (if swaps occurred)
- [ ] Review alert policies (any false positives?)
- [ ] Check response times (p95 <2s)

### Day 3 Checklist:
- [ ] Review 72-hour logs for patterns
- [ ] Verify no recurring errors
- [ ] Check database performance metrics
- [ ] Review Redis cache hit rate
- [ ] Assess if any alert thresholds need adjustment

---

## 9. Manual Testing Procedures

### 9.1 Manual Swap Test (After First Real User Traffic)

**Purpose:** Validate end-to-end functionality with real mainnet transaction

**Prerequisites:**
- Funded test wallets (sender & receiver)
- At least 2 test NFTs minted
- Test page accessible

**Procedure:**
1. Visit: https://api.easyescrow.ai/test (password: `<from-env:TEST_PAGE_PASSWORD>`)
2. Select 2 NFTs (one from each wallet)
3. Execute swap
4. Verify:
   - [ ] Transaction confirms on Solscan
   - [ ] NFTs transfer correctly
   - [ ] Fee collected to Treasury PDA
   - [ ] Database records created
   - [ ] No errors in browser console
   - [ ] No errors in application logs

**Document Results:**
- Transaction signature
- Treasury PDA balance before/after
- Any issues encountered
- Resolution if issues found

### 9.2 Zero-Fee Authorization Test

**Purpose:** Verify authorized app can execute zero-fee swaps

**Prerequisites:**
- Valid API key (from .env.production: ATOMIC_SWAP_API_KEY)
- Funded test wallets
- Test NFTs

**Procedure:**
1. Visit test page with API key field
2. Enter API key: `<from-env:ATOMIC_SWAP_API_KEY>`
3. Execute swap
4. Verify:
   - [ ] Platform fee shows as 0 SOL
   - [ ] Transaction confirms
   - [ ] Treasury PDA balance unchanged (no fee collected)
   - [ ] Zero-fee swap logged in database

**Check Audit Log:**
```sql
SELECT *
FROM zero_fee_swap_logs
ORDER BY created_at DESC
LIMIT 10;
```

---

## 10. Monitoring Tools (Current Setup)

### 10.1 Active Monitoring (No Additional Cost)

- ✅ **DigitalOcean App Platform Insights** - Built-in metrics dashboard
- ✅ **DigitalOcean Alerts** - Email notifications for critical events
- ✅ **Application Logs** - Winston structured logging
- ✅ **Database Metrics** - DO Managed PostgreSQL dashboard
- ✅ **Health Check Script** - scripts/check-production-health.sh

### 10.2 Optional Enhancements (For Future)

**If basic monitoring proves insufficient:**

| Tool | Purpose | Cost | Priority |
|------|---------|------|----------|
| **UptimeRobot** | Uptime monitoring | Free | Low |
| **Sentry** | Error tracking | $0-26/mo | Medium |
| **Datadog** | APM & metrics | $15+/mo | Low |
| **Papertrail** | Log aggregation | $0-7/mo | Low |

**Recommendation:** Start with free DO tools, only add paid tools if needed.

---

## 11. Daily Monitoring Routine (5 Minutes)

### Morning Check (Every Day):

```bash
# 1. Quick health check
curl https://api.easyescrow.ai/health

# 2. Check for errors in last 24 hours
doctl apps logs <app-id> --type=run --since=24h | grep -c "ERROR"

# 3. Check app status
doctl apps list | grep production

# 4. Check database metrics
# Go to: DigitalOcean → Databases → Metrics (web console)

# 5. Check Treasury PDA balance (weekly)
solana balance FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu --url mainnet-beta
```

**Expected Results:**
- ✅ Health endpoint: 200 OK
- ✅ Error count: <10 in 24 hours
- ✅ App status: "Live"
- ✅ Database CPU: <50%
- ✅ Treasury balance: Increasing (if swaps occurred)

---

## 12. Weekly Monitoring Routine (15 Minutes)

### Sunday Review:

1. **Review Metrics:**
   - [ ] Check 7-day CPU/memory trends
   - [ ] Review error rate trends
   - [ ] Check database growth rate
   - [ ] Review Redis cache performance

2. **Review Transactions:**
   ```sql
   -- Weekly swap summary
   SELECT 
     COUNT(*) as total_swaps,
     SUM(platform_fee_lamports) as total_fees,
     AVG(platform_fee_lamports) as avg_fee,
     COUNT(DISTINCT maker_wallet) as unique_makers,
     COUNT(DISTINCT taker_wallet) as unique_takers
   FROM swap_transactions
   WHERE created_at > NOW() - INTERVAL '7 days'
     AND status = 'CONFIRMED';
   ```

3. **Review Security:**
   ```sql
   -- Zero-fee usage
   SELECT COUNT(*) FROM zero_fee_swap_logs
   WHERE created_at > NOW() - INTERVAL '7 days';
   
   -- Failed auth attempts (if logged)
   SELECT COUNT(*) FROM application_logs
   WHERE level = 'WARN'
     AND message LIKE '%unauthorized%'
     AND created_at > NOW() - INTERVAL '7 days';
   ```

4. **Check for Issues:**
   - [ ] Any unresolved alerts?
   - [ ] Any recurring errors?
   - [ ] Any performance degradation?
   - [ ] Any user-reported issues?

---

## 13. Monitoring Success Criteria

**System is considered healthy if:**
- ✅ Health endpoint responds <1s (99.9% uptime)
- ✅ Error rate <1% of requests
- ✅ CPU usage <70% average
- ✅ Memory usage <75% average
- ✅ Database query time p95 <100ms
- ✅ API response time p95 <2s
- ✅ No critical unresolved alerts
- ✅ Treasury PDA collecting fees correctly
- ✅ Zero-fee authorization working as expected

---

## 14. Escalation & Support

### When to Escalate:

**Immediate Escalation (Critical):**
- API down >5 minutes
- Database unavailable
- Data integrity issues
- Security breach suspected

**Escalate Within 1 Hour (High):**
- Error rate >5%
- Performance degradation >50%
- User-facing functionality broken
- Treasury fee collection stopped

**Escalate Within 1 Day (Medium):**
- Slow response times
- Minor bugs not blocking users
- Performance optimization needed
- Feature requests

### Contact Information:

**On-Call Rotation:**
- Week 1: [Team Member 1] - <contact>
- Week 2: [Team Member 2] - <contact>
- Backup: [Tech Lead] - <contact>

**External Support:**
- DigitalOcean: https://cloud.digitalocean.com/support
- Helius RPC: support@helius.dev
- Redis Cloud: support@redis.com

---

## 15. Summary

### ✅ **What's Set Up:**
- Health check endpoint with auto-restart
- Built-in metrics dashboards (DO)
- Structured logging (Winston + JSON)
- Alert policies configured
- Health check script available
- Incident response procedures documented

### ⏳ **What's Manual:**
- Daily log review (5 min/day)
- Weekly metrics review (15 min/week)
- Manual E2E test runs (as needed)
- Treasury PDA balance checks (weekly)

### 🎯 **Next Steps:**
1. Configure email notifications in DO
2. Create alert policies (5 total)
3. Run daily health checks for first week
4. Document any issues encountered
5. Iterate based on actual production usage

---

**Production monitoring is operational with free DO tools! Iterate based on actual needs.** 🎯

---

**Last Updated:** December 6, 2025  
**Next Review:** After 1 week of production traffic

