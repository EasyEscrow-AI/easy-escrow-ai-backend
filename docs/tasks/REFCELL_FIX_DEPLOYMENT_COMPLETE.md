# RefCell Fix Deployment Complete

**Date:** 2025-11-05  
**Status:** ✅ RefCell fix deployed to devnet  
**Next:** Configure E2E testing environment and verify

---

## Summary

The v2 settlement flow was failing with "sum of account balances before and after instruction do not match" error. Root cause analysis revealed that the RefCell fix was **NOT deployed** to devnet in previous upgrade attempts. The smart contract has now been rebuilt with the RefCell fix and successfully deployed.

---

## What Was Wrong

### Initial Symptoms
- Settlement service **WAS working correctly** (polling every 3 seconds)
- Settlement service **WAS detecting BOTH_LOCKED agreements**
- Settlement service **WAS attempting to execute settle_v2**
- But on-chain execution **FAILED** with balance mismatch error

### Root Cause
The smart contract on devnet did **NOT** contain the RefCell fix that was committed to the source code. When we ran `anchor upgrade` in previous attempts, we deployed a binary that was built **before** the RefCell fix was applied locally.

### The RefCell Issue
Multiple calls to `ctx.accounts.escrow_state.to_account_info()` create separate `AccountInfo` references that don't synchronize properly through Solana's RefCell tracking system. This causes the runtime to see inconsistent lamport balances.

**Research:** https://github.com/solana-labs/solana/issues/20311

---

## The Fix

### Code Changes (Already in Source)
```rust
// BEFORE (BROKEN - multiple to_account_info() calls):
{
    let mut escrow_lamports = ctx.accounts.escrow_state.to_account_info().try_borrow_mut_lamports()?;
    let mut fee_collector_lamports = ctx.accounts.platform_fee_collector.to_account_info().try_borrow_mut_lamports()?;
    **escrow_lamports -= platform_fee;
    **fee_collector_lamports += platform_fee;
}
{
    let mut escrow_lamports = ctx.accounts.escrow_state.to_account_info().try_borrow_mut_lamports()?;
    let mut seller_lamports = ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()?;
    **escrow_lamports -= seller_receives;
    **seller_lamports += seller_receives;
}

// AFTER (FIXED - single to_account_info() call, reused reference):
let escrow_account = ctx.accounts.escrow_state.to_account_info(); // Get ONCE

{
    let fee_collector_account = ctx.accounts.platform_fee_collector.to_account_info();
    let mut escrow_lamports = escrow_account.try_borrow_mut_lamports()?; // Reuse
    let mut fee_collector_lamports = fee_collector_account.try_borrow_mut_lamports()?;
    **escrow_lamports = escrow_lamports.checked_sub(platform_fee).ok_or(EscrowError::InsufficientFunds)?;
    **fee_collector_lamports = fee_collector_lamports.checked_add(platform_fee).ok_or(EscrowError::CalculationOverflow)?;
}

{
    let seller_account = ctx.accounts.seller.to_account_info();
    let mut escrow_lamports = escrow_account.try_borrow_mut_lamports()?; // Reuse
    let mut seller_lamports = seller_account.try_borrow_mut_lamports()?;
    **escrow_lamports = escrow_lamports.checked_sub(seller_receives).ok_or(EscrowError::InsufficientFunds)?;
    **seller_lamports = seller_lamports.checked_add(seller_receives).ok_or(EscrowError::CalculationOverflow)?;
}
```

### Key Principles
1. **Get `escrow_account` reference ONCE** at the start of the instruction
2. **Reuse that reference** for all subsequent lamport borrows
3. **Store `AccountInfo` in `let` bindings** before borrowing (Rust lifetime requirement)
4. **Sequential transfers in separate scopes** to release borrows between operations
5. **Checked arithmetic** to prevent overflows
6. **Rent-exempt preservation** to prevent account deletion

### Applied To
- ✅ `NftForSol` (lines 728-755 in lib.rs)
- ✅ `NftForNftWithFee` (lines 800-811 in lib.rs)
- ✅ `NftForNftPlusSol` (lines 884-911 in lib.rs)

---

## Deployment Details

### Build Command
```bash
anchor build -- --no-default-features --features staging
```

**Why these flags:**
- `--no-default-features`: Disables default `mainnet` feature
- `--features staging`: Enables `staging` feature for correct program ID

### Deployment
```bash
anchor upgrade --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  target/deploy/escrow.so \
  --provider.cluster devnet
```

**Transaction:** `4U29PfkhqFz5BMrJZu84xxaaiYEShfx5Etx8omYv93NMwR9ewQRWYywReFXoqe5NEptcUizXSTPB4pxNWwsy2xiQ`

**Explorer:** https://explorer.solana.com/tx/4U29PfkhqFz5BMrJZu84xxaaiYEShfx5Etx8omYv93NMwR9ewQRWYywReFXoqe5NEptcUizXSTPB4pxNWwsy2xiQ?cluster=devnet

### IDL Update
```bash
anchor idl upgrade \
  --provider.cluster devnet \
  --filepath target/idl/escrow.json \
  AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
```

**IDL Account:** `AGVVXgE2Z6WEzSzxhshAW53xuYrajjHT3ot2ekFWFbLM`

### Backend IDL Update
- Copied: `target/idl/escrow.json` → `src/generated/anchor/escrow-idl-staging.json`
- Committed and pushed to staging branch
- DigitalOcean deployment in progress

---

## Rate Limiting Configuration

### Discovery
The E2E tests were hitting 429 errors because they poll the agreement status every 1 second for up to 2 minutes (120 requests). The standard rate limit is 100 requests per 15 minutes.

### Built-in E2E Testing Mode
The backend **already has** built-in support for relaxed rate limits via `ENABLE_E2E_TESTING` environment variable.

**When enabled:**
| Limiter | Production | E2E Testing |
|---------|-----------|-------------|
| Standard | 100 req/15min | **1000 req/15min** |
| Strict (creation) | 20 req/15min | **500 req/15min** |
| Auth | 5 req/15min | **50 req/15min** |

### Important Note
**Rate limits do NOT affect settlement!**

Settlement service runs **independently** on the backend:
- Polls every 3 seconds for `BOTH_LOCKED` agreements
- Executes settlement **server-side** (not triggered by client)
- Rate limits only affect client's ability to **check status**

The settlement WAS attempting to execute but FAILING on-chain due to the RefCell issue, not rate limits.

### Configuration Required
**Action:** Add `ENABLE_E2E_TESTING=true` to DigitalOcean staging environment variables.

**Steps:**
1. Navigate to: **App Platform** → **Backend App** → **Settings** → **Environment Variables**
2. Add new variable:
   - **Key:** `ENABLE_E2E_TESTING`
   - **Value:** `true`
   - **Scope:** `RUN_TIME`
   - **Type:** Plain Text
3. Save and redeploy (or deployment from this commit will pick it up)

**Documentation:** `docs/deployment/E2E_TESTING_ENVIRONMENT.md`

---

## What's Next

### 1. Configure E2E Testing Mode ⚠️ USER ACTION REQUIRED
- Add `ENABLE_E2E_TESTING=true` to DigitalOcean staging environment variables
- This prevents E2E tests from hitting rate limits during status polling

### 2. Wait for Backend Deployment 🕐 IN PROGRESS
- Current commit pushed to staging
- DigitalOcean deployment in progress
- Updated IDL will be deployed

### 3. Run E2E Test ⏳ PENDING
Once deployment completes, run:
```bash
npm run test:staging:e2e:v2-nft-sol
```

**Expected Result:**
- ✅ Agreement creation
- ✅ NFT deposit
- ✅ SOL deposit
- ✅ **Settlement triggers and completes** (no more balance mismatch error!)
- ✅ NFT transferred to buyer
- ✅ SOL distributed correctly (seller receives 0.099 SOL, fee collector receives 0.001 SOL)

### 4. Run All 3 v2 E2E Tests
```bash
npm run test:staging:e2e:all
```

Expected tests:
- `01-v2-nft-for-sol-happy-path.test.ts` ✅
- `02-v2-nft-for-nft-with-fee.test.ts` ✅
- `03-v2-nft-for-nft-plus-sol.test.ts` ✅

### 5. Document Final Results
Create comprehensive completion document with:
- All test results
- Transaction links
- Performance metrics
- Lessons learned

---

## Files Changed

### Smart Contract
- `programs/escrow/src/lib.rs` (RefCell fix already committed)

### Backend
- `src/generated/anchor/escrow-idl-staging.json` (updated with deployed IDL)

### Documentation
- `docs/deployment/E2E_TESTING_ENVIRONMENT.md` (new)
- `docs/tasks/REFCELL_FIX_DEPLOYMENT_COMPLETE.md` (this file)
- `docs/deployment/PROGRAM_DEPLOYMENT_SAFETY.md` (existing)
- `docs/tasks/V2_SETTLEMENT_NOT_TRIGGERING.md` (existing diagnostic)

---

## Verification Steps

### 1. Verify Program Deployed
```bash
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet
```

**Expected:**
- Program ID: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- Authority: `CPDz3pC5AnK7es3oEcP52HLhByPSAWG6f9QGP6j4jjEA`
- Last Deployed: Slot > 419367768

### 2. Verify IDL Updated
```bash
solana account AGVVXgE2Z6WEzSzxhshAW53xuYrajjHT3ot2ekFWFbLM --url devnet
```

### 3. Verify Backend Deployment
Check DigitalOcean runtime logs for:
```
[SettlementService] Starting settlement service
```

### 4. Verify E2E Testing Mode (After Adding Env Var)
```bash
curl -I https://easyescrow-backend-staging-mwx9s.ondigitalocean.app/v1/agreements
```

**Expected header:**
```
RateLimit-Limit: 1000
```

---

## Timeline

### Discovery Phase
- **01:10:05** - E2E test creates agreement
- **01:10:15** - NFT deposited successfully
- **01:10:28** - SOL deposited successfully (status: BOTH_LOCKED)
- **01:10:33** - Settlement attempts, fails with balance mismatch
- **01:10:33-01:12:30** - Settlement retries every 3 seconds, continues failing
- **01:12:30** - E2E test times out after 120 polling attempts

### Analysis & Fix
- **01:13:00** - Logs analyzed, discovered settlement WAS triggering
- **01:14:00** - Identified root cause: RefCell fix NOT on devnet
- **01:15:00** - Verified fix exists in source code
- **01:16:00** - Rebuilt program with RefCell fix
- **01:17:00** - Deployed to devnet successfully
- **01:18:00** - Updated IDL
- **01:19:00** - Documented E2E testing mode
- **01:20:00** - Committed and pushed to staging

---

## Lessons Learned

### 1. Deployment Verification
**Always verify** what's actually deployed matches source code:
- Check deployed program behavior
- Compare logs with expected behavior
- Don't assume previous deployments succeeded

### 2. Settlement vs Rate Limits
Settlement service operates **independently** from client API calls:
- Rate limits don't affect settlement execution
- They only affect client's ability to check status
- Settlement will complete even if client is rate-limited

### 3. Build-Deploy Workflow
For Solana programs:
1. Make code changes
2. **Commit changes**
3. **Build with correct features**
4. **Verify binary contains changes** (test locally if possible)
5. Deploy with `anchor upgrade`
6. Update IDL
7. Commit IDL changes
8. Deploy backend

### 4. RefCell Gotcha
When working with PDAs and lamport transfers:
- Get `AccountInfo` reference **ONCE**
- Reuse for all operations
- Don't call `to_account_info()` multiple times
- Be aware of Solana's RefCell tracking system

---

## Success Criteria

✅ **Smart Contract:**
- RefCell fix deployed to devnet
- IDL updated on-chain
- Program ID unchanged: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`

✅ **Backend:**
- IDL updated in source code
- Committed and pushed to staging
- Deployment in progress

⏳ **Configuration:**
- E2E testing mode documented
- Pending: Add `ENABLE_E2E_TESTING=true` to DigitalOcean

⏳ **Testing:**
- Pending: Run v2 NFT_FOR_SOL E2E test
- Pending: Verify settlement completes successfully
- Pending: Run all 3 v2 E2E tests

---

## Related Documentation

- **E2E Testing:** [E2E_TESTING_ENVIRONMENT.md](E2E_TESTING_ENVIRONMENT.md)
- **Program Deployment Safety:** [PROGRAM_DEPLOYMENT_SAFETY.md](PROGRAM_DEPLOYMENT_SAFETY.md)
- **Settlement Diagnostic:** [V2_SETTLEMENT_NOT_TRIGGERING.md](../tasks/V2_SETTLEMENT_NOT_TRIGGERING.md)
- **Program Source:** `programs/escrow/src/lib.rs` (lines 690-911 for settlement logic)
- **Rate Limit Middleware:** `src/middleware/rate-limit.middleware.ts`

---

## Next Actions (Prioritized)

1. **USER:** Add `ENABLE_E2E_TESTING=true` to DigitalOcean staging environment variables
2. **SYSTEM:** Wait for DigitalOcean deployment to complete (automatic)
3. **SYSTEM:** Run E2E test: `npm run test:staging:e2e:v2-nft-sol`
4. **SYSTEM:** If test passes, run all 3 v2 E2E tests
5. **SYSTEM:** Document final results and mark Phase 3 complete

---

**Status:** 🟡 Waiting for DigitalOcean deployment and E2E testing env var configuration

