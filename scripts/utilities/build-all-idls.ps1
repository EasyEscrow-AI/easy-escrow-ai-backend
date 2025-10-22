#!/usr/bin/env pwsh
# Build IDL files for all environments

$ErrorActionPreference = "Stop"

$PROJECT_ROOT = Resolve-Path "$PSScriptRoot/../.."
$SCRIPT_PATH = "$PSScriptRoot/build-idl-for-env.ps1"

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Building IDL Files for All Environments" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

$environments = @('dev', 'staging')  # Add 'production' when ready

foreach ($env in $environments) {
    Write-Host "Building IDL for: $($env.ToUpper())" -ForegroundColor Yellow
    Write-Host ""
    
    & $SCRIPT_PATH -Environment $env
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Failed to build IDL for $env" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "All IDL Files Generated Successfully!" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Generated files in target/idl/:" -ForegroundColor Yellow

$idlDir = Join-Path $PROJECT_ROOT "target\idl"
$idlFiles = Get-ChildItem -Path $idlDir -Filter "escrow-*.json" -ErrorAction SilentlyContinue
if ($idlFiles) {
    foreach ($file in $idlFiles) {
        Write-Host "  - $($file.Name)" -ForegroundColor Cyan
    }
}

Write-Host ""
