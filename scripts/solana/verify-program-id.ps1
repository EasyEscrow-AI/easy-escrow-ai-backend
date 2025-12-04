#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verify the program ID in a built Solana binary matches expected value

.DESCRIPTION
    Extracts the program ID from target/deploy/escrow.so and verifies it matches
    the expected program ID for the specified environment.

.PARAMETER Environment
    The environment to verify: mainnet, staging, devnet, or localnet

.EXAMPLE
    .\scripts\solana\verify-program-id.ps1 -Environment mainnet
    
.EXAMPLE
    .\scripts\solana\verify-program-id.ps1 -Environment staging
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('mainnet', 'staging', 'devnet', 'localnet')]
    [string]$Environment
)

# Define expected program IDs
$programIds = @{
    'mainnet' = '2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx'
    'staging' = 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei'
    'devnet'  = 'AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei'
    'localnet' = 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS'
}

$expectedId = $programIds[$Environment]
$binaryPath = "target/deploy/escrow.so"

Write-Host "🔍 Verifying Program ID for $Environment..." -ForegroundColor Cyan
Write-Host "Expected: $expectedId" -ForegroundColor Yellow
Write-Host ""

# Check if binary exists
if (-not (Test-Path $binaryPath)) {
    Write-Host "❌ Binary not found: $binaryPath" -ForegroundColor Red
    Write-Host "   Run: npm run build:$Environment" -ForegroundColor Yellow
    exit 1
}

# Use solana-verify if available, otherwise parse IDL
try {
    $actualId = solana-verify get-program-id $binaryPath 2>$null
    
    if ($LASTEXITCODE -ne 0) {
        throw "solana-verify failed"
    }
    
    $actualId = $actualId.Trim()
    
    Write-Host "Actual:   $actualId" -ForegroundColor Cyan
    Write-Host ""
    
    if ($actualId -eq $expectedId) {
        Write-Host "✅ Program ID matches! Safe to deploy to $Environment" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "❌ Program ID mismatch!" -ForegroundColor Red
        Write-Host "   Expected: $expectedId" -ForegroundColor Yellow
        Write-Host "   Found:    $actualId" -ForegroundColor Red
        Write-Host ""
        Write-Host "   The binary was built for the wrong environment!" -ForegroundColor Red
        Write-Host "   Rebuild with: npm run build:$Environment" -ForegroundColor Yellow
        exit 1
    }
} catch {
    # Fallback: Check IDL file
    $idlPath = "target/idl/escrow.json"
    
    if (Test-Path $idlPath) {
        Write-Host "⚠️  solana-verify not available, checking IDL..." -ForegroundColor Yellow
        
        $idl = Get-Content $idlPath | ConvertFrom-Json
        $actualId = $idl.address
        
        Write-Host "Actual (from IDL): $actualId" -ForegroundColor Cyan
        Write-Host ""
        
        if ($actualId -eq $expectedId) {
            Write-Host "✅ Program ID in IDL matches! (binary not verified)" -ForegroundColor Green
            exit 0
        } else {
            Write-Host "❌ Program ID mismatch in IDL!" -ForegroundColor Red
            Write-Host "   Expected: $expectedId" -ForegroundColor Yellow
            Write-Host "   Found:    $actualId" -ForegroundColor Red
            Write-Host ""
            Write-Host "   Rebuild with: npm run build:$Environment" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "❌ Cannot verify: neither binary nor IDL can be checked" -ForegroundColor Red
        Write-Host "   Install solana-verify or check IDL manually" -ForegroundColor Yellow
        exit 1
    }
}

