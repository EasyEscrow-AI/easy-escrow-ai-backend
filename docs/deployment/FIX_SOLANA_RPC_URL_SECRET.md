# Fix SOLANA_RPC_URL Secret in DigitalOcean App Platform

## Issue

The staging server is failing with the following error:

```
[SolanaService] Creating primary connection with URL: ${SOLANA_RPC_URL}
TypeError: Endpoint URL must start with `http:` or `https:`.
```

This indicates that the `SOLANA_RPC_URL` environment variable in DigitalOcean App Platform is set to the literal string `${SOLANA_RPC_URL}` instead of an actual RPC URL.

## Root Cause

The `staging-app.yaml` file correctly uses `${SOLANA_RPC_URL}` as a placeholder:

```yaml
- key: SOLANA_RPC_URL
  value: ${SOLANA_RPC_URL}
  type: SECRET
  scope: RUN_TIME
```

However, **DigitalOcean App Platform does NOT automatically substitute these placeholders**. The actual value must be set manually in the App Platform console.

## Solution

### Option 1: Set via DigitalOcean Web Console (Recommended)

1. **Navigate to App Settings**:
   - Go to https://cloud.digitalocean.com/apps
   - Select your staging app: `easyescrow-backend-staging`
   - Click on the **Settings** tab
   - Click on **App-Level Environment Variables** (or the `api` component's environment variables)

2. **Find or Add SOLANA_RPC_URL**:
   - Look for the `SOLANA_RPC_URL` variable in the list
   - If it exists, click the **Edit** button
   - If it doesn't exist, click **Add Variable**

3. **Set the Actual RPC URL**:
   - **Variable Name**: `SOLANA_RPC_URL`
   - **Value**: Your actual Solana RPC URL (see options below)
   - **Type**: Select **Secret** (encrypted)
   - **Scope**: `RUN_TIME`

4. **Save and Redeploy**:
   - Click **Save**
   - DigitalOcean will automatically trigger a redeployment
   - Wait for the deployment to complete
   - Check logs to verify the connection is working

### Option 2: Set via doctl CLI

```bash
# Get your app ID
doctl apps list

# Update the app with environment variable
# Note: This requires setting the variable through the API
# It's easier to use the web console for secrets
```

## RPC URL Options

### For Devnet (Staging):

**Option 1: Helius (Recommended)**
- Sign up at https://helius.dev
- Create a new project
- Get your devnet RPC URL:
  ```
  https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
  ```

**Option 2: QuickNode**
- Sign up at https://quicknode.com
- Create a Solana devnet endpoint
- Get your RPC URL:
  ```
  https://YOUR_ENDPOINT.devnet.solana.quiknode.pro/YOUR_API_KEY/
  ```

**Option 3: Alchemy**
- Sign up at https://alchemy.com
- Create a Solana devnet project
- Get your RPC URL:
  ```
  https://solana-devnet.g.alchemy.com/v2/YOUR_API_KEY
  ```

**Option 4: Public Devnet (Not Recommended for Production)**
- Free but rate-limited and unreliable:
  ```
  https://api.devnet.solana.com
  ```

### For Mainnet (Production):

Use the same providers but select mainnet endpoints. **Never use public mainnet endpoints in production.**

## Verification

After setting the environment variable:

1. **Check Deployment Logs**:
   ```bash
   doctl apps logs easyescrow-backend-staging --follow
   ```

2. **Look for Successful Connection**:
   ```
   [SolanaService] Creating primary connection with URL: https://devnet.helius-rpc...
   [SolanaService] Initialized with primary RPC: https://devnet.helius-rpc...
   [SolanaService] Health check passed - Solana version: 1.18.x, Latency: XXms
   ```

3. **Test Health Endpoint**:
   ```bash
   curl https://staging.easyescrow.ai/health
   ```

   Should return:
   ```json
   {
     "status": "healthy",
     "solana": {
       "healthy": true,
       "lastCheck": "2025-10-22T00:15:00.000Z"
     }
   }
   ```

## Code Improvements

The code has been updated with better validation and error messages:

### Before:
```typescript
console.log(`[SolanaService] Creating primary connection with URL: ${rpcUrl}`);
this.connection = new Connection(rpcUrl, httpConnectionConfig);
```

### After:
```typescript
// Check for common configuration errors
if (rpcUrl.includes('${') || rpcUrl.includes('}')) {
  throw new Error(
    `[SolanaService] Configuration error: SOLANA_RPC_URL contains placeholder syntax '${rpcUrl}'. ` +
    `This means the environment variable is not set in DigitalOcean App Platform. ` +
    `Please set the actual RPC URL value in the App Platform console under Settings > Environment Variables.`
  );
}

// Validate URL format
if (!/^https?:\/\//i.test(rpcUrl)) {
  throw new Error(
    `[SolanaService] Configuration error: SOLANA_RPC_URL must start with 'http://' or 'https://'. ` +
    `Got: '${rpcUrl?.slice(0, 50)}...' ` +
    `Please check the environment variable value in DigitalOcean App Platform.`
  );
}

// Log only first 30 characters for security
console.log(`[SolanaService] Creating primary connection with URL: ${rpcUrl.slice(0, 30)}...`);
this.connection = new Connection(rpcUrl, httpConnectionConfig);
```

## Other Required Secrets

While fixing `SOLANA_RPC_URL`, ensure these other secrets are also properly set in DigitalOcean:

### Critical Secrets:
- ✅ `SOLANA_RPC_URL` - Solana RPC endpoint
- ⚠️ `DATABASE_URL` - PostgreSQL connection string
- ⚠️ `DATABASE_POOL_URL` - PostgreSQL pooler connection string
- ⚠️ `REDIS_URL` - Redis connection string
- ⚠️ `JWT_SECRET` - JWT signing secret
- ⚠️ `DEVNET_STAGING_ADMIN_PRIVATE_KEY` - Admin wallet private key
- ⚠️ `DEVNET_STAGING_SENDER_PRIVATE_KEY` - Sender wallet private key
- ⚠️ `DEVNET_STAGING_RECEIVER_PRIVATE_KEY` - Receiver wallet private key
- ⚠️ `DEVNET_STAGING_FEE_COLLECTOR_PRIVATE_KEY` - Fee collector wallet private key

### Optional Secrets:
- `WEBHOOK_SECRET` - Webhook signing secret
- `SMTP_USER` - Email SMTP username
- `SMTP_PASS` - Email SMTP password
- `DO_SPACES_KEY` - DigitalOcean Spaces access key
- `DO_SPACES_SECRET` - DigitalOcean Spaces secret key
- `SENTRY_DSN` - Sentry error tracking DSN

## Security Best Practices

1. **Never commit secrets to Git**
   - The YAML file should only contain `${PLACEHOLDER}` syntax
   - Actual secrets live in DigitalOcean App Platform or GitHub Secrets

2. **Use encrypted secrets in DigitalOcean**
   - Always mark sensitive variables as "Secret" type
   - This encrypts them at rest and in transit

3. **Rotate secrets regularly**
   - Change RPC API keys periodically
   - Rotate JWT secrets on a schedule
   - Generate new wallet keys for each environment

4. **Use different secrets per environment**
   - Development: Local `.env` file (gitignored)
   - Staging: DigitalOcean App Platform secrets
   - Production: DigitalOcean App Platform secrets (different values!)

## Related Documentation

- [Secrets Management Guide](../SECRETS_MANAGEMENT.md)
- [DigitalOcean Secrets Configuration](../DIGITALOCEAN_SECRETS_CONFIGURATION.md)
- [Deployment Secrets Rule](.cursor/rules/deployment-secrets.mdc)
- [Set Staging Secrets Guide](SET_STAGING_SECRETS_GUIDE.md)

## Troubleshooting

### Issue: Variable still shows placeholder after setting

**Solution**: 
- Make sure you clicked "Save" after editing
- Wait for the automatic redeployment to complete
- Check the logs to confirm the new deployment picked up the change

### Issue: RPC URL is not working (timeout or connection errors)

**Solution**:
- Verify the RPC URL is correct (copy-paste from provider dashboard)
- Check if the API key in the URL is valid
- Try the fallback URL: `https://api.devnet.solana.com`
- Check provider status page for outages

### Issue: Multiple environment variables need updating

**Solution**:
- Use the bulk edit feature in DigitalOcean console
- Or use the provided script: `scripts/deployment/set-staging-secrets-secure.ps1`
- Follow the guide: [Set Staging Secrets Guide](SET_STAGING_SECRETS_GUIDE.md)

## Summary

**The fix is simple**: 
1. Go to DigitalOcean App Platform console
2. Navigate to your staging app's environment variables
3. Set `SOLANA_RPC_URL` to an actual RPC endpoint URL (e.g., from Helius)
4. Mark it as "Secret" type
5. Save and wait for redeployment

The code now has better validation to catch this error early and provide clear guidance.

