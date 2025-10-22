#!/usr/bin/env pwsh
# Copy existing IDL and create environment-specific version
# Usage: .\copy-idl-for-env.ps1 -Environment staging -ProgramId AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('dev', 'staging', 'production')]
    [string]$Environment,
    
    [Parameter(Mandatory=$true)]
    [string]$ProgramId
)

$ErrorActionPreference = "Stop"

$PROJECT_ROOT = Resolve-Path "$PSScriptRoot/../.."
$IDL_DIR = "$PROJECT_ROOT/target/idl"
$SOURCE_IDL = "$IDL_DIR/escrow.json"

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Creating Environment-Specific IDL: $($Environment.ToUpper())" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if source IDL exists
if (-not (Test-Path $SOURCE_IDL)) {
    Write-Host "Error: Source IDL not found: $SOURCE_IDL" -ForegroundColor Red
    exit 1
}

# Read the IDL
$idlContent = Get-Content $SOURCE_IDL -Raw | ConvertFrom-Json
$currentProgramId = $idlContent.address

Write-Host "Current IDL Program ID: $currentProgramId" -ForegroundColor Yellow
Write-Host "Target Program ID: $ProgramId" -ForegroundColor Yellow
Write-Host ""

# Update the program ID
$idlContent.address = $ProgramId

# Save to environment-specific file
$targetIdl = "$IDL_DIR/escrow-$Environment.json"
$idlContent | ConvertTo-Json -Depth 100 | Set-Content $targetIdl

Write-Host "Created: target/idl/escrow-$Environment.json" -ForegroundColor Green

# Create metadata file
$metadata = @{
    environment = $Environment
    programId = $ProgramId
    generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
    originalProgramId = $currentProgramId
}

$metadataFile = "$IDL_DIR/escrow-$Environment.metadata.json"
$metadata | ConvertTo-Json -Depth 10 | Set-Content $metadataFile

Write-Host "Created: target/idl/escrow-$Environment.metadata.json" -ForegroundColor Green
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "IDL Created Successfully!" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

