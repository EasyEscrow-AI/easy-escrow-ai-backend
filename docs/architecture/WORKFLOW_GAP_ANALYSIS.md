# Workflow Gap Analysis: Untracked Escrows

**Date:** October 29, 2025  
**Priority:** 🚨 HIGH  
**Status:** IDENTIFIED - FIXES PROPOSED

---

## Executive Summary

A critical workflow gap has been identified: **Escrows can be created directly on-chain without database tracking**, causing them to be invisible to monitoring and recovery services.

### Impact

- ❌ Untracked escrows expire without automatic refunds
- ❌ Recovery service cannot find them (not in database)
- ❌ Manual intervention required for asset recovery
- ❌ Poor user experience (assets appear "stuck")

### Root Cause

The Solana escrow program's `init_agreement` instruction is **public and unrestricted** - anyone can call it directly without going through our API, bypassing database tracking.

---

## Problem Analysis

### Current Architecture

```
┌─────────────────────────────────────────────────────┐
│           TWO SEPARATE PATHWAYS                     │
└─────────────────────────────────────────────────────┘

PATH 1: Via API (Intended) ✅
┌──────────────┐
│  POST /v1/   │
│  agreements  │
└──────┬───────┘
       │
       v
┌──────────────┐
│ API Endpoint │──► 1. Validate request
└──────┬───────┘    2. Ensure USDC accounts
       │            3. Call init_agreement
       v
┌──────────────┐
│  On-Chain    │──► Escrow PDA created
│  Program     │
└──────┬───────┘
       │
       v
┌──────────────┐
│  PostgreSQL  │──► Agreement stored
│  Database    │    Monitoring started ✅
└──────────────┘


PATH 2: Direct On-Chain (Unintended) ❌
┌──────────────┐
│   Anyone     │
│  with SOL    │
└──────┬───────┘
       │
       v
┌──────────────┐
│  On-Chain    │──► Escrow PDA created
│  Program     │
└──────┬───────┘
       │
       v
       ❌ DATABASE SKIPPED!
       ❌ NO MONITORING!
       ❌ NO RECOVERY!
```

### The Vulnerability

**File:** `programs/escrow/src/lib.rs`

```rust
pub fn init_agreement(
    ctx: Context<InitAgreement>,
    escrow_id: u64,
    usdc_amount: u64,
    expiry_timestamp: i64,
) -> Result<()> {
    // ❌ NO ACCESS CONTROL
    // Anyone can call this!
    let escrow = &mut ctx.accounts.escrow_state;
    
    escrow.escrow_id = escrow_id;
    escrow.buyer = ctx.accounts.buyer.key();
    escrow.seller = ctx.accounts.seller.key();
    escrow.usdc_amount = usdc_amount;
    escrow.nft_mint = ctx.accounts.nft_mint.key();
    escrow.admin = ctx.accounts.admin.key();  // ❌ Any signer can be "admin"
    
    Ok(())
}

#[derive(Accounts)]
pub struct InitAgreement<'info> {
    #[account(
        init,
        payer = admin,  // ❌ Any wallet can pay
        ...
    )]
    pub escrow_state: Account<'info, EscrowState>,
    
    #[account(mut)]
    pub admin: Signer<'info>,  // ❌ No constraint on who admin is!
    
    ...
}
```

**Problems:**
1. ❌ No access control - any wallet can call `init_agreement`
2. ❌ No validation - any wallet can be "admin"
3. ❌ No API requirement - direct blockchain access works
4. ❌ No tracking - database insertion only happens via API

---

## How Untracked Escrows Occur

### Scenario 1: Development/Testing

```bash
# Developer testing on-chain program directly
anchor test

# Or using Solana CLI
solana program invoke <PROGRAM_ID> \
  --instruction init_agreement \
  --args 12345 10000000 1730160000
```

**Result:** Escrow created on-chain, never added to database

### Scenario 2: Pre-Monitoring Era

```
Timeline:
├─ Program deployed
├─ Early escrows created (direct on-chain)
├─ Database integration added
└─ Those early escrows never backfilled
```

### Scenario 3: Third-Party Integration

```
External App/Service
    │
    ├─► Calls program directly
    │   (doesn't know about our API)
    │
    └─► Escrow created
        ❌ Not in our database
```

### Scenario 4: Manual Transactions

```
Advanced user using:
- Phantom wallet direct signing
- Solflare advanced mode
- Custom scripts
- Other wallets with raw transaction support
```

---

## Impact Assessment

### User Experience Impact

**When an untracked escrow expires:**

```
1. User deposits assets into escrow
2. Agreement expires
3. ❌ Automatic refund doesn't happen
4. User contacts support: "My NFT is stuck!"
5. Manual recovery required
6. Poor user experience
```

### Operational Impact

- **Manual Support Load:** Each stuck escrow requires admin intervention
- **Response Time:** Minutes to hours instead of automatic (5-15 minutes)
- **Trust Issues:** Users see "stuck" assets
- **Reputation Risk:** Platform appears unreliable

### Financial Impact

- Admin time spent on manual recovery
- Potential support costs
- User churn from poor experience

---

## Solutions

### 🚀 Immediate: Backfill Tool (IMPLEMENTED)

**Script:** `scripts/utilities/backfill-untracked-escrows.ts`

**Purpose:** Find and track existing untracked escrows

**Usage:**
```bash
# Preview untracked escrows
NODE_ENV=production npx ts-node scripts/utilities/backfill-untracked-escrows.ts --dry-run

# Backfill them
NODE_ENV=production npx ts-node scripts/utilities/backfill-untracked-escrows.ts
```

**Process:**
1. Scan blockchain for all escrow PDAs
2. Check database for tracked escrows
3. Identify untracked escrows
4. Add them to database with derived status
5. Enable monitoring and recovery

---

### 🔒 Short-Term: Access Control (RECOMMENDED)

**Add admin whitelist to on-chain program**

**Implementation:**

```rust
// 1. Add admin whitelist to program
pub mod escrow {
    use super::*;
    
    // Authorized admin address
    declare_id!("HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2");
    
    pub fn init_agreement(
        ctx: Context<InitAgreement>,
        escrow_id: u64,
        usdc_amount: u64,
        expiry_timestamp: i64,
    ) -> Result<()> {
        // ✅ Verify admin is authorized
        require!(
            ctx.accounts.admin.key() == id(),
            EscrowError::UnauthorizedAdmin
        );
        
        // ... rest of logic
    }
}
```

**Pros:**
- ✅ Prevents unauthorized escrow creation
- ✅ Forces all escrows through API
- ✅ Ensures database tracking

**Cons:**
- ⚠️ Requires program upgrade
- ⚠️ May break existing integrations
- ⚠️ Single point of failure (one admin key)

---

### 🏗️ Medium-Term: Event-Driven Indexing (BEST)

**Listen to on-chain events and auto-track**

**Architecture:**

```
┌──────────────┐
│   Solana     │
│  Blockchain  │
└──────┬───────┘
       │
       │ Escrow created event
       v
┌──────────────┐
│   Indexer    │
│   Service    │──► Listens to program logs
└──────┬───────┘   Parses init_agreement events
       │
       v
┌──────────────┐
│  PostgreSQL  │──► Auto-creates database entry
│  Database    │    Starts monitoring
└──────────────┘
```

**Implementation:**

```typescript
// indexer-service.ts
export class EscrowIndexerService {
  async start() {
    // Subscribe to program logs
    this.connection.onLogs(
      this.programId,
      async (logs) => {
        if (logs.logs.includes('Instruction: InitAgreement')) {
          await this.handleNewEscrow(logs);
        }
      }
    );
  }

  private async handleNewEscrow(logs: any) {
    // Parse transaction for escrow details
    const tx = await this.connection.getParsedTransaction(logs.signature);
    
    // Extract escrow PDA and parameters
    const escrowPda = this.extractEscrowPda(tx);
    const params = this.extractEscrowParams(tx);
    
    // Check if already tracked
    const exists = await prisma.agreement.findFirst({
      where: { escrowPda }
    });
    
    if (!exists) {
      // Auto-track new escrow
      await prisma.agreement.create({
        data: {
          agreementId: this.generateId(),
          escrowPda,
          ...params
        }
      });
      
      console.log(`✅ Auto-tracked new escrow: ${escrowPda}`);
    }
  }
}
```

**Pros:**
- ✅ Catches ALL escrows (via API or direct)
- ✅ No program changes needed
- ✅ Automatic backfilling
- ✅ Resilient (if indexer misses one, backfill catches it)

**Cons:**
- ⚠️ Additional service to maintain
- ⚠️ Network latency (event → database)
- ⚠️ Requires RPC with websocket support

---

### 🎯 Long-Term: Hybrid Approach (IDEAL)

**Combine multiple strategies for maximum reliability**

```
Layer 1: Access Control
├─ Whitelist authorized admins
└─ Prevent most unauthorized creation

Layer 2: Event Indexer
├─ Listen for ALL escrow creations
├─ Auto-track any that occur
└─ Catches edge cases

Layer 3: Periodic Backfill
├─ Daily scan for untracked escrows
├─ Safety net for missed events
└─ Audit trail

Layer 4: Monitoring
├─ Alert if untracked escrows found
├─ Track indexer health
└─ Measure tracking coverage
```

---

## Recommendations

### Priority 1: IMMEDIATE (This Week)

1. ✅ **Run backfill tool** to track existing untracked escrows
   ```bash
   NODE_ENV=production npx ts-node scripts/utilities/backfill-untracked-escrows.ts
   ```

2. ✅ **Document the issue** (this document)

3. ✅ **Add manual recovery tools** (already implemented)

### Priority 2: SHORT-TERM (This Month)

4. **Implement access control** in on-chain program
   - Add admin whitelist
   - Update program
   - Test on devnet
   - Deploy to mainnet

5. **Add monitoring** for untracked escrows
   - Alert if backfill finds any
   - Daily automated scan

### Priority 3: MEDIUM-TERM (Next Quarter)

6. **Build event indexer service**
   - Subscribe to program logs
   - Auto-track new escrows
   - Handle missed events gracefully

7. **Add redundancy**
   - Multiple indexer instances
   - Fallback to periodic scanning
   - Health checks

### Priority 4: LONG-TERM (Ongoing)

8. **Monitor and improve**
   - Track indexer coverage
   - Measure recovery success rate
   - Optimize for reliability

---

## Metrics to Track

### Coverage Metrics
- **Total escrows on-chain** - Scan program accounts
- **Total escrows in database** - Count DB entries
- **Coverage rate** - (DB / On-chain) × 100%
- **Target:** 100% coverage

### Performance Metrics
- **Indexer latency** - Time from on-chain → DB
- **Missed events** - Events not caught by indexer
- **Backfill frequency** - How often untracked found
- **Recovery success rate** - % of stuck escrows recovered

### User Experience Metrics
- **Manual recovery requests** - Support tickets
- **Average recovery time** - Time to unstuck
- **User satisfaction** - Post-recovery feedback

---

## Testing Plan

### Test 1: Backfill Existing

```bash
# Preview
NODE_ENV=production npx ts-node scripts/utilities/backfill-untracked-escrows.ts --dry-run

# Execute
NODE_ENV=production npx ts-node scripts/utilities/backfill-untracked-escrows.ts

# Verify
# Check that all on-chain escrows now in database
```

### Test 2: Access Control (After Implementation)

```bash
# Try to create escrow with unauthorized wallet (should fail)
solana program invoke <PROGRAM_ID> \
  --signer unauthorized-wallet.json \
  --instruction init_agreement

# Expected: UnauthorizedAdmin error

# Create via API (should succeed)
curl -X POST https://api.easyescrow.ai/v1/agreements \
  -H "Content-Type: application/json" \
  -d '{...}'

# Expected: 201 Created
```

### Test 3: Event Indexer (After Implementation)

```bash
# Create escrow directly on-chain
solana program invoke ...

# Wait 30 seconds

# Verify it was auto-tracked
psql -c "SELECT * FROM Agreement WHERE escrowPda = '<PDA>';"

# Expected: Entry exists
```

---

## Related Documentation

- [Asset Recovery Guide](../operations/ASSET_RECOVERY_GUIDE.md)
- [Investigation Tool](../../scripts/utilities/investigate-stuck-escrow.ts)
- [Manual Recovery Tool](../../scripts/utilities/manual-recovery.ts)
- [Backfill Tool](../../scripts/utilities/backfill-untracked-escrows.ts)

---

## Conclusion

**Current State:**
- ❌ Untracked escrows can occur
- ✅ Manual recovery tools exist
- ✅ Backfill tool available

**Target State:**
- ✅ 100% escrow tracking
- ✅ Automatic monitoring
- ✅ Zero manual intervention
- ✅ Excellent user experience

**Next Steps:**
1. Run backfill tool (immediate)
2. Implement access control (short-term)
3. Build event indexer (medium-term)
4. Monitor and optimize (ongoing)

---

**Last Updated:** October 29, 2025  
**Version:** 1.0.0  
**Status:** Active Issue - Fixes In Progress

