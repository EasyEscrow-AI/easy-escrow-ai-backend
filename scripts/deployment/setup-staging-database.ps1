# ============================================================================
# EasyEscrow Staging Database Setup Script (PowerShell)
# ============================================================================
# This script automates the setup of the staging database infrastructure
# within the DigitalOcean Managed PostgreSQL cluster.
#
# Prerequisites:
#   - psql client installed and available in PATH
#   - Admin credentials for DigitalOcean PostgreSQL cluster
#   - PowerShell 5.1 or higher
#
# Usage:
#   .\setup-staging-database.ps1
# ============================================================================

param(
    [string]$DbHost = "",
    [string]$Port = "25060",
    [string]$AdminUser = "doadmin",
    [string]$AdminPassword = "",
    [string]$StagingPassword = "",
    [switch]$SkipConfirmation,
    [switch]$Help
)

# Display help
if ($Help) {
    Write-Host @"
EasyEscrow Staging Database Setup Script

Usage:
  .\setup-staging-database.ps1 [options]

Options:
  -DbHost <string>            PostgreSQL cluster host
  -Port <string>              PostgreSQL cluster port (default: 25060)
  -AdminUser <string>         Admin username (default: doadmin)
  -AdminPassword <string>     Admin password (prompted if not provided)
  -StagingPassword <string>   Staging user password (generated if not provided)
  -SkipConfirmation           Skip confirmation prompts
  -Help                       Display this help message

Examples:
  # Interactive setup (prompts for passwords)
  .\setup-staging-database.ps1

  # Automated setup with all parameters
  .\setup-staging-database.ps1 -DbHost "cluster.db.ondigitalocean.com" -AdminPassword "admin_pass" -StagingPassword "staging_pass" -SkipConfirmation

"@
    exit 0
}

# Function to generate a secure random password
function Generate-SecurePassword {
    param([int]$Length = 32)
    
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?'
    $password = -join ((1..$Length) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    return $password
}

# Function to check if psql is installed
function Test-PsqlInstalled {
    try {
        $null = Get-Command psql -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# Main script
Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "     EasyEscrow Staging Database Setup" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if psql is installed
if (-not (Test-PsqlInstalled)) {
    Write-Host "❌ Error: psql client is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install PostgreSQL client tools:" -ForegroundColor Yellow
    Write-Host "  Windows: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    Write-Host "  Or use: choco install postgresql" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "✅ psql client found" -ForegroundColor Green
Write-Host ""

# Get host if not provided
if (-not $DbHost) {
    Write-Host "📝 Enter your DigitalOcean PostgreSQL cluster details:" -ForegroundColor Cyan
    Write-Host ""
    $DbHost = Read-Host "  Cluster host (e.g., your-cluster.db.ondigitalocean.com)"
}

# Get admin password if not provided
if (-not $AdminPassword) {
    Write-Host ""
    $AdminPasswordSecure = Read-Host "  Admin password ($AdminUser)" -AsSecureString
    $AdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminPasswordSecure)
    )
}

# Generate or get staging password
if (-not $StagingPassword) {
    Write-Host ""
    Write-Host "🔐 Generating secure staging user password..." -ForegroundColor Cyan
    $StagingPassword = Generate-SecurePassword -Length 32
    Write-Host "✅ Password generated (will be displayed at the end)" -ForegroundColor Green
}

# Confirmation
if (-not $SkipConfirmation) {
    Write-Host ""
    Write-Host "============================================================================" -ForegroundColor Yellow
    Write-Host "⚠️  CONFIRMATION" -ForegroundColor Yellow
    Write-Host "============================================================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This script will:" -ForegroundColor Yellow
    Write-Host "  1. Create database: easyescrow_staging" -ForegroundColor Yellow
    Write-Host "  2. Create user: staging_user" -ForegroundColor Yellow
    Write-Host "  3. Grant appropriate permissions" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Target cluster: $DbHost" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Do you want to continue? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "❌ Setup cancelled" -ForegroundColor Red
        exit 1
    }
}

# Create SQL script with password substitution
Write-Host ""
Write-Host "📄 Preparing SQL script..." -ForegroundColor Cyan

# Escape single quotes in password for SQL safety (prevent SQL injection)
$escapedPassword = $StagingPassword -replace "'", "''"

$sqlScript = @"
-- Create Staging Database
CREATE DATABASE easyescrow_staging
  WITH 
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.UTF-8'
  LC_CTYPE = 'en_US.UTF-8'
  TEMPLATE = template0;

-- Create Staging User
-- Password is properly escaped to prevent SQL injection
CREATE USER staging_user WITH PASSWORD '$escapedPassword';

-- Grant Connection Privileges
GRANT CONNECT ON DATABASE easyescrow_staging TO staging_user;

-- Connect to Staging Database
\c easyescrow_staging

-- Grant Schema Privileges
GRANT USAGE ON SCHEMA public TO staging_user;
GRANT CREATE ON SCHEMA public TO staging_user;

-- Grant Table Privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO staging_user;

-- Set Default Privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO staging_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO staging_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON FUNCTIONS TO staging_user;

-- Verification
\l easyescrow_staging
\du staging_user
"@

$tempSqlFile = Join-Path $env:TEMP "staging-setup-$((Get-Date).Ticks).sql"
$sqlScript | Out-File -FilePath $tempSqlFile -Encoding UTF8

Write-Host "✅ SQL script prepared" -ForegroundColor Green

# Build connection string
$connectionString = "postgresql://${AdminUser}:${AdminPassword}@${DbHost}:${Port}/defaultdb?sslmode=require"

# Execute SQL script
Write-Host ""
Write-Host "🚀 Executing setup script..." -ForegroundColor Cyan
Write-Host ""

try {
    $env:PGPASSWORD = $AdminPassword
    psql $connectionString -f $tempSqlFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "============================================================================" -ForegroundColor Green
        Write-Host "✅ STAGING DATABASE SETUP COMPLETE" -ForegroundColor Green
        Write-Host "============================================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Database Details:" -ForegroundColor Cyan
        Write-Host "  Database Name: easyescrow_staging" -ForegroundColor White
        Write-Host "  User: staging_user" -ForegroundColor White
        Write-Host "  Password: $StagingPassword" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "⚠️  IMPORTANT: Save this password securely!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Connection Strings:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Direct (for migrations):" -ForegroundColor White
        Write-Host "  DATABASE_URL=`"postgresql://staging_user:${StagingPassword}@${DbHost}:${Port}/easyescrow_staging?sslmode=require`"" -ForegroundColor Gray
        Write-Host ""
        
        # Try to get pooler host (replace main host pattern)
        $poolerHost = $DbHost -replace '\.db\.', '-pooler.db.'
        Write-Host "Pooled (for application):" -ForegroundColor White
        Write-Host "  DATABASE_POOL_URL=`"postgresql://staging_user:${StagingPassword}@${poolerHost}:25061/easyescrow_staging?sslmode=require`"" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Cyan
        Write-Host "  1. Add DATABASE_URL to .env.staging" -ForegroundColor White
        Write-Host "  2. Add DATABASE_URL to DigitalOcean App Platform secrets" -ForegroundColor White
        Write-Host "  3. Run migrations: npx prisma migrate deploy" -ForegroundColor White
        Write-Host "  4. Seed staging data: npm run seed:staging" -ForegroundColor White
        Write-Host "  5. Test connection: npm run test:staging:db" -ForegroundColor White
        Write-Host ""
        Write-Host "Security Reminders:" -ForegroundColor Yellow
        Write-Host "  ❌ Do NOT commit passwords to Git" -ForegroundColor Yellow
        Write-Host "  ✅ Store passwords in DigitalOcean Secrets (encrypted)" -ForegroundColor Green
        Write-Host "  ✅ Always use sslmode=require for staging/production" -ForegroundColor Green
        Write-Host ""
        Write-Host "============================================================================" -ForegroundColor Green
        Write-Host ""
    } else {
        throw "psql command failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error executing setup script:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible causes:" -ForegroundColor Yellow
    Write-Host "  - Incorrect credentials" -ForegroundColor Yellow
    Write-Host "  - Network connectivity issues" -ForegroundColor Yellow
    Write-Host "  - Database already exists" -ForegroundColor Yellow
    Write-Host "  - User already exists" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Try running the SQL script manually:" -ForegroundColor Yellow
    Write-Host "  psql `"$connectionString`" -f $tempSqlFile" -ForegroundColor Gray
    Write-Host ""
    exit 1
} finally {
    # Clean up
    Remove-Item $tempSqlFile -ErrorAction SilentlyContinue
    $env:PGPASSWORD = $null
}

