# Production Deployment Guide - EasyEscrow Backend

This guide walks through the complete production deployment process for the EasyEscrow backend to DigitalOcean App Platform.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Create DigitalOcean App](#step-1-create-digitalocean-app)
3. [Step 2: Configure Environment Variables](#step-2-configure-environment-variables)
4. [Step 3: Configure Cloudflare DNS](#step-3-configure-cloudflare-dns)
5. [Step 4: Add Custom Domain](#step-4-add-custom-domain)
6. [Step 5: Configure Security & Monitoring](#step-5-configure-security--monitoring)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **doctl** (DigitalOcean CLI) - [Install Guide](https://docs.digitalocean.com/reference/doctl/how-to/install/)
- **Cloudflare account** with access to `easyescrow.ai` domain
- **Access to production secrets** (stored securely)

### Required Resources

From Task 42 (Production Database Infrastructure), you should have:
- ✅ PostgreSQL managed database (`easyescrow_prod`)
- ✅ Redis managed instance
- ✅ DigitalOcean Spaces bucket (`easyescrow-production`)
- ✅ Database credentials and connection strings
- ✅ Spaces access keys

### Production Secrets Checklist

Before deploying, ensure you have all these secrets ready:

#### Solana Mainnet Configuration
- [ ] `MAINNET_PROD_PROGRAM_ID` - Deployed program ID on mainnet
- [ ] `MAINNET_PROD_ADMIN_PRIVATE_KEY` - Admin wallet private key
- [ ] `MAINNET_PROD_ADMIN_ADDRESS` - Admin wallet address
- [ ] `MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY` - Fee collector private key
- [ ] `MAINNET_PROD_FEE_COLLECTOR_ADDRESS` - Fee collector address
- [ ] `SOLANA_RPC_URL` - Premium RPC URL (Helius/QuickNode/Triton)

#### Database & Cache
- [ ] `DATABASE_URL` - PostgreSQL connection string (easyescrow_prod)
- [ ] `DATABASE_POOL_URL` - PostgreSQL pooled connection string
- [ ] `REDIS_URL` - Redis connection string

#### Security & Authentication
- [ ] `JWT_SECRET` - Generate with: `openssl rand -base64 64`
- [ ] `WEBHOOK_SECRET` - Generate with: `openssl rand -base64 32`

#### Storage (DigitalOcean Spaces)
- [ ] `DO_SPACES_KEY` - Spaces access key ID
- [ ] `DO_SPACES_SECRET` - Spaces secret access key

#### Email (Production SMTP)
- [ ] `SMTP_HOST` - Production SMTP server
- [ ] `SMTP_USER` - SMTP username
- [ ] `SMTP_PASS` - SMTP password

#### Monitoring & Notifications
- [ ] `SENTRY_DSN` - Sentry project DSN
- [ ] `SLACK_WEBHOOK` - Slack webhook URL for alerts (optional)
- [ ] `DISCORD_WEBHOOK` - Discord webhook URL for alerts (optional)

---

## Step 1: Create DigitalOcean App

### 1.1 Authenticate with DigitalOcean

```bash
# Authenticate doctl
doctl auth init

# Verify authentication
doctl account get
```

### 1.2 Verify Production App Spec

```bash
# Validate the YAML syntax
npx js-yaml production-app.yaml

# Optional: Validate with doctl (requires doctl 1.92+)
doctl apps spec validate production-app.yaml
```

### 1.3 Create the Production App

**⚠️ WARNING: This creates a live production environment and incurs costs.**

```bash
# Create the app on DigitalOcean
doctl apps create --spec production-app.yaml

# Expected output:
# Notice: App created
# ID: <app-id>
# Name: easyescrow-backend-production
# ...
```

**Save the App ID** - You'll need this for updates:

```bash
export PROD_APP_ID="<app-id-from-output>"
```

### 1.4 Monitor Initial Deployment

```bash
# Get app details
doctl apps get $PROD_APP_ID

# Watch deployment logs
doctl apps logs $PROD_APP_ID --type build --follow

# Check deployment status
doctl apps list
```

The initial deployment will **FAIL** because environment secrets are not yet configured. This is expected.

---

## Step 2: Configure Environment Variables

All secrets must be set in the DigitalOcean App Platform console.

### 2.1 Access Environment Variables

**Option A: Web Console (Recommended)**

1. Go to: https://cloud.digitalocean.com/apps
2. Click on `easyescrow-backend-production`
3. Navigate to: **Settings → Environment Variables**
4. For the `api` component, edit environment variables

**Option B: CLI (For automation)**

```bash
# Set a single secret
doctl apps update $PROD_APP_ID --spec production-app.yaml

# Then set secrets via web console
# (doctl doesn't support setting secret values directly via CLI)
```

### 2.2 Required Secrets to Configure

In the DigitalOcean console, set these environment variables with `type: SECRET`:

#### Solana Mainnet (Priority 1 - Critical)

```
SOLANA_RPC_URL = <your-mainnet-rpc-url>
MAINNET_PROD_PROGRAM_ID = <your-deployed-program-id>
ESCROW_PROGRAM_ID = <same-as-above>
MAINNET_PROD_ADMIN_PRIVATE_KEY = <base58-private-key>
MAINNET_PROD_ADMIN_ADDRESS = <base58-public-key>
MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY = <base58-private-key>
MAINNET_PROD_FEE_COLLECTOR_ADDRESS = <base58-public-key>
```

#### Database & Cache (Priority 1 - Critical)

```
DATABASE_URL = <postgresql-connection-string>
DATABASE_POOL_URL = <postgresql-pooled-connection-string>
REDIS_URL = <redis-connection-string>
```

#### Security (Priority 1 - Critical)

```bash
# Generate JWT secret
JWT_SECRET = <output-of: openssl rand -base64 64>

# Generate webhook secret
WEBHOOK_SECRET = <output-of: openssl rand -base64 32>
```

#### Storage (Priority 2 - Important)

```
DO_SPACES_KEY = <spaces-access-key-id>
DO_SPACES_SECRET = <spaces-secret-access-key>
```

#### Email (Priority 2 - Important)

```
SMTP_HOST = <smtp-server-hostname>
SMTP_USER = <smtp-username>
SMTP_PASS = <smtp-password>
```

#### Monitoring (Priority 3 - Optional but Recommended)

```
SENTRY_DSN = <sentry-project-dsn>
SLACK_WEBHOOK = <slack-webhook-url>
DISCORD_WEBHOOK = <discord-webhook-url>
```

### 2.3 Verify Environment Variables

After setting all secrets:

```bash
# List all environment variables (values are hidden for secrets)
doctl apps spec get $PROD_APP_ID
```

### 2.4 Trigger Redeployment

After setting all environment variables:

```bash
# Trigger a new deployment
doctl apps create-deployment $PROD_APP_ID

# Watch the deployment
doctl apps logs $PROD_APP_ID --type build --follow
```

**Expected Flow:**
1. Pre-deploy tests run (linting, unit tests)
2. Database migrations execute
3. Docker image builds
4. Health check passes on `/health` endpoint
5. Deployment marked as successful

---

## Step 3: Configure Cloudflare DNS

### 3.1 Get DigitalOcean App URL

```bash
# Get the app's default URL
doctl apps get $PROD_APP_ID --format DefaultIngress

# Expected output: easyescrow-backend-production.ondigitalocean.app
```

### 3.2 Add DNS Record in Cloudflare

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select domain: `easyescrow.ai`
3. Navigate to: **DNS → Records**
4. Click **Add record**

**DNS Configuration:**

```
Type: CNAME
Name: api
Target: easyescrow-backend-production.ondigitalocean.app
Proxy status: ✅ Proxied (orange cloud)
TTL: Auto
```

**Why Proxied?**
- DDoS protection
- Cloudflare WAF (Web Application Firewall)
- Analytics and caching
- Automatic HTTPS

### 3.3 Configure Cloudflare SSL/TLS

1. Navigate to: **SSL/TLS → Overview**
2. Set encryption mode: **Full (strict)**

**Why Full (strict)?**
- Encrypts traffic between Cloudflare and DigitalOcean
- Validates DigitalOcean's SSL certificate
- Maximum security for production

### 3.4 Verify DNS Propagation

```bash
# Check DNS resolution
nslookup api.easyescrow.ai

# Expected output should include Cloudflare IPs

# Check with dig
dig api.easyescrow.ai

# Test HTTP connection
curl -I https://api.easyescrow.ai
```

DNS propagation can take **5-30 minutes**.

---

## Step 4: Add Custom Domain in DigitalOcean

### 4.1 Add Domain via Web Console

1. Go to: https://cloud.digitalocean.com/apps
2. Click on `easyescrow-backend-production`
3. Navigate to: **Settings → Domains**
4. Click **Add Domain**
5. Enter: `api.easyescrow.ai`
6. Click **Add Domain**

### 4.2 Verify Domain Ownership

DigitalOcean will automatically verify the domain via DNS lookup. This should succeed immediately if Cloudflare DNS is configured correctly.

**Expected Status:** `Active` with green checkmark

### 4.3 Enable HTTPS

DigitalOcean automatically provisions a Let's Encrypt SSL certificate for the custom domain. This takes **5-10 minutes**.

**Check Certificate Status:**

```bash
# Get app details including SSL status
doctl apps get $PROD_APP_ID

# Look for:
# Domain: api.easyescrow.ai
# Status: ACTIVE
# Certificate Status: ACTIVE
```

### 4.4 Verify HTTPS

```bash
# Test HTTPS connection
curl -vI https://api.easyescrow.ai/health

# Expected:
# HTTP/2 200
# SSL certificate valid
# Health check response
```

---

## Step 5: Configure Security & Monitoring

### 5.1 Configure Cloudflare Security Rules

#### A. Rate Limiting

1. Navigate to: **Security → WAF → Rate limiting rules**
2. Create rule: **API Rate Limiting**

```
Rule name: API Rate Limiting
If incoming requests match:
  - Hostname equals "api.easyescrow.ai"
  - Path starts with "/api/"

Then:
  - Take action: Block
  - For: 1 minute
  - When rate exceeds: 60 requests per minute
```

#### B. Firewall Rules (Optional)

Create custom rules to block malicious traffic:

1. Navigate to: **Security → WAF → Custom rules**
2. Add rules for:
   - Block known bad user agents
   - Challenge suspicious countries (optional)
   - Block requests without proper headers

### 5.2 Configure DigitalOcean Monitoring

#### A. Enable App Alerts

1. Navigate to: **Settings → Alerts**
2. Enable alerts for:
   - ✅ Deployment failed
   - ✅ Domain failed
   - ✅ Deployment live
   - ✅ CPU utilization > 80%
   - ✅ Memory utilization > 80%

#### B. Add Alert Contacts

1. Navigate to: **Settings → Alert contacts**
2. Add email addresses for notifications
3. Optional: Add Slack/PagerDuty integrations

### 5.3 Configure Sentry (Error Tracking)

1. Create new Sentry project: **easyescrow-backend-production**
2. Copy the DSN
3. Set `SENTRY_DSN` in DigitalOcean environment variables
4. Redeploy app

```bash
doctl apps create-deployment $PROD_APP_ID
```

### 5.4 Set Up Log Aggregation (Optional)

Consider integrating with:
- **Datadog** - Full observability platform
- **LogDNA** - Log management
- **Papertrail** - Simple log aggregation

DigitalOcean supports log forwarding to these services.

---

## Post-Deployment Verification

### Verify All Systems

Run these checks after deployment:

#### 1. Health Check

```bash
curl https://api.easyescrow.ai/health
```

**Expected Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-10-27T...",
  "uptime": 12345,
  "environment": "production",
  "version": "1.0.0",
  "database": "connected",
  "redis": "connected",
  "solana": "connected"
}
```

#### 2. Database Connectivity

```bash
# Test a simple API endpoint that requires database
curl https://api.easyescrow.ai/api/v1/agreements
```

#### 3. Solana RPC Connectivity

```bash
# Test Solana status endpoint
curl https://api.easyescrow.ai/api/v1/solana/status
```

#### 4. Redis Connectivity

```bash
# Test an endpoint that uses caching
curl -I https://api.easyescrow.ai/api/v1/stats
```

#### 5. SSL Certificate

```bash
# Check SSL certificate validity
openssl s_client -connect api.easyescrow.ai:443 -servername api.easyescrow.ai

# Look for:
# Certificate chain valid
# Expiration date in the future
```

#### 6. Load Balancing (2 Instances)

```bash
# Make multiple requests and check X-Request-ID header
for i in {1..10}; do
  curl -I https://api.easyescrow.ai/health | grep -i x-request-id
done
```

Different request IDs indicate load balancing is working.

#### 7. Rate Limiting

```bash
# Test rate limiting (should get 429 after limit)
for i in {1..150}; do
  curl -I https://api.easyescrow.ai/api/v1/agreements
done
```

Should see `HTTP 429 Too Many Requests` after threshold.

---

## Troubleshooting

### Deployment Fails

**Symptom:** Build or deployment fails

**Check:**

```bash
# View build logs
doctl apps logs $PROD_APP_ID --type build

# View deployment logs
doctl apps logs $PROD_APP_ID --type deploy

# View runtime logs
doctl apps logs $PROD_APP_ID --type run --follow
```

**Common Issues:**

1. **Missing environment variables** - Verify all secrets are set
2. **Database migration failed** - Check DATABASE_URL is correct
3. **Docker build failed** - Check Dockerfile syntax
4. **Health check failed** - Verify app starts successfully

### Health Check Fails

**Symptom:** Deployment succeeds but marked unhealthy

**Check:**

```bash
# Check runtime logs
doctl apps logs $PROD_APP_ID --type run --tail 100

# Look for errors in health check endpoint
```

**Verify:**
- Database connection works
- Redis connection works
- Solana RPC connection works
- Port 8080 is exposed

### Domain Not Resolving

**Symptom:** `api.easyescrow.ai` doesn't resolve

**Check:**

```bash
# Check DNS propagation
dig api.easyescrow.ai

# Check Cloudflare DNS
nslookup api.easyescrow.ai 1.1.1.1

# Test from multiple locations
# Use: https://dnschecker.org
```

**Fix:**
- Verify CNAME record in Cloudflare
- Ensure "Proxied" is enabled (orange cloud)
- Wait for DNS propagation (up to 30 minutes)

### SSL Certificate Issues

**Symptom:** Certificate not valid or not issued

**Check:**

```bash
# Check certificate status in DigitalOcean
doctl apps get $PROD_APP_ID | grep -i certificate
```

**Fix:**
- Verify domain ownership in DigitalOcean
- Ensure DNS is properly configured
- Wait for Let's Encrypt issuance (5-10 minutes)
- Check Cloudflare SSL mode is "Full (strict)"

### High Error Rate

**Symptom:** Many 500 errors in logs

**Check:**

```bash
# View recent errors
doctl apps logs $PROD_APP_ID --type run --tail 200 | grep ERROR

# Check Sentry dashboard for error details
```

**Common Causes:**
- Database connection pool exhausted
- Redis connection issues
- Solana RPC rate limiting
- Invalid environment variables

### Performance Issues

**Symptom:** Slow response times

**Check:**

```bash
# View app metrics
doctl monitoring alert list

# Check CPU/Memory usage
doctl apps get $PROD_APP_ID
```

**Solutions:**
- Scale up instance size (from basic-xxs to basic-xs or higher)
- Increase instance count (from 2 to 3+)
- Optimize database queries
- Implement caching strategies
- Use Redis for session storage

---

## Maintenance & Updates

### Deploying Updates

```bash
# Update app spec
doctl apps update $PROD_APP_ID --spec production-app.yaml

# Trigger new deployment
doctl apps create-deployment $PROD_APP_ID
```

### Rollback to Previous Deployment

```bash
# List deployments
doctl apps list-deployments $PROD_APP_ID

# Rollback to specific deployment
doctl apps create-deployment $PROD_APP_ID --from-deployment <deployment-id>
```

### Zero-Downtime Deployments

DigitalOcean automatically performs rolling updates:
1. New instances start
2. Health checks pass
3. Traffic shifts to new instances
4. Old instances terminate

With 2+ instances, deployments have zero downtime.

---

## Production Readiness Checklist

Before going live, verify:

- [ ] All environment variables configured
- [ ] Database migrations completed successfully
- [ ] Health check endpoint responds correctly
- [ ] SSL certificate is valid and trusted
- [ ] DNS resolves to correct IP
- [ ] Rate limiting works correctly
- [ ] CORS allows only production domains
- [ ] Swagger documentation disabled
- [ ] Logging level set to `info` (not `debug`)
- [ ] Sentry error tracking configured
- [ ] Monitoring alerts configured
- [ ] 2 instances running (load balanced)
- [ ] Database connection pooling enabled
- [ ] Redis connectivity verified
- [ ] Solana mainnet RPC working
- [ ] All critical endpoints tested
- [ ] Load testing completed
- [ ] Backup strategy in place
- [ ] Incident response plan documented

---

## Support & Resources

- **DigitalOcean App Platform Docs:** https://docs.digitalocean.com/products/app-platform/
- **Cloudflare DNS Docs:** https://developers.cloudflare.com/dns/
- **Solana Mainnet RPC Providers:** https://solana.com/rpc
- **Sentry Docs:** https://docs.sentry.io/

---

## Next Steps

After successful deployment:

1. **Monitor the production environment** for 24-48 hours
2. **Run production smoke tests** to verify all functionality
3. **Set up automated health checks** (e.g., UptimeRobot)
4. **Create runbook** for common incidents
5. **Schedule regular security audits**
6. **Plan scaling strategy** for growth

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-27  
**Maintained By:** EasyEscrow Team

