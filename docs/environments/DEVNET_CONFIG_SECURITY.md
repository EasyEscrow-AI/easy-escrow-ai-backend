# Devnet Config Security Fix

## Issue

**Security Vulnerability:** The file `tests/fixtures/devnet-config.json` was not explicitly gitignored, creating a risk that private keys could be accidentally committed to version control.

**Severity:** Medium (devnet keys, but still a security best practice violation)

**Discovered:** October 16, 2025 by Cursor bot code review

## Root Cause

1. **Missing .gitignore entry** - While `.gitignore` had patterns for keypair files, `devnet-config.json` was not explicitly listed
2. **No pre-commit protection** - Pre-commit hooks didn't specifically block `devnet-config.json`
3. **Documentation gap** - Some docs stated the file was gitignored when it wasn't

## Fix Implemented

### 1. Updated `.gitignore`

Added explicit entries:
```gitignore
# Devnet test configuration with private keys - NEVER COMMIT
tests/fixtures/devnet-config.json
**/devnet-config.json
```

**Location:** Line 178-180 in `.gitignore`

### 2. Updated Pre-commit Hooks

**PowerShell hook** (`scripts/pre-commit-secrets-check.ps1`):
```powershell
$dangerousFiles = $stagedFiles | Where-Object {
    $_ -match "\.(key|pem|p12|pfx)$|id_rsa|\.env|keypair.*\.json|.*-keypair\.json|devnet-config\.json"
}
```

**Bash hook** (`scripts/pre-commit-secrets-check.sh`):
```bash
DANGEROUS_FILES=$(echo "$STAGED_FILES" | grep -E "\.(key|pem|p12|pfx)$|id_rsa|\.env|keypair.*\.json|.*-keypair\.json|devnet-config\.json" || true)
```

### 3. Created Template File

Created `tests/fixtures/devnet-config.example.json` showing the expected structure without real keys.

**Usage:**
```bash
cp tests/fixtures/devnet-config.example.json tests/fixtures/devnet-config.json
# Edit and add your keys
```

### 4. Created Security Documentation

Created `tests/fixtures/README.md` with:
- ⚠️ Security warnings
- File descriptions (which are safe, which are dangerous)
- Setup instructions (3 options: script, template, or env vars)
- Pre-commit protection explanation
- Incident response procedures

## Security Layers

After this fix, we have **5 layers of protection**:

| Layer | Protection | Location |
|-------|-----------|----------|
| 1. .gitignore | Prevents git from tracking the file | `.gitignore` lines 178-180 |
| 2. Pre-commit (PS) | Blocks commits with devnet-config.json | `scripts/pre-commit-secrets-check.ps1` |
| 3. Pre-commit (Bash) | Blocks commits with devnet-config.json | `scripts/pre-commit-secrets-check.sh` |
| 4. Pattern scanning | Detects base58 keys in any file | `.git-secrets-patterns` |
| 5. Documentation | Educates developers | `tests/fixtures/README.md` |

## Testing the Fix

### Test 1: Verify .gitignore Works
```powershell
# Create the file
echo '{"test": "data"}' > tests/fixtures/devnet-config.json

# Check git status - should NOT show as untracked
git status

# Clean up
Remove-Item tests/fixtures/devnet-config.json
```

**Expected:** File should not appear in `git status` output

### Test 2: Verify Pre-commit Hook
```powershell
# Create the file and try to commit
echo '{"test": "data"}' > tests/fixtures/devnet-config.json
git add tests/fixtures/devnet-config.json
git commit -m "test"
```

**Expected:** Commit should be **BLOCKED** with error:
```
❌ Dangerous file types detected:
   - tests/fixtures/devnet-config.json
❌ COMMIT BLOCKED: Potential secrets detected
```

### Test 3: Verify Template Works
```powershell
# Template should exist and be tracked
Test-Path tests/fixtures/devnet-config.example.json  # Should be True
git status tests/fixtures/devnet-config.example.json  # Should be tracked
```

## Migration for Existing Users

If you already have `devnet-config.json` in your working directory:

1. **File is NOT in git history** ✅
   ```bash
   git log --all --full-history -- tests/fixtures/devnet-config.json
   ```
   If this returns nothing, you're safe.

2. **Keep your local file** - It's now properly gitignored
   ```bash
   # Your local file will remain and work
   # But it won't be committed
   ```

3. **Verify it's ignored**
   ```bash
   git status  # Should NOT show devnet-config.json
   ```

## For New Users

Choose one of three setup methods:

### Method 1: Setup Script (Recommended)
```powershell
.\scripts\setup-static-devnet-wallets.ps1
```

### Method 2: Copy Template
```bash
cp tests/fixtures/devnet-config.example.json tests/fixtures/devnet-config.json
# Edit and add your keys
```

### Method 3: Environment Variables
Set these instead of using the file:
- `DEVNET_SENDER_KEY`
- `DEVNET_RECEIVER_KEY`
- `DEVNET_ADMIN_KEY`
- `DEVNET_FEE_COLLECTOR_KEY`

## Why This Matters (Even for Devnet)

1. **Security Best Practices** - Builds good habits for production
2. **Attack Surface** - Exposed devnet keys can still be drained
3. **Credential Rotation** - Makes it harder to rotate compromised keys
4. **Audit Compliance** - Shows commitment to security in audits
5. **Supply Chain Security** - Prevents downstream compromises

## Related Documentation

- [Static Devnet Wallets Guide](./STATIC_DEVNET_WALLETS.md)
- [Security Incident Policy](./SECURITY_INCIDENT_CREDENTIAL_EXPOSURE.md)
- [Test Fixtures README](../tests/fixtures/README.md)
- [Pre-commit Hooks Setup](../scripts/utilities/git-hooks/setup-git-hooks.ps1)

## Verification Checklist

- [x] `.gitignore` updated with explicit entries
- [x] PowerShell pre-commit hook blocks devnet-config.json
- [x] Bash pre-commit hook blocks devnet-config.json  
- [x] Template file created (devnet-config.example.json)
- [x] Security documentation created (this file)
- [x] Test fixtures README updated
- [x] No devnet-config.json in git history
- [x] No devnet-config.json currently tracked by git

## Status

✅ **FIXED** - All security layers in place

**Date Fixed:** October 16, 2025  
**Branch:** `fix-timeout-mdc-hanging`  
**Fixed By:** AI Assistant (Cursor)  
**Verified By:** Pending user verification

