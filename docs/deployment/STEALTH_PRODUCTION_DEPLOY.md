# Stealth Addresses: Production Deployment Guide

## Prerequisites

- Staging deployment validated and tested
- All unit + integration tests passing
- Security review of key encryption implementation complete

## Production Environment Variables

Add to production environment:

```env
PRIVACY_ENABLED=true
STEALTH_KEY_ENCRYPTION_SECRET=<generate-unique-32+-char-secret>
DEFAULT_PRIVACY_LEVEL=STEALTH
PRIVACY_JITO_DEFAULT=false
```

Privacy is **STEALTH by default** for all institutional endpoints. If a recipient has no meta-address, the system gracefully falls back to standard transfers (NONE). Set `DEFAULT_PRIVACY_LEVEL=NONE` to disable stealth-by-default.

**IMPORTANT:** Use a different `STEALTH_KEY_ENCRYPTION_SECRET` than staging.

Generate a secure secret:
```bash
openssl rand -base64 48 | head -c 48
```

## Deployment Steps

1. **No on-chain program changes needed** — stealth addresses are regular Ed25519 pubkeys
2. Add environment variables to production
3. Run Prisma migration:
   ```bash
   npm run db:migrate:deploy
   ```
4. Deploy application code
5. Verify startup logs show privacy features enabled
6. Run production smoke tests:
   ```bash
   npm run test:production:smoke:all
   ```

## Post-Deploy Verification

1. Create an institution account — verify stealth meta-address is auto-generated
2. Create test escrow (STEALTH is default — no need to specify)
3. Fund and release escrow — verify on-chain USDC goes to stealth address
4. Scan and sweep — verify USDC arrives at destination wallet
5. Check audit logs contain stealth metadata
6. Create escrow to a wallet with no meta-address — verify graceful fallback to NONE

## What Changes from Staging

| Aspect | Staging | Production |
|--------|---------|------------|
| Program ID | `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` | `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` |
| IDL file | `escrow-idl-staging.json` | `escrow-idl-production.json` |
| RPC | Helius staging/devnet | Helius mainnet |
| USDC mint | Devnet USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Encryption secret | Staging secret | Unique production secret |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Encryption secret leak | Rotate and re-encrypt all keys; consider HSM |
| `solana-stealth` supply chain | Pin exact version; audit before upgrading |
| Stealth ATA rent (~0.002 SOL) | Budget for per-payment rent costs |
| Sweep failures (no SOL for gas) | Pre-fund stealth address or subsidize gas |

## Monitoring

- Watch error rates on `/api/v1/privacy/*` endpoints
- Monitor stealth payment status distribution (PENDING → CONFIRMED → SWEPT)
- Alert on FAILED stealth payments
- 24-hour soak period after initial deploy

## Rollback

If issues arise:
1. Set `PRIVACY_ENABLED=false` — all privacy endpoints return 503
2. Existing stealth payments remain in DB but no new ones created
3. Standard (non-stealth) releases continue working normally
