# SOL Migration Deployment Strategy

## Overview
This document outlines the phased deployment strategy for migrating from USDC-based to SOL-based escrow system across development, staging, and production environments.

## Migration Approach: Hard Cutover

**Decision:** Use hard cutover approach with feature-flagged USDC code.

**Rationale:**
- ✅ Simpler architecture (single program per environment)
- ✅ Cleaner codebase (no dual-path logic)
- ✅ Meets legal compliance requirements (no USDC in public IDL)
- ✅ USDC preserved for future re-enablement
- ✅ Reduces maintenance burden
- ❌ Existing USDC agreements must be settled/cancelled before migration

## Pre-Migration Checklist

### Development Environment
- [ ] All existing USDC escrow agreements settled or cancelled
- [ ] Backup current program state
- [ ] Deploy new SOL program to devnet
- [ ] Verify IDL has no USDC references
- [ ] Update backend configuration
- [ ] Test all 3 swap types
- [ ] Verify E2E tests pass

### Staging Environment
- [ ] All existing USDC escrow agreements settled or cancelled
- [ ] Backup current program state and database
- [ ] Deploy new SOL program to staging devnet
- [ ] Update staging backend configuration
- [ ] Run full integration test suite
- [ ] Perform load testing
- [ ] Verify monitoring and alerting

### Production Environment
- [ ] All existing USDC escrow agreements settled or cancelled
- [ ] Final backup of program state and database
- [ ] Schedule maintenance window (if needed)
- [ ] Deploy new SOL program to mainnet
- [ ] Update production backend configuration
- [ ] Run smoke tests
- [ ] Monitor closely for 24-48 hours

## Deployment Phases

### Phase 1: Development (Week 1)

#### Day 1-2: Code Implementation
**Tasks:**
- Implement feature flags for USDC code
- Implement NFT <> SOL swap logic
- Implement NFT <> NFT with SOL fee
- Implement NFT <> NFT+SOL swap
- Write unit tests for all swap types

**Success Criteria:**
- All unit tests pass
- Code compiles without USDC in default build
- USDC code compiles with feature flag enabled

#### Day 3-4: Backend Integration
**Tasks:**
- Update backend services for SOL transfers
- Update API endpoints for new swap types
- Update database schema (if needed)
- Create migration scripts

**Success Criteria:**
- Backend connects to new program
- API tests pass
- Database migrations run successfully

#### Day 5-7: Testing & Fixes
**Tasks:**
- Deploy to local devnet
- Deploy to public devnet
- Run E2E tests for all 3 swap types
- Fix any issues discovered
- Performance testing

**Success Criteria:**
- All E2E tests pass
- Performance benchmarks met
- No critical bugs found

**Deployment Command:**
```bash
# Build program for devnet
anchor build -- --features devnet

# Deploy to devnet
anchor deploy --provider.cluster devnet --program-name escrow

# Verify deployment
solana program show <PROGRAM_ID> --url devnet
```

### Phase 2: Staging (Week 2)

#### Day 1: Pre-Deployment
**Tasks:**
- Settle/cancel all existing USDC agreements in staging
- Backup staging database
- Backup current program state
- Prepare rollback plan
- Update monitoring dashboards

**Success Criteria:**
- Zero active USDC agreements
- Backups verified and accessible
- Rollback plan documented and tested

#### Day 2-3: Deployment
**Tasks:**
- Deploy new program to staging devnet
- Update staging backend to use new program
- Update environment variables
- Restart backend services
- Verify IDL deployment

**Deployment Command:**
```bash
# Build program for staging
anchor build -- --features staging

# Deploy to staging (devnet with staging program ID)
anchor deploy --provider.cluster devnet --program-name escrow

# Update backend env vars
# ESCROW_PROGRAM_ID=<new_staging_program_id>
# NODE_ENV=staging
```

**Success Criteria:**
- Program deployed successfully
- Backend connects to new program
- Health checks pass
- No errors in logs

#### Day 4-5: Comprehensive Testing
**Tasks:**
- Run full integration test suite
- Test all 3 swap types manually
- Test error scenarios
- Test cancellation flows
- Performance and load testing
- Security audit review

**Success Criteria:**
- All automated tests pass
- Manual testing confirms expected behavior
- Load tests show acceptable performance
- No security concerns identified

#### Day 6-7: Monitoring & Observation
**Tasks:**
- Monitor staging environment
- Review logs for anomalies
- Test monitoring alerts
- Document any issues
- Prepare production deployment plan

**Success Criteria:**
- Stable operation for 48+ hours
- All metrics within expected ranges
- Monitoring correctly captures events
- Team confident in production deployment

### Phase 3: Production (Week 3)

#### Day 1-2: Pre-Deployment Preparation
**Tasks:**
- Notify users of upcoming changes (if applicable)
- Settle/cancel all existing USDC agreements in production
- Final backup of production database
- Backup current production program state
- Review rollback procedures with team
- Prepare incident response plan

**Critical Checks:**
- ✅ Zero active USDC agreements in production
- ✅ All backups verified and tested
- ✅ Rollback plan ready
- ✅ Team briefed on deployment
- ✅ Monitoring dashboards prepared
- ✅ Incident response team on standby

#### Day 3: Production Deployment

**Pre-Deployment (2 hours before):**
- Final team sync
- Verify all prerequisites met
- Put monitoring on high alert
- Notify stakeholders

**Deployment Window:**
```bash
# Build program for mainnet
anchor build -- --features mainnet

# Deploy to mainnet (USE CAUTION)
anchor deploy --provider.cluster mainnet --program-name escrow

# Verify deployment
solana program show <PROGRAM_ID> --url mainnet

# Update production backend
# ESCROW_PROGRAM_ID=<new_mainnet_program_id>
# NODE_ENV=production

# Restart backend services gracefully
docker compose restart backend
```

**Post-Deployment Verification (30 minutes):**
- ✅ Program deployed successfully
- ✅ Backend connected to new program
- ✅ Health checks passing
- ✅ Smoke tests pass
- ✅ First SOL transaction successful
- ✅ Monitoring shows normal metrics
- ✅ No errors in production logs

#### Day 4-7: Post-Deployment Monitoring

**24-Hour Watch:**
- Continuous monitoring of all metrics
- Log analysis for anomalies
- User feedback collection
- Performance metrics review
- Incident response ready

**48-Hour Checkpoints:**
- Review transaction success rates
- Check fee calculations
- Verify settlement flows
- Analyze user behavior
- Document any issues

**Week 1 Review:**
- Analyze all metrics
- Review incidents (if any)
- Gather user feedback
- Document lessons learned
- Plan improvements

## Rollback Procedures

### When to Rollback

**Trigger Conditions:**
- Critical bug affecting escrow safety
- >10% transaction failure rate
- Security vulnerability discovered
- Data corruption detected
- Systematic user fund loss

### Rollback Steps

#### Immediate Actions (15 minutes)
1. **Disable new program access:**
   ```bash
   # Update backend to stop creating new agreements
   # Set MAINTENANCE_MODE=true
   docker compose restart backend
   ```

2. **Assess impact:**
   - Count active escrow agreements
   - Identify affected users
   - Quantify potential losses

3. **Communication:**
   - Notify team immediately
   - Prepare user communication
   - Document incident details

#### Program Rollback (If Necessary)

**⚠️ WARNING:** Cannot rollback on-chain program. Can only:
1. Deploy patched version with fixes
2. Manually settle affected agreements
3. Redirect to alternative solution

**Backend Rollback:**
```bash
# Revert to previous backend version
git checkout <previous-commit>
docker compose down
docker compose up -d --build

# Restore database if needed
psql < backup_production_YYYYMMDD.sql
```

### Post-Rollback
- Root cause analysis
- Fix development of issues
- Re-test in staging
- Plan re-deployment

## Data Migration

### No Database Schema Changes Required

**Rationale:**
- New swap types use same `Agreement` table structure
- `price` field can represent SOL amount (just different decimals)
- `Deposit` table already generic (type field supports new types)
- Add new deposit types: `SOL`, `NFT_BUYER` (for NFT<>NFT swaps)

### Configuration Updates

**Backend Environment Variables:**
```bash
# OLD (USDC-based)
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# NEW (SOL-based) - No mint address needed for SOL!
# USDC_MINT_ADDRESS removed from public config (preserved in feature-flagged code)

# New configuration
MIN_SOL_AMOUNT=10000000         # 0.01 SOL
MAX_SOL_AMOUNT=15000000000      # 15 SOL
DEFAULT_SWAP_TYPE=NFT_FOR_SOL   # Default swap type
DEFAULT_FEE_PAYER=BUYER         # Default fee payer
```

### Deposit Type Extensions

**Prisma Schema Update (if needed):**
```prisma
enum DepositType {
  USDC    // Legacy
  NFT     // Existing
  SOL     // NEW
  NFT_BUYER // NEW - For buyer's NFT in NFT<>NFT swaps
}
```

## Testing Strategy per Environment

### Development Testing

**Automated Tests:**
- Unit tests for all instructions
- Integration tests for all swap types
- E2E tests (subtasks 1.13-1.15)
- Error scenario tests
- Edge case tests

**Manual Testing:**
- Create agreement for each swap type
- Test deposit flows
- Test settlement
- Test cancellation
- Test expiry handling
- Test admin operations

**Performance Testing:**
- Measure compute units per instruction
- Benchmark transaction confirmation times
- Load test with 100 concurrent agreements

### Staging Testing

**Full Integration Suite:**
- All automated tests from development
- Backend integration tests
- API endpoint tests
- Database integrity tests
- Monitoring validation

**User Acceptance Testing:**
- Complete user flows for all swap types
- Error handling and recovery
- UI/UX verification
- Edge cases and boundary conditions

**Stress Testing:**
- High volume of concurrent transactions
- Network congestion simulation
- Failure recovery scenarios

### Production Testing

**Smoke Tests (Immediately After Deployment):**
1. Health check endpoint responds
2. Program account accessible
3. Create test agreement (small amount)
4. Complete test swap end-to-end
5. Verify transaction logs
6. Check monitoring metrics

**Gradual Rollout:**
- Monitor first 10 transactions closely
- Review first 100 transactions
- Analyze first 1000 transactions
- Full rollout after validation

## Monitoring & Alerting

### Key Metrics to Monitor

**Transaction Metrics:**
- Transaction success rate (target: >99%)
- Average confirmation time
- Failed transaction count
- Gas/compute unit usage

**Escrow Metrics:**
- Active escrow count by swap type
- Settlement success rate
- Cancellation rate
- Expiry handling accuracy

**Financial Metrics:**
- Total SOL locked in escrows
- Platform fees collected
- Average escrow amount
- Largest escrow amount

**Error Metrics:**
- Error rate by type
- Failed settlement count
- Deposit failures
- Program errors

### Alert Conditions

**Critical Alerts (Immediate Response):**
- Transaction failure rate >10%
- Security vulnerability detected
- Program error rate >5%
- User fund loss detected
- System unavailable >5 minutes

**Warning Alerts (Investigation Needed):**
- Transaction failure rate >5%
- Settlement delays >30 minutes
- Compute unit usage >80% limit
- Error rate increase >50%

**Info Alerts (Monitoring):**
- New swap type usage milestone
- Large escrow created (>5 SOL)
- Unusual activity patterns

## Communication Plan

### Internal Communication

**Pre-Deployment:**
- Team briefing on migration plan
- Roles and responsibilities defined
- Incident response procedures reviewed
- Contact information confirmed

**During Deployment:**
- Real-time updates in team channel
- Status checkpoints every 30 minutes
- Immediate escalation of issues

**Post-Deployment:**
- Deployment summary report
- Lessons learned session
- Success metrics review

### External Communication

**User Notifications (If Applicable):**
- Announcement of new features
- Guide to new swap types
- Support resources
- FAQ document

**Status Updates:**
- Deployment start notification
- Successful completion announcement
- Known issues (if any)
- Support channels

## Risk Mitigation

### Identified Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Program deployment fails | High | Low | Test thoroughly in devnet first |
| Active USDC agreements during migration | High | Medium | Settle all before deployment |
| SOL price volatility affects limits | Medium | High | Monitor and adjust limits post-launch |
| User confusion with new swap types | Medium | Medium | Clear documentation and UI guidance |
| Backend compatibility issues | High | Low | Extensive integration testing |
| Security vulnerability in new code | Critical | Low | Security audit and peer review |

### Contingency Plans

**Scenario 1: Deployment Fails**
- Retry deployment with fixes
- If persistent, delay until resolved
- Do not force problematic deployment

**Scenario 2: Critical Bug in Production**
- Follow rollback procedures
- Manual intervention for active escrows
- Deploy hotfix ASAP

**Scenario 3: Performance Issues**
- Scale backend infrastructure
- Optimize compute unit usage
- Implement rate limiting if needed

## Success Criteria

### Technical Success

- ✅ All 3 swap types functional
- ✅ Transaction success rate >99%
- ✅ E2E tests passing
- ✅ No critical bugs
- ✅ Performance benchmarks met
- ✅ Monitoring operational

### Business Success

- ✅ Zero user fund loss
- ✅ Positive user feedback
- ✅ Increased transaction volume
- ✅ Reduced transaction costs
- ✅ Legal compliance maintained

### Operational Success

- ✅ Smooth deployment process
- ✅ Team confidence in system
- ✅ Documentation complete
- ✅ Support team trained
- ✅ Monitoring effective

## Post-Migration Optimization

### Week 2-4 (After Production)

**Performance Optimization:**
- Analyze compute unit usage patterns
- Optimize hot paths
- Reduce transaction size
- Improve confirmation times

**Feature Enhancements:**
- Gather user feedback
- Identify pain points
- Plan UX improvements
- Consider additional swap types

**Documentation:**
- Update all technical docs
- Create user guides
- Document common issues
- Publish API updates

**Cost Analysis:**
- Compare USDC vs SOL transaction costs
- Analyze fee revenue
- Calculate compute unit savings
- ROI assessment

## Timeline Summary

| Phase | Duration | Key Activities | Go/No-Go Gate |
|-------|----------|----------------|---------------|
| **Development** | Week 1 | Code, test, fix | All tests pass |
| **Staging** | Week 2 | Deploy, test comprehensively | 48hr stable operation |
| **Production** | Week 3 | Deploy, monitor closely | Smoke tests pass |
| **Stabilization** | Week 4 | Monitor, optimize | Success metrics met |

**Total Estimated Duration:** 4 weeks from start to full production stability

## Appendix

### Useful Commands

**Check Program Info:**
```bash
solana program show <PROGRAM_ID> --url <devnet|mainnet>
```

**View Program Logs:**
```bash
solana logs <PROGRAM_ID> --url <devnet|mainnet>
```

**Build with Feature Flags:**
```bash
# Default (SOL only, no USDC in IDL)
anchor build

# With USDC enabled (for testing)
anchor build -- --features usdc

# For specific environment
anchor build -- --features devnet
anchor build -- --features staging  
anchor build -- --features mainnet
```

**Verify IDL:**
```bash
# Check IDL doesn't contain USDC references
cat target/idl/escrow.json | grep -i usdc
# Should return no results for default build
```

**Database Backup:**
```bash
# Backup production database
pg_dump -h <host> -U <user> -d <database> > backup_production_$(date +%Y%m%d).sql

# Restore if needed
psql -h <host> -U <user> -d <database> < backup_production_YYYYMMDD.sql
```

### Contact Information

**Deployment Team:**
- Lead Developer: [Name]
- DevOps Engineer: [Name]
- Security Reviewer: [Name]
- Product Manager: [Name]

**On-Call Rotation:**
- Primary: [Name] - [Contact]
- Secondary: [Name] - [Contact]
- Escalation: [Name] - [Contact]

### References

- [SOL Migration Architecture](../architecture/SOL_MIGRATION_ARCHITECTURE.md)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Program Deployment Guide](https://docs.solana.com/cli/deploy-a-program)

---

**Document Status:** Final Draft  
**Last Updated:** 2025-11-04  
**Author:** AI Assistant  
**Approved By:** Pending  
**Next Review:** After Phase 1 Completion
