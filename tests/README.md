# Test Suite

Comprehensive testing suite for EasyEscrow.ai backend covering unit tests, integration tests, and on-chain smart contract tests.

## Quick Start

### Run All Tests
```bash
npm test
```

### Run Specific Test Types
```bash
# Unit tests only (fast)
npm run test:unit

# Integration tests only
npm run test:integration

# On-chain tests (Anchor)
npm run test:on-chain

# Comprehensive on-chain tests
npm run test:on-chain:comprehensive

# End-to-end devnet tests
npm run test:e2e:devnet

# Watch mode (auto-rerun)
npm run test:watch

# CI pipeline tests
npm run test:ci
```

## Test Structure

### Unit Tests (`unit/`)
Test individual services and utilities in isolation with mocked dependencies.

**Files:**
- `agreement.service.test.ts` - Agreement service logic
- `solana.service.test.ts` - Solana blockchain utilities
- `deposit.service.test.ts` - Deposit validation and processing
- `status-update.service.test.ts` - Status transition logic

**Run:** `npm run test:unit`

### Integration Tests (`integration/`)
Test full API request/response cycles with real database interactions.

**Files:**
- `agreement-api.test.ts` - Agreement API endpoints

**Run:** `npm run test:integration`

### On-Chain Tests (`on-chain/`)
Test Solana smart contract functionality with local validator.

**Files:**
- `escrow-comprehensive.test.ts` - Comprehensive escrow program tests including:
  - Happy path scenarios (USDC first, NFT first)
  - Security tests (wrong mints, under/over-funding, double operations)
  - Unauthorized access prevention
  - Edge cases and attack vectors

**Run:** `npm run test:on-chain:comprehensive`

### End-to-End Tests (`e2e/`)
Test complete system on actual Solana devnet with real transactions.

**Files:**
- `devnet-e2e.test.ts` - Comprehensive E2E tests covering:
  - Happy path (complete escrow flow)
  - Expiry and refund scenarios
  - Race condition handling
  - Fee collection validation
  - Receipt generation

**Run:** `npm run test:e2e:devnet`

**See:** [E2E Testing Documentation](e2e/README.md)

### Test Helpers (`helpers/`)
Reusable utilities for test setup and execution.

**Files:**
- `test-database.ts` - Database setup, cleanup, and utilities
- `test-utils.ts` - Common test utilities and helpers
- `test-app.ts` - Express app factory for integration tests
- `mock-services.ts` - Service mocking utilities

### Test Fixtures (`fixtures/`)
Predefined test data for consistent testing.

**Files:**
- `test-data.ts` - Test agreements, deposits, and DTOs

## Writing Tests

### Unit Test Example

```typescript
import { expect } from 'chai';
import sinon from 'sinon';

describe('MyService - Unit Tests', () => {
  let myStub: sinon.SinonStub;

  beforeEach(() => {
    myStub = sinon.stub(externalService, 'method');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should do something', () => {
    myStub.resolves({ data: 'test' });
    
    const result = myService.doSomething();
    
    expect(result).to.equal('test');
  });
});
```

### Integration Test Example

```typescript
import { expect } from 'chai';
import request from 'supertest';
import { createTestApp } from '../helpers/test-app';

describe('My API - Integration Tests', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  it('should return data', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .expect(200);

    expect(response.body).to.have.property('data');
  });
});
```

### On-Chain Test Example

```typescript
import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

describe("Escrow Program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Escrow;

  it("should initialize escrow", async () => {
    await program.methods
      .initAgreement(escrowId, amount, expiry)
      .accounts({ /* ... */ })
      .signers([buyer])
      .rpc();

    const escrowAccount = await program.account.escrowState.fetch(escrowPda);
    assert.equal(escrowAccount.buyer.toString(), buyer.publicKey.toString());
  });
});
```

## Test Coverage

### Current Coverage
- ✅ Unit tests for core services
- ✅ Integration tests for all API endpoints
- ✅ On-chain tests for all smart contract instructions
- ✅ Security and edge case scenarios
- ✅ Happy path and error handling

### Critical Paths (100% Coverage Required)
- Payment processing and settlement
- Deposit detection and validation
- Fee calculations
- Status transitions
- Security and authorization checks

## CI/CD Integration

Tests run automatically on:
- Every push to `master`, `main`, or `develop` branches
- Every pull request

### CI Pipeline
1. **Unit Tests** - Fast, no external dependencies
2. **Integration Tests** - With PostgreSQL database
3. **On-Chain Tests** - With Solana local validator

See `.github/workflows/test.yml` for CI configuration.

## Best Practices

1. **Test Independence**: Each test should run independently
2. **Clear Names**: Use descriptive test names
3. **One Assertion**: Focus on one thing per test
4. **Clean Up**: Always restore mocks and clean test data
5. **Realistic Data**: Use valid addresses, amounts, and timestamps
6. **Error Testing**: Test both success and failure cases

## Debugging

### Run Single Test File
```bash
mocha --require ts-node/register tests/unit/agreement.service.test.ts
```

### Run Single Test Case
```bash
mocha --require ts-node/register tests/unit/agreement.service.test.ts --grep "should create"
```

### Enable Debug Logs
```bash
DEBUG=* npm test
```

### Anchor Logs
```bash
anchor test -- --show-logs
```

## Test Data

### Fixtures
Pre-defined test data in `fixtures/test-data.ts`:
- `testAgreements` - Various agreement states
- `testDeposits` - USDC and NFT deposits
- `testCreateAgreementDTO` - Valid and invalid DTOs

### Utilities
Helper functions in `helpers/test-utils.ts`:
- `generateTestKeypair()` - Generate Solana keypair
- `generateTestPublicKey()` - Generate Solana address
- `generateTestAgreementId()` - Generate agreement ID
- `usdcToLamports()` - Convert USDC to blockchain units
- `wait()` - Async delay helper

## Troubleshooting

### Tests Hanging
- Increase timeout: `--timeout 60000`
- Check for unclosed connections
- Ensure all async operations complete

### Database Errors
- Ensure PostgreSQL is running
- Check DATABASE_URL environment variable
- Run migrations: `npm run db:migrate`

### On-Chain Test Failures
- Ensure Solana CLI is installed
- Check local validator is running
- Verify SOL airdrop succeeded

### Import Errors
- Run `npm run db:generate` to update Prisma client
- Ensure all dependencies installed: `npm install`
- Check TypeScript configuration

## Additional Resources

- [Complete Testing Strategy](../TESTING_STRATEGY.md)
- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertions](https://www.chaijs.com/)
- [Anchor Testing](https://www.anchor-lang.com/docs/testing)
- [Supertest Guide](https://github.com/visionmedia/supertest)

## Contributing

When adding new tests:
1. Follow existing patterns
2. Add to appropriate directory (unit/integration/on-chain)
3. Update this README if adding new patterns
4. Ensure tests pass in CI

---

For detailed testing strategy and best practices, see [TESTING_STRATEGY.md](../TESTING_STRATEGY.md).

