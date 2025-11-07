# Solana Program Fixes - Progress Summary

**Date:** 2025-11-06  
**Status:** ✅ Partial Success - V2 Naming Removed, ❌ Balance Mismatch Still Present

## What We Accomplished

### 1. ✅ Removed V2 Naming Convention (COMPLETE)

Successfully renamed all instructions and structs in the Solana program:

**Instruction Renames:**
- `init_agreement_v2` → `init_agreement`
- `settle_v2` → `settle`
- `cancel_if_expired_v2` → `cancel_if_expired`
- `admin_cancel_v2` → `admin_cancel`

**Struct Renames:**
- `EscrowStateV2` → `EscrowState`
- `InitAgreementV2` → `InitAgreement`
- `SettleV2` → `Settle`
- `CancelIfExpiredV2` → `CancelIfExpired`
- `AdminCancelV2` → `AdminCancel`

**Backend Updates:**
- Updated `escrow-program.service.ts` to call new instruction names
- Updated staging IDL (`src/generated/anchor/escrow-idl-staging.json`)
- Program successfully deployed to staging devnet

**Test Results:**
- ✅ Agreement creation works
- ✅ NFT deposit works
- ✅ SOL deposit works
- ✅ Status reaches BOTH_LOCKED
- ❌ Settlement fails with balance mismatch

### 2. ❌ Balance Mismatch Fix (INCOMPLETE)

**Attempted Fix:**
Changed fee calculation in `settle` instruction to use deposited `sol_amount` instead of `transferable`:

```rust
// Calculate fee from deposited SOL amount
let sol_amount = ctx.accounts.escrow_state.sol_amount;
let (platform_fee, seller_receives) = calculate_platform_fee(
    sol_amount,
    ctx.accounts.escrow_state.platform_fee_bps,
)?;
```

**Current Error:**
```
Transaction simulation failed: Error processing Instruction 0: 
sum of account balances before and after instruction do not match
```

**What This Means:**
The Solana runtime's balance check is failing, which means:
```
sum(account_balances_before) ≠ sum(account_balances_after)
```

This indicates lamports are being created or destroyed during the instruction execution, which is not allowed.

## Root Cause Analysis

### The Balance Mismatch Problem

The issue occurs during the atomic SOL transfers in the `NftForSol` swap type:

```rust
// Transfer 1: escrow -> fee_collector
**escrow_lamports = escrow_lamports.checked_sub(platform_fee)?;
**fee_collector_lamports = fee_collector_lamports.checked_add(platform_fee)?;

// Transfer 2: escrow -> seller  
**escrow_lamports = escrow_lamports.checked_sub(seller_receives)?;
**seller_lamports = seller_lamports.checked_add(seller_receives)?;
```

### Possible Causes

1. **Rent-Exempt Minimum Issue:**
   - Escrow PDA needs to maintain rent-exempt minimum
   - Current code verifies but may not account for it correctly

2. **Direct Lamport Manipulation:**
   - Using `try_borrow_mut_lamports()` instead of SystemProgram::transfer()
   - This bypasses normal transfer checks
   - Required because PDA has data (can't use SystemProgram::transfer)

3. **Account Balance State:**
   - Escrow PDA balance includes:
     - Initial rent-exempt minimum (from init)
     - Deposited SOL amount
   - Transfers must not touch the rent-exempt portion

### What We Know Works

From the test logs:
- Buyer deposits 0.1 SOL (100,000,000 lamports) ✅
- Fee calculation: platform_fee = 1,000,000, seller_receives = 99,000,000 ✅
- Sum: 1,000,000 + 99,000,000 = 100,000,000 ✅ (matches deposited amount)

The math is correct, but the transfer execution is failing.

## Next Steps Required

### Option 1: Review Transfer Logic
Re-examine the direct lamport manipulation code:
1. Check if we're getting the escrow account balance correctly
2. Verify we're not accidentally modifying other accounts
3. Ensure we're not transferring from the wrong source

### Option 2: Add Comprehensive Logging
Add detailed logging to the Solana program to see:
- Escrow balance before transfers
- Escrow balance after each transfer
- All account balances before and after

### Option 3: Consult Anchor/Solana Documentation
Research:
- Best practices for PDA-to-account SOL transfers
- How other programs handle fee splits with direct lamport manipulation
- Known issues with balance checks in Anchor 0.32.1

## Files Changed

### Solana Program
- `programs/escrow/src/lib.rs` - Renamed instructions, attempted balance fix

### Backend
- `src/services/escrow-program.service.ts` - Updated instruction names
- `src/generated/anchor/escrow-idl-staging.json` - New IDL with renamed instructions
- `idl/escrow.json` - Reference IDL copy

### Documentation
- `docs/tasks/STAGING_E2E_TEST_DEBUG_ANALYSIS.md` - Initial analysis
- `docs/tasks/SOLANA_PROGRAM_SETTLEMENT_ERROR.md` - Settlement error details
- `docs/tasks/SOLANA_PROGRAM_FIXES_SUMMARY.md` - This file

## Commits

1. `5b0b683` - fix(solana): fix balance mismatch and remove v2 naming from program
2. `0b62f68` - fix(idl): update staging IDL with renamed instructions

## Deployed Versions

- **Staging Program ID:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- **Network:** Devnet
- **Last Deployment:** 2025-11-06 ~10:54 AM
- **Upgrade Authority:** wallets/staging/staging-deployer.json

## Test Output Example

```
✅ Agreement Created: AGR-MHMPLH1U-T0QPJAP6
✅ NFT Deposited
✅ SOL Deposited
✅ Status: BOTH_LOCKED

❌ Settlement failed:
Transaction simulation failed: Error processing Instruction 0: 
sum of account balances before and after instruction do not match
```

## Recommendations

1. **Deep Dive into Balance Check:**
   - Add program logs to track each account's balance at every step
   - Compare with working examples from other Anchor programs
   
2. **Consider Alternative Approach:**
   - Research if there's a different way to do fee splits
   - Look at how other DEXs/escrows handle this

3. **Consult Community:**
   - Post on Anchor Discord
   - Check Solana Stack Exchange
   - Review Anchor program examples

## Status

**Current State:** Settlement is blocked by balance mismatch error in on-chain program  
**Impact:** High - prevents NFT-for-SOL swaps from completing  
**Priority:** Critical - core functionality is broken  
**Estimated Fix Time:** Unknown - requires deep investigation of Solana/Anchor internals

