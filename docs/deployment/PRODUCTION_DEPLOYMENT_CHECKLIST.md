# Production Deployment Checklist

**Last Updated:** 2025-01-06
**Environment:** Production (Mainnet)
**Network:** Solana Mainnet-Beta

---

## Pre-Deployment Verification

### 1. Staging Validation ✓
- [ ] All staging E2E tests passing
- [ ] All staging smoke tests passing
- [ ] No critical issues in staging logs
- [ ] Performance metrics acceptable
- [ ] Settlement timing < 30 seconds consistently

### 2. Code Review & Testing
- [ ] All code changes peer reviewed
- [ ] Unit tests passing (100% critical paths)
- [ ] Integration tests passing
- [ ] Security audit completed for changes
- [ ] No known security vulnerabilities

### 3. Documentation Updated
- [ ] API documentation current
- [ ] Architecture diagrams updated
- [ ] Deployment procedures documented
- [ ] Rollback procedures ready
- [ ] Incident response plan reviewed

---

## Program ID Verification (CRITICAL)

### 4. Program ID Consistency Check

**Production Program ID:** `HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry`

Verify this ID appears in **ALL** of the following locations:

#### Source Code Files
- [ ] `Anchor.mainnet.toml` - `[programs.mainnet]` section
- [ ] `src/generated/anchor/escrow.ts` - Program ID constant
- [ ] `idl/escrow.json` - `address` field (top-level)
- [ ] `programs/escrow/src/lib.rs` - `declare_id!()` macro

#### Configuration Files
- [ ] `.env.production` - `ESCROW_PROGRAM_ID`
- [ ] Environment variables in DigitalOcean App Platform
- [ ] Any CI/CD configuration files

#### Build Artifacts (After Build)
- [ ] `target/deploy/escrow-keypair.json` - Public key matches
- [ ] `target/idl/escrow.json` - IDL program ID matches
- [ ] `target/types/escrow.ts` - TypeScript types reference correct ID

### 5. Build Verification Script

Run the verification script:

```powershell
# Navigate to project root
cd c:\websites\VENTURE\easy-escrow-ai-backend

# Run verification
.\scripts\deployment\verify-production-program-id.ps1
```

Expected output: **All checks PASS**

---

## Solana Program Deployment

### 6. Build Production Program

```powershell
# Set production environment
$env:ANCHOR_PROVIDER_URL = "https://api.mainnet-beta.solana.com"
$env:ANCHOR_WALLET = "wallets/production/mainnet-admin-keypair.json"

# Build with production profile
anchor build --program-name escrow --arch sbf

# Verify build artifacts
ls target/deploy/escrow.so
ls target/idl/escrow.json
```

Verify:
- [ ] Build completes without errors
- [ ] `escrow.so` file exists and size is reasonable (~100-500KB)
- [ ] IDL JSON file generated

### 7. Verify Built Program ID

```powershell
# Extract program ID from built keypair
solana address -k target/deploy/escrow-keypair.json

# Expected: HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry
```

- [ ] Program ID matches expected production ID **exactly**

### 8. Program Deployment to Mainnet

**CRITICAL:** Ensure sufficient SOL in deployer wallet (~5-10 SOL recommended)

```powershell
# Check deployer balance
solana balance --url mainnet-beta -k wallets/production/mainnet-admin-keypair.json

# Deploy program (DRY RUN first)
anchor deploy --program-name escrow --provider.cluster mainnet --dry-run

# If dry-run succeeds, deploy for real
anchor deploy --program-name escrow --provider.cluster mainnet
```

Verify:
- [ ] Deployment transaction succeeds
- [ ] Program is executable on-chain
- [ ] Program data account created

### 9. Verify On-Chain Program

```powershell
# Check program account
solana program show HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry --url mainnet-beta

# Expected output:
# Program Id: HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry
# Owner: BPFLoaderUpgradeab1e11111111111111111111111
# ProgramData Address: ...
# Authority: <your-upgrade-authority>
# Last Deployed In Slot: ...
# Data Length: ... bytes
# Balance: ... SOL
```

- [ ] Program exists on-chain
- [ ] Program is marked as executable
- [ ] Authority matches expected upgrade authority
- [ ] Data length reasonable (not zero)

### 10. Upload IDL to Chain

```powershell
# Upload IDL to program account
anchor idl init HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry `
  --filepath target/idl/escrow.json `
  --provider.cluster mainnet

# Verify IDL uploaded
anchor idl fetch HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry `
  --provider.cluster mainnet `
  --out temp/fetched-idl.json

# Compare fetched IDL with source
# Should be identical
```

- [ ] IDL upload succeeds
- [ ] Fetched IDL matches source IDL
- [ ] Program ID in fetched IDL is correct

---

## Backend Deployment

### 11. Environment Variables Check

Verify all production environment variables are set in DigitalOcean App Platform:

**Critical Variables:**
- [ ] `NODE_ENV=production`
- [ ] `SOLANA_NETWORK=mainnet-beta`
- [ ] `SOLANA_RPC_URL` (Helius mainnet with API key)
- [ ] `ESCROW_PROGRAM_ID=HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry`
- [ ] `DATABASE_URL` (production PostgreSQL)
- [ ] `REDIS_URL` (production Redis)

**Wallet Variables:**
- [ ] `MAINNET_ADMIN_PRIVATE_KEY` (secured)
- [ ] `MAINNET_ADMIN_ADDRESS`
- [ ] `PLATFORM_FEE_COLLECTOR_ADDRESS`

**Token Variables:**
- [ ] `USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (mainnet USDC)

**Security Variables:**
- [ ] `JWT_SECRET` (strong, unique)
- [ ] `JITO_AUTH_KEYPAIR` (if using Jito)

### 12. Build Backend

```powershell
# Build TypeScript
npm run build

# Verify dist/ directory
ls dist/

# Check for build errors
npm run lint
npm run type-check
```

- [ ] Build completes without errors
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] All dist files generated

### 13. Database Migration

**IMPORTANT:** Use zero-downtime migration strategy

```powershell
# Review pending migrations
npx prisma migrate status --schema prisma/schema.prisma

# Deploy migrations (production DB)
npx prisma migrate deploy --schema prisma/schema.prisma

# Generate Prisma client
npx prisma generate --schema prisma/schema.prisma
```

- [ ] Migration plan reviewed
- [ ] Migrations applied successfully
- [ ] No data loss
- [ ] Rollback plan ready

### 14. Deploy Backend to DigitalOcean (Automatic via GitHub)

**Backend deployment happens automatically when code is merged to `master` branch.**

**Deployment Process:**
1. Commit your changes to your branch
2. Push to GitHub
3. Create Pull Request to `master`
4. Review and approve PR
5. Merge to `master` ← **This triggers automatic deployment**
6. DigitalOcean detects merge and deploys automatically

**Monitor deployment:**
- [ ] GitHub Actions workflow starts (if configured)
- [ ] DigitalOcean build phase completes (~3 minutes)
- [ ] DigitalOcean deploy phase completes (~2 minutes)
- [ ] Health checks pass
- [ ] No errors in deployment logs

**Alternative (Manual Trigger - if needed):**
```powershell
# Only if automatic deployment fails or needs manual trigger
doctl apps create-deployment <production-app-id>
```

**Monitor at:**
- DigitalOcean Console: https://cloud.digitalocean.com/apps/
- GitHub Actions: https://github.com/your-org/your-repo/actions (if configured)

### 15. Post-Deployment Health Check

```powershell
# Wait for services to stabilize (2-3 minutes)
Start-Sleep -Seconds 180

# Run health check
curl https://api.easyescrow.xyz/health

# Expected: {"status":"healthy","timestamp":"..."}
```

- [ ] Health endpoint returns 200 OK
- [ ] Database connection healthy
- [ ] Redis connection healthy
- [ ] Solana RPC connection healthy

---

## Testing & Verification

### 16. Smoke Tests

```powershell
# Run production smoke tests
npm run test:production:smoke
```

Expected results:
- [ ] Health check passes
- [ ] Database connectivity passes
- [ ] Redis connectivity passes
- [ ] Solana connectivity passes
- [ ] Program verification passes
- [ ] Admin wallet verification passes

### 17. Happy Path E2E Tests (WITH TIMING)

```powershell
# Run production happy path tests with timing
npm run test:production:happy-path
```

**Tests to Pass:**
- [ ] Test 01: NFT for SOL (timer: < 30s total)
- [ ] Test 02: NFT for NFT with fee (timer: < 30s total)
- [ ] Test 03: NFT for NFT plus SOL (timer: < 30s total)

**Timing Metrics to Record:**
- Agreement creation time
- Settlement completion time
- Total swap duration (creation → settlement)

### 18. Full E2E Test Suite

```powershell
# Run full production E2E suite
npm run test:production:e2e
```

All tests should pass:
- [ ] 01-nft-for-sol-happy-path.test.ts
- [ ] 02-nft-for-nft-with-fee.test.ts
- [ ] 03-nft-for-nft-plus-sol.test.ts
- [ ] 04-agreement-expiry-refund.test.ts
- [ ] 05-admin-cancellation.test.ts
- [ ] 06-zero-fee-transactions.test.ts
- [ ] 07-idempotency-handling.test.ts
- [ ] 08-concurrent-operations.test.ts
- [ ] 09-edge-cases-validation.test.ts

### 19. API Endpoint Verification

Test critical endpoints manually:

```powershell
# Create agreement (use Postman or curl)
curl -X POST https://api.easyescrow.xyz/api/agreements `
  -H "Content-Type: application/json" `
  -d '{...}'

# Get agreement
curl https://api.easyescrow.xyz/api/agreements/{agreementId}

# Settlement (authorized)
curl -X POST https://api.easyescrow.xyz/api/agreements/{agreementId}/settle `
  -H "Authorization: Bearer ..." `
  -d '{...}'
```

- [ ] Create agreement works
- [ ] Get agreement returns data
- [ ] Settlement completes successfully
- [ ] Refund works (if applicable)
- [ ] Cancel works (admin only)

---

## Monitoring & Observability

### 20. Enable Monitoring

- [ ] Application logs visible in DigitalOcean
- [ ] Error tracking configured (if using Sentry)
- [ ] Performance metrics collection enabled
- [ ] Uptime monitoring configured

### 21. Set Up Alerts

Configure alerts for:
- [ ] Application downtime
- [ ] High error rate (> 1%)
- [ ] Slow response times (> 5s p95)
- [ ] Database connection failures
- [ ] Redis connection failures
- [ ] Solana RPC failures
- [ ] Low balance in admin wallet
- [ ] Failed settlements

### 22. Dashboard Setup

- [ ] Production dashboard accessible
- [ ] Key metrics visible (throughput, latency, errors)
- [ ] Transaction history queryable
- [ ] Wallet balances monitored

---

## Security Verification

### 23. Security Checklist

- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] Helmet middleware active
- [ ] Input validation on all endpoints
- [ ] Authentication/authorization working
- [ ] Secrets not exposed in logs
- [ ] SQL injection protection (Prisma)
- [ ] XSS protection enabled

### 24. Wallet Security

- [ ] Private keys stored securely (DigitalOcean secrets)
- [ ] No private keys in code or logs
- [ ] Admin wallet has sufficient SOL (~10 SOL minimum)
- [ ] Platform fee collector wallet configured
- [ ] Wallet backup secured offline

---

## Documentation & Communication

### 25. Update Documentation

- [ ] Production deployment documented
- [ ] API endpoints documented (Swagger)
- [ ] Architecture diagrams current
- [ ] Troubleshooting guide updated
- [ ] Rollback procedures documented

### 26. Team Communication

- [ ] Notify team of deployment
- [ ] Share production URLs
- [ ] Document any breaking changes
- [ ] Provide support contact info

---

## Post-Deployment Validation

### 27. 24-Hour Monitoring

Monitor for 24 hours:
- [ ] No critical errors
- [ ] Response times < 2s p95
- [ ] Success rate > 99%
- [ ] No memory leaks
- [ ] No database issues
- [ ] No Redis issues

### 28. User Acceptance

- [ ] First production transaction completed
- [ ] User feedback positive
- [ ] No critical bugs reported

---

## Rollback Plan (If Needed)

### Emergency Rollback Steps

If critical issues arise:

1. **Rollback Backend:**
   ```powershell
   # Revert to previous deployment
   doctl apps rollback <production-app-id> <previous-deployment-id>
   ```

2. **Rollback Database:**
   ```powershell
   # Restore from backup (if schema changed)
   .\scripts\database\restore-production-backup.ps1
   ```

3. **Rollback Program (if needed):**
   ```powershell
   # Upgrade program to previous version
   solana program upgrade <previous-program.so> HqM2YpP1SdRXfNsuS2EvZyyBvKYoA5x7fR3cGxbQN5Ry
   ```

4. **Notify Users:**
   - Post status update
   - Communicate ETA for fix

---

## Sign-Off

### Deployment Approval

- [ ] **Technical Lead:** _______________ Date: _______
- [ ] **Security Officer:** _______________ Date: _______
- [ ] **Product Owner:** _______________ Date: _______

### Post-Deployment Sign-Off

- [ ] **All tests passing:** _______________ Date: _______
- [ ] **24-hour monitoring complete:** _______________ Date: _______
- [ ] **Production stable:** _______________ Date: _______

---

## Notes & Issues

**Deployment Date:** _______________
**Deployment Time:** _______________
**Deployed By:** _______________

**Issues Encountered:**
- 

**Resolutions:**
- 

**Performance Metrics:**
- Average settlement time: _______
- P95 response time: _______
- Success rate: _______

---

## References

- [Production Environment Setup](../environments/PRODUCTION_ENVIRONMENT_SETUP.md)
- [Program ID Verification Script](../../scripts/deployment/verify-production-program-id.ps1)
- [Zero Downtime Migrations](../database/ZERO_DOWNTIME_MIGRATIONS.md)
- [Emergency Procedures](EMERGENCY_PRODUCTION_MIGRATION.md)
- [Rollback Procedures](../operations/ROLLBACK_PROCEDURES.md)

