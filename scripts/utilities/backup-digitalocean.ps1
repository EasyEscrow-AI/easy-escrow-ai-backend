# PowerShell wrapper for DigitalOcean backup utility
# Provides easier command-line interface for Windows users

param(
    [Parameter(HelpMessage="Comma-separated list of app IDs to backup")]
    [string]$Apps,
    
    [Parameter(HelpMessage="Comma-separated list of database IDs to backup")]
    [string]$Databases,
    
    [Parameter(HelpMessage="Backup all App Platform apps")]
    [switch]$AllApps,
    
    [Parameter(HelpMessage="Backup all database clusters")]
    [switch]$AllDatabases,
    
    [Parameter(HelpMessage="Backup everything (apps and databases)")]
    [switch]$All,
    
    [Parameter(HelpMessage="List all resources without backing up")]
    [switch]$List,
    
    [Parameter(HelpMessage="Show what would be backed up without executing")]
    [switch]$DryRun,
    
    [Parameter(HelpMessage="Path to save backup metadata")]
    [string]$OutputPath = "temp/backup-metadata.json",
    
    [Parameter(HelpMessage="Upload backup metadata to AWS S3")]
    [switch]$S3,
    
    [Parameter(HelpMessage="Custom S3 path (default: backups/YYYY/MM/DD/backup-TIMESTAMP.json)")]
    [string]$S3Path,
    
    [Parameter(HelpMessage="Display help message")]
    [switch]$Help
)

# Display banner
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      DigitalOcean Backup Utility (PowerShell)             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Show help if requested
if ($Help) {
    Write-Host "PowerShell wrapper for DigitalOcean backup utility"
    Write-Host ""
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  .\backup-digitalocean.ps1 [options]"
    Write-Host ""
    Write-Host "OPTIONS:" -ForegroundColor Yellow
    Write-Host "  -Apps <ids>          Backup specific app(s) by ID (comma-separated)"
    Write-Host "  -Databases <ids>     Backup specific database(s) by ID (comma-separated)"
    Write-Host "  -AllApps             Backup all App Platform apps"
    Write-Host "  -AllDatabases        Backup all database clusters"
    Write-Host "  -All                 Backup everything (apps and databases)"
    Write-Host "  -List                List all resources without backing up"
    Write-Host "  -DryRun              Show what would be backed up without executing"
    Write-Host "  -OutputPath <path>   Path to save backup metadata (default: temp/backup-metadata.json)"
    Write-Host "  -S3                  Upload backup metadata to AWS S3"
    Write-Host "  -S3Path <path>       Custom S3 path (default: backups/YYYY/MM/DD/backup-TIMESTAMP.json)"
    Write-Host "  -Help                Display this help message"
    Write-Host ""
    Write-Host "EXAMPLES:" -ForegroundColor Yellow
    Write-Host "  # List all resources"
    Write-Host "  .\backup-digitalocean.ps1 -List" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Backup specific app"
    Write-Host "  .\backup-digitalocean.ps1 -Apps 'abc123def456'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Backup all apps (dry run)"
    Write-Host "  .\backup-digitalocean.ps1 -AllApps -DryRun" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Backup everything"
    Write-Host "  .\backup-digitalocean.ps1 -All" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Backup specific app and database"
    Write-Host "  .\backup-digitalocean.ps1 -Apps 'abc123' -Databases 'xyz789'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Backup everything and upload to S3"
    Write-Host "  .\backup-digitalocean.ps1 -All -S3" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Backup with custom S3 path"
    Write-Host "  .\backup-digitalocean.ps1 -All -S3 -S3Path 'production/backup-20251103.json'" -ForegroundColor Gray
    Write-Host ""
    exit 0
}

# Check for API key
if (-not $env:DIGITAL_OCEAN_API_KEY) {
    Write-Host "❌ ERROR: DIGITAL_OCEAN_API_KEY environment variable not set" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set the API key in one of the following ways:" -ForegroundColor Yellow
    Write-Host "  1. In your .env file: DIGITAL_OCEAN_API_KEY=your_key_here"
    Write-Host "  2. As an environment variable: `$env:DIGITAL_OCEAN_API_KEY='your_key_here'"
    Write-Host ""
    Write-Host "Get your API key from: https://cloud.digitalocean.com/account/api/tokens" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Build TypeScript command arguments
$tsArgs = @()

if ($Apps) {
    $tsArgs += "--app"
    $tsArgs += $Apps
}

if ($Databases) {
    $tsArgs += "--database"
    $tsArgs += $Databases
}

if ($AllApps) {
    $tsArgs += "--all-apps"
}

if ($AllDatabases) {
    $tsArgs += "--all-databases"
}

if ($All) {
    $tsArgs += "--all"
}

if ($List) {
    $tsArgs += "--list"
}

if ($DryRun) {
    $tsArgs += "--dry-run"
}

if ($OutputPath) {
    $tsArgs += "--output"
    $tsArgs += $OutputPath
}

if ($S3) {
    $tsArgs += "--s3"
}

if ($S3Path) {
    $tsArgs += "--s3-path"
    $tsArgs += $S3Path
}

# Get script directory and navigate to project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Join-Path $scriptDir ".." | Join-Path -ChildPath ".." | Resolve-Path

Push-Location $projectRoot

try {
    # Check if ts-node is available
    $tsNodeCheck = Get-Command ts-node -ErrorAction SilentlyContinue
    if (-not $tsNodeCheck) {
        Write-Host "❌ ERROR: ts-node not found" -ForegroundColor Red
        Write-Host "Install it with: npm install -g ts-node" -ForegroundColor Yellow
        Write-Host "Or run: npx ts-node scripts/utilities/backup-digitalocean.ts $($tsArgs -join ' ')" -ForegroundColor Cyan
        exit 1
    }

    # Execute TypeScript script
    Write-Host "🚀 Executing backup utility..." -ForegroundColor Green
    Write-Host ""
    
    $tsScriptPath = "scripts/utilities/backup-digitalocean.ts"
    
    if ($tsArgs.Count -gt 0) {
        & ts-node $tsScriptPath $tsArgs
    } else {
        & ts-node $tsScriptPath
    }
    
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "✅ Backup completed successfully" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "❌ Backup failed with exit code: $exitCode" -ForegroundColor Red
        Write-Host ""
    }
    
    exit $exitCode
} catch {
    Write-Host ""
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    exit 1
} finally {
    Pop-Location
}

