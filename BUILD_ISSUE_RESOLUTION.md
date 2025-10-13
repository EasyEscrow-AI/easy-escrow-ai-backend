# Build Issue Resolution

## Problem Summary

We've encountered a Rust toolchain compatibility issue when building the Solana program:

- **Anchor Version**: 0.32.1 (configured in Anchor.toml)
- **Solana CLI**: 1.18.26
- **Solana BPF Toolchain**: 1.75.0-dev (comes with Solana CLI)
- **Required Rust Version**: 1.76+ (required by dependencies)

### Error:
```
error: package `toml_edit v0.23.7` cannot be built because it requires rustc 1.76 or newer,
while the currently active rustc version is 1.75.0-dev
```

## Root Cause

Anchor 0.32.1 uses newer dependencies (solana-program v2.3.0, borsh v1.5.7) that require Rust 1.76+, but Solana CLI 1.18.26's BPF toolchain uses Rust 1.75.0-dev.

## Solutions

### Option 1: Downgrade Anchor (Recommended for Quick Deploy)

Downgrade to Anchor 0.30.x which is compatible with Solana 1.18.26:

```powershell
# Update Anchor.toml
# Change: anchor_version = "0.30.1"

# Install older Anchor version
avm install 0.30.1
avm use 0.30.1

# Update program dependencies in programs/escrow/Cargo.toml
# anchor-lang = "0.30.1"
# anchor-spl = "0.30.1"

# Rebuild
anchor build
```

### Option 2: Upgrade to Agave (Latest Solana)

The latest Solana has transitioned to Agave with newer toolchains:

```powershell
# Uninstall old Solana
solana-install uninstall

# Install Agave (requires manual download from GitHub)
# Visit: https://github.com/anza-xyz/agave/releases/latest
# Download and install the latest Agave release

# Verify
solana --version  # Should show v2.x.x

# Then build with Anchor 0.32.1
anchor build
```

### Option 3: Use Localnet Testing First

Since the program code is complete, we can:
1. Skip devnet deployment for now
2. Set up localnet testing (Task 38)
3. Test all functionality locally
4. Come back to devnet deployment after toolchain updates

## Recommended Path Forward

**I recommend Option 1** (Downgrade Anchor) because:
- ✅ Quickest solution (5-10 minutes)
- ✅ Works with your current Solana installation
- ✅ Gets program deployed to devnet today
- ✅ Minimal code changes
- ⚠️  Can upgrade to Anchor 0.32.1 later when needed

## Next Steps

Let me know which option you prefer, and I'll implement it right away!

---

## Alternative: Deploy Pre-built Program

If you have the compiled program from another machine, we can deploy it directly:
```powershell
solana program deploy target/deploy/escrow.so
```

---

**Created**: October 13, 2025  
**Status**: Awaiting decision on resolution path

