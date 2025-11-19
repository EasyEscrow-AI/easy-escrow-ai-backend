#!/bin/bash
# Remote Migration Cleanup Script
# Run this on DigitalOcean to clean up failed migration records

set -e

echo "🔧 Cleaning up failed migration record on DigitalOcean..."
echo ""

# Use DATABASE_ADMIN_URL (direct connection, not pooled)
if [ -z "$DATABASE_ADMIN_URL" ]; then
  echo "❌ ERROR: DATABASE_ADMIN_URL environment variable not set"
  echo "This script must be run with direct database access"
  exit 1
fi

echo "✅ DATABASE_ADMIN_URL is set"
echo ""

# Run the cleanup
echo "Running cleanup script..."
npx ts-node scripts/database/cleanup-failed-migration.ts

echo ""
echo "✅ Cleanup complete"
echo "Next deploy should succeed"

