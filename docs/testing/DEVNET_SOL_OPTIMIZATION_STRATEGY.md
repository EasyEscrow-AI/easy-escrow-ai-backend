# Devnet SOL Optimization Strategy for E2E Tests

**Created:** October 16, 2025  
**Status:** 🎯 ACTION REQUIRED  
**Priority:** HIGH

## Executive Summary

Running E2E tests on Solana devnet can consume significant SOL due to:
- Transaction fees
- Account creation costs
- Token mint creation
- NFT minting
- Multiple test iterations

This document outlines strategies to minimize SOL consumption while maintaining comprehensive test coverage.

---

## Current SOL Usage Analysis

### Typical E2E Test Costs

| Operation | Est. Cost (SOL) | Frequency | Total Cost |
|-----------|-----------------|-----------|------------|
| Create Token Account | 0.00203928 | 4-6x | ~0.012 SOL |
| Mint Creation | 0.00144 | 2x | ~0.003 SOL |
| NFT Minting | 0.01-0.02 | 1x | ~0.015 SOL |
| Escrow Transactions | 0.000005-0.00001 | 3-5x | ~0.00005 SOL |
| **Total per E2E run** | | | **~0.03-0.05 SOL** |

### Projected Usage
- **10 test runs/day** = 0.3-0.5 SOL/day
- **100 test runs** = 3-5 SOL
- **1000 test runs** = 30-50 SOL

**Problem:** Devnet faucet limits make frequent testing expensive.

---

## Optimization Strategies

### 1. 🔄 **Reuse Token Accounts & Mints** (HIGHEST IMPACT)

#### Current Approach (Inefficient)
```typescript
// Create new mint every test run
const usdcMint = await createMint(connection, payer, authority, null, 6);
const nftMint = await createMint(connection, payer, authority, null, 0);
```

#### Optimized Approach
```typescript
// Use pre-created, reusable mints stored in constants
const DEVNET_USDC_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");

// Only create new mints if testing mint-specific functionality
if (testRequiresNewMint) {
  const newMint = await createMint(/*...*/);
}
```

**Savings:** ~0.003 SOL per test run  
**Implementation:**
- Create dedicated devnet USDC mint once
- Store mint address in environment variables
- Reuse across all tests

---

### 2. 🔑 **Use Deterministic Wallets** (IMPLEMENTED ✅)

**Current Implementation:**
```typescript
function createDeterministicKeypair(seed: string): Keypair {
  const hash = crypto.createHash('sha256').update(seed).digest();
  return Keypair.fromSeed(hash);
}

// Wallet addresses remain constant across test runs
const sender = createDeterministicKeypair('sender-wallet-seed');
```

**Benefits:**
- ✅ Wallets persist between test runs
- ✅ No need to fund new wallets each time
- ✅ Can accumulate SOL from multiple funding sessions

**Maintenance:**
- Fund wallets once
- Top up when balance drops below threshold
- No recreation needed

---

### 3. 💰 **Implement Smart Account Cleanup**

#### Close Unused Token Accounts
```typescript
// After test completion, close token accounts to reclaim rent
async function cleanupTokenAccounts(connection, owner, tokenAccounts) {
  for (const account of tokenAccounts) {
    await closeAccount(
      connection,
      owner,
      account,
      owner.publicKey,
      owner
    );
  }
}
```

**Rent Reclaimed:** ~0.00203928 SOL per account  
**Impact:** Over 100 tests = 0.2-0.4 SOL saved

---

### 4. 🎯 **Optimize Compute Units** (MEDIUM IMPACT)

#### Request Exact Compute Units
```typescript
import { ComputeBudgetProgram } from '@solana/web3.js';

// Simulate transaction first to get exact CU usage
const simulation = await connection.simulateTransaction(transaction);
const computeUnits = simulation.value.unitsConsumed;

// Add 10% margin for safety
const computeBudget = Math.ceil(computeUnits * 1.1);

// Add compute budget instruction
transaction.add(
  ComputeBudgetProgram.setComputeUnitLimit({
    units: computeBudget
  })
);
```

**Benefits:**
- Lower transaction fees
- Higher likelihood of inclusion
- More efficient block usage

**QuickNode API Integration:**
```typescript
async function getOptimalPriorityFee(endpoint: string) {
  const { result } = await fetch(`${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'qn_estimatePriorityFees',
      params: {
        account: accountAddress,
        last_n_blocks: 100
      }
    })
  }).then(r => r.json());
  
  return result.per_compute_unit.medium; // or 'low' for tests
}
```

---

### 5. 🔄 **Batch Operations**

#### Group Multiple Operations
```typescript
// Instead of multiple transactions
await createTokenAccount(/*...*/);  // TX 1
await mintTokens(/*...*/);           // TX 2  
await approve(/*...*/);              // TX 3

// Use a single transaction with multiple instructions
const transaction = new Transaction()
  .add(createAccountInstruction)
  .add(mintInstruction)
  .add(approveInstruction);

await sendAndConfirmTransaction(connection, transaction, [signer]);
```

**Savings:** 2/3 of transaction fees  
**Note:** Limited by transaction size (1232 bytes max)

---

### 6. 🏃 **Use Localnet for Frequent Testing**

#### Development Workflow
```bash
# Start local validator
solana-test-validator

# Run tests against localnet (FREE!)
SOLANA_RPC_URL=http://localhost:8899 npm run test:e2e

# Only run on devnet for:
# - Pre-deployment verification
# - Network-specific testing
# - Final integration tests
```

**Benefits:**
- ✅ Unlimited SOL
- ✅ Faster transaction confirmation
- ✅ No network congestion
- ✅ Perfect for TDD

**Devnet Usage:**
- Pre-deployment validation
- CI/CD pipeline final check
- Weekly integration verification

---

### 7. 📊 **Implement Test Tiering**

#### Tier 1: Localnet (95% of tests)
```typescript
describe('Unit & Integration Tests', () => {
  before(() => {
    if (process.env.SOLANA_NETWORK !== 'localnet') {
      this.skip(); // Skip on non-local networks
    }
  });
  // Fast, frequent tests
});
```

#### Tier 2: Devnet (Weekly/Pre-deploy)
```typescript
describe('E2E Devnet Tests', () => {
  before(() => {
    if (process.env.SOLANA_NETWORK !== 'devnet') {
      this.skip();
    }
  });
  // Critical path tests only
});
```

#### Tier 3: Testnet (Pre-mainnet)
```typescript
describe('Production Readiness Tests', () => {
  // Full suite before mainnet
});
```

---

### 8. 🔍 **Monitor SOL Usage**

#### Track Test Costs
```typescript
class TestCostTracker {
  private initialBalance: number;
  
  async before(connection: Connection, wallet: PublicKey) {
    this.initialBalance = await connection.getBalance(wallet);
  }
  
  async after(connection: Connection, wallet: PublicKey) {
    const finalBalance = await connection.getBalance(wallet);
    const cost = (this.initialBalance - finalBalance) / LAMPORTS_PER_SOL;
    
    console.log(`Test cost: ${cost.toFixed(6)} SOL`);
    
    // Alert if cost exceeds threshold
    if (cost > 0.05) {
      console.warn(`⚠️  High test cost detected: ${cost} SOL`);
    }
  }
}
```

#### Set Budget Alerts
```typescript
const WALLET_LOW_BALANCE_THRESHOLD = 0.1; // SOL

async function checkWalletBalances() {
  for (const [name, wallet] of Object.entries(testWallets)) {
    const balance = await connection.getBalance(wallet.publicKey);
    const sol = balance / LAMPORTS_PER_SOL;
    
    if (sol < WALLET_LOW_BALANCE_THRESHOLD) {
      console.warn(`⚠️  ${name} wallet low: ${sol} SOL`);
      console.log(`Fund with: solana transfer ${wallet.publicKey} 1 --url devnet`);
    }
  }
}
```

---

### 9. 🎲 **Use Faucet Strategically**

#### Devnet Faucet Limits
- **Rate Limit:** 1 airdrop per 24 hours per address
- **Amount:** 1-2 SOL per airdrop
- **Cooldown:** 24 hours

#### Optimization Strategy
```typescript
async function smartAirdrop(connection: Connection, address: PublicKey) {
  const balance = await connection.getBalance(address);
  const sol = balance / LAMPORTS_PER_SOL;
  
  // Only request if really needed
  if (sol < 0.05) {
    try {
      await connection.requestAirdrop(address, 2 * LAMPORTS_PER_SOL);
      console.log(`✅ Airdr​opped 2 SOL to ${address.toBase58()}`);
    } catch (error) {
      console.warn(`❌ Airdrop failed (likely rate limited): ${error.message}`);
    }
  } else {
    console.log(`ℹ️  Sufficient balance (${sol} SOL), skipping airdrop`);
  }
}
```

**Multiple Wallet Strategy:**
- Use 3-4 test wallet sets
- Rotate between sets when rate limited
- Allows testing while waiting for cooldown

---

### 10. 📝 **Minimal Test Data**

#### Use Smallest Viable Amounts
```typescript
// ❌ Wasteful
const SWAP_AMOUNT = 100 * USDC_DECIMALS; // 100 USDC

// ✅ Efficient (tests same logic)
const SWAP_AMOUNT = 0.1 * USDC_DECIMALS; // 0.1 USDC
```

#### Reuse NFTs When Possible
```typescript
// Create NFT collection once, reuse across tests
const TEST_NFT_COLLECTION = new PublicKey("...");

// Only mint new NFTs for ownership-specific tests
if (testRequiresUniqueNFT) {
  const nft = await mintNewNFT(/*...*/);
}
```

---

## Implementation Priority

### Phase 1: Immediate (High ROI) ✅
1. ✅ Use deterministic wallets (DONE)
2. ⏳ Reuse token mints (IN PROGRESS)
3. ⏳ Implement account cleanup
4. ⏳ Add SOL usage tracking

**Expected Savings:** 60-70% reduction

### Phase 2: Medium Term (Weeks 1-2)
1. Set up localnet testing workflow
2. Implement compute unit optimization
3. Create test tiering system
4. Multiple wallet rotation

**Expected Savings:** 80-90% reduction (via localnet)

### Phase 3: Long Term (Ongoing)
1. Continuous monitoring
2. Automated cleanup scripts
3. CI/CD optimization
4. Testnet migration for final verification

**Expected Savings:** 95%+ reduction

---

## Recommended Test Workflow

```bash
# 1. Daily development (FREE)
solana-test-validator &
npm run test:e2e:localnet

# 2. Weekly devnet verification (MINIMAL COST)
npm run test:e2e:devnet

# 3. Pre-deployment (CONTROLLED COST)
npm run test:e2e:devnet:full

# 4. Pre-mainnet (ONE-TIME COST)
npm run test:e2e:testnet
```

---

## Cost Projections

### Current (Unoptimized)
- Development: 100 tests/week = 3-5 SOL/week
- **Monthly Cost:** 12-20 SOL

### After Phase 1 Optimizations
- Development: 100 tests/week = 1-1.5 SOL/week
- **Monthly Cost:** 4-6 SOL
- **Savings:** 60-70%

### After Phase 2 (Localnet)
- Development: 100 tests/week = 0 SOL (localnet)
- Devnet verification: 5 tests/week = 0.15-0.25 SOL/week
- **Monthly Cost:** 0.6-1 SOL
- **Savings:** 95%+

---

## Quick Wins (Implement Today)

### 1. Add to `.env`
```bash
# Reusable devnet resources
DEVNET_USDC_MINT=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
DEVNET_TEST_COLLECTION=<your-nft-collection-address>

# Test wallet seeds (deterministic)
TEST_SENDER_SEED=easyescrow-sender-v1
TEST_RECEIVER_SEED=easyescrow-receiver-v1
TEST_ADMIN_SEED=easyescrow-admin-v1
TEST_FEE_COLLECTOR_SEED=easyescrow-fee-v1
```

### 2. Update Test Helper
```typescript
// tests/helpers/devnet-setup.ts
export function getOrCreateMint(type: 'usdc' | 'nft') {
  const existing = process.env[`DEVNET_${type.toUpperCase()}_MINT`];
  if (existing) {
    return new PublicKey(existing);
  }
  // Only create if not exists
  return createMint(/*...*/);
}
```

### 3. Add Cleanup Hook
```typescript
afterEach(async function() {
  if (process.env.CLEANUP_ACCOUNTS === 'true') {
    await cleanupTokenAccounts(connection, testWallets);
  }
});
```

---

## Resources

### Tools
- **Solana CLI:** Transaction simulation, balance checking
- **QuickNode API:** Priority fee estimation
- **solana-test-validator:** Local testing
- **Anchor:** Efficient program interaction

### Documentation
- [Solana Compute Optimization Guide](https://solana.com/developers/guides/advanced/how-to-optimize-compute)
- [QuickNode Transaction Guide](https://www.quicknode.com/guides/solana-development/transactions/how-to-optimize-solana-transactions)
- [Devnet Faucet](https://faucet.solana.com)

---

## Action Items

### Immediate
- [ ] Create reusable USDC mint on devnet
- [ ] Add mint addresses to `.env`
- [ ] Implement account cleanup
- [ ] Add SOL usage tracking

### This Week
- [ ] Set up localnet testing
- [ ] Create test tier structure
- [ ] Implement compute unit optimization
- [ ] Document wallet rotation strategy

### Ongoing
- [ ] Monitor SOL usage weekly
- [ ] Optimize high-cost tests
- [ ] Maintain devnet resource inventory

---

## Conclusion

By implementing these strategies, we can reduce devnet SOL consumption by **95%+** while maintaining comprehensive test coverage. The key is:

1. **Reuse resources** (mints, accounts, wallets)
2. **Use localnet** for frequent testing
3. **Optimize transactions** (compute units, batching)
4. **Monitor and track** spending
5. **Clean up** after tests

**Target:** < 1 SOL/month for all devnet testing

---

**Next Steps:** Implement Phase 1 optimizations this week to achieve immediate 60-70% savings.

