# E2E Test Progress Display Guide

**Date:** October 16, 2025  
**Purpose:** Show real-time progress during E2E test execution

## Enhanced Test Commands

The E2E test commands now include progress indicators and enhanced output:

### Standard Progress (Recommended)

```bash
# Simple E2E test with progress
npm run simple-e2e

# Full E2E test suite with progress
npm run test:e2e:devnet

# NFT-USDC swap test with progress
npm run test:e2e:devnet:nft-swap
```

**Features:**
- ✅ Shows each test name as it starts
- ✅ Colored output (green ✓ for pass, red ✗ for fail)
- ✅ Inline diffs for failures
- ✅ Progress indicators between tests
- ✅ All console.log statements from test code

### Verbose Progress (Extra Detail)

```bash
# Simple E2E with maximum verbosity
npm run simple-e2e:verbose

# Full E2E suite with maximum verbosity
npm run test:e2e:devnet:verbose
```

**Additional Features:**
- ✅ Full stack traces on errors
- ✅ More detailed timing information
- ✅ Complete error context

## What You'll See During Test Execution

### 1. Test Suite Header
```
🚀 Starting End-to-End Devnet Test Suite Setup
============================================================
✅ Connected to devnet RPC: https://api.devnet.solana.com
✅ Loaded program: 7dVEyFFeMzAT3oUpyvXwchGfPQDuXHdQv5tyfDBztKuV
✅ Program verified on devnet
```

### 2. Setup Progress
```
💼 Setting up test wallets...
   Buyer1: FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71
   Buyer2: Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk
   Seller: 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u
   
🪙 Creating test tokens...
   ✅ Test USDC Mint created
   ✅ Buyer USDC accounts created
```

### 3. Individual Test Progress
```
Scenario 1: Happy Path - Complete NFT-to-USDC Swap with Fee

  Step 1: Should create escrow agreement
    📍 Escrow State: 9xQeWvG8...
    📍 USDC Vault: 7yHp2kL...
    📍 NFT Vault: 3mKt8pN...
    ✅ Agreement created: 4tYx...signature...
    ✅ Escrow state verified
    ✓ Step 1: Should create escrow agreement (2.3s)

  Step 2: Should deposit USDC from buyer
    💰 USDC in vault: 100000000
    ✓ Step 2: Should deposit USDC from buyer (1.8s)

  Step 3: Should deposit NFT from seller
    🎨 NFT in vault: 1
    ✓ Step 3: Should deposit NFT from seller (2.1s)
```

### 4. Real-Time Transaction Links
```
✅ Transaction: 4tYx9kLm2pNr...
🔗 https://explorer.solana.com/tx/4tYx9kLm2pNr...?cluster=devnet
```

### 5. Final Summary
```
============================================================
📊 Test Results Summary
============================================================
✅ All tests passed (12 tests, 0 failures)
⏱️  Total time: 45.2s
💰 Total SOL used: ~0.08 SOL
```

## Progress Indicators Explained

| Symbol | Meaning |
|--------|---------|
| ✅ | Success/Completed |
| ❌ | Failed |
| 🚀 | Starting/Initializing |
| 💼 | Wallet operations |
| 🪙 | Token operations |
| 📍 | Important address/PDA |
| 💰 | Balance/Amount info |
| 🎨 | NFT operations |
| ⏰ | Timing/Expiry info |
| 🏁 | Race condition test |
| 📊 | Summary/Statistics |
| 🔗 | External link |

## Mocha Reporter Options

The enhanced commands use these Mocha flags:

- `--reporter spec` - Shows test names and progress in real-time
- `--colors` - Colored output (green for pass, red for fail)
- `--inline-diffs` - Better error diffs
- `--full-trace` - Complete stack traces (verbose mode only)

## Tips for Best Experience

### 1. Watch in Real-Time
The tests output progress as they run, so you can watch the devnet transactions happening live.

### 2. Check Solana Explorer
Each transaction includes an explorer link. You can:
- Open them in your browser
- Verify transaction success
- Inspect program logs
- Check account changes

### 3. Monitor SOL Usage
The tests show balance changes, helping you track SOL consumption:
```
💰 Buyer balance before: 2.5 SOL
💰 Buyer balance after: 2.48 SOL
💵 Cost: 0.02 SOL
```

### 4. Timing Information
Each test shows how long it takes:
```
✓ Step 1: Should create escrow agreement (2.3s)
```

This helps identify slow operations.

### 5. Interrupt Safely
You can press `Ctrl+C` to stop tests at any time. The tests are designed to be interruptible.

## Alternative Progress Styles

If you prefer different output styles, you can use alternative Mocha reporters:

### Dot Progress (Compact)
```bash
mocha --require ts-node/register tests/e2e/simple-devnet.test.ts --reporter dot
```
Shows: `.` for pass, `!` for pending, `F` for fail

### Minimal Progress
```bash
mocha --require ts-node/register tests/e2e/simple-devnet.test.ts --reporter min
```
Shows only final summary

### JSON Output (for parsing)
```bash
mocha --require ts-node/register tests/e2e/simple-devnet.test.ts --reporter json > test-results.json
```
Outputs structured JSON for CI/CD pipelines

## Customizing Output

You can add more console.log statements to the test files for extra progress info:

```typescript
it("Should do something", async function() {
  console.log(`   🔄 Starting transaction...`);
  const tx = await doSomething();
  console.log(`   ⏳ Waiting for confirmation...`);
  await confirmTransaction(tx);
  console.log(`   ✅ Transaction confirmed!`);
});
```

## Troubleshooting

### No Output Appearing?
- Ensure you're using the updated package.json scripts
- Try adding `--no-colors` if terminal doesn't support colors
- Check that stdout is not being redirected

### Too Much Output?
- Use the standard commands (not verbose)
- Redirect to a file: `npm run simple-e2e > test.log 2>&1`
- Remove some console.log statements from test files

### Want Even More Detail?
- Add `console.log` statements to your test code
- Use `--full-trace` flag
- Enable Anchor logs: `ANCHOR_LOG=true npm run simple-e2e`

## Example: Running with Maximum Visibility

```bash
# Set environment for maximum logging
$env:ANCHOR_LOG="true"

# Run verbose test
npm run simple-e2e:verbose

# This will show:
# - All test progress
# - All console logs
# - All Anchor program logs
# - Full error traces
# - Transaction signatures
# - Explorer links
```

## Performance Notes

- Progress indicators add minimal overhead (<1%)
- Console.log statements are already in the test code
- The `--full-trace` flag only affects error output
- Real bottleneck is network latency to devnet (~1-3s per transaction)

## Reference

For more Mocha reporter options:
```bash
npx mocha --reporters
```

Official Mocha docs: https://mochajs.org/#reporters

