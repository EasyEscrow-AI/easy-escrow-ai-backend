<#
.SYNOPSIS
    Database Backup to S3 Utility (PowerShell Wrapper)

.DESCRIPTION
    Creates actual PostgreSQL dumps and uploads them to AWS S3

.PARAMETER Database
    Backup specific database by ID (comma-separated for multiple)

.PARAMETER All
    Backup all databases

.PARAMETER DryRun
    Show what would be backed up without executing

.PARAMETER Compression
    Compression level 1-9 (default: 1 for fastest)

.PARAMETER OutputDir
    Local temp directory (default: temp/db-backups)

.PARAMETER S3Prefix
    Custom S3 path prefix (default: database-backups/YYYY/MM/DD)

.EXAMPLE
    .\backup-databases-to-s3.ps1 -All
    Backup all databases to S3

.EXAMPLE
    .\backup-databases-to-s3.ps1 -Database "b0f97f57-f399-4727-8abf-dc741cc9a5d2"
    Backup specific database to S3

.EXAMPLE
    .\backup-databases-to-s3.ps1 -All -DryRun
    Preview what would be backed up

.EXAMPLE
    .\backup-databases-to-s3.ps1 -All -Compression 3
    Backup with higher compression (slower but smaller files)
#>

param(
    [Parameter(HelpMessage = "Database ID(s) to backup (comma-separated)")]
    [string]$Database,

    [Parameter(HelpMessage = "Backup all databases")]
    [switch]$All,

    [Parameter(HelpMessage = "Dry run mode - show what would be backed up")]
    [switch]$DryRun,

    [Parameter(HelpMessage = "Compression level 1-9 (default: 1)")]
    [ValidateRange(1, 9)]
    [int]$Compression = 1,

    [Parameter(HelpMessage = "Output directory for temporary files")]
    [string]$OutputDir = "temp/db-backups",

    [Parameter(HelpMessage = "Custom S3 path prefix")]
    [string]$S3Prefix
)

# Colors
$ErrorColor = "Red"
$WarningColor = "Yellow"
$SuccessColor = "Green"
$InfoColor = "Cyan"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor $InfoColor
Write-Host "║      Database Backup to S3 Utility (PowerShell)           ║" -ForegroundColor $InfoColor
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor $InfoColor
Write-Host ""

# Check for required executables
$requiredTools = @("node", "npx", "pg_dump")
$missingTools = @()

foreach ($tool in $requiredTools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        $missingTools += $tool
    }
}

if ($missingTools.Count -gt 0) {
    Write-Host "❌ Missing required tools: $($missingTools -join ', ')" -ForegroundColor $ErrorColor
    Write-Host ""
    Write-Host "Installation instructions:" -ForegroundColor $WarningColor
    if ($missingTools -contains "pg_dump") {
        Write-Host "  • PostgreSQL Client Tools: https://www.postgresql.org/download/" -ForegroundColor $WarningColor
    }
    if ($missingTools -contains "node" -or $missingTools -contains "npx") {
        Write-Host "  • Node.js: https://nodejs.org/" -ForegroundColor $WarningColor
    }
    Write-Host ""
    exit 1
}

# Check for .env file
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Warning: .env file not found" -ForegroundColor $WarningColor
    Write-Host "Make sure environment variables are set:" -ForegroundColor $WarningColor
    Write-Host "  • DIGITAL_OCEAN_API_KEY" -ForegroundColor $WarningColor
    Write-Host "  • AWS_S3_BUCKET" -ForegroundColor $WarningColor
    Write-Host "  • AWS_S3_KEY" -ForegroundColor $WarningColor
    Write-Host "  • AWS_S3_SECRET" -ForegroundColor $WarningColor
    Write-Host ""
}

# Build command arguments
$tsArgs = @()

if ($Database) {
    $tsArgs += "--database"
    $tsArgs += $Database
}

if ($All) {
    $tsArgs += "--all"
}

if ($DryRun) {
    $tsArgs += "--dry-run"
}

if ($Compression -ne 1) {
    $tsArgs += "--compression"
    $tsArgs += $Compression.ToString()
}

if ($OutputDir -ne "temp/db-backups") {
    $tsArgs += "--output-dir"
    $tsArgs += $OutputDir
}

if ($S3Prefix) {
    $tsArgs += "--s3-prefix"
    $tsArgs += $S3Prefix
}

# Validate options
if (-not $All -and -not $Database) {
    Write-Host "❌ Error: Must specify either -All or -Database <id>" -ForegroundColor $ErrorColor
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor $InfoColor
    Write-Host "  .\backup-databases-to-s3.ps1 -All" -ForegroundColor $InfoColor
    Write-Host "  .\backup-databases-to-s3.ps1 -Database 'b0f97f57-f399-4727-8abf-dc741cc9a5d2'" -ForegroundColor $InfoColor
    Write-Host ""
    exit 1
}

# Execute backup
Write-Host "🚀 Starting database backup..." -ForegroundColor $InfoColor
Write-Host ""

$scriptPath = "scripts/utilities/backup-databases-to-s3.ts"
$command = "npx ts-node $scriptPath $($tsArgs -join ' ')"

Write-Host "Command: $command" -ForegroundColor Gray
Write-Host ""

try {
    Invoke-Expression $command
    $exitCode = $LASTEXITCODE

    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "✅ Backup completed successfully!" -ForegroundColor $SuccessColor
    } else {
        Write-Host "❌ Backup failed with exit code: $exitCode" -ForegroundColor $ErrorColor
    }
    Write-Host ""

    exit $exitCode
} catch {
    Write-Host ""
    Write-Host "❌ Fatal error: $_" -ForegroundColor $ErrorColor
    Write-Host ""
    exit 1
}

