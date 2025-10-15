# Quick Deployment Wrapper - Delegates to main deployment script
# This provides a simple interface for common deployment scenarios

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "staging", "production")]
    [string]$Environment = "dev",
    
    [switch]$Production = $false,
    
    [switch]$Staging = $false,
    
    [switch]$NoDevnetSecrets = $false,
    
    [switch]$DryRun = $false
)

# Determine environment from flags
if ($Production) {
    $Environment = "production"
} elseif ($Staging) {
    $Environment = "staging"
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Easy Escrow - DigitalOcean Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Build arguments for main deployment script
$deployArgs = @{
    Environment = $Environment
}

if ($NoDevnetSecrets) {
    $deployArgs.SkipDevnetSecrets = $true
}

if ($DryRun) {
    $deployArgs.DryRun = $true
}

# Call main deployment script
$mainScriptPath = Join-Path $PSScriptRoot "digitalocean\deploy.ps1"

if (Test-Path $mainScriptPath) {
    & $mainScriptPath @deployArgs
} else {
    Write-Host "❌ Main deployment script not found: $mainScriptPath" -ForegroundColor Red
    exit 1
}

