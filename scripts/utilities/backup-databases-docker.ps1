<#
.SYNOPSIS
    Database Backup to S3 using Docker (for systems without pg_dump)

.DESCRIPTION
    Uses PostgreSQL Docker image to run pg_dump and create database backups

.PARAMETER Database
    Backup specific database by ID

.PARAMETER All
    Backup all databases

.EXAMPLE
    .\backup-databases-docker.ps1 -All
#>

param(
    [string]$Database,
    [switch]$All
)

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      Database Backup to S3 (Docker)                       ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check for Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker is not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please either:" -ForegroundColor Yellow
    Write-Host "  1. Install Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    Write-Host "  2. Install PostgreSQL client tools: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Check if Docker is running
try {
    docker ps | Out-Null
} catch {
    Write-Host "❌ Docker is not running" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "✅ Docker is available" -ForegroundColor Green
Write-Host ""

# Pull PostgreSQL image if not present
Write-Host "Checking for PostgreSQL Docker image..." -ForegroundColor Cyan
docker pull postgres:15-alpine | Out-Null
Write-Host "✅ PostgreSQL image ready" -ForegroundColor Green
Write-Host ""

# Load environment variables
if (-not (Test-Path ".env.production")) {
    Write-Host "❌ .env.production file not found" -ForegroundColor Red
    exit 1
}

# Parse database IDs from .env.production
$envContent = Get-Content ".env.production"
$prodDbId = ($envContent | Where-Object { $_ -match "^PROD_DATABASE_ID=" }) -replace "PROD_DATABASE_ID=", ""
$stagingDbId = ($envContent | Where-Object { $_ -match "^STAGING_DATABASE_ID=" }) -replace "STAGING_DATABASE_ID=", ""

if (-not $prodDbId) { $prodDbId = "b0f97f57-f399-4727-8abf-dc741cc9a5d2" }
if (-not $stagingDbId) { $stagingDbId = "c172d515-f258-412a-b8e8-6e821eb953be" }

# Get database details from DigitalOcean API
$doToken = ($envContent | Where-Object { $_ -match "^DIGITAL_OCEAN_API_KEY=" }) -replace "DIGITAL_OCEAN_API_KEY=", ""

if (-not $doToken) {
    Write-Host "❌ DIGITAL_OCEAN_API_KEY not found in .env.production" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $doToken"
    "Content-Type" = "application/json"
}

function Backup-Database {
    param($dbId)
    
    Write-Host "📡 Fetching database details for $dbId..." -ForegroundColor Cyan
    
    try {
        $dbInfo = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/databases/$dbId" -Headers $headers -Method Get
        $db = $dbInfo.database
        
        Write-Host "  • Name: $($db.name)" -ForegroundColor White
        Write-Host "  • Engine: $($db.engine) $($db.version)" -ForegroundColor White
        Write-Host ""
        
        # Get connection details
        $conn = $db.connection
        
        # Create output directory
        $outputDir = "temp\db-backups"
        if (-not (Test-Path $outputDir)) {
            New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
        }
        
        # Generate filename
        $timestamp = (Get-Date).ToString("yyyy-MM-ddTHH-mm-ss")
        $filename = "$($db.name)-$timestamp.dump"
        $outputPath = Join-Path $outputDir $filename
        
        Write-Host "📦 Creating database dump using Docker..." -ForegroundColor Cyan
        Write-Host "   This may take a few minutes..." -ForegroundColor Yellow
        Write-Host ""
        
        # Run pg_dump in Docker container with environment variables (safer than connection URL)
        # This prevents shell injection and handles special characters in passwords
        $absolutePath = (Resolve-Path $outputDir).Path
        docker run --rm `
            -e PGHOST=$($conn.host) `
            -e PGPORT=$($conn.port) `
            -e PGDATABASE=$($conn.database) `
            -e PGUSER=$($conn.user) `
            -e PGPASSWORD=$($conn.password) `
            -e PGSSLMODE=require `
            -v "${absolutePath}:/backup" `
            postgres:15-alpine `
            pg_dump -Fc -Z1 -f "/backup/$filename"
        
        if ($LASTEXITCODE -eq 0) {
            $fileSize = (Get-Item $outputPath).Length / 1MB
            Write-Host "   ✅ Dump created: $([math]::Round($fileSize, 2))MB" -ForegroundColor Green
            Write-Host "   📁 Location: $outputPath" -ForegroundColor White
            Write-Host ""
            
            # TODO: Upload to S3 (would need AWS CLI or SDK in Docker)
            Write-Host "   ⚠️  S3 upload not yet implemented in Docker version" -ForegroundColor Yellow
            Write-Host "   💡 Tip: Use AWS CLI to upload manually:" -ForegroundColor Cyan
            Write-Host "      aws s3 cp `"$outputPath`" s3://easyescrow-backups/database-backups/" -ForegroundColor Gray
            Write-Host ""
            
            return $true
        } else {
            Write-Host "   ❌ Failed to create dump" -ForegroundColor Red
            return $false
        }
        
    } catch {
        Write-Host "❌ Error: $_" -ForegroundColor Red
        return $false
    }
}

# Execute backups
$success = 0
$failed = 0

if ($All) {
    Write-Host "Backing up Production database..." -ForegroundColor Cyan
    if (Backup-Database $prodDbId) { $success++ } else { $failed++ }
    
    Write-Host "Backing up Staging database..." -ForegroundColor Cyan
    if (Backup-Database $stagingDbId) { $success++ } else { $failed++ }
} elseif ($Database) {
    if (Backup-Database $Database) { $success++ } else { $failed++ }
} else {
    Write-Host "❌ Error: Must specify either -All or -Database <id>" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    Backup Summary                          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Databases: $success succeeded, $failed failed" -ForegroundColor White
Write-Host "Timestamp: $(Get-Date -Format 'o')" -ForegroundColor White
Write-Host ""
Write-Host "📁 Backups saved to: temp\db-backups\" -ForegroundColor Cyan
Write-Host ""

if ($failed -gt 0) {
    exit 1
}

