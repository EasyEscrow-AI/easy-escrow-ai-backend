# Environment Setup for Devnet E2E Testing

This guide covers setting up environment variables for devnet E2E testing with static wallets.

## Quick Start (PowerShell - Recommended)

### 1. Set Environment Variables

Use the helper script to set environment variables in one command:

```powershell
.\scripts\set-devnet-env-vars.ps1 `
  -SenderKey "<your_base58_key>" `
  -ReceiverKey "<your_base58_key>" `
  -AdminKey "<your_base58_key>" `
  -FeeCollectorKey "<your_base58_key>"
```

**For permanent setup (persists across sessions):**

```powershell
.\scripts\set-devnet-env-vars.ps1 `
  -SenderKey "<your_base58_key>" `
  -ReceiverKey "<your_base58_key>" `
  -AdminKey "<your_base58_key>" `
  -FeeCollectorKey "<your_base58_key>" `
  -Permanent
```

### 2. Verify Environment Variables

```powershell
.\scripts\set-devnet-env-vars.ps1 -Show
```

### 3. Fund Wallets

```powershell
.\scripts\fund-devnet-wallets.ps1 `
  -Buyer 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 `
  -Seller AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z `
  -Admin 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R `
  -FeeCollector 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ
```

### 4. Run Tests

```powershell
npm run test:e2e:devnet:nft-swap
```

## Alternative Methods

### Method 1: Manual PowerShell (Current Session)

Set variables one at a time:

```powershell
$env:DEVNET_SENDER_PRIVATE_KEY = "<your_base58_key>"
$env:DEVNET_RECEIVER_PRIVATE_KEY = "<your_base58_key>"
$env:DEVNET_ADMIN_PRIVATE_KEY = "<your_base58_key>"
$env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY = "<your_base58_key>"
```

### Method 2: PowerShell Profile (Auto-load)

Add to your PowerShell profile (`$PROFILE`):

```powershell
# Devnet E2E Testing
$env:DEVNET_SENDER_PRIVATE_KEY = "<your_base58_key>"
$env:DEVNET_RECEIVER_PRIVATE_KEY = "<your_base58_key>"
$env:DEVNET_ADMIN_PRIVATE_KEY = "<your_base58_key>"
$env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY = "<your_base58_key>"
```

⚠️ **Warning:** Only do this on secure development machines!

### Method 3: .env File (For dotenv support)

1. Copy the example file:
   ```powershell
   Copy-Item scripts\.env.devnet.example scripts\.env.devnet
   ```

2. Edit `scripts/.env.devnet` with your private keys

3. Load with dotenv (if using Node.js):
   ```javascript
   require('dotenv').config({ path: 'scripts/.env.devnet' });
   ```

### Method 4: System Environment Variables (Windows)

Set permanently via System Properties:

1. Open **System Properties** → **Environment Variables**
2. Under **User variables**, click **New**
3. Add each variable:
   - `DEVNET_SENDER_PRIVATE_KEY`
   - `DEVNET_RECEIVER_PRIVATE_KEY`
   - `DEVNET_ADMIN_PRIVATE_KEY`
   - `DEVNET_FEE_COLLECTOR_PRIVATE_KEY`
4. Restart PowerShell/Terminal

### Method 5: Bash/Linux

```bash
export DEVNET_SENDER_PRIVATE_KEY="<your_base58_key>"
export DEVNET_RECEIVER_PRIVATE_KEY="<your_base58_key>"
export DEVNET_ADMIN_PRIVATE_KEY="<your_base58_key>"
export DEVNET_FEE_COLLECTOR_PRIVATE_KEY="<your_base58_key>"
```

Or add to `~/.bashrc` or `~/.zshrc` for persistence.

## Converting Keypair JSON to Base58

If you have keypair files (e.g., from `solana-keygen`), convert them to base58:

### Using Node.js

```javascript
const fs = require('fs');
const bs58 = require('bs58');

const keypairFile = 'path/to/keypair.json';
const keypairArray = JSON.parse(fs.readFileSync(keypairFile, 'utf-8'));
const privateKey = bs58.encode(Buffer.from(keypairArray));

console.log(privateKey);
```

### One-liner

```bash
node -e "const bs58=require('bs58');const fs=require('fs');console.log(bs58.encode(Buffer.from(JSON.parse(fs.readFileSync('keypair.json')))))"
```

### Using Solana CLI

```bash
solana-keygen pubkey keypair.json  # Gets public key
# For private key, you need to read the JSON and convert manually
```

## Verification

### Check if variables are set:

```powershell
# PowerShell
Write-Host "Sender: $($env:DEVNET_SENDER_PRIVATE_KEY -ne $null)"
Write-Host "Receiver: $($env:DEVNET_RECEIVER_PRIVATE_KEY -ne $null)"
Write-Host "Admin: $($env:DEVNET_ADMIN_PRIVATE_KEY -ne $null)"
Write-Host "FeeCollector: $($env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY -ne $null)"
```

```bash
# Bash
echo "Sender: ${DEVNET_SENDER_PRIVATE_KEY:+SET}"
echo "Receiver: ${DEVNET_RECEIVER_PRIVATE_KEY:+SET}"
echo "Admin: ${DEVNET_ADMIN_PRIVATE_KEY:+SET}"
echo "FeeCollector: ${DEVNET_FEE_COLLECTOR_PRIVATE_KEY:+SET}"
```

### Or use the helper script:

```powershell
.\scripts\set-devnet-env-vars.ps1 -Show
```

## Troubleshooting

### "Failed to load devnet wallets"

**Cause:** Environment variables not set

**Solution:**
1. Run `.\scripts\set-devnet-env-vars.ps1 -Show` to check
2. Set missing variables
3. Restart your terminal/IDE if you set permanent variables

### Variables not persisting

**Cause:** Variables set for current session only

**Solutions:**
- Use `-Permanent` flag with the helper script
- Add to PowerShell profile
- Set as system environment variables

### "Invalid private key format"

**Cause:** Private key not in base58 format

**Solution:** Convert keypair JSON to base58 (see above)

## CI/CD Integration

### GitHub Actions

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run E2E Tests
        env:
          DEVNET_SENDER_PRIVATE_KEY: ${{ secrets.DEVNET_SENDER_PRIVATE_KEY }}
          DEVNET_RECEIVER_PRIVATE_KEY: ${{ secrets.DEVNET_RECEIVER_PRIVATE_KEY }}
          DEVNET_ADMIN_PRIVATE_KEY: ${{ secrets.DEVNET_ADMIN_PRIVATE_KEY }}
          DEVNET_FEE_COLLECTOR_PRIVATE_KEY: ${{ secrets.DEVNET_FEE_COLLECTOR_PRIVATE_KEY }}
        run: npm run test:e2e:devnet:nft-swap
```

Store private keys as **Repository Secrets** in GitHub.

## Security Best Practices

✅ **DO:**
- Use environment variables (never hardcode)
- Keep private keys secure
- Use different keys for different environments
- Rotate keys regularly
- Use secure key management (e.g., Azure Key Vault, AWS Secrets Manager)

❌ **DON'T:**
- Commit private keys to git
- Share private keys in chat/email
- Use mainnet keys on devnet
- Store keys in plain text files (in repo)
- Use the same keys across multiple projects

## Static Wallet Addresses

For reference, the static devnet wallets are:

| Role | Address |
|------|---------|
| Sender | `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z` |
| Receiver | `5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4` |
| Admin | `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R` |
| FeeCollector | `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ` |

See [STATIC_DEVNET_WALLETS.md](./STATIC_DEVNET_WALLETS.md) for more details.

