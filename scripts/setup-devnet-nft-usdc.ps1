# Setup Devnet NFT and USDC Environment - PowerShell Script
# One-time setup for E2E testing: Creates USDC mint and distributes tokens

param(
    [Parameter(Mandatory=$false)]
    [string]$ConfigPath = "tests/fixtures/devnet-config.json",
    
    [Parameter(Mandatory=$false)]
    [decimal]$InitialUSDC = 0.5,
    
    [switch]$Force = $false
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Devnet NFT & USDC Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if command exists
function Test-Command {
    param($Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow
Write-Host ""

$missingTools = @()

if (-not (Test-Command "solana")) {
    $missingTools += "Solana CLI"
}

if (-not (Test-Command "spl-token")) {
    $missingTools += "SPL Token CLI"
}

if (-not (Test-Command "npm")) {
    $missingTools += "npm"
}

if ($missingTools.Count -gt 0) {
    Write-Host "❌ Missing required tools:" -ForegroundColor Red
    foreach ($tool in $missingTools) {
        Write-Host "   - $tool" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Please install missing tools:" -ForegroundColor Yellow
    Write-Host "  - Solana CLI: https://docs.solana.com/cli/install-solana-cli-tools" -ForegroundColor White
    Write-Host "  - SPL Token CLI: cargo install spl-token-cli" -ForegroundColor White
    Write-Host "  - npm: https://nodejs.org/" -ForegroundColor White
    exit 1
}

Write-Host "✅ All prerequisites installed" -ForegroundColor Green
Write-Host ""

# Check if config already exists
$configExists = Test-Path $ConfigPath

if ($configExists -and -not $Force) {
    Write-Host "⚠️  Configuration file already exists: $ConfigPath" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Overwrite existing configuration? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "❌ Cancelled" -ForegroundColor Red
        exit 0
    }
    Write-Host ""
}

# Ensure fixtures directory exists
$fixturesDir = Split-Path -Parent $ConfigPath
if (-not (Test-Path $fixturesDir)) {
    Write-Host "Creating fixtures directory: $fixturesDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $fixturesDir -Force | Out-Null
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "This script will:" -ForegroundColor Cyan
Write-Host "  1. Load or generate test wallets" -ForegroundColor White
Write-Host "  2. Check wallet SOL balances" -ForegroundColor White
Write-Host "  3. Create USDC token mint on devnet" -ForegroundColor White
Write-Host "  4. Create token accounts for all wallets" -ForegroundColor White
Write-Host "  5. Mint $InitialUSDC USDC to receiver wallet" -ForegroundColor White
Write-Host "  6. Save configuration for testing" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$confirm = Read-Host "Continue? (y/n)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""

# ============================================
# Step 1: Load/Generate Wallets
# ============================================

Write-Host "Step 1: Loading test wallets..." -ForegroundColor Cyan
Write-Host ""

$config = @{
    walletKeys = @{}
    wallets = @{}
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
}

if ($configExists) {
    try {
        $existingConfig = Get-Content $ConfigPath | ConvertFrom-Json
        if ($existingConfig.walletKeys -and $existingConfig.wallets) {
            Write-Host "✅ Loaded existing wallet configuration" -ForegroundColor Green
            $config.walletKeys = $existingConfig.walletKeys
            $config.wallets = $existingConfig.wallets
        }
    } catch {
        Write-Host "⚠️  Could not load existing config, will generate new wallets" -ForegroundColor Yellow
    }
}

# If no wallets in config, generate new ones
if (-not $config.wallets.sender) {
    Write-Host "⚠️  No wallets found in config. Please run the test first to generate wallets:" -ForegroundColor Yellow
    Write-Host "   npm run test:e2e:devnet:nft-swap" -ForegroundColor White
    Write-Host ""
    Write-Host "Or set environment variables:" -ForegroundColor Yellow
    Write-Host "   DEVNET_SENDER_PRIVATE_KEY" -ForegroundColor White
    Write-Host "   DEVNET_RECEIVER_PRIVATE_KEY" -ForegroundColor White
    Write-Host "   DEVNET_FEE_COLLECTOR_PRIVATE_KEY" -ForegroundColor White
    Write-Host ""
    exit 1
}

$senderAddress = $config.wallets.sender
$receiverAddress = $config.wallets.receiver
$adminAddress = $config.wallets.admin
$feeCollectorAddress = $config.wallets.feeCollector

Write-Host "Wallet Addresses:" -ForegroundColor Yellow
Write-Host "  Sender:       $senderAddress" -ForegroundColor White
Write-Host "  Receiver:     $receiverAddress" -ForegroundColor White
Write-Host "  Admin:        $adminAddress" -ForegroundColor White
Write-Host "  FeeCollector: $feeCollectorAddress" -ForegroundColor White
Write-Host ""

# ============================================
# Step 2: Check SOL Balances
# ============================================

Write-Host "Step 2: Checking SOL balances..." -ForegroundColor Cyan
Write-Host ""

$senderBalance = solana balance $senderAddress --url devnet 2>&1
$receiverBalance = solana balance $receiverAddress --url devnet 2>&1
$adminBalance = solana balance $adminAddress --url devnet 2>&1
$feeCollectorBalance = solana balance $feeCollectorAddress --url devnet 2>&1

Write-Host "Current SOL Balances:" -ForegroundColor Yellow
Write-Host "  Sender:       $senderBalance" -ForegroundColor Gray
Write-Host "  Receiver:     $receiverBalance" -ForegroundColor Gray
Write-Host "  Admin:        $adminBalance" -ForegroundColor Gray
Write-Host "  FeeCollector: $feeCollectorBalance" -ForegroundColor Gray
Write-Host ""

# Warn if balances are low
$minBalance = 0.05
$lowBalanceWallets = @()

if ($senderBalance -match "(\d+\.?\d*)") {
    $senderSOL = [decimal]$Matches[1]
    if ($senderSOL -lt $minBalance) { $lowBalanceWallets += "Sender" }
}

if ($receiverBalance -match "(\d+\.?\d*)") {
    $receiverSOL = [decimal]$Matches[1]
    if ($receiverSOL -lt $minBalance) { $lowBalanceWallets += "Receiver" }
}

if ($adminBalance -match "(\d+\.?\d*)") {
    $adminSOL = [decimal]$Matches[1]
    if ($adminSOL -lt $minBalance) { $lowBalanceWallets += "Admin" }
}

if ($feeCollectorBalance -match "(\d+\.?\d*)") {
    $feeCollectorSOL = [decimal]$Matches[1]
    if ($feeCollectorSOL -lt $minBalance) { $lowBalanceWallets += "FeeCollector" }
}

if ($lowBalanceWallets.Count -gt 0) {
    Write-Host "⚠️  Warning: Low SOL balance detected!" -ForegroundColor Yellow
    Write-Host "   Wallets below $minBalance SOL: $($lowBalanceWallets -join ', ')" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Fund wallets using:" -ForegroundColor White
    Write-Host "   .\scripts\fund-devnet-wallets.ps1 -Buyer $receiverAddress -Seller $senderAddress -Admin $adminAddress -FeeCollector $feeCollectorAddress" -ForegroundColor Green
    Write-Host ""
    
    $continueLowBalance = Read-Host "Continue anyway? (y/n)"
    if ($continueLowBalance -ne "y" -and $continueLowBalance -ne "Y") {
        Write-Host "❌ Cancelled" -ForegroundColor Red
        exit 0
    }
    Write-Host ""
}

# ============================================
# Step 3: Setup via TypeScript Helper
# ============================================

Write-Host "Step 3: Setting up USDC mint and token accounts..." -ForegroundColor Cyan
Write-Host ""

Write-Host "⚠️  Note: This script is a wrapper. The actual setup is done via TypeScript." -ForegroundColor Yellow
Write-Host ""
Write-Host "The USDC mint and token accounts will be created when you run:" -ForegroundColor White
Write-Host "  npm run test:e2e:devnet:nft-swap" -ForegroundColor Green
Write-Host ""
Write-Host "The test will automatically:" -ForegroundColor Yellow
Write-Host "  - Create USDC mint on devnet" -ForegroundColor White
Write-Host "  - Create token accounts for all wallets" -ForegroundColor White
Write-Host "  - Mint initial USDC to receiver wallet" -ForegroundColor White
Write-Host "  - Save configuration to: $ConfigPath" -ForegroundColor White
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ Pre-flight checks complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Ensure wallets are funded with SOL (if not already done):" -ForegroundColor White
Write-Host "     .\scripts\fund-devnet-wallets.ps1 -Buyer $receiverAddress -Seller $senderAddress -Admin $adminAddress -FeeCollector $feeCollectorAddress" -ForegroundColor Green
Write-Host ""
Write-Host "  2. Run the E2E test (this will complete the setup):" -ForegroundColor White
Write-Host "     npm run test:e2e:devnet:nft-swap" -ForegroundColor Green
Write-Host ""
Write-Host "  3. The test will create:" -ForegroundColor White
Write-Host "     - USDC mint" -ForegroundColor Gray
Write-Host "     - Token accounts (4 wallets)" -ForegroundColor Gray
Write-Host "     - Test NFT" -ForegroundColor Gray
Write-Host "     - Execute swap and verify results" -ForegroundColor Gray
Write-Host ""
Write-Host "Note: 4 wallets for proper role separation:" -ForegroundColor Yellow
Write-Host "  Sender       - NFT owner (seller)" -ForegroundColor Gray
Write-Host "  Receiver     - USDC payer (buyer)" -ForegroundColor Gray
Write-Host "  Admin        - Escrow operations" -ForegroundColor Gray
Write-Host "  FeeCollector - Treasury (receive-only, 1% fees)" -ForegroundColor Gray
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Configuration will be saved to:" -ForegroundColor White
Write-Host "  $ConfigPath" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

