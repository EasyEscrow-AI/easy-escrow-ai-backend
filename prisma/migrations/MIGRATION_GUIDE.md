# Atomic Swap Database Migration Guide

## Overview

This guide documents the database migration for the Atomic Swap system, which introduces new tables for non-custodial NFT/cNFT swaps using durable nonces on Solana.

## Migration Information

- **Migration Name**: `20241117_atomic_swap_schema`
- **Created**: November 17, 2024
- **Type**: Additive (no breaking changes to existing tables)
- **Auto-Deploy**: ✅ Yes (runs automatically via DigitalOcean pre-deploy job)

## New Tables Added

### 1. Users Table
Tracks wallet addresses and swap statistics for the atomic swap system.

**Table**: `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique user identifier |
| wallet_address | TEXT | UNIQUE, NOT NULL | Solana wallet address (base58) |
| nonce_account | TEXT | NULLABLE | Assigned durable nonce account |
| is_subsidized | BOOLEAN | DEFAULT false | Whether first nonce was platform-subsidized |
| swap_stats | JSONB | NOT NULL | Swap statistics and history |
| created_at | TIMESTAMP | DEFAULT now() | Account creation timestamp |
| updated_at | TIMESTAMP | DEFAULT now() | Last update timestamp |

**Indexes**:
- PRIMARY KEY on `id`
- UNIQUE INDEX on `wallet_address`
- INDEX on `nonce_account` for faster lookups
- INDEX on `created_at` for analytics queries

**Swap Stats JSON Structure**:
```json
{
  "totalSwaps": 0,
  "successfulSwaps": 0,
  "failedSwaps": 0,
  "totalVolume": "0",
  "lastSwapDate": "2024-11-17T..."
}
```

### 2. Nonce Pool Table
Manages durable nonce accounts for transaction signing.

**Table**: `nonce_pool`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment identifier |
| nonce_account | TEXT | UNIQUE, NOT NULL | Nonce account address (base58) |
| status | ENUM | NOT NULL | Current status of nonce |
| last_used_at | TIMESTAMP | NULLABLE | Last usage timestamp |
| created_at | TIMESTAMP | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT now() | Last update timestamp |

**Nonce Status Enum**:
- `AVAILABLE` - Ready for assignment
- `IN_USE` - Currently assigned to a transaction
- `EXPIRED` - Needs to be refreshed

**Indexes**:
- PRIMARY KEY on `id`
- UNIQUE INDEX on `nonce_account`
- INDEX on `status` for pool management queries
- INDEX on `last_used_at` for cleanup operations

### 3. Swap Offers Table
Stores swap offers and counter-offers with asset details.

**Table**: `swap_offers`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique offer identifier |
| maker_wallet | TEXT | NOT NULL, FK → users | Offer creator wallet |
| offer_type | ENUM | NOT NULL | Type of offer |
| parent_offer_id | UUID | NULLABLE, FK → swap_offers | Parent offer for counters |
| offered_assets | JSONB | NOT NULL | Assets being offered |
| requested_assets | JSONB | NOT NULL | Assets being requested |
| status | ENUM | NOT NULL | Current offer status |
| expires_at | TIMESTAMP | NOT NULL | Offer expiration time |
| nonce_account | TEXT | NOT NULL, FK → nonce_pool | Associated nonce account |
| created_at | TIMESTAMP | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT now() | Last update timestamp |

**Offer Type Enum**:
- `MAKER_OFFER` - Initial offer
- `COUNTER_OFFER` - Counter to existing offer

**Offer Status Enum**:
- `ACTIVE` - Available for matching
- `MATCHED` - Taker found, pending execution
- `EXECUTED` - Successfully completed
- `CANCELLED` - Cancelled by maker
- `EXPIRED` - Past expiration time
- `FAILED` - Execution failed

**Indexes**:
- PRIMARY KEY on `id`
- INDEX on `maker_wallet` for user queries
- INDEX on `status` for filtering active offers
- INDEX on `expires_at` for expiration cleanup
- INDEX on `nonce_account` for nonce management
- INDEX on `parent_offer_id` for counter-offer queries
- COMPOSITE INDEX on `(status, expires_at)` for active offer queries

**Asset JSON Structure**:

**NFT Asset**:
```json
{
  "type": "nft",
  "mint": "So11111111111111111111111111111111111111112",
  "metadata": {
    "name": "NFT Name",
    "symbol": "SYMBOL",
    "uri": "https://...",
    "sellerFeeBasisPoints": 500,
    "creators": [
      { "address": "...", "verified": true, "share": 100 }
    ]
  }
}
```

**cNFT Asset**:
```json
{
  "type": "cnft",
  "mint": "compressed_nft_mint",
  "assetId": "global_asset_id",
  "tree": "merkle_tree_address",
  "leafIndex": 42,
  "metadata": {
    "name": "Compressed NFT",
    "symbol": "CNFT",
    "collection": "collection_address"
  }
}
```

### 4. Swap Transactions Table
Records completed and attempted swap transactions.

**Table**: `swap_transactions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique transaction identifier |
| offer_id | UUID | NOT NULL, FK → swap_offers | Related offer |
| counter_offer_id | UUID | NULLABLE, FK → swap_offers | Related counter-offer |
| maker_wallet | TEXT | NOT NULL, FK → users | Maker wallet |
| taker_wallet | TEXT | NOT NULL, FK → users | Taker wallet |
| transaction_signature | TEXT | UNIQUE, NOT NULL | Solana transaction signature |
| status | ENUM | NOT NULL | Transaction status |
| gas_fee | BIGINT | NOT NULL | Gas fee in lamports |
| is_subsidized | BOOLEAN | DEFAULT false | Whether gas was subsidized |
| error_message | TEXT | NULLABLE | Error details if failed |
| confirmed_at | TIMESTAMP | NULLABLE | Confirmation timestamp |
| created_at | TIMESTAMP | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT now() | Last update timestamp |

**Transaction Status Enum**:
- `PENDING` - Submitted to network
- `CONFIRMED` - Successfully confirmed
- `FAILED` - Transaction failed

**Indexes**:
- PRIMARY KEY on `id`
- UNIQUE INDEX on `transaction_signature`
- INDEX on `offer_id` for offer queries
- INDEX on `maker_wallet` for user history
- INDEX on `taker_wallet` for user history
- INDEX on `status` for monitoring
- INDEX on `confirmed_at` for analytics

## Foreign Key Relationships

```
users.wallet_address ← swap_offers.maker_wallet (CASCADE DELETE)
nonce_pool.nonce_account ← swap_offers.nonce_account (RESTRICT DELETE)
swap_offers.id ← swap_offers.parent_offer_id (SET NULL)
swap_offers.id ← swap_transactions.offer_id (CASCADE DELETE)
swap_offers.id ← swap_transactions.counter_offer_id (SET NULL)
users.wallet_address ← swap_transactions.maker_wallet (RESTRICT DELETE)
users.wallet_address ← swap_transactions.taker_wallet (RESTRICT DELETE)
```

### Cascade Behavior

**When a user is deleted**:
- ✅ All their swap offers are deleted (CASCADE)
- ❌ Transactions they participated in are protected (RESTRICT)

**When a swap offer is deleted**:
- ✅ All related transactions are deleted (CASCADE)
- ✅ Counter-offers' parent references are nullified (SET NULL)

**When a nonce account is deleted**:
- ❌ Offers using it are protected (RESTRICT)

## Migration Steps (Automated)

### Local Development

```bash
# Generate Prisma client with new schema
npm run db:generate

# Apply migration to local database
npm run db:migrate

# (Optional) Seed database with test data
npm run db:seed
```

### Staging Environment (Automatic)

1. Push changes to `staging` branch
2. DigitalOcean triggers auto-deploy
3. Pre-deploy job runs: `npx prisma migrate deploy`
4. Migrations applied automatically
5. New app version deployed

### Production Environment (Automatic)

1. Merge to `master` branch
2. DigitalOcean triggers auto-deploy
3. Pre-deploy job runs: `npx prisma migrate deploy`
4. Migrations applied automatically
5. New app version deployed

## Rollback Strategy

### If migration fails during deploy:

1. **Automatic Rollback**: DigitalOcean keeps previous version running
2. **Manual Rollback** (if needed):

```bash
# SSH into app container (if necessary)
doctl apps logs <app-id>

# Check migration status
npx prisma migrate status

# Revert last migration (if needed)
# Note: This should only be done on local/staging, NOT production
npx prisma migrate resolve --rolled-back 20241117_atomic_swap_schema
```

### If data corruption occurs:

1. **Restore from backup** (DigitalOcean automated backups)
2. **Point-in-time recovery** available for PostgreSQL managed database

## Data Migration

### No existing data migration required

This is an **additive migration** that introduces new tables without modifying existing ones. No data migration or transformation is needed.

### Future data migrations (if needed)

If existing `agreements` table needs to be migrated to new `swap_offers`:

```sql
-- Example migration script (not currently needed)
INSERT INTO swap_offers (
  maker_wallet,
  offer_type,
  offered_assets,
  requested_assets,
  status,
  expires_at,
  nonce_account
)
SELECT
  creator_address,
  'MAKER_OFFER',
  -- Transform existing data format
  jsonb_build_array(...)
FROM agreements
WHERE status = 'ACTIVE';
```

## Testing the Migration

### Automated Tests

Run the comprehensive test suite:

```bash
npx ts-node temp/test-database-operations.ts
```

**Test Coverage**:
- ✅ User CRUD operations
- ✅ Nonce pool management
- ✅ Swap offer relationships
- ✅ Transaction recording
- ✅ Constraint validations
- ✅ JSON field operations
- ✅ Index performance
- ✅ Cascade deletes

### Manual Verification

1. **Check tables exist**:
```sql
\dt public.users
\dt public.nonce_pool
\dt public.swap_offers
\dt public.swap_transactions
```

2. **Check indexes**:
```sql
\d users
\d nonce_pool
\d swap_offers
\d swap_transactions
```

3. **Test constraints**:
```sql
-- Unique wallet address
INSERT INTO users (wallet_address, is_subsidized, swap_stats)
VALUES ('test_wallet_123', false, '{}');
-- Should fail on duplicate
INSERT INTO users (wallet_address, is_subsidized, swap_stats)
VALUES ('test_wallet_123', false, '{}');
```

## Performance Considerations

### Index Strategy

- **Users**: Indexed on `wallet_address` for fast lookups
- **Nonce Pool**: Indexed on `status` for pool management
- **Swap Offers**: Composite index on `(status, expires_at)` for active offer queries
- **Transactions**: Indexed on signature for confirmation lookups

### Expected Performance

- **User lookup by wallet**: < 1ms
- **Active offers query**: < 5ms
- **Transaction history**: < 10ms
- **Nonce pool availability**: < 1ms

### Optimization Tips

1. **Use prepared statements** for repeated queries
2. **Limit result sets** with pagination
3. **Use JSONB indexes** if querying nested fields frequently:
```sql
CREATE INDEX idx_swap_stats_total ON users USING GIN ((swap_stats->'totalSwaps'));
```

## Monitoring

### Key Metrics to Track

- **Nonce pool size**: Should maintain at least 10 available nonces
- **Offer expiration rate**: Track expired vs executed offers
- **Transaction success rate**: Monitor failed transactions
- **Database size growth**: Track table sizes over time

### Queries for Monitoring

```sql
-- Nonce pool health
SELECT status, COUNT(*) FROM nonce_pool GROUP BY status;

-- Active offers count
SELECT COUNT(*) FROM swap_offers WHERE status = 'ACTIVE' AND expires_at > NOW();

-- Transaction success rate (last 24h)
SELECT
  status,
  COUNT(*),
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM swap_transactions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- User activity (top 10)
SELECT
  wallet_address,
  (swap_stats->>'totalSwaps')::int as total_swaps,
  (swap_stats->>'successfulSwaps')::int as successful
FROM users
ORDER BY (swap_stats->>'totalSwaps')::int DESC
LIMIT 10;
```

## Troubleshooting

### Common Issues

**Issue**: Migration fails with "relation already exists"
```
Solution: Check migration status with `npx prisma migrate status`
If migration was partially applied, use `npx prisma migrate resolve`
```

**Issue**: JSON field type errors
```
Solution: Ensure all JSON fields use proper types (Prisma.JsonValue or cast with `as any`)
```

**Issue**: Foreign key violations
```
Solution: Ensure parent records exist before creating child records
Check cascade rules in schema
```

**Issue**: Performance degradation
```
Solution: Check query plans with EXPLAIN ANALYZE
Add indexes for frequently queried columns
Consider partitioning for large tables
```

## Security Considerations

### Sensitive Data

- **Wallet addresses**: Public information, no special protection needed
- **Nonce accounts**: Platform-controlled, should be kept secure
- **Transaction signatures**: Public blockchain data

### Access Control

- **Application-level**: All database access through Prisma client
- **Database-level**: Use separate read-only user for analytics
- **Network-level**: Database accessible only from app platform

### SQL Injection Prevention

- ✅ All queries use Prisma parameterized queries
- ✅ No raw SQL with user input
- ✅ JSON fields validated before storage

## Future Enhancements

### Potential Schema Changes

1. **Add support for bulk swaps**:
```sql
ALTER TABLE swap_offers
ADD COLUMN is_bulk BOOLEAN DEFAULT false,
ADD COLUMN bulk_items JSONB;
```

2. **Add NFT verification table**:
```sql
CREATE TABLE verified_collections (
  collection_address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  verified_at TIMESTAMP DEFAULT NOW()
);
```

3. **Add analytics aggregation table**:
```sql
CREATE TABLE daily_stats (
  date DATE PRIMARY KEY,
  total_swaps INTEGER,
  total_volume BIGINT,
  unique_users INTEGER
);
```

## References

- **Prisma Documentation**: https://www.prisma.io/docs
- **PostgreSQL JSON Types**: https://www.postgresql.org/docs/current/datatype-json.html
- **Solana Durable Nonces**: https://docs.solana.com/implemented-proposals/durable-tx-nonces
- **DigitalOcean Managed Databases**: https://docs.digitalocean.com/products/databases/

## Support

For migration issues or questions:
1. Check DigitalOcean app logs: `doctl apps logs <app-id>`
2. Check database logs in DigitalOcean console
3. Run migration status: `npx prisma migrate status`
4. Review this guide and Prisma documentation

---

**Last Updated**: November 17, 2024
**Migration Version**: 20241117_atomic_swap_schema
**Prisma Version**: Latest (as per package.json)

