# Program ID Mismatch Postmortem

## Issue Summary

**Problem:** Repeated `DeclaredProgramIdMismatch` errors (0x1004) in staging deployments, requiring multiple hotfixes to correct IDL address mismatches.

**Impact:** 
- 7 bugs discovered through real-world testing
- Multiple PR cycles to fix the same root issue
- Blocked E2E testing and Treasury validation
- Developer frustration

**Date:** 2025-11-27

---

## Root Cause

### The Conflict

**Cargo.toml (Line 12):**
```toml
default = ["mainnet"]  # Default to mainnet for safety
```

**lib.rs (Lines 25-27):**
```rust
// Default: staging (if no feature specified)
#[cfg(not(any(feature = "mainnet", feature = "devnet", feature = "localnet")))]
declare_id!("AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei");
```

**The Problem:**
- Cargo.toml defaults to `mainnet` feature
- lib.rs comment says "staging" is default
- When building WITHOUT explicit feature flags, mainnet wins
- This caused IDL to extract mainnet program ID
- Staging deployments then failed with address mismatch

### What Happened

**Timeline of Events:**
1. User requested program rebuild for staging
2. AI ran `cargo clean && cargo build-sbf` (NO feature flag!)
3. Cargo used `default = ["mainnet"]` from Cargo.toml
4. Binary compiled with mainnet ID (`2GFD...`)
5. `anchor idl build` extracted mainnet ID into IDL
6. Deployed program binary to staging (`AvdX...` address)
7. Backend used IDL with mainnet address
8. Every swap failed: "Program at `AvdX...` has ID `2GFD...`"

---

## Why This Kept Happening

### 1. Documentation Exists But Wasn't Followed

**Existing Docs:**
- ✅ [PROGRAM_ID_MANAGEMENT.md](./PROGRAM_ID_MANAGEMENT.md) - Complete guide
- ✅ [PROGRAM_ENVIRONMENTS.md](../environments/PROGRAM_ENVIRONMENTS.md) - Environment setup
- ✅ [solana-program-build.mdc](../../.cursor/rules/solana-program-build.mdc) - Build instructions

**But...**
- AI didn't reference them during the rebuild
- No enforcement mechanism to ensure docs are followed
- Build process allowed manual deviation from documented workflow

### 2. No Automated Verification

**What Was Missing:**
- No post-build verification of program ID
- No IDL address validation before commit
- No CI check to catch mismatches
- No build script to enforce correct flow

### 3. Misleading Comments

**lib.rs Line 25:**
```rust
// Default: staging (if no feature specified)
```

**Reality:** When no feature is specified in the BUILD command, Cargo.toml's `default = ["mainnet"]` takes effect, NOT the `#[cfg(not(any(...)))]` fallback.

The comment implied staging was default, leading to false assumptions.

---

## Prevention Strategy

### 1. Update Cargo.toml Default

**Change:**
```toml
# OLD (dangerous for staging work)
default = ["mainnet"]

# NEW (safe for development)
default = ["staging"]
```

**Why:** Most development work happens on staging. Making staging the default prevents accidental mainnet builds. For production, we'll ALWAYS use explicit `--features mainnet`.

**Trade-off:** Slightly less "safe" but more practical. Production builds will be in CI/CD with explicit flags anyway.

### 2. Create Build Scripts

**File:** `scripts/solana/build-staging.ps1`
```powershell
#!/usr/bin/env pwsh

Write-Host "`n🏗️  Building Solana Program for STAGING..." -ForegroundColor Cyan
Write-Host "Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`n"

# Set HOME for Solana tools
$env:HOME = $env:USERPROFILE

# Navigate to program directory
Push-Location programs/escrow

try {
    # Clean previous builds
    cargo clean

    # Build with explicit staging feature
    Write-Host "Building program binary..." -ForegroundColor Yellow
    cargo build-sbf --features staging
    
    if ($LASTEXITCODE -ne 0) {
        throw "Program build failed"
    }

    Write-Host "✅ Program binary built successfully`n" -ForegroundColor Green

    # Navigate back to root
    Pop-Location

    # Generate IDL
    Write-Host "Generating IDL..." -ForegroundColor Yellow
    anchor idl build

    if ($LASTEXITCODE -ne 0) {
        throw "IDL generation failed"
    }

    Write-Host "✅ IDL generated successfully`n" -ForegroundColor Green

    # Extract and validate program ID from IDL
    $idl = Get-Content "target/idl/escrow.json" | ConvertFrom-Json
    $idlAddress = $idl.address

    Write-Host "Validating IDL address..." -ForegroundColor Yellow
    if ($idlAddress -ne "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei") {
        Write-Host "❌ ERROR: IDL has wrong address!" -ForegroundColor Red
        Write-Host "  Expected: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei (staging)" -ForegroundColor Yellow
        Write-Host "  Got:      $idlAddress" -ForegroundColor Red
        throw "IDL address validation failed"
    }

    Write-Host "✅ IDL address validated: $idlAddress`n" -ForegroundColor Green

    # Copy IDL to backend
    Write-Host "Updating backend IDL..." -ForegroundColor Yellow
    Copy-Item "target/idl/escrow.json" "src/generated/anchor/escrow-idl-staging.json" -Force

    Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host   "║  ✅ STAGING BUILD COMPLETE                                   ║" -ForegroundColor Green
    Write-Host   "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Green
    Write-Host   "║  Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei  ║" -ForegroundColor Green
    Write-Host   "║  Network:    Devnet                                          ║" -ForegroundColor Green
    Write-Host   "║  Binary:     target/deploy/easyescrow.so                     ║" -ForegroundColor Green
    Write-Host   "║  IDL:        src/generated/anchor/escrow-idl-staging.json    ║" -ForegroundColor Green
    Write-Host   "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Green
    Write-Host   "║  Next: Deploy with npm run deploy:staging                    ║" -ForegroundColor Green
    Write-Host   "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green

} catch {
    Pop-Location
    Write-Host "`n❌ BUILD FAILED: $_" -ForegroundColor Red
    exit 1
}
```

**File:** `scripts/solana/build-production.ps1`
```powershell
#!/usr/bin/env pwsh

Write-Host "`n🏗️  Building Solana Program for PRODUCTION..." -ForegroundColor Magenta
Write-Host "Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`n"

# (Similar structure with --features mainnet and validation for mainnet ID)
```

### 3. Add NPM Scripts

**package.json:**
```json
{
  "scripts": {
    "build:staging": "pwsh scripts/solana/build-staging.ps1",
    "build:production": "pwsh scripts/solana/build-production.ps1",
    "deploy:staging": "solana program deploy target/deploy/easyescrow.so --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet",
    "deploy:production": "solana program deploy target/deploy/easyescrow.so --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta"
  }
}
```

### 4. Add Pre-Commit Hook

**File:** `.husky/pre-commit`
```bash
#!/bin/sh

# Check if IDL files have been modified
IDL_STAGING="src/generated/anchor/escrow-idl-staging.json"
IDL_PRODUCTION="src/generated/anchor/escrow-idl-production.json"

if git diff --cached --name-only | grep -q "$IDL_STAGING"; then
  echo "🔍 Validating staging IDL address..."
  ADDRESS=$(grep -o '"address": "[^"]*"' "$IDL_STAGING" | cut -d'"' -f4)
  
  if [ "$ADDRESS" != "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei" ]; then
    echo "❌ ERROR: Staging IDL has wrong address: $ADDRESS"
    echo "Expected: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
    exit 1
  fi
  
  echo "✅ Staging IDL address validated"
fi

if git diff --cached --name-only | grep -q "$IDL_PRODUCTION"; then
  echo "🔍 Validating production IDL address..."
  ADDRESS=$(grep -o '"address": "[^"]*"' "$IDL_PRODUCTION" | cut -d'"' -f4)
  
  if [ "$ADDRESS" != "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx" ]; then
    echo "❌ ERROR: Production IDL has wrong address: $ADDRESS"
    echo "Expected: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"
    exit 1
  fi
  
  echo "✅ Production IDL address validated"
fi
```

### 5. Add CI Validation

**GitHub Actions:**
```yaml
- name: Validate Staging Build
  run: |
    npm run build:staging
    
    # Verify program ID in IDL
    IDL_ADDRESS=$(jq -r '.address' src/generated/anchor/escrow-idl-staging.json)
    if [ "$IDL_ADDRESS" != "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei" ]; then
      echo "❌ IDL address mismatch!"
      exit 1
    fi
```

### 6. Update Documentation

**Add to PROGRAM_ID_MANAGEMENT.md:**
```markdown
## ⚠️ CRITICAL: Always Use Build Scripts

### ❌ NEVER DO THIS:
```bash
cargo build-sbf  # Missing feature flag!
```

### ✅ ALWAYS DO THIS:
```bash
npm run build:staging       # For staging
npm run build:production    # For production
```

### Why?
Without explicit feature flags, Cargo.toml's default may not match your intent.
Build scripts ensure:
- Correct feature flag
- IDL address validation
- Automatic backend IDL update
```

### 7. Add Agent Instructions

**Update .cursor/rules:**
```markdown
## Solana Program Building (CRITICAL)

**For staging builds:**
```bash
npm run build:staging
```

**For production builds:**
```bash
npm run build:production
```

**NEVER run raw `cargo build-sbf` or `anchor build` without these scripts!**

The scripts:
1. Use correct feature flags
2. Validate IDL addresses
3. Update backend IDLs
4. Prevent mismatches
```

---

## Lessons Learned

### 1. Documentation Alone Is Not Enough

✅ **What Worked:**
- Comprehensive documentation existed
- Clear guides and examples

❌ **What Failed:**
- No enforcement mechanism
- Easy to deviate from documented process
- AI didn't reference docs during rebuild

**Solution:** Automation > Documentation

### 2. Defaults Matter

✅ **What Worked:**
- Having environment-specific feature flags

❌ **What Failed:**
- Misleading "default" comment in lib.rs
- Cargo.toml default didn't match development workflow

**Solution:** Make the COMMON case the default

### 3. Validation Catches Errors

✅ **What Would Have Worked:**
- Post-build IDL address validation
- Pre-commit hooks
- CI checks

❌ **What We Didn't Have:**
- Any automated validation

**Solution:** Validate at every step

### 4. Test in Production-Like Environments

✅ **What Worked:**
- Iterative staging testing found ALL 7 bugs
- Real-world integration testing

❌ **What Wouldn't Have Worked:**
- Unit tests alone
- Mocked Anchor program

**Solution:** Integration testing >>> Unit tests for complex systems

---

## Action Items

### Immediate (This PR)
- [x] Fix IDL address in PR #296
- [ ] Update Cargo.toml default to staging
- [ ] Fix misleading comment in lib.rs

### Short-term (Next Sprint)
- [ ] Create build-staging.ps1 script
- [ ] Create build-production.ps1 script
- [ ] Add npm scripts
- [ ] Add pre-commit hook
- [ ] Update PROGRAM_ID_MANAGEMENT.md

### Long-term (Continuous)
- [ ] Add CI validation
- [ ] Monitor for similar issues
- [ ] Update agent instructions
- [ ] Create troubleshooting runbook

---

## Related Documentation

- [PROGRAM_ID_MANAGEMENT.md](./PROGRAM_ID_MANAGEMENT.md)
- [PROGRAM_ENVIRONMENTS.md](../environments/PROGRAM_ENVIRONMENTS.md)
- [solana-program-build.mdc](../../.cursor/rules/solana-program-build.mdc)

---

**Date Created:** 2025-11-27  
**Created By:** AI Agent (after 7 real-world bugs)  
**Status:** Awaiting implementation of prevention measures

