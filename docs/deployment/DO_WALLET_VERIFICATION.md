# DigitalOcean Wallet Configuration Verification

**Last Updated:** October 17, 2025  
**Environment:** dev  
**Status:** ✅ CONFIGURED

---

## Required Environment Variables

The following environment variables MUST be set on the DigitalOcean dev server and MUST match the test wallet configuration.

### Core Configuration

```bash
# Official USDC-DEV Mint Address
USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

# Our Deployed DEVNET program ID
ESCROW_PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd
```

### Devnet Test Wallets

These wallet private keys MUST correspond to the exact addresses in `tests/fixtures/devnet-config.json`.

| Wallet Role | Expected Address | Private Key Env Var |
|-------------|------------------|---------------------|
| **Sender** | `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` | `DEVNET_SENDER_PRIVATE_KEY` |
| **Receiver** | `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` | `DEVNET_RECEIVER_PRIVATE_KEY` |
| **Admin** | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` | `DEVNET_ADMIN_PRIVATE_KEY` |
| **Fee Collector** | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` | `DEVNET_FEE_COLLECTOR_PRIVATE_KEY` |

---

## Verification Steps

### 1. Check DigitalOcean Environment Variables

```powershell
# PowerShell
$appId = "31d5b0dc-d2be-4923-9946-7039194666cf"
$headers = @{ "Authorization" = "Bearer $env:DIGITALOCEAN_API_KEY"; "Content-Type" = "application/json" }
$response = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps/$appId" -Method Get -Headers $headers
$response.app.spec.services[0].envs | Where-Object { $_.key -match "USDC_MINT|ESCROW_PROGRAM|DEVNET_" } | Select-Object key, value
```

#### Expected Results:

- ✅ `USDC_MINT_ADDRESS` = `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`
- ✅ `ESCROW_PROGRAM_ID` = `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd`
- ✅ `DEVNET_SENDER_PRIVATE_KEY` = (encrypted, starts with `EV[1:`)
- ✅ `DEVNET_RECEIVER_PRIVATE_KEY` = (encrypted, starts with `EV[1:`)
- ✅ `DEVNET_ADMIN_PRIVATE_KEY` = (encrypted, starts with `EV[1:`)
- ✅ `DEVNET_FEE_COLLECTOR_PRIVATE_KEY` = (encrypted, starts with `EV[1:`)

### 2. Verify Server Health

```powershell
# Check if server is responding
Invoke-RestMethod -Uri "https://easyescrow-backend-dev-rg7y6.ondigitalocean.app/health" -Method Get
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-17T...",
  "services": {
    "database": "connected",
    "redis": "connected",
    "solana": "connected"
  }
}
```

### 3. Run Wallet Verification Script

```powershell
.\scripts\verify-do-wallet-config.ps1
```

This script checks:
- ✅ Server health
- ✅ Expected wallet addresses
- ✅ Program ID and USDC mint

### 4. Check Deployment Logs

Monitor the DigitalOcean deployment logs for wallet initialization:

https://cloud.digitalocean.com/apps/31d5b0dc-d2be-4923-9946-7039194666cf

**Look for these log entries:**
```
[SolanaService] Solana RPC initialized
  Network: devnet
  RPC URL: https://api.devnet.solana.com
  USDC Mint: Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
  Escrow Program ID: 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd
```

### 5. Run E2E Tests (CRITICAL)

The most reliable way to verify wallet configuration is to run E2E tests:

```powershell
# Run E2E tests
npm run test:e2e
```

**Expected Results:**
- ✅ All wallet addresses match
- ✅ NFT deposit succeeds (from Sender wallet)
- ✅ USDC deposit succeeds (from Receiver wallet)
- ✅ Admin can initialize escrow
- ✅ Settlement completes successfully

If tests fail with "signature verification" or "unauthorized" errors, the wallet private keys may not match the expected addresses.

---

## Troubleshooting

### Issue: Wrong Program ID

**Symptoms:**
- E2E tests fail with "Program ID mismatch"
- Transactions fail with "unknown program"

**Solution:**
```powershell
# Update ESCROW_PROGRAM_ID
.\temp\update-do-env.ps1

# Or manually via DigitalOcean console:
# Settings > App-Level Environment Variables
# Update: ESCROW_PROGRAM_ID = 4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd
```

### Issue: Wallet Address Mismatch

**Symptoms:**
- E2E tests fail with "signature verification failed"
- Deposits fail with "unauthorized"

**Solution:**

The private key stored in `DEVNET_*_PRIVATE_KEY` generates a specific public key (address). If these don't match, you need to either:

**Option A:** Use the correct private keys that generate the expected addresses
```powershell
.\temp\update-do-env.ps1  # Uses correct keys from .env
```

**Option B:** Update `tests/fixtures/devnet-config.json` with the actual addresses
```bash
# Generate addresses from private keys
solana-keygen pubkey <private-key>
```

### Issue: USDC Mint Mismatch

**Symptoms:**
- Token transfers fail
- "Invalid mint address" errors

**Solution:**
```powershell
# Update USDC_MINT_ADDRESS
.\temp\update-do-env.ps1
```

The official devnet USDC mint is: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`

---

## Update Procedure

Whenever wallet configuration needs to be updated:

1. **Update local `.env` file** with correct values
2. **Run update script:**
   ```powershell
   .\temp\update-do-env.ps1
   ```
3. **Wait for deployment** (3-5 minutes)
4. **Verify configuration:**
   ```powershell
   .\scripts\verify-do-wallet-config.ps1
   ```
5. **Run E2E tests:**
   ```powershell
   npm run test:e2e
   ```

---

## Security Notes

### Private Keys

- ✅ Private keys are stored as **encrypted secrets** in DigitalOcean
- ✅ Keys appear as `EV[1:...]` in API responses (encrypted)
- ✅ Never commit private keys to git
- ✅ Never log private keys in application logs

### Devnet vs Production

| Environment | Wallet Type | Security Level |
|-------------|-------------|----------------|
| **Devnet** | Test wallets with known private keys | ⚠️ LOW - For testing only |
| **Production** | Real wallets with secured private keys | 🔒 HIGH - Full security required |

**⚠️ CRITICAL:** The wallet private keys in this document are **DEVNET TEST WALLETS ONLY**. Never use these for production!

---

## Deployment Checklist

Before deploying to production:

- [ ] Generate new, secure wallet keypairs for production
- [ ] Store production private keys securely (e.g., HashiCorp Vault, AWS Secrets Manager)
- [ ] Update `ESCROW_PROGRAM_ID` to production program
- [ ] Update `USDC_MINT_ADDRESS` to mainnet USDC mint
- [ ] Remove devnet test wallet configuration
- [ ] Verify all environment variables are correct
- [ ] Run production smoke tests
- [ ] Monitor deployment logs
- [ ] Set up wallet balance alerts

---

## Last Deployment

**Date:** October 17, 2025  
**Deployment ID:** `43ac3cc2-676f-4f61-9afd-73bba23e4605`  
**Status:** ✅ All environment variables updated  
**Verification:** Pending deployment completion

**Changes:**
- ✅ Updated `ESCROW_PROGRAM_ID` to `4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd`
- ✅ Confirmed `USDC_MINT_ADDRESS` = `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`
- ✅ Updated all 4 devnet wallet private keys
- ✅ Wallet addresses match `tests/fixtures/devnet-config.json`

---

## References

- [DigitalOcean App Console](https://cloud.digitalocean.com/apps/31d5b0dc-d2be-4923-9946-7039194666cf)
- [Devnet Config](../tests/fixtures/devnet-config.json)
- [DO Server E2E Checklist](./DO_SERVER_E2E_CHECKLIST.md)
- [Deployment Guide](./PROGRAM_DEPLOYMENT_GUIDE.md)

