# Staging E2E Tests

End-to-end test suite for validating atomic swap functionality on the STAGING (devnet) environment.

---

## 🎯 Test Architecture

### Current: Atomic Swap Tests ✨

The primary E2E tests use the **new atomic swap architecture** with direct blockchain transactions and durable nonces.

```
tests/staging/e2e/
├── 01-atomic-nft-for-sol-happy-path.test.ts    # NFT → SOL swaps
├── 02-atomic-cnft-for-sol-happy-path.test.ts   # cNFT → SOL swaps
├── 03-atomic-nft-for-nft-happy-path.test.ts    # NFT → NFT swaps
├── 04-atomic-nft-for-cnft-happy-path.test.ts   # NFT → cNFT swaps
├── legacy/                                      # Deprecated orchestrator tests
└── README.md                                    # This file
```

### Legacy: Orchestrator Tests (Deprecated) 🟡

Legacy agreement-based tests have been moved to `legacy/` folder:
- See [legacy/README.md](legacy/README.md) for details
- Kept for backwards compatibility only
- **DO NOT add new tests there**

---

## 🚀 Running Atomic Swap Tests

### Individual Test Files

```bash
# NFT for SOL atomic swaps
npm run test:staging:e2e:atomic:nft-sol

# cNFT for SOL atomic swaps
npm run test:staging:e2e:atomic:cnft-for-sol

# NFT for NFT atomic swaps
npm run test:staging:e2e:atomic:nft-for-nft

# NFT for cNFT atomic swaps
npm run test:staging:e2e:atomic:nft-for-cnft

# Run ALL atomic swap tests
npm run test:staging:e2e:atomic:all
```

### Direct Mocha Commands

```bash
# Run specific test file
mocha --no-config --require ts-node/register \
  tests/staging/e2e/01-atomic-nft-for-sol-happy-path.test.ts \
  --timeout 180000 --reporter spec --colors

# Run all atomic swap tests
mocha --no-config --require ts-node/register \
  'tests/staging/e2e/*-atomic-*.test.ts' \
  --timeout 180000 --reporter spec --colors
```

---

## 📊 Test Scenarios

### 01. NFT for SOL - Atomic Swap
**File:** `01-atomic-nft-for-sol-happy-path.test.ts`  
**Status:** ✅ Scenario 1 Complete (Remaining scenarios TODO)

**Test Scenarios:**
1. ✅ **Standard 1% Percentage Fee** - Complete with full verification
2. ⏳ **Fixed Flat Fee** - TODO
3. ⏳ **Zero Fee (Platform Pays)** - TODO
4. ⏳ **Nonce Validation** - TODO
5. ⏳ **Balance Edge Cases** - TODO

**What It Tests:**
- API endpoint integration (create, accept, confirm)
- Transaction serialization with durable nonces
- Maker and taker transaction signing
- Balance changes (maker receives SOL)
- Fee collection verification
- NFT ownership transfers
- Nonce consumption validation

**Duration:** ~1.5-2 minutes per scenario

### 02. cNFT for SOL - Atomic Swap
**File:** `02-atomic-cnft-for-sol-happy-path.test.ts`  
**Status:** ⏳ TODO

**Test Scenarios:**
1. Standard 1% percentage fee with Merkle proof
2. Fixed flat fee with compression validation
3. Zero fee scenario
4. Nonce validation with cNFTs
5. QuickNode DAS API integration

**What It Tests:**
- cNFT-specific swap flows
- Merkle proof validation
- QuickNode DAS API integration
- Compressed asset verification

### 03. NFT for NFT - Atomic Swap
**File:** `03-atomic-nft-for-nft-happy-path.test.ts`  
**Status:** ⏳ TODO

**Test Scenarios:**
1. Pure NFT-NFT swap (1% fee)
2. NFT-NFT with fixed fee
3. Hybrid NFT + SOL swap
4. Zero fee NFT swap
5. Multi-asset verification

**What It Tests:**
- Pure asset swaps (no SOL involved)
- Dual NFT ownership transfers
- Fee handling for asset-only swaps

### 04. NFT for cNFT - Atomic Swap
**File:** `04-atomic-nft-for-cnft-happy-path.test.ts`  
**Status:** ⏳ TODO

**Test Scenarios:**
1. NFT → cNFT swap (1% fee)
2. cNFT → NFT swap (reverse)
3. Cross-format verification
4. Merkle proof + standard NFT
5. Hybrid scenarios

**What It Tests:**
- Cross-format swaps
- Combined validation strategies
- Mixed asset type handling

---

## 🔧 Environment Setup

### Required Environment Variables

```bash
# API Configuration
STAGING_API_URL=https://easyescrow-backend-staging.ondigitalocean.app
ATOMIC_SWAP_API_KEY=<your-staging-api-key>

# Blockchain Configuration
STAGING_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=<key>
STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# Wallets
DEVNET_STAGING_FEE_COLLECTOR_ADDRESS=8LL197pziojWHtS3zeyJonrh1swKvMZpumfesVmDgUcZ
STAGING_ADMIN_PRIVATE_KEY_PATH=./wallets/staging/staging-deployer.json

# Test Wallets
DEVNET_SENDER_PRIVATE_KEY_PATH=./wallets/dev/devnet-sender.json
DEVNET_RECEIVER_PRIVATE_KEY_PATH=./wallets/dev/devnet-receiver.json
```

See [ATOMIC_SWAP_ENVIRONMENT_VARIABLES.md](../../../docs/ATOMIC_SWAP_ENVIRONMENT_VARIABLES.md) for complete setup guide.

---

## 📝 Test Structure

### Standard Test Flow

Each atomic swap test follows this pattern:

```typescript
describe('Scenario: [Description]', () => {
  it('should successfully swap [assets] with [fee type]', async function() {
    // 1. Get balances/owners BEFORE swap
    const makerBalanceBefore = await connection.getBalance(maker);
    const nftOwnerBefore = await getNFTOwner(connection, nft);
    
    // 2. Create offer via API
    const offer = await apiClient.createOffer({
      makerWallet, takerWallet,
      offeredAssets, requestedSol,
      customFee: { type, value, payer }
    });
    
    // 3. Sign and send maker transaction
    const makerSig = await signAndSendTransaction(
      offer.data.transaction.serialized,
      [makerKeypair],
      connection
    );
    
    // 4. Accept offer via API
    const accept = await apiClient.acceptOffer(offerId, takerWallet);
    
    // 5. Sign and send taker transaction
    const takerSig = await signAndSendTransaction(
      accept.data.transaction.serialized,
      [takerKeypair],
      connection
    );
    
    // 6. Confirm execution
    await apiClient.confirmOffer(offerId, takerSig);
    
    // 7. Verify all state changes
    await verifyBalanceChange(maker, +expectedSOL);
    await verifyBalanceChange(taker, -expectedSOL);
    await verifyNFTOwner(nft, takerPubkey);
    await verifyNonceAdvanced(nonceAccount);
  });
});
```

---

## 🧪 Test Utilities

### API Client
**Location:** `tests/helpers/atomic-swap-api-client.ts`

Provides:
- `createOffer()` - Create swap offer
- `acceptOffer()` - Accept offer
- `confirmOffer()` - Confirm execution
- `signAndSendTransaction()` - TX signing/sending
- `generateIdempotencyKey()` - Idempotency helper

### Verification Helpers
**Location:** `tests/helpers/swap-verification.ts`

Provides:
- `verifyBalanceChange()` - Check SOL balance changes
- `verifyNFTOwner()` - Verify asset ownership
- `verifyNonceAdvanced()` - Confirm nonce consumption
- `waitForConfirmation()` - TX confirmation with retries
- `displayTestSummary()` - Pretty results output

### Wallet Management
**Location:** `tests/helpers/devnet-wallet-manager.ts`

Provides:
- `loadDevnetWallets()` - Load test wallets
- `verifyWalletBalances()` - Check balances
- `displayWalletInfo()` - Show wallet details

### NFT Creation
**Location:** `tests/helpers/devnet-nft-setup.ts`

Provides:
- `createTestNFT()` - Create NFTs for testing
- `displayNFTInfo()` - Show NFT details

---

## 📈 Test Coverage

### Current Status
- ✅ **1/36+ scenarios complete** (Scenario 1: NFT for SOL with 1% fee)
- ✅ Complete API integration working
- ✅ Full verification suite implemented
- ✅ Template ready for replication

### Remaining Work
- **File 01:** 4 more scenarios (~4 hours)
- **File 02:** 5 cNFT scenarios (~7.5 hours)
- **File 03:** 5 NFT-NFT scenarios (~5 hours)
- **File 04:** 5 NFT-cNFT scenarios (~7.5 hours)

**Total Estimated Time:** ~10-12 hours to complete all scenarios

---

## 🎯 Success Criteria

Tests should verify:
- ✅ API endpoints respond correctly
- ✅ Transaction serialization accurate
- ✅ Signatures valid
- ✅ Balance changes within tolerance
- ✅ Asset transfers confirmed
- ✅ Nonce consumption validated
- ✅ No errors or warnings

---

## 📚 Related Documentation

- [Atomic Swap Implementation Plan](../../../docs/tasks/ATOMIC_SWAP_E2E_IMPLEMENTATION_PLAN.md)
- [Scenario 1 Completion Report](../../../docs/tasks/ATOMIC_SWAP_E2E_SCENARIO1_COMPLETE.md)
- [Atomic Swap Environment Variables](../../../docs/ATOMIC_SWAP_ENVIRONMENT_VARIABLES.md)
- [Legacy Orchestrator Tests](legacy/README.md) - Deprecated

---

## 🚦 Getting Started

1. **Set up environment** - Configure `.env` with staging credentials
2. **Fund test wallets** - Ensure devnet SOL in sender/receiver wallets
3. **Run Scenario 1** - Validate setup with working test
4. **Replicate pattern** - Use Scenario 1 as template for remaining tests

```bash
# Quick start
npm run test:staging:e2e:atomic:nft-sol
```

**Expected:** All assertions pass, ~1.5-2 minutes duration

---

**Status:** 🟢 ACTIVE - Atomic swap tests in progress  
**Last Updated:** November 20, 2025  
**Completion:** 1/36+ scenarios (3% complete)
