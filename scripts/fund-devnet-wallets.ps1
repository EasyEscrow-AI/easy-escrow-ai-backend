# Fund Devnet Test Wallets - PowerShell Script
# Automates funding of E2E test wallets on Solana devnet

param(
    [Parameter(Mandatory=$false)]
    [string]$Buyer = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Seller = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Admin = "",
    
    [Parameter(Mandatory=$false)]
    [decimal]$Amount = 2,
    
    [switch]$FromTestOutput = $false
)

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Devnet Test Wallet Funding" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Function to extract wallet addresses from test output
function Get-WalletsFromTestOutput {
    Write-Host "Looking for test output file..." -ForegroundColor Yellow
    
    $logFile = "test-output.txt"
    if (-not (Test-Path $logFile)) {
        Write-Host "❌ test-output.txt not found" -ForegroundColor Red
        Write-Host "Run the test first with: npm run test:e2e:devnet 2>&1 | tee test-output.txt" -ForegroundColor White
        return $null
    }
    
    $content = Get-Content $logFile -Raw
    
    $buyerMatch = $content | Select-String -Pattern "Buyer:\s+([A-Za-z0-9]{32,44})"
    $sellerMatch = $content | Select-String -Pattern "Seller:\s+([A-Za-z0-9]{32,44})"
    $adminMatch = $content | Select-String -Pattern "Admin:\s+([A-Za-z0-9]{32,44})"
    
    if ($buyerMatch -and $sellerMatch -and $adminMatch) {
        return @{
            Buyer = $buyerMatch.Matches[0].Groups[1].Value
            Seller = $sellerMatch.Matches[0].Groups[1].Value
            Admin = $adminMatch.Matches[0].Groups[1].Value
        }
    }
    
    return $null
}

# Get wallet addresses
if ($FromTestOutput) {
    Write-Host "Extracting wallet addresses from test output..." -ForegroundColor Yellow
    $wallets = Get-WalletsFromTestOutput
    
    if ($null -eq $wallets) {
        Write-Host "❌ Failed to extract wallet addresses" -ForegroundColor Red
        exit 1
    }
    
    $Buyer = $wallets.Buyer
    $Seller = $wallets.Seller
    $Admin = $wallets.Admin
    
    Write-Host "✅ Extracted wallet addresses" -ForegroundColor Green
}

# Validate inputs
if (-not $Buyer -or -not $Seller -or -not $Admin) {
    Write-Host "❌ Missing wallet addresses" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor White
    Write-Host "  .\fund-devnet-wallets.ps1 -Buyer <ADDR> -Seller <ADDR> -Admin <ADDR>" -ForegroundColor Gray
    Write-Host "  .\fund-devnet-wallets.ps1 -FromTestOutput" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or run test first to get addresses:" -ForegroundColor White
    Write-Host "  npm run test:e2e:devnet 2>&1 | tee test-output.txt" -ForegroundColor Gray
    exit 1
}

Write-Host "Wallet Addresses:" -ForegroundColor Yellow
Write-Host "  Buyer:  $Buyer" -ForegroundColor White
Write-Host "  Seller: $Seller" -ForegroundColor White
Write-Host "  Admin:  $Admin" -ForegroundColor White
Write-Host ""

# Check current balances
Write-Host "Checking current balances..." -ForegroundColor Yellow
$buyerBalance = solana balance $Buyer --url devnet 2>&1
$sellerBalance = solana balance $Seller --url devnet 2>&1
$adminBalance = solana balance $Admin --url devnet 2>&1

Write-Host "  Buyer:  $buyerBalance" -ForegroundColor Gray
Write-Host "  Seller: $sellerBalance" -ForegroundColor Gray
Write-Host "  Admin:  $adminBalance" -ForegroundColor Gray
Write-Host ""

# Confirm funding
$totalAmount = $Amount * 2 + 1  # Buyer + Seller + Admin(1 SOL)
Write-Host "This will transfer:" -ForegroundColor Yellow
Write-Host "  $Amount SOL to Buyer" -ForegroundColor White
Write-Host "  $Amount SOL to Seller" -ForegroundColor White
Write-Host "  1 SOL to Admin" -ForegroundColor White
Write-Host "  Total: $totalAmount SOL" -ForegroundColor Cyan
Write-Host ""

$confirm = Read-Host "Continue? (y/n)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "Funding wallets..." -ForegroundColor Yellow
Write-Host ""

# Fund Buyer
Write-Host "1/3 Funding Buyer ($Amount SOL)..." -ForegroundColor Cyan
try {
    $result = solana transfer $Buyer $Amount --url devnet 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Buyer funded successfully" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Buyer funding failed: $result" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ Buyer funding error: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 2

# Fund Seller
Write-Host "2/3 Funding Seller ($Amount SOL)..." -ForegroundColor Cyan
try {
    $result = solana transfer $Seller $Amount --url devnet 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Seller funded successfully" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Seller funding failed: $result" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ Seller funding error: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 2

# Fund Admin
Write-Host "3/3 Funding Admin (1 SOL)..." -ForegroundColor Cyan
try {
    $result = solana transfer $Admin 1 --url devnet 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Admin funded successfully" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Admin funding failed: $result" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ Admin funding error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Waiting for confirmations..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Verify final balances
Write-Host ""
Write-Host "Final balances:" -ForegroundColor Yellow
$buyerFinal = solana balance $Buyer --url devnet 2>&1
$sellerFinal = solana balance $Seller --url devnet 2>&1
$adminFinal = solana balance $Admin --url devnet 2>&1

Write-Host "  Buyer:  $buyerFinal" -ForegroundColor White
Write-Host "  Seller: $sellerFinal" -ForegroundColor White
Write-Host "  Admin:  $adminFinal" -ForegroundColor White
Write-Host ""

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "✅ Funding Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now run the E2E tests:" -ForegroundColor White
Write-Host "  npm run test:e2e:devnet" -ForegroundColor Green
Write-Host ""
Write-Host "Or the simple test:" -ForegroundColor White
Write-Host "  npx mocha --require ts-node/register tests/e2e/simple-devnet.test.ts --timeout 180000" -ForegroundColor Green
Write-Host ""

