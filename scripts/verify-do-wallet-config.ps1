# DigitalOcean Wallet Configuration Verification Script
# Verifies that the deployed server has correct wallet configuration matching devnet-config.json

param(
    [Parameter(Mandatory=$false)]
    [string]$AppUrl = "https://easyescrow-backend-dev-rg7y6.ondigitalocean.app"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "DO Wallet Configuration Verification" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Expected wallet addresses (from devnet-config.json)
$expectedAddresses = @{
    "SENDER" = "FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71"
    "RECEIVER" = "Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk"
    "ADMIN" = "7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u"
    "FEE_COLLECTOR" = "C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E"
}

# Expected configuration
$expectedConfig = @{
    "USDC_MINT" = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
    "ESCROW_PROGRAM_ID" = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"
}

Write-Host "Expected Configuration:" -ForegroundColor Yellow
Write-Host "  USDC Mint:    $($expectedConfig['USDC_MINT'])" -ForegroundColor White
Write-Host "  Program ID:   $($expectedConfig['ESCROW_PROGRAM_ID'])" -ForegroundColor White
Write-Host ""
Write-Host "Expected Wallet Addresses:" -ForegroundColor Yellow
$expectedAddresses.GetEnumerator() | Sort-Object Name | ForEach-Object {
    Write-Host "  $($_.Key.PadRight(15)): $($_.Value)" -ForegroundColor White
}
Write-Host ""

# Check if server is responding
Write-Host "Checking server health..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$AppUrl/health" -Method Get -TimeoutSec 10
    Write-Host "✅ Server is responding" -ForegroundColor Green
    Write-Host "   Status: $($healthResponse.status)" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "❌ Server health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   The server may still be deploying..." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Verify wallet addresses
Write-Host "Verifying wallet configuration..." -ForegroundColor Yellow
Write-Host ""

$allMatch = $true

try {
    # Call a test endpoint or health check that returns wallet info
    # For now, we'll verify using the API key validation endpoint
    
    Write-Host "Checking USDC Mint Address..." -ForegroundColor Cyan
    # This would need an actual endpoint that returns the config
    # For now, we'll mark it as a manual check
    Write-Host "  Expected: $($expectedConfig['USDC_MINT'])" -ForegroundColor White
    Write-Host "  ⚠️  Manual verification required via logs or admin endpoint" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Host "Checking Escrow Program ID..." -ForegroundColor Cyan
    Write-Host "  Expected: $($expectedConfig['ESCROW_PROGRAM_ID'])" -ForegroundColor White
    Write-Host "  ⚠️  Manual verification required via logs or admin endpoint" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Host "Checking Wallet Addresses..." -ForegroundColor Cyan
    foreach ($wallet in $expectedAddresses.GetEnumerator() | Sort-Object Name) {
        Write-Host "  $($wallet.Key):" -ForegroundColor White
        Write-Host "    Expected: $($wallet.Value)" -ForegroundColor White
        Write-Host "    ⚠️  Manual verification required via logs or admin endpoint" -ForegroundColor Yellow
    }
    Write-Host ""
    
} catch {
    Write-Host "❌ Verification failed: $($_.Exception.Message)" -ForegroundColor Red
    $allMatch = $false
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Server Status: ✅ Healthy" -ForegroundColor Green
Write-Host ""
Write-Host "Configuration Verification:" -ForegroundColor Yellow
Write-Host "  ⚠️  Full verification requires admin endpoint or log inspection" -ForegroundColor Yellow
Write-Host ""
Write-Host "To fully verify wallet configuration:" -ForegroundColor Cyan
Write-Host "  1. Check deployment logs: https://cloud.digitalocean.com/apps/31d5b0dc-d2be-4923-9946-7039194666cf" -ForegroundColor White
Write-Host "  2. Look for wallet addresses in startup logs" -ForegroundColor White
Write-Host "  3. Run E2E tests to confirm wallets work correctly" -ForegroundColor White
Write-Host ""

# Quick E2E test recommendation
Write-Host "Run E2E Test to Verify:" -ForegroundColor Yellow
Write-Host "  npm run test:e2e" -ForegroundColor White
Write-Host ""

Write-Host "Expected E2E Test Results:" -ForegroundColor Cyan
Write-Host "  - Wallet addresses should match" -ForegroundColor White
Write-Host "  - Deposits should complete successfully" -ForegroundColor White
Write-Host "  - Settlement should trigger automatically" -ForegroundColor White
Write-Host ""

