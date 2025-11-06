# Balance Mismatch Error - Root Cause Analysis

**Date:** 2025-01-06  
**Error:** `Transaction simulation failed: Error processing Instruction 0: sum of account balances before and after instruction do not match`  
**Location:** `programs/escrow/src/lib.rs` - `settle` instruction

## Research Summary

Used Perplexity research API to investigate this Solana-specific error. Key findings:

### Root Causes of UnbalancedInstruction Error

1. **Rent Exemption Violations** (Most Likely Cause)
   - Every account must maintain minimum lamports for rent exemption based on data size
   - Transfers must ensure destination accounts remain rent-exempt after receiving lamports
   - Source PDA must also remain rent-exempt if it retains data
   - **Our code does NOT validate this before transfers**

2. **Executable Account Restrictions**
   - Executable accounts (programs) cannot send or receive lamports
   - Runtime explicitly checks `is_executable()` flag
   - Would fail with `ExecutableLamportChange` error
   - **We don't check for this**

3. **RefCell Borrow Lifetime Issues**
   - Multiple mutable borrows of same account can cause `AccountBorrowFailed`
   - Borrows must be properly scoped
   - **Our code appears correct here** - we get all borrows once and hold simultaneously

4. **Reserved Accounts**
   - Solana maintains reserved account list (built-ins, precompiles, sysvars)
   - These become read-only regardless of transaction metadata
   - Can cause silent failures when accounts become reserved
   - Less likely in our case, but possible

## Current Code Issues

Our `settle` instruction in `programs/escrow/src/lib.rs`:

```rust
// Calculate fee from deposited SOL amount
let sol_amount = ctx.accounts.escrow_state.sol_amount;
let (platform_fee, seller_receives) = calculate_platform_fee(
    sol_amount,
    ctx.accounts.escrow_state.platform_fee_bps,
)?;

// Get account references ONCE
let escrow_account = ctx.accounts.escrow_state.to_account_info();
let fee_collector_account = ctx.accounts.platform_fee_collector.to_account_info();
let seller_account = ctx.accounts.seller.to_account_info();

// Verify escrow has enough balance (including rent-exempt minimum)
let rent = Rent::get()?;
let min_rent_exempt = rent.minimum_balance(escrow_account.data_len());
let current_balance = escrow_account.lamports();
let transferable = current_balance.checked_sub(min_rent_exempt)
    .ok_or(EscrowError::InsufficientFunds)?;

require!(
    transferable >= sol_amount,
    EscrowError::InsufficientFunds
);

// ❌ PROBLEM: We DON'T check if destinations will be rent-exempt!
// ❌ PROBLEM: We DON'T check if accounts are executable!
// ❌ PROBLEM: Using manual lamport manipulation instead of Anchor utilities

// Perform ATOMIC lamport transfers
let mut escrow_lamports = escrow_account.try_borrow_mut_lamports()?;
let mut fee_collector_lamports = fee_collector_account.try_borrow_mut_lamports()?;
let mut seller_lamports = seller_account.try_borrow_mut_lamports()?;

// Transfer 1: escrow -> fee_collector
**escrow_lamports = escrow_lamports.checked_sub(platform_fee)
    .ok_or(EscrowError::InsufficientFunds)?;
**fee_collector_lamports = fee_collector_lamports.checked_add(platform_fee)
    .ok_or(EscrowError::CalculationOverflow)?;

// Transfer 2: escrow -> seller
**escrow_lamports = escrow_lamports.checked_sub(seller_receives)
    .ok_or(EscrowError::InsufficientFunds)?;
**seller_lamports = seller_lamports.checked_add(seller_receives)
    .ok_or(EscrowError::CalculationOverflow)?;
```

## Recommended Solution

Based on Perplexity research, implement these fixes:

### 1. Add Rent Exemption Validation (Critical)

```rust
// Validate rent exemption BEFORE any transfers
let rent = Rent::get()?;

// Check fee collector will be rent-exempt after receiving fee
let fee_collector_balance_after = fee_collector_account.lamports()
    .checked_add(platform_fee)
    .ok_or(EscrowError::CalculationOverflow)?;
    
require!(
    rent.is_exempt(fee_collector_balance_after, fee_collector_account.data_len()),
    EscrowError::InsufficientFeeCollectorRent
);

// Check seller will be rent-exempt after receiving payment
let seller_balance_after = seller_account.lamports()
    .checked_add(seller_receives)
    .ok_or(EscrowError::CalculationOverflow)?;
    
require!(
    rent.is_exempt(seller_balance_after, seller_account.data_len()),
    EscrowError::InsufficientSellerRent
);

// Check escrow will remain rent-exempt after transfers
let escrow_balance_after = escrow_account.lamports()
    .checked_sub(platform_fee)
    .and_then(|b| b.checked_sub(seller_receives))
    .ok_or(EscrowError::InsufficientFunds)?;
    
require!(
    rent.is_exempt(escrow_balance_after, escrow_account.data_len()),
    EscrowError::InsufficientEscrowRent
);
```

### 2. Add Executable Account Check

```rust
// Verify no executable accounts
require!(
    !escrow_account.executable 
    && !fee_collector_account.executable 
    && !seller_account.executable,
    EscrowError::ExecutableAccountNotAllowed
);
```

### 3. Use Anchor 0.29.0+ Utility Methods (If Available)

Instead of manual `try_borrow_mut_lamports()`, use:

```rust
// Use Anchor's safer utility methods
escrow_account.sub_lamports(platform_fee)?;
fee_collector_account.add_lamports(platform_fee)?;

escrow_account.sub_lamports(seller_receives)?;
seller_account.add_lamports(seller_receives)?;
```

### 4. Add Comprehensive Logging

```rust
msg!("Settlement transfers:");
msg!("  Platform fee: {} lamports", platform_fee);
msg!("  Seller receives: {} lamports", seller_receives);
msg!("  Escrow before: {} lamports", escrow_account.lamports());
msg!("  Fee collector before: {} lamports", fee_collector_account.lamports());
msg!("  Seller before: {} lamports", seller_account.lamports());
// ... perform transfers ...
msg!("  Escrow after: {} lamports", escrow_account.lamports());
msg!("  Fee collector after: {} lamports", fee_collector_account.lamports());
msg!("  Seller after: {} lamports", seller_account.lamports());
```

## Required Error Codes

Add these to `EscrowError` enum:

```rust
#[error_code]
pub enum EscrowError {
    // ... existing errors ...
    
    #[msg("Fee collector account would not be rent-exempt after receiving fee")]
    InsufficientFeeCollectorRent,
    
    #[msg("Seller account would not be rent-exempt after receiving payment")]
    InsufficientSellerRent,
    
    #[msg("Escrow account would not be rent-exempt after transfers")]
    InsufficientEscrowRent,
    
    #[msg("Executable accounts cannot send or receive lamports")]
    ExecutableAccountNotAllowed,
}
```

## Next Steps

1. ✅ Document findings (this file)
2. ⏭️ Implement rent exemption checks in `settle` instruction
3. ⏭️ Add executable account validation
4. ⏭️ Add comprehensive logging
5. ⏭️ Rebuild and deploy to staging devnet
6. ⏭️ Update backend IDL
7. ⏭️ Re-run E2E test

## References

- Perplexity Research: "sum of account balances before and after instruction do not match" 
- Key insight from OSEC blog: Rent exemption is most common cause
- Anchor 0.29.0+ has `add_lamports()` and `sub_lamports()` utilities
- Solana validates multiple constraints beyond arithmetic correctness

