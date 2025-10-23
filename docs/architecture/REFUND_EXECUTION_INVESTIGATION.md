# Refund Execution Investigation

**Date:** 2025-10-23  
**Test:** `tests/staging/e2e/02-agreement-expiry-refund.test.ts`  
**Issue:** NFT refunds are logged in database but not executed on-chain

---

## TL;DR

**Root Cause:** The `RefundService.processDepositRefund()` method currently generates **mock transaction IDs** instead of executing actual on-chain refund transactions.

**Status:** ⚠️ **TODO Item** - On-chain refund execution not yet implemented

**Impact:** 
- ✅ Database correctly tracks refund intent
- ✅ Webhooks are triggered
- ✅ Agreement status changes to REFUNDED
- ❌ Assets remain locked in escrow (not returned to depositors)

---

## Investigation Details

### Test Behavior

**Test File:** `tests/staging/e2e/02-agreement-expiry-refund.test.ts`

**Observed Behavior:**
```typescript
// After manual refund trigger
console.log(`   ✅ Refund processed successfully`);
console.log(`   Refunded 1 deposit(s)`);

// But NFT balance check shows:
console.log(`   Final sender NFT balance: 0`);
console.log(`   ℹ️  NFT still in escrow (on-chain refund execution pending)`);
```

**What Happens:**
1. Agreement expires
2. ExpiryService marks status as `EXPIRED` ✅
3. RefundService.processRefunds() is called ✅
4. Mock transaction ID is generated: `refund_NFT_1761262841920_f9glf` ⚠️
5. Database deposit marked as refunded ✅
6. Agreement status updated to `REFUNDED` ✅
7. **NFT remains in escrow PDA** ❌

---

## Code Analysis

### Current Implementation

**File:** `src/services/refund.service.ts`

**Lines 344-366:**
```typescript
private async processDepositRefund(
  agreementId: string,
  depositId: string,
  type: DepositType,
  depositor: string,
  amount?: string,
  tokenAccount?: string | null
): Promise<string> {
  console.log(`[RefundService] Processing ${type} refund for deposit ${depositId}`);

  try {
    // TODO: Implement actual on-chain refund transactions
    // For now, return mock transaction ID
    const mockTxId = `refund_${type}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log(`[RefundService] Refund transaction created:`, {
      depositId,
      type,
      depositor,
      amount: amount || 'N/A',
      txId: mockTxId,
    });

    // TODO: Call actual on-chain refund/cancel instruction
    // await this.executeOnChainRefund(...)

    return mockTxId;
  } catch (error) {
    throw error;
  }
}
```

**Key Finding:** Line 355-357 contains the TODO comment indicating on-chain execution is not implemented.

---

## Available On-Chain Methods

The `EscrowProgramService` already has the required methods for on-chain cancellation/refunds:

### 1. cancelIfExpired()

**File:** `src/services/escrow-program.service.ts:726-761`

**Purpose:** Cancel expired agreements and return assets to depositors

**Method Signature:**
```typescript
async cancelIfExpired(
  escrowPda: PublicKey,
  buyer: PublicKey,
  seller: PublicKey,
  nftMint: PublicKey,
  usdcMint: PublicKey
): Promise<string>
```

**What it does:**
- Calls the `cancelIfExpired` instruction on the Solana program
- Returns USDC to buyer's account
- Returns NFT to seller's account
- Closes escrow PDA

**On-Chain Instruction:** `cancel_if_expired`

---

### 2. adminCancel()

**File:** `src/services/escrow-program.service.ts:766-803`

**Purpose:** Emergency admin cancellation

**Method Signature:**
```typescript
async adminCancel(
  escrowPda: PublicKey,
  buyer: PublicKey,
  seller: PublicKey,
  nftMint: PublicKey,
  usdcMint: PublicKey
): Promise<string>
```

**What it does:**
- Admin-initiated cancellation
- Returns assets to original depositors
- Requires admin keypair signature

**On-Chain Instruction:** `admin_cancel`

---

## Implementation Requirements

### Step 1: Update RefundService

**File:** `src/services/refund.service.ts`

**Changes Needed:**

```typescript
private async processDepositRefund(
  agreementId: string,
  depositId: string,
  type: DepositType,
  depositor: string,
  amount?: string,
  tokenAccount?: string | null
): Promise<string> {
  console.log(`[RefundService] Processing ${type} refund for deposit ${depositId}`);

  try {
    // Get agreement details
    const agreement = await prisma.agreement.findUnique({
      where: { agreementId },
    });

    if (!agreement) {
      throw new Error(`Agreement ${agreementId} not found`);
    }

    // Get EscrowProgramService
    const { EscrowProgramService } = await import('./escrow-program.service');
    const escrowService = new EscrowProgramService();

    // Prepare parameters
    const escrowPda = new PublicKey(agreement.escrowPda);
    const buyer = new PublicKey(agreement.buyer!);
    const seller = new PublicKey(agreement.seller);
    const nftMint = new PublicKey(agreement.nftMint);
    const usdcMint = new PublicKey(process.env.USDC_MINT_ADDRESS!);

    // Execute on-chain cancellation
    let txId: string;
    
    if (agreement.status === AgreementStatus.EXPIRED) {
      // Use cancelIfExpired for expired agreements
      txId = await escrowService.cancelIfExpired(
        escrowPda,
        buyer,
        seller,
        nftMint,
        usdcMint
      );
    } else {
      // Use adminCancel for other cancellation scenarios
      txId = await escrowService.adminCancel(
        escrowPda,
        buyer,
        seller,
        nftMint,
        usdcMint
      );
    }

    console.log(`[RefundService] On-chain refund transaction:`, txId);

    return txId;
  } catch (error) {
    console.error(`[RefundService] On-chain refund failed:`, error);
    throw error;
  }
}
```

---

### Step 2: Handle Partial Deposits

**Challenge:** Agreement may have only NFT or only USDC deposited.

**Solution:** The on-chain program should handle partial deposits gracefully:
- If only NFT deposited → Return NFT to seller
- If only USDC deposited → Return USDC to buyer
- If both deposited → Return both to respective owners

**Validation Needed:**
```typescript
// Before calling cancel, verify which assets are actually in escrow
const deposits = await prisma.deposit.findMany({
  where: {
    agreementId,
    status: DepositStatus.CONFIRMED,
  },
});

const hasUsdcDeposit = deposits.some(d => d.type === DepositType.USDC);
const hasNftDeposit = deposits.some(d => d.type === DepositType.NFT);

// Call appropriate cancel method based on deposit state
```

---

### Step 3: Error Handling

**Scenarios to Handle:**

1. **On-chain transaction fails**
   - Keep database status consistent
   - Retry logic with exponential backoff
   - Alert admin if repeated failures

2. **Partial execution**
   - Track which assets were refunded
   - Allow retry for failed assets

3. **Network issues**
   - Transaction submitted but confirmation lost
   - Check on-chain state before retry

**Implementation:**
```typescript
try {
  const txId = await escrowService.cancelIfExpired(...);
  
  // Wait for confirmation
  await connection.confirmTransaction(txId, 'confirmed');
  
  // Verify assets were actually returned
  await this.verifyRefundExecution(agreementId, deposits);
  
  return txId;
} catch (error) {
  // Log error and mark refund as failed
  await this.markRefundFailed(depositId, error);
  throw error;
}
```

---

## Testing Considerations

### Unit Tests

**File:** `tests/unit/refund.service.test.ts`

**Test Cases Needed:**
- ✅ Calculate refunds correctly
- ✅ Check eligibility correctly
- ⚠️ Execute on-chain refunds (currently mocked)
- ⚠️ Handle partial deposits
- ⚠️ Handle transaction failures
- ⚠️ Verify asset return on-chain

### Integration Tests

**Test Scenarios:**
1. Expired agreement with NFT only → NFT returned to seller
2. Expired agreement with USDC only → USDC returned to buyer
3. Expired agreement with both → Both returned
4. Admin cancellation → Assets returned immediately
5. Failed transaction → Proper error handling and retry

### E2E Tests

**Current Test:** `tests/staging/e2e/02-agreement-expiry-refund.test.ts`

**What to Add:**
```typescript
// After manual refund processing
await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for on-chain confirmation

// Verify NFT actually returned
const finalNftBalance = await getTokenBalance(connection, expiryNft.tokenAccount);
expect(finalNftBalance).toBe(initialNftBalance); // Should be 1

// Verify escrow PDA no longer has NFT
const escrowNftBalance = await getTokenBalance(
  connection, 
  new PublicKey(expiryAgreement.depositAddresses.nft)
);
expect(escrowNftBalance).toBe(0); // Should be empty
```

---

## On-Chain Program Verification

### Check Program Instructions

**File:** `programs/escrow/src/lib.rs`

**Verify these instructions exist and work correctly:**

1. **cancel_if_expired**
   - Checks if agreement is expired
   - Returns USDC to buyer (if deposited)
   - Returns NFT to seller (if deposited)
   - Closes escrow PDA

2. **admin_cancel**
   - Admin signature required
   - Emergency cancellation
   - Returns assets to depositors
   - Closes escrow PDA

**Example Expected Behavior:**
```rust
pub fn cancel_if_expired(ctx: Context<CancelIfExpired>) -> Result<()> {
    let escrow = &ctx.accounts.escrow_state;
    
    // Verify expiry
    require!(
        Clock::get()?.unix_timestamp > escrow.expiry_timestamp,
        ErrorCode::AgreementNotExpired
    );
    
    // Return USDC to buyer if deposited
    if escrow.usdc_locked {
        transfer_usdc_from_escrow_to_buyer(ctx)?;
    }
    
    // Return NFT to seller if deposited
    if escrow.nft_locked {
        transfer_nft_from_escrow_to_seller(ctx)?;
    }
    
    // Close escrow account
    close_escrow_account(ctx)?;
    
    Ok(())
}
```

---

## Implementation Priority

### Phase 1: Basic Implementation (High Priority)
- ✅ Update `processDepositRefund()` to call on-chain methods
- ✅ Handle expired agreements with `cancelIfExpired()`
- ✅ Add basic error handling
- ✅ Update E2E test to verify on-chain execution

### Phase 2: Robustness (Medium Priority)
- ⚠️ Implement retry logic for failed transactions
- ⚠️ Add transaction confirmation waiting
- ⚠️ Verify asset return on-chain
- ⚠️ Handle partial deposit scenarios

### Phase 3: Advanced Features (Low Priority)
- ⚠️ Admin dashboard for failed refunds
- ⚠️ Automatic retry scheduler
- ⚠️ Detailed refund analytics
- ⚠️ Multi-signature support for large refunds

---

## Current Workaround

For testing purposes, the current mock implementation works for:
- ✅ Database state tracking
- ✅ API response structure
- ✅ Webhook delivery
- ✅ Status transitions

**Limitation:** Assets remain locked in escrow until on-chain execution is implemented.

---

## Related Files

**Service Layer:**
- `src/services/refund.service.ts` - Refund orchestration
- `src/services/escrow-program.service.ts` - On-chain program interface
- `src/services/expiry-cancellation-orchestrator.service.ts` - Background processing

**On-Chain Program:**
- `programs/escrow/src/lib.rs` - Anchor program
- `programs/escrow/src/instructions/cancel_if_expired.rs` (if separate file)
- `programs/escrow/src/instructions/admin_cancel.rs` (if separate file)

**Tests:**
- `tests/unit/refund.service.test.ts` - Unit tests
- `tests/staging/e2e/02-agreement-expiry-refund.test.ts` - E2E tests

---

## Next Steps

1. **Immediate:**
   - Review on-chain program's `cancel_if_expired` instruction
   - Verify it handles partial deposits correctly
   - Test on devnet manually

2. **Implementation:**
   - Update `processDepositRefund()` method
   - Add on-chain transaction execution
   - Update E2E test to verify assets returned

3. **Validation:**
   - Run full test suite
   - Verify on staging environment
   - Check Solana explorer for transactions

4. **Documentation:**
   - Update API docs with actual transaction IDs
   - Document refund execution flow
   - Add troubleshooting guide

---

## Questions to Answer

- ❓ Does the on-chain program handle partial deposits (NFT only or USDC only)?
- ❓ What happens if cancellation fails mid-execution (USDC returned but NFT fails)?
- ❓ Is there a timeout mechanism for stuck refunds?
- ❓ Should we add admin approval for large refunds?
- ❓ How do we handle rent reclamation from closed escrow PDAs?

---

## Conclusion

The refund system is **architecturally sound** but missing the critical **on-chain execution** component. The infrastructure is in place:

✅ Expiry detection works  
✅ Database tracking works  
✅ API endpoints work  
✅ On-chain methods exist  
❌ Integration between RefundService and EscrowProgramService needed  

**Estimated Effort:** 4-8 hours for implementation + testing

**Risk Level:** Medium (requires careful handling of on-chain state)

**Recommendation:** Implement Phase 1 (basic implementation) before production launch.

