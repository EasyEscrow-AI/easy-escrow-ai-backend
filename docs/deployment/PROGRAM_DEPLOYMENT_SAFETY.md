# Program Deployment Safety Guide

## Critical Incident: Accidental Program ID Mismatch (2025-11-05)

### What Happened

On November 5, 2025, during the RefCell fix deployment to staging, a program ID mismatch occurred:

- **Intended Program ID**: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` (staging)
- **Accidentally Deployed To**: `7bteFyUMAxPBNqRjbhoKAMcnnoseb5Hm14Noa3W45TUz` (wrong ID)

### Root Cause Analysis

1. **Keypair File Present**: `target/deploy/escrow-keypair.json` contained a keypair with public key `7bteFyUMAxPBNqRjbhoKAMcnnoseb5Hm14Noa3W45TUz`

2. **Build vs Deploy Mismatch**:
   ```bash
   # Built with staging feature (correct ID in binary)
   anchor build -- --no-default-features --features staging
   
   # Deployed to devnet cluster (used keypair file, wrong ID)
   anchor deploy --provider.cluster devnet
   ```

3. **Configuration Gap**: `Anchor.toml` has `[programs.devnet]` but NO `[programs.staging]` section

4. **Anchor's Behavior**: When deploying, Anchor:
   - Looks for `[programs.<cluster>]` in Anchor.toml
   - If not found or mismatch, uses/generates keypair from `target/deploy/escrow-keypair.json`
   - Deploys the binary (with hardcoded ID) to the program ID from the keypair
   - Creates a program ID mismatch

### Impact

- ✅ **Caught Early**: Detected in staging before production
- ⚠️ **Backend Error**: `Program ID mismatch: IDL has 7bteFy..., config has AvdX6L...`
- ✅ **No Data Loss**: Staging environment, no user impact
- ✅ **Quick Fix**: Corrected IDL address and upgraded correct program

## Prevention Rules

### Rule 1: NEVER Use `anchor deploy` for Existing Programs

**❌ DANGEROUS:**
```bash
anchor deploy --provider.cluster devnet
anchor deploy --provider.cluster mainnet
```

**✅ SAFE:**
```bash
# Always upgrade existing programs with explicit program ID
anchor upgrade target/deploy/escrow.so --program-id <PROGRAM_ID> --provider.cluster <cluster>
```

### Rule 2: Delete Keypair Files for Deployed Programs

After initial deployment, **delete the keypair file** to prevent accidents:

```bash
# After first-time deployment
rm target/deploy/escrow-keypair.json

# Confirm it's gone
ls target/deploy/*.json
```

**Why**: If the keypair file exists, `anchor deploy` will use it, creating mismatches.

### Rule 3: Pre-Deployment Verification Checklist

Before ANY deployment:

```bash
# 1. Verify the build feature matches target environment
echo "Building for: STAGING"
anchor build -- --no-default-features --features staging

# 2. Extract and verify program ID from the built binary
solana-verify get-program-id target/deploy/escrow.so

# Expected output should match:
# Staging: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
# Devnet:  AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
# Mainnet: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

# 3. Verify no keypair file exists (for existing programs)
if (Test-Path target/deploy/escrow-keypair.json) {
    Write-Error "DANGER: Keypair file exists! Remove it before upgrading."
    exit 1
}

# 4. Verify the target program exists on-chain
solana program show <PROGRAM_ID> --url <cluster>

# 5. Verify you have upgrade authority
solana program show <PROGRAM_ID> --url <cluster> | Select-String "Upgrade Authority"
```

### Rule 4: Environment-Specific Deployment Scripts

**Staging Deployment:**
```bash
#!/bin/bash
# deploy-staging.sh

set -e  # Exit on error

PROGRAM_ID="AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
CLUSTER="devnet"
BINARY="target/deploy/escrow.so"

echo "🔍 Pre-deployment checks..."

# Check keypair file doesn't exist
if [ -f "target/deploy/escrow-keypair.json" ]; then
    echo "❌ ERROR: Keypair file exists. Remove it first."
    exit 1
fi

# Build with staging features
echo "🔨 Building for staging..."
anchor build -- --no-default-features --features staging

# Verify program ID in binary
echo "🔍 Verifying program ID in binary..."
BINARY_ID=$(solana-verify get-program-id $BINARY)
if [ "$BINARY_ID" != "$PROGRAM_ID" ]; then
    echo "❌ ERROR: Binary has wrong program ID: $BINARY_ID (expected: $PROGRAM_ID)"
    exit 1
fi

# Verify program exists on-chain
echo "🔍 Verifying program exists on-chain..."
solana program show $PROGRAM_ID --url $CLUSTER > /dev/null

# Upgrade
echo "🚀 Upgrading program on $CLUSTER..."
anchor upgrade $BINARY --program-id $PROGRAM_ID --provider.cluster $CLUSTER

echo "✅ Deployment complete!"
echo "📋 Next steps:"
echo "   1. Copy IDL: cp target/idl/escrow.json src/generated/anchor/escrow-idl-staging.json"
echo "   2. Verify IDL address matches: $PROGRAM_ID"
echo "   3. Commit and push IDL"
echo "   4. Deploy backend"
```

**Production Deployment:**
```bash
#!/bin/bash
# deploy-production.sh

set -e

PROGRAM_ID="2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"
CLUSTER="mainnet"
BINARY="target/deploy/escrow.so"

echo "⚠️  PRODUCTION DEPLOYMENT - REQUIRES MANUAL CONFIRMATION"
echo "Program ID: $PROGRAM_ID"
echo "Cluster: $CLUSTER"
read -p "Type 'DEPLOY TO PRODUCTION' to continue: " confirm

if [ "$confirm" != "DEPLOY TO PRODUCTION" ]; then
    echo "❌ Deployment cancelled"
    exit 1
fi

# Same checks as staging...
# (Full script would include all verification steps)
```

### Rule 5: IDL Verification After Deployment

After ANY deployment:

```bash
# 1. Copy IDL to correct location
cp target/idl/escrow.json src/generated/anchor/escrow-idl-<environment>.json

# 2. Verify the address field matches the deployed program
cat src/generated/anchor/escrow-idl-<environment>.json | grep '"address"'

# Expected output:
# "address": "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei",  # Staging
# "address": "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei",  # Devnet
# "address": "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx",  # Mainnet

# 3. If mismatch, FIX IT IMMEDIATELY before committing
# BAD:  "address": "7bteFyUMAxPBNqRjbhoKAMcnnoseb5Hm14Noa3W45TUz",
# GOOD: "address": "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei",
```

### Rule 6: Anchor.toml Configuration

The current `Anchor.toml` configuration:

```toml
[programs.devnet]
escrow = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"

[programs.mainnet]
escrow = "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"

[programs.localnet]
escrow = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"

# Note: "staging" is not a recognized Anchor cluster
# Staging deployment uses devnet cluster with a different program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
# Use: anchor upgrade --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
```

**Important**: Staging uses the `devnet` cluster but has a different program ID. Always use `anchor upgrade --program-id` for staging.

## Program ID Reference

| Environment | Program ID | Cluster | Build Command |
|------------|------------|---------|---------------|
| **Staging** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | devnet | `anchor build -- --no-default-features --features staging` |
| **Devnet** | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | devnet | `anchor build -- --no-default-features --features devnet` |
| **Mainnet** | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` | mainnet-beta | `anchor build -- --no-default-features --features mainnet` |
| **Localnet** | `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` | localnet | `anchor build -- --no-default-features --features localnet` |

## Emergency Response: Program ID Mismatch Detected

If you discover a program ID mismatch:

### 1. Immediate Actions

```bash
# DO NOT DEPLOY BACKEND - Fix IDL first

# 1. Check what's actually deployed on-chain
solana program show <SUSPECTED_WRONG_ID> --url <cluster>
solana program show <INTENDED_CORRECT_ID> --url <cluster>

# 2. Verify which ID has your code
# (Check transaction history, buffer accounts, etc.)

# 3. If wrong program was deployed:
#    - Close/abandon the wrong program (if possible)
#    - Upgrade the correct program with the right binary
```

### 2. Fix IDL

```bash
# 1. Locate the IDL file
cd src/generated/anchor/

# 2. Check current address
grep '"address"' escrow-idl-<environment>.json

# 3. Fix if needed
# Edit the file to change:
# FROM: "address": "7bteFyUMAxPBNqRjbhoKAMcnnoseb5Hm14Noa3W45TUz",
# TO:   "address": "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei",

# 4. Commit and deploy backend
git add src/generated/anchor/escrow-idl-<environment>.json
git commit -m "FIX: Correct program ID in <environment> IDL"
git push origin <branch>
```

### 3. Prevention for Next Time

```bash
# Delete the problematic keypair file
rm target/deploy/escrow-keypair.json

# Add to .gitignore (if not already there)
echo "target/deploy/*.json" >> .gitignore
echo "!target/deploy/deployment-*.json" >> .gitignore

# Verify
git check-ignore target/deploy/escrow-keypair.json
# Should output: target/deploy/escrow-keypair.json
```

## Testing Deployment Scripts

Before using in production, test deployment scripts in localnet:

```bash
# 1. Start local validator
solana-test-validator --reset

# 2. Build for localnet
anchor build -- --no-default-features --features localnet

# 3. Deploy (first time - OK to use anchor deploy)
anchor deploy --provider.cluster localnet

# 4. Make a code change
# (Edit something in programs/escrow/src/lib.rs)

# 5. Rebuild
anchor build -- --no-default-features --features localnet

# 6. Test upgrade script
./scripts/deploy-localnet.sh

# 7. Verify it worked
solana program show Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS --url localhost
```

## Monitoring & Alerts

### Post-Deployment Verification

After ANY deployment:

```bash
# 1. Verify program ID on-chain
curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getAccountInfo",
  "params": [
    "<PROGRAM_ID>",
    {"encoding": "base64"}
  ]
}'

# 2. Test a simple transaction
# (Create test agreement, verify it uses correct program)

# 3. Check backend logs for program ID mismatches
# Look for errors like: "Program ID mismatch: IDL has X, config has Y"

# 4. Verify IDL address
curl https://staging-api.easyescrow.ai/health | jq .programId
# Should match deployed program ID
```

## Lessons Learned

1. **Never Trust `anchor deploy`** for existing programs - always use `anchor upgrade` with explicit `--program-id`

2. **Delete Keypair Files** after first deployment to prevent accidental reuse

3. **Verify Everything** before deployment:
   - Build features match target environment
   - Binary contains correct program ID
   - No keypair files present
   - Target program exists on-chain
   - You have upgrade authority

4. **Automate Verification** with deployment scripts that check everything

5. **Monitor Post-Deployment** for program ID mismatches in logs

## Related Documents

- [Solana Program Deployment Best Practices](https://docs.solana.com/cli/deploy-a-program)
- [Anchor Deployment Guide](https://www.anchor-lang.com/docs/cli)
- [Program Upgrade Authority Management](https://docs.solana.com/cli/examples/deploy-a-program#upgrade-a-program)

## Incident Log

| Date | Incident | Environment | Impact | Resolution |
|------|----------|-------------|--------|-----------|
| 2025-11-05 | Program ID mismatch during RefCell fix deployment | Staging | Backend API errors, no user impact | Corrected IDL address, upgraded correct program |

---

**Last Updated**: 2025-11-05
**Next Review**: Before next production deployment
**Owner**: Engineering Team
