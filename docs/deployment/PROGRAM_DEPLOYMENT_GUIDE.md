# Solana Program Deployment Guide

## Critical: Multi-Environment Deployment Process

This guide covers deploying the Solana escrow program to staging (devnet) and production (mainnet).

## ⚠️ Important Notes

- **Staging** runs on devnet with program ID: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- **Production** runs on mainnet with program ID: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- The Rust code `declare_id!()` currently matches **production only**
- For staging deployments, you need to **upgrade** the existing program, not redeploy

## Prerequisites

1. **Anchor CLI installed** (v0.32.1 or compatible)
2. **Solana CLI installed**
3. **Correct keypair configured** for deployment
4. **Sufficient SOL** for deployment costs
   - Devnet: Free SOL from faucet
   - Mainnet: ~5-10 SOL for deployment + IDL upload

## Before Deploying

### Step 1: Update Admin Public Keys

⚠️ **CRITICAL**: Update admin keys in `programs/escrow/src/lib.rs`:

```rust
const DEVNET_ADMIN: &str = "YOUR_DEVNET_ADMIN_PUBKEY";
const STAGING_ADMIN: &str = "YOUR_STAGING_ADMIN_PUBKEY"; 
const MAINNET_ADMIN: &str = "YOUR_MAINNET_ADMIN_PUBKEY";
```

Get your admin public keys:
```bash
# From backend logs when service starts:
# "[EscrowProgramService] Loaded admin keypair: <PUBKEY>"

# Or from keypair file:
solana-keygen pubkey <keypair.json>
```

### Step 2: Verify Changes

Review program changes:
```bash
git diff origin/staging...HEAD programs/escrow/src/lib.rs
```

Key changes in this deployment:
- ✅ Added `platform_fee_bps` parameter to `init_agreement`
- ✅ Removed `platform_fee_bps` parameter from `settle`
- ✅ Added admin authorization check
- ✅ Added `platform_fee_bps` field to `EscrowState`
- ✅ Added `UnauthorizedAdmin` error

## Deployment Process

### Staging Deployment (Devnet)

**1. Configure environment:**
```bash
# Set Solana cluster to devnet
solana config set --url https://api.devnet.solana.com

# Verify your wallet
solana address

# Check balance (need ~2 SOL for upgrade)
solana balance
```

**2. Build program:**
```bash
# From project root
anchor build
```

**3. Upgrade program (don't redeploy!):**

⚠️ **Important**: Use `anchor upgrade` not `anchor deploy` to preserve the existing program ID.

```bash
# Upgrade the program
anchor upgrade target/deploy/escrow.so \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster https://api.devnet.solana.com
```

**4. Upload IDL on-chain:**
```bash
# Check if IDL exists
anchor idl fetch AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster https://api.devnet.solana.com

# If exists, upgrade it:
anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --filepath target/idl/escrow.json \
  --provider.cluster https://api.devnet.solana.com

# If doesn't exist, initialize it:
anchor idl init AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --filepath target/idl/escrow.json \
  --provider.cluster https://api.devnet.solana.com
```

**5. Verify deployment:**
```bash
# Check program account
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# Verify IDL
anchor idl fetch AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster https://api.devnet.solana.com
```

**6. Update backend IDL:**
```bash
# Copy updated IDL to backend
cp target/idl/escrow.json src/generated/anchor/escrow.json

# Rebuild backend
npm run build

# Restart staging backend
# (via DigitalOcean or your deployment process)
```

**7. Run E2E tests:**
```bash
npm run test:staging:e2e:01-solana-nft-usdc-happy-path
npm run test:staging:security:admin
```

---

### Production Deployment (Mainnet)

⚠️ **CRITICAL**: Only deploy to mainnet after thorough staging testing!

**Pre-deployment checklist:**
- [ ] All staging E2E tests passing
- [ ] Admin authorization test passing
- [ ] Fee control verified on staging
- [ ] Admin public keys configured correctly
- [ ] Sufficient SOL in deployment wallet (~10 SOL)
- [ ] Backup of current program (if possible)

**1. Configure environment:**
```bash
# Set Solana cluster to mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Verify wallet (should have deployment authority)
solana address

# Check balance
solana balance
```

**2. Build program:**
```bash
# Clean build
rm -rf target/
anchor build

# Verify program ID matches production
grep "declare_id" programs/escrow/src/lib.rs
# Should show: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
```

**3. Upgrade program:**
```bash
# Upgrade mainnet program
anchor upgrade target/deploy/escrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.cluster https://api.mainnet-beta.solana.com

# This will cost ~5-8 SOL
```

**4. Upload IDL on-chain:**
```bash
# Check current IDL
anchor idl fetch 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.cluster https://api.mainnet-beta.solana.com

# Upgrade IDL
anchor idl upgrade 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --filepath target/idl/escrow.json \
  --provider.cluster https://api.mainnet-beta.solana.com

# This will cost ~0.01-0.02 SOL
```

**5. Verify deployment:**
```bash
# Check program
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

# Verify IDL
anchor idl fetch 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.cluster https://api.mainnet-beta.solana.com \
  --out temp/mainnet-idl.json

# Compare with local
diff target/idl/escrow.json temp/mainnet-idl.json
```

**6. Update production backend:**
```bash
# Copy IDL
cp target/idl/escrow.json src/generated/anchor/escrow.json

# Rebuild
npm run build

# Deploy to production
# (via your CI/CD or DigitalOcean deployment)
```

**7. Run production smoke tests:**
```bash
# Run critical production tests
npm run test:production:e2e:01-solana-nft-usdc-happy-path
```

**8. Monitor:**
- Check DigitalOcean logs for errors
- Monitor first few transactions
- Verify fees are being collected correctly

---

## IDL Management

### Why IDL matters:
- **On-chain IDL** = Source of truth for client libraries
- **Backend IDL** = TypeScript types for Anchor integration
- Both must match the deployed program

### IDL Update Process:

**After every program change:**
1. Build program: `anchor build` (generates `target/idl/escrow.json`)
2. Upgrade on-chain IDL: `anchor idl upgrade <program-id>`
3. Copy to backend: `cp target/idl/escrow.json src/generated/anchor/`
4. Rebuild backend: `npm run build`
5. Restart services

### Verifying IDL matches program:

```bash
# Fetch on-chain IDL
anchor idl fetch <program-id> --out temp/onchain-idl.json

# Compare with local
diff target/idl/escrow.json temp/onchain-idl.json

# Should be identical!
```

---

## Common Issues

### Issue: "Program ID mismatch"
**Solution**: Verify `declare_id!()` in `lib.rs` matches deployed program

### Issue: "Insufficient funds"
**Solution**: 
- Devnet: `solana airdrop 2`
- Mainnet: Transfer SOL to deployment wallet

### Issue: "Program upgrade failed"
**Solution**: Check you have upgrade authority:
```bash
solana program show <program-id>
# Look for "Upgrade Authority"
```

### Issue: "IDL account not found"
**Solution**: Use `anchor idl init` instead of `upgrade` for first-time IDL

### Issue: "Transaction simulation failed"
**Solution**: 
- Build failed: Check Rust compilation errors
- Authority mismatch: Verify wallet has upgrade authority
- Insufficient funds: Add more SOL

---

## Rollback Process

If deployment fails or causes issues:

**1. Revert to previous program:**
```bash
# If you backed up the old .so file:
anchor upgrade backup/escrow-previous.so \
  --program-id <program-id>
```

**2. Revert IDL:**
```bash
anchor idl upgrade <program-id> \
  --filepath backup/escrow-previous.json
```

**3. Revert backend:**
```bash
git checkout HEAD^ src/generated/anchor/escrow.json
npm run build
# Redeploy backend
```

---

## Post-Deployment Checklist

After successful deployment:

- [ ] Program upgrade confirmed on-chain
- [ ] IDL uploaded and verified on-chain
- [ ] Backend IDL updated and rebuilt
- [ ] Services restarted
- [ ] E2E tests passing
- [ ] First transaction successful
- [ ] Monitoring shows no errors
- [ ] Fee collection working correctly
- [ ] Admin authorization working
- [ ] Document deployment in changelog

---

## Environment-Specific Notes

### Staging (Devnet)
- **Purpose**: Testing new features before production
- **RPC**: https://api.devnet.solana.com
- **Explorer**: https://explorer.solana.com/?cluster=devnet
- **Cost**: Free (use faucet)
- **Upgrade frequency**: As needed for testing

### Production (Mainnet)
- **Purpose**: Live customer transactions
- **RPC**: https://api.mainnet-beta.solana.com
- **Explorer**: https://explorer.solana.com/
- **Cost**: 5-10 SOL per upgrade
- **Upgrade frequency**: Only after thorough staging testing

---

## Security Considerations

1. **Upgrade Authority**: Keep upgrade authority keypair secure
2. **Admin Keys**: Update admin public keys before deployment
3. **Testing**: Always test on staging first
4. **Monitoring**: Watch for unusual activity after deployment
5. **Rollback Plan**: Have previous .so file ready

---

## Questions?

- Check Anchor docs: https://www.anchor-lang.com/docs/cli
- Solana CLI docs: https://docs.solana.com/cli
- Ask team for deployment keys/permissions
