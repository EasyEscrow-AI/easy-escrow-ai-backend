# Production Deployment Runbook

## ⚠️ CRITICAL: READ THIS ENTIRE DOCUMENT BEFORE PRODUCTION DEPLOYMENT

**Last Updated:** 2025-11-27  
**Version:** 1.0  
**Lessons Learned From:** 7 bugs discovered in staging testing

---

## 🎯 Purpose

This runbook provides a **step-by-step, foolproof process** for deploying the Escrow program to Solana mainnet. It incorporates lessons learned from staging testing and prevents the program ID mismatches that caused 7 critical bugs.

**Who Should Use This:**
- Lead developers performing production deployments
- DevOps engineers managing mainnet infrastructure
- Anyone with mainnet deployment authority

**When to Use This:**
- First mainnet deployment
- Major program upgrades
- Security patches requiring on-chain changes
- Feature releases affecting smart contract logic

---

## 📋 Pre-Deployment Checklist

### ✅ 1. Staging Validation Complete

- [ ] All E2E tests passing on staging
- [ ] Treasury integration tested and verified
- [ ] All known bugs fixed and deployed to staging
- [ ] Staging has been stable for at least 48 hours
- [ ] No critical issues in staging logs

**Verification:**
```bash
# Run full E2E suite on staging
npm run test:staging:e2e

# Check Treasury status
npm run treasury:status

# Review recent staging logs
# (Check DigitalOcean or your logging service)
```

### ✅ 2. Code Review & Approval

- [ ] All code changes reviewed by at least 2 developers
- [ ] Security review completed (if smart contract changes)
- [ ] Breaking changes documented
- [ ] Migration plan prepared (if needed)

### ✅ 3. Backup & Rollback Plan

- [ ] Current production program binary backed up
- [ ] Current production IDL backed up
- [ ] Database backup completed
- [ ] Rollback procedure documented
- [ ] Emergency contacts list updated

**Backup Commands:**
```bash
# Backup current program binary
mkdir -p backups/$(date +%Y%m%d)
solana program dump 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  backups/$(date +%Y%m%d)/escrow-pre-deployment.so \
  --url mainnet-beta

# Backup current IDL
cp src/generated/anchor/escrow-idl-production.json \
   backups/$(date +%Y%m%d)/escrow-idl-pre-deployment.json
```

### ✅ 4. Team Coordination

- [ ] Deployment scheduled during low-traffic window
- [ ] Team members notified of deployment time
- [ ] On-call engineer available
- [ ] Communication channels ready (Slack, Discord, etc.)
- [ ] User notification prepared (if downtime expected)

### ✅ 5. Environment Preparation

- [ ] Production upgrade authority wallet funded (5-10 SOL)
- [ ] Production deployer wallet funded (2-5 SOL)
- [ ] All production secrets verified in environment
- [ ] Solana CLI configured for mainnet
- [ ] VPN/secure network connected (if required)

**Verification:**
```bash
# Check upgrade authority balance
solana balance <UPGRADE_AUTHORITY_ADDRESS> --url mainnet-beta
# Should show: 5-10 SOL

# Check deployer balance
solana balance wallets/production/mainnet-deployer.json --url mainnet-beta
# Should show: 2-5 SOL

# Verify Solana CLI config
solana config get
# Should show: RPC URL: https://api.mainnet-beta.solana.com
```

---

## 🔧 Deployment Process

### Phase 1: Build & Validation (30 minutes)

#### Step 1.1: Build for Production

**CRITICAL: Use build script, NOT raw cargo commands!**

```bash
# Option A: Automated build script (RECOMMENDED - Coming Soon)
npm run build:production

# Option B: Manual build (temporary - until scripts are ready)
cd programs/escrow
cargo clean
cargo build-sbf --features mainnet
cd ../..
anchor idl build
```

**Expected Output:**
```
✅ Program binary: target/deploy/easyescrow.so (~320KB)
✅ IDL file: target/idl/escrow.json
```

#### Step 1.2: Validate Program ID in Binary

**CRITICAL: This prevents DeclaredProgramIdMismatch errors!**

```bash
# Extract and verify program ID from IDL
jq -r '.address' target/idl/escrow.json
```

**Expected Output:**
```
2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
```

**If the output is NOT the mainnet program ID, STOP IMMEDIATELY!**

❌ If you see: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` (staging)  
❌ If you see: `GpvN8LB1xXTu9N541x9rrbxD7HwH6xi1Gkp84P7rUAEZ` (devnet)

**Fix:** Rebuild with correct feature flag:
```bash
cd programs/escrow
cargo clean
cargo build-sbf --features mainnet  # ← EXPLICIT FLAG!
cd ../..
anchor idl build
```

#### Step 1.3: Verify IDL Address Matches

```bash
# Check address in IDL
echo "IDL Address:"
jq -r '.address' target/idl/escrow.json

echo -e "\nExpected (mainnet):"
echo "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"

echo -e "\nMatch:"
if [ "$(jq -r '.address' target/idl/escrow.json)" = "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL - DO NOT PROCEED!"
  exit 1
fi
```

#### Step 1.4: Update Backend IDL

```bash
# Copy validated IDL to production backend
cp target/idl/escrow.json src/generated/anchor/escrow-idl-production.json

# Verify the copy
echo "Backend IDL Address:"
jq -r '.address' src/generated/anchor/escrow-idl-production.json
# Should output: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
```

#### Step 1.5: Commit Backend IDL Update

```bash
# Create deployment branch
git checkout -b deploy/production-$(date +%Y%m%d)

# Commit IDL update
git add src/generated/anchor/escrow-idl-production.json
git commit -m "chore: Update production IDL for deployment $(date +%Y%m%d)"

# Push and create PR
git push origin deploy/production-$(date +%Y%m%d)
gh pr create --base master --title "Production IDL Update $(date +%Y%m%d)"
```

**⏸️ PAUSE HERE:** Wait for PR approval before continuing.

---

### Phase 2: On-Chain Deployment (15 minutes)

#### Step 2.1: Final Pre-Deployment Checks

```bash
# Verify Solana CLI network
solana config get | grep "RPC URL"
# Must show: https://api.mainnet-beta.solana.com

# Verify upgrade authority
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta | grep "Authority"
# Verify the authority matches your wallet

# Check wallet balance
solana balance wallets/production/mainnet-deployer.json --url mainnet-beta
# Must have: At least 2 SOL
```

#### Step 2.2: Deploy Program Binary

**⚠️ POINT OF NO RETURN: Once executed, the program is live on mainnet!**

```bash
# Deploy program upgrade
solana program deploy target/deploy/easyescrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --upgrade-authority wallets/production/mainnet-deployer.json \
  --url mainnet-beta
```

**Expected Output:**
```
Program Id: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

Signature: <TRANSACTION_SIGNATURE>
```

**Save the signature!** You'll need it for verification.

#### Step 2.3: Wait for Confirmation

```bash
# Wait for 30-60 seconds for finalization
sleep 60

# Verify deployment
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta
```

**Expected Output:**
```
Program Id: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: <PROGRAM_DATA_ADDRESS>
Authority: <YOUR_AUTHORITY_ADDRESS>
Last Deployed In Slot: <RECENT_SLOT>
Data Length: ~320008 bytes
Balance: ~2.3 SOL
```

#### Step 2.4: Upload IDL to Blockchain (Optional but Recommended)

```bash
# Upload IDL for on-chain reference
anchor idl upgrade 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --filepath target/idl/escrow.json \
  --provider.cluster mainnet \
  --provider.wallet wallets/production/mainnet-deployer.json
```

**Note:** This makes the IDL discoverable on-chain for explorers and indexers.

---

### Phase 3: Backend Deployment (20 minutes)

#### Step 3.1: Merge Production IDL PR

```bash
# Ensure PR from Phase 1 Step 1.5 is approved and merged
gh pr merge <PR_NUMBER> --squash
```

#### Step 3.2: Deploy Backend to Production

**Follow your standard backend deployment process:**

```bash
# Example for DigitalOcean App Platform
# (Adjust for your deployment system)

# Trigger deployment via CLI
doctl apps create-deployment <APP_ID>

# OR trigger via GitHub Actions
# (Push to production branch or tag)
git tag production-$(date +%Y%m%d)
git push origin production-$(date +%Y%m%d)
```

#### Step 3.3: Verify Backend Configuration

```bash
# Check production backend environment variables
# Verify these are set correctly:
# - SOLANA_RPC_URL (mainnet RPC)
# - SOLANA_ESCROW_PROGRAM_ID=2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
# - MAINNET_PRODUCTION_TREASURY_ADDRESS
# - MAINNET_PRODUCTION_FEE_COLLECTOR_ADDRESS
```

---

### Phase 4: Smoke Testing (15 minutes)

#### Step 4.1: Test Program Initialization

```bash
# Test Treasury PDA initialization (if first deployment)
# Use a test script or manual transaction
```

#### Step 4.2: Test Basic Swap (Small Amounts)

**Create a test swap with minimal value:**
- Use test wallets with small balances
- Swap a low-value NFT for minimal SOL
- Verify transaction succeeds
- Check Treasury PDA receives fees

#### Step 4.3: Verify Treasury Tracking

```bash
# Check Treasury status on mainnet
# (Adjust scripts to use mainnet RPC)
npm run treasury:status -- --network mainnet
```

**Expected:**
- Treasury PDA exists
- Swap counter incremented
- Fee collection working

#### Step 4.4: Monitor Logs

```bash
# Watch production logs for errors
# (Adjust for your logging system)

# Check for DeclaredProgramIdMismatch errors
# Check for Transaction simulation failures
# Check for Unauthorized errors
```

**If ANY errors appear, proceed to Rollback Plan immediately!**

---

### Phase 5: Production Verification (30 minutes)

#### Step 5.1: Full Feature Testing

- [ ] Create offer (NFT for SOL)
- [ ] Accept offer
- [ ] Verify swap execution
- [ ] Check fee collection
- [ ] Verify Treasury PDA tracking
- [ ] Test cancel offer
- [ ] Test expired offer handling

#### Step 5.2: Monitor User Transactions

```bash
# Watch for user transactions
solana logs 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta
```

#### Step 5.3: Performance Validation

- [ ] Transaction confirmation times acceptable
- [ ] RPC performance acceptable
- [ ] No unexpected compute unit consumption
- [ ] No memory errors

#### Step 5.4: Documentation Update

- [ ] Update CHANGELOG.md
- [ ] Update production README
- [ ] Document any breaking changes
- [ ] Update API documentation (if needed)

---

## 🚨 Rollback Plan

### When to Rollback

Rollback **immediately** if:
- ❌ Program throws DeclaredProgramIdMismatch
- ❌ Swaps are failing consistently
- ❌ Treasury PDA not tracking fees
- ❌ Security vulnerability discovered
- ❌ Critical bug affecting user funds

### Rollback Procedure

#### Step 1: Deploy Previous Version

```bash
# Deploy backup from Phase 1, Step 3
solana program deploy backups/$(date +%Y%m%d)/escrow-pre-deployment.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --upgrade-authority wallets/production/mainnet-deployer.json \
  --url mainnet-beta
```

#### Step 2: Restore Backend IDL

```bash
# Restore previous IDL
cp backups/$(date +%Y%m%d)/escrow-idl-pre-deployment.json \
   src/generated/anchor/escrow-idl-production.json

# Commit and deploy
git add src/generated/anchor/escrow-idl-production.json
git commit -m "rollback: Restore previous production IDL"
git push
```

#### Step 3: Notify Stakeholders

- Post in team Slack/Discord
- Update status page (if public)
- Notify users (if necessary)
- Schedule postmortem

---

## 📊 Post-Deployment

### Within 1 Hour

- [ ] Verify 10+ successful user transactions
- [ ] Check Treasury fee collection
- [ ] Review error logs (should be minimal)
- [ ] Update team on deployment success

### Within 24 Hours

- [ ] Monitor transaction volume
- [ ] Check for any unusual patterns
- [ ] Review compute unit usage
- [ ] Verify Treasury balance matches expected

### Within 1 Week

- [ ] Complete postmortem (if issues occurred)
- [ ] Update runbook with lessons learned
- [ ] Plan next deployment improvements
- [ ] Consider audit (if major changes)

---

## 🔐 Security Considerations

### Upgrade Authority

**Current Status:**
- Upgrade authority: `<YOUR_AUTHORITY_ADDRESS>`
- Should be a multisig wallet (recommended)
- Hardware wallet strongly recommended

**Best Practices:**
- Rotate authority periodically
- Use timelock for major upgrades
- Consider renouncing authority after stabilization

### Treasury Management

**Production Treasury:**
- Address: `<MAINNET_PRODUCTION_TREASURY_ADDRESS>`
- Should be a warm wallet (online but secured)
- Automated weekly withdrawals to cold storage

**Fee Collector:**
- Address: `<MAINNET_PRODUCTION_FEE_COLLECTOR_ADDRESS>`
- Should be a cold wallet (offline storage)
- Multisig strongly recommended

---

## 📞 Emergency Contacts

### Technical Leads
- **Lead Developer:** [Name] - [Contact]
- **DevOps Lead:** [Name] - [Contact]
- **Security Lead:** [Name] - [Contact]

### External Support
- **Solana Support:** Discord, GitHub
- **RPC Provider:** [Provider Name] - [Support Contact]
- **Audit Firm:** [Firm Name] - [Contact] (if applicable)

### Communication Channels
- **Team Slack:** #deployments, #production-incidents
- **Status Page:** [URL]
- **On-Call Schedule:** [Link to PagerDuty/OpsGenie]

---

## 📚 Related Documentation

- [PROGRAM_ID_MANAGEMENT.md](../development/PROGRAM_ID_MANAGEMENT.md)
- [PROGRAM_ID_MISMATCH_POSTMORTEM.md](../development/PROGRAM_ID_MISMATCH_POSTMORTEM.md)
- [TREASURY_MANAGEMENT.md](../operations/TREASURY_MANAGEMENT.md)
- [SOLANA_PROGRAM_BUILD.mdc](../../.cursor/rules/solana-program-build.mdc)
- [SECRETS_MANAGEMENT.md](../security/SECRETS_MANAGEMENT.md)

---

## ✅ Deployment Sign-Off

**Date:** _______________  
**Deployed By:** _______________  
**Reviewed By:** _______________  
**Program Version:** _______________  
**Deployment Signature:** _______________  

**Checklist Completed:** [ ] Yes [ ] No  
**Smoke Tests Passed:** [ ] Yes [ ] No  
**Production Verified:** [ ] Yes [ ] No  

**Notes:**
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________

---

## 🎯 Summary

**Remember:**
1. ✅ ALWAYS use `--features mainnet` when building
2. ✅ ALWAYS validate IDL address before deployment
3. ✅ ALWAYS have a rollback plan ready
4. ✅ NEVER deploy without staging validation
5. ✅ NEVER skip the verification steps

**This runbook was created after discovering 7 critical bugs in staging. Follow it religiously to ensure a successful production deployment.**

**Questions?** Review the postmortem: `docs/development/PROGRAM_ID_MISMATCH_POSTMORTEM.md`

---

**Version History:**
- v1.0 (2025-11-27): Initial version based on staging lessons learned

