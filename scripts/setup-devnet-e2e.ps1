# Setup script for E2E Devnet Testing (Task 37) - PowerShell version
# This script prepares the environment for running comprehensive devnet E2E tests

param(
    [switch]$SkipAirdrop = $false
)

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Devnet E2E Testing Setup" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if Solana CLI is installed
Write-Host "Checking Solana CLI..." -ForegroundColor Yellow
try {
    $solanaVersion = solana --version
    Write-Host "✅ Solana CLI installed: $solanaVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Solana CLI not found" -ForegroundColor Red
    Write-Host "Please install Solana CLI:" -ForegroundColor White
    Write-Host "  Use scripts\install-solana-tools.ps1" -ForegroundColor Gray
    exit 1
}
Write-Host ""

# Check if we're configured for devnet
Write-Host "Checking Solana configuration..." -ForegroundColor Yellow
$configOutput = solana config get
$currentCluster = $configOutput | Select-String "RPC URL" | ForEach-Object { $_.Line.Split()[-1] }
Write-Host "Current RPC: $currentCluster" -ForegroundColor White

if ($currentCluster -notlike "*devnet*") {
    Write-Host "⚠️  Not configured for devnet" -ForegroundColor Yellow
    $response = Read-Host "Configure for devnet now? (y/n)"
    if ($response -eq "y" -or $response -eq "Y") {
        solana config set --url devnet
        Write-Host "✅ Configured for devnet" -ForegroundColor Green
    } else {
        Write-Host "❌ Devnet configuration required" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ Already configured for devnet" -ForegroundColor Green
}
Write-Host ""

# Check if program is deployed
Write-Host "Checking program deployment..." -ForegroundColor Yellow
$programId = "4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"

try {
    $programAccount = solana account $programId --url devnet 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Program deployed: $programId" -ForegroundColor Green
        Write-Host ($programAccount | Select-Object -First 5) -ForegroundColor Gray
    } else {
        throw "Program not found"
    }
} catch {
    Write-Host "❌ Program not found on devnet" -ForegroundColor Red
    Write-Host "Please deploy the program first:" -ForegroundColor White
    Write-Host "  anchor deploy --provider.cluster devnet" -ForegroundColor Gray
    exit 1
}
Write-Host ""

# Check wallet balance
Write-Host "Checking wallet balance..." -ForegroundColor Yellow
$walletAddress = solana address
$balanceOutput = solana balance --url devnet 2>&1
$balance = if ($balanceOutput -match "(\d+\.?\d*)\s*SOL") { [float]$matches[1] } else { 0 }

Write-Host "Wallet: $walletAddress" -ForegroundColor White
Write-Host "Balance: $balance SOL" -ForegroundColor White

if ($balance -lt 1 -and -not $SkipAirdrop) {
    Write-Host "⚠️  Low balance. Requesting airdrop..." -ForegroundColor Yellow
    try {
        solana airdrop 2 --url devnet
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Airdrop successful" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Airdrop failed (rate limit?). You may need to manually fund test wallets." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Airdrop failed (rate limit?). You may need to manually fund test wallets." -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ Sufficient balance" -ForegroundColor Green
}
Write-Host ""

# Check for USDC devnet mint
Write-Host "Checking devnet USDC..." -ForegroundColor Yellow
$devnetUsdc = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"

try {
    solana account $devnetUsdc --url devnet 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Devnet USDC verified: $devnetUsdc" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Cannot verify USDC mint" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Cannot verify USDC mint" -ForegroundColor Yellow
}
Write-Host ""

# Check Node.js and dependencies
Write-Host "Checking Node.js dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  Dependencies not installed" -ForegroundColor Yellow
    Write-Host "Installing..." -ForegroundColor White
    npm install
} else {
    Write-Host "✅ Dependencies ready" -ForegroundColor Green
}
Write-Host ""

# Check if Anchor is installed
Write-Host "Checking Anchor..." -ForegroundColor Yellow
try {
    $anchorVersion = anchor --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Anchor installed: $anchorVersion" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Anchor CLI not found" -ForegroundColor Yellow
        Write-Host "Please install Anchor:" -ForegroundColor White
        Write-Host "  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  Anchor CLI not found" -ForegroundColor Yellow
    Write-Host "Please install Anchor:" -ForegroundColor White
    Write-Host "  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force" -ForegroundColor Gray
}
Write-Host ""

# Create directories for test output
Write-Host "Creating output directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "receipts" | Out-Null
New-Item -ItemType Directory -Force -Path "test-reports" | Out-Null
Write-Host "✅ Directories created" -ForegroundColor Green
Write-Host ""

# Environment setup
Write-Host "Setting up environment..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found" -ForegroundColor Yellow
    Write-Host "Creating .env with devnet defaults..." -ForegroundColor White
    
    $envContent = @"
# Devnet E2E Testing Configuration
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd

# Database (if needed for integration)
DATABASE_URL=postgresql://localhost:5432/easyescrow_test

# API Configuration
PORT=3000
NODE_ENV=test
"@
    
    Set-Content -Path ".env" -Value $envContent
    Write-Host "✅ .env file created" -ForegroundColor Green
} else {
    Write-Host "✅ .env file exists" -ForegroundColor Green
    
    # Check if devnet config is set
    $envContent = Get-Content ".env" -Raw
    if ($envContent -notmatch "SOLANA_NETWORK=devnet") {
        Write-Host "⚠️  Adding devnet configuration to .env" -ForegroundColor Yellow
        Add-Content -Path ".env" -Value "`n# Devnet Configuration"
        Add-Content -Path ".env" -Value "SOLANA_NETWORK=devnet"
        Add-Content -Path ".env" -Value "SOLANA_RPC_URL=https://api.devnet.solana.com"
    }
}
Write-Host ""

# Summary
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Setup Complete! ✅" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now run E2E tests:" -ForegroundColor White
Write-Host "  npm run test:e2e:devnet" -ForegroundColor Green
Write-Host ""
Write-Host "Or run specific scenarios:" -ForegroundColor White
Write-Host "  npm run test:e2e:devnet -- --grep `"Happy Path`"" -ForegroundColor Gray
Write-Host "  npm run test:e2e:devnet -- --grep `"Expiry Path`"" -ForegroundColor Gray
Write-Host "  npm run test:e2e:devnet -- --grep `"Race Condition`"" -ForegroundColor Gray
Write-Host ""
Write-Host "Resources:" -ForegroundColor White
Write-Host "  - Program Explorer: https://explorer.solana.com/address/$programId`?cluster=devnet" -ForegroundColor Gray
Write-Host "  - Wallet Explorer: https://explorer.solana.com/address/$walletAddress`?cluster=devnet" -ForegroundColor Gray
Write-Host "  - USDC Faucet: https://spl-token-faucet.com/?token-name=USDC-Dev" -ForegroundColor Gray
Write-Host "  - Solana Status: https://status.solana.com/" -ForegroundColor Gray
Write-Host ""
Write-Host "Documentation:" -ForegroundColor White
Write-Host "  - tests/e2e/README.md" -ForegroundColor Gray
Write-Host ""

