# Transaction Pools Deployment Guide

## Prerequisites

Before enabling transaction pools:

1. **Institution escrow must be enabled** (`INSTITUTION_ESCROW_ENABLED=true`)
2. **USDC mint address configured** (`USDC_MINT_ADDRESS`)
3. **Admin keypair available** (via `MAINNET_ADMIN_PRIVATE_KEY` or `DEVNET_STAGING_ADMIN_PRIVATE_KEY`)
4. **Fee collector address configured** (`FEE_COLLECTOR_ADDRESS`)
5. **Database migration applied** (`20260326100000_add_transaction_pools`)
6. **AES-256 encryption key generated** for receipt encryption

## Environment Variables

Add the following to your `.env` or deployment secrets:

```bash
# Feature flag
TRANSACTION_POOLS_ENABLED=true

# Receipt encryption key (32 bytes as 64-char hex)
# Generate with: openssl rand -hex 32
POOL_RECEIPT_ENCRYPTION_KEY=<64-character-hex-string>

# Optional tuning (defaults shown)
POOL_MAX_MEMBERS=50
POOL_DEFAULT_EXPIRY_HOURS=24
POOL_SETTLEMENT_CONCURRENCY=5
```

The encryption key is critical. Generate it once and store it securely. If lost, existing on-chain receipts cannot be decrypted.

## Database Migration

Run the migration that adds the transaction pool tables:

```bash
# Development
npm run db:migrate

# Production
npm run db:migrate:deploy
```

This creates three tables:

- `transaction_pools` — pool records
- `transaction_pool_members` — pool-escrow membership
- `transaction_pool_audit_logs` — audit trail

Verify migration applied:

```bash
npx prisma migrate status
```

## Enabling the Feature

1. Set `TRANSACTION_POOLS_ENABLED=true` in environment
2. Restart the backend:

```bash
# Docker
docker compose up -d --build backend

# DigitalOcean App Platform
# Update environment variable in App settings, then redeploy
```

3. Verify the routes are registered in startup logs:

```
Transaction pool routes enabled
```

## Verification

### Health Check

Confirm the API returns pool endpoints:

```bash
curl -s https://api.easyescrow.ai/api/v1/institution/pools \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Should return `200` with a pools list (empty if no pools created yet).

### Feature Flag Off

When `TRANSACTION_POOLS_ENABLED` is not `true`, all pool endpoints return:

```json
{
  "error": "Not Found",
  "message": "Transaction pools are not enabled"
}
```

### Create Test Pool

```bash
curl -X POST https://api.easyescrow.ai/api/v1/institution/pools \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"corridor": "SG-CH", "expiryHours": 2}'
```

A successful `201` response with a pool code (`TP-XXX-XXX`) confirms:

- Database tables exist
- On-chain vault initialization works
- Feature flag is active

### Verify Pool Expiry Monitor

The expiry monitor starts automatically. Check logs for:

```
[PoolExpiryMonitor] Monitor started
[PoolExpiryMonitor]    Schedule: */10 * * * *
```

## Monitoring

### Key Metrics

- **Pool creation rate** — number of pools created per hour
- **Settlement success rate** — ratio of SETTLED to PARTIAL_FAIL/FAILED
- **Average settlement time** — time from SETTLING to SETTLED
- **Expiry monitor executions** — should run every 10 minutes without errors

### Alerts

The pool expiry monitor sends alerts via `alertingService` after 3 consecutive failures. Monitor for:

- `pool_expiry_monitor_failed` alert
- High `consecutiveErrors` count in monitor status

### Logs

Pool operations are logged with the `[TransactionPoolService]` and `[PoolVaultProgramService]` prefixes. Key log patterns:

```
[TransactionPoolService] On-chain pool vault init success for TP-XXX-XXX
[PoolVaultProgramService] Release pool member on-chain: pool=..., member=..., tx: ...
[PoolExpiryMonitor] Batch 1: Found 3 expired pools
```

## Rollback

To disable transaction pools without data loss:

1. Set `TRANSACTION_POOLS_ENABLED=false`
2. Restart the backend

```bash
docker compose restart backend
```

Pool data remains in the database. Existing OPEN pools will eventually expire via the monitor (which won't run, but they'll be picked up if re-enabled).

To fully remove pool data (destructive):

```bash
# Only if you want to purge all pool data
npx prisma migrate reset  # WARNING: resets entire database
```

For selective cleanup, delete from `transaction_pool_audit_logs`, `transaction_pool_members`, then `transaction_pools` in that order (respecting foreign keys).

## Security Checklist

- [ ] `POOL_RECEIPT_ENCRYPTION_KEY` is set and stored in secrets manager
- [ ] Key is not committed to source control
- [ ] `SETTLEMENT_AUTHORITY_API_KEY` is configured for settle/retry endpoints
- [ ] Rate limits are in place (30/min standard, 10/min settlement)
- [ ] JWT authentication is required on all endpoints
- [ ] Pool expiry monitor is running (check logs)
- [ ] On-chain admin keypair has sufficient SOL for transaction fees
