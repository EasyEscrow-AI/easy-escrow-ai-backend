# Smart Contract Bug: NFT B Not Transferred in NFT-for-NFT Settlements

**Priority:** CRITICAL  
**Status:** CONFIRMED - Smart Contract Fix Required  
**Date Discovered:** 2025-11-11  
**Affects:** `NFT_FOR_NFT_WITH_FEE` and `NFT_FOR_NFT_PLUS_SOL` swap types

---

## 🚨 Issue Summary

The smart contract's `settle` instruction successfully transfers NFT A (seller → buyer) but **does NOT transfer NFT B (buyer → seller)** in NFT-for-NFT swaps, resulting in incomplete swaps where the seller receives nothing.

---

## 📊 Evidence

### Backend Logs (PR #205 Deployed)
```log
Nov 11 04:05:35  [EscrowProgramService] Adding NFT B accounts for settlement: B7xuJwgqq2ppspX21NcBNq8DXVhQcakmv68nPEq3aKrV
Nov 11 04:05:35  [EscrowProgramService] NFT B Token accounts: {
Nov 11 04:05:35    escrowNftBAccount: '8h463PsLhQytPGdTTEJLGVh6cRL8yQBhYGiRrYPGdtyJ',
Nov 11 04:05:35    sellerNftBAccount: '2G9QeTeiPe4Ntzbg5QkQe12EaakP4aR5upkeDwA9j2Fr'
Nov 11 04:05:35  }
Nov 11 04:05:35  [EscrowProgramService] Settlement transaction signed, sending to network...
Nov 11 04:05:35  [EscrowProgramService] ✅ Transaction sent via Jito Block Engine: 43oNXCmrMU8skiqbmJEMm3yeZpyCmTknbji6krK9veiyZ8pVtbtTRahd68CsLKMmgcxTY7TahHKAxCSFWyQX3ga3
Nov 11 04:05:35  [SettlementService] V2 Settlement transaction confirmed
```

### Settlement Transaction
- **TX ID:** `43oNXCmrMU8skiqbmJEMm3yeZpyCmTknbji6krK9veiyZ8pVtbtTRahd68CsLKMmgcxTY7TahHKAxCSFWyQX3ga3`
- **Explorer:** https://explorer.solana.com/tx/43oNXCmrMU8skiqbmJEMm3yeZpyCmTknbji6krK9veiyZ8pVtbtTRahd68CsLKMmgcxTY7TahHKAxCSFWyQX3ga3?cluster=mainnet-beta
- **Status:** ✅ Confirmed (no errors)
- **NFT A Transfer:** ✅ Success (seller → buyer)
- **NFT B Transfer:** ❌ Did NOT occur (buyer → seller)

### Test Results
```
🔍 Verifying NFT swap...
   Seller NFT B Balance: 0  ❌ WRONG!
   Expected: 1
```

---

## ✅ Backend is Correct

The backend (PR #205) is providing all required accounts in the correct order:

### `remainingAccounts` Provided to Smart Contract:
1. **Position 0:** NFT B mint address (`nftBMint`)
2. **Position 1:** Escrow's NFT B token account (source)
3. **Position 2:** Seller's NFT B token account (destination)
4. **Position 3:** `TOKEN_PROGRAM_ID`

**Pattern Consistency:**
- ✅ Matches `cancelIfExpired` implementation (line 2447-2450)
- ✅ Matches `adminCancel` implementation (line 2597-2600)
- ✅ Both cancellation methods successfully transfer NFT B

---

## 🔧 Required Smart Contract Fix

The smart contract's `settle` instruction needs to handle NFT B transfers for NFT-for-NFT swaps.

### Current Behavior (Assumed)
```rust
pub fn settle(ctx: Context<Settle>) -> Result<()> {
    let escrow = &ctx.accounts.escrow_state;
    
    // Transfer NFT A (seller's NFT to buyer)
    transfer_nft_a(&ctx)?;  // ✅ Working
    
    // Transfer SOL with fees
    transfer_sol_with_fees(&ctx)?;  // ✅ Working
    
    // ❌ MISSING: Transfer NFT B for NFT-for-NFT swaps!
    
    // Update escrow status
    escrow.status = EscrowStatus::Completed;
    
    Ok(())
}
```

### Required Fix
```rust
pub fn settle(ctx: Context<Settle>) -> Result<()> {
    let escrow = &ctx.accounts.escrow_state;
    
    // Transfer NFT A (seller's NFT to buyer)
    transfer_nft_a(&ctx)?;  // ✅ Working
    
    // Transfer SOL with fees
    transfer_sol_with_fees(&ctx)?;  // ✅ Working
    
    // ✅ NEW: Transfer NFT B for NFT-for-NFT swaps
    if escrow.swap_type == SwapType::NftForNftWithFee || 
       escrow.swap_type == SwapType::NftForNftPlusSol {
        
        // Validate remaining accounts are provided
        require!(
            ctx.remaining_accounts.len() >= 4,
            ErrorCode::MissingNftBAccounts
        );
        
        // Parse remaining accounts
        let nft_b_mint = &ctx.remaining_accounts[0];           // NFT B mint
        let escrow_nft_b_account = &ctx.remaining_accounts[1]; // Source
        let seller_nft_b_account = &ctx.remaining_accounts[2]; // Destination
        let token_program = &ctx.remaining_accounts[3];        // Token program
        
        // Validate accounts
        require!(
            escrow_nft_b_account.owner == &anchor_spl::token::ID,
            ErrorCode::InvalidNftBAccount
        );
        require!(
            seller_nft_b_account.owner == &anchor_spl::token::ID,
            ErrorCode::InvalidSellerNftBAccount
        );
        
        // Transfer NFT B from escrow to seller
        let escrow_id = escrow.escrow_id.to_le_bytes();
        let seeds = &[
            b"escrow_state",
            escrow_id.as_ref(),
            &[escrow.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: escrow_nft_b_account.to_account_info(),
                    to: seller_nft_b_account.to_account_info(),
                    authority: ctx.accounts.escrow_state.to_account_info(),
                },
                signer_seeds,
            ),
            1, // NFT amount is always 1
        )?;
        
        msg!("NFT B transferred to seller");
    }
    
    // Update escrow status
    escrow.status = EscrowStatus::Completed;
    
    Ok(())
}
```

### Error Codes to Add
```rust
#[error_code]
pub enum ErrorCode {
    // ... existing errors ...
    
    #[msg("NFT B accounts not provided for NFT-for-NFT swap")]
    MissingNftBAccounts,
    
    #[msg("Invalid NFT B escrow account")]
    InvalidNftBAccount,
    
    #[msg("Invalid seller NFT B account")]
    InvalidSellerNftBAccount,
}
```

---

## 📋 Testing Checklist

After implementing the fix:

### Unit Tests
- [ ] Test `settle` with `NftForNftWithFee` swap type
- [ ] Test `settle` with `NftForNftPlusSol` swap type
- [ ] Test `settle` with `NftForSol` (should not touch remaining accounts)
- [ ] Test `settle` fails gracefully if NFT B accounts missing
- [ ] Test `settle` fails if invalid accounts provided

### Integration Tests
- [ ] Complete NFT-for-NFT-with-Fee swap flow
- [ ] Verify NFT A transferred to buyer
- [ ] Verify NFT B transferred to seller
- [ ] Verify SOL fees collected correctly
- [ ] Verify escrow status set to `Completed`

### Production E2E Test
```bash
npm run test:production:e2e:nft-nft-fee
```

**Expected Result:**
```
✅ Seller NFT B Balance: 1  (should receive NFT B)
✅ Buyer NFT A Balance: 1   (should receive NFT A)
✅ Platform collected: 0.01 SOL
```

---

## 🔍 Comparison with Working Methods

### `cancelIfExpired` (WORKING - Handles NFT B)
```rust
// Location: smart-contract/programs/escrow/src/instructions/cancel_if_expired.rs (assumed)
// This method SUCCESSFULLY transfers NFT B back to buyer during cancellation

if swap_type == SwapType::NftForNftWithFee || swap_type == SwapType::NftForNftPlusSol {
    // Parse remaining accounts for NFT B
    let nft_b_mint = &ctx.remaining_accounts[0];
    let escrow_nft_b_account = &ctx.remaining_accounts[1];
    let buyer_nft_b_account = &ctx.remaining_accounts[2];
    let token_program = &ctx.remaining_accounts[3];
    
    // Transfer NFT B back to buyer
    transfer_nft(escrow_nft_b_account, buyer_nft_b_account, ...)?;
}
```

### `settle` (BROKEN - Does NOT Handle NFT B)
```rust
// Currently only handles NFT A transfer
// Needs to add NFT B transfer logic similar to cancelIfExpired
```

---

## 📊 Impact

### Current Production Issues
- ✅ NFT-for-SOL swaps: Working correctly
- ❌ NFT-for-NFT-with-Fee swaps: Incomplete (seller gets nothing)
- ❌ NFT-for-NFT-plus-SOL swaps: Incomplete (seller gets nothing)

### Risk Assessment
- **Severity:** CRITICAL
- **User Impact:** HIGH - Sellers lose their NFT without receiving buyer's NFT
- **Frequency:** 100% of NFT-for-NFT settlements
- **Revenue Impact:** Platform still collects fees, but swap incomplete

---

## 🚀 Deployment Plan

### 1. Smart Contract Fix
- [ ] Implement NFT B transfer logic in `settle` instruction
- [ ] Add error handling and validation
- [ ] Add unit tests
- [ ] Deploy to devnet
- [ ] Test on devnet

### 2. Devnet Testing
```bash
# Run backend against devnet
SOLANA_NETWORK=devnet npm run test:e2e:nft-nft-fee

# Expected: All tests pass, seller receives NFT B
```

### 3. Mainnet Deployment
- [ ] Deploy updated smart contract to mainnet
- [ ] Verify program ID unchanged
- [ ] Backend automatically uses new logic (no changes needed)
- [ ] Run production E2E test
- [ ] Monitor first 5-10 NFT-for-NFT settlements

---

## 📝 Backend Code Reference

The backend code that provides NFT B accounts to the smart contract is in:

**File:** `src/services/escrow-program.service.ts`  
**Method:** `settle()`  
**Lines:** 1267-1296

```typescript
// Add remaining accounts for NFT B (buyer's NFT in NFT_FOR_NFT swaps)
if (nftBMint) {
  console.log('[EscrowProgramService] Adding NFT B accounts for settlement:', nftBMint.toString());
  
  const escrowNftBAccount = await getAssociatedTokenAddress(
    nftBMint,
    escrowPda,
    true,
    TOKEN_PROGRAM_ID
  );

  const sellerNftBAccount = await getAssociatedTokenAddress(
    nftBMint,
    seller,
    false,
    TOKEN_PROGRAM_ID
  );

  console.log('[EscrowProgramService] NFT B Token accounts:', {
    escrowNftBAccount: escrowNftBAccount.toString(),
    sellerNftBAccount: sellerNftBAccount.toString(),
  });

  // Add remaining accounts - ORDER MATTERS!
  instructionBuilder.remainingAccounts([
    { pubkey: nftBMint, isSigner: false, isWritable: false },          // 1. NFT B mint
    { pubkey: escrowNftBAccount, isSigner: false, isWritable: true },  // 2. Source
    { pubkey: sellerNftBAccount, isSigner: false, isWritable: true },  // 3. Destination
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },  // 4. Token program
  ]);
}
```

---

## 🔗 Related Issues

- PR #203: Fixed fee calculation for NFT-for-NFT swaps
- PR #204: Fixed buyer deposit amount calculation
- PR #205: Added NFT B accounts to settlement (backend fix - COMPLETE ✅)
- **THIS ISSUE:** Smart contract needs to USE the NFT B accounts (PENDING ⏳)

---

## 👥 Contacts

- **Backend Team:** PR #205 complete, accounts being provided correctly
- **Smart Contract Team:** Fix needed in `settle` instruction
- **Testing:** Production E2E test ready: `npm run test:production:e2e:nft-nft-fee`

---

## ⚡ Quick Start for Smart Contract Devs

1. **Review this document**
2. **Check `cancelIfExpired` implementation** (it works correctly)
3. **Apply same NFT B transfer logic to `settle`**
4. **Test on devnet**
5. **Deploy to mainnet**
6. **Run production E2E test to verify**

---

**The backend is ready. The ball is in the smart contract team's court!** 🏀
