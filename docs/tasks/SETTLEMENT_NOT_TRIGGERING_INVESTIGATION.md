# Settlement Not Triggering - Investigation

**Date:** 2025-01-06  
**Status:** 🔴 SETTLEMENT BLOCKED  
**Test:** `tests/staging/e2e/01-nft-for-sol-happy-path.test.ts`

## Current Situation

### ✅ What's Working

1. **Program Deployment:** Successfully deployed with all balance mismatch fixes
2. **Agreement Creation:** Works perfectly
3. **NFT Deposit:** Successfully deposits, status changes to `NFT_LOCKED`
4. **SOL Deposit:** Successfully deposits, status changes to `BOTH_LOCKED`
5. **Backend Health:** Backend is live and healthy

### ❌ What's NOT Working

**Settlement never triggers** - Agreement gets stuck at `BOTH_LOCKED` status for 90+ seconds.

## Test Results (Consistent Across 2 Runs)

**Test 1 (Before Backend Redeploy):**
- Agreement: `AGR-MHMQ8W8P-B0MG5SC2`
- Escrow PDA: `JBsW7hsrLGEyQBANeRNXWEamDC9SWMyRRyaKWkECmQLb`
- Result: 30 attempts, all `BOTH_LOCKED`, timeout

**Test 2 (After Backend Redeploy at 11:15:48 AM):**
- Agreement: `AGR-MHMQN7YW-X45S7QBL`
- Escrow PDA: `BZANsRJa5mcBFEwHvgxigTi2LxMDcSvw33twbBzvi7gm`
- Result: 30 attempts, all `BOTH_LOCKED`, timeout

**Consistency:** Both runs show identical behavior - settlement never attempts to run.

## Possible Root Causes

### 1. Monitoring Service Not Running

**Symptoms:**
- Status stays at `BOTH_LOCKED` indefinitely
- No settlement attempts logged
- Backend logs empty or not accessible

**Investigation Needed:**
- Check if `MonitoringService` is initialized on startup
- Verify periodic reload timer (5s interval) is running
- Check if agreements are being loaded into monitoring

### 2. New Rent Exemption Validation Blocking Settlement

**Possible Scenario:**
- Monitoring detects `BOTH_LOCKED`
- Tries to call `settle` instruction
- Rent exemption validation fails
- Error prevents settlement completion
- Error not bubbling up to status

**New Error Codes Added:**
- `InsufficientFeeCollectorRent`
- `InsufficientSellerRent`
- `InsufficientEscrowRent`
- `ExecutableAccountNotAllowed`

**Need to Check:**
- Are these accounts actually rent-exempt?
- Is the validation logic correct?
- Are errors being caught and logged?

### 3. Backend IDL Mismatch

**Possible Issue:**
- Backend IDL was updated
- But instruction name mismatch
- Program calls failing silently

**Verification:**
- Backend has `src/generated/anchor/escrow-idl-staging.json`
- Program deployed: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- On-chain IDL upgraded: `AGVVXgE2Z6WEzSzxhshAW53xuYrajjHT3ot2ekFWFbLM`

### 4. Account Rent Exemption Issue

**Key Question:** Are the accounts actually rent-exempt?

Let me check the accounts involved:

#### Fee Collector: `8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ`
- Current balance: 1.0000 SOL
- Should receive: 0.001 SOL (1% of 0.1 SOL)
- After transfer: 1.001 SOL
- **This should be rent-exempt**

#### Seller: `AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z`
- Current balance: ~16.72 SOL
- Should receive: 0.099 SOL
- After transfer: ~16.82 SOL
- **This should be rent-exempt**

#### Escrow PDA: `BZANsRJa5mcBFEwHvgxigTi2LxMDcSvw33twbBzvi7gm`
- Has ~0.1 SOL deposited + rent-exempt minimum
- After transfer: Rent-exempt minimum only
- **This might be the issue if calculation is wrong**

## Diagnostic Steps Needed

### 1. Check Account Balances On-Chain

```bash
# Check escrow PDA
solana account BZANsRJa5mcBFEwHvgxigTi2LxMDcSvw33twbBzvi7gm --url devnet

# Check fee collector
solana account 8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ --url devnet

# Check seller
solana account AoCpvu92duSVDNNiiQRnQVFrVgopNunx5pYuJp81Z99z --url devnet
```

### 2. Check Escrow State Data

```bash
# View escrow state
solana account BZANsRJa5mcBFEwHvgxigTi2LxMDcSvw33twbBzvi7gm --url devnet --output json
```

Should show:
- `buyer_sol_deposited: true`
- `seller_nft_deposited: true`
- `status: Pending` (on-chain)

### 3. Manually Trigger Settlement

Create a test script to manually call `settle`:

```typescript
// Test script: temp/test-manual-settle.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import idl from '../src/generated/anchor/escrow-idl-staging.json';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const program = new Program(idl, provider);

// Try to settle
const escrowPda = new PublicKey('BZANsRJa5mcBFEwHvgxigTi2LxMDcSvw33twbBzvi7gm');

try {
  const tx = await program.methods
    .settle()
    .accounts({ /* accounts */ })
    .rpc();
  console.log('Settlement succeeded:', tx);
} catch (error) {
  console.error('Settlement failed:', error);
  // This will show us the actual error!
}
```

### 4. Check Backend Monitoring Configuration

Verify in `src/index.ts` or main entry point:

```typescript
// Is MonitoringService initialized?
const monitoringService = new MonitoringService(...);
await monitoringService.start();

// Are agreements being loaded?
```

### 5. Enable Debug Logging

Temporarily increase log level in staging:

```env
LOG_LEVEL=debug
```

This will show:
- `[MonitoringService] Starting periodic agreement reload`
- `[MonitoringService] Reloading pending agreements...`
- `[MonitoringService] Monitoring X accounts`
- `[SettlementService] Attempting settlement for agreement XXX`

## Hypothesis

Based on the consistent behavior across two test runs, my leading hypothesis is:

**The monitoring service is not initializing or not loading agreements properly.**

Reasoning:
1. No settlement attempts = monitoring not detecting the state
2. Status stays at `BOTH_LOCKED` = backend knows about deposits but not triggering settlement
3. Consistent timeout = not a race condition or timing issue
4. Backend deployed successfully = not a deployment issue

**Alternative hypothesis:**

**Settlement is being attempted but failing with rent exemption error that's not being logged or surfaced.**

This would explain:
- Monitoring detects `BOTH_LOCKED`
- Calls `settle` instruction
- Rent validation fails (possibly incorrect calculation)
- Error caught but not changing status
- Agreement remains `BOTH_LOCKED`

## Immediate Action Items

1. **Check if MonitoringService is running:**
   - Add startup log: `console.log('[STARTUP] MonitoringService initialized')`
   - Check this appears in backend logs

2. **Add more logging to settlement attempts:**
   - Log before rent exemption checks
   - Log each validation result
   - Log any errors during settlement

3. **Create manual settlement test script:**
   - Directly call `settle` on the stuck agreement
   - See what error message we get
   - This will immediately tell us if it's rent exemption or something else

4. **Verify escrow PDA balance calculation:**
   - Check actual balance on-chain
   - Compare with expected balance
   - Verify rent-exempt minimum calculation is correct

## Related Files

- `src/services/monitoring.service.ts` - Monitoring logic
- `src/services/settlement.service.ts` - Settlement logic
- `src/services/escrow-program.service.ts` - Program interaction
- `programs/escrow/src/lib.rs` - Solana program (settle instruction)

## Next Steps

1. ⏭️ Create manual settlement test script
2. ⏭️ Check on-chain account balances
3. ⏭️ Add debug logging to monitoring and settlement services
4. ⏭️ Check if rent exemption calculation is correct
5. ⏭️ Re-deploy with enhanced logging if needed

---

**Status:** Investigation in progress. Need to determine if monitoring is running or if settlement is failing with unreported error.

