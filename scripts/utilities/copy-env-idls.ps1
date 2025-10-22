#!/usr/bin/env pwsh
# Copy environment-specific IDL files to src/generated/anchor
# This should be run after generating IDLs with build-idl-for-env.ps1 or build-all-idls.ps1

$ErrorActionPreference = "Stop"

$PROJECT_ROOT = Resolve-Path "$PSScriptRoot/../.."
$IDL_SOURCE = "$PROJECT_ROOT/target/idl"
$IDL_DEST = "$PROJECT_ROOT/src/generated/anchor"

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Copying Environment-Specific IDLs to Generated Folder" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Ensure destination exists
if (-not (Test-Path $IDL_DEST)) {
    New-Item -ItemType Directory -Path $IDL_DEST -Force | Out-Null
}

# Copy each environment-specific IDL
$environments = @('dev', 'staging', 'production')
$copiedCount = 0

foreach ($env in $environments) {
    $sourceFile = "$IDL_SOURCE/escrow-$env.json"
    $destFile = "$IDL_DEST/escrow-idl-$env.json"
    
    if (Test-Path $sourceFile) {
        Copy-Item -Path $sourceFile -Destination $destFile -Force
        Write-Host "Copied: escrow-$env.json -> escrow-idl-$env.json" -ForegroundColor Green
        $copiedCount++
    } else {
        Write-Host "Skipped: escrow-$env.json (not found)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Copied $copiedCount IDL file(s)" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

