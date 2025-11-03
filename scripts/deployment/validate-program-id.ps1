# Validate Program ID Before Deployment
# Ensures we're upgrading the CORRECT program and not creating a new one
#
# Usage:
#   .\scripts\deployment\validate-program-id.ps1 -Environment staging
#   .\scripts\deployment\validate-program-id.ps1 -Environment production

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("staging", "production", "dev")]
    [string]$Environment
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Program ID Validation Tool" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Define expected program IDs for each environment
$programIds = @{
    "staging" = @{
        "ProgramId" = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
        "KeypairPath" = "wallets/staging/escrow-program-keypair.json"
        "Network" = "devnet"
    }
    "production" = @{
        "ProgramId" = "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"
        "KeypairPath" = "wallets/production/escrow-program-keypair.json"
        "Network" = "mainnet-beta"
    }
    "dev" = @{
        "ProgramId" = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"
        "KeypairPath" = "wallets/dev/escrow-program-keypair.json"
        "Network" = "devnet"
    }
}

$config = $programIds[$Environment]
$expectedProgramId = $config.ProgramId
$keypairPath = $config.KeypairPath
$network = $config.Network

Write-Host "Environment:      $Environment" -ForegroundColor Yellow
Write-Host "Expected ID:      $expectedProgramId" -ForegroundColor Yellow
Write-Host "Keypair Path:     $keypairPath" -ForegroundColor Yellow
Write-Host "Network:          $network" -ForegroundColor Yellow
Write-Host ""

# Check if keypair exists
Write-Host "🔍 Checking program keypair..." -ForegroundColor Yellow
if (-not (Test-Path $keypairPath)) {
    Write-Host "❌ CRITICAL ERROR: Program keypair not found!" -ForegroundColor Red
    Write-Host "   Path: $keypairPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "   This keypair is REQUIRED to verify the program ID." -ForegroundColor Red
    Write-Host "   Deployment BLOCKED." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Program keypair found" -ForegroundColor Green
Write-Host ""

# Get the program ID from the keypair
Write-Host "🔑 Extracting program ID from keypair..." -ForegroundColor Yellow
try {
    $actualProgramId = solana-keygen pubkey $keypairPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to extract pubkey from keypair"
    }
    Write-Host "  Keypair generates: $actualProgramId" -ForegroundColor White
} catch {
    Write-Host "❌ ERROR: Failed to read program keypair" -ForegroundColor Red
    Write-Host "   $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Compare with expected program ID
Write-Host "🛡️  Validating program ID..." -ForegroundColor Yellow
if ($actualProgramId -ne $expectedProgramId) {
    Write-Host ""
    Write-Host "❌❌❌ CRITICAL ERROR: PROGRAM ID MISMATCH! ❌❌❌" -ForegroundColor Red
    Write-Host "" -ForegroundColor Red
    Write-Host "   Expected Program ID:  $expectedProgramId" -ForegroundColor Red
    Write-Host "   Keypair Generates:    $actualProgramId" -ForegroundColor Red
    Write-Host "" -ForegroundColor Red
    Write-Host "   ⚠️  DEPLOYING WITH THIS KEYPAIR WOULD CREATE A NEW PROGRAM! ⚠️" -ForegroundColor Red
    Write-Host "" -ForegroundColor Red
    Write-Host "   This is a SAFETY CHECK to prevent accidental new program creation." -ForegroundColor Yellow
    Write-Host "   We use STATIC program IDs. New programs require explicit approval." -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Red
    Write-Host "   Deployment BLOCKED." -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host "  ✅ Program ID validated successfully!" -ForegroundColor Green
Write-Host ""

# Check if program exists on-chain
Write-Host "🌐 Checking on-chain program status..." -ForegroundColor Yellow
try {
    $networkUrl = if ($network -eq "mainnet-beta") { "mainnet-beta" } else { "devnet" }
    $programInfo = solana program show $expectedProgramId --url $networkUrl 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Program exists on-chain ($network)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Program Details:" -ForegroundColor Cyan
        Write-Host $programInfo
    } else {
        Write-Host "  ⚠️  Program not found on-chain" -ForegroundColor Yellow
        Write-Host "     This deployment will CREATE a new program" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "     Program ID: $expectedProgramId" -ForegroundColor Yellow
        Write-Host "     Network: $network" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  ⚠️  Creating new programs requires explicit user approval!" -ForegroundColor Red
        Write-Host ""
        
        $confirm = Read-Host "Do you want to CREATE a NEW program? (type 'CREATE NEW PROGRAM' to confirm)"
        if ($confirm -ne "CREATE NEW PROGRAM") {
            Write-Host ""
            Write-Host "Deployment cancelled." -ForegroundColor Yellow
            exit 1
        }
    }
} catch {
    Write-Host "  ⚠️  Could not verify on-chain status: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "✅ VALIDATION PASSED" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Safe to deploy to $Environment environment" -ForegroundColor Green
Write-Host "Program ID: $expectedProgramId" -ForegroundColor Green
Write-Host ""

