# Production App Information

## App Details

- **App ID:** `a6e6452b-1ec6-4316-82fe-e4069d089b49`
- **App Name:** `easyescrow-backend-production`
- **Region:** sgp1 (Singapore)
- **Created:** 2025-10-27 03:20:24 UTC
- **GitHub Branch:** master
- **Instance Size:** basic-xs (1 instance)
- **Status:** Created (pending environment configuration)

## Quick Commands

```powershell
# Set app ID variable
$PROD_APP_ID = "a6e6452b-1ec6-4316-82fe-e4069d089b49"

# Get app status
doctl apps get $PROD_APP_ID

# View runtime logs
doctl apps logs $PROD_APP_ID --type run --follow

# View build logs
doctl apps logs $PROD_APP_ID --type build

# Trigger redeployment
doctl apps create-deployment $PROD_APP_ID

# Update app spec
doctl apps update $PROD_APP_ID --spec production-app-no-jobs.yaml
```

## URLs

- **Default URL:** `easyescrow-backend-production.ondigitalocean.app`
- **Custom Domain (to configure):** `api.easyescrow.ai`

## Configuration Status

- [x] App created on DigitalOcean
- [ ] Environment secrets configured
- [ ] Successful deployment
- [ ] Cloudflare DNS configured
- [ ] Custom domain added
- [ ] Security & monitoring configured

## Next Steps

### 1. Configure Environment Secrets (CRITICAL)

Go to: https://cloud.digitalocean.com/apps/a6e6452b-1ec6-4316-82fe-e4069d089b49/settings

Navigate to: **Environment Variables** → **api component**

**Required Secrets:**

```bash
# Solana Mainnet (CRITICAL)
SOLANA_RPC_URL = <mainnet-rpc-url>
MAINNET_PROD_PROGRAM_ID = <program-id>
ESCROW_PROGRAM_ID = <same-as-above>
MAINNET_PROD_ADMIN_PRIVATE_KEY = <private-key>
MAINNET_PROD_ADMIN_ADDRESS = <public-key>
MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY = <private-key>
MAINNET_PROD_FEE_COLLECTOR_ADDRESS = <public-key>

# Database & Cache (CRITICAL)
DATABASE_URL = <postgresql-connection>
DATABASE_POOL_URL = <pooled-connection>
REDIS_URL = <redis-connection>

# Security (CRITICAL)
JWT_SECRET = $(openssl rand -base64 64)
WEBHOOK_SECRET = $(openssl rand -base64 32)

# Storage (IMPORTANT)
DO_SPACES_KEY = <access-key>
DO_SPACES_SECRET = <secret-key>

# Email (IMPORTANT)
SMTP_HOST = <smtp-server>
SMTP_USER = <smtp-username>
SMTP_PASS = <smtp-password>

# Monitoring (OPTIONAL)
SENTRY_DSN = <sentry-dsn>
SLACK_WEBHOOK = <slack-url>
DISCORD_WEBHOOK = <discord-url>
```

After setting secrets, trigger redeployment:
```bash
doctl apps create-deployment $PROD_APP_ID
```

### 2. Configure Cloudflare DNS

See: [PRODUCTION_DEPLOYMENT_GUIDE.md](docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md#step-3-configure-cloudflare-dns)

### 3. Add Custom Domain

See: [PRODUCTION_DEPLOYMENT_GUIDE.md](docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md#step-4-add-custom-domain-in-digitalocean)

## Important Notes

- **Initial deployment failed** - Expected! App needs environment secrets to start
- **Basic tier limitations:** Only 1 instance supported (horizontal scaling requires Professional tier)
- **PRE_DEPLOY jobs:** Not included in initial creation (can add via web console)
- **Default alerts:** Only deployment alerts configured (CPU/memory alerts via web console)

## Documentation

- [Complete Deployment Guide](docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Quick Command Reference](docs/deployment/PRODUCTION_DEPLOYMENT_COMMANDS.md)
- [App Spec](production-app-no-jobs.yaml)

---

**Last Updated:** 2025-10-27

