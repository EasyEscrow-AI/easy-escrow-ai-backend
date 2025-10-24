# STAGING Smoke Tests

## Overview

Automated smoke tests that run immediately after STAGING deployment to verify critical functionality. These tests provide rapid validation that the deployment was successful and the system is ready for testing.

## Test Coverage

### 1. Network Connectivity
- **Devnet Connection**: Verifies connection to Solana devnet RPC
- **Admin Balance**: Checks that admin wallet has sufficient SOL for operations
- **Success Criteria**: 
  - RPC returns valid version information
  - Admin wallet balance > 0 SOL (warning if < 1 SOL)

### 2. Program Deployment
- **Program Account**: Verifies STAGING program exists on-chain
- **Executable Verification**: Confirms program is executable
- **Owner Verification**: Validates program is owned by BPF Loader
- **IDL Loading**: Ensures program IDL can be loaded and parsed
- **Instruction Verification**: Checks for core instructions (initializeEscrow, depositFunds, releaseFunds, cancelEscrow)
- **Success Criteria**:
  - Program account exists and is executable
  - All expected instructions are present in IDL

### 3. PDA Derivation
- **Escrow PDA**: Tests Program Derived Address generation
- **Bump Validation**: Verifies bump seed is within valid range
- **Success Criteria**:
  - PDA can be derived successfully
  - Bump seed is valid (0-255)

### 4. Token Program Integration
- **Token Program Reference**: Validates correct Token Program ID
- **Success Criteria**:
  - Token Program ID matches expected value

### 5. Explorer Links
- **Link Generation**: Validates Solana Explorer URLs are correctly formatted
- **Success Criteria**:
  - Explorer links include correct program ID and cluster parameter

## Running Tests

### Local Execution

```bash
# Run smoke tests
npm run test:staging:smoke

# Run with CI reporter (for automation)
npm run test:staging:smoke:ci
```

### Expected Output

```
🔍 Setting up STAGING smoke tests...
   Network: https://api.devnet.solana.com
   Program: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
   Admin: <admin-public-key>
   ✅ Setup complete

STAGING Smoke Tests
  Network Connectivity
    ✅ should connect to devnet (XX ms)
    ✅ should have sufficient admin balance (XX ms)
  Program Deployment
    ✅ should find program on devnet (XX ms)
    ✅ should load program IDL (XX ms)
  PDA Derivation
    ✅ should derive escrow PDA correctly (XX ms)
  Token Program Integration
    ✅ should reference correct Token Program (XX ms)
  Explorer Links
    ✅ should generate valid explorer links (XX ms)

✅ STAGING Smoke Tests Complete!
   All critical checks passed
   STAGING environment is ready for testing

7 passing (XXXms)
```

## Integration with Deployment Pipeline

### Automatic Execution After Deployment

The deployment script (`scripts/deployment/staging/deploy-to-staging.ps1`) includes smoke tests in the "Next Steps" output:

```powershell
# After deployment completes
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  3. Run smoke tests: npm run test:staging:smoke" -ForegroundColor White
```

### Automated Deployment + Smoke Tests

For fully automated deployment with smoke test validation, use the deployment wrapper:

```powershell
# Deploy and automatically run smoke tests
.\scripts\deployment\staging\deploy-with-smoke-tests.ps1
```

This script:
1. Runs the standard STAGING deployment
2. Automatically executes smoke tests
3. Reports success/failure
4. Can trigger notifications on failure

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Deploy to STAGING
  run: |
    .\scripts\deployment\staging\deploy-to-staging.ps1

- name: Run Smoke Tests
  run: npm run test:staging:smoke:ci

- name: Notify on Failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: 'STAGING smoke tests failed after deployment'
```

## Test Execution Time

- **Total Duration**: < 2 minutes
- **Individual Tests**: 
  - Network checks: ~3-5 seconds
  - Program verification: ~5-10 seconds
  - PDA derivation: <1 second
  - Link validation: <1 second

## Troubleshooting

### Common Failures

#### "Admin keypair not found"
**Cause**: Wallet file missing from expected location  
**Solution**: 
```bash
# Ensure staging admin wallet exists
ls wallets/staging/staging-admin.json

# If missing, generate (STAGING only, never production)
solana-keygen new -o wallets/staging/staging-admin.json
```

#### "IDL not found"
**Cause**: IDL file not built or missing  
**Solution**:
```bash
# Build program with IDL
anchor build
```

#### "Program account not found"
**Cause**: Program not deployed or wrong Program ID  
**Solution**:
- Verify STAGING_PROGRAM_ID in test file matches deployed program
- Check deployment was successful
- Verify on Solana Explorer: https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet

#### "Admin wallet has no SOL"
**Cause**: Admin wallet needs funding  
**Solution**:
```bash
# Get admin address
solana-keygen pubkey wallets/staging/staging-admin.json

# Airdrop SOL (devnet only)
solana airdrop 2 <admin-address> --url devnet
```

#### "Program not executable"
**Cause**: Program failed to deploy properly  
**Solution**:
- Redeploy program: `.\scripts\deployment\staging\deploy-to-staging.ps1`
- Check deployer wallet has sufficient SOL

#### "Expected instructions not found in IDL"
**Cause**: IDL out of sync with deployed program  
**Solution**:
```bash
# Rebuild and redeploy
anchor build
.\scripts\deployment\staging\deploy-to-staging.ps1
```

## Configuration

### Environment Variables

The smoke tests use these configuration values:

```typescript
// STAGING Program ID (distinct from DEV)
const STAGING_PROGRAM_ID = 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei';

// Network URL (devnet)
const NETWORK_URL = 'https://api.devnet.solana.com';

// Admin wallet path
const adminKeypairPath = 'wallets/staging/staging-admin.json';

// IDL path
const idlPath = 'target/idl/escrow.json';
```

### Modifying Tests

To add new smoke tests:

1. Add test case to appropriate `describe` block
2. Follow existing patterns for async operations
3. Include descriptive console output
4. Update this README with new test description
5. Add to troubleshooting section if needed

Example:
```typescript
it('should verify new functionality', async function () {
  // Your test code here
  const result = await someOperation();
  
  console.log(`   Result: ${result}`);
  expect(result).to.be.true;
});
```

## Success Criteria Summary

✅ All smoke tests must pass before STAGING environment is considered ready  
✅ Total execution time should be under 2 minutes  
✅ Tests should be idempotent (can run multiple times safely)  
✅ Clear error messages for easy debugging  
✅ Explorer links provided for manual verification if needed  

## Related Documentation

- [STAGING Deployment Guide](../../../docs/deployment/STAGING_DEPLOYMENT_GUIDE.md)
- [Program IDs Registry](../../../docs/PROGRAM_IDS.md)
- [STAGING Reference](../../../docs/STAGING_REFERENCE.md)
- [Testing Strategy](../../../docs/testing/TESTING_STRATEGY.md)

## Support

For issues with smoke tests:
1. Check troubleshooting section above
2. Verify STAGING deployment completed successfully
3. Check Solana Explorer for on-chain verification
4. Review deployment logs for errors

## Version History

- **v1.0.0** - Initial smoke test suite with core functionality validation

