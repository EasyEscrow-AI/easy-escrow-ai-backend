# ============================================
# Production Database Migration Script (PowerShell)
# Runs Prisma migrations using migrate_user
# ============================================

param(
    [Parameter(Position=0)]
    [ValidateSet('prod', 'stage', 'dev')]
    [string]$Environment = 'prod'
)

$ErrorActionPreference = "Stop"

# ============================================
# Configuration
# ============================================

Write-Host "========================================" -ForegroundColor Green
Write-Host "EasyEscrow.ai Database Migration" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# ============================================
# Check for Migration User Credentials
# ============================================

$migrateVarName = "MIGRATE_DATABASE_URL_$($Environment.ToUpper())"
$migrateUrl = [System.Environment]::GetEnvironmentVariable($migrateVarName)

if ([string]::IsNullOrEmpty($migrateUrl)) {
    Write-Host "Error: $migrateVarName environment variable not set" -ForegroundColor Red
    Write-Host ""
    Write-Host "Set it like:"
    Write-Host "`$env:$migrateVarName = 'postgresql://migrate_user_$Environment`:PASSWORD@HOST:25060/easyescrow_$Environment`?sslmode=require'"
    exit 1
}

# ============================================
# Backup Check (Production only)
# ============================================

if ($Environment -eq 'prod') {
    Write-Host "⚠️  Running migration on PRODUCTION" -ForegroundColor Yellow
    Write-Host "Please ensure you have a recent backup!" -ForegroundColor Yellow
    Write-Host ""
    
    $confirm = Read-Host "Do you have a recent backup? (yes/no)"
    
    if ($confirm -ne 'yes') {
        Write-Host "Migration cancelled. Please create a backup first." -ForegroundColor Red
        exit 1
    }
}

# ============================================
# Pre-Migration Checks
# ============================================

Write-Host ""
Write-Host "Step 1: Pre-Migration Checks" -ForegroundColor Green

# Test database connectivity
Write-Host "Testing database connectivity..."
try {
    $null = & psql $migrateUrl -c "SELECT 1" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Connection failed"
    }
    Write-Host "✓ Database connection successful" -ForegroundColor Green
} catch {
    Write-Host "Error: Cannot connect to database" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# Check migration user permissions
Write-Host "Checking migration user permissions..."
try {
    $hasCreate = & psql $migrateUrl -t -c "SELECT has_schema_privilege('public', 'CREATE');" 2>&1 | Out-String
    $hasCreate = $hasCreate.Trim()
    
    if ($hasCreate -ne 't') {
        throw "No CREATE permission"
    }
    Write-Host "✓ Migration user has correct permissions" -ForegroundColor Green
} catch {
    Write-Host "Error: Migration user doesn't have CREATE permission" -ForegroundColor Red
    exit 1
}

# ============================================
# Run Prisma Migration
# ============================================

Write-Host ""
Write-Host "Step 2: Running Prisma Migration" -ForegroundColor Green

# Set DATABASE_URL for Prisma
$env:DATABASE_URL = $migrateUrl

# Run migration deploy
Write-Host "Executing: npx prisma migrate deploy"
try {
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        throw "Migration failed with exit code $LASTEXITCODE"
    }
    Write-Host "✓ Migration completed successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Migration failed" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# ============================================
# Post-Migration Verification
# ============================================

Write-Host ""
Write-Host "Step 3: Post-Migration Verification" -ForegroundColor Green

# Count tables
$tableCount = & psql $migrateUrl -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>&1 | Out-String
$tableCount = $tableCount.Trim()
Write-Host "Tables in database: $tableCount"

if ([int]$tableCount -eq 0) {
    Write-Host "⚠️  Warning: No tables found after migration" -ForegroundColor Yellow
}

# Check migration history
Write-Host "Checking migration history..."
$migrationCount = & psql $migrateUrl -t -c "SELECT COUNT(*) FROM _prisma_migrations;" 2>&1 | Out-String
$migrationCount = $migrationCount.Trim()
Write-Host "Applied migrations: $migrationCount"

# ============================================
# Update App User Permissions
# ============================================

Write-Host ""
Write-Host "Step 4: Refreshing App User Permissions" -ForegroundColor Green

$appUser = "app_user_$Environment"
$null = & psql $migrateUrl -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $appUser;" 2>&1
$null = & psql $migrateUrl -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $appUser;" 2>&1

Write-Host "✓ App user permissions refreshed" -ForegroundColor Green

# ============================================
# Summary
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Migration Summary" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Environment: $Environment"
Write-Host "Tables: $tableCount"
Write-Host "Migrations Applied: $migrationCount"
Write-Host "Status: SUCCESS ✓" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# ============================================
# Next Steps
# ============================================

Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Test the application with the new schema"
Write-Host "2. Monitor application logs for errors"
Write-Host "3. Verify data integrity"

if ($Environment -eq 'prod') {
    Write-Host "4. Monitor production metrics closely"
}

exit 0

