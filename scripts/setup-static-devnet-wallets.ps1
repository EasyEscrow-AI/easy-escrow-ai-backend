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
    
    # Load existing config and check wallet addresses
    try {
        $existingConfig = Get-Content $configPath | ConvertFrom-Json
        
        if ($existingConfig.wallets) {
            Write-Host "Existing wallet addresses:" -ForegroundColor Cyan
            Write-Host "  Sender:       $($existingConfig.wallets.sender)" -ForegroundColor Gray
            Write-Host "  Receiver:     $($existingConfig.wallets.receiver)" -ForegroundColor Gray
            Write-Host "  Admin:        $($existingConfig.wallets.admin)" -ForegroundColor Gray
            Write-Host "  FeeCollector: $($existingConfig.wallets.feeCollector)" -ForegroundColor Gray
            Write-Host ""
            
            # Check if they match standardized addresses
            $staticWalletsCheck = Get-Content $staticWalletsPath | ConvertFrom-Json
            $addressesMatch = (
                ($existingConfig.wallets.sender -eq $staticWalletsCheck.wallets.sender) -and
                ($existingConfig.wallets.receiver -eq $staticWalletsCheck.wallets.receiver) -and
                ($existingConfig.wallets.admin -eq $staticWalletsCheck.wallets.admin) -and
                ($existingConfig.wallets.feeCollector -eq $staticWalletsCheck.wallets.feeCollector)
            )
            
            if ($addressesMatch) {
                Write-Host "✅ Addresses match standardized wallets. No need to overwrite." -ForegroundColor Green
                Write-Host ""
                Write-Host "If you need to update private keys, edit the file manually or use:" -ForegroundColor Cyan
                Write-Host "  .\scripts\set-devnet-env-vars.ps1" -ForegroundColor Gray
                Write-Host ""
                exit 0
            } else {
                Write-Host "⚠️  GUARDRAIL WARNING: Existing addresses DO NOT match standardized wallets!" -ForegroundColor Yellow
                Write-Host ""
                Write-Host "Standardized addresses:" -ForegroundColor Cyan
                Write-Host "  Sender:       $($staticWalletsCheck.wallets.sender)" -ForegroundColor Gray
                Write-Host "  Receiver:     $($staticWalletsCheck.wallets.receiver)" -ForegroundColor Gray
                Write-Host "  Admin:        $($staticWalletsCheck.wallets.admin)" -ForegroundColor Gray
                Write-Host "  FeeCollector: $($staticWalletsCheck.wallets.feeCollector)" -ForegroundColor Gray
                Write-Host ""
                Write-Host "⚠️  Overwriting will change your wallet addresses!" -ForegroundColor Yellow
                Write-Host "   This means you'll need to fund NEW addresses." -ForegroundColor Yellow
                Write-Host ""
            }
        }
    } catch {
        Write-Host "⚠️  Could not read existing config (may be invalid JSON)" -ForegroundColor Yellow
        Write-Host ""
    }
    
    $confirm = Read-Host "Overwrite with standardized static wallets? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "❌ Cancelled - Existing configuration preserved" -ForegroundColor Red
        Write-Host ""
        Write-Host "To proceed, either:" -ForegroundColor Cyan
        Write-Host "  1. Run with -Force flag: .\setup-static-devnet-wallets.ps1 -Force" -ForegroundColor Gray
        Write-Host "  2. Delete the file manually and run again" -ForegroundColor Gray
        Write-Host "  3. Edit the file manually to update addresses" -ForegroundColor Gray
        Write-Host ""
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

