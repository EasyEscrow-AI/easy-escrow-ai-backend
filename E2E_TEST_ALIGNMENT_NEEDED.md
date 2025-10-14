# E2E Test Alignment Issue

## Problem

The E2E devnet test (`tests/e2e/devnet-e2e.test.ts`) was written for a different program interface than what's currently deployed on devnet.

## Current Deployed Program Interface

**Program ID**: `7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV`

**init_agreement instruction**:
```rust
pub fn init_agreement(
    ctx: Context<InitAgreement>,
    escrow_id: u64,
    usdc_amount: u64,         // <-- Takes USDC amount
    expiry_timestamp: i64
) -> Result<()>
```

**Accounts**:
- `escrow_state` (PDA, writable)
- `buyer` (signer, writable)
- `seller`
- `nft_mint`
- `admin`
- `system_program`

## Test Code Expectation

The test was written expecting:
```typescript
.initAgreement(escrowId, testNftMint, nftPrice, expiry)
//                        ^^^^^^^^^^^^  ^^^^^^^^
//                        Takes NFT mint and price as separate args
```

With account structure:
```typescript
{
  seller: testWallets.seller.publicKey,
  escrowState,  // <-- camelCase
  usdcMint,     // <-- Includes usdcMint
  nftMint,
  usdcVault,    // <-- Includes vault accounts
  nftVault,
  // ...
}
```

## Differences

1. **Parameter mismatch**: 
   - Deployed: `(escrow_id, usdc_amount, expiry_timestamp)`
   - Test expects: `(escrow_id, nft_mint, nft_price, expiry)`

2. **Account naming**:
   - Deployed uses `snake_case`: `escrow_state`, `buyer`, etc.
   - Test uses `camelCase`: `escrowState`, `usdcVault`, etc.

3. **Account structure**:
   - Deployed does NOT include `usdcVault` and `nftVault` in init
   - Test expects vault accounts in initialization

4. **TypeScript target**:
   - Fixed: Updated tsconfig.json to ES2020 for BigInt support

## Solutions

### Option 1: Update Test to Match Current Program ✅ RECOMMENDED
Rewrite the E2E test to match the actual deployed program interface:
- Use correct parameter order: `(escrow_id, usdc_amount, expiry_timestamp)`
- Use snake_case account names: `escrow_state`, `buyer_usdc_account`, etc.
- Remove vault accounts from init (they're created by deposit instructions)
- Match the actual IDL from `target/idl/escrow.json`

### Option 2: Redeploy Program to Match Test
Update and redeploy the Solana program to match the test expectations. This would require:
- Modifying the Rust program
- Rebuilding and redeploying to devnet
- Updating the program ID in all references

## Recommended Action

**Update the E2E test** to match the currently deployed program. This is safer and faster than redeploying.

### Steps:
1. Read the actual IDL: `target/idl/escrow.json`
2. Update test method calls to match exact signatures
3. Use correct account names (snake_case)
4. Test with simple scenarios first
5. Expand to full E2E scenarios

## Current Status

- ✅ Fixed TypeScript compilation (ES2020 support)
- ❌ Test code doesn't match deployed program interface
- ⏳ Need to align test with actual program

## Files to Update

- `tests/e2e/devnet-e2e.test.ts` - Main test file
- Possibly create a simpler version first to validate approach

## Next Steps

1. Create a simplified test that works with current program
2. Validate it runs successfully on devnet
3. Expand to full E2E scenarios
4. Update documentation

---

**Date**: October 14, 2025  
**Issue**: Program interface mismatch  
**Priority**: High - Blocks E2E testing

