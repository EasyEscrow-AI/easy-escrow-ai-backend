# Set Devnet Environment Variables - PowerShell Script
# Helper script to set environment variables for devnet E2E testing
# NEVER commit this file with actual private keys!

param(
    [Parameter(Mandatory=$false)]
    [string]$SenderKey = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ReceiverKey = "",
    
    [Parameter(Mandatory=$false)]
    [string]$AdminKey = "",
    
    [Parameter(Mandatory=$false)]
    [string]$FeeCollectorKey = "",
    
    [switch]$Permanent = $false,
    
    [switch]$Show = $false
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Set Devnet Environment Variables" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Show current values if requested
if ($Show) {
    Write-Host "Current Environment Variables:" -ForegroundColor Yellow
    Write-Host ""
    
    $sender = $env:DEVNET_SENDER_PRIVATE_KEY
    $receiver = $env:DEVNET_RECEIVER_PRIVATE_KEY
    $admin = $env:DEVNET_ADMIN_PRIVATE_KEY
    $feeCollector = $env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY
    
    if ($sender) {
        $masked = $sender.Substring(0, 8) + "..." + $sender.Substring($sender.Length - 8)
        Write-Host "  DEVNET_SENDER_PRIVATE_KEY:        $masked" -ForegroundColor Green
    } else {
        Write-Host "  DEVNET_SENDER_PRIVATE_KEY:        [Not Set]" -ForegroundColor Red
    }
    
    if ($receiver) {
        $masked = $receiver.Substring(0, 8) + "..." + $receiver.Substring($receiver.Length - 8)
        Write-Host "  DEVNET_RECEIVER_PRIVATE_KEY:      $masked" -ForegroundColor Green
    } else {
        Write-Host "  DEVNET_RECEIVER_PRIVATE_KEY:      [Not Set]" -ForegroundColor Red
    }
    
    if ($admin) {
        $masked = $admin.Substring(0, 8) + "..." + $admin.Substring($admin.Length - 8)
        Write-Host "  DEVNET_ADMIN_PRIVATE_KEY:         $masked" -ForegroundColor Green
    } else {
        Write-Host "  DEVNET_ADMIN_PRIVATE_KEY:         [Not Set]" -ForegroundColor Red
    }
    
    if ($feeCollector) {
        $masked = $feeCollector.Substring(0, 8) + "..." + $feeCollector.Substring($feeCollector.Length - 8)
        Write-Host "  DEVNET_FEE_COLLECTOR_PRIVATE_KEY: $masked" -ForegroundColor Green
    } else {
        Write-Host "  DEVNET_FEE_COLLECTOR_PRIVATE_KEY: [Not Set]" -ForegroundColor Red
    }
    
    Write-Host ""
    exit 0
}

# Check if any keys were provided
if (-not $SenderKey -and -not $ReceiverKey -and -not $AdminKey -and -not $FeeCollectorKey) {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Set environment variables (current session only):" -ForegroundColor White
    Write-Host "  .\set-devnet-env-vars.ps1 -SenderKey <KEY> -ReceiverKey <KEY> -AdminKey <KEY> -FeeCollectorKey <KEY>" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Set environment variables permanently (user level):" -ForegroundColor White
    Write-Host "  .\set-devnet-env-vars.ps1 -SenderKey <KEY> ... -Permanent" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Show current values (masked):" -ForegroundColor White
    Write-Host "  .\set-devnet-env-vars.ps1 -Show" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Note: Private keys should be in base58 format" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Static Wallet Addresses:" -ForegroundColor Cyan
    Write-Host "  Sender:       FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71" -ForegroundColor Gray
    Write-Host "  Receiver:     Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk" -ForegroundColor Gray
    Write-Host "  Admin:        7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u" -ForegroundColor Gray
    Write-Host "  FeeCollector: C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "Setting environment variables..." -ForegroundColor Yellow
Write-Host ""

$scope = if ($Permanent) { "User" } else { "Process" }
$scopeText = if ($Permanent) { "permanently (user level)" } else { "for current session" }

Write-Host "Scope: $scopeText" -ForegroundColor Cyan
Write-Host ""

$keysSet = 0

# Set Sender key
if ($SenderKey) {
    if ($Permanent) {
        [System.Environment]::SetEnvironmentVariable("DEVNET_SENDER_PRIVATE_KEY", $SenderKey, "User")
    }
    $env:DEVNET_SENDER_PRIVATE_KEY = $SenderKey
    Write-Host "✅ DEVNET_SENDER_PRIVATE_KEY set" -ForegroundColor Green
    $keysSet++
}

# Set Receiver key
if ($ReceiverKey) {
    if ($Permanent) {
        [System.Environment]::SetEnvironmentVariable("DEVNET_RECEIVER_PRIVATE_KEY", $ReceiverKey, "User")
    }
    $env:DEVNET_RECEIVER_PRIVATE_KEY = $ReceiverKey
    Write-Host "✅ DEVNET_RECEIVER_PRIVATE_KEY set" -ForegroundColor Green
    $keysSet++
}

# Set Admin key
if ($AdminKey) {
    if ($Permanent) {
        [System.Environment]::SetEnvironmentVariable("DEVNET_ADMIN_PRIVATE_KEY", $AdminKey, "User")
    }
    $env:DEVNET_ADMIN_PRIVATE_KEY = $AdminKey
    Write-Host "✅ DEVNET_ADMIN_PRIVATE_KEY set" -ForegroundColor Green
    $keysSet++
}

# Set FeeCollector key
if ($FeeCollectorKey) {
    if ($Permanent) {
        [System.Environment]::SetEnvironmentVariable("DEVNET_FEE_COLLECTOR_PRIVATE_KEY", $FeeCollectorKey, "User")
    }
    $env:DEVNET_FEE_COLLECTOR_PRIVATE_KEY = $FeeCollectorKey
    Write-Host "✅ DEVNET_FEE_COLLECTOR_PRIVATE_KEY set" -ForegroundColor Green
    $keysSet++
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ $keysSet environment variable(s) set!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if ($Permanent) {
    Write-Host "⚠️  Variables set permanently at user level" -ForegroundColor Yellow
    Write-Host "   They will persist across PowerShell sessions" -ForegroundColor Gray
    Write-Host "   Restart PowerShell to see them in `$env" -ForegroundColor Gray
} else {
    Write-Host "ℹ️  Variables set for current session only" -ForegroundColor Cyan
    Write-Host "   They will be lost when you close PowerShell" -ForegroundColor Gray
    Write-Host "   Use -Permanent flag to persist across sessions" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Fund wallets (if not already done):" -ForegroundColor White
Write-Host "     .\scripts\fund-devnet-wallets.ps1 -Buyer Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk -Seller FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71 -Admin 7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u -FeeCollector C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E" -ForegroundColor Green
Write-Host ""
Write-Host "  2. Run E2E tests:" -ForegroundColor White
Write-Host "     npm run test:e2e:devnet:nft-swap" -ForegroundColor Green
Write-Host ""

# Security reminder
Write-Host "🔒 Security Reminder:" -ForegroundColor Red
Write-Host "   NEVER commit private keys to git!" -ForegroundColor Yellow
Write-Host "   NEVER share your private keys!" -ForegroundColor Yellow
Write-Host "   Use different keys for mainnet!" -ForegroundColor Yellow
Write-Host ""

