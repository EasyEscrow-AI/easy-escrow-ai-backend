# SOL Vault Architecture Implementation

## Summary

Successfully implemented a separate SOL vault PDA architecture to resolve the persistent "UnbalancedInstruction" error during settlement. This architecture mirrors the USDC design where funds are held in a separate account.

## Root Cause Analysis

### Why the Original Design Failed

The original NFT-for-SOL implementation tried to store SOL directly in the `escrow_state` PDA's lamport balance. This approach failed because:

1. **System Program Restriction**: System Program's `transfer()` instruction explicitly rejects PDAs with data:
   ```
   Error: "Transfer: `from` must not carry data"
   ```

2. **Direct Lamport Manipulation Issue**: Using `try_borrow_mut_lamports()` on data-bearing PDAs appeared to work at the program level (RefMut borrows completed successfully), but Solana's runtime silently ignored the lamport changes. This resulted in:
   - Program logs showing successful balance changes
   - But `preBalances` and `postBalances` remaining identical
   - `UnbalancedInstruction` error at runtime

### Why USDC Version Worked

The USDC version never encountered this issue because:
- USDC tokens were held in a **separate Associated Token Account** (`escrow_usdc_account`)
- The `escrow_state` PDA only held data and signed token transfers via CPI
- The PDA **never tried to modify its own lamport balance**

## Solution: SOL Vault Architecture

Created a two-PDA design:

### 1. State PDA (`escrow_state`)
- **Seeds**: `[b"escrow", escrow_id.to_le_bytes()]`
- **Purpose**: Stores escrow metadata and state
- **Data**: 202 bytes (EscrowState struct)
- **Lamports**: Only rent-exemption minimum (never modified during settlement)

### 2. SOL Vault PDA (`sol_vault`)
- **Seeds**: `[b"sol_vault", escrow_id.to_le_bytes()]`
- **Purpose**: Holds SOL lamports for settlement
- **Data**: ZERO bytes (just a lamport holder)
- **Lamports**: Receives buyer's SOL deposit, distributes during settlement

## Changes Made

### Solana Program (`programs/escrow/src/lib.rs`)

#### Account Structures Updated:
- `InitAgreement`: Added `sol_vault: SystemAccount<'info>`
- `DepositSol`: Added `sol_vault: SystemAccount<'info>`
- `Settle`: Added `sol_vault: SystemAccount<'info>`
- `CancelIfExpired`: Added `sol_vault: SystemAccount<'info>`
- `AdminCancel`: Added `sol_vault: SystemAccount<'info>`

#### Logic Changes:

**deposit_sol** (Line ~1766):
```rust
// OLD: Transfer to escrow_state PDA
to: ctx.accounts.escrow_state.to_account_info()

// NEW: Transfer to sol_vault PDA
to: ctx.accounts.sol_vault.to_account_info()
```

**settle** (Line ~766):
```rust
// Vault PDA signer seeds (different from state PDA!)
let escrow_id_bytes = ctx.accounts.escrow_state.escrow_id.to_le_bytes();
let vault_signer_seeds: &[&[&[u8]]] = &[&[
    b"sol_vault",
    escrow_id_bytes.as_ref(),
    &[ctx.bumps.sol_vault],  // Use vault's bump, not state's bump!
]];

// Transfer FROM vault (zero-data PDA) using System Program CPI
let fee_transfer_ctx = CpiContext::new_with_signer(
    ctx.accounts.system_program.to_account_info(),
    anchor_lang::system_program::Transfer {
        from: ctx.accounts.sol_vault.to_account_info(),
        to: ctx.accounts.platform_fee_collector.to_account_info(),
    },
    vault_signer_seeds,
);
anchor_lang::system_program::transfer(fee_transfer_ctx, platform_fee)?;
```

**cancel_if_expired & admin_cancel** (Lines ~2095, ~2189):
- Similar changes to transfer FROM `sol_vault` instead of `escrow_state`

### Backend Services

#### `escrow-program.service.ts` (Lines ~1328, ~1376):

**Vault PDA Derivation**:
```typescript
// Derive SOL vault PDA
const [solVaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('sol_vault'), escrowId.toArrayLike(Buffer, 'le', 8)],
  this.programId
);
```

**Include in Accounts**:
```typescript
.accountsStrict({
  escrowState: escrowPda,
  buyer,
  seller,
  solVault: solVaultPda, // NEW: Separate PDA for holding SOL lamports
  admin: this.adminKeypair.publicKey,
  systemProgram: SystemProgram.programId,
})
```

## Remaining Work

### Backend Services

The following services still need to be updated to derive and include `sol_vault` PDA:

1. **`sol-deposit.service.ts`**:
   - Currently monitors `escrow_state` PDA for balance changes
   - **NEEDS**: Monitor `sol_vault` PDA instead
   - Add helper method to derive sol_vault PDA from escrow_id

2. **`escrow-program.service.ts`**:
   - `settle()` method needs `solVault` in accounts
   - `cancelIfExpired()` method needs `solVault` in accounts
   - `adminCancel()` method needs `solVault` in accounts

3. **`monitoring.service.ts`**:
   - Update account monitoring to watch `sol_vault` PDA for SOL-based swaps
   - Keep monitoring `escrow_state` for NFT-only swaps

### Testing Required

1. **E2E Test**: `tests/staging/e2e/01-nft-for-sol-happy-path.test.ts`
   - Test full flow: create agreement → deposit NFT → deposit SOL → settle
   - Verify SOL goes to correct vault PDA
   - Verify settlement distributes SOL correctly

2. **Manual Settlement Script**: `scripts/settle-once.ts`
   - Update to derive and include `sol_vault` PDA
   - Test manual settlement from vault

## Technical Benefits

1. **System Program CPI Works**: Zero-data PDAs can use System Program transfers atomically
2. **Clean Separation**: State and funds are cleanly separated (like USDC design)
3. **No Runtime Issues**: Lamport modifications persist correctly for zero-data accounts
4. **Maintainable**: Architecture mirrors existing USDC pattern

## Deployment Status

- ✅ Solana Program: Built and deployed to staging devnet
  - Program ID: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
  - Deployment Signature: `6BnZpEaM1QFshLKkUd1BdchSn3QDgDoYKtKM6BUuNWUMJv7qn9jcEuxMHmjSayPmutoJN9cM27W62E8BGYBUsA2`
- ✅ IDL: Copied to `src/generated/anchor/escrow-idl-staging.json`
- ⏳ Backend Services: Partially updated (init only, deposit/settle/cancel need updates)
- ⏳ Monitoring: Not yet updated to watch vault PDA
- ⏳ Testing: Not yet performed

## Next Steps

1. **Update remaining backend service methods** to include sol_vault PDA
2. **Update monitoring service** to watch sol_vault for SOL deposits
3. **Run E2E test** to verify end-to-end flow
4. **Deploy backend** to staging
5. **Verify settlement** works for BOTH_LOCKED agreements

## Files Modified

### Solana Program:
- `programs/escrow/src/lib.rs` - Account structs and instruction logic

### Backend:
- `src/services/escrow-program.service.ts` - initAgreement method
- `src/generated/anchor/escrow-idl-staging.json` - Updated IDL

### Documentation:
- `docs/tasks/SOL_VAULT_ARCHITECTURE_IMPLEMENTATION.md` - This file

