# Fund Devnet Test Wallets - PowerShell Script
# Automates funding of E2E test wallets on Solana devnet
# Now supports 4 separate wallets for proper role separation

param(
    [Parameter(Mandatory=$false)]
    [string]$Buyer = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Seller = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Admin = "",
    
    [Parameter(Mandatory=$false)]
    [string]$FeeCollector = "",
    
    [Parameter(Mandatory=$false)]
    [decimal]$Amount = 2,
    
    [switch]$FromTestOutput = $false
)

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Devnet Test Wallet Funding (4 Wallets)" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Function to extract wallet addresses from test output
function Get-WalletsFromTestOutput {
    Write-Host "Looking for test output file..." -ForegroundColor Yellow
    
    $logFile = "test-output.txt"
    if (-not (Test-Path $logFile)) {
        Write-Host "❌ test-output.txt not found" -ForegroundColor Red
        Write-Host "Run the test first with: npm run test:e2e:devnet:nft-swap 2>&1 | tee test-output.txt" -ForegroundColor White
        return $null
    }
    
    $content = Get-Content $logFile -Raw
    
    $buyerMatch = $content | Select-String -Pattern "Receiver:\s+([A-Za-z0-9]{32,44})"
    $sellerMatch = $content | Select-String -Pattern "Sender:\s+([A-Za-z0-9]{32,44})"
    $adminMatch = $content | Select-String -Pattern "Admin:\s+([A-Za-z0-9]{32,44})"
    $feeCollectorMatch = $content | Select-String -Pattern "FeeCollector:\s+([A-Za-z0-9]{32,44})"
    
    if ($buyerMatch -and $sellerMatch -and $adminMatch -and $feeCollectorMatch) {
        return @{
            Buyer = $buyerMatch.Matches[0].Groups[1].Value
            Seller = $sellerMatch.Matches[0].Groups[1].Value
            Admin = $adminMatch.Matches[0].Groups[1].Value
            FeeCollector = $feeCollectorMatch.Matches[0].Groups[1].Value
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
    $FeeCollector = $wallets.FeeCollector
    
    Write-Host "✅ Extracted wallet addresses" -ForegroundColor Green
}

# Validate inputs
if (-not $Buyer -or -not $Seller -or -not $Admin -or -not $FeeCollector) {
    Write-Host "❌ Missing wallet addresses" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor White
    Write-Host "  .\fund-devnet-wallets.ps1 -Buyer <ADDR> -Seller <ADDR> -Admin <ADDR> -FeeCollector <ADDR>" -ForegroundColor Gray
    Write-Host "  .\fund-devnet-wallets.ps1 -FromTestOutput" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or run test first to get addresses:" -ForegroundColor White
    Write-Host "  npm run test:e2e:devnet:nft-swap 2>&1 | tee test-output.txt" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Note: 4 wallets are now required:" -ForegroundColor Yellow
    Write-Host "  Buyer (Receiver) - Pays USDC, receives NFT" -ForegroundColor Gray
    Write-Host "  Seller (Sender)  - Owns NFT, receives USDC" -ForegroundColor Gray
    Write-Host "  Admin            - System admin operations" -ForegroundColor Gray
    Write-Host "  FeeCollector     - Receives fees (treasury)" -ForegroundColor Gray
    exit 1
}

Write-Host "Wallet Addresses:" -ForegroundColor Yellow
Write-Host "  Buyer (Receiver):  $Buyer" -ForegroundColor White
Write-Host "  Seller (Sender):   $Seller" -ForegroundColor White
Write-Host "  Admin:             $Admin" -ForegroundColor White
Write-Host "  FeeCollector:      $FeeCollector" -ForegroundColor White
Write-Host ""

# Check current balances
Write-Host "Checking current balances..." -ForegroundColor Yellow
$buyerBalance = solana balance $Buyer --url devnet 2>&1
$sellerBalance = solana balance $Seller --url devnet 2>&1
$adminBalance = solana balance $Admin --url devnet 2>&1
$feeCollectorBalance = solana balance $FeeCollector --url devnet 2>&1

Write-Host "  Buyer (Receiver):  $buyerBalance" -ForegroundColor Gray
Write-Host "  Seller (Sender):   $sellerBalance" -ForegroundColor Gray
Write-Host "  Admin:             $adminBalance" -ForegroundColor Gray
Write-Host "  FeeCollector:      $feeCollectorBalance" -ForegroundColor Gray
Write-Host ""

# Confirm funding
$totalAmount = $Amount * 3 + 1  # Buyer + Seller + Admin + FeeCollector(1 SOL)
Write-Host "This will transfer:" -ForegroundColor Yellow
Write-Host "  $Amount SOL to Buyer (Receiver)" -ForegroundColor White
Write-Host "  $Amount SOL to Seller (Sender)" -ForegroundColor White
Write-Host "  $Amount SOL to Admin" -ForegroundColor White
Write-Host "  1 SOL to FeeCollector (treasury, receive-only)" -ForegroundColor White
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
Write-Host "3/4 Funding Admin ($Amount SOL)..." -ForegroundColor Cyan
try {
    $result = solana transfer $Admin $Amount --url devnet 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Admin funded successfully" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Admin funding failed: $result" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ Admin funding error: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 2

# Fund FeeCollector
Write-Host "4/4 Funding FeeCollector (1 SOL - treasury wallet)..." -ForegroundColor Cyan
try {
    $result = solana transfer $FeeCollector 1 --url devnet 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ FeeCollector funded successfully" -ForegroundColor Green
    } else {
        Write-Host "  ❌ FeeCollector funding failed: $result" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ FeeCollector funding error: $_" -ForegroundColor Red
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
$feeCollectorFinal = solana balance $FeeCollector --url devnet 2>&1

Write-Host "  Buyer (Receiver):  $buyerFinal" -ForegroundColor White
Write-Host "  Seller (Sender):   $sellerFinal" -ForegroundColor White
Write-Host "  Admin:             $adminFinal" -ForegroundColor White
Write-Host "  FeeCollector:      $feeCollectorFinal" -ForegroundColor White
Write-Host ""

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "✅ Funding Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now run the E2E tests:" -ForegroundColor White
Write-Host "  npm run test:e2e:devnet:nft-swap" -ForegroundColor Green
Write-Host ""
Write-Host "Note: 4 wallets are now configured:" -ForegroundColor Yellow
Write-Host "  Buyer/Receiver   - Pays USDC, receives NFT" -ForegroundColor Gray
Write-Host "  Seller/Sender    - Owns NFT, receives USDC (99%)" -ForegroundColor Gray
Write-Host "  Admin            - Performs escrow operations" -ForegroundColor Gray
Write-Host "  FeeCollector     - Receives fees (1% - treasury, receive-only)" -ForegroundColor Gray
Write-Host ""

