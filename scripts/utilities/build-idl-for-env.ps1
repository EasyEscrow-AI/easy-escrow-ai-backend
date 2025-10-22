#!/usr/bin/env pwsh
# Build Anchor program and generate environment-specific IDL files
# Usage: .\build-idl-for-env.ps1 -Environment staging

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('dev', 'staging', 'production')]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ROOT = Resolve-Path "$PSScriptRoot/../.."
$IDL_DIR = "$PROJECT_ROOT/target/idl"
$ANCHOR_TOML = "$PROJECT_ROOT/Anchor.toml"
$ANCHOR_BACKUP = "$PROJECT_ROOT/Anchor.toml.backup"

# Environment-specific config files
$ENV_CONFIGS = @{
    'dev' = "$PROJECT_ROOT/Anchor.toml"
    'staging' = "$PROJECT_ROOT/Anchor.staging.toml"
    'production' = "$PROJECT_ROOT/Anchor.production.toml"
}

# Expected program IDs
$PROGRAM_IDS = @{
    'dev' = '4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd'
    'staging' = 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei'
    'production' = 'TBD'
}

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Building IDL for Environment: $($Environment.ToUpper())" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Verify environment config exists
$envConfig = $ENV_CONFIGS[$Environment]
if (-not (Test-Path $envConfig)) {
    Write-Host "Error: Configuration file not found: $envConfig" -ForegroundColor Red
    exit 1
}

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Environment: $Environment"
Write-Host "  Config File: $envConfig"
Write-Host "  Expected Program ID: $($PROGRAM_IDS[$Environment])"
Write-Host ""

if (-not $SkipBuild) {
    $needsSwap = $envConfig -ne $ANCHOR_TOML
    
    if ($needsSwap) {
        Write-Host "Step 1: Swapping Anchor.toml..." -ForegroundColor Yellow
        
        # Backup current Anchor.toml
        if (Test-Path $ANCHOR_TOML) {
            Copy-Item -Path $ANCHOR_TOML -Destination $ANCHOR_BACKUP -Force
            Write-Host "  Backed up Anchor.toml" -ForegroundColor Green
        }
        
        # Copy environment config to Anchor.toml
        Copy-Item -Path $envConfig -Destination $ANCHOR_TOML -Force
        Write-Host "  Using $Environment configuration" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "Step 1: Using existing Anchor.toml (already for $Environment)..." -ForegroundColor Yellow
        Write-Host ""
    }
    
    Write-Host "Step 2: Building Anchor program..." -ForegroundColor Yellow
    Write-Host ""
    
    try {
        # Build the program
        $buildOutput = anchor build 2>&1
        $buildExitCode = $LASTEXITCODE
        
        if ($buildExitCode -ne 0) {
            Write-Host "Build failed!" -ForegroundColor Red
            Write-Host $buildOutput
            
            # Restore original Anchor.toml
            if (Test-Path $ANCHOR_BACKUP) {
                Copy-Item -Path $ANCHOR_BACKUP -Destination $ANCHOR_TOML -Force
                Remove-Item -Path $ANCHOR_BACKUP -Force
                Write-Host "  Restored original Anchor.toml" -ForegroundColor Green
            }
            
            exit 1
        }
        
        Write-Host "  Build completed successfully" -ForegroundColor Green
        Write-Host ""
        
    } finally {
        # Restore original Anchor.toml only if we swapped it
        if ($needsSwap -and (Test-Path $ANCHOR_BACKUP)) {
            Copy-Item -Path $ANCHOR_BACKUP -Destination $ANCHOR_TOML -Force
            Remove-Item -Path $ANCHOR_BACKUP -Force
            Write-Host "Restored original Anchor.toml" -ForegroundColor Cyan
            Write-Host ""
        }
    }
}

Write-Host "Step 3: Managing IDL files..." -ForegroundColor Yellow

# Ensure IDL directory exists
if (-not (Test-Path $IDL_DIR)) {
    Write-Host "Error: IDL directory not found: $IDL_DIR" -ForegroundColor Red
    exit 1
}

$sourceIdl = "$IDL_DIR/escrow.json"
if (-not (Test-Path $sourceIdl)) {
    Write-Host "Error: Generated IDL not found: $sourceIdl" -ForegroundColor Red
    exit 1
}

# Read and verify the generated IDL
$idlContent = Get-Content $sourceIdl -Raw | ConvertFrom-Json
$actualProgramId = $idlContent.address

Write-Host "  Generated Program ID: $actualProgramId"
Write-Host "  Expected Program ID:  $($PROGRAM_IDS[$Environment])"

if ($actualProgramId -ne $PROGRAM_IDS[$Environment]) {
    Write-Host ""
    Write-Host "WARNING: Program ID mismatch!" -ForegroundColor Yellow
    Write-Host "The generated IDL has a different program ID than expected." -ForegroundColor Yellow
    Write-Host "This may indicate the wrong configuration was used." -ForegroundColor Yellow
    Write-Host ""
}

# Copy to environment-specific file
$targetIdl = "$IDL_DIR/escrow-$Environment.json"
Copy-Item -Path $sourceIdl -Destination $targetIdl -Force
Write-Host "  Saved to: escrow-$Environment.json" -ForegroundColor Green

# Create a metadata file
$metadata = @{
    environment = $Environment
    programId = $actualProgramId
    generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
    configFile = $envConfig
}

$metadataFile = "$IDL_DIR/escrow-$Environment.metadata.json"
$metadata | ConvertTo-Json -Depth 10 | Set-Content $metadataFile
Write-Host "  Created metadata file" -ForegroundColor Green

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "IDL Generation Complete!" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Files created:" -ForegroundColor Yellow
Write-Host "  - target/idl/escrow-$Environment.json"
Write-Host "  - target/idl/escrow-$Environment.metadata.json"
Write-Host ""
Write-Host "Program ID: $actualProgramId"
Write-Host ""

# Display next steps
Write-Host "Next Steps:" -ForegroundColor Cyan
switch ($Environment) {
    'staging' {
        Write-Host "  1. Deploy to staging: npm run staging:deploy"
        Write-Host "  2. Run tests: npm run test:staging:e2e"
    }
    'dev' {
        Write-Host "  1. Test locally: npm run test:e2e"
    }
    'production' {
        Write-Host "  1. Review thoroughly before deployment"
        Write-Host "  2. Deploy to production (follow deployment guide)"
    }
}
Write-Host ""
