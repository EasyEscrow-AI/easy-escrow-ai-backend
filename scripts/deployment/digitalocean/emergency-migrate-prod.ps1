#
# Emergency Production Database Migration Script (PowerShell)
# Use this ONLY when pre-deploy migrations fail or don't run
#
# CRITICAL: Ensure you have a recent database backup!
#

param(
    [Parameter(Mandatory=$false)]
    [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "║  EMERGENCY PRODUCTION DATABASE MIGRATION    ║" -ForegroundColor Red
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host ""
Write-Host "⚠️  WARNING: This will modify PRODUCTION database ⚠️" -ForegroundColor Yellow
Write-Host ""

# Check if DATABASE_URL is provided
if ([string]::IsNullOrEmpty($DatabaseUrl)) {
    Write-Host "Error: DATABASE_URL not provided" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\emergency-migrate-prod.ps1 -DatabaseUrl 'postgresql://user:pass@host:5432/easyescrow_prod'"
    Write-Host ""
    Write-Host "Or set environment variable:"
    Write-Host "  `$env:DATABASE_URL = 'postgresql://user:pass@host:5432/easyescrow_prod'"
    Write-Host "  .\emergency-migrate-prod.ps1"
    exit 1
}

# Show database URL (hide password)
Write-Host "Database URL:" -ForegroundColor Yellow
$maskedUrl = $DatabaseUrl -replace ':[^:]*@', ':****@'
Write-Host "  $maskedUrl"
Write-Host ""

$confirm = Read-Host "Is this the PRODUCTION database? (type 'yes' to continue)"
if ($confirm -ne "yes") {
    Write-Host "Migration cancelled" -ForegroundColor Red
    exit 1
}

# Backup confirmation
Write-Host ""
Write-Host "⚠️  DO YOU HAVE A RECENT BACKUP? ⚠️" -ForegroundColor Yellow
$backupConfirm = Read-Host "Confirm you have a backup (type 'yes' to continue)"
if ($backupConfirm -ne "yes") {
    Write-Host "Please create a backup first!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Create backup with:"
    Write-Host "  doctl databases backups list <db-id>"
    Write-Host "  # Or create manual backup in DO console"
    exit 1
}

# Set DATABASE_URL for child processes
$env:DATABASE_URL = $DatabaseUrl

# Test database connectivity
Write-Host ""
Write-Host "Step 1: Testing database connectivity..." -ForegroundColor Green
try {
    $result = & psql $DatabaseUrl -c "SELECT 1" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Connection failed"
    }
    Write-Host "✓ Database connection successful" -ForegroundColor Green
} catch {
    Write-Host "Error: Cannot connect to database" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:"
    Write-Host "  1. Verify DATABASE_URL is correct"
    Write-Host "  2. Check database is running"
    Write-Host "  3. Verify firewall rules allow your IP"
    Write-Host "  4. Install psql if not available"
    exit 1
}

# Check current migration status
Write-Host ""
Write-Host "Step 2: Checking current migration status..." -ForegroundColor Green
try {
    $migrationTableExists = & psql $DatabaseUrl -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations');" 2>&1
    $migrationTableExists = $migrationTableExists.Trim()
    
    if ($migrationTableExists -eq 't') {
        $appliedMigrations = & psql $DatabaseUrl -t -c "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" 2>&1
        $appliedMigrations = $appliedMigrations.Trim()
        Write-Host "✓ Found _prisma_migrations table" -ForegroundColor Green
        Write-Host "  Applied migrations: $appliedMigrations"
    } else {
        Write-Host "⚠️  No _prisma_migrations table found (first migration)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not check migration status (may be first run)" -ForegroundColor Yellow
}

# Install dependencies (if not already)
Write-Host ""
Write-Host "Step 3: Ensuring dependencies are installed..." -ForegroundColor Green
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error installing dependencies" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✓ Dependencies already installed" -ForegroundColor Green
}

# Generate Prisma client
Write-Host ""
Write-Host "Step 4: Generating Prisma client..." -ForegroundColor Green
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error generating Prisma client" -ForegroundColor Red
    exit 1
}

# Run migrations
Write-Host ""
Write-Host "Step 5: Running Prisma migrations..." -ForegroundColor Green
Write-Host "Executing: npx prisma migrate deploy" -ForegroundColor Yellow
Write-Host ""

npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Migration failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:"
    Write-Host "  1. Check migration SQL files in prisma/migrations/"
    Write-Host "  2. Review error messages above"
    Write-Host "  3. Check database permissions"
    Write-Host "  4. Verify schema.prisma is correct"
    exit 1
}

Write-Host ""
Write-Host "✅ Migrations completed successfully" -ForegroundColor Green

# Verify tables exist
Write-Host ""
Write-Host "Step 6: Verifying tables..." -ForegroundColor Green
try {
    $tableCount = & psql $DatabaseUrl -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>&1
    $tableCount = $tableCount.Trim()
    Write-Host "  Total tables: $tableCount"
    
    # List tables
    Write-Host ""
    Write-Host "Tables in database:"
    & psql $DatabaseUrl -c "\dt" 2>&1 | Where-Object { $_ -match "public" }
    
    # Verify specific critical tables
    Write-Host ""
    Write-Host "Verifying critical tables:"
    $tables = @("agreements", "deposits", "releases", "refunds", "transaction_logs", "nfts", "users", "receipts")
    
    foreach ($table in $tables) {
        $exists = & psql $DatabaseUrl -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');" 2>&1
        $exists = $exists.Trim()
        
        if ($exists -eq 't') {
            Write-Host "  ✓ $table" -ForegroundColor Green
        } else {
            Write-Host "  ✗ $table (MISSING)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "Could not verify tables" -ForegroundColor Yellow
    Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  MIGRATION COMPLETE                          ║" -ForegroundColor Green
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Verify application health: curl https://api.easyescrow.ai/health"
Write-Host "  2. Check application logs: doctl apps logs <app-id> --follow"
Write-Host "  3. Monitor for errors in production"
Write-Host ""














