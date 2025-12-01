# Test Wallet Addresses

**IMPORTANT:** Always use these controlled wallet addresses in tests. Do NOT use random addresses from exchanges or other sources!

---

## Production/Mainnet Wallet Addresses

These addresses are controlled by keypairs in `wallets/production/`:

### Sender Wallet
```
Address: B7jiNm8TKvaoad3N36pyDeXMSVPmvHLaXZMDC7udhTfr
Keypair: wallets/production/mainnet-sender.json
Purpose: Sends NFTs in escrow agreements
```

### Receiver Wallet
```
Address: 3qYD5LwHSuxwLi2mECzoVEmH2M7aehNjodUZCdmnCwtY
Keypair: wallets/production/mainnet-receiver.json
Purpose: Receives NFTs, sends USDC in escrow agreements
```

### Admin Wallet
```
Address: HGrfPKZuKR8BSYYJfZRFfdF1y2ApU9LSf6USQ6tpSDj2
Keypair: wallets/production/mainnet-admin.json
Purpose: Initializes escrows, collects fees
```

---

## Usage in Tests

### ✅ CORRECT Usage

#### For E2E Tests (need keypairs):
```typescript
import { loadPRODUCTIONWallets } from './shared-test-utils';

const wallets = loadPRODUCTIONWallets();
const seller = wallets.sender.publicKey.toString();
const buyer = wallets.receiver.publicKey.toString();
```

#### For API Tests (just addresses):
```typescript
import { PRODUCTION_CONFIG } from './test-config';

const payload = {
  seller: PRODUCTION_CONFIG.testWallets.sender,
  buyer: PRODUCTION_CONFIG.testWallets.receiver,
  // ...
};
```

### ❌ INCORRECT Usage

#### Don't use random/exchange addresses:
```typescript
// ❌ BAD - This is a Binance wallet!
buyer: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'

// ❌ BAD - Random address we don't control
seller: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'
```

---

## Why This Matters

### Problems with Random Addresses:

1. **Confusing Transaction Logs**
   - Solscan labels exchange addresses (e.g., "Binance 3")
   - Makes it look like exchanges are involved
   - Confuses people reviewing transactions

2. **Can't Verify Results**
   - We don't control the keypair
   - Can't check balances or deposits
   - Can't complete full E2E flows

3. **Unpredictable Behavior**
   - Address might not exist
   - Might have existing token accounts
   - Unknown history/state

### Benefits of Controlled Addresses:

1. **Full Control**
   - We have the keypairs
   - Can sign transactions
   - Can verify balances

2. **Clean Transaction Logs**
   - No confusing labels
   - Clear test provenance
   - Easy to identify test vs production

3. **Repeatable Tests**
   - Known initial state
   - Predictable behavior
   - Can reset if needed

---

## Staging/Devnet Wallets

For staging tests, use addresses from `wallets/staging/`:

```
Sender:  [Load from staging-sender.json]
Receiver: [Load from staging-receiver.json]
Admin: 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
```

---

## Local/Development Wallets

For local tests, use addresses from `wallets/localnet/`:

```
Sender:  [Generated per test run]
Receiver: [Generated per test run]
Admin: 498GViCLvzbGnRoByJCAj7skXkAe3NBpCY2Wghcd2e4R
```

---

## Reference

### Configuration Files
- Production: `tests/production/e2e/test-config.ts`
- Staging: `tests/development/e2e/devnet-config.json`
- Shared Utils: `tests/production/e2e/shared-test-utils.ts`

### Wallet Directories
- Production: `wallets/production/`
- Staging: `wallets/staging/`
- Localnet: `wallets/localnet/`

---

## Incident Reference

**Date:** November 3, 2025  
**Issue:** Error 3007 test used Binance wallet address

**Transaction:** [R7NZEeii9WjDYHy8cy3Mhhu6UuwJWdpeTQe2faTf8z6k...](https://solscan.io/tx/R7NZEeii9WjDYHy8cy3Mhhu6UuwJWdpeTQe2faTf8z6kJvaUEEGiUgbRAxo7prXuzEo1huxcHdsmaR4oLKfEHiG)

**Problem:**
- Quick validation test used hardcoded buyer address
- Address happened to be Binance exchange wallet
- Solscan labeled it "Binance 3"
- Caused confusion in transaction logs

**Solution:**
- Added `testWallets` to PRODUCTION_CONFIG
- Documented proper wallet usage
- This file created as reference

**Prevention:**
- Always use PRODUCTION_CONFIG.testWallets
- Never hardcode random addresses
- Load wallets via loadPRODUCTIONWallets() when possible

---

**Last Updated:** November 3, 2025  
**Maintainer:** Development Team

