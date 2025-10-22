# Quick SSL Setup for staging.easyescrow.ai

## ✅ Current Status

- ✅ CNAME added in Cloudflare: `staging` → `easyescrow-backend-staging-mwx9s.ondigitalocean.app`
- ⏳ Pending: Domain verification and SSL provisioning

---

## 🚀 Quick Setup Steps (5-10 minutes)

### Step 1: Add Domain in DigitalOcean (2 minutes)

1. Go to: https://cloud.digitalocean.com/apps
2. Click: **easyescrow-backend-staging**
3. Go to: **Settings** → **Domains**
4. Click: **"Edit"** or **"Add Domain"**
5. The domain `staging.easyescrow.ai` should already be listed (from YAML)
6. If not, add it manually
7. DigitalOcean will:
   - Verify DNS (instant, since CNAME exists)
   - Provision SSL certificate (5-10 minutes)

### Step 2: Configure Cloudflare (2 minutes)

1. Go to: https://dash.cloudflare.com
2. Select domain: **easyescrow.ai**

#### A. SSL/TLS Settings
- Navigate to: **SSL/TLS** → **Overview**
- Set mode to: **Full (strict)** ✅

#### B. Verify CNAME Record
- Navigate to: **DNS** → **Records**
- Verify record exists:
  ```
  Type: CNAME
  Name: staging
  Target: easyescrow-backend-staging-mwx9s.ondigitalocean.app
  Proxy: ☁️ Proxied (orange cloud) ✅
  ```

#### C. Enable Security Features
- Navigate to: **SSL/TLS** → **Edge Certificates**
- Enable: **Always Use HTTPS** ✅
- Enable: **Automatic HTTPS Rewrites** ✅

### Step 3: Wait for SSL Provisioning (5-10 minutes)

DigitalOcean will automatically:
1. Verify DNS points to their servers ✅
2. Request Let's Encrypt SSL certificate
3. Install certificate on your app

**Monitor status:**
- DigitalOcean: Settings → Domains → Look for green checkmark
- Status will change from "Provisioning" to "Active"

### Step 4: Test (1 minute)

```bash
# Test the connection
curl -I https://staging.easyescrow.ai/health

# Should return 200 OK
```

---

## 📋 Settings Summary

### Cloudflare Configuration

| Setting | Value |
|---------|-------|
| **SSL Mode** | Full (strict) |
| **Proxy Status** | ☁️ Proxied (orange cloud) |
| **Always Use HTTPS** | On |
| **Automatic HTTPS Rewrites** | On |
| **Minimum TLS Version** | 1.2 |

### DigitalOcean Configuration

| Setting | Value |
|---------|-------|
| **Domain** | staging.easyescrow.ai |
| **Type** | PRIMARY |
| **Certificate** | Let's Encrypt (Auto) |
| **Status** | Active ✅ (after provisioning) |

---

## 🔍 Verification

Once setup is complete, verify:

```bash
# 1. Check SSL certificate
curl -vI https://staging.easyescrow.ai 2>&1 | grep "subject\|issuer"

# Should show: issuer: C=US; O=Let's Encrypt; CN=R3

# 2. Test health endpoint
curl https://staging.easyescrow.ai/health

# Should return: {"status":"healthy",...}

# 3. Check Cloudflare headers
curl -I https://staging.easyescrow.ai/health | grep "cf-"

# Should show: cf-ray, server: cloudflare
```

---

## ⚠️ Troubleshooting

### "Too Many Redirects"
- **Fix:** Change Cloudflare SSL mode from "Flexible" to "Full (strict)"

### "Certificate Invalid"
- **Fix:** Wait 5-10 minutes for DigitalOcean to provision Let's Encrypt certificate

### "526 Invalid SSL Certificate"
- **Fix:** Temporarily change Cloudflare to "Full" (not strict), wait for cert provisioning, then change back to "Full (strict)"

---

## 📞 Next Steps

After SSL is working:

1. **Update E2E Tests:**
   ```bash
   # Update test config URL from:
   # https://easyescrow-backend-staging-mwx9s.ondigitalocean.app
   # to:
   # https://staging.easyescrow.ai
   ```

2. **Update CORS Settings** in DigitalOcean:
   ```
   CORS_ORIGIN=https://staging.easyescrow.ai,http://localhost:3000
   ```

3. **Test Everything:**
   ```bash
   npm run test:staging:e2e:verbose
   ```

---

## 📚 Full Documentation

See [STAGING_SSL_CLOUDFLARE_SETUP.md](./STAGING_SSL_CLOUDFLARE_SETUP.md) for complete details.

