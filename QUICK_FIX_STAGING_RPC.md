# 🚨 QUICK FIX: Staging Server RPC URL

## The Problem
Your staging server is crashing because `SOLANA_RPC_URL` is not set in DigitalOcean.

## The Fix (5 minutes)

### Step 1: Get an RPC URL

**Option A - Helius (Recommended)**
1. Go to https://helius.dev
2. Sign up (free)
3. Create a new project
4. Copy your **Devnet** RPC URL:
   ```
   https://devnet.helius-rpc.com/?api-key=YOUR_KEY_HERE
   ```

**Option B - Use Public Devnet (Quick Test)**
```
https://api.devnet.solana.com
```
⚠️ Not recommended for production - rate limited and unreliable

### Step 2: Set in DigitalOcean

1. Go to: https://cloud.digitalocean.com/apps
2. Click on `easyescrow-backend-staging`
3. Go to **Settings** tab
4. Click **App-Level Environment Variables** (or click on the `api` component)
5. Find `SOLANA_RPC_URL` (or click **Add Variable**)
6. Set:
   - **Name**: `SOLANA_RPC_URL`
   - **Value**: `https://devnet.helius-rpc.com/?api-key=YOUR_KEY` (your actual URL)
   - **Type**: ✅ **Secret** (encrypted)
   - **Scope**: `RUN_TIME`
7. Click **Save**

### Step 3: Wait for Redeploy

DigitalOcean will automatically redeploy (takes ~3-5 minutes).

### Step 4: Verify

```bash
# Check logs
doctl apps logs easyescrow-backend-staging --follow

# Should see:
# [SolanaService] Creating primary connection with URL: https://devnet.helius-rpc...
# [SolanaService] Health check passed ✓
```

Or test the health endpoint:
```bash
curl https://staging.easyescrow.ai/health
```

## That's It!

Your staging server should now start successfully.

---

## Need More Help?

- **Full Guide**: [docs/deployment/FIX_SOLANA_RPC_URL_SECRET.md](docs/deployment/FIX_SOLANA_RPC_URL_SECRET.md)
- **All Changes**: [docs/SOLANA_RPC_VALIDATION_FIX.md](docs/SOLANA_RPC_VALIDATION_FIX.md)

## Other Required Secrets

While you're in the environment variables, make sure these are also set:
- ✅ `DATABASE_URL` - PostgreSQL connection string
- ✅ `REDIS_URL` - Redis connection string  
- ✅ `JWT_SECRET` - JWT signing secret
- ✅ `DEVNET_STAGING_ADMIN_PRIVATE_KEY` - Admin wallet key

See [docs/deployment/SET_STAGING_SECRETS_GUIDE.md](docs/deployment/SET_STAGING_SECRETS_GUIDE.md) for the complete list.

