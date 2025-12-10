# Production Test Suite

**Environment:** Solana Mainnet-Beta  
**Program ID:** `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`  
**Purpose:** Validate atomic swap system in production

---

## 🎯 Overview

This test suite provides comprehensive validation of the atomic swap system on Solana mainnet-beta. Tests are designed to be run in production with real SOL and NFTs (small amounts for testing).

**⚠️ IMPORTANT:** These tests use **real mainnet wallets** and incur **real transaction fees**.

---

## 📁 Test Structure

```
tests/production/
├── e2e/                 # End-to-end tests (full swap flows)
├── smoke/               # Quick health checks (< 30s)
├── integration/         # API integration tests
├── helpers/             # Production wallet and NFT helpers
└── README.md            # This file
```

---

## 🧪 Test Types

### 1. E2E Tests (`e2e/`)
**Purpose:** Validate complete atomic swap workflows on mainnet

**Tests:**
- `01-atomic-nft-for-sol.test.ts` - NFT → SOL swap
- `02-atomic-sol-for-nft.test.ts` - SOL → NFT swap  
- `03-atomic-nft-for-nft.test.ts` - NFT ↔ NFT swap
- `04-atomic-cnft-for-sol.test.ts` - cNFT → SOL swap
- `05-atomic-cnft-for-cnft.test.ts` - cNFT ↔ cNFT swap
- `06-atomic-mixed-assets.test.ts` - Mixed asset swaps (NFT+SOL, cNFT+SOL)
- `07-zero-fee-authorization.test.ts` - Zero-fee authorized swaps with API key validation

**Characteristics:**
- Full transaction execution
- Real fees (0.000005 - 0.01 SOL per test)
- 180s timeout (mainnet latency)
- Comprehensive assertions

### 2. Smoke Tests (`smoke/`)
**Purpose:** Quick validation of production system health

**Tests:**
- `01-health-check.test.ts` - API endpoints responsive
- `02-solana-connection.test.ts` - RPC connectivity
- `03-treasury-pda.test.ts` - Treasury initialized
- `04-program-deployed.test.ts` - Program accessible
- `05-database-connectivity.test.ts` - Database accessible

**Characteristics:**
- No transactions
- Read-only operations
- 30s timeout
- Quick validation (< 5 minutes total)

### 3. Integration Tests (`integration/`)
**Purpose:** Validate API integration with production services

**Tests:**
- `01-offer-creation-api.test.ts` - Create offer via API
- `02-offer-acceptance-api.test.ts` - Accept offer via API
- `03-transaction-rebuild-api.test.ts` - Rebuild transaction
- `04-zero-fee-api-key.test.ts` - API key authorization

**Characteristics:**
- HTTP API calls
- May execute transactions
- 60s timeout
- API-focused validation

---

## 🔑 Production Wallets

**Location:** `wallets/production/`

**Test Wallets:**
- `production-sender.json` - Maker wallet for tests
- `production-receiver.json` - Taker wallet for tests
- `production-treasury.json` - Treasury authority (DO NOT USE FOR TESTS)
- `production-admin.json` - Platform admin (DO NOT USE FOR TESTS)

**⚠️  Security:**
- Test wallets funded with small amounts (0.5-1 SOL)
- Admin/treasury wallets secured (not used in tests)
- All wallets in `.gitignore`

---

## ⚙️ Configuration

### Environment Variables

**Required:**
```bash
# Mainnet RPC (Helius/QuickNode recommended)
MAINNET_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Production Program ID
MAINNET_PROGRAM_ID=2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

# Treasury Configuration
MAINNET_TREASURY_PDA=FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu
MAINNET_TREASURY_AUTHORITY=HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF

# Test Wallet Paths
PRODUCTION_SENDER_PATH=wallets/production/production-sender.json
PRODUCTION_RECEIVER_PATH=wallets/production/production-receiver.json

# API Configuration (if testing via API)
PRODUCTION_API_URL=https://api.easyescrow.ai
ATOMIC_SWAP_API_KEY=your-api-key-here
```

**Optional:**
```bash
# Logging
PRODUCTION_TEST_LOG_LEVEL=info

# Timeouts
PRODUCTION_TEST_TIMEOUT=180000
```

---

## 🚀 Running Tests

### Quick Smoke Test (Recommended Before Deployment)
```bash
npm run test:production:smoke
```

### Full E2E Suite
```bash
npm run test:production:e2e
```

### Specific Test File
```bash
npm run test:production:e2e:nft-for-sol
```

### All Production Tests
```bash
npm run test:production
```

---

## 💰 Cost Estimation

### Per Test Run

**E2E Tests:**
- Transaction fees: ~0.000005 SOL per transaction
- Account rent: ~0.002 SOL per new account
- Estimated total: ~0.05-0.1 SOL per full E2E suite

**Smoke Tests:**
- No transactions (read-only)
- Cost: $0

**Integration Tests:**
- May execute transactions
- Estimated total: ~0.01-0.02 SOL

**Total Full Suite:** ~0.06-0.12 SOL (~$10-$20 at $150/SOL)

---

## ✅ Pre-Test Checklist

Before running production tests:

- [ ] Treasury PDA initialized on mainnet
- [ ] Production program deployed to mainnet
- [ ] Test wallets funded (0.5 SOL minimum each)
- [ ] RPC URL configured (Helius/QuickNode)
- [ ] Environment variables set (`.env.production`)
- [ ] API endpoints accessible
- [ ] Database seeded with authorized apps (if testing zero-fee)

---

## 🔧 Test Helpers

**Located in:** `tests/helpers/`

- `production-wallet-manager.ts` - Load/manage production wallets
- `production-nft-setup.ts` - Create test NFTs on mainnet
- `test-utils.ts` - Shared utilities (wait, retry, etc.)

---

## 📊 Expected Results

### Successful Test Run

```
🚀 Production Tests: Atomic Swap System

  E2E Tests
    ✓ NFT → SOL swap (15s)
    ✓ SOL → NFT swap (14s)
    ✓ NFT → NFT swap (18s)
    ✓ Zero-fee authorized swap (12s)
    ✓ Treasury fee collection (10s)
    ✓ Nonce validation (8s)
    ✓ Security validations (5s)

  Smoke Tests
    ✓ Health check (1s)
    ✓ Solana connection (2s)
    ✓ Treasury PDA (1s)
    ✓ Program deployed (1s)
    ✓ Database connectivity (1s)

  14 passing (82s)
```

---

## 🐛 Troubleshooting

### Test Timeout
**Issue:** Tests timeout after 180s  
**Solution:** 
- Check RPC URL is fast (Helius/QuickNode)
- Increase timeout in test file
- Verify network connectivity

### Insufficient Funds
**Issue:** Transaction fails with "insufficient funds"  
**Solution:**
- Fund test wallets: `solana transfer <wallet> 0.5 --url mainnet-beta`
- Check wallet balances before running

### Treasury Not Initialized
**Issue:** `Treasury not initialized` error  
**Solution:**
- Run: `npx ts-node scripts/production/initialize-treasury.ts`
- Verify Treasury PDA exists

### Program Not Found
**Issue:** `Program account does not exist` error  
**Solution:**
- Verify program ID: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- Check program deployed: `solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta`

### RPC Rate Limit
**Issue:** `429 Too Many Requests`  
**Solution:**
- Use paid RPC provider (Helius/QuickNode)
- Add rate limiting between tests
- Use `--bail` flag to stop on first failure

---

## 🔒 Security Notes

### DO NOT:
- ❌ Commit production wallet private keys
- ❌ Use production treasury/admin wallets in tests
- ❌ Run tests with large amounts of SOL
- ❌ Share production API keys

### DO:
- ✅ Use dedicated test wallets (funded with small amounts)
- ✅ Verify wallet balances before/after tests
- ✅ Monitor transaction signatures
- ✅ Review test results for anomalies

---

## 📝 Test Coverage

**Current Coverage:**
- ✅ Basic swap flows (NFT↔SOL, NFT↔NFT)
- ✅ Fee collection and treasury
- ✅ Zero-fee authorization
- ✅ Nonce validation
- ✅ API endpoints
- ✅ Security validations

**Future Coverage:**
- ⏳ cNFT swaps (Task 25)
- ⏳ Multi-asset swaps
- ⏳ Expiry handling
- ⏳ Edge cases and error scenarios

---

## 📞 Support

**Issues during testing:**
1. Check this README for troubleshooting
2. Review test logs for error details
3. Verify production environment configuration
4. Check mainnet status: https://status.solana.com

---

**Last Updated:** December 5, 2025  
**Maintainer:** EasyEscrow.ai Team

