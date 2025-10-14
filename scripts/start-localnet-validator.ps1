# Easy Escrow - Start Local Solana Validator (PowerShell)
# This script starts a local Solana validator with optimized settings for testing

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting Local Solana Validator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Configuration
$SLOTS_PER_EPOCH = 32
$LOG_DIR = "test-ledger"

# Check if validator is already running
Write-Host "`nChecking for existing validator..." -ForegroundColor Yellow
try {
    $cluster = solana cluster-version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ! A validator is already running!" -ForegroundColor Yellow
        Write-Host "  ! To restart with fresh state, stop the existing validator first." -ForegroundColor Yellow
        Write-Host "`nValidator URL: http://localhost:8899" -ForegroundColor Cyan
        exit 0
    }
} catch {
    Write-Host "  ✓ No existing validator found" -ForegroundColor Green
}

# Create log directory if it doesn't exist
if (!(Test-Path $LOG_DIR)) {
    New-Item -ItemType Directory -Path $LOG_DIR | Out-Null
}

Write-Host "`nStarting validator with configuration:" -ForegroundColor Yellow
Write-Host "  - Slots per epoch: $SLOTS_PER_EPOCH" -ForegroundColor Gray
Write-Host "  - Log directory: $LOG_DIR" -ForegroundColor Gray
Write-Host "  - Reset: true (clean state)" -ForegroundColor Gray
Write-Host "  - Quiet mode: enabled" -ForegroundColor Gray

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Validator Starting..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nRPC URL: http://localhost:8899" -ForegroundColor Cyan
Write-Host "WebSocket URL: ws://localhost:8900" -ForegroundColor Cyan
Write-Host "`nPress Ctrl+C to stop the validator" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# Start the validator
# Note: Remove --reset if you want to preserve state between restarts
solana-test-validator `
    --reset `
    --quiet `
    --slots-per-epoch $SLOTS_PER_EPOCH `
    --ledger $LOG_DIR

