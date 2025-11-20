# Atomic Swap E2E Test Implementation Plan

## Summary

Implementing complete E2E tests for atomic swaps by integrating real API calls, transaction signing, and verification logic.

## Current Status

- ✅ API endpoints exist on `staging` branch
- ✅ Test structure exists on `master` branch
- ✅ API client helper created (`tests/helpers/atomic-swap-api-client.ts`)
- 🚧 Test files need API integration

## API Endpoints Available

1. `POST /api/offers` - Create swap offer (returns serialized transaction)
2. `GET /api/offers` - List offers
3. `GET /api/offers/:id` - Get specific offer
4. `POST /api/offers/:id/accept` - Accept offer (returns transaction)
5. `POST /api/offers/:id/cancel` - Cancel offer
6. `POST /api/offers/:id/confirm` - Confirm on-chain execution

## Implementation Plan

### Test Flow for Each Scenario

```typescript
// 1. Setup (before hook)
- Initialize API client with staging URL + API key
- Create test NFTs
- Fund test wallets

// 2. Test Execution (it block)
- Get balances BEFORE swap
- Call API to create offer (returns serialized TX)
- Sign transaction with maker wallet
- Send transaction to network
- Wait for confirmation
- Call API to accept offer (if direct swap)
- Sign and send accept transaction
- Confirm execution via API
- Get balances AFTER swap
- Verify balance changes
- Verify asset ownership transfers
- Verify nonce consumption

// 3. Assertions
- Maker received SOL (minus fees)
- Taker paid SOL + fee
- Platform received fee
- NFT ownership transferred
- Nonce account advanced
```

### Test Files to Update

1. **tests/staging/e2e/01-atomic-nft-for-sol-happy-path.test.ts**
   - Scenario 1: 1% percentage fee ✅ (implement first)
   - Scenario 2: Fixed 0.01 SOL fee
   - Scenario 3: Zero fee (platform pays)
   - Scenario 4: Nonce validation
   - Scenario 5: Balance edge cases

2. **tests/staging/e2e/02-atomic-cnft-for-sol-happy-path.test.ts**
   - Similar scenarios for cNFTs
   - Add Merkle proof validation
   - QuickNode DAS API integration

3. **tests/staging/e2e/03-atomic-nft-for-nft-happy-path.test.ts**
   - Pure NFT swaps
   - Hybrid NFT + SOL swaps

4. **tests/staging/e2e/04-atomic-nft-for-cnft-happy-path.test.ts**
   - NFT ↔ cNFT swaps
   - Merkle proof handling

## Environment Variables Required

```bash
# Staging API
STAGING_API_URL=https://easyescrow-backend-staging.ondigitalocean.app
ATOMIC_SWAP_API_KEY=<your-api-key>

# Staging RPC
STAGING_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=<key>

# Staging program
STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

# Admin keypair (for signing)
STAGING_ADMIN_PRIVATE_KEY_PATH=./wallets/staging/staging-deployer.json
```

## Helper Functions Needed

### 1. Balance Verification
```typescript
async function verifyBalanceChange(
  publicKey: PublicKey,
  expectedChange: number, // positive or negative lamports
  tolerance: number = 10000 // 0.00001 SOL tolerance for fees
): Promise<void>
```

### 2. NFT Ownership Verification
```typescript
async function verifyNFTOwner(
  connection: Connection,
  mint: PublicKey,
  expectedOwner: PublicKey
): Promise<void>
```

### 3. Nonce Account Verification
```typescript
async function verifyNonceAdvanced(
  connection: Connection,
  nonceAccount: PublicKey,
  previousNonce: string
): Promise<void>
```

## Implementation Order

### Phase 1: Core Infrastructure (Current)
- ✅ Create API client helper
- ✅ Add imports to test files
- 🚧 Initialize API client in before() hooks

### Phase 2: First Complete Test (Next)
- Implement Scenario 1 in `01-atomic-nft-for-sol-happy-path.test.ts`
- Full flow: create → sign → send → verify
- Validate all assertions work

### Phase 3: Remaining Scenarios
- Copy pattern from Scenario 1 to other scenarios
- Adjust fee calculations per scenario
- Add scenario-specific validations

### Phase 4: Other Test Files
- Replicate pattern for cNFT tests
- Add Merkle proof validations
- Implement QuickNode integrations

### Phase 5: Testing & Refinement
- Run all tests on staging
- Fix any failures
- Add retry logic where needed
- Handle network timeouts gracefully

## Expected Test Output

```
🚀 Atomic Swap E2E: NFT for SOL - Happy Path (Staging)
  
  ✓ Setup: Initialize services and create test NFTs (30s)
  
  Scenario 1: Standard 1% Percentage Fee
    ✓ should successfully swap NFT for SOL with 1% platform fee (45s)
      📋 TEST: NFT for SOL with 1% Fee
      ═══════════════════════════════════════════════════════════
      📦 Swap Details:
        Maker offers: NFT (5YgvJ...)
        Taker offers: 0.5 SOL
        Platform fee: 0.005 SOL (1%)
      
      💰 Balances Before:
        Maker:    1.2500 SOL
        Taker:    2.0000 SOL
        Treasury: 0.0000 SOL
      
      📝 Creating offer...
      ✅ Offer created: offer_abc123
      
      🔏 Signing and sending maker transaction...
      ✅ Transaction sent: 2X7fY...
      ✅ Transaction confirmed
      
      🤝 Accepting offer...
      ✅ Offer accepted
      
      🔏 Signing and sending taker transaction...
      ✅ Transaction sent: 3Y8gZ...
      ✅ Transaction confirmed
      
      ✅ Confirming on-chain execution...
      ✅ Swap confirmed
      
      💰 Balances After:
        Maker:    1.7490 SOL (+0.499 SOL)
        Taker:    1.4940 SOL (-0.506 SOL)
        Treasury: 0.0050 SOL (+0.005 SOL)
      
      🎨 NFT Ownership:
        Before: maker (CPDz3...)
        After:  taker (HNxWF...)
      ✅ NFT transferred successfully
      
      ✅ All assertions passed
```

## Error Handling

### Network Errors
- Retry failed transactions (max 3 attempts)
- Increase confirmation timeout for congested network
- Log detailed error info

### API Errors  
- Check response status codes
- Log full error response
- Provide helpful error messages

### Assertion Failures
- Show expected vs actual values
- Include tolerance info
- Log transaction signatures for debugging

## Next Steps

1. Initialize API client in test setup
2. Implement helper verification functions
3. Complete Scenario 1 implementation
4. Test on staging
5. Replicate to other scenarios
6. Create PR with working tests

## Success Criteria

- ✅ All 36+ test scenarios pass
- ✅ Real transactions on devnet
- ✅ Balance changes verified
- ✅ Asset transfers verified
- ✅ Nonce consumption verified
- ✅ Fees calculated correctly
- ✅ Tests complete in < 5 minutes total
- ✅ Clear, actionable error messages

## Related Files

- `src/routes/offers.routes.ts` (staging) - API implementation
- `src/services/offerManager.ts` (staging) - Business logic
- `tests/helpers/atomic-swap-api-client.ts` - API client
- `tests/helpers/devnet-wallet-manager.ts` - Wallet management
- `tests/helpers/devnet-nft-setup.ts` - NFT creation

