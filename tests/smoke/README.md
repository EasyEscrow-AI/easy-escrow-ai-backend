# Smoke Tests for Atomic Swap System

Smoke tests are quick validation checks that verify the system is operational. They should complete in < 30 seconds and catch critical failures immediately after deployment.

## Purpose

Smoke tests answer the question: **"Can I deploy this to production?"**

They verify:
- ✅ System is accessible
- ✅ Critical dependencies are available
- ✅ Core functionality works at a basic level
- ✅ No obvious regressions

## Test File

### `atomic-swap-smoke.test.ts`
**Purpose:** Quick validation of atomic swap system health

**Coverage:**
- ✅ **System Health**
  - API responds to `/health` endpoint
  - Database is accessible
  - Solana RPC is reachable

- ✅ **API Endpoints**
  - Root endpoint returns API info
  - Offer listing works
  - Basic validation works
  - 404 handling works

- ✅ **Core Services**
  - Nonce pool is initialized
  - Available nonces exist
  
- ✅ **Configuration**
  - Required environment variables exist
  - Program configuration is valid

- ✅ **Performance**
  - Health check responds quickly (< 1s)
  - Database queries are fast (< 500ms)

**Runtime:** < 30 seconds

---

## Running Smoke Tests

### After Deployment (Recommended)
```bash
# Run smoke tests against deployed environment
SOLANA_RPC_URL=https://api.devnet.solana.com \
DATABASE_URL=<staging-db-url> \
npm run test:smoke
```

### During Development
```bash
# Run against local environment
npm run test:smoke:atomic-swap
```

### In CI/CD Pipeline
```bash
# After deployment step
- name: Smoke Test
  run: npm run test:smoke
  timeout-minutes: 1
```

## When to Run Smoke Tests

1. **After Deployment** ✅
   - Immediately after deploying to any environment
   - Validates deployment was successful
   - Catches configuration errors

2. **Before Releasing** ✅
   - As a final check before opening to users
   - Ensures all systems operational

3. **During Monitoring** ✅
   - Can run periodically (every 5-15 minutes)
   - Acts as lightweight health check

4. **After Database Migration** ✅
   - Validates schema changes didn't break system
   - Ensures services can connect to DB

5. **After Configuration Changes** ✅
   - Validates new env vars are correct
   - Ensures system still functional

## Test Output

### Success ✅
```bash
  Atomic Swap System - Smoke Tests
    System Health
      ✓ should return healthy API status (45ms)
      ✓ should have database connectivity (12ms)
      ✓ should have Solana RPC connectivity (128ms)
    API Endpoints
      ✓ GET / should return API info (15ms)
      ✓ GET /api/offers should list offers (23ms)
      ✓ POST /api/offers should validate required fields (8ms)
      ✓ GET /api/offers/:id should handle not found (6ms)
    Core Services
      ✓ should have nonce pool initialized (31ms)
      ✓ should have at least one available nonce (12ms)
    Configuration
      ✓ should have required environment variables (1ms)
      ✓ should have valid program configuration (1ms)
    Performance
      ✓ should respond to health check quickly (42ms)
      ✓ should query database quickly (18ms)

  13 passing (2s)
```

### Failure ❌
```bash
  Atomic Swap System - Smoke Tests
    System Health
      ✓ should return healthy API status (45ms)
      ✗ should have database connectivity (5012ms)
        Error: connect ECONNREFUSED 127.0.0.1:5432
      
  1 passing (5s)
  1 failing

⚠️ CRITICAL: Database connection failed
🛑 DO NOT DEPLOY
```

## Failure Response

When smoke tests fail:

1. **STOP**: Do not proceed with deployment
2. **INVESTIGATE**: Check logs and error messages
3. **FIX**: Resolve the issue (see troubleshooting below)
4. **RETEST**: Run smoke tests again
5. **DEPLOY**: Only when all tests pass

## Troubleshooting

### Database Connection Failed
```
Error: connect ECONNREFUSED
```

**Check:**
- Database is running
- `DATABASE_URL` is correct
- Firewall/security groups allow connection
- Database credentials are valid

**Fix:**
```bash
# Verify database is accessible
psql $DATABASE_URL -c "SELECT 1"

# Restart database if needed
docker-compose restart postgres
```

---

### RPC Connection Failed
```
Error: Failed to connect to RPC endpoint
```

**Check:**
- RPC endpoint is reachable
- API key is valid (for Helius, etc.)
- Network/firewall allows HTTPS
- RPC service is not rate-limiting

**Fix:**
```bash
# Test RPC endpoint
curl -X POST $SOLANA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Try backup RPC if needed
export SOLANA_RPC_URL=<backup-url>
```

---

### Nonce Pool Not Initialized
```
Error: Nonce pool has 0 available nonces
```

**Check:**
- Nonce pool initialization ran
- Platform authority has SOL for rent
- No errors during initialization

**Fix:**
```bash
# Check nonce pool status
psql $DATABASE_URL -c 'SELECT status, COUNT(*) FROM "NoncePool" GROUP BY status'

# Reinitialize if needed
npm run initialize:nonce-pool
```

---

### Missing Environment Variables
```
Error: Required env var PLATFORM_AUTHORITY_PRIVATE_KEY not set
```

**Check:**
- `.env` file exists and is loaded
- Variables are set in deployment platform
- No typos in variable names

**Fix:**
```bash
# Check which vars are missing
npm run test:smoke:atomic-swap 2>&1 | grep "not set"

# Set missing variables
export PLATFORM_AUTHORITY_PRIVATE_KEY=<value>
```

---

### API Performance Issues
```
Error: Health check took 5000ms (> 1000ms threshold)
```

**Check:**
- Server is under high load
- Database queries are slow
- Network latency

**Fix:**
- Scale up resources if needed
- Optimize slow queries
- Check for deadlocks

---

## Environment-Specific Configuration

### Local Development
```bash
SOLANA_RPC_URL=http://localhost:8899
DATABASE_URL=postgresql://localhost:5432/easyescrow_dev
npm run test:smoke
```

### Staging
```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
DATABASE_URL=<staging-database-url>
npm run test:smoke
```

### Production
```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
DATABASE_URL=<production-database-url>
npm run test:smoke
```

## Monitoring Integration

Smoke tests can be automated for continuous monitoring:

### Cron Job (every 15 minutes)
```bash
*/15 * * * * cd /path/to/app && npm run test:smoke >> /var/log/smoke-tests.log 2>&1
```

### GitHub Actions (post-deployment)
```yaml
- name: Smoke Test
  run: npm run test:smoke
  env:
    SOLANA_RPC_URL: ${{ secrets.STAGING_RPC_URL }}
    DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
```

### Health Check Endpoint
Create an endpoint that runs smoke tests:
```typescript
app.get('/smoke-test', async (req, res) => {
  const results = await runSmokeTests();
  res.status(results.passing ? 200 : 500).json(results);
});
```

## Performance Thresholds

| Check | Threshold | Action if Exceeded |
|-------|-----------|-------------------|
| Health endpoint | < 1s | Investigate server load |
| Database query | < 500ms | Check query optimization |
| RPC call | < 2s | Switch to backup RPC |
| Total smoke test | < 30s | Review test efficiency |

## What Smoke Tests Don't Cover

Smoke tests are **not** a replacement for:
- **Unit Tests**: Detailed logic testing
- **Integration Tests**: Service interaction testing
- **E2E Tests**: Complete user flows
- **Load Tests**: Performance under stress
- **Security Tests**: Vulnerability scanning

They only validate: **"Is the system basically working?"**

## Best Practices

1. **Keep It Fast**: < 30 seconds total
2. **Test Critical Path Only**: Don't test every feature
3. **Fail Fast**: Stop on first critical failure
4. **Clear Output**: Easy to understand results
5. **Automated**: Run automatically after deployment
6. **Idempotent**: Can run repeatedly without side effects

## Adding New Smoke Tests

When adding new critical features:

```typescript
describe('New Critical Feature', () => {
  it('should validate feature is accessible', async () => {
    const response = await request(app)
      .get('/api/new-feature')
      .expect(200);
    
    expect(response.body).to.have.property('status', 'ok');
  });
});
```

**Guidelines:**
- Only test if feature is **critical**
- Keep test simple and fast
- Verify availability, not correctness
- Use existing test data when possible

## Comparison with Other Test Types

| Test Type | Duration | Depth | When to Run |
|-----------|----------|-------|-------------|
| **Smoke** | < 30s | Shallow | After deployment |
| **Unit** | 5-10s | Deep | During development |
| **Integration** | 30-60s | Medium | Before merge |
| **E2E** | 3-5min | Complete | Before release |

## Related Documentation

- [Integration Tests](../integration/README.md) - Deeper service testing
- [Unit Tests](../unit/README.md) - Isolated logic testing
- [Testing Guidelines](.cursor/rules/testing.mdc) - Test best practices

---

**Status:** ✅ Ready for deployment validation  
**Runtime:** < 30 seconds  
**Purpose:** Quick "go/no-go" decision for deployments

