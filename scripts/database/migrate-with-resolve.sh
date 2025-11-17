#!/bin/bash

# Migration script with automatic failed migration resolution
# This script marks any failed migration as rolled back before deploying new migrations

echo "🔄 Checking for failed migrations..."

# Try to mark the known failed migration as rolled back (ignore errors if it doesn't exist)
npx prisma migrate resolve --rolled-back 20251117192727_add_atomic_swap_models 2>/dev/null || echo "⚠️  Migration 20251117192727_add_atomic_swap_models not found or already resolved"

echo "📦 Deploying migrations..."

# Deploy migrations
npx prisma migrate deploy

if [ $? -eq 0 ]; then
  echo "✅ Migrations deployed successfully"
  exit 0
else
  echo "❌ Migration deployment failed"
  exit 1
fi

