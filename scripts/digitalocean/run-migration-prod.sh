#!/bin/bash

# ============================================
# Production Database Migration Script
# Runs Prisma migrations using migrate_user
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0:31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# Configuration
# ============================================

ENVIRONMENT="${1:-prod}"  # Default to prod, or pass "stage" or "dev"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EasyEscrow.ai Database Migration${NC}"
echo -e "${GREEN}Environment: $ENVIRONMENT${NC}"
echo -e "${GREEN}========================================${NC}"

# ============================================
# Validate Environment
# ============================================

if [[ ! "$ENVIRONMENT" =~ ^(prod|stage|dev)$ ]]; then
  echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'${NC}"
  echo "Usage: $0 [prod|stage|dev]"
  exit 1
fi

# ============================================
# Check for Migration User Credentials
# ============================================

# Migration user connection string should be set in environment
# e.g., MIGRATE_DATABASE_URL_PROD
MIGRATE_VAR="MIGRATE_DATABASE_URL_${ENVIRONMENT^^}"
MIGRATE_URL="${!MIGRATE_VAR}"

if [ -z "$MIGRATE_URL" ]; then
  echo -e "${RED}Error: $MIGRATE_VAR environment variable not set${NC}"
  echo ""
  echo "Set it like:"
  echo "export $MIGRATE_VAR='postgresql://migrate_user_$ENVIRONMENT:PASSWORD@HOST:25060/easyescrow_$ENVIRONMENT?sslmode=require'"
  exit 1
fi

# ============================================
# Backup Check (Production only)
# ============================================

if [ "$ENVIRONMENT" == "prod" ]; then
  echo -e "${YELLOW}⚠️  Running migration on PRODUCTION${NC}"
  echo -e "${YELLOW}Please ensure you have a recent backup!${NC}"
  echo ""
  read -p "Do you have a recent backup? (yes/no): " confirm
  
  if [ "$confirm" != "yes" ]; then
    echo -e "${RED}Migration cancelled. Please create a backup first.${NC}"
    exit 1
  fi
fi

# ============================================
# Pre-Migration Checks
# ============================================

echo ""
echo -e "${GREEN}Step 1: Pre-Migration Checks${NC}"

# Test database connectivity
echo "Testing database connectivity..."
if ! psql "$MIGRATE_URL" -c "SELECT 1" > /dev/null 2>&1; then
  echo -e "${RED}Error: Cannot connect to database${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Database connection successful${NC}"

# Check if migration user has correct permissions
echo "Checking migration user permissions..."
HAS_CREATE=$(psql "$MIGRATE_URL" -t -c "SELECT has_schema_privilege('public', 'CREATE');" 2>/dev/null | tr -d '[:space:]')

if [ "$HAS_CREATE" != "t" ]; then
  echo -e "${RED}Error: Migration user doesn't have CREATE permission${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Migration user has correct permissions${NC}"

# ============================================
# Run Prisma Migration
# ============================================

echo ""
echo -e "${GREEN}Step 2: Running Prisma Migration${NC}"

# Export the migration connection string for Prisma
export DATABASE_URL="$MIGRATE_URL"

# Run migration deploy
echo "Executing: prisma migrate deploy"
if npx prisma migrate deploy; then
  echo -e "${GREEN}✓ Migration completed successfully${NC}"
else
  echo -e "${RED}✗ Migration failed${NC}"
  exit 1
fi

# ============================================
# Post-Migration Verification
# ============================================

echo ""
echo -e "${GREEN}Step 3: Post-Migration Verification${NC}"

# Count tables
TABLE_COUNT=$(psql "$MIGRATE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" | tr -d '[:space:]')
echo "Tables in database: $TABLE_COUNT"

if [ "$TABLE_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  Warning: No tables found after migration${NC}"
fi

# Check migration history
echo "Checking migration history..."
MIGRATION_COUNT=$(psql "$MIGRATE_URL" -t -c "SELECT COUNT(*) FROM _prisma_migrations;" 2>/dev/null | tr -d '[:space:]')
echo "Applied migrations: $MIGRATION_COUNT"

# ============================================
# Update App User Permissions (if needed)
# ============================================

echo ""
echo -e "${GREEN}Step 4: Refreshing App User Permissions${NC}"

# Grant permissions on new tables to app user
APP_USER="app_user_$ENVIRONMENT"
psql "$MIGRATE_URL" -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $APP_USER;" > /dev/null 2>&1
psql "$MIGRATE_URL" -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $APP_USER;" > /dev/null 2>&1

echo -e "${GREEN}✓ App user permissions refreshed${NC}"

# ============================================
# Summary
# ============================================

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Migration Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Environment: $ENVIRONMENT"
echo "Tables: $TABLE_COUNT"
echo "Migrations Applied: $MIGRATION_COUNT"
echo -e "${GREEN}Status: SUCCESS ✓${NC}"
echo -e "${GREEN}========================================${NC}"

# ============================================
# Next Steps
# ============================================

echo ""
echo "Next steps:"
echo "1. Test the application with the new schema"
echo "2. Monitor application logs for errors"
echo "3. Verify data integrity"

if [ "$ENVIRONMENT" == "prod" ]; then
  echo "4. Monitor production metrics closely"
fi

exit 0

