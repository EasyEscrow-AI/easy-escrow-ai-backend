# Easy Escrow - Reset Localnet Environment (PowerShell)
# This script resets the localnet environment to a clean state

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Reset Localnet Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$KEYPAIR_DIR = ".localnet"
$LOG_DIR = "test-ledger"

# Check if validator is running
Write-Host "`nChecking for running validator..." -ForegroundColor Yellow
$validatorRunning = $false
try {
    $cluster = solana cluster-version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $validatorRunning = $true
        Write-Host "  ! Warning: Validator is currently running" -ForegroundColor Yellow
        Write-Host "  ! Please stop the validator before resetting (Ctrl+C)" -ForegroundColor Yellow
        $confirm = Read-Host "Do you want to continue anyway? (y/N)"
        if ($confirm -ne "y") {
            Write-Host "`nReset cancelled" -ForegroundColor Yellow
            exit 0
        }
    } else {
        Write-Host "  ✓ No validator running" -ForegroundColor Green
    }
} catch {
    Write-Host "  ✓ No validator running" -ForegroundColor Green
}

# Remove keypairs
Write-Host "`n[1/4] Removing test keypairs..." -ForegroundColor Yellow
if (Test-Path $KEYPAIR_DIR) {
    Remove-Item -Recurse -Force $KEYPAIR_DIR
    Write-Host "  ✓ Keypairs removed" -ForegroundColor Green
} else {
    Write-Host "  - No keypairs to remove" -ForegroundColor Gray
}

# Remove ledger data
Write-Host "`n[2/4] Removing ledger data..." -ForegroundColor Yellow
if (Test-Path $LOG_DIR) {
    Remove-Item -Recurse -Force $LOG_DIR
    Write-Host "  ✓ Ledger data removed" -ForegroundColor Green
} else {
    Write-Host "  - No ledger data to remove" -ForegroundColor Gray
}

# Remove environment config
Write-Host "`n[3/4] Removing environment configuration..." -ForegroundColor Yellow
if (Test-Path ".env.localnet") {
    Remove-Item -Force ".env.localnet"
    Write-Host "  ✓ Environment config removed" -ForegroundColor Green
} else {
    Write-Host "  - No environment config to remove" -ForegroundColor Gray
}

# Reset Solana config to devnet
Write-Host "`n[4/4] Resetting Solana CLI to devnet..." -ForegroundColor Yellow
solana config set --url devnet | Out-Null
Write-Host "  ✓ Solana CLI reset to devnet" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Localnet Reset Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nTo setup localnet again, run:" -ForegroundColor Yellow
Write-Host "  1. .\scripts\start-localnet-validator.ps1" -ForegroundColor Gray
Write-Host "  2. .\scripts\setup-localnet.ps1" -ForegroundColor Gray
Write-Host ""

