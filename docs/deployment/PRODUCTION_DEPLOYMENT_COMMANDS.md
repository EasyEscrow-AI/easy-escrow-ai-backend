# Production Deployment - Quick Command Reference

This is a condensed command reference for deploying to production. For detailed explanations, see [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md).

## Step 1: Create DigitalOcean App

```bash
# Authenticate
doctl auth init

# Verify authentication
doctl account get

# Validate YAML
npx js-yaml production-app.yaml

# Create the app (⚠️ CREATES LIVE PRODUCTION ENVIRONMENT)
doctl apps create --spec production-app.yaml

# Save the app ID
export PROD_APP_ID="<app-id-from-output>"
```

## Step 2: Set Environment Variables

Go to: https://cloud.digitalocean.com/apps → `easyescrow-backend-production` → Settings → Environment Variables

### Critical Secrets (Set these first)

```bash
# Solana Mainnet
SOLANA_RPC_URL = <your-mainnet-rpc-url>
MAINNET_PROD_PROGRAM_ID = <your-deployed-program-id>
ESCROW_PROGRAM_ID = <same-as-above>
MAINNET_PROD_ADMIN_PRIVATE_KEY = <base58-private-key>
MAINNET_PROD_ADMIN_ADDRESS = <base58-public-key>
MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY = <base58-private-key>
MAINNET_PROD_FEE_COLLECTOR_ADDRESS = <base58-public-key>

# Database & Cache
DATABASE_URL = <postgresql-connection-string>
DATABASE_POOL_URL = <postgresql-pooled-connection-string>
REDIS_URL = <redis-connection-string>

# Security
JWT_SECRET = $(openssl rand -base64 64)
WEBHOOK_SECRET = $(openssl rand -base64 32)

# Storage
DO_SPACES_KEY = <spaces-access-key-id>
DO_SPACES_SECRET = <spaces-secret-access-key>

# Email
SMTP_HOST = <smtp-server-hostname>
SMTP_USER = <smtp-username>
SMTP_PASS = <smtp-password>

# Monitoring (Optional)
SENTRY_DSN = <sentry-project-dsn>
SLACK_WEBHOOK = <slack-webhook-url>
DISCORD_WEBHOOK = <discord-webhook-url>
```

### Redeploy After Setting Secrets

```bash
doctl apps create-deployment $PROD_APP_ID
```

## Step 3: Configure Cloudflare DNS

1. Go to: https://dash.cloudflare.com/ → `easyescrow.ai` → DNS → Records
2. Add CNAME record:
   - **Type:** CNAME
   - **Name:** api
   - **Target:** easyescrow-backend-production.ondigitalocean.app
   - **Proxy status:** ✅ Proxied (orange cloud)

3. Set SSL mode to **Full (strict)**: SSL/TLS → Overview

### Verify DNS

```bash
nslookup api.easyescrow.ai
dig api.easyescrow.ai
curl -I https://api.easyescrow.ai
```

## Step 4: Add Custom Domain in DigitalOcean

1. Go to: https://cloud.digitalocean.com/apps → `easyescrow-backend-production`
2. Settings → Domains → Add Domain
3. Enter: `api.easyescrow.ai`
4. Wait for SSL certificate (5-10 minutes)

### Verify Domain

```bash
doctl apps get $PROD_APP_ID | grep -i certificate
curl -vI https://api.easyescrow.ai/health
```

## Step 5: Configure Monitoring

### DigitalOcean Alerts

1. Settings → Alerts → Enable all alerts
2. Settings → Alert contacts → Add email addresses

### Cloudflare Rate Limiting

1. Security → WAF → Rate limiting rules
2. Create rule: Block after 60 requests/minute to `/api/*`

## Verification Commands

```bash
# Health check
curl https://api.easyescrow.ai/health

# Database connectivity
curl https://api.easyescrow.ai/api/v1/agreements

# Solana RPC
curl https://api.easyescrow.ai/api/v1/solana/status

# SSL certificate
openssl s_client -connect api.easyescrow.ai:443 -servername api.easyescrow.ai

# Load balancing (should see different request IDs)
for i in {1..10}; do curl -I https://api.easyescrow.ai/health | grep x-request-id; done
```

## Common Operations

```bash
# View logs
doctl apps logs $PROD_APP_ID --type run --follow

# View build logs
doctl apps logs $PROD_APP_ID --type build --follow

# List deployments
doctl apps list-deployments $PROD_APP_ID

# Rollback
doctl apps create-deployment $PROD_APP_ID --from-deployment <deployment-id>

# Update app spec
doctl apps update $PROD_APP_ID --spec production-app.yaml

# Scale instances
# Edit production-app.yaml: change instance_count to 3
doctl apps update $PROD_APP_ID --spec production-app.yaml
```

## Troubleshooting

```bash
# Deployment failed - check logs
doctl apps logs $PROD_APP_ID --type build --tail 200

# Health check failed - check runtime logs
doctl apps logs $PROD_APP_ID --type run --tail 100

# DNS not resolving
dig api.easyescrow.ai
nslookup api.easyescrow.ai 1.1.1.1

# High error rate
doctl apps logs $PROD_APP_ID --type run --tail 200 | grep ERROR
```

## Production Readiness Checklist

Before going live:

- [ ] All secrets configured in DO App Platform
- [ ] Database migrations completed
- [ ] Health endpoint responding
- [ ] SSL certificate valid
- [ ] DNS resolves correctly
- [ ] Rate limiting configured
- [ ] CORS allows only production domains
- [ ] Swagger disabled
- [ ] Monitoring alerts enabled
- [ ] 2 instances running
- [ ] Load testing completed

## Emergency Contacts

- **DigitalOcean Support:** https://cloud.digitalocean.com/support
- **Cloudflare Support:** https://dash.cloudflare.com/support
- **On-Call Engineer:** [Add contact info]

---

**See [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) for detailed explanations.**

