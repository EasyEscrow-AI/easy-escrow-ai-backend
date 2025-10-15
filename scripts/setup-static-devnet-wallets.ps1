# Setup Static Devnet Wallets - PowerShell Script
# Creates devnet-config.json with static wallet addresses for consistent E2E testing

param(
    [switch]$Force = $false
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Setup Static Devnet Wallets" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$configPath = "tests/fixtures/devnet-config.json"
$staticWalletsPath = "tests/fixtures/devnet-static-wallets.json"

# Check if config already exists
if ((Test-Path $configPath) -and -not $Force) {
    Write-Host "⚠️  Configuration file already exists: $configPath" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Overwrite with static wallets? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "❌ Cancelled" -ForegroundColor Red
        exit 0
    }
}

# Load static wallet addresses
if (-not (Test-Path $staticWalletsPath)) {
    Write-Host "❌ Static wallets file not found: $staticWalletsPath" -ForegroundColor Red
    exit 1
}

$staticWallets = Get-Content $staticWalletsPath | ConvertFrom-Json

Write-Host "📋 Static Devnet Wallet Addresses:" -ForegroundColor Yellow
Write-Host "  Sender (Seller):  $($staticWallets.wallets.sender)" -ForegroundColor White
Write-Host "  Receiver (Buyer): $($staticWallets.wallets.receiver)" -ForegroundColor White
Write-Host "  Admin:            $($staticWallets.wallets.admin)" -ForegroundColor White
Write-Host "  FeeCollector:     $($staticWallets.wallets.feeCollector)" -ForegroundColor White
Write-Host ""

Write-Host "⚠️  IMPORTANT: Private Keys Required" -ForegroundColor Yellow
Write-Host ""
Write-Host "To use these wallets, you must provide private keys via one of:" -ForegroundColor White
Write-Host ""
Write-Host "Option 1: Environment Variables (Recommended)" -ForegroundColor Cyan
Write-Host "  Set the following environment variables:" -ForegroundColor Gray
Write-Host "    DEVNET_SENDER_PRIVATE_KEY=<base58_private_key>" -ForegroundColor Gray
Write-Host "    DEVNET_RECEIVER_PRIVATE_KEY=<base58_private_key>" -ForegroundColor Gray
Write-Host "    DEVNET_ADMIN_PRIVATE_KEY=<base58_private_key>" -ForegroundColor Gray
Write-Host "    DEVNET_FEE_COLLECTOR_PRIVATE_KEY=<base58_private_key>" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 2: Add walletKeys to devnet-config.json" -ForegroundColor Cyan
Write-Host "  Edit $configPath and add:" -ForegroundColor Gray
Write-Host '  "walletKeys": {' -ForegroundColor Gray
Write-Host '    "sender": "<base58_private_key>",' -ForegroundColor Gray
Write-Host '    "receiver": "<base58_private_key>",' -ForegroundColor Gray
Write-Host '    "admin": "<base58_private_key>",' -ForegroundColor Gray
Write-Host '    "feeCollector": "<base58_private_key>"' -ForegroundColor Gray
Write-Host '  }' -ForegroundColor Gray
Write-Host ""

Write-Host "Creating configuration file..." -ForegroundColor Yellow

# Create config with wallet addresses (no private keys)
$config = @{
    wallets = @{
        sender = $staticWallets.wallets.sender
        receiver = $staticWallets.wallets.receiver
        admin = $staticWallets.wallets.admin
        feeCollector = $staticWallets.wallets.feeCollector
    }
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    isStaticWallets = $true
    note = "Private keys must be provided via environment variables or manually added to this file"
}

# Ensure directory exists
$configDir = Split-Path -Parent $configPath
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

# Save config
$config | ConvertTo-Json | Set-Content $configPath

Write-Host "✅ Configuration created: $configPath" -ForegroundColor Green
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Provide private keys (see options above)" -ForegroundColor White
Write-Host "  2. Fund the wallets:" -ForegroundColor White
Write-Host "     $($staticWallets.powershellCommand)" -ForegroundColor Green
Write-Host "  3. Run E2E tests:" -ForegroundColor White
Write-Host "     npm run test:e2e:devnet:nft-swap" -ForegroundColor Green
Write-Host ""

Write-Host "Quick Funding Commands:" -ForegroundColor Yellow
Write-Host "  $($staticWallets.fundingCommands.seller)" -ForegroundColor Gray
Write-Host "  $($staticWallets.fundingCommands.receiver)" -ForegroundColor Gray
Write-Host "  $($staticWallets.fundingCommands.admin)" -ForegroundColor Gray
Write-Host "  $($staticWallets.fundingCommands.feeCollector)" -ForegroundColor Gray
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan

