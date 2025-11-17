# PR #244 Deployment Issue - URGENT

**Date:** November 17, 2025  
**Status:** 🚨 CRITICAL - Partial Deployment

---

## 🚨 Problem

PR #244 was merged and deployed, but **only the TypeScript backend was deployed**.  
The **Rust Solana program was NOT rebuilt/redeployed** to mainnet.

### Evidence

**Current Production IDL** (`src/generated/anchor/escrow-idl-production.json`):
```json
{
  "name": "nft_b_mint",
  "type": {
    "option": "pubkey"  // ❌ STILL Option<Pubkey> - OLD VERSION!
  }
}
```

**Expected (PR #244)**:
```json
{
  "name": "nft_b_mint",
  "type": "pubkey"  // ✅ Should be regular Pubkey
}
```

---

## 📊 Current State

| Component | Status | Version |
|-----------|--------|---------|
| TypeScript Backend | ✅ Deployed | PR #244 (sends `SystemProgram.programId`) |
| Rust Program | ❌ OLD | Pre-PR #244 (expects `Option<Pubkey>`) |
| IDL | ❌ OLD | Still shows `option: pubkey` |

---

## 🐛 Symptoms

**Before PR #244:**
- ❌ Error 102 (`InstructionDidNotDeserialize`)

**After PR #244 (Current):**
- ❌ Error 2000 (Custom program error)
- ❌ Error 3012 (`AccountNotInitialized` for `escrow_nft_b_account`)

**Test Results:**
- ❌ NFT-for-SOL: Error 2000
- ❌ NFT-for-NFT: Error 3012 (AccountNotInitialized)
- ❌ Zero-fee: Error 2000
- ❌ Idempotency: Error 2000
- ❌ Concurrent: Error 2000

**19 tests still failing** (same failures, different error codes)

---

## 🔍 Root Cause

### Deployment Mismatch

**TypeScript sends:**
```typescript
nftBMint: SystemProgram.programId  // Regular Pubkey (32 bytes)
```

**Rust program expects:**
```rust
nft_b_mint: Option<Pubkey>  // OLD SIGNATURE
// Expects: 0x00 (None) or 0x01 + 32 bytes (Some)
```

**Result:**
The program receives 32 bytes of a pubkey but tries to deserialize it as `Option<Pubkey>`, causing:
1. First byte interpreted as discriminant (not 0x00 or 0x01)
2. Deserialization fails
3. Error 2000 thrown

---

## ✅ Required Actions

### 1. **Rebuild Rust Program**
```bash
# On build server/CI:
cd /path/to/easy-escrow-ai-backend
anchor build -- --features mainnet
```

### 2. **Deploy Program to Mainnet**
```bash
# Requires mainnet admin wallet
solana program deploy \
  --program-id 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  target/deploy/escrow.so \
  --keypair /path/to/mainnet-admin.json \
  --url https://api.mainnet-beta.solana.com
```

### 3. **Update IDL**
The IDL should update automatically when the program is deployed.  
Verify by checking `src/generated/anchor/escrow-idl-production.json`:

```json
{
  "name": "nft_b_mint",
  "type": "pubkey"  // ✅ Should change to this
}
```

### 4. **Verify Deployment**
```bash
# Check on-chain program hash
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
```

### 5. **Re-run E2E Tests**
```bash
npm run test:production:e2e
```

**Expected:**
- ✅ All NFT-for-SOL tests pass
- ✅ All NFT-for-NFT tests pass
- ✅ Error 2000 gone
- ✅ Error 3012 gone

---

## 📝 Deployment Checklist

- [ ] Rust program rebuilt with PR #244 changes
- [ ] Program deployed to mainnet (2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx)
- [ ] IDL updated (shows `"type": "pubkey"` not `"type": {"option": "pubkey"}`)
- [ ] Production E2E tests pass
- [ ] No Error 2000 in logs
- [ ] No Error 3012 in logs

---

## 🎓 Why This Happened

**Likely Causes:**
1. CI/CD didn't trigger Rust program build
2. Program deployment step was skipped/failed
3. Only backend deployment ran (Docker image)
4. Manual deployment needed but not executed

**Prevention:**
- Ensure CI/CD rebuilds Solana program on changes to `programs/`
- Add verification step to check IDL matches source
- Require both backend AND program deployment for PRs affecting Rust code

---

## 🚨 Impact

**Production Status:** 🔴 **DOWN**
- No agreements can be created
- All swap types failing
- Platform unusable

**User Impact:**
- 100% failure rate on agreement creation
- No transactions completing
- Revenue: $0

---

## ⏰ Timeline

| Time | Event |
|------|-------|
| 00:30 UTC | PR #244 merged |
| 00:35 UTC | Backend deployed (TypeScript) |
| 00:35 UTC | Rust program NOT deployed |
| 00:43 UTC | E2E tests run |
| 00:43 UTC | Error 2000 discovered |
| 00:50 UTC | IDL inspection reveals old program |

---

## 📞 Contact

**Action Required:** Deploy Rust program to mainnet **IMMEDIATELY**

**Next Steps:**
1. User approves program deployment
2. CI/CD or manual deployment executes
3. Verify IDL updates
4. Re-test E2E
5. Confirm production working

---

**THIS IS A CRITICAL PRODUCTION ISSUE**  
**The fix (PR #244) is correct, but only half-deployed.**

