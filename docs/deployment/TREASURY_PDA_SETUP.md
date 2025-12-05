# Production Treasury PDA Setup Guide

**Created:** December 5, 2025  
**Task:** 33 - Treasury PDA Setup and Configuration  
**Status:** Ready for Execution

---

## 🎯 Overview

This guide covers the complete process of setting up the Treasury PDA on Solana mainnet for collecting platform fees from atomic swap transactions.

**Treasury PDA Details:**
- **Address:** `FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu`
- **Authority:** `HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF`
- **Bump:** 255
- **Program ID:** `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- **Seeds:** `[b"main_treasury", authority_pubkey]`

---

## ✅ Prerequisites Checklist

Before starting:

- [ ] Treasury authority keypair exists at `wallets/production/production-treasury.json`
- [ ] Production program deployed to mainnet at `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- [ ] Production IDL available at `src/generated/anchor/escrow-idl-production.json`
- [ ] Mainnet RPC URL configured (Helius or QuickNode recommended)
- [ ] Solana CLI tools installed and configured

---

## 📋 Step-by-Step Setup

### Step 1: Verify Treasury Authority Keypair

**Check keypair exists:**
```bash
ls wallets/production/production-treasury.json
```

**Extract public key:**
```bash
solana-keygen pubkey wallets/production/production-treasury.json
```

**Expected Output:**
```
HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF
```

### Step 2: Fund Treasury Authority

The treasury authority needs SOL to pay for:
- Account creation rent: ~0.002 SOL
- Transaction fees: ~0.000005 SOL

**Recommended funding:** 0.01 SOL (provides buffer)

**Fund from deployer or admin wallet:**
```bash
# Check current balance
solana balance HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF --url mainnet-beta

# Transfer SOL (example from deployer)
solana transfer HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF 0.01 \
  --from wallets/production/mainnet-deployer.json \
  --url mainnet-beta

# Verify transfer
solana balance HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF --url mainnet-beta
```

**Expected Output:**
```
0.01 SOL
```

### Step 3: Derive Treasury PDA (Verification)

**Run derivation script:**
```bash
npx ts-node scripts/production/derive-treasury-pda.ts
```

**Expected Output:**
```
╔══════════════════════════════════════════════════════════════╗
║         Production Treasury PDA Derivation                   ║
╚══════════════════════════════════════════════════════════════╝

📋 Input Parameters:
   Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
   Authority:  HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF
   Seed:       "main_treasury"

✅ Treasury PDA Derived Successfully!

📦 Results:
   Treasury PDA: FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu
   Bump Seed:    255
```

### Step 4: Initialize Treasury PDA on Mainnet

⚠️  **CRITICAL: This is a ONE-TIME operation!**

**Run initialization script:**
```bash
# Set mainnet RPC URL (optional, defaults to public endpoint)
export MAINNET_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY"

# Run initialization
npx ts-node scripts/production/initialize-treasury.ts
```

**Expected Output:**
```
╔══════════════════════════════════════════════════════════════╗
║      Initialize Production Treasury PDA on Mainnet          ║
╚══════════════════════════════════════════════════════════════╝

⚠️  WARNING: This is a ONE-TIME production operation!

📋 Configuration:
   RPC URL:     https://mainnet.helius-rpc.com/...
   Program ID:  2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
   Authority:   wallets/production/production-treasury.json

🔗 Connecting to Solana mainnet...
   ✅ Connected (version: 1.18.x)

🔑 Loading treasury authority keypair...
   Authority:   HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF

💰 Checking authority balance...
   Balance:     0.0100 SOL
   ✅ Sufficient balance

🔍 Deriving Treasury PDA...
   Treasury PDA: FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu
   Bump:         255

🔍 Checking if Treasury PDA already exists...
   ✅ Treasury PDA does not exist (ready for initialization)

📦 Loading program IDL...
   ✅ IDL loaded

🔧 Setting up Anchor program...
   ✅ Program initialized

📝 Treasury Configuration:
   Authorized Withdrawal Wallet: HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF

🚀 Initializing Treasury PDA on mainnet...
   ⏳ Sending transaction...

   ✅ Transaction confirmed!

📝 Transaction Details:
   Signature: 2eYzV...
   Explorer:  https://solscan.io/tx/2eYzV...

🔍 Verifying Treasury PDA initialization...
   ✅ Treasury PDA exists!
   Owner:    2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
   Size:     114 bytes
   Lamports: 1795680

╔══════════════════════════════════════════════════════════════╗
║                  INITIALIZATION SUCCESSFUL!                  ║
╚══════════════════════════════════════════════════════════════╝

📋 Treasury PDA Details:
   Address:   FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu
   Authority: HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF
   Bump:      255
   Explorer:  https://solscan.io/account/FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu

📝 Next Steps:
   1. Update production environment variables
   2. Test fee collection with a test swap
   3. Monitor Treasury PDA balance for incoming fees
```

### Step 5: Verify Treasury PDA on Blockchain

**Check account via Solana CLI:**
```bash
solana account FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu --url mainnet-beta
```

**Expected Output:**
```
Public Key: FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu
Balance: 0.00179568 SOL
Owner: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
Executable: false
Rent Epoch: <current epoch>
Length: 114 bytes (0x72)
```

**Check on Solscan:**
- Navigate to: https://solscan.io/account/FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu
- Verify:
  - Owner: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
  - Data length: 114 bytes
  - Account exists and is initialized

### Step 6: Update Production Environment Variables

Add these to `.env.production` and DigitalOcean App Platform:

```bash
# Treasury PDA Configuration
MAINNET_TREASURY_PDA=FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu
MAINNET_TREASURY_AUTHORITY=HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF
MAINNET_TREASURY_BUMP=255

# Or use in code
PRODUCTION_TREASURY_PDA=FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu
```

**Update DigitalOcean App Platform:**
1. Go to: Apps → Production → Settings → Environment Variables
2. Add variables (marked as non-secret since they're public keys)
3. Redeploy application to pick up new variables

### Step 7: Test Fee Collection

**Option A: Manual test swap (recommended)**

Use the `/test` page to execute a small test swap:
1. Navigate to: https://api.easyescrow.ai/test
2. Create a small NFT ↔ SOL swap
3. Execute the swap
4. Check Treasury PDA balance:
   ```bash
   solana balance FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu --url mainnet-beta
   ```
5. Verify fees were collected

**Option B: Programmatic test**

Create a test swap via API and monitor Treasury balance before/after.

---

## 🔍 Verification Checklist

After completion, verify:

- [ ] Treasury PDA exists on mainnet
- [ ] Treasury PDA owned by correct program: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- [ ] Treasury PDA size is 114 bytes
- [ ] Treasury authority is: `HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF`
- [ ] Environment variables updated
- [ ] Backend can access Treasury PDA address
- [ ] Test swap successfully collects fees

---

## 🐛 Troubleshooting

### Issue: "AccountNotFound" after initialization

**Cause:** Transaction may not be finalized yet

**Solution:**
```bash
# Wait 30 seconds, then check again
sleep 30
solana account FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu --url mainnet-beta
```

### Issue: "Treasury PDA already exists"

**Cause:** Trying to initialize twice

**Solution:** This is expected if already initialized. Skip initialization and proceed to verification.

### Issue: "Insufficient funds" during initialization

**Cause:** Treasury authority has less than 0.002 SOL

**Solution:**
```bash
# Fund authority with more SOL
solana transfer HMtLHzJZ5AUUaKjYBGZpB4RbjN4gYvcd69esNwtaUBFF 0.01 \
  --from wallets/production/mainnet-deployer.json \
  --url mainnet-beta
```

### Issue: "Program error" during initialization

**Possible causes:**
1. Program not deployed: Verify program exists
   ```bash
   solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta
   ```

2. IDL mismatch: Ensure IDL matches deployed program
   ```bash
   ls -lh src/generated/anchor/escrow-idl-production.json
   ```

3. Wrong authority: Verify you're using correct keypair

### Issue: Fees not being collected

**Debugging steps:**
1. Verify Treasury PDA address in backend configuration
2. Check swap transaction logs for fee transfer
3. Verify program is using correct Treasury PDA in atomic_swap instruction
4. Check if platform fee is non-zero in swap

---

## 📊 Treasury PDA Monitoring

### Check Current Balance
```bash
solana balance FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu --url mainnet-beta
```

### View Transaction History
https://solscan.io/account/FPC3dgGpTNxHVRxV9sJKqz1hPWGf59Fn99bNSmwH1iVu#txs

### Query Treasury Data (via Anchor)
```typescript
import { Program } from '@coral-xyz/anchor';

const treasuryData = await program.account.treasury.fetch(treasuryPDA);
console.log('Total Fees Collected:', treasuryData.totalFeesCollected.toString());
console.log('Total Swaps:', treasuryData.totalSwapsExecuted.toString());
console.log('Is Paused:', treasuryData.isPaused);
```

---

## 🔒 Security Notes

### Authority Keypair Security
- **Never commit** `production-treasury.json` to version control
- Store keypair in secure location (hardware wallet recommended)
- Use `chmod 600` on keypair file (Unix) or restrict permissions (Windows)
- Backup keypair securely (encrypted, offline)

### Withdrawal Authorization
- Only `authorized_withdrawal_wallet` can withdraw from Treasury
- Default: Same as treasury authority
- Can be changed via separate instruction (requires authority signature)

### Monitoring
- Set up alerts for:
  - Large withdrawals from Treasury
  - Unauthorized transaction attempts
  - Treasury balance drops unexpectedly
  - Pause/unpause events

---

## 📝 Treasury Operations (Post-Setup)

### Withdraw Fees
```typescript
// Use withdraw instruction (requires treasury authority signature)
await program.methods
  .withdrawTreasury(amount)
  .accounts({
    authority: authority.publicKey,
    treasury: treasuryPDA,
    recipient: recipientPublicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

**Constraints:**
- Must wait 7 days between withdrawals (configurable in program)
- Only authorized withdrawal wallet can withdraw
- Treasury must not be paused

### Pause Treasury
```typescript
// Pauses fee collection (emergency use)
await program.methods
  .pauseTreasury()
  .accounts({
    authority: authority.publicKey,
    treasury: treasuryPDA,
  })
  .rpc();
```

### Unpause Treasury
```typescript
// Resumes fee collection
await program.methods
  .unpauseTreasury()
  .accounts({
    authority: authority.publicKey,
    treasury: treasuryPDA,
  })
  .rpc();
```

---

## ✅ Success Criteria

Treasury PDA setup is considered successful when:

- ✅ Treasury PDA exists on mainnet
- ✅ Treasury PDA is owned by program
- ✅ Treasury authority can sign transactions
- ✅ Environment variables are configured
- ✅ Backend can access Treasury PDA
- ✅ Test swap successfully collects fees to Treasury
- ✅ Treasury balance increases after swaps

---

## 📞 Support

If issues arise during setup:

1. **Check logs:** Review script output for errors
2. **Verify configuration:** Confirm all addresses and keys
3. **Check blockchain:** Use Solscan to inspect accounts
4. **Test in staging first:** Use devnet/staging to test process

---

**Last Updated:** December 5, 2025  
**Next Task:** Task 35-38 (E2E tests, smoke tests, deployment, validation)

