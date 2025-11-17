# Production Program Clarification

**Date**: November 17, 2025  
**Status**: ✅ Clarified

---

## Summary

The production Solana program is **already deployed** to mainnet-beta. The atomic swap implementation is a **program upgrade**, not a fresh deployment.

---

## Production Program Details

### Program ID
```
2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx
```

### Status
- ✅ **Already deployed to mainnet-beta**
- ✅ **Successfully operational**
- ⏳ **Needs upgrade with atomic swap instructions**

### Location
- Keypair: `wallets/production/escrow-program-keypair.json`
- Network: `mainnet-beta`
- Declared in: `programs/escrow/src/lib.rs` (feature flag `mainnet`)

---

## Configuration Updates

### 1. Hardcoded in `src/config/constants.ts`

```typescript
export const KNOWN_PROGRAM_IDS = {
  staging: 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei',
  production: '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx', // Already deployed
  local: 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS',
} as const;
```

### 2. Auto-Detected in `getProgramId()`

```typescript
case 'production':
  return (
    process.env.PRODUCTION_PROGRAM_ID ||
    loadProgramIdFromKeypair('production') ||
    '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx' // Known production ID
  );
```

### 3. No Longer Requires Explicit Environment Variable

**Before**:
- ❌ Required `PRODUCTION_PROGRAM_ID` in environment variables
- ❌ Would throw error if not explicitly set
- ❌ Prevented production usage without explicit config

**After**:
- ✅ Program ID hardcoded as known constant
- ✅ Can still override via `PRODUCTION_PROGRAM_ID` env var
- ✅ Still requires `MAINNET_PROD_FEE_COLLECTOR_ADDRESS` for safety

---

## Deployment Strategy

### Current Production Program
The existing program at `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` currently handles the **old escrow agreement model**.

### Atomic Swap Upgrade Path

1. **Build with Production Feature Flag**
   ```bash
   anchor build --features mainnet
   ```

2. **Program Upgrade (Not Fresh Deploy)**
   ```bash
   solana program upgrade \
     target/deploy/easyescrow.so \
     2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
     --upgrade-authority wallets/production/production-admin.json
   ```

3. **Backend Deployment**
   - ✅ Configuration already points to production program ID
   - ✅ Backend services will use existing program
   - ✅ New atomic swap endpoints will work with upgraded program

### What Changes
- ❌ **NOT changing**: Program address (stays the same)
- ✅ **Changing**: Program instructions (adding atomic swap)
- ✅ **Changing**: Backend configuration (atomic swap services)
- ✅ **Changing**: API endpoints (new `/api/offers` routes)

### What Stays the Same
- ✅ Program ID: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- ✅ Upgrade authority: `wallets/production/production-admin.json`
- ✅ Network: `mainnet-beta`
- ✅ Fee collector: `MAINNET_PROD_FEE_COLLECTOR_ADDRESS` (env var)

---

## Environment Variables

### Required for Production
```bash
NODE_ENV=production
SOLANA_NETWORK=production
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Program ID (auto-detected, but can override)
PRODUCTION_PROGRAM_ID=2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

# Fee collector (REQUIRED - no default)
MAINNET_PROD_FEE_COLLECTOR_ADDRESS=<your-mainnet-fee-collector-address>

# Platform authority
PLATFORM_AUTHORITY_KEYPAIR_PATH=./wallets/production/production-admin.json

# Database & Redis
DATABASE_URL=<production-db-url>
REDIS_URL=<production-redis-url>

# cNFT Indexer (Helius)
CNFT_INDEXER_API_URL=https://mainnet.helius-rpc.com
CNFT_INDEXER_API_KEY=<helius-mainnet-key>
```

---

## Program Upgrade Authority

### Current Authority (Deployer)
**Keypair Location**: `wallets/production/production-deployer.json`

**Purpose**: This keypair is the **upgrade authority** for the Solana program. It is used exclusively for:
- Upgrading the program with `solana program upgrade`
- Managing program upgrade authority
- **NOT** used for runtime operations

**Public Key**: `CPDz3pC5AnK7es3oEcP52HLhByPSAWG6f9QGP6j4jjEA` (from staging deployer, verify production)

### Platform Authority vs Deployer
- **Deployer (`production-deployer.json`)**: Program upgrade authority
- **Platform Authority (`production-admin.json`)**: Signs runtime transactions, manages nonce pool

### Upgrade Process
1. Build program with `mainnet` feature
2. Use `solana program upgrade` command
3. Sign with production **deployer** keypair
4. Verify upgrade on-chain

### Upgrade Commands

**Staging (Devnet):**
```bash
# 1. Build for staging
cd programs/escrow
anchor build --features staging

# 2. Verify program address matches
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# 3. Upgrade program
solana program upgrade \
  ../../target/deploy/easyescrow.so \
  AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei \
  --upgrade-authority ../../wallets/staging/staging-deployer.json \
  --url devnet \
  --commitment finalized

# 4. Verify upgrade
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet
```

**Production (Mainnet):**
```bash
# 1. Build for mainnet
cd programs/escrow
anchor build --features mainnet

# 2. Verify program address matches
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx

# 3. Upgrade program
solana program upgrade \
  ../../target/deploy/easyescrow.so \
  2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx \
  --upgrade-authority ../../wallets/production/production-deployer.json \
  --url mainnet-beta \
  --commitment finalized

# 4. Verify upgrade
solana program show 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx --url mainnet-beta
```

---

## Testing Strategy

### Pre-Production Validation
1. ✅ Test on local validator with atomic swap instructions
2. ✅ Deploy upgraded program to staging (devnet)
3. ✅ Run comprehensive E2E tests on staging
4. ✅ Verify all atomic swap flows work correctly
5. ✅ Security audit of upgraded program
6. ⏳ **Then** upgrade production program

### Production Upgrade Validation
1. Upgrade program on mainnet
2. Verify program upgraded successfully
3. Test atomic swap transaction building (dry run)
4. Monitor backend services startup
5. Execute test atomic swap (small value)
6. Verify fee collection works
7. Monitor for any errors
8. Full production launch

---

## Security Considerations

### Program Upgrade Safety
- ✅ Test extensively on staging first
- ✅ Use `--commitment finalized` for upgrade
- ✅ Verify upgrade authority before executing
- ✅ Keep backup of old program binary
- ✅ Monitor transactions immediately after upgrade

### Rollback Plan
If issues arise after production upgrade:
1. Immediately pause backend services (stop accepting new offers)
2. Assess the issue
3. If critical, deploy hotfix or rollback to previous version
4. Communicate with any active users

### Fee Collector Security
- ✅ Use hardware wallet for production fee collector
- ✅ Monitor all fee collection transactions
- ✅ Set up alerts for unusual activity
- ✅ Regular balance checks

---

## Documentation Updates

Updated files:
- ✅ `src/config/constants.ts` - Hardcoded production program ID
- ✅ `docs/ATOMIC_SWAP_ENVIRONMENT_VARIABLES.md` - Added production program ID
- ✅ `docs/tasks/TASK_11_COMPLETION.md` - Noted production deployment strategy
- ✅ This file - Comprehensive production program clarification

---

## Key Takeaways

1. **Production program is already deployed** - No fresh deployment needed
2. **Program ID is fixed** - `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
3. **Upgrade, not deploy** - Use `solana program upgrade` command
4. **Staging first** - Test upgraded program on devnet before mainnet
5. **Fee collector required** - Must set `MAINNET_PROD_FEE_COLLECTOR_ADDRESS`

---

**Next Steps:**
1. ✅ Configuration updated with production program ID
2. ⏳ Deploy to staging for testing
3. ⏳ Run comprehensive E2E tests
4. ⏳ Security audit
5. ⏳ Production program upgrade

