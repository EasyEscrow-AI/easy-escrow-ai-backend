# Droplet SSL Setup Guide (Let's Encrypt)

## Overview

This guide walks through setting up free SSL certificates from Let's Encrypt on your DigitalOcean droplet running nginx, enabling "Full (strict)" mode in Cloudflare.

**Droplet IP:** `147.182.190.1`  
**Domain:** `easyescrow.ai`  
**Web Server:** nginx/1.18.0 (Ubuntu)

---

## Prerequisites

- ✅ Domain pointing to droplet IP (A record: `easyescrow.ai` → `147.182.190.1`)
- ✅ nginx installed and running
- ✅ SSH access to droplet
- ✅ Port 80 and 443 open in firewall

---

## Step 1: SSH into Your Droplet

```bash
ssh root@147.182.190.1
# or
ssh your-username@147.182.190.1
```

---

## Step 2: Install Certbot (Let's Encrypt Client)

Certbot is the official tool for obtaining and managing Let's Encrypt certificates.

```bash
# Update package list
sudo apt update

# Install Certbot and nginx plugin
sudo apt install certbot python3-certbot-nginx -y
```

**Verify installation:**
```bash
certbot --version
# Should show: certbot 1.x.x or higher
```

---

## Step 3: Configure nginx for Your Domain

Before getting SSL, ensure nginx is properly configured for your domain.

### Check Current nginx Configuration

```bash
# View nginx config
sudo nano /etc/nginx/sites-available/default
# or
sudo cat /etc/nginx/sites-available/default
```

### Ensure server_name is Set

Your nginx config should have:

```nginx
server {
    listen 80;
    listen [::]:80;
    
    # IMPORTANT: Set your domain name
    server_name easyescrow.ai www.easyescrow.ai;
    
    root /var/www/html;  # or your frontend build directory
    index index.html index.htm index.nginx-debian.html;
    
    location / {
        try_files $uri $uri/ =404;
        # Or if using React/Vue/Angular SPA:
        # try_files $uri $uri/ /index.html;
    }
}
```

**If you need to edit:**
```bash
sudo nano /etc/nginx/sites-available/default
# Add or update server_name line
# Save: Ctrl+O, Enter, Ctrl+X
```

**Test nginx config:**
```bash
sudo nginx -t
# Should show: syntax is ok, test is successful
```

**Reload nginx:**
```bash
sudo systemctl reload nginx
```

---

## Step 4: Obtain SSL Certificate with Certbot

### Method A: Automatic Configuration (Recommended)

Certbot can automatically configure nginx and obtain certificates:

```bash
sudo certbot --nginx -d easyescrow.ai -d www.easyescrow.ai
```

**You'll be asked:**

1. **Email address** (for renewal notifications):
   ```
   Enter email address (used for urgent renewal and security notices)
   ```
   Enter your email and press Enter

2. **Terms of Service:**
   ```
   Please read the Terms of Service at https://letsencrypt.org/documents/LE-SA-v1.3-September-21-2022.pdf
   (A)gree/(C)ancel:
   ```
   Type `A` and press Enter

3. **EFF Communications (optional):**
   ```
   Would you be willing to share your email address with EFF?
   (Y)es/(N)o:
   ```
   Type `N` and press Enter (optional)

4. **Redirect HTTP to HTTPS:**
   ```
   Please choose whether or not to redirect HTTP traffic to HTTPS
   1: No redirect
   2: Redirect - Make all requests redirect to secure HTTPS access
   ```
   Type `2` and press Enter (recommended)

### Method B: Certificate Only (Manual Configuration)

If you prefer to configure nginx manually:

```bash
sudo certbot certonly --nginx -d easyescrow.ai -d www.easyescrow.ai
```

This obtains certificates but doesn't modify nginx config.

---

## Step 5: Verify SSL Certificate Installation

### Check Certificate Files

```bash
sudo ls -la /etc/letsencrypt/live/easyescrow.ai/
```

**You should see:**
- `cert.pem` - Your certificate
- `chain.pem` - Chain certificate
- `fullchain.pem` - Full certificate chain (use this)
- `privkey.pem` - Private key (use this)

### Test nginx Configuration

```bash
sudo nginx -t
# Should show: syntax is ok, test is successful
```

### Reload nginx

```bash
sudo systemctl reload nginx
```

### Check nginx Status

```bash
sudo systemctl status nginx
# Should show: active (running)
```

---

## Step 6: Verify HTTPS Works Locally

Test from the droplet itself:

```bash
# Test HTTPS
curl -I https://easyescrow.ai/

# Should return: HTTP/2 200 OK (or HTTP/1.1 200 OK)
```

**If you get certificate errors, that's normal from localhost. Continue to next step.**

---

## Step 7: Update Cloudflare DNS Settings

### Ensure DNS is Correct

**In Cloudflare Dashboard → DNS:**

Make sure the A record is set:
```
Type: A
Name: @
IPv4 address: 147.182.190.1
Proxy status: Proxied (🟠 orange cloud)
TTL: Auto
```

**Also add www subdomain:**
```
Type: A
Name: www
IPv4 address: 147.182.190.1
Proxy status: Proxied (🟠 orange cloud)
TTL: Auto
```

---

## Step 8: Configure Cloudflare SSL Mode

**IMPORTANT:** Now that you have SSL on your droplet, update Cloudflare:

**In Cloudflare Dashboard:**

1. Go to **SSL/TLS** tab
2. Change encryption mode to: **"Full (strict)"**
3. This setting means:
   - Cloudflare ↔ Visitor: HTTPS (Cloudflare certificate)
   - Cloudflare ↔ Droplet: HTTPS (Let's Encrypt certificate)
   - End-to-end encryption ✅

**Why "Full (strict)"?**
- Most secure option
- Validates your Let's Encrypt certificate
- Prevents man-in-the-middle attacks
- Required for PCI compliance

---

## Step 9: Test Everything

### Test from Command Line

```bash
# Test HTTP redirect to HTTPS
curl -I http://easyescrow.ai/
# Should show: 301 Moved Permanently, Location: https://easyescrow.ai/

# Test HTTPS
curl -I https://easyescrow.ai/
# Should show: HTTP/2 200 OK
```

### Test in Browser

1. Visit: **http://easyescrow.ai/** (HTTP)
   - Should automatically redirect to HTTPS
   
2. Visit: **https://easyescrow.ai/** (HTTPS)
   - Should load with 🔒 green padlock
   
3. Click the padlock icon:
   - Should show valid certificate
   - Certificate from: Let's Encrypt
   - Valid for: easyescrow.ai, www.easyescrow.ai

### Test SSL Certificate

```bash
# Check SSL certificate from external perspective
openssl s_client -connect easyescrow.ai:443 -servername easyescrow.ai </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates

# Should show:
# subject=CN = easyescrow.ai
# issuer=C = US, O = Let's Encrypt, CN = R11
# notBefore=Oct 21 XX:XX:XX 2025 GMT
# notAfter=Jan 19 XX:XX:XX 2026 GMT
```

---

## Step 10: Configure Auto-Renewal

Let's Encrypt certificates expire after **90 days**. Certbot automatically sets up renewal.

### Check Renewal Timer

```bash
# Check if renewal timer is active
sudo systemctl status certbot.timer

# Should show: active (waiting)
```

### Test Renewal (Dry Run)

```bash
sudo certbot renew --dry-run

# Should show: Congratulations, all simulated renewals succeeded
```

### Manual Renewal (If Needed)

Certbot will automatically renew certificates, but you can manually renew:

```bash
# Renew all certificates
sudo certbot renew

# Reload nginx after renewal
sudo systemctl reload nginx
```

**Certbot automatically:**
- Checks for renewal twice daily
- Renews certificates 30 days before expiry
- Reloads nginx after successful renewal

---

## Troubleshooting

### Issue 1: Certificate Verification Failed

**Error:**
```
Failed authorization procedure... Connection refused
```

**Solutions:**

1. **Check Cloudflare proxy is temporarily disabled:**
   - During certificate issuance, set DNS to "DNS only" (gray cloud)
   - Let's Encrypt needs direct access to verify domain
   - Re-enable proxy after certificate is issued

2. **Check firewall allows port 80:**
   ```bash
   sudo ufw status
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

3. **Check nginx is running:**
   ```bash
   sudo systemctl status nginx
   sudo systemctl restart nginx
   ```

### Issue 2: nginx Configuration Error

**Error:**
```
nginx: [emerg] cannot load certificate
```

**Solution:**

Check certificate paths in nginx config:
```bash
sudo nano /etc/nginx/sites-available/default
```

Ensure paths are correct:
```nginx
ssl_certificate /etc/letsencrypt/live/easyescrow.ai/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/easyescrow.ai/privkey.pem;
```

### Issue 3: Still Getting Mixed Content Warnings

**Problem:** Some resources loading over HTTP instead of HTTPS

**Solution:**

Add to nginx config inside `server` block:
```nginx
# Force all links to use HTTPS
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Upgrade insecure requests
add_header Content-Security-Policy "upgrade-insecure-requests" always;
```

### Issue 4: Certificate Shows Cloudflare Instead of Let's Encrypt

**Problem:** Browser shows Cloudflare certificate, not Let's Encrypt

**This is normal!** When Cloudflare proxy is enabled (🟠 orange cloud):
- Visitors see Cloudflare's certificate (universal SSL)
- Cloudflare → Droplet connection uses Let's Encrypt
- This is correct and secure in "Full (strict)" mode

**To verify Let's Encrypt is working:**
```bash
# Test directly from droplet
curl -k -I https://147.182.190.1/
# Should show nginx and 200 OK
```

### Issue 5: Auto-Renewal Not Working

**Check renewal timer:**
```bash
sudo systemctl status certbot.timer
```

**If inactive, enable:**
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

**Check renewal logs:**
```bash
sudo cat /var/log/letsencrypt/letsencrypt.log
```

---

## Nginx Configuration Reference

### Complete HTTPS nginx Config Example

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name easyescrow.ai www.easyescrow.ai;
    
    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name easyescrow.ai www.easyescrow.ai;
    
    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/easyescrow.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/easyescrow.ai/privkey.pem;
    
    # SSL Configuration (Mozilla Modern Configuration)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Document root
    root /var/www/html;
    index index.html index.htm;
    
    # Frontend routing (for React/Vue/Angular SPAs)
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API proxy (if needed)
    # location /api/ {
    #     proxy_pass http://localhost:3000/;
    #     proxy_http_version 1.1;
    #     proxy_set_header Upgrade $http_upgrade;
    #     proxy_set_header Connection 'upgrade';
    #     proxy_set_header Host $host;
    #     proxy_cache_bypass $http_upgrade;
    # }
}
```

---

## Security Best Practices

### 1. Enable HTTP/2
Already enabled in config above with `http2` directive.

### 2. Configure SSL Session Cache
Add to nginx config (outside server blocks):
```nginx
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
```

### 3. Enable OCSP Stapling
Add to HTTPS server block:
```nginx
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/letsencrypt/live/easyescrow.ai/chain.pem;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
```

### 4. Disable Server Tokens
Add to nginx config:
```nginx
server_tokens off;
```

### 5. Rate Limiting (Optional)
Protect against DDoS:
```nginx
limit_req_zone $binary_remote_addr zone=one:10m rate=10r/s;

server {
    location / {
        limit_req zone=one burst=20;
        # ... rest of config
    }
}
```

---

## Maintenance Checklist

### Monthly
- [ ] Check certificate expiry: `sudo certbot certificates`
- [ ] Review nginx error logs: `sudo tail -100 /var/log/nginx/error.log`
- [ ] Check disk space: `df -h`

### Quarterly
- [ ] Test SSL configuration: https://www.ssllabs.com/ssltest/
- [ ] Review security headers: https://securityheaders.com/
- [ ] Update packages: `sudo apt update && sudo apt upgrade`

### Annually
- [ ] Review and update nginx configuration
- [ ] Audit access logs for suspicious activity
- [ ] Review Cloudflare settings

---

## Quick Command Reference

```bash
# Certificate management
sudo certbot certificates                 # List all certificates
sudo certbot renew                        # Manually renew certificates
sudo certbot renew --dry-run             # Test renewal
sudo certbot delete --cert-name easyescrow.ai  # Delete certificate

# nginx management
sudo nginx -t                            # Test configuration
sudo systemctl reload nginx              # Reload without downtime
sudo systemctl restart nginx             # Full restart
sudo systemctl status nginx              # Check status

# View logs
sudo tail -f /var/log/nginx/access.log   # Access log
sudo tail -f /var/log/nginx/error.log    # Error log
sudo cat /var/log/letsencrypt/letsencrypt.log  # Certbot log

# Firewall
sudo ufw status                          # Check firewall
sudo ufw allow 80/tcp                    # Allow HTTP
sudo ufw allow 443/tcp                   # Allow HTTPS

# SSL testing
openssl s_client -connect easyescrow.ai:443 -servername easyescrow.ai
curl -I https://easyescrow.ai/
```

---

## Related Documentation

- [STAGING Domain Setup](STAGING_DOMAIN_SETUP.md)
- [STAGING RPC Setup](../infrastructure/STAGING_RPC_SETUP.md)
- [DigitalOcean Secrets Configuration](DIGITALOCEAN_SECRETS_CONFIGURATION.md)

## External Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)

---

**Document Version:** 1.0.0  
**Last Updated:** October 21, 2025  
**Maintained By:** DevOps Team

