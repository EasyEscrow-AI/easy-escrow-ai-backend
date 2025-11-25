# Atomic Swap Test Page

## Overview

The Atomic Swap Test Page is a visual development tool for testing atomic swap functionality with live wallets on Solana Devnet. It provides a split-screen interface showing two wallets (Maker and Taker) and allows developers to execute atomic swaps with a visual representation of the process.

## Access

**URL:** `http://localhost:3000/test` (development) or `https://staging-api.easyescrow.ai/test` (staging)

## Features

### Split-Screen Wallet View

- **Left Panel (Maker/Sender):** 
  - Wallet: `FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71`
  - Displays SOL balance
  - Shows all NFTs owned by the wallet
  - Allows selection of NFTs to offer
  - Input field for SOL amount to offer

- **Right Panel (Taker/Receiver):**
  - Wallet: `Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk`
  - Displays SOL balance
  - Shows all NFTs owned by the wallet
  - Allows selection of NFTs to request
  - Input field for SOL amount to request

### Interactive Features

1. **NFT Selection:** Click on any NFT card to select/deselect it for the swap
2. **SOL Amounts:** Enter SOL amounts in the input fields (supports decimals)
3. **Refresh:** Reload wallet data with the refresh button
4. **Live Activity Log:** Real-time logging of all swap operations
5. **Transaction Summary:** Detailed breakdown after swap completion

### Atomic Swap Execution

The "Execute Atomic Swap" button performs the following steps:

1. **Validation:** Ensures at least one asset (NFT or SOL) is selected on each side
2. **Create Offer:** Calls `POST /api/offers` to create the swap offer
3. **Accept Offer:** Calls `POST /api/offers/:id/accept` to accept the offer
4. **Display Results:** Shows transaction summary and logs

## API Endpoints

### GET /test
Serves the test page HTML interface.

### GET /api/test/wallet-info
Fetches wallet information including balance and NFTs.

**Query Parameters:**
- `address` (required): Solana wallet address

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71",
    "solBalance": 5.2341,
    "solBalanceLamports": 5234100000,
    "nfts": [
      {
        "mint": "...",
        "tokenAccount": "...",
        "name": "Cool NFT #123",
        "image": "https://...",
        "isCompressed": false
      }
    ],
    "nftCount": 3
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Technical Implementation

### Frontend (test-page.html)

- **Vanilla JavaScript:** No framework dependencies
- **Responsive Design:** Split-screen layout with modern UI
- **Real-time Updates:** Live activity logging and status updates
- **Error Handling:** User-friendly error messages and validation

### Backend (test.routes.ts)

- **Express Router:** RESTful endpoints
- **Solana Integration:** Direct connection to Solana RPC
- **NFT Detection:** Filters token accounts for NFTs (amount=1, decimals=0)
- **Metadata Support:** Optional Helius API integration for NFT metadata

## Usage Examples

### Test NFT ↔ NFT Swap

1. Open `/test` in browser
2. Wait for wallets to load
3. Select 1+ NFTs from Maker panel
4. Select 1+ NFTs from Taker panel
5. Click "Execute Atomic Swap"
6. Review transaction summary

### Test NFT ↔ SOL Swap

1. Select NFT(s) from Maker panel
2. Enter SOL amount in Taker SOL input (e.g., "0.5")
3. Click "Execute Atomic Swap"

### Test SOL ↔ SOL Swap

1. Enter SOL amount in Maker input (e.g., "1.0")
2. Enter SOL amount in Taker input (e.g., "0.8")
3. Click "Execute Atomic Swap"

## Development Notes

### Wallet Signing (Not Implemented)

The current implementation creates offers and builds transactions but does NOT:
- Sign transactions with real wallets
- Submit transactions to the blockchain
- Confirm on-chain execution

These features require wallet adapter integration (Phantom, Solflare, etc.) and are marked as future enhancements.

### Environment Variables

The test page uses these environment variables:
- `SOLANA_RPC_URL`: Solana RPC endpoint (defaults to Devnet)
- `HELIUS_API_KEY`: Optional, for NFT metadata fetching

### Test Wallets

The hardcoded test wallets are for **Devnet only**:
- Maker: `FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71`
- Taker: `Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk`

**⚠️ Never use production wallets or private keys in this test page!**

## Troubleshooting

### NFTs Not Loading

**Issue:** Empty NFT grid or "Failed to load NFTs" error

**Solutions:**
1. Check SOLANA_RPC_URL is pointing to correct network
2. Verify wallet has NFTs on the target network
3. Check browser console for detailed errors
4. Try refreshing the wallet data

### Swap Button Disabled

**Issue:** "Execute Atomic Swap" button is grayed out

**Solutions:**
1. Wait for both wallets to finish loading
2. Check that at least one asset is selected on each side
3. Verify SOL input values are valid numbers

### Transaction Fails

**Issue:** Error in activity log during swap execution

**Solutions:**
1. Check wallet balances are sufficient
2. Verify NFTs are owned and not frozen
3. Review activity log for specific error messages
4. Check network connectivity to RPC

## Future Enhancements

- [ ] Wallet adapter integration for real signing
- [ ] On-chain transaction submission
- [ ] Real-time confirmation polling
- [ ] Support for cNFTs (compressed NFTs)
- [ ] Transaction history view
- [ ] Export transaction data
- [ ] Multi-asset swap (>2 NFTs per side)
- [ ] Custom fee adjustment
- [ ] Expiry time configuration

## Security Considerations

1. **Development Only:** This page is for development/testing purposes only
2. **No Private Keys:** Never expose private keys in frontend code
3. **Testnet Only:** Only use with Devnet/testnet wallets
4. **Rate Limiting:** API endpoints use standard rate limiting
5. **Input Validation:** All inputs are validated server-side

## Related Documentation

- [Atomic Swap API Documentation](../api/ATOMIC_SWAP_API.md)
- [Offers API Endpoints](../api/openapi.yaml)
- [Development Setup](./DEVELOPMENT_SETUP.md)
- [Testing Guide](../testing/TESTING_GUIDE.md)

## Code Location

- **Route Handler:** `src/routes/test.routes.ts`
- **HTML/JS Frontend:** `src/public/test-page.html`
- **Route Registration:** `src/index.ts` and `src/routes/index.ts`

## Screenshots

### Initial View
Split-screen layout with both wallets loaded, showing SOL balances and NFT grids.

### NFT Selection
NFTs highlighted with blue border when selected, showing active swap configuration.

### Activity Log
Real-time logging of swap steps with success/error indicators and timestamps.

### Transaction Summary
Detailed breakdown of completed swap with offer ID, assets exchanged, and next steps.

