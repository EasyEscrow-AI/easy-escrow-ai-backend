# Database Migrations

This directory contains all database migrations for the EasyEscrow.ai backend.

## Initial Migration

The initial migration creates the complete database schema with the following tables:

### Tables

1. **agreements** - Main escrow agreements
2. **deposits** - Individual deposit tracking (USDC and NFT)
3. **settlements** - Completed settlement records
4. **receipts** - Hash-signed settlement receipts
5. **webhooks** - Webhook delivery tracking
6. **idempotency_keys** - Prevent duplicate operations
7. **transaction_logs** - Comprehensive transaction tracking

### Running Migrations

For local development:
```bash
npx prisma migrate dev
```

For production:
```bash
npx prisma migrate deploy
```

### Prerequisites

Before running migrations, ensure:
1. PostgreSQL database is running and accessible
2. DATABASE_URL environment variable is set correctly
3. Database user has proper permissions

### Migration Notes

- All timestamps use UTC
- Decimal fields use (20, 9) precision for Solana token amounts
- Proper indexes are created for query performance
- Foreign keys maintain referential integrity
- Cascade deletes are configured where appropriate

