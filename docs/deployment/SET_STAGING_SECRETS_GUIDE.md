# Setting Staging Secrets in DigitalOcean App Platform

**Date:** October 21, 2025  
**App ID:** `ea13cdbb-c74e-40da-a0eb-6c05b0d0432d`  
**App Name:** `easyescrow-backend-staging`

## ⚠️ CRITICAL: Never Commit Secrets to YAML Files

All secrets must be set via the DigitalOcean console or API. **NEVER** add actual secret values to `staging-app.yaml` or any other committed file.

## Method 1: Via DigitalOcean Web Console (Recommended)

### Step 1: Access App Settings
1. Go to [DigitalOcean Apps](https://cloud.digitalocean.com/apps)
2. Click on `easyescrow-backend-staging`
3. Navigate to **Settings** → **App-Level Environment Variables**

### Step 2: Add Each Secret

Add the following secrets one by one. Get the actual values from your local `.env.staging` file:

#### Core Secrets

**SOLANA_RPC_URL**
- Value: Get from your local `.env.staging` file or Helius dashboard
- Format: `https://devnet.helius-rpc.com/?api-key=<your-helius-api-key>`
- Type: ✅ Encrypt
- Scope: All components

**DATABASE_URL**
- Value: Get from your local `.env.staging` file or DigitalOcean database dashboard
- Format: `postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require`
- Type: ✅ Encrypt
- Scope: All components

**DATABASE_POOL_URL**
- Value: Get from your local `.env.staging` file or DigitalOcean database dashboard
- Format: `postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require`
- Type: ✅ Encrypt
- Scope: All components

**REDIS_URL**
- Value: Get from your local `.env.staging` file or Redis Cloud dashboard
- Format: `rediss://default:<password>@<host>:<port>`
- Type: ✅ Encrypt
- Scope: All components

#### Wallet Private Keys

⚠️ **IMPORTANT:** Get all wallet private keys from your local `.env.staging` file. Never share or commit these values.

**DEVNET_STAGING_SENDER_PRIVATE_KEY**
- Value: Get from `.env.staging` file
- Format: Base58 encoded private key (87-88 characters)
- Type: ✅ Encrypt
- Scope: All components

**DEVNET_STAGING_RECEIVER_PRIVATE_KEY**
- Value: Get from `.env.staging` file
- Format: Base58 encoded private key (87-88 characters)
- Type: ✅ Encrypt
- Scope: All components

**DEVNET_STAGING_ADMIN_PRIVATE_KEY**
- Value: Get from `.env.staging` file
- Format: Base58 encoded private key (87-88 characters)
- Type: ✅ Encrypt
- Scope: All components

**DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY**
- Value: Get from `.env.staging` file
- Format: Base58 encoded private key (87-88 characters)
- Type: ✅ Encrypt
- Scope: All components

#### Authentication & Security

**JWT_SECRET**
- Value: Generate a new one with: `openssl rand -base64 32`
- Type: ✅ Encrypt
- Scope: All components

**WEBHOOK_SECRET**
- Value: Generate a new one with: `openssl rand -base64 32`
- Type: ✅ Encrypt
- Scope: All components

#### Email Configuration (Optional)

**SMTP_USER**
- Value: Your Mailtrap username (if using Mailtrap)
- Type: ✅ Encrypt
- Scope: All components

**SMTP_PASS**
- Value: Your Mailtrap password (if using Mailtrap)
- Type: ✅ Encrypt
- Scope: All components

#### DigitalOcean Spaces

**DO_SPACES_KEY**
- Value: Get from `.env.staging` file or DigitalOcean Spaces dashboard
- Format: 20-character alphanumeric key
- Type: ✅ Encrypt
- Scope: All components

**DO_SPACES_SECRET**
- Value: Get from `.env.staging` file or DigitalOcean Spaces dashboard
- Format: 43-character base64 secret
- Type: ✅ Encrypt
- Scope: All components

### Step 3: Save and Redeploy
1. Click **Save** after adding all secrets
2. The app will automatically redeploy
3. Monitor the deployment logs

## Method 2: Via doctl CLI (Alternative)

⚠️ **Note:** This method is more complex and requires careful handling to avoid exposing secrets in command history.

See `scripts/deployment/set-staging-secrets-secure.ps1` for a PowerShell implementation.

## Verification

After setting secrets, verify they're loaded correctly:

### 1. Check Deployment Status
```bash
doctl apps get ea13cdbb-c74e-40da-a0eb-6c05b0d0432d
```

### 2. Check Logs
```bash
doctl apps logs ea13cdbb-c74e-40da-a0eb-6c05b0d0432d --follow
```

Look for:
- ✅ No `${VARIABLE_NAME}` in logs (means placeholders are replaced)
- ✅ Successful database connection
- ✅ Successful Redis connection
- ✅ Successful Solana RPC connection
- ❌ No "Endpoint URL must start with `http:` or `https:`" errors

### 3. Test Health Endpoint
```bash
curl https://staging.easyescrow.ai/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-21T23:45:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "solana": "connected"
  }
}
```

## Troubleshooting

### Error: "Endpoint URL must start with `http:` or `https:`"
**Cause:** `SOLANA_RPC_URL` secret is not set or placeholder is not replaced  
**Solution:** Set `SOLANA_RPC_URL` in DigitalOcean console as shown above

### Error: "Cannot connect to database"
**Cause:** `DATABASE_URL` secret is not set correctly  
**Solution:** Verify `DATABASE_URL` is set with correct connection string

### Error: "Redis connection failed"
**Cause:** `REDIS_URL` secret is not set correctly  
**Solution:** Verify `REDIS_URL` is set with correct connection string

### Secrets Not Loading
1. Check that secrets are marked as "Encrypt" in console
2. Verify secret names match exactly (case-sensitive)
3. Check that app has been redeployed after setting secrets
4. Review deployment logs for errors

## Security Best Practices

### ✅ DO
- Set secrets via DigitalOcean console
- Mark all sensitive values as "Encrypt"
- Use strong, randomly generated values for JWT_SECRET and WEBHOOK_SECRET
- Rotate secrets regularly
- Use different secrets for staging and production

### ❌ DON'T
- Commit secrets to Git
- Add secrets directly to YAML files
- Share secrets via insecure channels
- Reuse secrets across environments
- Log secret values

## Generating Secure Secrets

### JWT Secret
```bash
openssl rand -base64 32
```

### Webhook Secret
```bash
openssl rand -hex 32
```

### API Keys
Use the provider's dashboard to generate new keys (Helius, Redis Cloud, etc.)

## Related Documentation

- [deployment-secrets.mdc](mdc:.cursor/rules/deployment-secrets.mdc) - Security rules
- [SECRETS_MANAGEMENT.md](mdc:docs/SECRETS_MANAGEMENT.md) - General secrets management
- [DIGITALOCEAN_SECRETS_CONFIGURATION.md](mdc:docs/DIGITALOCEAN_SECRETS_CONFIGURATION.md) - DO-specific configuration

---

**Remember:** Never commit actual secret values to version control. Always use the DigitalOcean console or secure API methods to set secrets.
