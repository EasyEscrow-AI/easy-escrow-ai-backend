# Devnet E2E Testing - Manual Funding Guide

**Status**: ✅ Tests fixed and ready to run  
**Issue**: Devnet airdrop rate limits require manual wallet funding  
**Last Updated**: October 14, 2025

## Quick Start

### 1. Check Your Wallet Balance

```bash
solana balance --url devnet
```

If you have less than 5 SOL, request an airdrop:

```bash
solana airdrop 2 --url devnet
```

### 2. Run the Simple E2E Test (Recommended First)

```bash
# This will show you which wallets need funding
npx mocha --require ts-node/register 'tests/e2e/simple-devnet.test.ts' --timeout 180000
```

### 3. Fund Test Wallets

The test output will show wallet addresses that need funding. Example output:

```
💼 Test Wallets:
   Buyer: BkEFEFPijMaY96dYtTGeMF7xxTDGE63WxXGj4PULNa8K
   Seller: Q2rU9GfWDTU61hZUx2Q6oBbKAjRNMKFNpxBNRzNsF2p
   Admin: GoQD1wGBurBqAxgmLPZCNBfjq9w47UAgEf8SepJMhUPb
```

**Fund each wallet:**

```bash
# Fund buyer (needs 2 SOL for gas + token operations)
solana transfer BkEFEFPijMaY96dYtTGeMF7xxTDGE63WxXGj4PULNa8K 2 --url devnet

# Fund seller (needs 2 SOL for gas + token operations)
solana transfer Q2rU9GfWDTU61hZUx2Q6oBbKAjRNMKFNpxBNRzNsF2p 2 --url devnet

# Fund admin (needs 1 SOL for gas)
solana transfer GoQD1wGBurBqAxgmLPZCNBfjq9w47UAgEf8SepJMhUPb 1 --url devnet
```

### 4. Re-run the Test

```bash
npx mocha --require ts-node/register 'tests/e2e/simple-devnet.test.ts' --timeout 180000
```

## Available E2E Tests

### Simple Validation Test (Start Here)
Tests basic program interface with 3 simple scenarios:

```bash
npx mocha --require ts-node/register 'tests/e2e/simple-devnet.test.ts' --timeout 180000
```

**Tests:**
- ✅ Initialize escrow agreement
- ✅ Deposit USDC
- ✅ Deposit NFT

**Cost:** ~0.05 SOL per test run  
**Duration:** ~30-60 seconds

### Comprehensive E2E Test Suite
Full end-to-end test with complete escrow flow:

```bash
npx mocha --require ts-node/register 'tests/e2e/devnet-e2e-corrected.test.ts' --timeout 180000
```

**Tests:**
- ✅ Complete happy path (create → deposit → settle → receipt)
- ✅ Environment validation
- ✅ All state transitions

**Cost:** ~0.1 SOL per test run  
**Duration:** ~2-3 minutes

## Why Manual Funding is Needed

### Devnet Airdrop Rate Limits

Solana devnet has rate limits to prevent abuse:
- **Per IP**: ~5 airdrops per hour
- **Per wallet**: ~2 SOL maximum per airdrop
- **Retry delay**: 1-2 minutes between failed attempts

When running E2E tests, we create **3-6 new wallets** per test run, which quickly hits the rate limit.

### Alternative: Use a Funded Wallet

Instead of requesting airdrops, transfer from your existing devnet wallet.

## Step-by-Step Guide

### Method 1: Run Tests First, Fund Later (Recommended)

**Step 1**: Run the test to generate wallets
```bash
npx mocha --require ts-node/register 'tests/e2e/simple-devnet.test.ts' --timeout 180000
```

**Step 2**: Copy wallet addresses from output
```
Look for:
💼 Test Wallets:
   Buyer: <ADDRESS>
   Seller: <ADDRESS>
   Admin: <ADDRESS>
```

**Step 3**: Fund each wallet
```bash
solana transfer <BUYER_ADDRESS> 2 --url devnet
solana transfer <SELLER_ADDRESS> 2 --url devnet
solana transfer <ADMIN_ADDRESS> 1 --url devnet
```

**Step 4**: Wait for confirmations (~5-10 seconds)
```bash
# Verify funding
solana balance <BUYER_ADDRESS> --url devnet
```

**Step 5**: Re-run the test
```bash
# Same command as Step 1
npx mocha --require ts-node/register 'tests/e2e/simple-devnet.test.ts' --timeout 180000
```

### Method 2: Pre-fund Wallets (Advanced)

**Step 1**: Generate and save keypairs
```bash
# Create buyer keypair
solana-keygen new -o test-buyer.json --no-bip39-passphrase

# Create seller keypair
solana-keygen new -o test-seller.json --no-bip39-passphrase

# Create admin keypair
solana-keygen new -o test-admin.json --no-bip39-passphrase
```

**Step 2**: Get wallet addresses
```bash
solana-keygen pubkey test-buyer.json
solana-keygen pubkey test-seller.json
solana-keygen pubkey test-admin.json
```

**Step 3**: Fund wallets
```bash
solana transfer $(solana-keygen pubkey test-buyer.json) 2 --url devnet
solana transfer $(solana-keygen pubkey test-seller.json) 2 --url devnet
solana transfer $(solana-keygen pubkey test-admin.json) 1 --url devnet
```

**Step 4**: Modify test to load keypairs
```typescript
// In test file, replace:
// buyer = Keypair.generate();

// With:
import * as fs from 'fs';
const buyerKeypair = JSON.parse(fs.readFileSync('test-buyer.json', 'utf8'));
buyer = Keypair.fromSecretKey(new Uint8Array(buyerKeypair));
```

## Funding Requirements

### Per Test Run

| Wallet | SOL Needed | Purpose |
|--------|------------|---------|
| Buyer  | 2.0 SOL    | Gas fees + token account creation + minting |
| Seller | 2.0 SOL    | Gas fees + token account creation + minting |
| Admin  | 1.0 SOL    | Gas fees |
| **Total** | **5.0 SOL** | **Per complete test run** |

### Actual Usage

Most SOL is **not consumed** - it's just for rent and gas:
- Token account rent: ~0.002 SOL (refundable)
- Transaction fees: ~0.00001 SOL per tx
- Typical consumption: **~0.05-0.1 SOL per run**

The rest remains in the wallets and can be recovered.

## Getting More Devnet SOL

### Option 1: Wait and Retry Airdrops
```bash
# Wait 1-2 hours, then:
solana airdrop 2 --url devnet
```

### Option 2: Use Alternative RPC Endpoints

Some RPC providers have separate rate limits:

```bash
# GenesysGo
solana airdrop 2 --url https://devnet.genesysgo.net

# Ankr
solana airdrop 2 --url https://rpc.ankr.com/solana_devnet
```

### Option 3: Devnet SOL Faucets

- **Official Faucet**: https://faucet.solana.com/
- **QuickNode Faucet**: https://faucet.quicknode.com/solana/devnet
- **Solana Discord**: Request from community (rare)

### Option 4: Reclaim from Previous Tests

If you've run tests before, check old wallet balances:

```bash
# List recent transactions to find old wallets
solana transaction-history --url devnet

# Check balance of old wallet
solana balance <OLD_WALLET_ADDRESS> --url devnet

# Transfer to new wallet
solana transfer <NEW_WALLET_ADDRESS> 2 \
  --from <OLD_WALLET_KEYPAIR>.json \
  --url devnet
```

## Troubleshooting

### Issue: "Attempt to debit an account but found no record of a prior credit"

**Cause**: Wallet has 0 SOL  
**Solution**: Fund the wallet as shown above

### Issue: "429 Too Many Requests" during airdrop

**Cause**: Rate limit hit  
**Solution**: 
1. Wait 1-2 hours
2. Use alternative RPC
3. Manual transfer from your wallet

### Issue: "Transaction simulation failed"

**Cause**: Insufficient SOL for transaction  
**Solution**: Ensure wallet has at least 2 SOL

### Issue: Test wallets change each run

**Cause**: Tests generate new random wallets  
**Solution**: Use Method 2 (Pre-fund Wallets) to reuse same wallets

### Issue: "Invalid signature"

**Cause**: Wrong keypair or corrupted transaction  
**Solution**: 
1. Verify wallet addresses match
2. Regenerate wallets
3. Check Solana CLI version

## Best Practices

### 1. Fund Generously

```bash
# Instead of exactly 2 SOL, send 3 SOL
# This covers edge cases and multiple test runs
solana transfer <ADDRESS> 3 --url devnet
```

### 2. Verify Before Running

```bash
# Check all wallet balances before test
solana balance <BUYER> --url devnet
solana balance <SELLER> --url devnet
solana balance <ADMIN> --url devnet
```

### 3. Save Wallet Addresses

```bash
# Create a file to track test wallets
echo "Buyer: BkEFEFPijMaY96dYtTGeMF7xxTDGE63WxXGj4PULNa8K" > test-wallets.txt
echo "Seller: Q2rU9GfWDTU61hZUx2Q6oBbKAjRNMKFNpxBNRzNsF2p" >> test-wallets.txt
echo "Admin: GoQD1wGBurBqAxgmLPZCNBfjq9w47UAgEf8SepJMhUPb" >> test-wallets.txt
```

### 4. Batch Funding

```bash
# Fund all wallets in one script
#!/bin/bash
BUYER="BkEFEFPijMaY96dYtTGeMF7xxTDGE63WxXGj4PULNa8K"
SELLER="Q2rU9GfWDTU61hZUx2Q6oBbKAjRNMKFNpxBNRzNsF2p"
ADMIN="GoQD1wGBurBqAxgmLPZCNBfjq9w47UAgEf8SepJMhUPb"

echo "Funding test wallets..."
solana transfer $BUYER 2 --url devnet
solana transfer $SELLER 2 --url devnet
solana transfer $ADMIN 1 --url devnet
echo "Done!"
```

### 5. Clean Up After Testing

```bash
# Recover SOL from test wallets
solana transfer <YOUR_MAIN_WALLET> ALL \
  --from test-buyer.json \
  --url devnet
```

## CI/CD Considerations

### GitHub Actions

For automated E2E testing in CI:

```yaml
- name: Fund Test Wallets
  env:
    FUNDING_WALLET_KEY: ${{ secrets.DEVNET_FUNDING_WALLET }}
  run: |
    # Use a dedicated funding wallet
    echo "$FUNDING_WALLET_KEY" > funding-wallet.json
    
    # Run test once to get addresses
    npm run test:e2e:devnet || true
    
    # Parse addresses from output
    # Fund wallets
    # Re-run test
```

### Alternative: Use Testnet or Localnet

For CI/CD, consider:
- **Localnet**: No funding needed, instant tests
- **Private testnet**: Controlled environment
- **Devnet scheduled runs**: Off-peak hours only

## Complete Example Workflow

### First Time Setup

```bash
# 1. Ensure you have SOL
solana balance --url devnet

# If not, request airdrop
solana airdrop 2 --url devnet

# 2. Run test to generate wallets
npx mocha --require ts-node/register \
  'tests/e2e/simple-devnet.test.ts' \
  --timeout 180000 \
  2>&1 | tee test-output.txt

# 3. Extract wallet addresses
grep "Buyer:" test-output.txt
grep "Seller:" test-output.txt
grep "Admin:" test-output.txt

# 4. Fund wallets (replace addresses)
solana transfer <BUYER_ADDRESS> 2 --url devnet
solana transfer <SELLER_ADDRESS> 2 --url devnet
solana transfer <ADMIN_ADDRESS> 1 --url devnet

# 5. Wait for confirmation
sleep 10

# 6. Re-run test
npx mocha --require ts-node/register \
  'tests/e2e/simple-devnet.test.ts' \
  --timeout 180000
```

### Success Output

When funded correctly, you'll see:

```
🔬 Simple Devnet Test - Validating Program Interface
============================================================
✅ Connected to: https://api.devnet.solana.com
✅ Program loaded: 7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV

💼 Test Wallets:
   Buyer: BkE...
   Seller: Q2r...
   Admin: GoQ...

💰 Requesting airdrops...
   ✅ Buyer funded
   ✅ Seller funded
   ✅ Admin funded

🪙 Test USDC Mint: 8mK...
   ✅ Buyer USDC: 1000.00
   ✅ Seller USDC account created

🎨 Test NFT Mint: 7dV...
   ✅ Seller has NFT

✅ Setup Complete!
============================================================

  Simple Devnet E2E Test - Interface Validation
    ✓ Should initialize escrow agreement with correct interface (5234ms)
    ✓ Should deposit USDC with correct interface (3421ms)
    ✓ Should deposit NFT with correct interface (3876ms)

============================================================
🎉 SIMPLE DEVNET TEST COMPLETE!
✅ Program interface validated successfully
✅ Ready to expand to full E2E tests
============================================================

  3 passing (45s)
```

## Next Steps After Successful Testing

1. ✅ Validate all transactions on Solana Explorer
2. ✅ Review test receipts and outputs
3. ✅ Run comprehensive E2E suite
4. ✅ Document any issues found
5. ⏳ Prepare for mainnet deployment

## Support

### Common Questions

**Q: Do I need to fund wallets every test run?**  
A: No, if you reuse keypairs, the SOL remains between runs.

**Q: Can I use the same wallet for multiple tests?**  
A: Yes, but test isolation is better with fresh wallets.

**Q: How do I recover SOL from test wallets?**  
A: Use `solana transfer <YOUR_WALLET> ALL --from test-wallet.json`

**Q: What if I don't have 5 SOL?**  
A: Start with simple test (needs ~3 SOL), or fund gradually

### Getting Help

1. Check test output logs
2. Verify wallet balances
3. Check Solana Explorer for transactions
4. Review this guide's troubleshooting section
5. Contact development team

---

**Last Updated**: October 14, 2025  
**Status**: ✅ Tests working, manual funding required  
**Estimated Time**: 5-10 minutes for complete setup

