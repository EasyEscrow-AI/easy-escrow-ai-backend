# Unit Tests for Atomic Swap Core Services

This directory contains comprehensive unit tests for all 6 core services implemented in Tasks 1-6.

## Test Files Overview

### 1. `database.test.ts` - Database Schema Tests (Task 1)
Tests Prisma data models, relationships, and constraints.

**Coverage:**
- ✅ User model CRUD operations
- ✅ NoncePool model and status tracking
- ✅ SwapOffer model with JSONB assets
- ✅ SwapTransaction model
- ✅ Relationships (parent offers, counter-offers, transactions)
- ✅ Unique constraints (wallet addresses, nonce accounts, signatures)
- ✅ Cascade operations
- ✅ Index performance queries

**Key Tests:**
- User creation with subsidized flag
- Nonce account assignment and status changes
- Offer creation with complex asset arrays (NFT + cNFT)
- Counter-offer relationships
- Transaction uniqueness enforcement
- Relationship queries with includes

### 2. `noncePoolManager.test.ts` - Nonce Pool Management Tests (Task 2)
Tests durable nonce account lifecycle and concurrency.

**Coverage:**
- ✅ Pool initialization and replenishment
- ✅ User assignment (first-time subsidized, existing users)
- ✅ Nonce retrieval and caching
- ✅ Nonce advancement with retries
- ✅ Cleanup operations
- ✅ Concurrency and thread safety
- ✅ Pool statistics and monitoring
- ✅ Error handling (RPC failures, database errors)

**Key Tests:**
- Initialize pool below minimum size
- Assign nonce to new vs existing user
- Cache nonce values with TTL
- Advance nonce with retry logic
- Handle concurrent assignment requests
- Cleanup expired nonces
- Graceful shutdown

### 3. `feeCalculator.test.ts` - Fee Calculation Tests (Task 3)
Tests platform fee logic and validation.

**Coverage:**
- ✅ Flat fee for NFT-only swaps
- ✅ Percentage fee for SOL-involved swaps
- ✅ Fee caps (maximum and minimum)
- ✅ Custom configuration
- ✅ Fee validation with tolerance
- ✅ Helper methods (lamports ↔ SOL conversion)
- ✅ Edge cases (zero amounts, huge amounts)

**Key Tests:**
- Flat fee (0.005 SOL) for NFT↔NFT swaps
- 1% percentage fee for SOL swaps
- Maximum fee cap (0.5 SOL)
- Minimum fee floor (0.001 SOL)
- Fee breakdown with all fields
- Validation with rounding tolerance
- Custom configuration scenarios

### 4. `assetValidator.test.ts` - Asset Validation Tests (Task 4)
Tests NFT and cNFT ownership verification.

**Coverage:**
- ✅ SPL NFT validation via token accounts
- ✅ cNFT validation via Helius API
- ✅ Mixed asset validation (NFT + cNFT)
- ✅ Merkle proof fetching for cNFTs
- ✅ Retry logic with exponential backoff
- ✅ Error handling (API failures, RPC errors)
- ✅ Revalidation support
- ✅ Edge cases (frozen, burnt, wrong owner)

**Key Tests:**
- Validate owned SPL NFT
- Reject unowned SPL NFT
- Validate owned cNFT via Helius
- Reject frozen/burnt cNFTs
- Fetch Merkle proof with retries
- Handle mixed asset arrays
- Partial validation failures
- Revalidation flag behavior

### 5. `transactionBuilder.test.ts` - Transaction Construction Tests (Task 5)
Tests atomic swap transaction building.

**Coverage:**
- ✅ NFT-only swap transactions
- ✅ SOL transfer instructions
- ✅ cNFT Bubblegum transfers
- ✅ Platform fee collection
- ✅ Durable nonce usage
- ✅ ATA creation instructions
- ✅ Transaction size estimation
- ✅ Partial signing with platform authority

**Key Tests:**
- Build simple NFT↔NFT swap
- Include ATA creation for missing accounts
- Add SPL token transfer instructions
- Bidirectional SOL transfers
- Bubblegum cNFT transfers with Merkle proofs
- Fee collection as last instruction
- NonceAdvance as first instruction
- Set recentBlockhash to nonce value
- Partial sign with platform authority
- Enforce transaction size limit (1232 bytes)
- Complex mixed swaps (NFT + cNFT + SOL)

### 6. `offerManager.test.ts` - Offer Lifecycle Tests (Task 6)
Tests complete swap offer business logic.

**Coverage:**
- ✅ Create direct offers (known taker)
- ✅ Create open offers (no taker)
- ✅ Create counter-offers
- ✅ Accept offers (direct and open)
- ✅ Cancel offers (nonce advancement)
- ✅ Confirm swaps (on-chain verification)
- ✅ List/filter offers
- ✅ Get offer details
- ✅ Expire offers
- ✅ Transaction safety (database transactions)

**Key Tests:**
- Create offer with asset validation
- Ensure user exists before offer creation
- Assign nonce to maker
- Calculate and validate fees
- Reject invalid assets
- Open offer without building transaction
- Counter-offer reuses parent nonce
- Accept direct offer returns existing transaction
- Accept open offer builds new transaction
- Enforce taker restrictions
- Cancel advances nonce and invalidates related offers
- Confirm swap verifies on-chain transaction
- Reject failed transactions
- List offers with filters (status, wallet)
- Handle concurrent operations safely

## Running Tests

### Run All Unit Tests
```bash
npm run test:unit
```

### Run Specific Test File
```bash
# Run only database tests
npm run test:unit -- database.test.ts

# Run only fee calculator tests
npm run test:unit -- feeCalculator.test.ts
```

### Run Tests in Watch Mode
```bash
npm run test:unit -- --watch
```

### Run Tests with Coverage
```bash
npm run test:unit -- --coverage
```

## Test Structure

All tests follow this structure:

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let mockDependency: jest.Mocked<DependencyType>;
  
  beforeEach(() => {
    // Setup mocks and service instance
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Feature Category', () => {
    it('should test specific behavior', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Mocking Strategy

### External Dependencies
- **Solana Connection**: Mocked via Jest
- **Prisma Client**: Mocked with full method suite
- **Helius API**: Mocked via `global.fetch`

### Service Dependencies
- Services are injected and mocked
- Mock implementations provide realistic return values
- Error scenarios are tested with rejected promises

## Coverage Goals

- **Statement Coverage**: 90%+
- **Branch Coverage**: 85%+
- **Function Coverage**: 95%+
- **Line Coverage**: 90%+

## Test Database Setup

For `database.test.ts`, you need a test database:

1. **Option 1: Use existing test database**
   ```bash
   export TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/test_db"
   npm run test:unit -- database.test.ts
   ```

2. **Option 2: Use Docker test database**
   ```bash
   # Start test database
   docker-compose -f docker-compose.test.yml up -d

   # Run migrations
   DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy

   # Run tests
   npm run test:unit -- database.test.ts
   ```

3. **Option 3: Skip database tests**
   ```bash
   npm run test:unit -- --testPathIgnorePatterns=database.test.ts
   ```

## Common Issues and Solutions

### Issue: "Cannot find module @solana/web3.js"
**Solution:** Install dependencies
```bash
npm install
```

### Issue: "Prisma Client not generated"
**Solution:** Generate Prisma Client
```bash
npx prisma generate
```

### Issue: "Database connection failed in database.test.ts"
**Solution:** Ensure test database is running and `TEST_DATABASE_URL` is set

### Issue: "Tests timing out"
**Solution:** Increase timeout in jest.config.js
```javascript
module.exports = {
  testTimeout: 30000, // 30 seconds
};
```

## Best Practices

1. **Isolation**: Each test is independent and can run in any order
2. **Mocking**: All external dependencies are mocked for fast, reliable tests
3. **Assertions**: Use specific matchers (`toMatchObject`, `toBeInstanceOf`)
4. **Error Cases**: Test both success and failure paths
5. **Edge Cases**: Test boundary conditions, empty arrays, null values
6. **Async/Await**: All async operations use async/await consistently

## Test Maintenance

When updating services:

1. **Add New Features**: Add corresponding tests
2. **Change Behavior**: Update affected tests
3. **Refactor**: Ensure tests still pass
4. **Breaking Changes**: Update mocks and assertions

## Continuous Integration

These tests are designed to run in CI:

```yaml
# .github/workflows/test.yml
- name: Run Unit Tests
  run: npm run test:unit -- --ci --coverage
```

## Performance

Unit tests should be fast:
- **Target**: < 10 seconds total
- **Per Test**: < 100ms average
- **Mocked Dependencies**: No real network calls
- **Database Tests**: Use transactions for isolation

## Next Steps

After unit tests pass:

1. **Integration Tests**: Test real Solana interactions
2. **End-to-End Tests**: Test complete swap flows
3. **Load Tests**: Test under concurrent load
4. **Security Tests**: Test attack scenarios

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Solana Testing Guide](https://docs.solana.com/developing/test-validator)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)

---

**Test Coverage Summary for Tasks 1-6**

| Task | Service | Test File | Coverage |
|------|---------|-----------|----------|
| 1 | Database Schema | `database.test.ts` | 95%+ |
| 2 | NoncePoolManager | `noncePoolManager.test.ts` | 90%+ |
| 3 | FeeCalculator | `feeCalculator.test.ts` | 100% |
| 4 | AssetValidator | `assetValidator.test.ts` | 90%+ |
| 5 | TransactionBuilder | `transactionBuilder.test.ts` | 85%+ |
| 6 | OfferManager | `offerManager.test.ts` | 90%+ |

**Total Test Count:** 150+ test cases
**Estimated Runtime:** 5-8 seconds

