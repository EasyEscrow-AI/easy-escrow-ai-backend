# Staging V2 Deployment Required

**Date:** 2025-01-04  
**Status:** 🟡 BLOCKER IDENTIFIED  
**Priority:** HIGH

---

## Issue Summary

✅ **API Code:** Staging has all v2 API endpoints deployed and working  
❌ **Solana Program:** Devnet program doesn't have v2 instructions yet  
⚠️ **Impact:** Cannot create SOL-based agreements until program is updated

---

## Test Results

### What We Tested Successfully ✅

1. **Health Check** - All services operational
2. **Validation** - Swap type validation working perfectly
3. **API Endpoints** - All routes responding
4. **Request Parsing** - Successfully validated and parsed:
   ```json
   {
     "nftMint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
     "seller": "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71",
     "buyer": "Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk",
     "expiry": "24h",
     "swapType": "NFT_FOR_SOL",
     "solAmount": 1500000000,
     "feePayer": "BUYER",
     "feeBps": 100,
     "honorRoyalties": true
   }
   ```

### Error Encountered ❌

```
"Failed to initialize V2 escrow agreement: 
 this.program.methods.initAgreementV2 is not a function"
```

**Root Cause:** The devnet escrow program doesn't have v2 instructions

---

## Current Configuration

### Staging Environment
- **API URL:** `https://staging-api.easyescrow.ai`
- **Network:** Solana Devnet
- **Program ID:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- **Config File:** `Anchor.staging.toml`

### Program Status
- **Current Program:** v1 (USDC-based, legacy instructions only)
- **Required Program:** v2 (SOL-based, 7 new instructions)
- **IDL Status:** v2 IDL exists in codebase (`src/generated/anchor/escrow-idl-dev.json`)

---

## Required Action

### Deploy Updated Program to Devnet

**Steps:**

1. **Build the program:**
   ```bash
   anchor build
   ```

2. **Deploy to devnet:**
   ```bash
   anchor deploy --provider.cluster devnet --program-keypair wallets/staging/staging-deployer.json
   ```

3. **Verify deployment:**
   ```bash
   solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet
   ```

4. **Verify v2 instructions:**
   ```bash
   # Check IDL on-chain
   anchor idl fetch AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --provider.cluster devnet
   ```

---

## What This Deployment Includes

### New v2 Instructions (7 total)
1. `init_agreement_v2` - Create SOL-based agreements
2. `deposit_sol` - Deposit SOL from buyer
3. `deposit_seller_nft` - Deposit seller's NFT (NFT A)
4. `deposit_buyer_nft` - Deposit buyer's NFT (NFT B) 
5. `settle_v2` - Settlement for SOL-based swaps
6. `cancel_if_expired_v2` - Cancel expired SOL agreements
7. `admin_cancel_v2` - Admin cancel SOL agreements

### Backward Compatibility
- ✅ All legacy USDC instructions preserved (feature-flagged)
- ✅ 416 existing agreements remain functional
- ✅ No breaking changes to v1 API

---

## Deployment Safety

### Pre-Deployment Checks
- [ ] Program builds successfully
- [ ] All tests pass (`anchor test`)
- [ ] IDL generated correctly
- [ ] Feature flags configured (USDC code disabled in production)

### Post-Deployment Verification
- [ ] Program ID matches expected
- [ ] IDL includes all 7 v2 instructions
- [ ] Legacy instructions still available
- [ ] Can create NFT_FOR_SOL agreement
- [ ] Can create NFT_FOR_NFT_WITH_FEE agreement
- [ ] Can create NFT_FOR_NFT_PLUS_SOL agreement

### Rollback Plan
If deployment fails:
1. Verify wallet has SOL for rent exemption
2. Check transaction logs for errors
3. If program corrupted, redeploy from backup
4. If IDL issues, regenerate and redeploy

---

## Alternative Options

### Option A: Use Local Validator (Development)
- Pros: Quick testing, no devnet impact
- Cons: Not integrated with staging API
- Time: 5 minutes

### Option B: Deploy to Devnet (Recommended)
- Pros: Full integration with staging
- Cons: Requires careful deployment
- Time: 15-30 minutes

### Option C: Wait for Manual Deployment
- Pros: No risk of deployment errors
- Cons: Delays testing and integration
- Time: Unknown

---

## Impact Assessment

### If We Deploy Now
✅ Can complete all 17 E2E tests  
✅ Can verify full SOL-based escrow flow  
✅ Can test SOL deposit endpoints  
✅ Can test all 3 swap types  
✅ Staging becomes fully functional for v2

### If We Wait
⏳ Testing blocked  
⏳ Cannot verify E2E flows  
⏳ Cannot test SOL deposits  
⏳ Subtasks 10-12 remain blocked  
⏳ Deployment to production delayed

---

## Recommendation

**Proceed with deployment to devnet** for these reasons:

1. **Low Risk:** Devnet is test environment
2. **High Value:** Unblocks all remaining testing
3. **Backward Compatible:** Won't break existing functionality
4. **Well-Tested:** Program has been built and tested locally
5. **Reversible:** Can redeploy if issues arise

---

## Deployment Checklist

### Pre-Deployment
- [ ] Confirm we're on staging branch
- [ ] Verify Anchor.staging.toml configuration
- [ ] Check staging deployer wallet has SOL
- [ ] Backup current program state (if needed)

### Deployment
- [ ] Build program (`anchor build`)
- [ ] Deploy to devnet (`anchor deploy`)
- [ ] Verify deployment success
- [ ] Check program logs

### Post-Deployment
- [ ] Test agreement creation
- [ ] Verify all v2 instructions available
- [ ] Run E2E test suite
- [ ] Update staging test results

---

## Commands Ready to Execute

```bash
# 1. Build (if needed)
anchor build

# 2. Deploy to devnet
anchor deploy --provider.cluster devnet

# 3. Verify
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet

# 4. Test agreement creation
curl -X POST https://staging-api.easyescrow.ai/v1/agreements \
  -H "Content-Type: application/json" \
  -H "idempotency-key: $(uuidgen)" \
  -d '{
    "nftMint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    "seller": "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71",
    "buyer": "Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk",
    "expiry": "24h",
    "swapType": "NFT_FOR_SOL",
    "solAmount": 1500000000,
    "feePayer": "BUYER",
    "feeBps": 100,
    "honorRoyalties": true
  }'
```

---

**Decision Required:** Should we proceed with devnet deployment?

- ✅ **YES** - Deploy now and complete testing
- ⏳ **WAIT** - Manual deployment by DevOps team
- 🔧 **LOCAL** - Test with local validator first

---

**Last Updated:** 2025-01-04 07:58 UTC  
**Status:** Awaiting deployment approval

