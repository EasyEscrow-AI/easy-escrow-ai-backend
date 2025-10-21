# STAGING Domain Setup Guide

## Overview

This guide covers setting up the custom domain `staging-api.easyescrow.ai` for the STAGING environment backend API hosted on DigitalOcean App Platform.

**Default DigitalOcean URL:** `https://easyescrow-backend-staging-3e6oq.ondigitalocean.app/`  
**Custom Domain:** `staging-api.easyescrow.ai`

---

## DNS Configuration

### Step 1: Add CNAME Record in Your DNS Provider

You need to add a CNAME record in your DNS provider (wherever `easyescrow.ai` is hosted - e.g., Cloudflare, GoDaddy, Route53, etc.).

**DNS Record Details:**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | `staging-api` | `easyescrow-backend-staging-3e6oq.ondigitalocean.app` | 300 (or Auto) |

**Examples by Provider:**

#### Cloudflare
```
Type: CNAME
Name: staging-api
Content: easyescrow-backend-staging-3e6oq.ondigitalocean.app
Proxy status: DNS only (gray cloud) initially
TTL: Auto
```

#### GoDaddy
```
Type: CNAME
Host: staging-api
Points to: easyescrow-backend-staging-3e6oq.ondigitalocean.app
TTL: 600 seconds (or default)
```

#### AWS Route53
```json
{
  "Type": "CNAME",
  "Name": "staging-api.easyescrow.ai",
  "ResourceRecords": [
    {
      "Value": "easyescrow-backend-staging-3e6oq.ondigitalocean.app"
    }
  ],
  "TTL": 300
}
```

#### Namecheap
```
Type: CNAME Record
Host: staging-api
Value: easyescrow-backend-staging-3e6oq.ondigitalocean.app
TTL: Automatic
```

---

## DigitalOcean App Platform Configuration

### Step 2: Update App Configuration

The `staging-app.yaml` has been updated with the domain configuration:

```yaml
# Custom Domain Configuration
domains:
  - domain: staging-api.easyescrow.ai
    type: PRIMARY
```

### Step 3: Deploy Updated Configuration

**Option A: Via DigitalOcean CLI (doctl)**

```bash
# Get your app ID
doctl apps list

# Update the app with new configuration
doctl apps update <your-app-id> --spec staging-app.yaml

# Example:
# doctl apps update abc123-def456 --spec staging-app.yaml
```

**Option B: Via DigitalOcean Console**

1. Go to https://cloud.digitalocean.com/apps
2. Click on your `easyescrow-backend-staging` app
3. Go to "Settings" tab
4. Click "Domains" section
5. Click "Add Domain"
6. Enter: `staging-api.easyescrow.ai`
7. Click "Add Domain"

### Step 4: Verify DNS Propagation

Wait for DNS propagation (usually 5-30 minutes, can take up to 48 hours):

```bash
# Check CNAME record
nslookup staging-api.easyescrow.ai

# Or use dig (Linux/Mac)
dig staging-api.easyescrow.ai

# Expected output should show:
# staging-api.easyescrow.ai CNAME easyescrow-backend-staging-3e6oq.ondigitalocean.app
```

**Online DNS Checkers:**
- https://dnschecker.org/
- https://www.whatsmydns.net/

---

## SSL/TLS Certificate

### Automatic SSL Certificate

DigitalOcean App Platform automatically provisions a free SSL certificate from Let's Encrypt for your custom domain.

**Process:**
1. DigitalOcean detects the CNAME record
2. Automatically requests SSL certificate from Let's Encrypt
3. Certificate is provisioned (usually within 5-10 minutes)
4. HTTPS is automatically enabled

**Monitor Certificate Status:**

Via DigitalOcean Console:
1. Go to your app
2. Settings → Domains
3. Check certificate status next to your domain

Via CLI:
```bash
doctl apps get <app-id>
```

Look for domain status in output.

---

## Verification Steps

### Step 1: Verify DNS Resolution

```bash
# Check CNAME
nslookup staging-api.easyescrow.ai

# Expected:
# Non-authoritative answer:
# staging-api.easyescrow.ai canonical name = easyescrow-backend-staging-3e6oq.ondigitalocean.app
```

### Step 2: Test HTTP Access

```bash
# Test health endpoint (once certificate is issued)
curl https://staging-api.easyescrow.ai/health

# Expected: 200 OK with health status JSON
```

### Step 3: Test RPC Health Endpoint

```bash
# Test new RPC health endpoint
curl https://staging-api.easyescrow.ai/health/rpc

# Expected: 200 OK with RPC metrics
```

### Step 4: Verify SSL Certificate

```bash
# Check SSL certificate
curl -I https://staging-api.easyescrow.ai

# Should return 200 OK with HTTPS
```

**Browser Test:**
- Visit: https://staging-api.easyescrow.ai/health
- Check for green padlock icon
- Certificate should be valid

---

## Troubleshooting

### Issue 1: DNS Not Resolving

**Symptoms:**
```
nslookup staging-api.easyescrow.ai
Server can't find staging-api.easyescrow.ai: NXDOMAIN
```

**Solutions:**
1. Verify CNAME record is correctly configured in DNS provider
2. Wait for DNS propagation (can take up to 48 hours)
3. Clear local DNS cache:
   ```bash
   # Windows
   ipconfig /flushdns
   
   # Mac
   sudo dscacheutil -flushcache
   
   # Linux
   sudo systemd-resolve --flush-caches
   ```
4. Try different DNS checker: https://dnschecker.org/

### Issue 2: Certificate Not Provisioning

**Symptoms:**
- DigitalOcean shows "Certificate Pending"
- HTTPS not working after 30 minutes

**Solutions:**
1. Verify DNS CNAME is correctly pointing to DigitalOcean app
2. Ensure DNS propagation is complete (check multiple DNS servers)
3. If using Cloudflare:
   - Set proxy status to "DNS only" (gray cloud, not orange)
   - Let's Encrypt needs direct access to verify domain
   - Can enable proxy after certificate is issued
4. Check DigitalOcean console for specific error messages
5. Contact DigitalOcean support if issue persists

### Issue 3: 404 Not Found

**Symptoms:**
```
curl https://staging-api.easyescrow.ai/health
404 Not Found
```

**Solutions:**
1. Verify app is deployed and running
2. Check app logs in DigitalOcean console
3. Ensure routes are properly configured in `src/index.ts`
4. Verify health endpoint exists: `/health` and `/health/rpc`

### Issue 4: Mixed Content Warnings

**Symptoms:**
- Browser shows mixed content warnings
- Some resources loading over HTTP instead of HTTPS

**Solutions:**
1. Update all internal API calls to use HTTPS
2. Check `CORS_ORIGIN` in environment variables
3. Ensure no hardcoded HTTP URLs in frontend

---

## Environment Variable Updates

After domain is configured, update these environment variables in DigitalOcean:

### CORS Configuration

Update `CORS_ORIGIN` to include new domain:

```bash
# In DigitalOcean App Platform or staging-app.yaml
CORS_ORIGIN=https://staging-api.easyescrow.ai,https://staging.easyescrow.ai,http://localhost:3000
```

### Monitoring Endpoint

Update monitoring endpoint:

```bash
MONITORING_ENDPOINT=https://staging-api.easyescrow.ai/health
```

These are already configured in `staging-app.yaml` but verify they match your actual domains.

---

## Testing Checklist

Once domain is configured and certificate is issued:

- [ ] DNS resolves correctly: `nslookup staging-api.easyescrow.ai`
- [ ] HTTPS works: `https://staging-api.easyescrow.ai/health` returns 200 OK
- [ ] SSL certificate is valid (green padlock in browser)
- [ ] RPC health endpoint works: `https://staging-api.easyescrow.ai/health/rpc`
- [ ] API endpoints accessible: Test agreement endpoints
- [ ] CORS configured: Frontend can access API
- [ ] Monitoring endpoint updated in environment variables
- [ ] No mixed content warnings in browser console

---

## Cloudflare Configuration (If Using Cloudflare)

### Initial Setup (Certificate Provisioning)

**During Let's Encrypt certificate provisioning:**

1. Set DNS record to "DNS only" (gray cloud):
   - This allows Let's Encrypt to directly verify domain ownership
   - Required for initial certificate issuance

```
Type: CNAME
Name: staging-api
Content: easyescrow-backend-staging-3e6oq.ondigitalocean.app
Proxy status: DNS only (🌥️ gray cloud)
```

### After Certificate is Issued

**Once certificate is active, you can enable Cloudflare proxy:**

1. Enable "Proxied" (orange cloud):
   - Provides DDoS protection
   - CDN acceleration
   - Additional security features

```
Type: CNAME
Name: staging-api
Content: easyescrow-backend-staging-3e6oq.ondigitalocean.app
Proxy status: Proxied (☁️ orange cloud)
```

**SSL/TLS Settings in Cloudflare:**
- Go to SSL/TLS tab
- Set SSL/TLS encryption mode: "Full (strict)"
- This ensures end-to-end encryption

**Page Rules (Optional but Recommended):**
```
URL: https://staging-api.easyescrow.ai/*
Settings:
  - Always Use HTTPS: On
  - Security Level: Medium
  - Cache Level: Bypass (for API)
```

---

## Maintenance

### Certificate Renewal

**Automatic Renewal:**
- Let's Encrypt certificates are valid for 90 days
- DigitalOcean automatically renews certificates
- No manual intervention required

**Monitor Certificate Expiry:**
```bash
# Check certificate expiry
openssl s_client -connect staging-api.easyescrow.ai:443 -servername staging-api.easyescrow.ai 2>/dev/null | openssl x509 -noout -dates
```

### Domain Changes

If you need to change the domain:

1. Update CNAME record in DNS provider
2. Update `staging-app.yaml`:
   ```yaml
   domains:
     - domain: new-staging-api.easyescrow.ai
       type: PRIMARY
   ```
3. Deploy updated configuration: `doctl apps update <app-id> --spec staging-app.yaml`
4. Wait for new certificate provisioning

---

## Quick Reference Commands

```bash
# Check DNS resolution
nslookup staging-api.easyescrow.ai

# Test health endpoint
curl https://staging-api.easyescrow.ai/health

# Test RPC health endpoint
curl https://staging-api.easyescrow.ai/health/rpc

# Check SSL certificate
openssl s_client -connect staging-api.easyescrow.ai:443 -servername staging-api.easyescrow.ai

# Update DigitalOcean app
doctl apps update <app-id> --spec staging-app.yaml

# View app status
doctl apps get <app-id>

# View app logs
doctl apps logs <app-id> --type=run
```

---

## Related Documentation

- [STAGING RPC Setup](../infrastructure/STAGING_RPC_SETUP.md)
- [STAGING Deployment Guide](STAGING_DEPLOYMENT_GUIDE.md)
- [DigitalOcean Secrets Configuration](DIGITALOCEAN_SECRETS_CONFIGURATION.md)

---

**Document Version:** 1.0.0  
**Last Updated:** October 21, 2025  
**Maintained By:** DevOps Team

