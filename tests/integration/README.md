# Integration Tests for Atomic Swap System

Integration tests verify that services work correctly together with real dependencies (database, RPC connections) but minimal external mocking.

## Test Files

### 1. `atomic-swap-flow.test.ts`
**Purpose:** Test complete swap flow with real service orchestration

**Coverage:**
- ✅ Complete swap lifecycle (create → accept → confirm)
- ✅ Direct offers (known taker)
- ✅ Open offers (any taker can accept)
- ✅ Counter-offers with parent relationships
- ✅ Offer cancellation with nonce advancement
- ✅ Nonce pool management and replenishment
- ✅ Fee calculation integration
- ✅ Database consistency and referential integrity
- ✅ Concurrent operations handling
- ✅ Error handling across service boundaries

**Dependencies:**
- Real PostgreSQL database (test instance)
- Real or mocked Solana RPC connection
- All services working together (minimal mocking)

**Runtime:** ~30 seconds

---

### 2. `atomic-swap-api.test.ts`
**Purpose:** Test HTTP API endpoints with supertest

**Coverage:**
- ✅ `POST /api/offers` - Create offers (direct and open)
- ✅ `GET /api/offers` - List and filter offers
- ✅ `GET /api/offers/:id` - Get offer details
- ✅ `POST /api/offers/:id/counter` - Create counter-offers
- ✅ `POST /api/offers/:id/accept` - Accept offers
- ✅ `POST /api/offers/:id/cancel` - Cancel offers
- ✅ `POST /api/offers/:id/confirm` - Confirm swaps
- ✅ Input validation and error responses
- ✅ Authorization checks
- ✅ Rate limiting (if implemented)

**Dependencies:**
- Running Express application
- Real database connection
- Service layer integration

**Runtime:** ~20 seconds

---

## Running Integration Tests

### Prerequisites

1. **Test Database Setup**
   ```bash
   # Set test database URL
   export TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/test_db"
   
   # Or use Docker test database
   docker-compose -f docker-compose.test.yml up -d
   
   # Run migrations
   DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
   ```

2. **Solana RPC (Optional)**
   ```bash
   # Use local test validator
   solana-test-validator
   
   # Or use devnet
   export TEST_RPC_URL="https://api.devnet.solana.com"
   ```

3. **Environment Variables**
   ```bash
   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/test_db
   TEST_RPC_URL=http://localhost:8899
   TEST_HELIUS_API_KEY=your-test-api-key
   ```

### Run All Integration Tests
```bash
npm run test:integration
```

### Run Specific Integration Tests
```bash
# Atomic swap flow
npm run test:integration:atomic-swap

# API endpoints
npm run test:integration:atomic-swap-api

# Resource tracking (legacy)
npm run test:integration:resource-tracking
```

### Run with Verbose Output
```bash
mocha --require ts-node/register --no-config tests/integration/atomic-swap-flow.test.ts --timeout 30000 --reporter spec --colors --full-trace
```

## Test Structure

```typescript
describe('Feature - Integration Tests', () => {
  // Real dependencies
  let connection: Connection;
  let prisma: PrismaClient;
  let services: AllServices;
  
  before(async () => {
    // Setup real connections
    connection = new Connection(TEST_RPC_URL);
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL }}});
    
    // Initialize services
    services = initializeServices(connection, prisma);
    
    // Prepare test data
    await setupTestData();
  });
  
  after(async () => {
    // Cleanup
    await cleanupTestData();
    await prisma.$disconnect();
  });
  
  describe('Scenario', () => {
    it('should test real interaction', async () => {
      // Arrange
      const params = createTestParams();
      
      // Act - call real services
      const result = await services.doSomething(params);
      
      // Assert - verify database state
      const dbState = await prisma.findRecord();
      expect(dbState).to.match(expected);
    });
  });
});
```

## Database Isolation

Integration tests clean up data before and after each test:

```typescript
before(async () => {
  // Clean slate
  await prisma.swapTransaction.deleteMany();
  await prisma.swapOffer.deleteMany();
  await prisma.noncePool.deleteMany();
  await prisma.user.deleteMany();
});

after(async () => {
  // Cleanup after tests
  await prisma.swapTransaction.deleteMany();
  await prisma.swapOffer.deleteMany();
  await prisma.$disconnect();
});
```

## Common Issues

### Issue: Database connection failed
**Solution:** Ensure `TEST_DATABASE_URL` is set and database is running
```bash
docker-compose -f docker-compose.test.yml up -d
export TEST_DATABASE_URL="postgresql://..."
```

### Issue: Solana RPC timeout
**Solution:** Use local test validator or increase timeout
```bash
# Start local validator
solana-test-validator

# Or increase timeout
mocha --timeout 60000 ...
```

### Issue: Nonce pool initialization fails
**Solution:** Ensure platform authority is funded (on localnet)
```bash
# Airdrop to platform authority
solana airdrop 10 <PLATFORM_AUTHORITY_ADDRESS>
```

### Issue: Tests fail with "port already in use"
**Solution:** Stop any running instances
```bash
# Find and kill process
lsof -ti:8080 | xargs kill -9

# Or use different port
PORT=8081 npm run test:integration
```

## CI/CD Integration

Integration tests can run in CI with some adjustments:

```yaml
# .github/workflows/test.yml
- name: Setup Test Database
  run: |
    docker-compose -f docker-compose.test.yml up -d
    sleep 10
    DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy

- name: Run Integration Tests
  run: npm run test:integration
  env:
    TEST_DATABASE_URL: postgresql://test:test@localhost:5432/test_db
    TEST_RPC_URL: http://localhost:8899
```

## Performance Benchmarks

| Test Suite | Expected Duration | Max Duration |
|------------|-------------------|--------------|
| atomic-swap-flow | 20-25s | 30s |
| atomic-swap-api | 15-18s | 20s |
| All integration | 35-45s | 60s |

If tests exceed max duration, investigate:
- Database query performance
- Network latency (RPC calls)
- Inefficient test setup/teardown

## Debugging

### Enable Verbose Logging
```bash
DEBUG=* npm run test:integration:atomic-swap
```

### Run Single Test Case
```bash
mocha --require ts-node/register --no-config tests/integration/atomic-swap-flow.test.ts --grep "should create and accept an open offer"
```

### Inspect Database State
```bash
# After test failure, inspect database
psql $TEST_DATABASE_URL

# Check swap offers
SELECT * FROM "SwapOffer" ORDER BY "createdAt" DESC LIMIT 10;

# Check nonce pool
SELECT * FROM "NoncePool" WHERE status = 'IN_USE';
```

## Best Practices

1. **Use Transactions**: Wrap test operations in database transactions for easy rollback
2. **Cleanup Data**: Always clean up test data in `after` hooks
3. **Realistic Scenarios**: Test actual user flows, not just happy paths
4. **Error Paths**: Test failure modes and error handling
5. **Performance**: Keep tests fast (< 30s per suite)
6. **Isolation**: Tests should not depend on each other

## Next Steps

After integration tests pass:

1. **Smoke Tests**: Quick validation that system is operational (`tests/smoke/`)
2. **E2E Tests**: Full user journeys on staging environment
3. **Load Tests**: Concurrent swap stress testing
4. **Security Tests**: Attack scenarios and validation

## Related Documentation

- [Unit Tests](../unit/README.md) - Isolated service testing
- [Smoke Tests](../smoke/README.md) - Quick health checks
- [Testing Guidelines](.cursor/rules/testing.mdc) - Running tests properly
- [Database Schema](../../prisma/schema.prisma) - Data models

---

**Status:** ✅ Ready for implementation validation  
**Runtime:** ~35-45 seconds total  
**Coverage:** Service integration, API endpoints, database operations

