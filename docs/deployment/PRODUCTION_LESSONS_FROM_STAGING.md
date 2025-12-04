# Production Deployment: Lessons Learned from Staging

**Created:** December 3, 2025  
**Purpose:** Document critical issues from staging deployments to prevent production failures  
**Audience:** Production deployment team

---

## 🎯 Executive Summary

This document captures **critical lessons learned** from 27 completed atomic swap tasks deployed to staging (devnet). These lessons directly inform our production (mainnet) deployment strategy and **MUST be reviewed** before proceeding with production deployment.

**Key Insight:** We encountered NO staging E2E test completion because cNFTs don't work properly on staging. Production will be our first comprehensive test of cNFT functionality.

---

## 🚨 Critical Issues Encountered

### 1. Treasury PDA Derivation Issues (CRITICAL)

**Problem:** Multiple cascading ID mismatches causing Treasury PDA failures

**Timeline of Issues:**
1. IDL had mainnet program ID instead of staging
2. Program binary was compiled with wrong ID
3. Treasury PDA structure mismatch (57 bytes on-chain, 82 bytes expected)
4. Seeds hardcoded in 5+ different places:
   - Rust program (`programs/escrow/src/state/treasury.rs`)
   - Backend routes (`src/routes/offers.routes.ts`)
   - Treasury scripts (`scripts/treasury/*.ts`)
   - E2E tests (`tests/staging/e2e/*.test.ts`)
   - Helper files (`tests/helpers/*.ts`)

**Root Cause:** No single source of truth for PDA derivation

**Production Mitigation:**
- ✅ **Use environment-specific builds** with `cfg` feature flags
- ✅ **Validate Program ID** before every deployment
- ✅ **Centralize PDA derivation** logic (already implemented in `atomicSwap.config.ts`)
- ✅ **Pre-deployment validation script** to check PDA consistency

**Action Items for Production:**
- [ ] Run pre-deployment validation script before mainnet deploy
- [ ] Verify all code uses centralized PDA derivation
- [ ] Double-check program was built with `mainnet` feature flag
- [ ] Verify Treasury PDA address before initialization

---

### 2. IDL Buffer Size Issues (HIGH PRIORITY)

**Problem:** IDL buffer size insufficient after adding cNFT support

**What Happened:**
- Initial IDL upload succeeded
- After adding cNFT accounts and optional fields, IDL grew from ~17KB to ~19KB
- IDL upgrade failed: buffer size insufficient
- Had to close old IDL and create new one with larger buffer

**Root Cause:** IDL account buffer wasn't pre-sized for future growth

**Production Mitigation:**
- ✅ **Create IDL with larger buffer** from the start (2x expected size)
- ✅ **Close old IDL before upgrade** if buffer size insufficient
- ✅ **Use `anchor idl init`** with explicit buffer size parameter

**Action Items for Production:**
- [ ] Close existing IDL on mainnet (if any)
- [ ] Initialize new IDL with 2x buffer size: `anchor idl init <program-id> --filepath target/idl/escrow.json --provider.cluster mainnet-beta --buffer-size 4096`
- [ ] Verify IDL upload successful before backend deployment

---

### 3. Program ID Mismatch Issues (CRITICAL)

**Problem:** Building program for wrong environment

**Multiple Program IDs:**
- **Mainnet:** `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- **Staging:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- **Devnet:** `GpvN8LB1xXTu9N541x9rrbxD7HwH6xi1Gkp84P7rUAEZ`
- **Localnet:** `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS`

**What Happened:**
- Program built with mainnet ID but deployed to staging
- IDL contained wrong program ID
- Backend couldn't interact with program

**Production Mitigation:**
- ✅ **Use `cfg` feature flags** in `lib.rs` for environment-specific IDs
- ✅ **Verify feature flag** before build: `cargo build-sbf --features mainnet`
- ✅ **Check IDL address field** matches expected program ID before deploy

**Action Items for Production:**
- [ ] Run `cargo clean` before building for mainnet
- [ ] Build with explicit feature: `cd programs/escrow && cargo build-sbf --features mainnet`
- [ ] Verify `target/idl/escrow.json` contains mainnet program ID
- [ ] Compare built binary hash with expected mainnet program hash

---

### 4. Database Migration Issues (MEDIUM PRIORITY)

**Problem:** PRE_DEPLOY job not running or failing silently

**Issues Encountered:**
- DATABASE_URL scope not set to `RUN_AND_BUILD_TIME`
- Connection pooler (port 25061) doesn't support DDL migrations
- Migrations require direct connection (port 25060)
- PRE_DEPLOY job logs not visible by default

**Production Mitigation:**
- ✅ **Use `DATABASE_URL_POOL` for app** (connection pooler)
- ✅ **Use `DATABASE_URL` for migrations** (direct connection)
- ✅ **Set scope to `RUN_AND_BUILD_TIME`** for migration access
- ✅ **Add migration logging** to PRE_DEPLOY job

**Action Items for Production:**
- [ ] Verify `DATABASE_URL` has direct connection string (port 25060 or 5432)
- [ ] Verify `DATABASE_URL` scope includes `BUILD_TIME`
- [ ] Check PRE_DEPLOY job logs after deployment
- [ ] Manually verify migrations applied: `npx prisma migrate status`

---

### 5. TypeScript Build Errors After Merge (HIGH PRIORITY)

**Problem:** Production build failed with 5 TypeScript errors after PR #344 merge

**Errors:**
1. Missing `getNonceCleanupScheduler` import
2. Missing `getNonceReplenishmentScheduler` import
3. Undefined `offerExpiryScheduler` variable
4. Non-existent `config.platform.treasuryAddress` property
5. Non-existent `config.platform.treasuryAddress` property (duplicate)

**Root Cause:** Merge conflict resolution didn't properly integrate all imports and config changes

**Production Mitigation:**
- ✅ **Fixed in PR #345** (hotfix/production-build-errors)
- ✅ **Run `npm run build` locally** before PR merge
- ✅ **Monitor DigitalOcean build logs** for TypeScript errors

**Action Items for Production:**
- [ ] Always run `npm run build` locally before pushing
- [ ] Check DigitalOcean build logs for TypeScript errors
- [ ] Have hotfix workflow ready for build failures

---

### 6. cNFT Staging Limitations (INFORMATIONAL)

**Problem:** cNFTs don't work properly on staging (devnet)

**Impact:**
- Task 15 (Comprehensive E2E Testing on Staging) was deferred
- cNFT swaps cannot be validated on staging
- Production deployment will be first comprehensive cNFT test

**Root Cause:** Devnet limitations with cNFT indexing and Merkle tree management

**Production Strategy:**
- ✅ **Test cNFT functionality directly on mainnet** after deployment
- ✅ **Create production E2E tests** for all cNFT swap scenarios
- ✅ **Use real mainnet cNFTs** for testing (with test wallets)
- ✅ **Monitor transactions closely** during initial cNFT swaps

**Action Items for Production:**
- [ ] Prepare production test wallets with real cNFTs
- [ ] Create comprehensive production E2E test suite (Task 35)
- [ ] Monitor first 10-20 cNFT swaps closely
- [ ] Have rollback plan ready if cNFTs fail on mainnet

---

### 7. Zero-Fee Authorization Security Bug (CRITICAL - FIXED)

**Problem:** Missing signature verification for zero-fee swaps

**What Happened:**
- Initial implementation checked if `authorized_app` public key was whitelisted
- Did NOT verify that the account actually signed the transaction
- Cursor bot identified: "Missing signature verification allows zero-fee bypass"

**Impact:** Unauthorized parties could bypass fees by providing whitelisted public key

**Fix:** Changed `authorized_app` from `AccountInfo<'info>` to `Signer<'info>`
- Automatically enforces signature requirement
- Prevents unauthorized fee bypass

**Production Mitigation:**
- ✅ **Security fix deployed in PR #342** (staging)
- ✅ **Merged to master in PR #344**
- ✅ **E2E test validates authorization** (tests/staging/e2e/08-atomic-zero-fee-nft-swap.test.ts)

**Action Items for Production:**
- [ ] Verify `authorized_app` is `Signer<'info>` type in deployed program
- [ ] Test zero-fee authorization with production E2E tests
- [ ] Monitor for unauthorized zero-fee attempts

---

### 8. Password Protection CSP Issues (MEDIUM PRIORITY)

**Problem:** Test page password protection violated Content Security Policy

**Issues Encountered:**
- Inline `<script>` tags blocked by CSP
- Inline event handlers (`onclick`) blocked by CSP
- Password not working due to browser caching

**Fix:**
- Moved JavaScript to external file (`src/public/js/test-page.js`)
- Replaced `onclick` with `addEventListener`
- Added comprehensive console logging for debugging

**Production Mitigation:**
- ✅ **CSP-compliant implementation** deployed
- ✅ **External JavaScript files** (no inline scripts)
- ✅ **Password updated** (stored in source code only)

**Action Items for Production:**
- [ ] Verify /test page password protection works in production
- [ ] Share password with team via secure channel (not documentation)
- [ ] Ensure opaque background hides page content

---

### 9. Secrets Management in YAML (HIGH PRIORITY)

**Problem:** Conflicting configuration patterns for secrets in `.do/app-staging.yaml`

**Issue:**
- Environment variables marked `type: SECRET` also had `value: ${VARIABLE_NAME}`
- DigitalOcean expects `type: SECRET` alone (console-managed) OR `value: ${VAR}` (placeholder)
- NOT both together

**Fix:** Removed `value` field from all `type: SECRET` variables

**Production Mitigation:**
- ✅ **Fixed in staging YAML**
- ✅ **Pattern documented** in secrets management rules
- ✅ **Secrets set via DigitalOcean console** only

**Action Items for Production:**
- [ ] Review `.do/app-production.yaml` for same issue
- [ ] Ensure all `type: SECRET` variables have NO value field
- [ ] Set all secrets via DigitalOcean console before deployment

---

## 📋 Pre-Production Deployment Checklist

Based on staging lessons learned:

### ✅ Program Build & Deployment
- [ ] Run `cargo clean` to remove cached builds
- [ ] Build with explicit mainnet feature: `cargo build-sbf --features mainnet`
- [ ] Verify binary contains mainnet program ID
- [ ] Check program size (should be ~287-330 KB)
- [ ] Deploy program to mainnet with production deployer wallet
- [ ] Verify deployment transaction on Solana Explorer

### ✅ IDL Management
- [ ] Generate IDL: `anchor idl build`
- [ ] Verify IDL address field: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- [ ] Close old IDL if exists: `anchor idl close <program-id>`
- [ ] Initialize new IDL with large buffer: `anchor idl init <program-id> --buffer-size 4096`
- [ ] Upload IDL to mainnet
- [ ] Copy IDL to backend: `src/generated/anchor/escrow-idl-production.json`

### ✅ Treasury PDA Setup
- [ ] Verify treasury seeds match between Rust and TypeScript
- [ ] Derive Treasury PDA using centralized function
- [ ] Initialize Treasury on mainnet: `initialize_treasury` instruction
- [ ] Fund Treasury PDA if needed (rent exemption)
- [ ] Verify Treasury structure (82 bytes expected)
- [ ] Update production env vars with Treasury PDA address

### ✅ Environment Variables & Secrets
- [ ] Create `.env.production` with all mainnet variables
- [ ] Set all secrets via DigitalOcean console (NO values in YAML)
- [ ] Verify `DATABASE_URL` scope is `RUN_AND_BUILD_TIME`
- [ ] Verify `DATABASE_URL` uses direct connection (not pooler)
- [ ] Verify production RPC URL (Helius/QuickNode mainnet)
- [ ] Set production program IDs
- [ ] Set production wallet addresses (admin, fee collector, treasury authority)
- [ ] Set production authorized apps whitelist for zero-fee swaps

### ✅ Backend Build & Deployment
- [ ] Run `npm run build` locally to verify TypeScript compiles
- [ ] Check for missing imports or config properties
- [ ] Review `.do/app-production.yaml` for secrets conflicts
- [ ] Deploy backend via DigitalOcean
- [ ] Monitor build logs for TypeScript errors
- [ ] Verify health check endpoint responds

### ✅ Security Verification
- [ ] Verify /test page password protection works (password: 060385)
- [ ] Verify all secrets stored in DigitalOcean console
- [ ] Verify authorized apps whitelist enforcement
- [ ] Verify zero-fee authorization requires signature
- [ ] Test unauthorized zero-fee attempt (should fail)

### ✅ Database Management
- [ ] Truncate production database for clean slate (Task 31.6)
- [ ] Verify PRE_DEPLOY job runs successfully
- [ ] Check migration logs in DigitalOcean
- [ ] Manually verify schema matches expected structure
- [ ] Run `npx prisma migrate status` to confirm

---

## 🛡️ Production Mitigation Strategies

### Strategy 1: Environment-Specific Builds with Feature Flags

**Implementation:**
```bash
# ALWAYS build with explicit feature flag
cd programs/escrow
cargo clean
cargo build-sbf --features mainnet

# NEVER build without specifying environment
```

**Validation:**
```bash
# Check IDL contains correct program ID
grep "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx" target/idl/escrow.json
```

### Strategy 2: Pre-Deployment Validation Script

Create automated validation before ANY production deployment:

**Script Location:** `scripts/validation/validate-production-deployment.ts`

**Checks:**
- ✅ Program ID matches mainnet in IDL
- ✅ Treasury seeds synchronized between Rust and TypeScript
- ✅ Treasury PDA derivation consistent across codebase
- ✅ Backend TypeScript compiles without errors
- ✅ All required environment variables present
- ✅ Secrets properly configured in DigitalOcean

### Strategy 3: IDL Buffer Pre-Sizing

**Lesson:** IDL grew from 17KB to 19KB when adding cNFT support

**Production Approach:**
```bash
# Initialize IDL with 2x expected size
anchor idl init 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --filepath target/idl/escrow.json \
  --provider.cluster mainnet-beta \
  --buffer-size 4096  # 4KB buffer (2x current size)
```

### Strategy 4: Database Migration Validation

**Lesson:** PRE_DEPLOY jobs can fail silently

**Production Approach:**
- Set `DATABASE_URL` scope to `RUN_AND_BUILD_TIME`
- Use direct connection (port 25060), NOT pooler (port 25061)
- Add logging to PRE_DEPLOY job
- Manually verify migrations after deployment

### Strategy 5: Comprehensive Production Testing

**Lesson:** Staging E2E deferred due to cNFT issues

**Production Approach:**
- Create production E2E test suite (Task 35)
- Test ALL swap scenarios on mainnet:
  - SPL NFT ↔ SPL NFT
  - SPL NFT ↔ SOL
  - cNFT ↔ cNFT
  - cNFT ↔ SPL NFT
  - cNFT ↔ SOL
  - Zero-fee authorization
- Use real mainnet test wallets and cNFTs
- Monitor first 20-30 swaps closely

---

## 📊 Staging Deployment Statistics

### Completed Work
- **27 tasks completed** on atomic-swap-pivot tag
- **77 subtasks completed**
- **8 production deployment tasks created** (Tasks 31-38)
- **51 production subtasks defined**

### Key Implementations
- ✅ Complete atomic swap program with cNFT support
- ✅ Treasury PDA and fee collection system
- ✅ Zero-fee authorization with signature verification
- ✅ Durable nonce account management
- ✅ Transaction builder for all swap types
- ✅ Password-protected test page
- ✅ Comprehensive documentation

### Known Issues (Not Blockers)
- ⚠️ cNFTs don't work on staging (environment limitation)
- ⚠️ Task 15 deferred (will test cNFTs on production)
- ⚠️ Some E2E tests incomplete due to staging limitations

---

## 🎯 Production Deployment Success Criteria

### Must Pass Before Going Live:

1. **Program Deployment**
   - ✅ Program deployed to mainnet with correct ID
   - ✅ IDL uploaded successfully with adequate buffer
   - ✅ Program verified on Solana Explorer

2. **Treasury Setup**
   - ✅ Treasury PDA initialized on mainnet
   - ✅ Fee collection working (verified with test swap)
   - ✅ Treasury balance tracking working

3. **Backend Deployment**
   - ✅ TypeScript build succeeds
   - ✅ Backend deployed to DigitalOcean production
   - ✅ Health check endpoint returns 200
   - ✅ Database migrations applied successfully

4. **Security Verification**
   - ✅ /test page password protection working
   - ✅ Zero-fee authorization enforced
   - ✅ All secrets stored in DigitalOcean console
   - ✅ No hardcoded credentials in code

5. **Production Testing**
   - ✅ Smoke tests pass (connectivity, health)
   - ✅ Integration tests pass (API endpoints)
   - ✅ E2E tests pass (all swap scenarios)
   - ✅ First 10 real swaps successful
   - ✅ Treasury receiving fees correctly

---

## 🚀 Quick Commands for Production

### Pre-Deployment Validation
```bash
# 1. Verify program build
cd programs/escrow
cargo build-sbf --features mainnet

# 2. Check IDL program ID
grep "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx" target/idl/escrow.json

# 3. Verify TypeScript builds
npm run build

# 4. Check Treasury PDA derivation
# (Use centralized function in atomicSwap.config.ts)
```

### Deployment
```bash
# 1. Deploy program
solana program deploy target/deploy/escrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --url mainnet-beta

# 2. Upload IDL with large buffer
anchor idl init 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --filepath target/idl/escrow.json \
  --provider.cluster mainnet-beta \
  --buffer-size 4096

# 3. Initialize Treasury
npm run treasury:init:production

# 4. Deploy backend
# (Via DigitalOcean auto-deploy on push to master)
```

### Post-Deployment Verification
```bash
# 1. Check program deployed
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta

# 2. Check Treasury exists
solana account <treasury-pda> --url mainnet-beta

# 3. Check backend health
curl https://api.yourdomain.com/health

# 4. Run smoke tests
npm run test:production:smoke

# 5. Run integration tests
npm run test:production:integration

# 6. Run E2E tests
npm run test:production:e2e
```

---

## 🔧 Rollback Procedures

### If Program Deployment Fails:
1. **DO NOT panic** - program state is immutable
2. Fix issues locally
3. Rebuild with correct feature flag
4. Redeploy program
5. Continue with Treasury setup

### If Backend Deployment Fails:
1. Check DigitalOcean build logs for TypeScript errors
2. Create hotfix branch from master
3. Fix TypeScript errors
4. Submit PR → master
5. Merge and redeploy

### If Treasury Initialization Fails:
1. Check Treasury PDA derivation
2. Verify program was deployed with correct ID
3. Re-run initialize_treasury instruction
4. Verify Treasury exists on-chain

### If Database Migration Fails:
1. Check PRE_DEPLOY job logs
2. Verify DATABASE_URL scope includes BUILD_TIME
3. Run manual migration: `npx prisma migrate deploy`
4. Verify schema with `npx prisma migrate status`

---

## 🎓 Key Takeaways

### 1. **Environment Isolation is Critical**
- Use feature flags for environment-specific builds
- Never rely on default feature flags
- Always specify `--features mainnet` for production

### 2. **Validation Before Deployment**
- Run pre-deployment validation script
- Verify Program ID in multiple places
- Check TypeScript builds locally

### 3. **IDL Buffer Sizing Matters**
- Pre-size IDL buffers for future growth
- Close and re-init if buffer insufficient
- Don't assume initial size is adequate

### 4. **Database Migrations Need Special Care**
- Direct connection required (not pooler)
- PRE_DEPLOY job scope must include BUILD_TIME
- Verify migrations applied after deployment

### 5. **Security Must Be Verified**
- Test password protection
- Verify signature requirements enforced
- Audit secrets management
- Test unauthorized access attempts

### 6. **Fresh Deployment = Simplified Process**
- Zero users means no backwards compatibility needed
- Can truncate database safely
- No versioning or migration complexity
- Deploy atomic swap system cleanly

### 7. **Production Testing is Essential**
- cNFT functionality will be tested on mainnet
- Create comprehensive E2E test suite
- Monitor closely during initial swaps
- Have rollback plan ready

---

## 📚 Related Documentation

- [Treasury PDA Migration Postmortem](./TREASURY_PDA_MIGRATION_POSTMORTEM.md)
- [Staging DB Migration Troubleshooting](../STAGING_DB_MIGRATE_JOB_TROUBLESHOOTING.md)
- [IDL Update Guide](./IDL_UPDATE_GUIDE.md)
- [Production Deployment Runbook](./PRODUCTION_DEPLOYMENT_RUNBOOK.md)
- [Zero-Fee Swaps Implementation](../ZERO_FEE_SWAPS_IMPLEMENTATION.md)

---

**Document Status:** ✅ Complete  
**Review Status:** Ready for Task 31.1  
**Next Action:** Begin Task 31.2 (Environment Variables Audit)


