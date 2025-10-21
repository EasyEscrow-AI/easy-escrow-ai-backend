# STAGING Token Addresses

Official token mint addresses for STAGING environment testing on Solana Devnet.

## USDC (Official Devnet)

**Official Circle USDC Devnet Mint**

| Property | Value |
|----------|-------|
| **Mint Address** | `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` |
| **Network** | Devnet |
| **Decimals** | 6 |
| **Authority** | Circle (official test mint) |
| **Type** | SPL Token |

**Explorer Link:**
https://explorer.solana.com/address/Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr?cluster=devnet

**Environment Variable:**
```bash
DEVNET_STAGING_USDC_MINT_ADDRESS=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
```

## Getting Test USDC

### Option 1: SPL Token Faucet
Visit: https://spl-token-faucet.com/?token-name=USDC-Dev

### Option 2: Circle Devnet Faucet
- Circle provides an official devnet USDC faucet
- Check Circle's developer documentation for access

### Option 3: Manual Token Account Creation

```bash
# Create USDC token account for Receiver wallet
spl-token create-account Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr \
  --owner wallets/staging/staging-receiver.json \
  --url devnet

# Create USDC token account for Sender wallet (if needed)
spl-token create-account Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr \
  --owner wallets/staging/staging-sender.json \
  --url devnet
```

## Token Account Addresses

Once created, you can find your token account addresses:

```bash
# List all token accounts for Receiver
spl-token accounts --owner 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 --url devnet

# Check USDC balance for specific token account
spl-token balance Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr \
  --owner wallets/staging/staging-receiver.json \
  --url devnet
```

## Test NFT Collections

For NFT testing in STAGING, you can:

### Option 1: Create Test Collection with Metaplex

```bash
# Install Metaplex CLI
npm install -g @metaplex-foundation/js

# Create test collection
metaplex create-collection \
  --keypair wallets/staging/staging-sender.json \
  --name "STAGING Test Collection" \
  --symbol "STGTEST" \
  --url devnet

# Mint test NFT
metaplex mint-nft \
  --keypair wallets/staging/staging-sender.json \
  --collection <collection-address> \
  --name "Test NFT #1" \
  --url devnet
```

### Option 2: Use Existing Devnet NFT Collections

Look for test NFT collections on devnet that allow minting for testing purposes.

## Verifying Token Setups

### Check USDC Token Account

```bash
# Verify Receiver has USDC token account
spl-token account-info Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr \
  --owner 5VsKp5GWPqeCcgxhNUjC2jQu2UuH8HW6baTCQSvBktx4 \
  --url devnet
```

### Check NFT Ownership

```bash
# List all NFTs owned by Sender
metaplex list-nfts \
  --keypair wallets/staging/staging-sender.json \
  --url devnet
```

## Important Notes

### ⚠️ Use Official USDC Mint Only

- **Always use** `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` for STAGING
- This is the **official Circle devnet USDC mint**
- Do NOT use test mints or other USDC variants
- Ensures production parity for testing

### 🔒 STAGING vs DEV Mints

| Environment | USDC Mint | Rationale |
|-------------|-----------|-----------|
| **DEV** | May use test mints | Rapid iteration, custom minting |
| **STAGING** | `Gh9ZwE...tKJr` (Official) | Production parity |
| **PROD** | `EPjFWdd...1111` (Mainnet USDC) | Real USDC |

### 📝 Configuration Files

Ensure these files use the correct USDC mint:

- ✅ `.env.staging`
- ✅ `.env.staging.example`
- ✅ Test suite configurations
- ✅ E2E test scripts
- ✅ CI/CD deployment configs

## Troubleshooting

### "Token account not found"

**Solution:** Create the token account first:
```bash
spl-token create-account Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr \
  --owner <wallet> \
  --url devnet
```

### "Insufficient USDC balance"

**Solution:** Get test USDC from faucet or create a custom test mint with mint authority.

### "Wrong mint address"

**Solution:** Verify you're using the correct official mint:
```bash
Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
```

---

**Last Updated**: 2025-01-20  
**Maintained By**: DevOps Team

## Related Documentation

- **[STAGING Reference](STAGING_REFERENCE.md)** - Complete STAGING infrastructure reference (comprehensive) ⭐
- [STAGING Wallets](STAGING_WALLETS.md) - Wallet addresses and management
- [Program IDs](PROGRAM_IDS.md) - All program IDs across environments

