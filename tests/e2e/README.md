# End-to-End Devnet Testing

This directory contains comprehensive end-to-end tests that run on actual Solana devnet with real transactions.

## Overview

Task 37 focuses on validating the complete EasyEscrow system on devnet before mainnet deployment. These tests perform real blockchain transactions to ensure:

1. **Happy Path** - Complete escrow flow (create → deposit → settle → receipt)
2. **Expiry Path** - Partial deposits with expiry and refunds
3. **Race Conditions** - Concurrent buyer deposits handling
4. **Fee Collection** - Platform fee validation
5. **Receipt Generation** - Transaction receipt validation

## Prerequisites

### 1. Solana CLI Installed
```bash
solana --version
```

### 2. Devnet Configuration
```bash
solana config set --url devnet
solana config get
```

### 3. Program Deployed on Devnet
The escrow program must be deployed on devnet:
- **Program ID**: `7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV`
- **Verify**: https://explorer.solana.com/address/7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV?cluster=devnet

### 4. Test Wallets with SOL
The test suite will automatically request airdrops, but may hit rate limits.

**Manual funding (if needed)**:
```bash
# Generate keypair
solana-keygen new -o test-wallet.json

# Fund wallet
solana airdrop 2 $(solana-keygen pubkey test-wallet.json) --url devnet

# Or transfer from existing wallet
solana transfer <WALLET_ADDRESS> 2 --url devnet
```

### 5. Test Tokens

**USDC (Devnet)**:
- Mint: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`
- Get from: https://spl-token-faucet.com/?token-name=USDC-Dev

**Test NFT**:
- The test suite automatically creates test NFTs
- Supply: 1 (standard NFT)
- Decimals: 0

## Running Tests

### Full E2E Test Suite
```bash
npm run test:e2e:devnet
```

### Individual Test Scenarios

**Setup Only**:
```bash
npm run test:e2e:devnet -- --grep "Setup Devnet Testing Environment"
```

**Happy Path Only**:
```bash
npm run test:e2e:devnet -- --grep "Happy Path"
```

**Expiry Path Only**:
```bash
npm run test:e2e:devnet -- --grep "Expiry Path"
```

**Race Condition Only**:
```bash
npm run test:e2e:devnet -- --grep "Race Condition"
```

**Fee Validation Only**:
```bash
npm run test:e2e:devnet -- --grep "Fee Collection"
```

## Test Configuration

### Environment Variables
```bash
# Required
SOLANA_RPC_URL=https://api.devnet.solana.com

# Optional (uses defaults if not set)
SOLANA_NETWORK=devnet
```

### RPC Endpoints

**Default**: `https://api.devnet.solana.com`

**Alternatives** (if default is rate-limited):
- `https://api.devnet.solana.com` (Solana Labs)
- `https://rpc.ankr.com/solana_devnet` (Ankr)
- `https://devnet.genesysgo.net` (GenesysGo)
- `https://psytrbhymqlkfrhudd.dev.genesysgo.net:8899` (GenesysGo Shadow)

Set in environment:
```bash
export SOLANA_RPC_URL=https://rpc.ankr.com/solana_devnet
npm run test:e2e:devnet
```

## Test Scenarios

### Scenario 1: Happy Path (37.2)

**Flow**:
1. Create escrow agreement
2. Buyer deposits USDC (100 USDC)
3. Seller deposits NFT
4. Atomic settlement executes
5. Verify:
   - Buyer receives NFT
   - Seller receives 99 USDC (after 1% fee)
   - Platform receives 1 USDC fee
   - Receipt generated

**Expected Duration**: ~30-60 seconds

### Scenario 2: Expiry Path (37.3)

**Flow**:
1. Create escrow with 30-second expiry
2. Buyer deposits USDC only
3. Wait for expiry (35 seconds)
4. Execute refund
5. Verify:
   - Buyer receives full USDC refund
   - Escrow account closed
   - No fees charged

**Expected Duration**: ~60-90 seconds

### Scenario 3: Race Condition (37.4)

**Flow**:
1. Create open offer (any buyer)
2. Two buyers attempt simultaneous USDC deposits
3. Verify:
   - Only one deposit succeeds
   - Second deposit fails gracefully
   - No double-spend
   - Correct buyer locked in

**Expected Duration**: ~30-45 seconds

### Scenario 4: Fee Validation (37.5)

**Flow**:
1. Analyze fee collection across all tests
2. Verify fee amounts match expected (1% = 100 basis points)
3. Verify receipts generated for all transactions
4. Generate comprehensive test report

**Expected Duration**: ~10-20 seconds

## Output and Receipts

### Transaction Receipts
Individual receipts saved to: `receipts/escrow-{ID}-receipt.json`

**Example Receipt**:
```json
{
  "escrowId": "1697123456789",
  "transactions": [
    {
      "signature": "5kF7...",
      "explorerUrl": "https://explorer.solana.com/tx/5kF7...?cluster=devnet"
    }
  ],
  "buyer": "9xQe...",
  "seller": "4dPr...",
  "nftMint": "7mKt...",
  "amount": "100 USDC",
  "fee": "1 USDC (1%)",
  "status": "SETTLED",
  "timestamp": "2025-10-13T..."
}
```

### Test Results
Comprehensive results saved to: `devnet-e2e-results.json`

```json
{
  "timestamp": "2025-10-13T...",
  "rpcUrl": "https://api.devnet.solana.com",
  "programId": "7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV",
  "results": [
    {
      "name": "Happy Path - Complete Escrow Flow",
      "success": true,
      "duration": 45230,
      "transactions": ["5kF7...", "8mNp..."],
      "escrowId": "1697123456789"
    }
  ]
}
```

### Test Report
Markdown report saved to: `TASK_37_E2E_REPORT.md`

Contains:
- Summary statistics
- All transaction links
- Pass/fail status
- Performance metrics
- Conclusions and next steps

## Verification

### Manual Verification on Explorer

All transactions can be verified on Solana Explorer:
```
https://explorer.solana.com/tx/{SIGNATURE}?cluster=devnet
```

### Check Account States

**Escrow State**:
```bash
solana account <ESCROW_PDA> --url devnet --output json
```

**Token Accounts**:
```bash
spl-token accounts --url devnet
```

**Account Balance**:
```bash
solana balance <PUBKEY> --url devnet
```

## Troubleshooting

### Issue: Airdrop Failed

**Symptoms**:
```
Error: airdrop request failed. This can happen when the rate limit is reached.
```

**Solutions**:
1. Wait a few minutes and retry
2. Use a different RPC endpoint
3. Manually fund wallets:
   ```bash
   solana transfer <ADDRESS> 2 --url devnet
   ```

### Issue: Insufficient SOL for Transaction

**Symptoms**:
```
Error: Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.
```

**Solutions**:
```bash
# Check balance
solana balance <PUBKEY> --url devnet

# Fund wallet
solana airdrop 2 <PUBKEY> --url devnet
```

### Issue: Program Not Found

**Symptoms**:
```
Error: Invalid program id
```

**Solutions**:
1. Verify program deployment:
   ```bash
   solana program show 7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV --url devnet
   ```

2. Redeploy if needed:
   ```bash
   anchor deploy --provider.cluster devnet
   ```

### Issue: Transaction Timeout

**Symptoms**:
```
Error: Transaction was not confirmed in 60.00 seconds
```

**Solutions**:
1. Increase timeout in test configuration
2. Check devnet status: https://status.solana.com/
3. Try alternative RPC endpoint
4. Retry the transaction

### Issue: Token Account Not Found

**Symptoms**:
```
Error: Invalid account data for instruction
```

**Solutions**:
1. Create associated token account:
   ```bash
   spl-token create-account <MINT> --url devnet
   ```

2. Verify token accounts exist:
   ```bash
   spl-token accounts --url devnet
   ```

### Issue: USDC Not Available

**Solutions**:
1. Get devnet USDC from faucet:
   - https://spl-token-faucet.com/?token-name=USDC-Dev
   
2. Or use test mint with mint authority in tests

### Issue: RPC Rate Limiting

**Symptoms**:
```
Error: 429 Too Many Requests
```

**Solutions**:
1. Use alternative RPC endpoint
2. Add delays between requests
3. Use dedicated RPC provider (Alchemy, QuickNode, etc.)

## Performance Expectations

### Typical Execution Times

- **Setup**: 20-40 seconds
- **Happy Path**: 30-60 seconds
- **Expiry Path**: 60-90 seconds (includes 35s wait)
- **Race Condition**: 30-45 seconds
- **Fee Validation**: 10-20 seconds
- **Total Suite**: 3-5 minutes

### Network Latency

Devnet response times can vary:
- **Best case**: 400-800ms per transaction
- **Typical**: 1-3 seconds per transaction
- **Congested**: 5-10 seconds per transaction

## Best Practices

### 1. Run During Off-Peak Hours
Devnet can be congested during US business hours. Consider running tests:
- Early morning (before 9 AM UTC)
- Late evening (after 9 PM UTC)
- Weekends

### 2. Monitor Devnet Status
Check Solana status before running tests:
- https://status.solana.com/

### 3. Use Dedicated RPC
For production testing, use a dedicated RPC provider:
- Alchemy
- QuickNode
- GenesysGo Shadow

### 4. Save Test Wallets
Save generated keypairs for debugging:
```typescript
fs.writeFileSync('test-wallets.json', JSON.stringify(testWallets));
```

### 5. Clean Up Test Data
After testing, close test accounts to reclaim rent:
```bash
spl-token close <TOKEN_ACCOUNT> --url devnet
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Devnet Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Run daily at 2 AM UTC
  workflow_dispatch:      # Manual trigger

jobs:
  e2e-devnet:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Solana
        run: |
          sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
          echo "$HOME/.local/share/solana/install/active_release/bin" >> $GITHUB_PATH
      
      - name: Install Dependencies
        run: npm ci
      
      - name: Run E2E Tests
        env:
          SOLANA_RPC_URL: ${{ secrets.SOLANA_RPC_URL }}
        run: npm run test:e2e:devnet
      
      - name: Upload Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-results
          path: |
            devnet-e2e-results.json
            TASK_37_E2E_REPORT.md
            receipts/
```

## Next Steps After Testing

1. ✅ Review all test results
2. ✅ Verify all transactions on explorer
3. ✅ Validate fee calculations
4. ✅ Review receipts
5. ✅ Document any issues found
6. ⏳ Prepare mainnet deployment checklist
7. ⏳ Conduct security audit
8. ⏳ Deploy to mainnet

## Resources

- [Solana Devnet Explorer](https://explorer.solana.com/?cluster=devnet)
- [Solana Status](https://status.solana.com/)
- [SPL Token Faucet](https://spl-token-faucet.com/)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)

## Support

For issues or questions:
1. Check this README
2. Review test output and logs
3. Check Solana Explorer for transaction details
4. Consult team documentation
5. Contact development team

---

**Task**: 37 - End-to-End Devnet Testing  
**Status**: COMPLETED ✅  
**Last Updated**: October 13, 2025

