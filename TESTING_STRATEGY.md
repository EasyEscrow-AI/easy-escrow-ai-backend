# Testing Strategy for EasyEscrow.ai Backend

## Overview

This document outlines the comprehensive testing strategy for the EasyEscrow.ai backend, covering both on-chain (Solana smart contracts) and off-chain (API services) components.

## Table of Contents

1. [Testing Levels](#testing-levels)
2. [Test Structure](#test-structure)
3. [Testing Tools](#testing-tools)
4. [Running Tests](#running-tests)
5. [Test Coverage Goals](#test-coverage-goals)
6. [On-Chain Testing](#on-chain-testing)
7. [Off-Chain Testing](#off-chain-testing)
8. [Continuous Integration](#continuous-integration)
9. [Best Practices](#best-practices)

## Testing Levels

### 1. Unit Tests
- **Location**: `tests/unit/`
- **Purpose**: Test individual functions and modules in isolation
- **Scope**: Services, utilities, helpers, data transformations
- **Mock Dependencies**: Yes
- **Database**: Not required

### 2. Integration Tests
- **Location**: `tests/integration/`
- **Purpose**: Test API endpoints and service interactions
- **Scope**: REST API routes, database operations, service orchestration
- **Mock Dependencies**: Partial (external services only)
- **Database**: Test database required

### 3. On-Chain Tests
- **Location**: `tests/on-chain/` and `tests/escrow.ts`
- **Purpose**: Test Solana smart contract functionality
- **Scope**: Escrow program instructions, account validation, security checks
- **Environment**: Local Solana validator
- **Network**: Localnet/Devnet

## Test Structure

```
tests/
├── unit/                          # Unit tests for services
│   ├── agreement.service.test.ts
│   ├── solana.service.test.ts
│   ├── deposit.service.test.ts
│   └── status-update.service.test.ts
├── integration/                   # API integration tests
│   └── agreement-api.test.ts
├── on-chain/                      # Comprehensive on-chain tests
│   └── escrow-comprehensive.test.ts
├── helpers/                       # Test utilities
│   ├── test-database.ts
│   ├── test-utils.ts
│   ├── test-app.ts
│   └── mock-services.ts
├── fixtures/                      # Test data
│   └── test-data.ts
├── escrow.ts                      # Original Anchor tests
└── integration-test-devnet.ts     # Devnet integration tests
```

## Testing Tools

### Core Frameworks
- **Mocha**: Test framework
- **Chai**: Assertion library
- **Sinon**: Mocking and stubbing
- **Supertest**: HTTP API testing

### Blockchain Testing
- **Anchor Framework**: Solana program testing
- **@solana/web3.js**: Blockchain interactions
- **@solana/spl-token**: Token operations

### Database Testing
- **Prisma**: Database ORM
- **PostgreSQL**: Test database

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### On-Chain Tests (Original Anchor)
```bash
npm run test:on-chain
# OR
anchor test
```

### Comprehensive On-Chain Tests
```bash
npm run test:on-chain:comprehensive
```

### Watch Mode (Auto-rerun on changes)
```bash
npm run test:watch
```

### CI Tests (Unit + Integration)
```bash
npm run test:ci
```

## Test Coverage Goals

### Target Coverage
- **Unit Tests**: 80%+ code coverage
- **Integration Tests**: All API endpoints
- **On-Chain Tests**: All program instructions and security scenarios

### Critical Paths (100% Coverage Required)
- Payment processing and settlement
- Deposit detection and validation
- Fee calculations
- Status transitions
- Security and authorization checks

## On-Chain Testing

### Test Categories

#### 1. Happy Path Tests
- ✅ USDC deposited first, then NFT
- ✅ NFT deposited first, then USDC
- ✅ Successful settlement
- ✅ Complete escrow lifecycle

#### 2. Security Tests
- ✅ Wrong USDC mint rejection
- ✅ Wrong NFT mint rejection
- ✅ Under-funding protection (price - 1)
- ✅ Over-funding detection (price + 1)
- ✅ Double-deposit prevention
- ✅ Double-settle prevention
- ✅ Unauthorized admin cancel blocking
- ✅ PDA/account spoofing prevention

#### 3. Edge Cases
- ✅ Expiry-based refunds
- ✅ Early cancellation attempts
- ✅ Late cancellation after settlement
- ✅ Partial deposit scenarios
- ✅ Network failure handling
- ✅ Timeout scenarios

#### 4. System Invariants
- ✅ Rent-exempt vault management
- ✅ Precise fee collection to lamport level
- ✅ Optional royalties distribution
- ✅ Event field validation
- ✅ State consistency checks

### On-Chain Test Setup

```typescript
// Example test setup
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.Escrow as Program<Escrow>;

// Create test accounts
const buyer = Keypair.generate();
const seller = Keypair.generate();

// Airdrop SOL for gas
await provider.connection.requestAirdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL);

// Create test mints
const usdcMint = await createMint(provider.connection, buyer, buyer.publicKey, null, 6);
const nftMint = await createMint(provider.connection, seller, seller.publicKey, null, 0);
```

## Off-Chain Testing

### Unit Test Categories

#### 1. Service Logic
- Agreement creation and validation
- Deposit processing
- Status update logic
- Fee calculations
- Expiry checking

#### 2. Data Validation
- DTO validation
- Price format validation
- Address format validation
- Date/time validation
- Amount precision

#### 3. Business Rules
- Status transition rules
- Cancellation eligibility
- Settlement prerequisites
- Refund conditions

### Integration Test Categories

#### 1. API Endpoints
- POST /v1/agreements - Create agreement
- GET /v1/agreements/:id - Get agreement details
- GET /v1/agreements - List agreements with filters
- POST /v1/agreements/:id/cancel - Cancel expired agreement

#### 2. Idempotency
- Duplicate request handling
- Idempotency key validation
- Race condition prevention

#### 3. Database Operations
- Transaction integrity
- Concurrent access handling
- Data consistency checks
- Constraint validation

#### 4. Error Handling
- Validation errors (400)
- Not found errors (404)
- Server errors (500)
- Rate limiting (429)

### Integration Test Example

```typescript
describe('POST /v1/agreements', () => {
  it('should create a new agreement with valid data', async () => {
    const response = await request(app)
      .post('/v1/agreements')
      .send(validAgreementData)
      .expect(201);

    expect(response.body).to.have.property('success', true);
    expect(response.body.data).to.have.property('agreementId');
  });
});
```

## Continuous Integration

### GitHub Actions Workflow

The CI pipeline runs three parallel jobs:

1. **Unit Tests**
   - Fast execution
   - No external dependencies
   - Runs on every push/PR

2. **Integration Tests**
   - PostgreSQL database service
   - Database migrations
   - API endpoint testing

3. **On-Chain Tests**
   - Solana CLI installation
   - Anchor framework setup
   - Local validator testing

### CI Configuration

See `.github/workflows/test.yml` for the complete CI configuration.

## Best Practices

### 1. Test Organization
- ✅ One test file per service/component
- ✅ Descriptive test names
- ✅ Grouped related tests with `describe` blocks
- ✅ Clear test data in fixtures

### 2. Test Independence
- ✅ Each test should be independent
- ✅ Use `beforeEach` and `afterEach` for setup/teardown
- ✅ Clean up test data after each test
- ✅ Don't rely on test execution order

### 3. Mocking Strategy
- ✅ Mock external services (blockchain, third-party APIs)
- ✅ Don't mock internal business logic
- ✅ Use real database for integration tests
- ✅ Restore all mocks in `afterEach`

### 4. Assertions
- ✅ Use specific assertions (`expect(x).to.equal(y)`)
- ✅ Avoid generic assertions (`expect(x).to.be.ok`)
- ✅ Test both positive and negative cases
- ✅ Verify error messages and types

### 5. Test Data
- ✅ Use fixtures for complex test data
- ✅ Generate unique IDs to avoid collisions
- ✅ Use realistic data (valid addresses, amounts)
- ✅ Document special test cases

### 6. On-Chain Testing
- ✅ Always wait for transaction confirmation
- ✅ Verify account state after operations
- ✅ Test with realistic gas limits
- ✅ Check all event emissions
- ✅ Validate PDA derivations
- ✅ Test account ownership

### 7. Performance
- ✅ Keep unit tests fast (< 100ms each)
- ✅ Use appropriate timeouts for on-chain tests
- ✅ Parallelize independent tests
- ✅ Cache blockchain setup when possible

### 8. Coverage
- ✅ Aim for 80%+ code coverage
- ✅ Focus on critical paths
- ✅ Don't chase 100% coverage
- ✅ Test edge cases and error paths

## Test Data Management

### Fixtures
Reusable test data is stored in `tests/fixtures/test-data.ts`:
- Agreement fixtures (pending, expired, settled)
- Deposit fixtures (USDC, NFT)
- DTO fixtures (valid, invalid cases)

### Test Utilities
Helper functions in `tests/helpers/`:
- `test-database.ts`: Database setup and cleanup
- `test-utils.ts`: Common test utilities
- `test-app.ts`: Express app for integration tests
- `mock-services.ts`: Service mocking utilities

## Debugging Tests

### Enable Verbose Logging
```bash
DEBUG=* npm test
```

### Run Single Test File
```bash
mocha --require ts-node/register tests/unit/agreement.service.test.ts
```

### Run Single Test Case
```bash
mocha --require ts-node/register tests/unit/agreement.service.test.ts --grep "should create"
```

### Anchor Test Logs
```bash
anchor test -- --show-logs
```

## Future Enhancements

### Planned Improvements
1. [ ] Code coverage reporting with Istanbul/nyc
2. [ ] Performance benchmarking tests
3. [ ] Load testing for API endpoints
4. [ ] Contract upgrade testing
5. [ ] Fuzz testing for security
6. [ ] E2E tests with frontend
7. [ ] Chaos engineering tests

### Test Automation
1. [ ] Automatic test generation from OpenAPI spec
2. [ ] Property-based testing with fast-check
3. [ ] Visual regression testing for reports
4. [ ] Automated security scanning

## Resources

- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertion Library](https://www.chaijs.com/)
- [Anchor Testing Guide](https://www.anchor-lang.com/docs/testing)
- [Solana Cookbook - Testing](https://solanacookbook.com/references/local-development.html#testing)
- [Supertest Documentation](https://github.com/visionmedia/supertest)

## Support

For questions about testing:
1. Review this documentation
2. Check existing test files for examples
3. Consult the Anchor/Solana testing guides
4. Ask the development team

---

**Last Updated**: October 2025
**Maintained By**: Development Team

