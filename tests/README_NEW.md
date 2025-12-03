# Test Suite - Atomic Swap System

Comprehensive testing suite for the EasyEscrow.ai Atomic Swap backend covering unit tests, integration tests, smoke tests, and end-to-end tests.

**📌 Important:** This project has pivoted from an escrow agreement system to an atomic swap system. Old escrow tests have been archived in [`legacy/`](legacy/README.md).

---

## 🚀 Quick Start

### Run All Tests
```bash
# Unit tests (Jest - fast)
npm run test:unit

# Integration tests (Mocha)
npm run test:integration

# Smoke tests
npm run test:smoke
```

### Run Specific Test Suites

#### Atomic Swap Tests
```bash
# Local atomic swap test (with local validator)
npm run test:atomic-swap:local

# Staging e2e (devnet)
npm run test:staging:e2e:all

# Production e2e (mainnet - read-only)
npm run test:production:e2e:all

# Atomic swap integration tests
npm run test:integration:atomic-swap
npm run test:integration:atomic-swap-api

# Atomic swap smoke test
npm run test:smoke:atomic-swap
```

#### Unit Tests (by service)
```bash
# All unit tests with coverage
npm run test:unit

# Watch mode (Jest)
npm run test:unit:watch

# Specific service tests (Mocha)
npm run test:unit:mocha
```

---

## 📁 Directory Structure

```
tests/
├── fixtures/                   # Test data and configuration
├── helpers/                    # Test utilities and mocks
│   ├── mock-services.ts
│   ├── test-database.ts
│   └── test-utils.ts
├── integration/                # Integration tests
│   ├── atomic-swap-api.test.ts         ✅ Atomic swap API tests
│   ├── atomic-swap-flow.test.ts        ✅ Atomic swap flow tests
│   └── ... (other integration tests)
├── legacy/                     # 📦 Archived escrow agreement tests
│   ├── README.md               # Documentation of archived tests
│   ├── escrow.ts
│   ├── development-e2e/
│   ├── production-e2e/
│   └── staging-e2e/
├── migrations/                 # Database migration tests
├── pre-deployment/            # Pre-deployment validation
├── production/                 # Production tests
│   ├── production-all-e2e.test.ts      ✅ NEW: Production health checks
│   └── security/
├── security/                   # Security tests
├── smoke/                      # Smoke tests
│   └── atomic-swap-smoke.test.ts       ✅ Atomic swap smoke tests
├── staging/                    # Staging tests
│   ├── staging-all-e2e.test.ts         ✅ NEW: Staging e2e validation
│   └── security/
├── unit/                       # Unit tests
│   ├── assetValidator.test.ts          ✅ NEW: Asset validation
│   ├── database.test.ts                ✅ NEW: Database operations
│   ├── feeCalculator.test.ts           ✅ NEW: Fee calculation
│   ├── noncePoolManager.test.ts        ✅ NEW: Nonce pool management
│   ├── offerManager.test.ts            ✅ NEW: Offer management
│   ├── transactionBuilder.test.ts      ✅ NEW: Transaction building
│   └── ... (other unit tests)
├── setup.ts                    # Jest setup
└── README.md                   # This file
```

---

## 🧪 Test Types

### Unit Tests (Jest)
**Location:** `tests/unit/`  
**Runner:** Jest  
**Speed:** Fast (< 10s)  
**Purpose:** Test individual services in isolation

**Key Test Files:**
- `assetValidator.test.ts` - NFT/cNFT ownership validation
- `feeCalculator.test.ts` - Platform fee calculation
- `noncePoolManager.test.ts` - Durable nonce pool management
- `transactionBuilder.test.ts` - Solana transaction construction
- `offerManager.test.ts` - Swap offer lifecycle
- `database.test.ts` - Database schema and operations

**Run:** `npm run test:unit`

### Integration Tests (Mocha)
**Location:** `tests/integration/`  
**Runner:** Mocha  
**Speed:** Medium (20-30s)  
**Purpose:** Test service interactions and API endpoints

**Key Test Files:**
- `atomic-swap-flow.test.ts` - Complete swap flow integration
- `atomic-swap-api.test.ts` - HTTP API endpoint testing
- `resource-tracking.test.ts` - Resource usage tracking

**Run:** `npm run test:integration`

### Smoke Tests (Mocha)
**Location:** `tests/smoke/`  
**Runner:** Mocha  
**Speed:** Fast (< 30s)  
**Purpose:** Quick validation of critical paths

**Key Test Files:**
- `atomic-swap-smoke.test.ts` - Critical atomic swap paths

**Run:** `npm run test:smoke`

### E2E Tests (Mocha)
**Purpose:** Validate complete system on different environments

#### Local E2E
**File:** `scripts/testing/test-atomic-swap-local.ts`  
**Network:** localnet  
**Speed:** Medium (< 60s)  
**Run:** `npm run test:atomic-swap:local`

**Features:**
- Starts local validator
- Deploys program
- Executes real SOL swaps
- Validates balances and treasury

#### Staging E2E
**File:** `tests/staging/staging-all-e2e.test.ts`  
**Network:** devnet  
**Speed:** Slow (2-3 min)  
**Run:** `npm run test:staging:e2e:all`

**Features:**
- Program deployment verification
- Treasury health checks
- Test structure for SOL swaps
- Requires funded accounts on devnet

#### Production E2E
**File:** `tests/production/production-all-e2e.test.ts`  
**Network:** mainnet-beta  
**Speed:** Slow (2-3 min)  
**Run:** `npm run test:production:e2e:all`

**Features:**
- Program health monitoring
- Treasury analytics
- RPC performance measurement
- Security validation
- **⚠️ Read-only operations (no state changes)**

---

## 🎯 Test Coverage

### Current Status
- **Total Tests:** 450+ tests
- **Unit Test Pass Rate:** 76% (324/442)
- **Integration Tests:** All passing
- **Smoke Tests:** All passing
- **Local E2E:** 100% passing

### Coverage by Service
- ✅ **FeeCalculator:** 30+ tests (100% passing)
- ✅ **NoncePoolManager:** 20+ tests (100% passing)
- ✅ **AssetValidator:** 25+ tests (100% passing)
- ✅ **TransactionBuilder:** 30+ tests (100% passing)
- ✅ **OfferManager:** 40+ tests (100% passing)
- ✅ **Database:** 15+ tests (100% passing)

### Known Issues
- Some legacy unit tests need updating for atomic swap model
- Jest configuration needs refinement for remaining 24% of tests

---

## 📋 Testing Workflows

### Development Workflow
```bash
# 1. Make code changes
# 2. Run relevant unit tests
npm run test:unit

# 3. Run integration tests
npm run test:integration

# 4. Run local e2e test
npm run test:atomic-swap:local

# 5. Commit if all pass
```

### Pre-Deployment Workflow
```bash
# 1. Run all unit tests
npm run test:unit

# 2. Run all integration tests
npm run test:integration

# 3. Run smoke tests
npm run test:smoke

# 4. Deploy to staging
# 5. Run staging e2e tests
npm run test:staging:e2e:all

# 6. If all pass, deploy to production
```

### Production Monitoring
```bash
# Run production health checks regularly
npm run test:production:e2e:all

# Monitor:
# - Program health
# - Treasury stats
# - RPC performance
# - Security validation
```

---

## 🛠️ Test Configuration

### Environment Variables

#### For Unit Tests
```bash
# Set test environment
NODE_ENV=test

# Database (optional - uses test database by default)
DATABASE_URL=postgresql://test:test@localhost:5432/test_db
```

#### For Staging E2E
```bash
# Solana RPC (optional - defaults to devnet)
STAGING_SOLANA_RPC_URL=https://api.devnet.solana.com

# Platform authority keypair (optional)
STAGING_ADMIN_PRIVATE_KEY_PATH=wallets/staging/staging-deployer.json
```

#### For Production E2E
```bash
# Solana RPC (recommended: use paid RPC for reliability)
PRODUCTION_SOLANA_RPC_URL=https://your-mainnet-rpc.com

# Platform authority keypair (optional)
PRODUCTION_ADMIN_PRIVATE_KEY_PATH=wallets/production/production-deployer.json
```

### Test Timeouts
- **Unit tests:** 10,000ms (10 seconds)
- **Integration tests:** 20,000ms (20 seconds)
- **Smoke tests:** 30,000ms (30 seconds)
- **E2E tests:** 180,000ms (3 minutes)

---

## 📚 Testing Best Practices

### Unit Tests
- ✅ Test one thing at a time
- ✅ Use mocks for external dependencies
- ✅ Follow AAA pattern (Arrange, Act, Assert)
- ✅ Use descriptive test names
- ✅ Clean up after each test (afterEach)

### Integration Tests
- ✅ Test realistic user flows
- ✅ Use test database
- ✅ Clean up test data
- ✅ Test error scenarios
- ✅ Verify API contracts

### E2E Tests
- ✅ Test critical paths only
- ✅ Use staging before production
- ✅ Verify balances and state changes
- ✅ Handle network delays
- ✅ Document test accounts

---

## 🔧 Debugging Tests

### Run Single Test File
```bash
# Jest (unit tests)
npm run test:unit -- path/to/test.test.ts

# Mocha (integration/smoke/e2e)
mocha --require ts-node/register --no-config path/to/test.test.ts --timeout 30000
```

### Run Specific Test Case
```bash
# Jest
npm run test:unit -- -t "test name"

# Mocha
mocha --require ts-node/register --no-config path/to/test.test.ts --grep "test name"
```

### Verbose Output
```bash
# Jest
npm run test:unit -- --verbose

# Mocha with full trace
mocha --require ts-node/register --no-config path/to/test.test.ts --full-trace
```

---

## 📖 Additional Documentation

- **Legacy Tests:** [legacy/README.md](legacy/README.md)
- **Testing Rules:** [../.cursor/rules/testing.mdc](../.cursor/rules/testing.mdc)
- **Local Testing:** [../docs/tasks/LOCAL_TESTING_COMPLETE.md](../docs/tasks/LOCAL_TESTING_COMPLETE.md)
- **Test Reorganization:** [../docs/tasks/TEST_REORGANIZATION_COMPLETE.md](../docs/tasks/TEST_REORGANIZATION_COMPLETE.md)

---

## 🎯 CI/CD Integration

```bash
# Run in CI pipeline
npm run test:ci

# This runs:
# 1. npm run test:unit
# 2. npm run test:integration
```

---

## ✅ Test Checklist

Before committing:
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Local e2e test passes (if Solana changes)
- [ ] No linter errors
- [ ] Code coverage maintained or improved

Before deploying to staging:
- [ ] All tests pass locally
- [ ] Smoke tests pass
- [ ] Database migrations tested

Before deploying to production:
- [ ] Staging e2e tests pass
- [ ] Security review complete
- [ ] Production health checks configured

---

**Last Updated:** November 17, 2025  
**Test Framework:** Jest (unit) + Mocha (integration/e2e)  
**Coverage:** 450+ tests across all layers  
**Status:** ✅ Active and maintained

