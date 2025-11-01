#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Grant database permissions to staging_user for migrations

.DESCRIPTION
    This script grants all necessary permissions to staging_user so that
    Prisma migrations can run via the PRE_DEPLOY job in DigitalOcean.

.PARAMETER AdminUrl
    Optional: PostgreSQL admin connection string (doadmin user)
    If not provided, reads from DATABASE_ADMIN_URL environment variable

.EXAMPLE
    .\setup-staging-permissions.ps1
    
.EXAMPLE
    .\setup-staging-permissions.ps1 -AdminUrl "postgresql://doadmin:pass@host:25060/easyescrow_staging"

.NOTES
    Requires: psql (PostgreSQL client) in PATH
    Run this ONCE after creating the staging database
#>

param(
    [string]$AdminUrl = $env:DATABASE_ADMIN_URL
)

# Colors for output
function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Error { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Info { Write-Host "ℹ️  $args" -ForegroundColor Cyan }
function Write-Step { Write-Host "🔧 $args" -ForegroundColor Yellow }

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Staging Database Permissions Setup" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if psql is available
try {
    $null = Get-Command psql -ErrorAction Stop
} catch {
    Write-Error "psql not found in PATH"
    Write-Info "Install PostgreSQL client:"
    Write-Info "  - Windows: https://www.postgresql.org/download/windows/"
    Write-Info "  - Or via scoop: scoop install postgresql"
    exit 1
}

# Get admin connection string
if (-not $AdminUrl) {
    Write-Error "DATABASE_ADMIN_URL not found"
    Write-Info "Please provide admin connection string:"
    Write-Info ""
    Write-Info "Option 1: Set environment variable:"
    Write-Info '  $env:DATABASE_ADMIN_URL = "postgresql://doadmin:pass@host:25060/easyescrow_staging"'
    Write-Info '  .\setup-staging-permissions.ps1'
    Write-Info ""
    Write-Info "Option 2: Pass as parameter:"
    Write-Info '  .\setup-staging-permissions.ps1 -AdminUrl "postgresql://..."'
    Write-Info ""
    Write-Info "Option 3: Create .env.staging file with:"
    Write-Info '  DATABASE_ADMIN_URL=postgresql://doadmin:pass@host:25060/easyescrow_staging'
    exit 1
}

Write-Info "Using admin connection string"
Write-Info "Connection: $(($AdminUrl -split '@')[1] -split '/')[0]"
Write-Host ""

# SQL commands to grant permissions
$sqlCommands = @"
-- Grant schema permissions to staging_user
DO
\$\$
BEGIN
    RAISE NOTICE '🔧 Granting permissions to staging_user...';
END
\$\$;

-- Grant all privileges on schema
GRANT ALL PRIVILEGES ON SCHEMA public TO staging_user;
GRANT CREATE ON SCHEMA public TO staging_user;

-- Grant all privileges on existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;

-- Grant all privileges on existing sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO staging_user;

-- Also grant on future functions (for stored procedures)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO staging_user;

-- Grant on database itself
GRANT CONNECT ON DATABASE easyescrow_staging TO staging_user;

DO
\$\$
BEGIN
    RAISE NOTICE '✅ Permissions granted successfully';
END
\$\$;

-- Verify permissions
\echo ''
\echo '📋 Current permissions for staging_user:'
SELECT 
    nspname as schema,
    CASE 
        WHEN has_schema_privilege('staging_user', nspname, 'USAGE') THEN '✅ USAGE'
        ELSE '❌ USAGE'
    END as usage,
    CASE 
        WHEN has_schema_privilege('staging_user', nspname, 'CREATE') THEN '✅ CREATE'
        ELSE '❌ CREATE'
    END as create
FROM pg_namespace 
WHERE nspname = 'public';
"@

Write-Step "Granting permissions to staging_user..."
Write-Host ""

# Execute SQL commands
try {
    $sqlCommands | psql $AdminUrl -v ON_ERROR_STOP=1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Success "Permissions granted successfully!"
        Write-Host ""
        Write-Info "Next steps:"
        Write-Info "1. Trigger a new deployment:"
        Write-Info "   doctl apps create-deployment ea13cdbb-c74e-40da-a0eb-6c05b0d0432d"
        Write-Info ""
        Write-Info "2. Or wait for next git push to staging branch"
        Write-Info ""
        Write-Info "3. The PRE_DEPLOY migration job will now succeed! ✅"
        Write-Host ""
    } else {
        Write-Error "Failed to grant permissions (exit code: $LASTEXITCODE)"
        exit 1
    }
} catch {
    Write-Error "Error executing SQL: $_"
    Write-Info ""
    Write-Info "Troubleshooting:"
    Write-Info "1. Verify admin connection string is correct"
    Write-Info "2. Check that you're using doadmin user (has all privileges)"
    Write-Info "3. Ensure database name is 'easyescrow_staging'"
    exit 1
}

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

