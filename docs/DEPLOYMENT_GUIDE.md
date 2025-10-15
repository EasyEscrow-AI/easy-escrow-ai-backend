# DigitalOcean Deployment Guide

Complete guide for deploying EasyEscrow.ai backend to DigitalOcean App Platform with managed databases.

## 🌍 Infrastructure Overview

### Deployed Resources (Singapore - sgp1)

| Resource | Type | Cost | Status |
|----------|------|------|--------|
| **VPC Network** | Network | FREE | ✅ Created |
| **PostgreSQL STAGING** | db-s-1vcpu-1gb | $15/mo | ✅ Creating |
| **PostgreSQL PROD** | db-s-1vcpu-1gb | $15/mo | ✅ Creating |
| **Redis (Upstash)** | Managed | FREE-$15/mo | ⚠️ Setup Required |
| **Spaces Storage** | Object Storage | $5/mo | ⚠️ Setup Required |
| **App Platform DEV** | basic-xxs | $5/mo | ⚠️ Deploy Pending |
| **App Platform STAGING** | basic-xxs | $5/mo | ⚠️ Deploy Pending |
| **App Platform PROD** | basic-xxs | $5/mo | ⚠️ Deploy Pending |

**Total Estimated Cost: ~$65/month**

---

## 📋 Prerequisites

### 1. Accounts Setup
- ✅ DigitalOcean account with API key
- ⚠️ Upstash account (for Redis) - [Sign up](https://upstash.com)
- ⚠️ GitHub repository access
- ⚠️ Domain name (optional, for custom domain)

### 2. Tools Installed
- ✅ `doctl` - DigitalOcean CLI
- ✅ `redis-cli` - Redis command line tool
- ✅ `psql` - PostgreSQL client (via Docker)
- ✅ Docker Desktop (for local testing)

### 3. Environment Files
- ✅ `.env` - Local development
- ⚠️ `.env.staging` - Staging secrets
- ⚠️ `.env.production` - Production secrets

---

## 🚀 Deployment Steps

### Phase 1: Setup External Services

#### 1.1 Setup Upstash Redis

Since DigitalOcean Redis isn't enabled, we'll use Upstash (FREE tier available).

1. Go to: https://upstash.com
2. Sign up/login
3. Create **two Redis databases**:
   
   **STAGING Redis:**
   - Name: `easyescrow-staging-redis`
   - Region: `ap-southeast-1` (Singapore)
   - Type: Regional
   - Copy: `REDIS_URL`

   **PROD Redis:**
   - Name: `easyescrow-prod-redis`
   - Region: `ap-southeast-1` (Singapore)
   - Type: Regional
   - Copy: `REDIS_URL`

4. Save the connection URLs for later

#### 1.2 Setup DigitalOcean Spaces

Create two separate buckets for different environments:

**For Development/Staging:**
1. Go to: https://cloud.digitalocean.com/spaces
2. Click **"Create a Space"**
3. Configure:
   - **Region**: Singapore (sgp1)
   - **Name**: `easyescrow-test`
   - **Enable CDN**: Yes (optional)
   - **File Listing**: Private
4. Click **Create**

**For Production:**
1. Repeat steps above
2. Configure:
   - **Region**: Singapore (sgp1)
   - **Name**: `easyescrow-storage`
   - **Enable CDN**: Yes (optional)
   - **File Listing**: Private
3. Click **Create**

5. Generate Access Keys:
   - Go to API → **Spaces Keys**
   - Click **Generate New Key**
   - Name: `easyescrow-backend`
   - Save:
     - Access Key ID
     - Secret Key

---

### Phase 2: Wait for PostgreSQL Clusters

Check database status:

```bash
doctl databases list
```

Wait until both databases show `Status: online` (usually 5-10 minutes).

Once online, get connection details:

```bash
# STAGING
doctl databases connection easyescrow-staging-postgres --format URI

# PROD  
doctl databases connection easyescrow-prod-postgres --format URI
```

Save these connection strings!

---

### Phase 3: Configure Database Users (Optional but Recommended)

Create separate application users with limited privileges:

#### 3.1 Connect to STAGING database

```bash
# Get connection string
doctl databases connection easyescrow-staging-postgres --format URI

# Connect via psql
psql "postgresql://doadmin:PASSWORD@host:25060/defaultdb?sslmode=require"
```

#### 3.2 Run setup script

```sql
-- Create application database
CREATE DATABASE easyescrow_staging;

-- Create application user
CREATE USER easyescrow_app WITH PASSWORD 'YOUR_SECURE_PASSWORD';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE easyescrow_staging TO easyescrow_app;

-- Connect to new database
\c easyescrow_staging

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO easyescrow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO easyescrow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO easyescrow_app;
```

Repeat for PROD database (change `easyescrow_staging` to `easyescrow_production`).

---

### Phase 4: Deploy Development Environment

#### 4.1 Create DEV App

```bash
# Deploy DEV app with FREE dev database
doctl apps create --spec .do/app-dev.yaml
```

#### 4.2 Set Environment Variables

Get the APP_ID:
```bash
doctl apps list
```

Set secrets via console:
1. Go to: https://cloud.digitalocean.com/apps
2. Select your DEV app
3. Go to **Settings** → **App-Level Environment Variables**
4. Add:
   - `JWT_SECRET`: (generate with `openssl rand -base64 32`)
   - `SOLANA_RPC_URL`: Your Helius/QuickNode devnet URL
   - `ESCROW_PROGRAM_ID`: Your devnet program ID
   - `USDC_MINT_ADDRESS`: USDC devnet mint address
   - `REDIS_URL`: Your Upstash dev Redis URL
   - `SPACES_ACCESS_KEY_ID`: From Spaces (dev credentials)
   - `SPACES_SECRET_ACCESS_KEY`: From Spaces (dev credentials)
   - `SPACES_BUCKET`: `easyescrow-test` (use test bucket for dev/staging)
   - `SPACES_ENDPOINT`: `https://sgp1.digitaloceanspaces.com`
   - `SPACES_REGION`: `sgp1`

#### 4.3 Trigger Deployment

```bash
# Force redeploy
doctl apps create-deployment <APP_ID>
```

#### 4.4 View Logs

```bash
doctl apps logs <APP_ID> --type run --follow
```

---

### Phase 5: Deploy Staging Environment

#### 5.1 Create STAGING App

```bash
doctl apps create --spec .do/app-staging.yaml
```

#### 5.2 Set Environment Variables

Same as DEV, but use:
- `DATABASE_URL`: Connection string from `easyescrow-staging-postgres`
- `REDIS_URL`: Staging Redis from Upstash
- `SOLANA_NETWORK`: `devnet` or `mainnet-beta`
- Use staging-specific secrets

#### 5.3 Run Database Migrations

```bash
# Get app URL
doctl apps get <APP_ID> --format URL

# SSH into app (if needed)
doctl apps exec <APP_ID> --component api-staging

# Or run migrations locally against staging DB
DATABASE_URL="postgresql://..." npm run migrate:deploy
```

---

### Phase 6: Deploy Production Environment

#### 6.1 Create PROD App

```bash
doctl apps create --spec .do/app.yaml
```

#### 6.2 Set Environment Variables

Use PRODUCTION values:
- `NODE_ENV`: `production`
- `DATABASE_URL`: From `easyescrow-prod-postgres`
- `REDIS_URL`: PROD Redis from Upstash
- `SOLANA_NETWORK`: `mainnet-beta`
- `SOLANA_RPC_URL`: Production RPC endpoint
- Production secrets (different from staging!)

#### 6.3 Run Production Migrations

```bash
# Connect to production database
DATABASE_URL="postgresql://..." npm run migrate:deploy
```

#### 6.4 Add Custom Domain (Optional)

1. Go to App Settings → **Domains**
2. Add domain: `api.easyescrow.ai`
3. Add DNS records:
   ```
   Type: CNAME
   Name: api
   Value: <your-app>.ondigitalocean.app
   TTL: 3600
   ```
4. Wait for SSL certificate provisioning

---

## 🔒 Security Checklist

### Secrets Management
- [ ] All sensitive values stored as App Platform secrets
- [ ] Different secrets for each environment
- [ ] JWT_SECRET is strong (32+ characters)
- [ ] Database passwords rotated regularly
- [ ] API keys have minimal required permissions

### Database Security
- [ ] SSL/TLS enabled (required)
- [ ] Separate users per environment
- [ ] Least-privilege user permissions
- [ ] Trusted sources configured in firewall
- [ ] Automatic backups enabled
- [ ] Point-in-time recovery configured

### Network Security
- [ ] VPC networking enabled
- [ ] Firewall rules configured
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Helmet.js enabled in production

### Application Security
- [ ] Environment-specific configurations
- [ ] Logging and monitoring enabled
- [ ] Health checks configured
- [ ] Auto-restart on failure
- [ ] Alerts configured

---

## 📊 Monitoring & Maintenance

### Health Checks

All environments have health checks configured:
- **Endpoint**: `/health`
- **Initial Delay**: 40-60 seconds
- **Period**: 30 seconds
- **Timeout**: 10 seconds
- **Failure Threshold**: 3

### Viewing Logs

```bash
# Real-time logs
doctl apps logs <APP_ID> --type run --follow

# Build logs
doctl apps logs <APP_ID> --type build

# Deploy logs
doctl apps logs <APP_ID> --type deploy
```

### Metrics

View in console:
1. Go to: https://cloud.digitalocean.com/apps
2. Select app
3. View **Insights** tab for:
   - CPU usage
   - Memory usage
   - Response times
   - Error rates
   - Request counts

### Database Monitoring

```bash
# Check database metrics
doctl databases get <DATABASE_ID>

# View connection info
doctl databases connection <DATABASE_ID>

# List backups
doctl databases backups list <DATABASE_ID>
```

---

## 🔄 CI/CD Workflow

### Automatic Deployments

Configured in `app.yaml`:
```yaml
github:
  repo: VENTURE-AI-LABS/easy-escrow-ai-backend
  branch: master  # or develop, staging
  deploy_on_push: true
```

### Manual Deployments

```bash
# Trigger deployment
doctl apps create-deployment <APP_ID>

# Rollback to previous deployment
doctl apps list-deployments <APP_ID>
doctl apps deployment rollback <APP_ID> <DEPLOYMENT_ID>
```

### Branch Strategy

- `develop` → DEV environment (auto-deploy)
- `staging` → STAGING environment (auto-deploy)
- `master` → PROD environment (auto-deploy after testing)

---

## 🐛 Troubleshooting

### App Won't Start

1. Check logs:
   ```bash
   doctl apps logs <APP_ID> --type run
   ```

2. Common issues:
   - Missing environment variables
   - Database connection failed
   - Health check failing
   - Build errors

### Database Connection Issues

1. Verify DATABASE_URL is set correctly
2. Check database status:
   ```bash
   doctl databases get <DATABASE_ID>
   ```
3. Test connection:
   ```bash
   psql "$DATABASE_URL"
   ```
4. Check firewall rules (Trusted Sources)

### Redis Connection Issues

1. Verify REDIS_URL format
2. Test with redis-cli:
   ```bash
   redis-cli -u "$REDIS_URL"
   PING  # Should return PONG
   ```
3. Check Upstash dashboard for errors

### Build Failures

1. Check build logs:
   ```bash
   doctl apps logs <APP_ID> --type build
   ```
2. Verify Dockerfile is correct
3. Check package.json scripts
4. Ensure all dependencies are listed

### High CPU/Memory Usage

1. Scale up instance size:
   ```yaml
   instance_size_slug: professional-xs  # $12/month
   ```
2. Enable auto-scaling (paid plans only)
3. Optimize queries and caching
4. Review logs for memory leaks

---

## 💰 Cost Optimization

### Current Setup (~$65/month)

| Item | Cost |
|------|------|
| DEV App Platform | $5 |
| STAGING App Platform | $5 |
| PROD App Platform | $5 |
| STAGING PostgreSQL | $15 |
| PROD PostgreSQL | $15 |
| Redis (Upstash FREE) | $0 |
| Spaces | $5 |
| VPC | FREE |
| **Total** | **~$50/month** |

### Optimization Tips

1. **Use DEV database (FREE)**
   - Saves $15/month vs managed cluster
   - Perfect for development

2. **Start with smallest instances**
   - Scale up based on actual usage
   - Monitor metrics before upgrading

3. **Use Upstash FREE tier**
   - 10,000 commands/day
   - Upgrade only when needed

4. **Combine environments (not recommended for prod)**
   - Single app with multiple branches
   - Saves ~$10/month

5. **Use Spaces efficiently**
   - Set lifecycle policies
   - Enable CDN only if needed
   - Clean up old files

---

## 📚 Additional Resources

- [DigitalOcean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [DigitalOcean Managed Databases](https://docs.digitalocean.com/products/databases/)
- [DigitalOcean Spaces](https://docs.digitalocean.com/products/spaces/)
- [Upstash Redis Docs](https://docs.upstash.com/redis)
- [Prisma Deployment Guide](https://www.prisma.io/docs/guides/deployment)

---

## ✅ Post-Deployment Checklist

### Immediate (After Each Deploy)
- [ ] Check health endpoint responds
- [ ] Verify database connection
- [ ] Test Redis connection
- [ ] Check logs for errors
- [ ] Test API endpoints
- [ ] Verify environment variables

### Within 24 Hours
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Review logs for issues
- [ ] Test critical user flows
- [ ] Verify webhook delivery
- [ ] Check blockchain interactions

### Ongoing
- [ ] Daily log review
- [ ] Weekly metrics analysis
- [ ] Monthly cost review
- [ ] Quarterly security audit
- [ ] Regular backup testing
- [ ] Dependency updates

---

## 🆘 Support

### DigitalOcean Support
- Console: https://cloud.digitalocean.com/support
- Community: https://www.digitalocean.com/community
- Docs: https://docs.digitalocean.com

### Internal Support
- Technical Docs: `/docs`
- Database Setup: `/docs/DIGITALOCEAN_SETUP.md`
- Redis Setup: `/docs/REDIS_SETUP.md`
- Spaces Setup: `/docs/SPACES_SETUP.md`
- Environment Variables: `/docs/ENVIRONMENT_VARIABLES.md`

---

**Last Updated**: October 14, 2025  
**Next Review**: When deploying to production

