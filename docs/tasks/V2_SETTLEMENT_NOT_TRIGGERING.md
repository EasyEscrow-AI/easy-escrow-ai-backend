# V2 Settlement Not Triggering - Diagnostic Report

**Date:** 2025-11-05  
**Test:** 01-v2-nft-for-sol-happy-path.test.ts  
**Agreement ID:** AGR-MHLAWDB8-A86V7SKK  
**Escrow PDA:** 23jpcBcbaBHKtb8e7vzEbZB8XJhsPmWvC1c9T6B9tzit  

## Issue Summary

Settlement service is **NOT triggering** for v2 NFT_FOR_SOL agreements that reach `BOTH_LOCKED` status.

## What's Working ✅

1. **Agreement Creation:** ✅ Successfully creates v2 NFT_FOR_SOL agreement
   - Transaction: `5yc5dpuiRirg33qDTWfdErkqN6WrPaG59p3jFLBFCQ9KuRydVmngzAgkfWYdppUGw8NnPY5ZXbyfVVMckK6WQbSF`
   - Escrow PDA: `23jpcBcbaBHKtb8e7vzEbZB8XJhsPmWvC1c9T6B9tzit`

2. **NFT Deposit:** ✅ Seller successfully deposits NFT
   - Transaction: `2KjwQrn7K7k44y88H7f59tpw2V4Mcy38UGMQXoaD1oMpSWKqPEjsvGAGwG55AXfcYzAn3JKCdyuoSBjWmKt2WLwf`
   - Status updated to: `NFT_LOCKED`

3. **SOL Deposit:** ✅ Buyer successfully deposits SOL (0.1 SOL / 100M lamports)
   - Transaction: `2LUDRSg3peWd6x1oSzSNqqDhy6CRcbCAnt3LQQZMWyvSq9GHttvfHRiXswa68LiAdqJepjrnXqiQge77ATQRSxGP`
   - Status updated to: `BOTH_LOCKED`

4. **Status Detection:** ✅ Agreement reaches `BOTH_LOCKED` status

## What's NOT Working ❌

1. **Settlement Detection:** ❌ Settlement service does not detect the `BOTH_LOCKED` agreement
2. **Settlement Execution:** ❌ No settlement transaction is submitted
3. **Status Transition:** ❌ Agreement remains stuck at `BOTH_LOCKED` for 120+ polling attempts (2+ minutes)

## Deployment Status

### Smart Contract (Solana Program)
- **Program ID:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- **Last Deployed:** Slot 419367768
- **Upgrade Authority:** `CPDz3pC5AnK7es3oEcP52HLhByPSAWG6f9QGP6j4jjEA`
- **Fixes Applied:**
  - ✅ RefCell fix (single escrow_account reference)
  - ✅ Permissionless settle_v2
  - ✅ Manual lamport transfers with rent-exempt preservation
  - ✅ Checked arithmetic

### Backend (DigitalOcean App Platform)
- **Environment:** Staging
- **URL:** `https://easyescrow-backend-staging-mwx9s.ondigitalocean.app`
- **Last Deployed:** Latest commit with updated IDL
- **IDL:** Updated to match deployed program

## Settlement Service Configuration

**Expected Behavior:**
- Polling interval: 3 seconds (devnet/staging)
- Query: Find agreements with status `BOTH_LOCKED`
- Action: Execute `settleV2` instruction with admin keypair

**Code Location:** `src/services/settlement.service.ts`

### Key Methods:
1. `checkAndSettleAgreements()` - Main polling loop
2. `executeSettlement()` - Routes to v1 or v2 settlement
3. `executeSettlementV2()` - Orchestrates v2 settlement
4. `executeOnChainSettlementV2()` - Calls `escrowProgramService.settleV2()`

## Possible Root Causes

### 1. Settlement Service Not Running
**Symptoms:**
- No settlement attempts logged
- Polling not happening

**Check:**
```bash
# In DigitalOcean Runtime Logs, search for:
"[SettlementService] Starting settlement service"
"[SettlementService] Checking for agreements ready to settle"
```

**Expected Output (every 3 seconds):**
```
[SettlementService] Checking for agreements ready to settle...
[SettlementService] Found X agreements ready to settle
```

### 2. Database Query Not Finding Agreement
**Symptoms:**
- Polling happens but finds 0 agreements
- Agreement exists but is not returned by query

**Check:**
```bash
# In DigitalOcean Runtime Logs, search for:
"[SettlementService] Found 0 agreements ready to settle"
```

**Query Logic:**
```typescript
const agreements = await prisma.agreement.findMany({
  where: {
    status: AgreementStatus.BOTH_LOCKED,
    // ... other conditions
  }
});
```

**Verify:**
- Agreement status is exactly `BOTH_LOCKED` (not a variant)
- No additional filters blocking the query
- Database connection is healthy

### 3. Settlement Execution Failing Silently
**Symptoms:**
- Agreement is found
- Settlement is attempted
- But transaction fails and error is swallowed

**Check:**
```bash
# In DigitalOcean Runtime Logs, search for:
"[SettlementService] Processing settlement for agreement: AGR-MHLAWDB8-A86V7SKK"
"[SettlementService] Executing settlement for agreement"
"[SettlementService] V2 settlement failed"
"[EscrowProgramService] V2 settlement failed"
```

**Common Errors:**
- Smart contract simulation errors
- Insufficient lamports for tx fees
- Authority mismatch
- RefCell borrow errors

### 4. IDL Mismatch
**Symptoms:**
- Backend calls instruction that doesn't exist
- Instruction signature mismatch

**Check:**
```bash
# In logs, search for:
"Invalid instruction"
"Unknown instruction"
"Account mismatch"
```

**Verify:**
- `src/generated/anchor/escrow-idl-staging.json` matches deployed program
- IDL address field: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- IDL contains `settleV2` instruction

### 5. Admin Keypair Issues
**Symptoms:**
- Settlement attempts but fails authorization
- "Unauthorized" errors

**Check:**
```bash
# In logs, search for:
"Unauthorized"
"Invalid signer"
```

**Verify:**
- `DEVNET_STAGING_ADMIN_PRIVATE_KEY` env var is set correctly in DigitalOcean
- Admin wallet has sufficient SOL for tx fees
- Admin wallet matches expected address: `498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R`

## Debugging Steps

### Step 1: Check Settlement Service is Running
```bash
# Search DigitalOcean logs for:
"[SettlementService] Starting settlement service"
```

**If NOT found:**
- Settlement service failed to start
- Check for initialization errors
- Verify environment variables

**If found:**
- Proceed to Step 2

### Step 2: Check Polling is Happening
```bash
# Search logs for (should appear every 3 seconds):
"[SettlementService] Checking for agreements ready to settle"
```

**If NOT found:**
- Polling loop crashed
- Check for uncaught errors in settlement service

**If found:**
- Check the count: "Found X agreements"
- If X = 0, proceed to Step 3
- If X > 0, proceed to Step 4

### Step 3: Check Database Query
```bash
# Search logs for:
"[SettlementService] Found 0 agreements ready to settle"
```

**If found:**
- Agreement exists but query is not finding it
- Possible causes:
  1. Status is not exactly "BOTH_LOCKED"
  2. Additional query filters excluding it
  3. Database replication lag

**Action:**
- Manually query database:
```sql
SELECT id, status, "swapType", "createdAt"
FROM "Agreement"
WHERE id = 'AGR-MHLAWDB8-A86V7SKK';
```

### Step 4: Check Settlement Execution
```bash
# Search logs for:
"[SettlementService] Processing settlement for agreement: AGR-MHLAWDB8-A86V7SKK"
```

**If found:**
- Settlement was attempted
- Check for errors immediately after:
```bash
"[SettlementService] V2 settlement failed"
"[EscrowProgramService] V2 settlement failed"
"SendTransactionError"
```

**If NOT found:**
- Agreement was found but execution never started
- Check for filter/skip logic in settlement service

### Step 5: Check On-Chain Transaction Simulation
```bash
# If settlement was attempted, check for:
"Transaction simulation failed"
"Program log:"
```

**Common Smart Contract Errors:**
- "sum of account balances before and after instruction do not match" → RefCell issue
- "Transfer: `from` must not carry data" → PDA transfer issue
- "insufficient lamports" → Fee collector or escrow account underfunded
- "AnchorError thrown" → Check error code and message

## Expected Log Flow (Successful Settlement)

```
[SettlementService] Checking for agreements ready to settle...
[SettlementService] Found 1 agreements ready to settle
[SettlementService] Processing settlement for agreement: AGR-MHLAWDB8-A86V7SKK
[SettlementService] Executing settlement for agreement AGR-MHLAWDB8-A86V7SKK
[SettlementService] Detected V2 agreement (NFT_FOR_SOL), using V2 settlement flow
[SettlementService] Executing V2 settlement for agreement AGR-MHLAWDB8-A86V7SKK
[SettlementService] V2 Fee calculation: {...}
[SettlementService] Executing V2 (SOL-based) on-chain settlement...
[EscrowProgramService] Settling V2 escrow: {...}
[EscrowProgramService] Token accounts: {...}
[EscrowProgramService] V2 settlement transaction signed, sending to network...
[EscrowProgramService] Sending via regular RPC (devnet)
[EscrowProgramService] V2 settlement transaction complete: <TX_SIGNATURE>
[SettlementService] V2 on-chain settlement successful: <TX_SIGNATURE>
[SettlementService] Creating settlement record in database...
[SettlementService] Settlement record created: <SETTLEMENT_ID>
[SettlementService] Updating agreement status to SETTLED...
[SettlementService] V2 settlement completed successfully for AGR-MHLAWDB8-A86V7SKK
```

## Rate Limiting Impact

**Note:** E2E test hit 429 errors after 98 polling attempts, which prevented further status checks.

**Impact on Diagnosis:**
- Cannot verify final agreement status via API
- May have settled after 429 errors occurred
- Need to check logs directly

**Recommendation:**
- Check logs for settlement success AFTER 429 errors
- Verify on-chain via explorer: https://explorer.solana.com/address/23jpcBcbaBHKtb8e7vzEbZB8XJhsPmWvC1c9T6B9tzit?cluster=devnet

## On-Chain Verification

**Escrow PDA:** `23jpcBcbaBHKtb8e7vzEbZB8XJhsPmWvC1c9T6B9tzit`

### Check Current State:
```bash
solana account 23jpcBcbaBHKtb8e7vzEbZB8XJhsPmWvC1c9T6B9tzit --url devnet
```

**If account exists:**
- Settlement has NOT happened (escrow should close after settlement)

**If account does NOT exist:**
- Settlement MAY have happened (account closed)
- Check tx history for settlement transaction

### Check Transaction History:
https://explorer.solana.com/address/23jpcBcbaBHKtb8e7vzEbZB8XJhsPmWvC1c9T6B9tzit?cluster=devnet

**Look for:**
- `settle_v2` instruction
- NFT transfer to buyer
- SOL transfer to seller
- SOL transfer to fee collector

## Next Steps

1. **Check DigitalOcean Runtime Logs:**
   - Navigate to: App Platform → Backend App → Runtime Logs
   - Search for: `[SettlementService]`
   - Identify which step is failing (use debugging steps above)

2. **Verify On-Chain State:**
   - Check if escrow PDA still exists
   - Check NFT location (seller vs buyer)
   - Check SOL balances

3. **Manual Settlement Test:**
   - If settlement service is broken, try manual settlement via CLI:
   ```bash
   # This would require creating a script to call settle_v2 directly
   ```

4. **Database Direct Query:**
   - Connect to staging DB via `DATABASE_ADMIN_URL`
   - Query agreement status directly
   - Verify deposits are recorded

5. **Fix and Redeploy:**
   - Once root cause is identified, apply fix
   - Redeploy backend to staging
   - Retest with new agreement

## Related Files

- **Settlement Service:** `src/services/settlement.service.ts`
- **Escrow Program Service:** `src/services/escrow-program.service.ts`
- **Smart Contract:** `programs/escrow/src/lib.rs`
- **IDL:** `src/generated/anchor/escrow-idl-staging.json`
- **E2E Test:** `tests/staging/e2e/01-v2-nft-for-sol-happy-path.test.ts`

## Timeline

- **01:10:05** - Agreement created
- **01:10:15** - NFT deposited (status: NFT_LOCKED)
- **01:10:28** - SOL deposited (status: BOTH_LOCKED)
- **01:10:30** - Settlement polling begins
- **01:12:30** - 120 polling attempts (2 minutes) - NO SETTLEMENT
- **01:12:30** - 429 rate limit errors prevent further status checks
- **01:13:58** - Manual API check hits rate limit

## Conclusion

The v2 settlement flow is **completely broken** on staging. All deposits work correctly, status transitions to `BOTH_LOCKED` as expected, but the settlement service either:

1. Is not running
2. Is not finding the agreement
3. Is failing silently during execution

**USER ACTION REQUIRED:**
Check DigitalOcean Runtime Logs to identify which of the above scenarios is occurring.

Without log access, further diagnosis is blocked.

