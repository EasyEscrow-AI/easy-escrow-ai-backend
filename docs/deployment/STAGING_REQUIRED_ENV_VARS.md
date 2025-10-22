# Staging Environment Variables - Required Setup

## 🚨 Critical: Set These in DigitalOcean Now

The staging deployment is live but **missing required environment variables**. Set these in DigitalOcean App Platform to make it fully operational.

---

## 📋 Required Environment Variables

### 1. ✅ REDIS_URL (Already Set)
```
Type: SECRET (Encrypted)
Value: rediss://default:C2FFCNjuy43x5U0GwWCdMIFjNoLpbEQJ@redis-19320.c1.ap-southeast-1-1.ec2.redns.redis-cloud.com:19320
Status: ✅ Working (confirmed by health check)
```

### 2. ❌ DEVNET_ADMIN_PRIVATE_KEY (REQUIRED)
```
Type: SECRET (Encrypted)
Value: [165,5,62,240,173,23,208,223,122,105,20,26,67,123,192,12,34,208,239,137,140,68,105,94,168,96,255,145,229,155,121,70,46,167,236,155,170,224,179,234,164,118,211,28,83,119,250,101,183,57,143,165,30,38,94,11,157,227,221,127,194,1,58,194]
Status: ❌ MISSING (causing current test failures)
Public Key: 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
```

### 3. ⚠️ SOLANA_RPC_URL (Using Fallback)
```
Type: SECRET (Encrypted) - Optional, but recommended
Value: https://api.devnet.solana.com
OR
Value: <Your Helius RPC URL with API key>
Status: ⚠️ Using localhost fallback (works but not ideal)
Note: Currently defaults to localhost, then falls back to devnet
```

### 4. ⚠️ DATABASE_URL (Likely Set)
```
Type: SECRET (Encrypted)
Value: <PostgreSQL connection string from DigitalOcean>
Status: ⚠️ Assumed to be set (database connection working in logs)
```

### 5. ⚠️ JWT_SECRET (May Need Setting)
```
Type: SECRET (Encrypted)
Value: <Generate with: openssl rand -base64 32>
Status: ⚠️ Unknown (not tested yet)
```

---

## 🚀 Quick Setup Instructions

### Step 1: Access DigitalOcean App Settings

1. Go to: https://cloud.digitalocean.com/apps
2. Select: **easyescrow-backend-staging**
3. Click: **Settings** tab
4. Scroll to: **App-Level Environment Variables** (or **api** component)

### Step 2: Add Required Variables

Click **"Edit"** or **"Add Variable"** and add these **one by one**:

#### A. DEVNET_ADMIN_PRIVATE_KEY (CRITICAL)
```
Key: DEVNET_ADMIN_PRIVATE_KEY
Value: [165,5,62,240,173,23,208,223,122,105,20,26,67,123,192,12,34,208,239,137,140,68,105,94,168,96,255,145,229,155,121,70,46,167,236,155,170,224,179,234,164,118,211,28,83,119,250,101,183,57,143,165,30,38,94,11,157,227,221,127,194,1,58,194]
Type: ☑️ Encrypted (check this!)
Scope: RUN_TIME
```

#### B. SOLANA_RPC_URL (RECOMMENDED)
```
Key: SOLANA_RPC_URL
Value: https://api.devnet.solana.com
Type: ☑️ Encrypted (optional for public RPC, required if using Helius)
Scope: RUN_TIME
```

#### C. JWT_SECRET (IF NOT SET)
```bash
# Generate on your machine:
openssl rand -base64 32
# Copy the output
```
```
Key: JWT_SECRET
Value: <output from openssl command>
Type: ☑️ Encrypted
Scope: RUN_TIME
```

### Step 3: Save and Redeploy

1. Click **"Save"**
2. DigitalOcean will prompt: **"Redeploy required"**
3. Click **"Deploy"** or **"Create Deployment"**
4. Wait: ~3-5 minutes

---

## ✅ Verification

After deployment completes, run the tests:

```bash
npm run test:staging:e2e:verbose
```

**Expected results:**
- ✅ No "Admin keypair not configured" error
- ✅ Agreement creation succeeds
- ✅ E2E tests pass

---

## 📊 Environment Variables Summary

| Variable | Status | Priority | Type |
|----------|--------|----------|------|
| `REDIS_URL` | ✅ Set | Critical | SECRET |
| `DEVNET_ADMIN_PRIVATE_KEY` | ❌ Missing | **CRITICAL** | SECRET |
| `SOLANA_RPC_URL` | ⚠️ Fallback | Recommended | SECRET |
| `DATABASE_URL` | ✅ Likely Set | Critical | SECRET |
| `JWT_SECRET` | ⚠️ Unknown | High | SECRET |
| `NODE_ENV` | ✅ Set | Critical | Plain |
| `ESCROW_PROGRAM_ID` | ✅ Set | Critical | Plain |

---

## 🔍 How to Verify Current Variables

In DigitalOcean dashboard:

1. Go to: Settings → Environment Variables
2. You should see these already set (from `staging-app.yaml`):
   - `NODE_ENV=staging`
   - `SOLANA_NETWORK=devnet`
   - `ESCROW_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
   - Many others (CORS, rate limiting, etc.)

3. You need to manually add **SECRET** type variables:
   - These are marked as `type: SECRET` in the YAML but have no value
   - DigitalOcean requires you to set them via the dashboard

---

## ⚠️ Security Notes

1. **Never commit these values to Git**
2. **Use "Encrypted" option** for all secrets in DigitalOcean
3. **Admin private key** is the most sensitive - treat with extreme care
4. **Rotate secrets** periodically (JWT_SECRET, etc.)

---

## 🎯 Next Steps After Setting Variables

1. **Wait for deployment** (~3-5 minutes)
2. **Test health endpoint:**
   ```bash
   curl https://easyescrow-backend-staging-mwx9s.ondigitalocean.app/health
   ```
3. **Run E2E tests:**
   ```bash
   npm run test:staging:e2e:verbose
   ```
4. **Verify logs** in DigitalOcean for any errors

---

## 📞 Quick Reference

**Admin Wallet Details:**
- **Public Key:** `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`
- **Private Key:** Stored in `wallets/staging/staging-admin.json`
- **Purpose:** Signs escrow transactions on behalf of the platform

**Redis Details:**
- **Endpoint:** `redis-19320.c1.ap-southeast-1-1.ec2.redns.redis-cloud.com:19320`
- **Status:** ✅ Connected

**Program ID:**
- **Staging:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- **Network:** Devnet

---

## 🔗 Related Documentation

- [DigitalOcean Secrets Configuration](../DIGITALOCEAN_SECRETS_CONFIGURATION.md)
- [Secrets Management Guide](../SECRETS_MANAGEMENT.md)
- [Staging SSL Setup](./STAGING_SSL_CLOUDFLARE_SETUP.md)

