# Staging Domain SSL Setup with Cloudflare

## Overview

This guide covers setting up SSL/TLS for `staging.easyescrow.ai` with Cloudflare DNS and DigitalOcean App Platform.

**Domain:** staging.easyescrow.ai  
**DigitalOcean App:** easyescrow-backend-staging-mwx9s.ondigitalocean.app  
**SSL Provider:** Let's Encrypt (via DigitalOcean)  
**DNS:** Cloudflare

---

## Step 1: Add Custom Domain in DigitalOcean

### Via DigitalOcean Dashboard

1. **Navigate to your app:**
   - Go to: https://cloud.digitalocean.com/apps
   - Select: `easyescrow-backend-staging`

2. **Access Settings:**
   - Click the **"Settings"** tab
   - Scroll to **"Domains"** section

3. **Add Domain:**
   - Click **"Add Domain"**
   - Enter: `staging.easyescrow.ai`
   - Click **"Add Domain"**

4. **DigitalOcean will:**
   - Verify DNS records
   - Provision Let's Encrypt SSL certificate (automatic)
   - This takes 5-10 minutes

### Via doctl CLI (Alternative)

```bash
# Get your app ID
doctl apps list

# Add the domain
doctl apps update <app-id> --spec staging-app.yaml
```

The `staging-app.yaml` already has the domain configured:

```yaml
domains:
  - domain: staging.easyescrow.ai
    type: PRIMARY
```

---

## Step 2: Configure Cloudflare DNS

### Current Setup

You've already added the CNAME record:

```
Type: CNAME
Name: staging
Target: easyescrow-backend-staging-mwx9s.ondigitalocean.app
```

### Required Cloudflare Settings

#### Option A: Full SSL (Recommended)

**Best for: Production-ready setup with end-to-end encryption**

1. **Go to Cloudflare Dashboard:**
   - Navigate to: https://dash.cloudflare.com
   - Select domain: `easyescrow.ai`

2. **SSL/TLS Settings:**
   - Go to: **SSL/TLS** → **Overview**
   - Set mode to: **Full (strict)** ✅
   - This ensures encryption between:
     - Client → Cloudflare (Cloudflare SSL)
     - Cloudflare → DigitalOcean (Let's Encrypt SSL)

3. **CNAME Record Settings:**
   - Go to: **DNS** → **Records**
   - Find: `staging` CNAME record
   - **Proxy status:** ☁️ **Proxied** (orange cloud) ✅
   - **TTL:** Auto

4. **Edge Certificates:**
   - Go to: **SSL/TLS** → **Edge Certificates**
   - Enable: **Always Use HTTPS** ✅
   - Enable: **Automatic HTTPS Rewrites** ✅
   - Enable: **Minimum TLS Version: 1.2** ✅

#### Option B: Flexible SSL (Quick Setup, Less Secure)

**Use only for testing if Full SSL doesn't work immediately**

1. **SSL/TLS Mode:**
   - Set to: **Flexible**
   - ⚠️ Warning: Traffic between Cloudflare and DigitalOcean is NOT encrypted

2. **CNAME Record:**
   - Proxy status: ☁️ **Proxied**

**Upgrade to Full (strict) once DigitalOcean provisions the SSL certificate!**

---

## Step 3: Verify DNS Propagation

### Check DNS Resolution

```bash
# Check if CNAME is resolving
nslookup staging.easyescrow.ai

# Or with dig
dig staging.easyescrow.ai

# Expected output:
# staging.easyescrow.ai.  CNAME  easyescrow-backend-staging-mwx9s.ondigitalocean.app.
```

### Wait for Propagation

DNS changes can take:
- **Cloudflare:** 2-5 minutes (usually instant)
- **Global propagation:** Up to 48 hours (typically 1-2 hours)

---

## Step 4: Verify SSL Certificate

### Wait for DigitalOcean SSL Provisioning

DigitalOcean automatically provisions a **Let's Encrypt SSL certificate** for your custom domain.

**Timeline:**
1. **Immediate:** DNS verification starts
2. **5-10 minutes:** SSL certificate provisioned
3. **Status:** Check in DigitalOcean dashboard under Domains

### Check Certificate Status

**Via Browser:**
1. Open: https://staging.easyescrow.ai
2. Click the **padlock icon** in address bar
3. View certificate details
4. Should show: **Issued by: Let's Encrypt**

**Via CLI:**
```bash
# Check SSL certificate
curl -vI https://staging.easyescrow.ai

# Or use OpenSSL
openssl s_client -connect staging.easyescrow.ai:443 -servername staging.easyescrow.ai
```

**Expected Output:**
```
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
* Server certificate:
*  subject: CN=staging.easyescrow.ai
*  issuer: C=US; O=Let's Encrypt; CN=R3
*  SSL certificate verify ok.
```

---

## Step 5: Test the Connection

### Basic Connectivity Test

```bash
# Test health endpoint
curl https://staging.easyescrow.ai/health

# Expected: 200 OK with JSON response
```

### Verify Cloudflare Proxy

Check response headers for Cloudflare:

```bash
curl -I https://staging.easyescrow.ai/health

# Should include:
# server: cloudflare
# cf-ray: <ray-id>
# cf-cache-status: DYNAMIC
```

### Test API Endpoints

```bash
# Test main API
curl https://staging.easyescrow.ai/v1/agreements

# Test Swagger docs
curl https://staging.easyescrow.ai/api-docs
```

---

## Troubleshooting

### Issue 1: "Too Many Redirects" Error

**Cause:** SSL mode mismatch between Cloudflare and DigitalOcean

**Solution:**
1. Go to Cloudflare SSL/TLS settings
2. Change from **Flexible** to **Full (strict)**
3. Wait 5 minutes for changes to propagate

### Issue 2: "Certificate Invalid" Error

**Cause:** DigitalOcean hasn't finished provisioning SSL certificate

**Solution:**
1. Check DigitalOcean App → Settings → Domains
2. Verify domain status shows "Active" with green checkmark
3. Wait 5-10 more minutes if still provisioning
4. If stuck, remove and re-add the domain

### Issue 3: DNS Not Resolving

**Cause:** CNAME not propagated or incorrect target

**Solution:**
1. Verify CNAME in Cloudflare DNS:
   - Name: `staging`
   - Target: `easyescrow-backend-staging-mwx9s.ondigitalocean.app`
   - Proxy: ☁️ Proxied (orange cloud)
2. Wait 5-10 minutes for propagation
3. Clear DNS cache:
   ```bash
   ipconfig /flushdns  # Windows
   sudo dscacheutil -flushcache  # Mac
   ```

### Issue 4: Mixed Content Warnings

**Cause:** Page loading HTTP resources over HTTPS

**Solution:**
1. Enable **Automatic HTTPS Rewrites** in Cloudflare
2. Check application code for hardcoded `http://` URLs
3. Use protocol-relative URLs: `//example.com/resource`

### Issue 5: "526 Invalid SSL Certificate" Error

**Cause:** DigitalOcean SSL not yet provisioned, but Cloudflare is in Full (strict) mode

**Solution:**
1. Temporarily switch Cloudflare to **Full** mode (not strict)
2. Wait for DigitalOcean to provision certificate
3. Switch back to **Full (strict)** mode

---

## Cloudflare Additional Settings (Optional)

### Security Enhancements

**Go to: Security → Settings**

1. **Security Level:** Medium or High
2. **Challenge Passage:** 30 minutes
3. **Browser Integrity Check:** On
4. **Privacy Pass Support:** On

### Performance Optimizations

**Go to: Speed → Optimization**

1. **Auto Minify:** Check all (HTML, CSS, JS)
2. **Brotli:** On
3. **Rocket Loader:** Off (can break some apps)
4. **Mirage:** On (image optimization)

### Firewall Rules (Recommended)

**Go to: Security → WAF**

Create rules to:
1. Block suspicious requests
2. Rate limit API endpoints
3. Allow specific countries only (if applicable)

**Example Rule:**
```
(http.request.uri.path eq "/v1/agreements" and http.request.method eq "POST")
  and (rate limit: 10 requests per minute)
```

---

## Expected Final Configuration

### Cloudflare DNS

```
Type: CNAME
Name: staging
Target: easyescrow-backend-staging-mwx9s.ondigitalocean.app
Proxy: ☁️ Proxied
TTL: Auto
```

### Cloudflare SSL/TLS

```
Mode: Full (strict)
Always Use HTTPS: On
Automatic HTTPS Rewrites: On
Minimum TLS Version: 1.2
Edge Certificates: Auto (Cloudflare Universal SSL)
```

### DigitalOcean Domains

```
Domain: staging.easyescrow.ai
Type: PRIMARY
Status: Active ✅
Certificate: Let's Encrypt (Auto-renewed)
```

---

## Security Best Practices

1. ✅ **Use Full (strict) SSL mode** - End-to-end encryption
2. ✅ **Enable HSTS** (HTTP Strict Transport Security) in Cloudflare
3. ✅ **Enable CAA records** to restrict certificate authorities
4. ✅ **Monitor SSL expiry** (auto-renewed, but good to monitor)
5. ✅ **Use Cloudflare WAF** to protect against attacks
6. ✅ **Enable rate limiting** on API endpoints
7. ✅ **Set up Page Rules** for caching and security

### Cloudflare Page Rule Example

**Rule:** `staging.easyescrow.ai/api-docs*`
- **Cache Level:** Bypass
- **Disable Security**
- **Origin Cache Control:** On

**Rule:** `staging.easyescrow.ai/v1/agreements*`
- **Cache Level:** Bypass
- **Security Level:** High

---

## Verification Checklist

After setup, verify:

- [ ] `https://staging.easyescrow.ai` loads without SSL errors
- [ ] Certificate is from Let's Encrypt
- [ ] Cloudflare headers present (`cf-ray`, `server: cloudflare`)
- [ ] Health endpoint returns 200: `/health`
- [ ] API endpoints work: `/v1/agreements`
- [ ] No mixed content warnings in browser console
- [ ] Automatic HTTP → HTTPS redirect works
- [ ] Response headers include security headers (HSTS, etc.)

---

## Monitoring

### Check SSL Certificate Expiry

```bash
# Check expiry date
echo | openssl s_client -servername staging.easyescrow.ai -connect staging.easyescrow.ai:443 2>/dev/null | openssl x509 -noout -dates

# Expected: Auto-renewed by Let's Encrypt every 90 days
```

### Cloudflare Analytics

Monitor:
- **Traffic:** Requests, bandwidth, unique visitors
- **Security:** Threats blocked, challenge rate
- **Performance:** Cache hit rate, origin response time

---

## Next Steps

Once staging SSL is working:

1. **Update Backend URLs:**
   - Update `CORS_ORIGIN` to include `https://staging.easyescrow.ai`
   - Update any hardcoded URLs in code

2. **Update Frontend:**
   - Point staging frontend to `https://staging.easyescrow.ai`

3. **Test E2E:**
   ```bash
   # Update test config to use new domain
   npm run test:staging:e2e:verbose
   ```

4. **Set Up Production:**
   - Repeat process for `api.easyescrow.ai` (production)
   - Use same configuration but with production app

---

## Related Documentation

- [DigitalOcean Custom Domains](https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/)
- [Cloudflare SSL Documentation](https://developers.cloudflare.com/ssl/)
- [Let's Encrypt Information](https://letsencrypt.org/)

---

## Support

If issues persist:
1. Check DigitalOcean app logs
2. Check Cloudflare dashboard for errors
3. Contact DigitalOcean support (App Platform section)
4. Contact Cloudflare support (if Cloudflare-specific issue)

