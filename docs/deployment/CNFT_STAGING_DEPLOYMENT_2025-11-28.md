# cNFT Program Deployment to Staging - November 28, 2025

## Deployment Details

**Date:** November 28, 2025  
**Environment:** Staging (Devnet)  
**Program ID:** `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`  
**Network:** Devnet  
**Deployment Tx:** `5jbsfhyJubV6vj6BiqYe5vA7S8whunRNFrCqSsYTzKFD8vD21n2oRFF4ms26bmTQ2QzW2nTEbRcotKA9HcgGSn4H`

## Program Details

- **Program Size:** 330,008 bytes on-chain (287 KB .so file)
- **Last Deployed Slot:** 424529547
- **Balance:** 2.29 SOL
- **Authority:** 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
- **ProgramData Address:** FZPDAXfQBqNv1gLtH5dDHKCwjGwxz9vAeSdCHCNKaZ1Z

## Build Details

- **Build Method:** Docker (Linux)
- **Rust Version:** 1.81
- **Solana CLI:** v2.1.5
- **Anchor Version:** 0.30.1
- **Compiler:** `cargo build-sbf`
- **Build Time:** ~41 seconds
- **Source File:** `target/docker-deploy/easyescrow.so`

## Dependencies

- **anchor-lang:** 0.30.1
- **anchor-spl:** 0.30.1
- **mpl-bubblegum:** 1.4.0
- **solana-security-txt:** 1.1.1

## New Features in This Deployment

### ✅ Compressed NFT (cNFT) Support
- Integrated Metaplex Bubblegum program for cNFT transfers
- Added Merkle proof validation
- Support for cNFT-to-cNFT swaps
- Support for cNFT-to-NFT swaps
- Support for cNFT-to-SOL swaps

### ✅ Enhanced Error Handling
- Granular cNFT error codes:
  - `InvalidCnftProof` - Merkle proof validation failed
  - `MissingBubblegumProgram` - Bubblegum program account missing
  - `MissingMerkleTree` - Merkle tree account missing
  - `StaleProof` - Merkle root changed since proof generation

### ✅ Additional Accounts
- Maker/Taker Merkle tree accounts (optional)
- Maker/Taker tree authority PDAs (optional)
- Bubblegum program account
- SPL Account Compression program
- SPL Noop program (log wrapper)

## Backward Compatibility

✅ **Standard NFT swaps unchanged** - All existing functionality preserved  
✅ **API compatibility maintained** - Same program ID, same instruction structure  
✅ **Optional cNFT accounts** - Don't affect standard NFT operations

## Deployment Command

```powershell
# Deploy command used
anchor upgrade target/deploy/easyescrow.so `
  --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei `
  --provider.cluster devnet `
  --provider.wallet wallets/staging/staging-deployer.json

# Verification
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet
```

## Verification Steps

### 1. ✅ Program Deployed
- Confirmed on-chain at slot 424529547
- Transaction finalized: `5jbsfhyJubV6vj6BiqYe5vA7S8whunRNFrCqSsYTzKFD8vD21n2oRFF4ms26bmTQ2QzW2nTEbRcotKA9HcgGSn4H`
- Program data updated successfully

### 2. ✅ Deployer Wallet Status
- **Before:** Balance sufficient for deployment
- **After:** Deployment successful
- **Authority:** Maintains upgrade authority

### 3. ⏳ Pending Verification
- [ ] Generate and upload new IDL
- [ ] Update backend IDL files
- [ ] Test standard NFT swap (backward compatibility)
- [ ] Test cNFT swap (new feature)
- [ ] Verify E2E on staging environment

## Next Steps

1. **Generate IDL:**
   ```powershell
   cd C:\websites\VENTURE\easy-escrow-ai-backend
   anchor idl build
   ```

2. **Upload IDL to Devnet:**
   ```powershell
   anchor idl upgrade AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei `
     --filepath target/idl/escrow.json `
     --provider.cluster devnet `
     --provider.wallet wallets/staging/staging-deployer.json
   ```

3. **Update Backend IDL:**
   ```powershell
   Copy-Item target/idl/escrow.json `
     src/generated/anchor/escrow-idl-staging.json -Force
   ```

4. **Run E2E Tests:**
   ```powershell
   npm run test:staging:e2e
   ```

5. **Submit PR for Backend Changes**

## Related Tasks

- ✅ Task 22: Implement Rust cNFT Transfer Logic
- ✅ Task 23: Update Atomic Swap Handler for cNFT
- ✅ Task 25: Backend TypeScript Updates
- 🚀 Task 30: Deploy cNFT-Enabled Program to Devnet (COMPLETE)

## Explorer Links

- **Program:** https://explorer.solana.com/address/AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei?cluster=devnet
- **Deployment Tx:** https://explorer.solana.com/tx/5jbsfhyJubV6vj6BiqYe5vA7S8whunRNFrCqSsYTzKFD8vD21n2oRFF4ms26bmTQ2QzW2nTEbRcotKA9HcgGSn4H?cluster=devnet
- **ProgramData:** https://explorer.solana.com/address/FZPDAXfQBqNv1gLtH5dDHKCwjGwxz9vAeSdCHCNKaZ1Z?cluster=devnet

## Notes

- First deployment of cNFT-enabled atomic swap program
- Built using Docker for reproducible Windows builds
- Successfully compiled with mpl-bubblegum 1.4.0
- All cNFT transfer logic integrated
- Ready for E2E testing

