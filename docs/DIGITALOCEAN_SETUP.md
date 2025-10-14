# DigitalOcean Production Infrastructure Setup Guide

**Project**: EasyEscrow.ai Backend  
**Version**: 1.0.0  
**Last Updated**: October 14, 2025

## Overview

This guide covers the complete setup of production infrastructure on DigitalOcean for the EasyEscrow.ai backend API, including managed database services, caching, file storage, and application deployment.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  DigitalOcean VPC Network                    │
│                                                              │
│  ┌──────────────────┐      ┌─────────────────────────────┐ │
│  │  App Platform    │◄────►│  Managed PostgreSQL         │ │
│  │  api.easyescrow  │      │  - easyescrow_prod          │ │
│  │  .ai             │      │  - easyescrow_stage         │ │
│  │                  │      │  - easyescrow_dev           │ │
│  │  (Auto-scaling)  │      │  (PITR + Daily Snapshots)   │ │
│  └────────┬─────────┘      └─────────────────────────────┘ │
│           │                                                  │
│           │                 ┌─────────────────────────────┐ │
│           └────────────────►│  Managed Redis              │ │
│                             │  (Caching + Job Queues)     │ │
│                             └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ (Public Internet)
                              ▼
                  ┌────────────────────────┐
                  │  DigitalOcean Spaces   │
                  │  (S3-Compatible)       │
                  │  - Receipts Storage    │
                  │  - Artifacts           │
                  └────────────────────────┘
```

## Infrastructure Components

### 1. DigitalOcean App Platform
- **Purpose**: Host the Node.js backend API
- **Features**: Auto-scaling, auto-deployment from GitHub, SSL/HTTPS
- **Domain**: api.easyescrow.ai
- **Scaling**: CPU/Memory based autoscaling

### 2. Managed PostgreSQL
- **Purpose**: Primary database for application data
- **Configuration**: 
  - 3 logical databases (prod, stage, dev)
  - PgBouncer connection pooling
  - PITR (Point-in-Time Recovery)
  - Daily snapshots
- **Roles**: Least-privilege access control

### 3. Managed Redis
- **Purpose**: Caching, idempotency keys, job queues
- **Configuration**:
  - Persistence enabled
  - Eviction policy: allkeys-lru
  - Private VPC access

### 4. DigitalOcean Spaces
- **Purpose**: Object storage for receipts and artifacts
- **Configuration**:
  - S3-compatible API
  - CDN-enabled
  - Lifecycle policies

## Prerequisites

Before starting, ensure you have:

- [ ] DigitalOcean account with billing enabled
- [ ] GitHub repository access (for App Platform deployment)
- [ ] Domain registered and DNS access (easyescrow.ai)
- [ ] CLI tools installed:
  - `doctl` (DigitalOcean CLI)
  - `psql` (PostgreSQL client)
  - `redis-cli` (Redis client)

## Installation Instructions

### Install DigitalOcean CLI (doctl)

**Windows (PowerShell)**:
```powershell
# Using Chocolatey
choco install doctl

# Or download from: https://github.com/digitalocean/doctl/releases
```

**macOS**:
```bash
brew install doctl
```

**Linux**:
```bash
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.98.1/doctl-1.98.1-linux-amd64.tar.gz
tar xf doctl-1.98.1-linux-amd64.tar.gz
sudo mv doctl /usr/local/bin
```

### Authenticate doctl

```bash
# Generate API token from: https://cloud.digitalocean.com/account/api/tokens
doctl auth init

# Verify authentication
doctl account get
```

## Setup Steps

Follow these steps in order:

1. [Create VPC Network](#step-1-create-vpc-network)
2. [Setup Managed PostgreSQL](#step-2-setup-managed-postgresql)
3. [Setup Managed Redis](#step-3-setup-managed-redis)
4. [Setup DigitalOcean Spaces](#step-4-setup-digitalocean-spaces)
5. [Create Database Users and Roles](#step-5-create-database-users-and-roles)
6. [Configure App Platform](#step-6-configure-app-platform)
7. [Setup Custom Domain and SSL](#step-7-setup-custom-domain-and-ssl)
8. [Verify and Test](#step-8-verify-and-test)

---

## Step 1: Create VPC Network

A Virtual Private Cloud (VPC) provides isolated networking for your services.

### Via Web Console:

1. Go to **Networking** → **VPC**
2. Click **Create VPC Network**
3. Configure:
   - **Name**: `easyescrow-production-vpc`
   - **Description**: `Production VPC for EasyEscrow.ai`
   - **Region**: Choose closest to your users (e.g., `nyc3`, `sfo3`)
   - **IP Range**: `10.116.0.0/20` (default is fine)
4. Click **Create VPC Network**

### Via CLI:

```bash
# Create VPC
doctl vpcs create \
  --name easyescrow-production-vpc \
  --description "Production VPC for EasyEscrow.ai" \
  --region nyc3 \
  --ip-range 10.116.0.0/20

# Save the VPC ID for later use
export VPC_ID=$(doctl vpcs list --format ID --no-header | head -n 1)
echo "VPC ID: $VPC_ID"
```

**Save the VPC ID** - you'll need it for subsequent steps.

---

## Step 2: Setup Managed PostgreSQL

### 2.1 Create PostgreSQL Cluster

**Recommended Specifications**:
- **Plan**: Basic (start small, scale up)
- **Size**: db-s-2vcpu-4gb ($60/month)
- **Node**: 1 (single node for MVP, upgrade to 2+ for HA)
- **Region**: Same as VPC (e.g., `nyc3`)
- **Version**: PostgreSQL 16

### Via Web Console:

1. Go to **Databases** → **Create Database**
2. Configure:
   - **Database Engine**: PostgreSQL
   - **Version**: 16
   - **Datacenter**: nyc3 (match your VPC region)
   - **VPC Network**: Select `easyescrow-production-vpc`
   - **Cluster Configuration**: 
     - **Plan**: Basic
     - **Size**: 2 vCPU, 4 GB RAM
   - **Database Name**: `easyescrow_prod`
   - **Cluster Name**: `easyescrow-postgres-prod`
3. Click **Create Database Cluster**

### Via CLI:

```bash
# Create PostgreSQL cluster
doctl databases create easyescrow-postgres-prod \
  --engine pg \
  --version 16 \
  --region nyc3 \
  --size db-s-2vcpu-4gb \
  --num-nodes 1 \
  --private-network-uuid $VPC_ID

# Get database ID
export DB_ID=$(doctl databases list --format ID --no-header | grep easyescrow-postgres)
echo "Database ID: $DB_ID"

# Wait for database to be ready (takes ~5-10 minutes)
doctl databases get $DB_ID
```

### 2.2 Configure Database Settings

Once the cluster is created:

1. **Enable Connection Pooling (PgBouncer)**:
   ```bash
   # Via console: Database → Settings → Connection Pooling → Enable
   # This creates a pooled connection string with port 25060
   ```

2. **Configure Backup Settings**:
   ```bash
   # PITR (Point-in-Time Recovery) is enabled by default
   # Retention: 7 days (can extend to 30 days)
   # Daily automated backups are also enabled
   ```

3. **Add Trusted Sources** (Firewall):
   ```bash
   # Allow access from App Platform
   # This will be configured later when App Platform is created
   ```

### 2.3 Get Connection Details

```bash
# Get connection details
doctl databases connection $DB_ID

# Or view in console: Database → Connection Details
```

Save these details:
- **Host**: `easyescrow-postgres-prod-do-user-xxxxx.b.db.ondigitalocean.com`
- **Port**: `25060` (pooled) or `25432` (direct)
- **Username**: `doadmin`
- **Password**: [auto-generated, shown once]
- **Database**: `defaultdb`
- **SSL Mode**: `require`

**Connection String Format**:
```
postgresql://doadmin:PASSWORD@HOST:25060/defaultdb?sslmode=require
```

---

## Step 3: Setup Managed Redis

### 3.1 Create Redis Cluster

**Recommended Specifications**:
- **Plan**: Basic
- **Size**: db-s-1vcpu-1gb ($15/month)
- **Region**: Same as VPC and PostgreSQL
- **Eviction Policy**: allkeys-lru

### Via Web Console:

1. Go to **Databases** → **Create Database**
2. Configure:
   - **Database Engine**: Redis
   - **Version**: 7
   - **Datacenter**: nyc3 (match your VPC region)
   - **VPC Network**: Select `easyescrow-production-vpc`
   - **Cluster Configuration**: 
     - **Plan**: Basic
     - **Size**: 1 vCPU, 1 GB RAM
   - **Cluster Name**: `easyescrow-redis-prod`
3. Click **Create Database Cluster**

### Via CLI:

```bash
# Create Redis cluster
doctl databases create easyescrow-redis-prod \
  --engine redis \
  --version 7 \
  --region nyc3 \
  --size db-s-1vcpu-1gb \
  --num-nodes 1 \
  --private-network-uuid $VPC_ID

# Get Redis ID
export REDIS_ID=$(doctl databases list --format ID --no-header | grep easyescrow-redis)
echo "Redis ID: $REDIS_ID"
```

### 3.2 Configure Redis Settings

1. **Eviction Policy**:
   ```bash
   # Via console: Database → Settings → Configuration
   # Set: maxmemory-policy = allkeys-lru
   ```

2. **Persistence**:
   ```bash
   # Persistence is enabled by default with AOF (Append-Only File)
   ```

### 3.3 Get Connection Details

```bash
# Get Redis connection details
doctl databases connection $REDIS_ID
```

Save these details:
- **Host**: `easyescrow-redis-prod-do-user-xxxxx.b.db.ondigitalocean.com`
- **Port**: `25061`
- **Username**: `default`
- **Password**: [auto-generated]

**Connection String Format**:
```
rediss://default:PASSWORD@HOST:25061
```

---

## Step 4: Setup DigitalOcean Spaces

DigitalOcean Spaces is S3-compatible object storage for receipts and artifacts.

### 4.1 Create Spaces Bucket

### Via Web Console:

1. Go to **Spaces** → **Create Space**
2. Configure:
   - **Datacenter**: nyc3 (match your region)
   - **Enable CDN**: Yes (for faster downloads)
   - **Name**: `easyescrow-receipts-prod`
   - **File Listing**: Restricted (private)
3. Click **Create Space**

### Via CLI:

```bash
# Note: doctl doesn't fully support Spaces creation
# Use the web console or s3cmd

# Install s3cmd (for managing Spaces)
pip install s3cmd

# Configure s3cmd with Spaces credentials
s3cmd --configure
# Enter:
# - Access Key and Secret Key from: https://cloud.digitalocean.com/account/api/tokens
# - S3 Endpoint: nyc3.digitaloceanspaces.com
# - DNS-style bucket+hostname:port: %(bucket)s.nyc3.digitaloceanspaces.com
```

### 4.2 Generate Spaces Access Keys

1. Go to **API** → **Spaces Keys**
2. Click **Generate New Key**
3. Name: `easyescrow-backend-access`
4. Save:
   - **Access Key**: `DO00xxxxx`
   - **Secret Key**: [shown once, save securely]

### 4.3 Configure Bucket CORS (for web access)

Create `cors-config.xml`:
```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://easyescrow.ai</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
  </CORSRule>
</CORSConfiguration>
```

Apply CORS:
```bash
s3cmd setcors cors-config.xml s3://easyescrow-receipts-prod
```

---

## Step 5: Create Database Users and Roles

Create least-privilege roles for application and migrations.

### 5.1 Connect to PostgreSQL

```bash
# Get connection command from console or use:
psql "postgresql://doadmin:PASSWORD@HOST:25432/defaultdb?sslmode=require"
```

### 5.2 Create Logical Databases

```sql
-- Create three logical databases
CREATE DATABASE easyescrow_prod;
CREATE DATABASE easyescrow_stage;
CREATE DATABASE easyescrow_dev;
```

### 5.3 Create User Roles

Create roles for each environment (prod, stage, dev):

```sql
-- PRODUCTION ROLES
-- App user: Read/Write, no DDL
CREATE USER app_user_prod WITH PASSWORD 'SECURE_RANDOM_PASSWORD_1';
GRANT CONNECT ON DATABASE easyescrow_prod TO app_user_prod;

-- Migration user: DDL only
CREATE USER migrate_user_prod WITH PASSWORD 'SECURE_RANDOM_PASSWORD_2';
GRANT CONNECT ON DATABASE easyescrow_prod TO migrate_user_prod;

-- STAGING ROLES
CREATE USER app_user_stage WITH PASSWORD 'SECURE_RANDOM_PASSWORD_3';
GRANT CONNECT ON DATABASE easyescrow_stage TO app_user_stage;

CREATE USER migrate_user_stage WITH PASSWORD 'SECURE_RANDOM_PASSWORD_4';
GRANT CONNECT ON DATABASE easyescrow_stage TO migrate_user_stage;

-- DEVELOPMENT ROLES
CREATE USER app_user_dev WITH PASSWORD 'SECURE_RANDOM_PASSWORD_5';
GRANT CONNECT ON DATABASE easyescrow_dev TO app_user_dev;

CREATE USER migrate_user_dev WITH PASSWORD 'SECURE_RANDOM_PASSWORD_6';
GRANT CONNECT ON DATABASE easyescrow_dev TO migrate_user_dev;
```

### 5.4 Configure Permissions

For each environment, run these commands (example for prod):

```sql
-- Connect to the specific database
\c easyescrow_prod

-- Grant schema permissions
GRANT USAGE ON SCHEMA public TO app_user_prod;
GRANT USAGE ON SCHEMA public TO migrate_user_prod;

-- App user permissions (DML only: SELECT, INSERT, UPDATE, DELETE)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user_prod;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user_prod;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user_prod;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user_prod;

-- Migration user permissions (DDL only: CREATE, ALTER, DROP)
GRANT CREATE ON SCHEMA public TO migrate_user_prod;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO migrate_user_prod;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO migrate_user_prod;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO migrate_user_prod;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO migrate_user_prod;

-- Repeat for easyescrow_stage and easyescrow_dev
```

Save these credentials in your password manager.

---

## Step 6: Configure App Platform

This will be covered in detail in [Task 34: App Platform Deployment](./DIGITALOCEAN_APP_PLATFORM.md).

Brief overview:
1. Connect GitHub repository
2. Configure build and run commands
3. Set environment variables
4. Configure health checks
5. Enable autoscaling

---

## Step 7: Setup Custom Domain and SSL

### 7.1 Add Domain to DigitalOcean

1. Go to **Networking** → **Domains**
2. Click **Add Domain**
3. Enter: `easyescrow.ai`
4. Click **Add Domain**

### 7.2 Configure DNS Records

Add these DNS records:

```
Type: A
Hostname: api
Value: [App Platform IP]
TTL: 3600

Type: CNAME  
Hostname: api
Value: [App Platform URL]
TTL: 3600
```

Or use the App Platform's automatic DNS configuration.

### 7.3 Enable SSL

SSL certificates are automatically provisioned and renewed by Let's Encrypt when using App Platform with a custom domain.

---

## Step 8: Verify and Test

### 8.1 Test Database Connectivity

```bash
# Test prod database with app user
psql "postgresql://app_user_prod:PASSWORD@HOST:25060/easyescrow_prod?sslmode=require"

# Try a SELECT (should work)
SELECT 1;

# Try a CREATE TABLE (should fail - app user has no DDL permissions)
CREATE TABLE test (id INT);
```

### 8.2 Test Redis Connectivity

```bash
# Connect to Redis
redis-cli -h HOST -p 25061 -a PASSWORD --tls

# Test commands
PING
SET test_key "test_value"
GET test_key
DEL test_key
```

### 8.3 Test Spaces Access

```bash
# Upload a test file
echo "Test content" > test.txt
s3cmd put test.txt s3://easyescrow-receipts-prod/

# List files
s3cmd ls s3://easyescrow-receipts-prod/

# Download file
s3cmd get s3://easyescrow-receipts-prod/test.txt

# Delete test file
s3cmd del s3://easyescrow-receipts-prod/test.txt
```

---

## Cost Estimation

### Monthly Costs (USD)

| Service | Plan | Cost/Month |
|---------|------|------------|
| PostgreSQL | db-s-2vcpu-4gb | $60 |
| Redis | db-s-1vcpu-1gb | $15 |
| Spaces | 250 GB storage + CDN | $5-10 |
| App Platform | Basic (512MB RAM) | $5 |
| **Total (MVP)** | | **~$85-90** |

### Scaling Costs

| Upgrade | New Cost/Month |
|---------|----------------|
| PostgreSQL HA (2 nodes) | $120 |
| Redis (2 vCPU, 2 GB) | $30 |
| App Platform Pro (1GB RAM) | $12 |
| **Total (Production)** | **~$160-170** |

---

## Security Best Practices

### 1. Rotate Secrets Quarterly

Set up a quarterly rotation schedule for:
- Database passwords
- Redis passwords
- Spaces access keys
- JWT secrets
- API keys

### 2. Enable Private Networking

- ✅ All services in same VPC
- ✅ App Platform uses private network
- ✅ Databases not exposed to public internet

### 3. Use Connection Pooling

- ✅ PgBouncer enabled (port 25060)
- Reduces connection overhead
- Better resource utilization

### 4. Enable Monitoring

Set up alerts for:
- Database CPU/Memory usage > 80%
- Redis memory usage > 80%
- App Platform response time > 2s
- Failed health checks
- Disk space < 20%

### 5. Regular Backups

- ✅ PITR enabled (7-day retention)
- ✅ Daily automated snapshots
- Test restore procedures monthly

---

## Troubleshooting

### Database Connection Issues

```bash
# Check if database is accessible
pg_isready -h HOST -p 25060 -U app_user_prod

# Test connection with psql
psql "postgresql://app_user_prod:PASSWORD@HOST:25060/easyescrow_prod?sslmode=require"

# Check connection pool status
# Via console: Database → Metrics → Connection Pools
```

### Redis Connection Issues

```bash
# Test Redis connectivity
redis-cli -h HOST -p 25061 -a PASSWORD --tls PING

# Check Redis memory usage
redis-cli -h HOST -p 25061 -a PASSWORD --tls INFO memory
```

### Spaces Access Issues

```bash
# Verify credentials
s3cmd --configure

# Test access
s3cmd ls s3://easyescrow-receipts-prod/

# Check CORS configuration
s3cmd info s3://easyescrow-receipts-prod/
```

---

## Next Steps

After completing this setup:

1. ✅ VPC Network created
2. ✅ PostgreSQL cluster with 3 databases
3. ✅ Redis cluster configured
4. ✅ Spaces bucket created
5. ✅ User roles and permissions set
6. → **Continue to Task 34**: [App Platform Deployment](./DIGITALOCEAN_APP_PLATFORM.md)

---

## References

- [DigitalOcean Managed Databases](https://docs.digitalocean.com/products/databases/)
- [DigitalOcean Spaces](https://docs.digitalocean.com/products/spaces/)
- [DigitalOcean VPC](https://docs.digitalocean.com/products/networking/vpc/)
- [PostgreSQL Security Best Practices](https://www.postgresql.org/docs/current/security.html)
- [Redis Security](https://redis.io/docs/management/security/)

---

**Document Version**: 1.0.0  
**Last Updated**: October 14, 2025  
**Maintained By**: EasyEscrow.ai Team

