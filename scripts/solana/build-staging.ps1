#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build the Solana escrow program for STAGING deployment

.DESCRIPTION
    Builds the program with staging feature flag, ensuring the correct
    staging program ID (AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei) is used.

.EXAMPLE
    .\scripts\solana\build-staging.ps1
#>

Write-Host "🏗️  Building Solana Program for STAGING..." -ForegroundColor Cyan
Write-Host "Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei" -ForegroundColor Yellow
Write-Host ""

# Build with staging feature (pass to cargo via --)
anchor build -- --features staging

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ STAGING build completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📦 Binary location: target/deploy/escrow.so" -ForegroundColor Cyan
    Write-Host "📄 IDL location: target/idl/escrow.json" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ℹ️  This binary is for STAGING/DEVNET only!" -ForegroundColor Blue
    Write-Host "   Program ID: AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "❌ STAGING build failed!" -ForegroundColor Red
    exit 1
}

