#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start local Solana validator with atomic swap program
    
.DESCRIPTION
    Starts a clean Solana test validator and deploys the atomic swap program
#>

param(
    [switch]$Reset = $true
)

Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Starting Local Solana Validator for Atomic Swap        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check if validator is already running
$validatorProcess = Get-Process -Name "solana-test-validator" -ErrorAction SilentlyContinue

if ($validatorProcess) {
    Write-Host "⚠️  Validator already running. Stopping..." -ForegroundColor Yellow
    Stop-Process -Name "solana-test-validator" -Force
    Start-Sleep -Seconds 2
}

# Clean up old ledger if reset
if ($Reset) {
    Write-Host "🧹 Cleaning up old test ledger..." -ForegroundColor Cyan
    if (Test-Path "test-ledger") {
        Remove-Item -Path "test-ledger" -Recurse -Force
    }
}

# Program details
$PROGRAM_ID = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
$PROGRAM_PATH = "target\deploy\easyescrow.so"

Write-Host "🏦 Program ID: $PROGRAM_ID" -ForegroundColor Green
Write-Host "📦 Program Binary: $PROGRAM_PATH`n" -ForegroundColor Green

# Check if program binary exists
if (-not (Test-Path $PROGRAM_PATH)) {
    Write-Host "❌ Program binary not found at: $PROGRAM_PATH" -ForegroundColor Red
    Write-Host "Run: cd programs/escrow && cargo build-sbf" -ForegroundColor Yellow
    exit 1
}

# Start the validator
Write-Host "🚀 Starting validator..." -ForegroundColor Cyan
Write-Host "   • RPC: http://127.0.0.1:8899" -ForegroundColor Gray
Write-Host "   • WebSocket: ws://127.0.0.1:8900" -ForegroundColor Gray
Write-Host "   • Ledger: test-ledger/" -ForegroundColor Gray
Write-Host ""

# Start validator in background
Start-Process -FilePath "solana-test-validator" -ArgumentList `
    "--bpf-program", $PROGRAM_ID, $PROGRAM_PATH, `
    "--reset", `
    "--quiet" `
    -NoNewWindow

Write-Host "⏳ Waiting for validator to start..." -ForegroundColor Yellow

# Wait for validator to be ready
$maxRetries = 30
$retryCount = 0

while ($retryCount -lt $maxRetries) {
    try {
        $health = solana cluster-version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Validator is ready!" -ForegroundColor Green
            break
        }
    } catch {
        # Validator not ready yet
    }
    
    Start-Sleep -Seconds 1
    $retryCount++
    Write-Host "." -NoNewline -ForegroundColor Yellow
}

if ($retryCount -eq $maxRetries) {
    Write-Host "`n❌ Validator failed to start" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Show validator info
Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                VALIDATOR RUNNING                             ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "📊 Validator Info:" -ForegroundColor Cyan
solana cluster-version
Write-Host ""

Write-Host "💰 Genesis Accounts:" -ForegroundColor Cyan
Write-Host "   Faucet available for airdrops" -ForegroundColor Gray
Write-Host ""

Write-Host "🏦 Program Deployed:" -ForegroundColor Cyan
Write-Host "   Program ID: $PROGRAM_ID" -ForegroundColor Green
Write-Host ""

Write-Host "🔧 Configuration:" -ForegroundColor Cyan
Write-Host "   RPC URL: http://127.0.0.1:8899" -ForegroundColor Green
Write-Host "   WebSocket: ws://127.0.0.1:8900" -ForegroundColor Green
Write-Host ""

Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Keep this terminal open" -ForegroundColor Yellow
Write-Host "   2. Run tests: npm run test:atomic-swap:local" -ForegroundColor Yellow
Write-Host "   3. Press Ctrl+C to stop validator" -ForegroundColor Yellow
Write-Host ""

Write-Host "✅ Ready for testing!" -ForegroundColor Green
Write-Host ""

# Keep the script running and show logs
Write-Host "📋 Validator Logs (Press Ctrl+C to stop):" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

try {
    # Follow the validator logs
    Get-Content "test-ledger\validator.log" -Wait -Tail 10 | ForEach-Object {
        if ($_ -match "ERROR") {
            Write-Host $_ -ForegroundColor Red
        } elseif ($_ -match "WARN") {
            Write-Host $_ -ForegroundColor Yellow
        } else {
            Write-Host $_ -ForegroundColor Gray
        }
    }
} finally {
    Write-Host "`n🛑 Stopping validator..." -ForegroundColor Yellow
    Stop-Process -Name "solana-test-validator" -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Validator stopped" -ForegroundColor Green
}

