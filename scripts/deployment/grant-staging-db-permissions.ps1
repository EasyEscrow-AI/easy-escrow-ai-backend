# Grant Database Permissions to staging_user
# This fixes the "permission denied for table agreements" error

param(
    [Parameter(Mandatory=$false)]
    [string]$AdminConnectionString
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Grant Database Permissions to staging_user" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# If connection string not provided, try to get it from DigitalOcean
if (-not $AdminConnectionString) {
    Write-Host "[INFO] Getting database connection info from DigitalOcean..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please provide the doadmin connection string." -ForegroundColor Yellow
    Write-Host "Get it from: DigitalOcean Console → Databases → Your DB → Connection Details" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Format: postgresql://doadmin:PASSWORD@HOST:PORT/easyescrow_staging?sslmode=require" -ForegroundColor Gray
    Write-Host ""
    $AdminConnectionString = Read-Host "Enter doadmin connection string"
}

# Validate connection string
if (-not $AdminConnectionString) {
    Write-Host "[ERROR] Connection string is required" -ForegroundColor Red
    exit 1
}

# Make sure it's connecting to easyescrow_staging
if ($AdminConnectionString -notmatch 'easyescrow_staging') {
    Write-Host "[WARN] Connection string doesn't contain 'easyescrow_staging'" -ForegroundColor Yellow
    Write-Host "       Make sure you're connecting to the correct database" -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne 'y') {
        Write-Host "[INFO] Cancelled" -ForegroundColor Yellow
        exit 0
    }
}

Write-Host "[INFO] Connecting to database..." -ForegroundColor Yellow

# Create SQL script
$sqlScript = @"
-- Grant all permissions to staging_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO staging_user;
GRANT USAGE ON SCHEMA public TO staging_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO staging_user;

-- Verify permissions (this will show the permissions for agreements table)
\dp agreements

-- Show success message
SELECT 'Permissions granted successfully!' as status;
"@

# Save SQL to temp file
$tempSqlFile = "temp-grant-permissions.sql"
$sqlScript | Out-File -FilePath $tempSqlFile -Encoding UTF8

try {
    Write-Host "[INFO] Executing SQL commands..." -ForegroundColor Yellow
    Write-Host ""
    
    # Execute SQL using psql
    $output = psql $AdminConnectionString -f $tempSqlFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[SUCCESS] Permissions granted!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Output:" -ForegroundColor Cyan
        Write-Host $output
        Write-Host ""
        Write-Host "[SUCCESS] staging_user now has full access to all tables" -ForegroundColor Green
        Write-Host ""
        Write-Host "The staging app should automatically retry and connect successfully." -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "[ERROR] Failed to execute SQL:" -ForegroundColor Red
        Write-Host $output
        exit 1
    }
    
} catch {
    Write-Host "[ERROR] Failed to connect or execute SQL:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "Make sure:" -ForegroundColor Yellow
    Write-Host "  1. psql is installed and in your PATH" -ForegroundColor White
    Write-Host "  2. Connection string is correct" -ForegroundColor White
    Write-Host "  3. You can reach the database from your network" -ForegroundColor White
    exit 1
} finally {
    # Clean up temp file
    if (Test-Path $tempSqlFile) {
        Remove-Item $tempSqlFile
    }
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Database Permissions Fixed!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Monitor app logs: doctl apps logs ea13cdbb-c74e-40da-a0eb-6c05b0d0432d --follow" -ForegroundColor White
Write-Host "  2. Look for: '[MonitoringService] Loaded X pending agreements'" -ForegroundColor White
Write-Host "  3. The monitoring service should start within 5-10 seconds" -ForegroundColor White
Write-Host ""

