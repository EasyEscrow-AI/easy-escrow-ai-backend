# Treasury PDA Migration Postmortem & Prevention Guide

**Date:** November 27, 2025  
**Environment:** Staging (Devnet)  
**Issue:** Multiple ID mismatches causing Treasury PDA derivation failures

---

## 🚨 What Went Wrong

After deploying PR #296 with 8 bug fixes, we encountered a cascading series of ID mismatches that prevented the Treasury PDA from working:

### Issue Timeline

1. **Initial Problem:** IDL had mainnet program ID instead of staging
2. **Fix Attempt 1:** Updated IDL address → Still failed
3. **Discovery:** Program binary was compiled with mainnet ID
4. **Fix Attempt 2:** Recompiled and redeployed program → Still failed
5. **Discovery:** Treasury PDA structure mismatch (57 bytes on-chain, 82 bytes expected)
6. **Fix Attempt 3:** Changed seeds to `treasury_v2` → Still failed
7. **Discovery:** E2E test still using old seeds
8. **Fix Attempt 4:** Updated E2E test → Still failed
9. **Discovery:** Backend still using old seeds
10. **Final Fix:** Updated backend, scripts, and E2E tests to use `treasury_v2`

---

## 🔍 Root Causes

### 1. Lack of Seed Synchronization
**Problem:** Treasury PDA seeds were hardcoded in 5+ different places:
- Rust program (`programs/escrow/src/state/treasury.rs`)
- Backend routes (`src/routes/offers.routes.ts`)
- Treasury scripts (`scripts/treasury/*.ts`)
- E2E tests (`tests/staging/e2e/*.test.ts`)
- Helper files (`tests/helpers/*.ts`)

**Impact:** Changing seeds in one place didn't automatically update others.

### 2. No Validation of PDA Derivation
**Problem:** No checks to ensure all code derives the same PDA address.

**Impact:** Silent mismatches that only surface during runtime.

### 3. Program ID Confusion
**Problem:** Multiple program IDs for different environments without clear build validation:
- Mainnet: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- Staging: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- Devnet: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- Localnet: `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS`

**Impact:** Easy to compile for wrong environment and deploy incorrect binary.

### 4. No Pre-Deployment Validation
**Problem:** No automated checks before deployment to verify:
- IDL matches deployed program
- Backend derives correct Treasury PDA
- All scripts use correct seeds
- E2E tests use correct seeds

---

## 🛡️ Prevention Strategy

### Phase 1: Centralize Treasury PDA Derivation (IMMEDIATE)

Create a single source of truth for Treasury PDA derivation:

```typescript
// src/config/treasury.ts
import { PublicKey } from '@solana/web3.js';

/**
 * CRITICAL: Treasury PDA seeds - DO NOT CHANGE without migration plan
 * 
 * Current: 'treasury_v2' (82-byte structure)
 * Previous: 'treasury' (57-byte structure, deprecated)
 * 
 * If changing seeds:
 * 1. Update this constant
 * 2. Update programs/escrow/src/state/treasury.rs
 * 3. Run migration script
 * 4. Redeploy program
 * 5. Update backend
 * 6. Update all tests
 */
export const TREASURY_SEEDS = Buffer.from('treasury_v2');

/**
 * Derive Treasury PDA for given authority and program
 * USE THIS FUNCTION EVERYWHERE - DO NOT derive manually!
 */
export function deriveTreasuryPDA(
  authority: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TREASURY_SEEDS, authority.toBuffer()],
    programId
  );
}

/**
 * Validate that derived PDA matches expected address
 * Use in tests and validation scripts
 */
export function validateTreasuryPDA(
  derivedPDA: PublicKey,
  expectedPDA: PublicKey
): boolean {
  return derivedPDA.equals(expectedPDA);
}
```

**Action Items:**
- [ ] Create `src/config/treasury.ts`
- [ ] Replace all manual PDA derivations with `deriveTreasuryPDA()`
- [ ] Update `offers.routes.ts` to use helper
- [ ] Update all treasury scripts to use helper
- [ ] Update all E2E tests to use helper

### Phase 2: Add Pre-Deployment Validation Script (HIGH PRIORITY)

```typescript
// scripts/validation/validate-deployment.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { deriveTreasuryPDA, TREASURY_SEEDS } from '../../src/config/treasury';
import * as fs from 'fs';

async function validateDeployment(environment: 'staging' | 'production') {
  console.log(`\n🔍 Validating ${environment} deployment...\n`);
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Load IDL
  const idlPath = `./src/generated/anchor/escrow-idl-${environment}.json`;
  if (!fs.existsSync(idlPath)) {
    errors.push(`IDL file not found: ${idlPath}`);
    return { errors, warnings };
  }
  
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const idlProgramId = new PublicKey(idl.address);
  
  console.log(`✓ IDL loaded: ${idlProgramId.toBase58()}`);
  
  // 2. Validate program ID matches environment
  const expectedProgramIds = {
    staging: 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei',
    production: '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx'
  };
  
  if (idlProgramId.toBase58() !== expectedProgramIds[environment]) {
    errors.push(
      `Program ID mismatch!\n` +
      `  Expected (${environment}): ${expectedProgramIds[environment]}\n` +
      `  IDL contains: ${idlProgramId.toBase58()}`
    );
  } else {
    console.log(`✓ Program ID correct for ${environment}`);
  }
  
  // 3. Check Rust program source
  const rustSourcePath = './programs/escrow/src/lib.rs';
  const rustSource = fs.readFileSync(rustSourcePath, 'utf-8');
  
  if (rustSource.includes('default = ["mainnet"]')) {
    warnings.push(
      'Cargo.toml has default mainnet feature flag\n' +
      '  This can cause accidental mainnet builds!'
    );
  }
  
  // 4. Validate Treasury seeds match between Rust and TypeScript
  const treasurySeedsInCode = TREASURY_SEEDS.toString();
  const rustTreasuryPath = './programs/escrow/src/state/treasury.rs';
  const rustTreasurySource = fs.readFileSync(rustTreasuryPath, 'utf-8');
  
  if (!rustTreasurySource.includes(`b"${treasurySeedsInCode}"`)) {
    errors.push(
      `Treasury seeds mismatch!\n` +
      `  TypeScript: "${treasurySeedsInCode}"\n` +
      `  Rust: (check ${rustTreasuryPath})`
    );
  } else {
    console.log(`✓ Treasury seeds synchronized`);
  }
  
  // 5. Derive and display Treasury PDA
  const connection = new Connection(
    environment === 'staging' 
      ? 'https://api.devnet.solana.com' 
      : 'https://api.mainnet-beta.solana.com'
  );
  
  // Load platform authority
  const authorityPath = environment === 'staging'
    ? `${process.env.HOME || process.env.USERPROFILE}/.config/solana/id.json`
    : './wallets/production/production-admin.json';
  
  if (!fs.existsSync(authorityPath)) {
    warnings.push(`Platform authority not found: ${authorityPath}`);
  } else {
    const authorityData = JSON.parse(fs.readFileSync(authorityPath, 'utf-8'));
    const authority = new PublicKey(new Uint8Array(authorityData).slice(32));
    
    const [treasuryPDA] = deriveTreasuryPDA(authority, idlProgramId);
    console.log(`✓ Treasury PDA: ${treasuryPDA.toBase58()}`);
    
    // Check if Treasury exists on-chain
    try {
      const treasuryAccount = await connection.getAccountInfo(treasuryPDA);
      if (!treasuryAccount) {
        warnings.push(
          `Treasury PDA not initialized on ${environment}!\n` +
          `  Address: ${treasuryPDA.toBase58()}\n` +
          `  Run: npm run treasury:migrate`
        );
      } else {
        console.log(`✓ Treasury exists (${treasuryAccount.data.length} bytes)`);
        
        // Validate size
        if (treasuryAccount.data.length !== 82) {
          warnings.push(
            `Treasury structure mismatch!\n` +
            `  Expected: 82 bytes\n` +
            `  On-chain: ${treasuryAccount.data.length} bytes\n` +
            `  May need migration!`
          );
        }
      }
    } catch (error) {
      warnings.push(`Could not check Treasury on-chain: ${error}`);
    }
  }
  
  // 6. Check that program binary was built for correct environment
  const programBinaryPath = './target/deploy/easyescrow.so';
  if (!fs.existsSync(programBinaryPath)) {
    warnings.push('Program binary not found - needs building');
  } else {
    console.log(`✓ Program binary exists`);
  }
  
  // Report results
  console.log('\n' + '='.repeat(60));
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ ALL CHECKS PASSED');
    return { errors, warnings, success: true };
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach((w, i) => console.log(`${i + 1}. ${w}\n`));
  }
  
  if (errors.length > 0) {
    console.log('\n❌ ERRORS (BLOCKING):');
    errors.forEach((e, i) => console.log(`${i + 1}. ${e}\n`));
    return { errors, warnings, success: false };
  }
  
  return { errors, warnings, success: true };
}

// Run validation
const env = process.argv[2] as 'staging' | 'production';
if (!env || !['staging', 'production'].includes(env)) {
  console.error('Usage: npx ts-node scripts/validation/validate-deployment.ts [staging|production]');
  process.exit(1);
}

validateDeployment(env).then(result => {
  process.exit(result.success ? 0 : 1);
});
```

**Add to package.json:**
```json
{
  "scripts": {
    "validate:staging": "ts-node scripts/validation/validate-deployment.ts staging",
    "validate:production": "ts-node scripts/validation/validate-deployment.ts production",
    "predeploy:staging": "npm run validate:staging",
    "predeploy:production": "npm run validate:production"
  }
}
```

### Phase 3: Build Environment Validation (HIGH PRIORITY)

Add to `programs/escrow/build.rs`:

```rust
use std::env;

fn main() {
    // Ensure correct feature is being built
    let profile = env::var("PROFILE").unwrap_or_default();
    let features: Vec<String> = env::vars()
        .filter(|(key, _)| key.starts_with("CARGO_FEATURE_"))
        .map(|(key, _)| key.replace("CARGO_FEATURE_", "").to_lowercase())
        .collect();
    
    println!("cargo:warning=Building for profile: {}", profile);
    println!("cargo:warning=Active features: {:?}", features);
    
    // Warn if no environment feature is active
    if !features.iter().any(|f| ["mainnet", "devnet", "staging", "localnet"].contains(&f.as_str())) {
        println!("cargo:warning=⚠️  NO ENVIRONMENT FEATURE ACTIVE!");
        println!("cargo:warning=⚠️  Program will use default (staging)");
        println!("cargo:warning=⚠️  Use --features mainnet/devnet/staging/localnet");
    }
    
    // Error if multiple environment features are active
    let env_features: Vec<&String> = features.iter()
        .filter(|f| ["mainnet", "devnet", "staging", "localnet"].contains(&f.as_str()))
        .collect();
    
    if env_features.len() > 1 {
        panic!(
            "❌ MULTIPLE ENVIRONMENT FEATURES ACTIVE: {:?}\n\
             Only one environment feature can be active at a time!",
            env_features
        );
    }
}
```

### Phase 4: Pre-Commit Hooks (MEDIUM PRIORITY)

Create `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Running pre-commit validation..."

# Check if Rust program changed
if git diff --cached --name-only | grep -q "programs/escrow/src/"; then
  echo "📝 Rust program changed - validating..."
  
  # Check for program ID changes
  if git diff --cached programs/escrow/src/lib.rs | grep -q "declare_id"; then
    echo "⚠️  Program ID changed!"
    echo "   Make sure to:"
    echo "   1. Update IDL after building"
    echo "   2. Update backend program ID constant"
    echo "   3. Run validation script"
    read -p "   Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
  
  # Check for Treasury seeds changes
  if git diff --cached programs/escrow/src/state/treasury.rs | grep -q "SEED_PREFIX"; then
    echo "⚠️  Treasury seeds changed!"
    echo "   Make sure to:"
    echo "   1. Update src/config/treasury.ts"
    echo "   2. Run migration script"
    echo "   3. Update all tests"
    read -p "   Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
fi

echo "✅ Pre-commit checks passed"
```

---

## 📋 Production Deployment Checklist

**BEFORE deploying to production, complete ALL items:**

### Pre-Build Phase
- [ ] Verify `Cargo.toml` has NO default feature
- [ ] Verify `lib.rs` has correct program ID for production
- [ ] Run `cargo clean` to remove any cached builds
- [ ] Build with explicit feature: `cargo build-sbf --features mainnet`
- [ ] Verify binary was built for mainnet (check build logs)

### IDL Generation
- [ ] Run `anchor idl build`
- [ ] Extract IDL to correct location
- [ ] Verify IDL `address` field matches production program ID
- [ ] Commit IDL to repo

### Backend Updates
- [ ] Update `src/config/treasury.ts` if seeds changed
- [ ] Verify `offers.routes.ts` uses `deriveTreasuryPDA()`
- [ ] Run TypeScript build: `npm run build`
- [ ] Check for any TypeScript errors

### Validation
- [ ] Run `npm run validate:production`
- [ ] Fix any errors before proceeding
- [ ] Verify Treasury PDA derivation matches on-chain

### Deployment
- [ ] Deploy program: `solana program deploy --program-id <production-id>`
- [ ] Wait for confirmation (15-30 seconds)
- [ ] Check program on Solana Explorer
- [ ] Initialize Treasury if needed: `npm run treasury:migrate`
- [ ] Verify Treasury PDA exists on-chain

### Backend Deployment
- [ ] Push code to production branch
- [ ] Wait for CI/CD to complete
- [ ] Verify backend health endpoint
- [ ] Check backend logs for Treasury PDA address

### Post-Deployment Testing
- [ ] Run smoke test: Create offer → Accept → Verify
- [ ] Check Treasury PDA balance increased
- [ ] Run `npm run treasury:status` to verify tracking
- [ ] Monitor logs for any errors

### Rollback Plan
If anything fails:
1. Revert backend deployment
2. Do NOT redeploy program (on-chain state preserved)
3. Fix issues in separate branch
4. Re-run entire checklist

---

## 🎓 Lessons Learned

### 1. **Single Source of Truth**
Centralize PDA derivation logic to prevent divergence.

### 2. **Automated Validation**
Manual checks WILL be forgotten. Automate everything.

### 3. **Environment Isolation**
Use feature flags correctly and validate at build time.

### 4. **Pre-Deployment Testing**
Test the EXACT binary and IDL that will be deployed.

### 5. **Documentation**
Write it down! Future you will thank present you.

---

## 🔧 Quick Reference

### Current Treasury Configuration

| Environment | Program ID | Treasury Seeds | Treasury PDA |
|------------|------------|----------------|--------------|
| **Staging** | `AvdX...Zei` | `treasury_v2` | `DDrA...reY6` |
| **Production** | `2GFD...TQUx` | `treasury_v2` | TBD |

### Common Commands

```bash
# Validate before deployment
npm run validate:staging
npm run validate:production

# Build for specific environment
cd programs/escrow
cargo build-sbf --features mainnet  # Production
cargo build-sbf --features staging  # Staging
cargo build-sbf --features devnet   # Devnet

# Check Treasury status
npm run treasury:status

# Derive Treasury PDA
# Use src/config/treasury.ts deriveTreasuryPDA()

# Deploy program
solana program deploy target/deploy/easyescrow.so \
  --program-id <program-id> \
  --url <rpc-url>
```

---

## 📚 Related Documentation

- [PRODUCTION_DEPLOYMENT_RUNBOOK.md](./PRODUCTION_DEPLOYMENT_RUNBOOK.md)
- [PROGRAM_ID_MISMATCH_POSTMORTEM.md](../development/PROGRAM_ID_MISMATCH_POSTMORTEM.md)
- [TREASURY_MANAGEMENT.md](../operations/TREASURY_MANAGEMENT.md)

---

**Created:** November 27, 2025  
**Last Updated:** November 27, 2025  
**Next Review:** Before production deployment

