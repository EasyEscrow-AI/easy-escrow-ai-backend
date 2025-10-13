#!/bin/bash

# Database setup script for EasyEscrow.ai backend
# This script sets up the PostgreSQL database and runs migrations

echo "🔧 Setting up database for EasyEscrow.ai..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL environment variable is not set"
  echo "Please set DATABASE_URL in your .env file"
  exit 1
fi

echo "✅ DATABASE_URL is set"

# Check if PostgreSQL is accessible
echo "📡 Checking database connection..."
npx prisma db pull --force 2>/dev/null || {
  echo "⚠️  Cannot connect to database. Please ensure PostgreSQL is running."
  echo "For local development, you can start PostgreSQL with:"
  echo "  - macOS: brew services start postgresql"
  echo "  - Linux: sudo systemctl start postgresql"
  echo "  - Docker: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15"
  exit 1
}

echo "✅ Database connection successful"

# Generate Prisma client
echo "🔨 Generating Prisma client..."
npx prisma generate

# Run migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy

echo "✅ Database setup complete!"
echo "🎉 You can now start the application with: npm run dev"

