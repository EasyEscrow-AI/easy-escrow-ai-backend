# Basic Production Monitoring Strategy

**Created:** December 5, 2025  
**Status:** Production Ready  
**Scope:** Basic health monitoring and alerting for atomic swap system

---

## 🎯 Overview

This document outlines a basic, practical monitoring strategy for the atomic swap production system. The focus is on detecting critical failures quickly and having visibility into system health without requiring complex infrastructure.

**Philosophy:** Start simple, iterate based on actual production needs.

---

## 1. Health Check Monitoring

### 1.1 API Endpoint Health Checks

**DigitalOcean Built-in Health Checks:**
- Automatically configured via `.do/app-production.yaml`
- Endpoint: `/health` or `/api/health`
- Check interval: 30 seconds
- Failure threshold: 3 consecutive failures
- Action: Auto-restart container on failure

**Configuration in YAML:**
```yaml
services:
  - name: backend
    health_check:
      http_path: /health
      initial_delay_seconds: 10
      period_seconds: 30
      timeout_seconds: 5
      success_threshold: 1
      failure_threshold: 3
```

### 1.2 Database Connection Monitoring

**Built-in Connection Pool Monitoring:**
- Prisma automatically handles connection pooling
- Monitor via application logs for connection errors
- Connection timeout: 10 seconds
- Pool size: 10 connections (adjustable in `prisma.pool_size`)

**Watch for these log patterns:**
```
[ERROR] Database connection failed
[ERROR] P1001: Can't reach database
[ERROR] Connection pool timeout
```

### 1.3 Redis Connection Monitoring

**Redis Client Health:**
- Built-in reconnection logic in Redis client
- Monitor via application logs for connection events

**Watch for these log patterns:**
```
[ERROR] Redis connection failed
[ERROR] Redis ECONNREFUSED
[WARN] Redis reconnecting
```

### 1.4 Solana RPC Monitoring

**RPC Endpoint Health:**
- Monitor transaction submission success/failure rates
- Track RPC response times in logs

**Watch for these log patterns:**
```
[ERROR] RPC request failed
[ERROR] Transaction simulation failed
[WARN] RPC endpoint slow response
```

---

## 2. Critical Failure Alerts

### 2.1 Alert Channels

**Primary:** Email notifications via DigitalOcean
**Setup:**
1. Go to DigitalOcean console → Alerts
2. Create alerts for:
   - App component restart events
   - High error rate (>5% of requests)
   - Database CPU >80%
   - Redis memory >90%

**Secondary:** Application logs (for debugging)
- View logs: `doctl apps logs <app-id> --type=run --follow`
- Or via DigitalOcean web console

### 2.2 Critical Alert Triggers

**Application-Level Alerts:**

| Alert | Condition | Action |
|-------|-----------|--------|
| **API Down** | Health check fails 3x | Auto-restart (DO handles) |
| **High Error Rate** | >5% requests return 5xx | Email alert |
| **Database Down** | Connection errors | Email alert + manual check |
| **Redis Down** | Connection failures | Email alert + check cache |
| **RPC Failures** | >50% tx failures | Email alert + check RPC |

**Infrastructure-Level Alerts (via DigitalOcean):**

| Alert | Threshold | Action |
|-------|-----------|--------|
| **CPU Usage** | >80% sustained | Email alert |
| **Memory Usage** | >85% sustained | Email alert |
| **Database CPU** | >80% sustained | Email alert |
| **Redis Memory** | >90% | Email alert |

### 2.3 Setting Up DigitalOcean Alerts

**Via Web Console:**
1. Navigate to: Settings → Alerts → Create Alert Policy
2. Configure:
   ```
   Alert: App Deployment Failure
   Resource: Production Backend
   Metric: Deployment Status
   Condition: Deployment fails
   Notification: Email to team@example.com
   ```

3. Create additional alerts for:
   - Container restart events
   - High memory usage
   - High CPU usage
   - Database performance

**Via CLI (doctl):**
```bash
# Create deployment failure alert
doctl apps alert-destinations create \
  --app-id <production-app-id> \
  --emails team@example.com \
  --events deployment-failed
```

---

## 3. Basic Logging Strategy

### 3.1 Log Levels

**Production Log Level:** `info` (configured via `LOG_LEVEL=info`)

**Log Levels Used:**
- **ERROR**: Critical failures requiring immediate attention
- **WARN**: Issues that should be investigated but not blocking
- **INFO**: Important events (transactions, user actions)
- **DEBUG**: Disabled in production (set `LOG_LEVEL=info`)

### 3.2 Structured Logging

**Current Implementation:**
- Winston logger with JSON formatting
- Logs include: timestamp, level, message, metadata
- Automatic request ID tracking via middleware

**Example Log Entry:**
```json
{
  "timestamp": "2025-12-05T10:15:30.123Z",
  "level": "info",
  "message": "Atomic swap completed",
  "metadata": {
    "offerId": "123",
    "maker": "AoCpvu...",
    "taker": "5VsKp5...",
    "signature": "2eYzV..."
  }
}
```

### 3.3 Key Events to Log

**Transaction Events (INFO level):**
- Swap offer created
- Swap offer accepted
- Transaction confirmed on-chain
- Fee collected to treasury

**Error Events (ERROR level):**
- Transaction simulation failed
- On-chain transaction failed
- Database query timeout
- RPC connection failed
- Nonce account issues

**Security Events (WARN level):**
- Failed authentication attempts on `/test` page
- Unauthorized zero-fee swap attempts
- Invalid API key usage
- Rate limit exceeded

**Performance Events (INFO level):**
- Slow database queries (>1s)
- Slow API responses (>5s)
- High memory usage warnings

### 3.4 Viewing Logs

**Real-time logs:**
```bash
# Via doctl
doctl apps logs <app-id> --type=run --follow

# Via web console
DigitalOcean → Apps → Production → Logs → Run Logs
```

**Searching logs:**
```bash
# Filter by level
doctl apps logs <app-id> --type=run | grep "ERROR"

# Filter by event
doctl apps logs <app-id> --type=run | grep "swap completed"

# Last 100 lines
doctl apps logs <app-id> --type=run --tail=100
```

---

## 4. System Health Dashboard

### 4.1 DigitalOcean Built-in Metrics

**Available via Web Console:**
- Go to: Apps → Production → Insights

**Metrics Tracked:**
- CPU usage (%)
- Memory usage (MB)
- Network traffic (in/out)
- HTTP requests per second
- HTTP error rate (%)
- HTTP response time (avg, p95, p99)

**Refresh Rate:** Real-time (1-minute intervals)

### 4.2 Database Metrics (DigitalOcean Managed DB)

**Available via Web Console:**
- Go to: Databases → Production PostgreSQL → Metrics

**Metrics Tracked:**
- CPU usage (%)
- Memory usage (%)
- Disk usage (%)
- Active connections
- Queries per second
- Query execution time

### 4.3 Quick Health Check Script

Create a simple health check script for manual verification:

```bash
#!/bin/bash
# scripts/check-production-health.sh

echo "🔍 Production Health Check"
echo "=========================="

# API Health
echo -n "API Health: "
if curl -sf https://api.easyescrow.ai/health > /dev/null; then
  echo "✅ OK"
else
  echo "❌ FAILED"
fi

# Database Health (via API)
echo -n "Database: "
if curl -sf https://api.easyescrow.ai/api/health | grep -q "database.*ok"; then
  echo "✅ OK"
else
  echo "❌ FAILED"
fi

# Redis Health (via API)
echo -n "Redis: "
if curl -sf https://api.easyescrow.ai/api/health | grep -q "redis.*ok"; then
  echo "✅ OK"
else
  echo "❌ FAILED"
fi

# Recent error rate
echo -n "Error Rate: "
ERROR_COUNT=$(doctl apps logs <app-id> --type=run --tail=100 | grep -c "ERROR")
if [ $ERROR_COUNT -lt 5 ]; then
  echo "✅ Low ($ERROR_COUNT errors in last 100 logs)"
else
  echo "⚠️  High ($ERROR_COUNT errors in last 100 logs)"
fi

echo "=========================="
echo "✅ Health check complete"
```

**Usage:**
```bash
chmod +x scripts/check-production-health.sh
./scripts/check-production-health.sh
```

---

## 5. Implementation Checklist

### Pre-Deployment
- [ ] Configure health check endpoint in `.do/app-production.yaml`
- [ ] Set production log level to `info` via `LOG_LEVEL=info`
- [ ] Verify Winston logger is configured for JSON output
- [ ] Test health check endpoint locally

### Deployment
- [ ] Verify health checks are passing in DigitalOcean console
- [ ] Confirm logs are flowing correctly
- [ ] Check initial metrics in Insights dashboard

### Post-Deployment (First Hour)
- [ ] Set up DigitalOcean alert policies (deployment failures, high errors)
- [ ] Verify email notifications are working
- [ ] Monitor logs for any ERROR or WARN events
- [ ] Check application metrics (CPU, memory, response times)

### Post-Deployment (First Week)
- [ ] Review log patterns daily
- [ ] Check for any recurring errors or warnings
- [ ] Monitor database and Redis performance
- [ ] Adjust alert thresholds if needed

---

## 6. Incident Response (Basic)

### When Alert Fires

**Step 1: Check Dashboard**
- DigitalOcean → Apps → Production → Insights
- Look for: High error rate, CPU spike, memory spike

**Step 2: Check Recent Logs**
```bash
doctl apps logs <app-id> --type=run --tail=50
```
- Look for ERROR entries
- Note timestamps and patterns

**Step 3: Check Component Health**
- DigitalOcean → Apps → Production → Components
- Verify all components are "Active"
- Check for recent restarts

**Step 4: Basic Troubleshooting**
| Issue | Quick Fix |
|-------|-----------|
| API Down | Restart app via DigitalOcean console |
| High Error Rate | Check logs for root cause, may need code fix |
| Database Slow | Check database metrics, may need scaling |
| Memory Leak | Restart app, investigate via logs |

**Step 5: Escalate if Needed**
- If issue persists >10 minutes
- If multiple components failing
- If data integrity concerns
- If security incident suspected

### Common Issues & Fixes

**API Not Responding:**
```bash
# Check if app is running
doctl apps list | grep production

# Restart app
doctl apps restart <app-id>

# Check logs
doctl apps logs <app-id> --type=run --tail=100
```

**Database Connection Errors:**
```bash
# Check database status
doctl databases list | grep production

# Check connection string
doctl databases connection <db-id>

# Verify DATABASE_URL secret is set correctly
# Go to: Apps → Production → Settings → Environment Variables
```

**High Memory Usage:**
```bash
# Check current usage
# Go to: Apps → Production → Insights

# Scale up if needed
# Go to: Apps → Production → Settings → Resources
# Increase memory allocation
```

---

## 7. Monitoring Tools (Optional Future Enhancements)

**If basic monitoring is insufficient, consider:**

### 7.1 Uptime Monitoring
- **UptimeRobot** (free tier available)
- Monitor: `/health` endpoint every 5 minutes
- Alert via: Email, Slack, SMS

### 7.2 Error Tracking
- **Sentry** (free tier: 5k events/month)
- Automatic error capture and grouping
- Stack traces and context
- Integration: `npm install @sentry/node`

### 7.3 APM (Application Performance Monitoring)
- **Datadog** (free trial, then paid)
- **New Relic** (free tier available)
- Provides: Distributed tracing, detailed metrics, custom dashboards

### 7.4 Log Aggregation
- **Papertrail** (free tier: 50MB/month)
- **Loggly** (free tier: 200MB/day)
- Centralized log search and alerting

---

## 8. Quick Reference Commands

### View Logs
```bash
# Real-time logs
doctl apps logs <app-id> --type=run --follow

# Recent errors
doctl apps logs <app-id> --type=run --tail=100 | grep ERROR

# Deployment logs
doctl apps logs <app-id> --type=build
```

### Check Status
```bash
# App status
doctl apps list

# Component status
doctl apps get <app-id>

# Database status
doctl databases list
```

### Restart Services
```bash
# Restart entire app
doctl apps restart <app-id>

# Redeploy from latest commit
doctl apps create-deployment <app-id>
```

---

## 9. Monitoring Costs (Estimated)

**Using DigitalOcean Built-in Tools Only:**
- **Cost:** $0/month (included with app hosting)
- **Capabilities:** Basic health checks, metrics, logs, alerts

**Adding Optional Tools:**
- **UptimeRobot:** $0/month (free tier, 50 monitors)
- **Sentry:** $0-26/month (free tier or team plan)
- **Total Estimated:** $0-26/month for enhanced monitoring

**Recommendation:** Start with free DigitalOcean tools, add paid tools only if needed.

---

## 10. Success Criteria

**Basic monitoring is considered successful if:**
- ✅ Health check endpoint responds within 5 seconds
- ✅ Critical alerts fire within 2 minutes of failure
- ✅ Logs are accessible and searchable
- ✅ Dashboard shows key metrics (CPU, memory, error rate)
- ✅ Team can diagnose and resolve issues within 15 minutes

**Review after 1 week of production:**
- Evaluate alert noise (too many false positives?)
- Check if logging level is appropriate
- Assess need for enhanced monitoring tools

---

## Summary

This basic monitoring strategy provides:
- ✅ Automated health checks with auto-restart
- ✅ Email alerts for critical failures
- ✅ Structured logging for debugging
- ✅ Built-in metrics dashboard
- ✅ Simple incident response process
- ✅ Zero additional cost

**Start simple. Monitor. Iterate based on actual production needs.**

---

**Last Updated:** December 5, 2025  
**Next Review:** After 1 week of production usage

