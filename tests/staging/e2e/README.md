# Staging Atomic Swap E2E Tests

End-to-end tests for atomic swap functionality on staging (devnet).

## Tests

- `01-atomic-nft-for-sol-happy-path.test.ts` - NFT → SOL swaps (✅ Scenario 1 complete)
- `02-atomic-cnft-for-sol-happy-path.test.ts` - cNFT → SOL swaps
- `03-atomic-nft-for-nft-happy-path.test.ts` - NFT → NFT swaps
- `04-atomic-nft-for-cnft-happy-path.test.ts` - NFT → cNFT swaps

## Running Tests

```bash
# Individual tests
npm run test:staging:e2e:atomic:nft-sol
npm run test:staging:e2e:atomic:cnft-for-sol
npm run test:staging:e2e:atomic:nft-for-nft
npm run test:staging:e2e:atomic:nft-for-cnft

# All atomic swap tests
npm run test:staging:e2e:atomic:all
```

## Environment Variables Required

```bash
STAGING_API_URL=https://easyescrow-backend-staging.ondigitalocean.app
ATOMIC_SWAP_API_KEY=<your-api-key>
STAGING_SOLANA_RPC_URL=<helius-devnet-url>
STAGING_PROGRAM_ID=AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei
```

See `docs/ATOMIC_SWAP_ENVIRONMENT_VARIABLES.md` for complete setup.

## Related

- API Client: `tests/helpers/atomic-swap-api-client.ts`
- Verification: `tests/helpers/swap-verification.ts`
- Docs: `docs/tasks/ATOMIC_SWAP_E2E_*.md`

