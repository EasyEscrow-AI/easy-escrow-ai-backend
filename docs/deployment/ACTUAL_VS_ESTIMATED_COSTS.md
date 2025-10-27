# Actual vs Estimated Deployment Costs

**Date:** 2025-10-27  
**Status:** ✅ Verified Against Actual Build

---

## The Key Difference: Program Size

Your research is **100% accurate** for a 250KB program, but your actual built program is **479KB** - nearly twice the size!

### Size Comparison

| Metric | Initial Estimate | Actual Build | Difference |
|--------|-----------------|--------------|------------|
| **Program Size** | 250 KB | **479.33 KB** | +91.7% |
| **Why Larger?** | Estimate | Anchor + SPL deps | Normal |

---

## Cost Breakdown: 250KB vs 479KB

### 1. Program Account Rent (Permanent)

| Size | Formula | Cost |
|------|---------|------|
| **250KB** | (256,000 + 128) × 6,960 | **1.74 SOL** |
| **479KB** | (490,832 + 128) × 6,960 | **3.42 SOL** |
| **Difference** | | **+1.68 SOL** |

### 2. Buffer Account (REFUNDED)

| Size | Formula | Cost |
|------|---------|------|
| **250KB** | (512,000 + 128) × 6,960 | **3.48 SOL** ⚡ Refunded |
| **479KB** | (981,664 + 128) × 6,960 | **6.83 SOL** ⚡ Refunded |
| **Difference** | | **+3.35 SOL** (also refunded) |

### 3. IDL Account Rent (Permanent)

| Size | Formula | Cost |
|------|---------|------|
| **Both** | (20,000 + 128) × 6,960 | **0.14 SOL** |

### 4. Transaction Fees

| Size | Transactions | Cost |
|------|-------------|------|
| **250KB** | ~203 txs × 0.000005 | **0.001 SOL** |
| **479KB** | ~399 txs × 0.000005 | **0.002 SOL** |

### 5. Safety Buffer

| | Cost |
|---|------|
| **Both** | **1.50 SOL** |

---

## Total Cost Comparison

### 250KB Program (Your Research)

| Cost Type | Amount | Refundable? |
|-----------|--------|-------------|
| Program Rent | 1.74 SOL | No ❌ |
| Buffer Rent | 3.48 SOL | **Yes ✅** |
| IDL Rent | 0.14 SOL | No ❌ |
| Transaction Fees | 0.001 SOL | No ❌ |
| Safety Buffer | 1.50 SOL | Partial 🟡 |
| | | |
| **TOTAL UPFRONT** | **6.85 SOL** | |
| **REFUNDED** | **3.48 SOL** | |
| **PERMANENT** | **3.37 SOL** | |

### 479KB Program (YOUR ACTUAL)

| Cost Type | Amount | Refundable? |
|-----------|--------|-------------|
| Program Rent | 3.42 SOL | No ❌ |
| Buffer Rent | 6.83 SOL | **Yes ✅** |
| IDL Rent | 0.14 SOL | No ❌ |
| Transaction Fees | 0.002 SOL | No ❌ |
| Safety Buffer | 1.50 SOL | Partial 🟡 |
| | | |
| **TOTAL UPFRONT** | **11.89 SOL** | |
| **REFUNDED** | **6.83 SOL** | |
| **PERMANENT** | **5.06 SOL** | |

---

## Answer to Your Question

### "Does mainnet give you this?"

**NO** - You must provide all SOL upfront:

❌ Mainnet does **NOT** give you any SOL  
❌ There is **NO** free SOL on mainnet  
❌ You must **BUY** the SOL from an exchange  

✅ But you **GET BACK** ~6.83 SOL after deployment (the buffer)  
✅ So your **net permanent cost** is only ~5 SOL

### "Is 6.85 SOL enough?"

**For 250KB:** ✅ Yes, 6.85 SOL would be enough  
**For YOUR 479KB:** ❌ No, you need **11.89 SOL minimum**

---

## Recommended Funding

### Conservative Approach (Recommended)

```
Deployer Wallet Funding:
├─ Minimum Required:   12 SOL  (11.89 rounded up)
├─ Recommended:        15 SOL  (20% buffer)
└─ Conservative:       20 SOL  (maximum safety)

Why extra buffer?
- RPC issues might require retries
- Transaction failures cost fees
- Network congestion can increase costs
- Better to have too much than fail mid-deployment
```

### After Deployment

```
Money Flow:
┌─────────────────────────┐
│ Start: 15 SOL           │
│ ├─ Deploy program       │
│ ├─ Upload IDL           │
│ └─ Fees & rent paid     │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│ Buffer Refunded: +6.83  │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│ Ending: ~8-9 SOL        │
│ (Can refund to treasury)│
└─────────────────────────┘

Permanent Cost: ~5 SOL
Locked in program rent
```

---

## Why Your Program Is Larger

Your research was perfect - the difference is **production reality**:

### 250KB was an estimate, 479KB is reality because:

1. **Anchor Framework Overhead**
   - Anchor adds safety checks
   - Account validation logic
   - Error handling code
   - Serialization/deserialization

2. **SPL Token Dependencies**
   - Token program integration
   - Associated token account logic
   - Token transfer instructions
   - Mint validation

3. **Production Optimizations**
   - Release build optimizations
   - Security validations
   - Input sanitization
   - Error messages

4. **This is NORMAL**
   - Most Solana programs are 300-600KB
   - Production code is always larger than estimates
   - The extra cost (~5 SOL more) is expected

---

## Cost Verification Formula

Use this to verify costs for ANY program size:

```bash
# Solana rent formula
LAMPORTS_PER_BYTE=6960

# Your program
PROGRAM_SIZE=490832  # bytes
PROGRAM_RENT=$(( (PROGRAM_SIZE + 128) * LAMPORTS_PER_BYTE ))

# Buffer (2x size, refunded)
BUFFER_SIZE=$((PROGRAM_SIZE * 2))
BUFFER_RENT=$(( (BUFFER_SIZE + 128) * LAMPORTS_PER_BYTE ))

# IDL (~20KB)
IDL_SIZE=20000
IDL_RENT=$(( (IDL_SIZE + 128) * LAMPORTS_PER_BYTE ))

# Transactions
TX_COUNT=$((PROGRAM_SIZE / 1232 + 10))  # +10 for overhead
TX_FEES=$((TX_COUNT * 5000))  # 5000 lamports per tx

# Convert to SOL (1 SOL = 1 billion lamports)
TOTAL_LAMPORTS=$((PROGRAM_RENT + BUFFER_RENT + IDL_RENT + TX_FEES + 1500000000))
TOTAL_SOL=$((TOTAL_LAMPORTS / 1000000000))

echo "Total upfront: $TOTAL_SOL SOL"
```

---

## USD Cost Estimate

**At current SOL price of $204 (October 2025):**

### For Your 479KB Program

| Description | SOL | USD (approx) |
|-------------|-----|--------------|
| **Upfront needed** | 12-15 SOL | **$2,448 - $3,060** |
| **Refunded after** | 6.83 SOL | $1,393 |
| **Net permanent** | 5-8 SOL | **$1,020 - $1,632** |

**Note:** SOL price volatility affects USD cost significantly!

---

## Comparison Table: All Program Sizes

| Size | Upfront | Refunded | Permanent |
|------|---------|----------|-----------|
| **200 KB** | ~6 SOL | ~3 SOL | ~3 SOL |
| **250 KB** | ~7 SOL | ~3.5 SOL | ~3.5 SOL |
| **300 KB** | ~8 SOL | ~4 SOL | ~4 SOL |
| **400 KB** | ~10 SOL | ~5.5 SOL | ~4.5 SOL |
| **479 KB** | **~12 SOL** | **~7 SOL** | **~5 SOL** |
| **500 KB** | ~13 SOL | ~7 SOL | ~6 SOL |

---

## Key Takeaways

### ✅ Your Research is Correct

- Formulas are accurate
- 6.85 SOL estimate for 250KB is correct
- Buffer refund concept is correct
- Transaction fees are accurate

### ⚠️ But Your Program is Different

- You have a 479KB program, not 250KB
- Need **11.89 SOL** minimum (not 6.85 SOL)
- +5.04 SOL more than estimated
- This is **normal and expected**

### 💡 Recommendations

1. **Fund deployer with 15 SOL** (safe buffer)
2. **Expect ~7 SOL refund** after deployment
3. **Net cost: ~5 SOL permanent** + ~3 SOL temporary
4. **Total wallet funding: 15 + 5 + 1 = 21 SOL** (deployer + admin + fee collector)

---

## No Free Mainnet SOL

**Important clarification:**

❌ **Devnet:** Free SOL via `solana airdrop` (testing only)  
✅ **Mainnet:** Must buy SOL with real money (production)

**Where to buy SOL:**
- Coinbase
- Binance
- Kraken
- Coinbase
- FTX (if available)
- Direct DEX purchase

**Then transfer to your deployer wallet address.**

---

## Final Answer

### Your Question: "How much SOL for deployer wallet?"

**Answer:** **15 SOL recommended** (12 SOL minimum)

**Breakdown:**
- Deployment costs: 11.89 SOL upfront
- Safety buffer: 3.11 SOL extra
- Refund after: 6.83 SOL back
- Net cost: ~5 SOL permanent + ~3 SOL temporary

### Your Question: "Does mainnet give you this?"

**Answer:** **NO** - You must buy SOL from an exchange

**But:** The buffer account (~7 SOL) is **refunded** after successful deployment, so you get most of it back!

---

**Summary:** Your research formulas are perfect! Your program is just larger than estimated (normal), so you need more SOL. Plan for **15 SOL in deployer wallet**.

**Last Updated:** 2025-10-27  
**Verified Against:** Actual built program (479.33 KB)  
**Status:** ✅ Accurate for production deployment

