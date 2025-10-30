#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build the Solana escrow program for MAINNET deployment

.DESCRIPTION
    Builds the program with mainnet feature flag, ensuring the correct
    mainnet program ID (2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx) is used.

.EXAMPLE
    .\scripts\solana\build-mainnet.ps1
#>

Write-Host "🏗️  Building Solana Program for MAINNET..." -ForegroundColor Cyan
Write-Host "Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx" -ForegroundColor Yellow
Write-Host ""

# Build with mainnet feature
anchor build --features mainnet

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ MAINNET build completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📦 Binary location: target/deploy/escrow.so" -ForegroundColor Cyan
    Write-Host "📄 IDL location: target/idl/escrow.json" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: This binary is for MAINNET only!" -ForegroundColor Yellow
    Write-Host "   Program ID: 2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "❌ MAINNET build failed!" -ForegroundColor Red
    exit 1
}
