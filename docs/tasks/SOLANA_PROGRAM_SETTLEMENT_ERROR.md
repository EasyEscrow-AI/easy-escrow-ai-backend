# Solana Program Settlement Error

**Date:** 2025-11-06  
**Environment:** Staging (Devnet)  
**Error:** Settlement transaction simulation fails with balance mismatch

## Status: NEW ISSUE DISCOVERED

After fixing the monitoring service issues, we discovered that the actual Solana program settlement instruction is failing.

## Error Details

```
Transaction simulation failed: Error processing Instruction 0: 
sum of account balances before and after instruction do not match
```

**Full Error from Logs:**
```
[EscrowProgramService] Settlement failed: SendTransactionError: Simulation failed. 
Message: Transaction simulation failed: Error processing Instruction 0: sum of account balances before and after instruction do not match. 
```

## Evidence: Settlement IS Being Attempted

✅ **Monitoring Service Working:**
```
[MonitoringService] Now monitoring 0 accounts → (correctly stops after deposit detected)
```

✅ **Status Update Working:**
```
Agreement Status: BOTH_LOCKED
```

✅ **Settlement Detection Working:**
```
[SettlementService] Found 1 agreements ready to settle
[SettlementService] Processing settlement for agreement: AGR-MHMOEWRX-9IFMBQ3D
```

✅ **Settlement Execution Attempt:**
```
[SettlementService] V2 Fee calculation: {
  solAmount: '100000000',
  feeBps: 100,
  platformFee: '1000000',
  creatorRoyalty: '0',
  sellerReceived: '99000000'
}
[SettlementService] V2 Settlement parties: {
  escrowPda: '9iJ9C9paUrnuhdSGRzJX1HWJAiUcG7wJ92ESRnb4UpA5',
  seller: 'AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z',
  ...
}
[EscrowProgramService] Settlement transaction signed, sending to network...
```

❌ **But Then Fails On-Chain:**
```
[EscrowProgramService] Settlement failed: SendTransactionError
```

## Possible Causes

### 1. Rent Calculation Issue
- Solana program might not be properly accounting for rent exemption
- Balance before/after mismatch often indicates rent calculation error
- Need to verify rent-exempt minimum is correctly calculated

### 2. Incorrect Account Provided
- One or more accounts passed to the settlement instruction might be wrong
- Could be:
  - Escrow PDA derivation
  - NFT token accounts
  - SOL system accounts
  - Fee collector account

### 3. Fee Distribution Logic Error
- On-chain program might have incorrect fee calculation
- Platform fee (1%) = 1,000,000 lamports (0.001 SOL)
- Seller should receive 99,000,000 lamports (0.099 SOL)
- Mismatch between backend calculation and program calculation

### 4. Program State Mismatch
- The on-chain escrow state might not match what backend expects
- Could be:
  - SOL not actually deposited on-chain
  - NFT not locked correctly
  - Escrow flags not set properly

## Verification Needed

1. **Check On-Chain Escrow State:**
   ```
   Escrow PDA: 9iJ9C9paUrnuhdSGRzJX1HWJAiUcG7wJ92ESRnb4UpA5
   ```
   - Verify SOL balance (should have 100,000,000 lamports)
   - Verify escrow account data shows both deposits locked
   - Check escrow account owner (should be the program)

2. **Check NFT Lock:**
   ```
   NFT Deposit Address: 5J8ao7Fby92ZyEnBZLq1F8Ebgg5yVM1f8j7sQcscQHgM
   ```
   - Verify NFT is actually in escrow's token account
   - Check token account balance = 1

3. **Review Solana Program Code:**
   - Check `settle_v2` instruction in Anchor program
   - Verify balance calculations
   - Ensure all account constraints are correct

## Workaround

None available - this is a Solana program issue that needs to be fixed in the on-chain code.

## Next Steps

1. **Inspect on-chain state** using Solana Explorer for escrow PDA
2. **Review Anchor program** `settle_v2` instruction logic
3. **Test with simplified scenario** - possibly the issue only occurs with specific fee/royalty combinations
4. **Check program logs** - simulation should provide more detailed logs via `getLogs()`
5. **Compare with working examples** - check if there are any successful settlements in prod/staging

## Related Files

- `src/services/escrow-program.service.ts` - Settlement instruction call
- `src/services/settlement.service.ts` - Settlement orchestration
- Anchor program: `programs/easy-escrow/src/instructions/settle_v2.rs` (if accessible)

## Impact

🔴 **BLOCKING:** NFT-for-SOL swaps cannot complete until this is fixed  
✅ Agreement creation works  
✅ Deposit detection works  
✅ Status updates work  
❌ Settlement fails on-chain

## Priority

**CRITICAL** - Core functionality is broken for NFT-for-SOL swap type on staging/devnet.

