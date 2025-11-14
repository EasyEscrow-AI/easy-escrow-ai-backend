# Platform Fee Collection Bug Fix - NFT_FOR_NFT_WITH_FEE

**Date:** 2025-11-14  
**Severity:** 🔴 **CRITICAL** - Revenue Loss  
**Status:** ✅ Fixed (Awaiting Deployment)

---

## Executive Summary

A critical bug was discovered in the `NFT_FOR_NFT_WITH_FEE` swap type settlement logic that causes **only 50% of platform fees to be collected**. Instead of collecting the full 0.01 SOL (0.005 SOL from buyer + 0.005 SOL from seller), the system was only transferring 0.005 SOL to the fee collector, leaving the other 0.005 SOL stuck in the vault PDA.

**Impact:**
- **Lost Revenue:** 50% of all platform fees for NFT-for-NFT swaps with fees
- **Vault Accumulation:** Uncollected fees remain in vault PDAs indefinitely
- **Production:** Bug is live on mainnet (Program ID: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`)

---

## The Bug

### Root Cause

The settlement instruction was using `escrow_state.sol_amount` directly as the platform fee, but `sol_amount` stores **only the buyer's portion** (half of the total fee).

**File:** `programs/escrow/src/lib.rs`, Line 918

```rust
// ❌ BEFORE (WRONG):
SwapType::NftForNftWithFee => {
    // ...deposits validation...
    
    // Transfer platform fee (SOL) to fee collector
    // CRITICAL: Both parties deposited to sol_vault, so transfer FROM sol_vault!
    let platform_fee = ctx.accounts.escrow_state.sol_amount; // Only 0.005 SOL!
    
    // Transfer only half the fee
    anchor_lang::system_program::transfer(fee_transfer_ctx, platform_fee)?;
}
```

### How the Bug Manifests

1. **Backend calculates and stores buyer's portion:**
   ```typescript
   // Backend: agreement.service.ts
   const platformFeeLamports = 10000000; // 0.01 SOL total
   const buyerPortion = 5000000; // 0.005 SOL (half)
   solAmount = new BN(buyerPortion); // Stored in escrow_state
   ```

2. **Both parties deposit using the same `sol_amount`:**
   ```rust
   // deposit_sol (buyer)
   let sol_amount = ctx.accounts.escrow_state.sol_amount; // 5000000
   transfer(transfer_ctx, sol_amount)?; // Buyer deposits 0.005 SOL
   
   // deposit_seller_sol_fee (seller)
   let sol_amount = ctx.accounts.escrow_state.sol_amount; // Same 5000000!
   transfer(transfer_ctx, sol_amount)?; // Seller deposits 0.005 SOL
   
   // Total in vault: 0.01 SOL ✅
   ```

3. **Settlement only transfers buyer's portion:**
   ```rust
   // settle (NftForNftWithFee)
   let platform_fee = ctx.accounts.escrow_state.sol_amount; // Only 5000000!
   transfer(fee_transfer_ctx, platform_fee)?; // Only transfers 0.005 SOL ❌
   
   // Remaining 0.005 SOL stuck in vault! 💸
   ```

### Evidence

**Transaction:** [3qVQp5WfoZH6MvekzLUhPsbGdV82yxzw6FA6hdXuyt9DLf4u1qLjabMjybFeb5puua3JpGc1tbSFVmoeJ2dfzhq1](https://solscan.io/tx/3qVQp5WfoZH6MvekzLUhPsbGdV82yxzw6FA6hdXuyt9DLf4u1qLjabMjybFeb5puua3JpGc1tbSFVmoeJ2dfzhq1)

- **Expected fee collection:** 0.01 SOL (10,000,000 lamports)
- **Actual fee collection:** 0.005 SOL (5,000,000 lamports)
- **Missing:** 0.005 SOL (5,000,000 lamports) - stuck in vault PDA

**Test Output:**
```
Balance Changes:
  Seller: -0.0072 SOL (paid 0.005 SOL fee)
  Buyer: -0.0072 SOL (paid 0.005 SOL fee)
  Fee Collector: -0.0065 SOL (collected 0.01 SOL) ❌ Should be +0.01 SOL
```

The fee collector's balance actually *decreased* due to transaction fees, while it should have increased by ~0.01 SOL.

---

## The Fixes

### Fix 1: Platform Fee Collection (Critical)

**File:** `programs/escrow/src/lib.rs`, Lines 916-921

```rust
// ✅ AFTER (CORRECT):
SwapType::NftForNftWithFee => {
    // ...deposits validation...
    
    // Transfer platform fee (SOL) to fee collector
    // CRITICAL: sol_amount stores buyer's portion (half), but BOTH parties deposited
    // Total fee = sol_amount * 2 (e.g., 0.005 * 2 = 0.01 SOL)
    let platform_fee = ctx.accounts.escrow_state.sol_amount
        .checked_mul(2)
        .ok_or(EscrowError::CalculationOverflow)?;
    
    // Transfer full fee (both halves)
    anchor_lang::system_program::transfer(fee_transfer_ctx, platform_fee)?;
}
```

### What Changed

- **Before:** `platform_fee = sol_amount` (only buyer's half)
- **After:** `platform_fee = sol_amount * 2` (both halves)
- Uses `checked_mul(2)` for safe arithmetic with overflow protection

### Fix 2: Account Naming Improvements (UX)

**Problem:** Transaction explorers like Solscan were showing vague account names for NFT-for-NFT swaps, making it difficult to understand which NFT was which.

**Examples of vague names:**
- Account #6: "Escrow Nft Account" (unclear - which NFT?)
- Account #13: "Account" (no information at all)
- Account #14: "Account" (no information at all)
- Account #15: "Account" (no information at all)

**Changes Made:**

1. **Added clear account documentation in Settle struct:**
   ```rust
   /// Escrow NFT A account (seller's NFT held in escrow)
   pub escrow_nft_account: Account<'info, TokenAccount>,
   
   /// Buyer NFT A account (destination for seller's NFT)
   pub buyer_nft_account: Account<'info, TokenAccount>,
   
   /// NFT A mint (seller's NFT being traded)
   pub nft_mint: Account<'info, Mint>,
   ```

2. **Added remaining accounts documentation to instructions:**
   ```rust
   /// Settle the escrow and distribute assets
   /// **Remaining Accounts** (for NFT<>NFT swaps):
   /// - [0] NFT B mint (buyer's NFT)
   /// - [1] Escrow NFT B account (buyer's NFT held in escrow) [writable]
   /// - [2] Seller NFT B account (destination for NFT B) [writable]
   /// - [3] Token program (for NFT B transfer)
   pub fn settle<'info>(ctx: Context<'_, '_, '_, 'info, Settle<'info>>) -> Result<()>
   ```

3. **Applied same improvements to cancel_if_expired and admin_cancel**

**Result:** Transaction explorers will now show descriptive names, making it much easier to understand and audit transactions.

---

## Testing Plan

### 1. Unit Test Verification

Run existing NFT-for-NFT fee tests to verify fix:

```bash
npm run test:unit:nft-for-nft-fee
```

**Expected:** All tests pass with correct fee collection (0.01 SOL total).

### 2. Staging Deployment & E2E Test

Deploy to staging (devnet) and run comprehensive E2E test:

```bash
# Deploy to staging
cd programs/escrow
$env:HOME = $env:USERPROFILE
cargo build-sbf
cd ../..
anchor idl build

# Deploy to devnet
anchor upgrade target/deploy/easyescrow.so \
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --provider.cluster devnet \
  --provider.wallet wallets/staging/staging-deployer.json

# Upload IDL
anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --filepath target/idl/escrow.json \
  --provider.cluster devnet \
  --provider.wallet wallets/staging/staging-deployer.json

# Update backend IDL
Copy-Item target/idl/escrow.json src/generated/anchor/escrow-idl-staging.json -Force

# Run E2E test
npm run test:staging:e2e:nft-nft-fee
```

**Expected Results:**
- ✅ Both parties deposit 0.005 SOL each (0.01 SOL total in vault)
- ✅ Settlement transfers full 0.01 SOL to fee collector
- ✅ Fee collector balance increases by ~0.01 SOL (minus tx fees)
- ✅ No SOL left in vault PDA after settlement

### 3. Production Deployment

After successful staging validation:

```bash
# Deploy to mainnet
anchor upgrade target/deploy/easyescrow.so \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --provider.cluster mainnet \
  --provider.wallet wallets/production/mainnet-deployer.json

# Upload IDL
anchor idl upgrade 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --filepath target/idl/escrow.json \
  --provider.cluster mainnet \
  --provider.wallet wallets/production/mainnet-deployer.json

# Update backend IDL
Copy-Item target/idl/escrow.json src/generated/anchor/escrow-idl-production.json -Force

# Run production E2E test
npm run test:production:e2e:nft-nft-fee
```

---

## Affected Transactions

### How to Identify

All NFT-for-NFT swaps with fees where:
- Swap type: `NFT_FOR_NFT_WITH_FEE`
- Status: `SETTLED`
- Two SOL deposits (buyer + seller)
- Fee collector only received half the expected amount

### Recovery Strategy (Optional)

If significant revenue was lost, uncollected fees can be recovered from vault PDAs:

1. **Identify affected agreements** with stuck fees
2. **Calculate total uncollected** (0.005 SOL per agreement)
3. **Admin recovery script** to transfer remaining vault balances to fee collector

**Script:** `scripts/recovery/recover-stuck-nft-fees.ts` (to be created if needed)

---

## Impact Analysis

### Before Fix (Production)

- **Per Agreement:** Lost 0.005 SOL (50% of fee)
- **Example:** 100 NFT-for-NFT swaps = 0.5 SOL lost revenue
- **All time:** Depends on number of affected transactions

### After Fix

- **Per Agreement:** Collect full 0.01 SOL (100% of fee)
- **Vault Balance:** Always returns to near-zero after settlement
- **Revenue:** Fully captured as designed

---

## Related Systems

### Not Affected

- ✅ **NFT_FOR_SOL:** Uses `calculate_platform_fee()` correctly
- ✅ **NFT_FOR_NFT_PLUS_SOL:** Uses `calculate_platform_fee()` correctly
- ✅ **Backend fee calculation:** Correct (stores buyer's half)
- ✅ **Deposit instructions:** Correct (both parties deposit half)

### Only Affected

- ❌ **NFT_FOR_NFT_WITH_FEE settlement:** Was using `sol_amount` instead of `sol_amount * 2`

---

## Lessons Learned

### Design Issues

1. **Confusing field semantics:** `sol_amount` means different things for different swap types
   - NFT_FOR_SOL: Full transaction amount
   - NFT_FOR_NFT_WITH_FEE: **Buyer's portion only** (half of total fee)
   - NFT_FOR_NFT_PLUS_SOL: Full transaction amount

2. **Misleading comments:** Code comment said "Full amount" but field contained "half amount"

3. **Missing validation:** No test verified final fee collector balance delta

### Improvements

1. **Better naming:** Consider renaming field or adding `buyer_portion` flag
2. **Explicit documentation:** Document field semantics per swap type
3. **Integration tests:** Always verify fee collector balance changes
4. **Production monitoring:** Alert on unexpected vault balances

---

## Deployment Checklist

- [x] Bug identified and root cause analyzed
- [x] Fix implemented in `programs/escrow/src/lib.rs`
- [x] Program compiled successfully
- [x] IDL generated
- [ ] Unit tests pass (verify)
- [ ] Deploy to staging (devnet)
- [ ] E2E test on staging (verify full fee collection)
- [ ] Code review (recommended)
- [ ] Deploy to production (mainnet)
- [ ] E2E test on production (verify fix)
- [ ] Update backend IDL (production)
- [ ] Monitor first 5-10 production transactions
- [ ] Document recovery strategy for past transactions (if needed)

---

## References

- **Bug Report Transaction:** [Solscan](https://solscan.io/tx/3qVQp5WfoZH6MvekzLUhPsbGdV82yxzw6FA6hdXuyt9DLf4u1qLjabMjybFeb5puua3JpGc1tbSFVmoeJ2dfzhq1)
- **Test File:** `tests/production/e2e/02-nft-for-nft-with-fee.test.ts`
- **Backend Fee Logic:** `src/services/agreement.service.ts` (lines 74-99)
- **Smart Contract:** `programs/escrow/src/lib.rs`
- **Production Program:** `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- **Staging Program:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`

---

## Author

AI Assistant - Bug discovered and fixed on 2025-11-14

