# Database Setup Guide

This guide explains how to set up the PostgreSQL database for the EasyEscrow.ai backend.

## Prerequisites

- PostgreSQL 13 or higher
- Node.js 18 or higher
- npm or yarn package manager

## Local Development Setup

### Option 1: Using Docker (Recommended)

The easiest way to run PostgreSQL locally is using Docker:

```bash
docker run -d \
  --name easyescrow-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=easyescrow_dev \
  -p 5432:5432 \
  postgres:15
```

### Option 2: Install PostgreSQL Locally

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
createdb easyescrow_dev
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-15
sudo systemctl start postgresql
sudo -u postgres createdb easyescrow_dev
```

**Windows:**
Download and install from: https://www.postgresql.org/download/windows/

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Update the `DATABASE_URL` in `.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/easyescrow_dev?schema=public"
```

## Running Migrations

### Automatic Setup (Recommended)

Run the setup script:

**Unix/Linux/macOS:**
```bash
chmod +x scripts/setup-database.sh
./scripts/setup-database.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\setup-database.ps1
```

### Manual Setup

1. Generate Prisma Client:
```bash
npx prisma generate
```

2. Create and run migrations:
```bash
npx prisma migrate dev --name init_database_schema
```

## Database Schema

The database includes the following tables:

### Core Tables

1. **agreements** - Stores escrow agreement details
   - Primary fields: id, agreement_id, nft_mint, price, seller, buyer, status
   - Tracks escrow state and transaction IDs
   - Indexed on: agreement_id, seller, buyer, status, expiry

2. **deposits** - Tracks individual deposits (USDC and NFT)
   - Links to agreements via foreign key
   - Records deposit type, amount, depositor, and confirmation status
   - Indexed on: agreement_id, type, status, depositor

3. **settlements** - Records completed settlements
   - One-to-one relationship with agreements
   - Stores fee calculations and recipient information
   - Indexed on: agreement_id, buyer, seller, nft_mint

4. **receipts** - Hash-signed settlement receipts
   - One-to-one relationship with agreements
   - Contains cryptographic signatures for verification
   - Indexed on: receipt_hash, buyer, seller, nft_mint

5. **webhooks** - Webhook delivery tracking
   - Tracks webhook events and delivery attempts
   - Supports retry logic and delivery status
   - Indexed on: agreement_id, event_type, status

### Supporting Tables

6. **idempotency_keys** - Prevents duplicate operations
   - Stores request hashes and cached responses
   - TTL-based expiration

7. **transaction_logs** - Comprehensive transaction tracking
   - Records all blockchain transactions
   - Indexed on: tx_id, agreement_id, operation_type

## Prisma Commands

### View Database in Prisma Studio
```bash
npx prisma studio
```

### Generate Prisma Client (after schema changes)
```bash
npx prisma generate
```

### Create a New Migration
```bash
npx prisma migrate dev --name your_migration_name
```

### Apply Migrations in Production
```bash
npx prisma migrate deploy
```

### Reset Database (WARNING: Deletes all data)
```bash
npx prisma migrate reset
```

### Validate Schema
```bash
npx prisma validate
```

### Format Schema
```bash
npx prisma format
```

## Staging Database Setup

### DigitalOcean Managed PostgreSQL (Staging)

The staging environment uses an isolated database within the same PostgreSQL cluster:

**Quick Setup:**
```bash
# Windows (PowerShell)
.\scripts\deployment\setup-staging-database.ps1

# Or manually using SQL script
psql "postgresql://doadmin:PASSWORD@host:25060/defaultdb?sslmode=require" -f scripts/deployment/setup-staging-database.sql
```

**Configuration:**
1. Database: `easyescrow_staging`
2. User: `staging_user` (least-privilege permissions)
3. Connection strings saved in DigitalOcean App Platform secrets
4. Separate connection pool (10-15 connections)
5. Daily backups with 7-day retention

**Environment Variables for Staging:**
```env
DATABASE_URL="postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require"
DATABASE_POOL_URL="postgresql://staging_user:PASSWORD@pooler:25061/easyescrow_staging?sslmode=require"
DATABASE_POOL_SIZE=10
NODE_ENV=staging
```

**Run Migrations:**
```bash
DATABASE_URL="postgresql://staging_user:PASSWORD@host:25060/easyescrow_staging?sslmode=require" npx prisma migrate deploy
```

**Seed Test Data:**
```bash
npm run db:seed:staging
```

**Test Connection:**
```bash
npm run db:test-connection
```

📖 **Detailed Guide:** See [STAGING_DATABASE_SETUP.md](../infrastructure/STAGING_DATABASE_SETUP.md) for comprehensive staging setup instructions.

## Production Deployment

### DigitalOcean Managed PostgreSQL

1. Create a managed PostgreSQL database in DigitalOcean
2. Configure VPC for secure access
3. Add the connection string to App Platform secrets:
   ```
   DATABASE_URL="postgresql://user:password@host:25060/database?sslmode=require"
   ```
4. Run migrations during deployment:
   ```bash
   npx prisma migrate deploy
   ```

### Environment Variables for Production

Set these in your App Platform or production environment:

```env
DATABASE_URL="postgresql://..."
NODE_ENV=production
```

## Troubleshooting

### Connection Issues

**Error: Can't reach database server**
- Verify PostgreSQL is running: `pg_isready`
- Check the DATABASE_URL is correct
- Ensure PostgreSQL port (5432) is not blocked by firewall

**SSL/TLS Errors**
- For local development, add `?sslmode=disable` to DATABASE_URL
- For production, ensure `?sslmode=require` is set

### Migration Issues

**Error: Migration failed**
- Check database user has proper permissions
- Ensure no conflicting schema exists
- Review migration logs for specific errors

**Prisma Client not found**
- Run `npx prisma generate` to regenerate the client
- Check that `src/generated/prisma` directory exists

### Performance Issues

**Slow queries**
- Review query patterns in application logs
- Add indexes for frequently queried fields
- Use Prisma's query logging to identify bottlenecks

## Backup and Recovery

### Create Backup
```bash
pg_dump -h localhost -U postgres -d easyescrow_dev > backup.sql
```

### Restore from Backup
```bash
psql -h localhost -U postgres -d easyescrow_dev < backup.sql
```

### Production Backups

DigitalOcean managed databases automatically create daily backups with point-in-time recovery.

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [DigitalOcean Managed PostgreSQL](https://docs.digitalocean.com/products/databases/postgresql/)

