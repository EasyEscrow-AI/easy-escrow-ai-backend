# Production Secrets Setup Guide

**Date:** December 5, 2025  
**Environment:** Production (Mainnet)  
**App:** easyescrow-backend-production

---

## 🔐 **Required Secrets for Production Deployment**

All secrets must be configured in **DigitalOcean App Platform Console** before deployment.

### **How to Set Secrets in DigitalOcean:**

1. Go to: https://cloud.digitalocean.com/apps
2. Select: `easyescrow-backend-production`
3. Go to: **Settings** → **Environment Variables**
4. Click: **Edit**
5. For each secret below, click **Add Variable** and mark as **Secret** (encrypted)

---

## **1. Database Configuration** (CRITICAL)

### `DATABASE_URL` (type: SECRET)
**Format:**
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public&connection_limit=10
```

**Get from:**
- DigitalOcean → Databases → `easyescrow-production-postgres`
- Copy the **Connection String**

**Example:**
```
postgresql://doadmin:AVNS_xxx@easyescrow-production-postgres-do-user-xxx.d.db.ondigitalocean.com:25060/defaultdb?schema=public&sslmode=require
```

### `DATABASE_POOL_URL` (type: SECRET)
**Format:** Same as DATABASE_URL but with connection pooling

**Get from:**
- DigitalOcean → Databases → `easyescrow-production-postgres`
- Use **Connection Pool** string if available

---

## **2. Redis Configuration** (CRITICAL)

### `REDIS_URL` (type: SECRET)
**Format:**
```
rediss://default:PASSWORD@HOST:PORT
```

**Get from:**
- Redis Cloud Console OR
- DigitalOcean Managed Redis (if using DO)

**Example:**
```
rediss://default:AVNS_xxx@redis-xxx.c.db.ondigitalocean.com:25061
```

---

## **3. Solana RPC Configuration** (CRITICAL)

### `SOLANA_RPC_URL` (type: SECRET)
**Format:**
```
https://mainnet.helius-rpc.com/?api-key=YOUR-API-KEY
```

**Recommended Providers:**
- **Helius:** https://www.helius.dev/ (Recommended)
- **QuickNode:** https://www.quicknode.com/
- **Triton:** https://triton.one/

**Get from:**
- Sign up for Helius (or other provider)
- Create a new RPC endpoint for **Mainnet**
- Copy the full URL with API key

**⚠️ DO NOT use public RPC (`https://api.mainnet-beta.solana.com`) in production!**

---

## **4. JWT Configuration** (CRITICAL)

### `JWT_SECRET` (type: SECRET)
**Generate with:**
```bash
openssl rand -base64 64
```

**Example output:**
```
vK8xQ2mP9wR7sT5uY3nH6jL4kM0pO1qA8bD9fG2hJ5iC7eF4gH1jK3lM6nO9pQ2r
```

**⚠️ Keep this secret secure! Never share or commit to Git!**

---

## **5. Webhook Configuration** (IMPORTANT)

### `WEBHOOK_SECRET` (type: SECRET)
**Generate with:**
```bash
openssl rand -base64 32
```

**Example output:**
```
sT7uY3nH6jL4kM0pO1qA8bD9fG2hJ5iC
```

---

## **6. Solana Wallet Configuration** (CRITICAL)

All wallet private keys are stored in: `wallets/production/*.json`

### `MAINNET_PROD_ADMIN_PRIVATE_KEY` (type: SECRET)
**Get from:**
```bash
cat wallets/production/production-admin.json
```

**Convert to Base58:**
The JSON file contains a byte array. Use the first element as base58 string.

**Format:** 88-character Base58 string (starts with numbers/letters)

**Public Key (for reference):**
- Run: `solana-keygen pubkey wallets/production/production-admin.json`
- Store in: `MAINNET_PROD_ADMIN_ADDRESS` (also SECRET)

---

### `MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY` (type: SECRET)
**Get from:**
```bash
cat wallets/production/production-treasury.json
```

**Public Key:**
- `HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF`
- Store in: `MAINNET_PROD_FEE_COLLECTOR_ADDRESS`

---

### Additional Test Wallets (OPTIONAL for E2E tests)

**`MAINNET_PROD_SENDER_PRIVATE_KEY`**
```bash
cat wallets/production/production-sender.json
```

**`MAINNET_PROD_RECEIVER_PRIVATE_KEY`**
```bash
cat wallets/production/production-receiver.json
```

---

## **7. DigitalOcean Spaces (S3-compatible storage)** (IMPORTANT)

### `DO_SPACES_KEY` (type: SECRET)
**Get from:**
- DigitalOcean → API → Spaces Access Keys
- Click **Generate New Key**
- Copy the **Access Key**

### `DO_SPACES_SECRET` (type: SECRET)
**Get from:**
- Same as above
- Copy the **Secret Key**

**⚠️ The secret key is only shown ONCE! Save it immediately!**

---

## **8. Email Configuration (SMTP)** (OPTIONAL)

### `SMTP_HOST` (type: SECRET)
**Example:** `smtp.sendgrid.net`

### `SMTP_USER` (type: SECRET)
**Example:** `apikey`

### `SMTP_PASS` (type: SECRET)
**Example:** Your SendGrid API key

**Providers:**
- **SendGrid:** https://sendgrid.com/
- **AWS SES:** https://aws.amazon.com/ses/
- **Mailgun:** https://www.mailgun.com/

---

## **9. Monitoring (OPTIONAL)**

### `SENTRY_DSN` (type: SECRET)
**Get from:**
- Sentry.io → Project Settings → Client Keys (DSN)

**Example:**
```
https://xxx@xxx.ingest.sentry.io/xxx
```

### `SLACK_WEBHOOK` (type: SECRET)
**Get from:**
- Slack → Incoming Webhooks

### `DISCORD_WEBHOOK` (type: SECRET)
**Get from:**
- Discord → Server Settings → Integrations → Webhooks

---

## **10. Zero-Fee API Authorization** (IMPORTANT)

### `ATOMIC_SWAP_API_KEY` (already set in authorized_apps table)
**Value:** `<EXPOSED-NEEDS-ROTATION - see CREDENTIAL_ROTATION_REQUIRED.md>`
**⚠️ NEVER commit this value - it's already exposed and needs rotation**

**⚠️ This is hashed and stored in the database. NO need to set as env var.**

The authorized app is already seeded in both staging and production databases.

---

## **Summary: Secrets Checklist**

### **CRITICAL (Must Set Before Deployment):**
- [ ] `DATABASE_URL`
- [ ] `DATABASE_POOL_URL`
- [ ] `REDIS_URL`
- [ ] `SOLANA_RPC_URL` (Helius/QuickNode mainnet)
- [ ] `JWT_SECRET`
- [ ] `MAINNET_PROD_ADMIN_PRIVATE_KEY`
- [ ] `MAINNET_PROD_ADMIN_ADDRESS`
- [ ] `MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY`
- [ ] `MAINNET_PROD_FEE_COLLECTOR_ADDRESS`

### **IMPORTANT (Recommended):**
- [ ] `WEBHOOK_SECRET`
- [ ] `DO_SPACES_KEY`
- [ ] `DO_SPACES_SECRET`
- [ ] `MAINNET_PROD_SENDER_PRIVATE_KEY` (for E2E tests)
- [ ] `MAINNET_PROD_RECEIVER_PRIVATE_KEY` (for E2E tests)

### **OPTIONAL (Nice to Have):**
- [ ] `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- [ ] `SENTRY_DSN`
- [ ] `SLACK_WEBHOOK`
- [ ] `DISCORD_WEBHOOK`

---

## **After Setting Secrets:**

1. **Save** all environment variables in DigitalOcean
2. **DO NOT** trigger deployment yet
3. **Wait** until PostgreSQL and Redis are provisioned
4. **Then** deploy the app

---

## **Security Best Practices:**

✅ **DO:**
- Use strong, randomly generated secrets
- Store secrets only in DigitalOcean (encrypted)
- Use production-grade RPC providers (Helius/QuickNode)
- Enable 2FA on DigitalOcean account
- Rotate secrets regularly (every 90 days)

❌ **DON'T:**
- Commit secrets to Git
- Share secrets via Slack/Discord/Email
- Use devnet/testnet keys in production
- Use public RPC URLs for production
- Reuse secrets across environments

---

## **Troubleshooting:**

**If deployment fails with "missing environment variable":**
1. Check DigitalOcean → App → Settings → Environment Variables
2. Verify the variable is marked as **Secret** (encrypted)
3. Verify the variable name matches the YAML exactly
4. Redeploy after fixing

**If database connection fails:**
1. Verify `DATABASE_URL` is correct
2. Check database is in same region (sgp1)
3. Verify SSL mode is enabled (`?sslmode=require`)
4. Check database firewall allows app connection

**If Redis connection fails:**
1. Verify `REDIS_URL` format is correct (`rediss://` with double 's')
2. Check Redis instance is accessible
3. Verify password is correct

---

**Ready to deploy once all CRITICAL secrets are set!** 🚀

