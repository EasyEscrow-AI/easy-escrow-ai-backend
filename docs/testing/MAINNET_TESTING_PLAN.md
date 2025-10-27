# 🧪 Mainnet Testing Plan

**Program ID:** `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`  
**Status:** ✅ DEPLOYED & READY FOR TESTING  
**IDL:** Available locally (no on-chain account needed)

---

## ✅ Pre-Testing Checklist

### Program Deployment
- [x] Program deployed to mainnet
- [x] Program verified on Solscan
- [x] Upgrade authority confirmed
- [x] Program data size verified (259 KB)
- [x] IDL file generated (`target/idl/escrow.json`)

### IDL Status
- [ ] IDL account on-chain (SKIPPED - not needed for testing)
- [x] IDL file available locally
- [ ] IDL served from backend API (TO DO)

### Backend Configuration
- [ ] Update `.env.production` with mainnet values
- [ ] Restart backend with production config
- [ ] Verify program ID in logs
- [ ] Test backend health endpoint

---

## 🔧 Backend Configuration Steps

### 1. Verify `.env.production` Configuration

Your `.env.production` should have:

```bash
# Network
NODE_ENV=production
SOLANA_NETWORK=mainnet-beta

# RPC
SOLANA_RPC_URL=https://prettiest-broken-flower.solana-mainnet.quiknode.pro/2b20215bc747d769dea5e209527aa76c6efb2241/

# Program IDs
MAINNET_PROD_PROGRAM_ID=2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
ESCROW_PROGRAM_ID=2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

# Wallets (use your actual private keys)
MAINNET_PROD_ADMIN_PRIVATE_KEY=<your-admin-private-key>
MAINNET_PROD_FEE_COLLECTOR_PRIVATE_KEY=<your-fee-collector-private-key>

# Token Addresses (Mainnet)
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Platform Settings
PLATFORM_FEE_BPS=100
PLATFORM_FEE_COLLECTOR_ADDRESS=<your-fee-collector-public-key>
```

### 2. Copy IDL to Backend Public Directory

```bash
# Copy IDL file to backend public directory for API serving
mkdir -p src/public/idl
cp target/idl/escrow.json src/public/idl/escrow-mainnet.json
```

### 3. Restart Backend (Local Test First)

```bash
# Test locally first
docker compose restart backend

# Check logs
docker compose logs -f backend

# Look for:
# - "Connected to Solana mainnet"
# - "Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"
# - "USDC Mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
```

### 4. Verify Backend Health

```bash
# Test health endpoint
curl http://localhost:8080/health

# Expected response:
# {
#   "status": "ok",
#   "network": "mainnet-beta",
#   "programId": "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"
# }
```

---

## 🧪 Test Phases

### Phase 1: Smoke Test (Day 1 - 2 hours)
**Goal:** Verify program responds correctly

**Test Cases:**
1. ✅ Program is callable from backend
2. ✅ Program PDAs derive correctly
3. ✅ Program instructions simulate successfully

**How to Test:**
```bash
# Use Solana CLI to test program interaction
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta

# Should show:
# - Program exists
# - Upgrade authority correct
# - Data length correct
```

**Success Criteria:**
- ✅ Program responds to queries
- ✅ No errors in program logs
- ✅ Backend can connect to program

---

### Phase 2: Small Value Test (Day 1 - 1 hour)
**Goal:** Complete one full escrow flow with minimal value

**Test NFT:**
- Use a test/low-value NFT (< $1 value)
- NOT your valuable NFTs!

**Test Amount:**
- Use 0.01 USDC (~$0.01)
- Minimal risk if something goes wrong

**Test Flow:**
1. **Create Agreement**
   - Buyer: Your test wallet 1
   - Seller: Your test wallet 2
   - NFT: Test NFT mint address
   - USDC amount: 0.01 USDC (10,000 micro-USDC)

2. **Deposit NFT** (Seller)
   - Use test NFT
   - Verify NFT transferred to escrow PDA
   - Check transaction on Solscan

3. **Deposit USDC** (Buyer)
   - Deposit 0.01 USDC
   - Verify USDC transferred to escrow PDA
   - Check transaction on Solscan

4. **Verify Settlement**
   - Settlement should auto-trigger
   - NFT → Buyer wallet
   - USDC - fees → Seller wallet
   - Platform fee → Fee collector wallet
   - Check all transactions on Solscan

5. **Verify Receipt**
   - Backend generates settlement receipt
   - Receipt contains correct amounts
   - All wallet addresses correct

**Success Criteria:**
- ✅ All transactions confirmed
- ✅ NFT transferred correctly
- ✅ USDC amounts correct (including fees)
- ✅ No errors in logs
- ✅ Receipts generated correctly

**Test Wallets Needed:**
```bash
# Create test wallets if needed
solana-keygen new -o wallets/testing/test-buyer.json
solana-keygen new -o wallets/testing/test-seller.json

# Fund with minimal SOL for transaction fees
solana transfer <TEST_BUYER_ADDRESS> 0.05 \
  --url mainnet-beta \
  --allow-unfunded-recipient

solana transfer <TEST_SELLER_ADDRESS> 0.05 \
  --url mainnet-beta \
  --allow-unfunded-recipient
```

---

### Phase 3: Edge Case Testing (Day 2-3)
**Goal:** Test error handling and edge cases

**Test Cases:**
1. **Invalid Deposits**
   - Try depositing wrong NFT
   - Try depositing wrong amount
   - Verify proper error messages

2. **Timeout Scenarios**
   - Create agreement
   - Don't deposit anything
   - Wait for timeout period
   - Test refund logic

3. **Admin Functions**
   - Test admin cancel (if needed)
   - Verify only admin can call it

4. **Fee Collection**
   - Verify platform fees collected
   - Check fee collector balance increases
   - Verify fee percentage correct (1% = 100 BPS)

**Success Criteria:**
- ✅ Error handling works correctly
- ✅ Timeouts work as expected
- ✅ Admin functions secure
- ✅ Fees calculated correctly

---

### Phase 4: Monitoring Period (Week 1)
**Goal:** Monitor for unexpected behavior

**What to Monitor:**
1. **Transaction Success Rate**
   - Should be > 99%
   - Any failures investigated

2. **Settlement Times**
   - Should match staging (~10-30 seconds)
   - No unusual delays

3. **Fee Accuracy**
   - Platform fees correct
   - No rounding errors

4. **Program Account Balance**
   - Rent balance stable (1.85 SOL)
   - No unexpected charges

5. **RPC Performance**
   - QuickNode response times
   - Rate limit not exceeded

**Monitoring Tools:**
- **Solscan:** https://solscan.io/address/2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
- **Backend Logs:** `docker compose logs -f backend`
- **Database:** Check agreement status progression

**Daily Checklist:**
- [ ] Check program balance (should stay ~1.85 SOL)
- [ ] Review all transactions
- [ ] Check for any errors in logs
- [ ] Verify fee collection
- [ ] Monitor RPC usage

---

## 📊 Test Tracking

### Test Results Template

```markdown
## Test: [Name]
**Date:** [Date/Time]
**Tester:** [Your name]

### Setup
- Buyer Wallet: [Address]
- Seller Wallet: [Address]
- NFT Mint: [Address]
- USDC Amount: [Amount]

### Results
- [ ] Agreement created
- [ ] NFT deposited
- [ ] USDC deposited
- [ ] Settlement completed
- [ ] Fees collected correctly
- [ ] Receipt generated

### Transactions
- Create Agreement: [Tx signature]
- Deposit NFT: [Tx signature]
- Deposit USDC: [Tx signature]
- Settlement: [Tx signature]

### Issues Found
[List any issues or unexpected behavior]

### Status
[PASS / FAIL / BLOCKED]
```

---

## 🚨 Rollback Plan

### If Critical Issues Found

**Immediate Actions:**
1. **Stop accepting new agreements**
   - Update backend to return maintenance mode
   - Display message to users

2. **Investigate issue**
   - Check transaction logs
   - Review error messages
   - Compare with staging behavior

3. **If program bug found:**
   - Prepare program upgrade
   - Test upgrade on devnet/staging first
   - Upgrade mainnet program
   - Resume testing

4. **If backend bug found:**
   - Fix backend code
   - Deploy backend update
   - Resume testing

**Emergency Contact:**
- Solana Discord: https://discord.gg/solana
- Anchor Discord: https://discord.gg/anchor

---

## ✅ Testing Complete Checklist

Before opening to real users:

- [ ] Phase 1: Smoke test complete ✅
- [ ] Phase 2: Small value test complete ✅
- [ ] Phase 3: Edge cases tested ✅
- [ ] Phase 4: 7 days monitoring complete ✅
- [ ] All transactions successful ✅
- [ ] Fees calculated correctly ✅
- [ ] No critical bugs found ✅
- [ ] Backend stable ✅
- [ ] RPC performance good ✅
- [ ] Documentation updated ✅

---

## 🎯 Success Metrics

**Technical Metrics:**
- Transaction success rate: > 99%
- Average settlement time: < 60 seconds
- Fee accuracy: 100%
- Uptime: > 99.9%

**Business Metrics:**
- Test agreements completed: > 10
- Total test volume: > 1 USDC equivalent
- Zero lost funds
- Zero security incidents

---

## 📝 Next Steps After Testing

1. **Gradual Rollout:**
   - Start with beta users
   - Limit max transaction size initially
   - Increase limits gradually

2. **User Communication:**
   - Announce mainnet launch
   - Provide support channels
   - Document known limitations

3. **Continued Monitoring:**
   - Daily checks for first month
   - Weekly checks after that
   - Set up automated alerts

4. **Security Hardening:**
   - Consider multisig upgrade authority
   - Regular security reviews
   - Bug bounty program (future)

---

## 📞 Support During Testing

**If you encounter issues:**

1. **Check Solscan first:**
   - Look for error messages
   - Check transaction status
   - Verify account states

2. **Review logs:**
   - Backend logs
   - Program logs
   - RPC logs

3. **Compare with staging:**
   - Does same test work on staging?
   - What's different?

4. **Document everything:**
   - Screenshot errors
   - Save transaction signatures
   - Note timestamps

---

**Testing Start Date:** [To be determined]  
**Program ID:** `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`  
**Status:** Ready for Phase 1 testing ✅

---

**Remember:** Start small, test thoroughly, monitor closely! 🎯

