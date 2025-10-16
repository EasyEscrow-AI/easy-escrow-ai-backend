# Cursor Command Hanging Fix

## Issue

**Problem:** Cursor agent commands were hanging during execution, requiring manual ENTER key presses to continue.

**Symptoms:**
- `Write-Host` commands hanging
- `git status` and other git commands hanging
- Simple file operations taking too long
- User had to press ENTER repeatedly to allow Cursor chat to continue

**Date Reported:** October 16, 2025  
**Branch:** `fix-timeout-mdc-hanging`

## Root Cause

The `.cursorrules` file contained a policy that instructed the AI to wrap **ALL** terminal commands with timeout utilities:

```
When executing terminal commands using `run_terminal_cmd`, 
automatically apply timeouts based on command type to prevent hanging operations.
```

This caused:
1. **Overhead on fast commands** - Even `Write-Host` and `git status` were being wrapped
2. **Output buffering issues** - Wrapper scripts interfered with stdout/stderr handling
3. **Job management overhead** - PowerShell Start-Job added unnecessary complexity
4. **Hanging behavior** - Commands would wait for input instead of completing immediately

## Solution

Updated `.cursorrules` to **ONLY wrap slow commands**, allowing fast commands to run directly.

### New Policy

**Run Fast Commands Directly ✅**
- Output: `Write-Host`, `echo`, `Write-Output`
- Quick git: `git status`, `git branch`, `git log`, `git diff`
- File ops: `ls`, `dir`, `pwd`, `cat`, `type`
- Version checks: `node --version`, `npm --version`

**Use Timeout Wrapper ONLY for Slow Commands ⚠️**
- Builds: `npm run build`, `tsc`, `anchor build`
- Package management: `npm install`, `npm ci`
- Tests: `npm test`, integration tests, e2e tests
- Database: `prisma migrate`, `db push`
- Blockchain: `solana airdrop`, `anchor deploy`
- Git network: `git fetch`, `git pull`, `git push`

## Files Changed

### 1. `.cursorrules` (Version Controlled) ✅ CRITICAL
**Status:** Updated and committed

**Changes:**
- Added clear section: "Run Fast Commands Directly, Only Wrap Slow Commands"
- Added table categorizing commands (fast vs slow)
- Added "Why This Matters" section explaining hanging issues
- Added Quick Reference table for easy lookup
- Removed confusing "Automatic Timeout Application" language

**Impact:** Fixes the hanging issue for all developers using Cursor on this project

### 2. `.cursor/rules/timeout-commands.mdc` (Local IDE) ✅ Updated
**Status:** Updated locally (not version controlled)

**Changes:** Same policy update as `.cursorrules`

**Impact:** Fixes the hanging issue for current developer's local IDE

## Testing Results

### Before Fix ❌
```
> Write-Host "Test"
[Hanging... waiting for input]
[User presses ENTER]
Test
```

### After Fix ✅
```
> Write-Host "Test"
Test
[Completes instantly]
```

### Test Commands Run Successfully
```powershell
✅ Write-Host "Testing direct execution - this should complete instantly"
   - Completed instantly
   - No hanging
   - Clean output

✅ git status
   - Completed instantly
   - No hanging
   - Proper output displayed
```

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Execution Speed** | Slow (job overhead) | Instant |
| **User Experience** | Required ENTER presses | Seamless |
| **Output Handling** | Buffered, delayed | Direct, immediate |
| **Reliability** | Hanging issues | Stable |
| **Overhead** | High (job mgmt) | Minimal |

## Implementation Details

### Fast Commands (Run Directly)
```typescript
// No wrapper needed
run_terminal_cmd({ 
  command: "git status", 
  is_background: false 
})
```

### Slow Commands (Use Wrapper)
```powershell
# PowerShell with timeout wrapper
.\scripts\run-with-timeout.ps1 -Command "npm" -Arguments "run","build" -Timeout 60
```

### Background Processes (Use Flag)
```typescript
// Use is_background flag
run_terminal_cmd({
    command: "npm run dev",
    is_background: true
})
```

## Quick Reference

| Command Type | Example | Use Wrapper? | Reason |
|-------------|---------|--------------|--------|
| Output | `Write-Host`, `echo` | ❌ NO | Fast, no risk |
| Quick git | `git status`, `git branch` | ❌ NO | Fast, no network |
| File ops | `ls`, `pwd`, `cat` | ❌ NO | Fast, local only |
| Builds | `npm run build`, `tsc` | ✅ YES | Slow, can hang |
| Installs | `npm install` | ✅ YES | Slow, network |
| Tests | `npm test` | ✅ YES | Slow, can fail |
| Git network | `git pull`, `git push` | ✅ YES | Network, can hang |
| Background | `npm run dev` | 🔵 USE is_background | Runs indefinitely |

## Related Documentation

- [Terminal Timeout Policy](./TERMINAL_TIMEOUT_POLICY.md) - Full policy details
- [Timeout Utilities](./TIMEOUT_UTILITIES.md) - Usage guide for wrapper scripts
- [.cursorrules](.././.cursorrules) - Updated project rules

## Commits

1. **`3bf311e`** - fix: Update .cursorrules to prevent hanging on fast commands
2. **`c8a03aa`** - security: Prevent devnet-config.json from being committed with private keys

## Status

✅ **FIXED** - Commands no longer hang

**Before:**
- ❌ Write-Host hanging
- ❌ git status hanging
- ❌ Required pressing ENTER
- ❌ Slow execution

**After:**
- ✅ Write-Host completes instantly
- ✅ git status completes instantly
- ✅ No manual intervention needed
- ✅ Fast execution

## Verification Steps

To verify the fix is working:

1. **Test Fast Command:**
   ```powershell
   Write-Host "Test"
   ```
   Should complete instantly without hanging.

2. **Test Git Command:**
   ```powershell
   git status
   ```
   Should complete instantly with proper output.

3. **Verify Slow Commands Still Protected:**
   ```powershell
   # These should still use timeout wrapper
   npm run build
   npm install
   ```

## Lessons Learned

1. **Don't over-protect** - Not all commands need timeout wrappers
2. **Performance matters** - Wrapper overhead is significant for fast commands
3. **Output handling** - Job wrappers can interfere with stdout/stderr
4. **User experience** - Hanging behavior is very frustrating
5. **Clear documentation** - Policy must be unambiguous about when to use wrappers

## Future Improvements

- Monitor which commands are slow vs fast in practice
- Consider automatic detection in the wrapper itself
- Add metrics to track command execution times
- Create a whitelist of "always direct" commands

## Conclusion

✅ **Issue resolved** - Fast commands now run directly without hanging.  
✅ **Security improved** - Also fixed devnet-config.json exposure issue.  
✅ **Documentation updated** - Clear guidelines for future development.  
✅ **User experience** - Significantly improved command execution flow.

