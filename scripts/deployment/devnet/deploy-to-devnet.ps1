# Deploy Escrow Program to Solana Devnet
# This script automates the devnet deployment process

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Solana Escrow - Devnet Deployment" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if command exists
function Test-CommandExists {
    param($Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Step 1: Verify Prerequisites
Write-Host "Step 1: Verifying prerequisites..." -ForegroundColor Yellow

$allInstalled = $true

if (Test-CommandExists "rustc") {
    $rustVersion = rustc --version
    Write-Host "✓ Rust installed: $rustVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Rust not installed" -ForegroundColor Red
    Write-Host "  Install from: https://rustup.rs/" -ForegroundColor Red
    $allInstalled = $false
}

if (Test-CommandExists "solana") {
    $solanaVersion = solana --version
    Write-Host "✓ Solana CLI installed: $solanaVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Solana CLI not installed" -ForegroundColor Red
    Write-Host "  See DEVNET_DEPLOYMENT_STATUS.md for installation instructions" -ForegroundColor Red
    $allInstalled = $false
}

if (Test-CommandExists "anchor") {
    $anchorVersion = anchor --version
    Write-Host "✓ Anchor installed: $anchorVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Anchor not installed" -ForegroundColor Red
    Write-Host "  Install with: cargo install --git https://github.com/coral-xyz/anchor avm --locked --force" -ForegroundColor Red
    Write-Host "  Then: avm install 0.32.1 && avm use 0.32.1" -ForegroundColor Red
    $allInstalled = $false
}

if (-not $allInstalled) {
    Write-Host ""
    Write-Host "Please install missing prerequisites before continuing." -ForegroundColor Red
    Write-Host "See DEVNET_DEPLOYMENT_STATUS.md for detailed instructions." -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 2: Build the program
Write-Host "Step 2: Building the Solana program..." -ForegroundColor Yellow
Write-Host "Running: anchor build" -ForegroundColor Gray

try {
    anchor build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }
    Write-Host "✓ Build successful" -ForegroundColor Green
} catch {
    Write-Host "✗ Build failed: $_" -ForegroundColor Red
    Write-Host "Please fix build errors and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 3: Get program ID
Write-Host "Step 3: Getting program ID..." -ForegroundColor Yellow
$programId = (anchor keys list | Select-String "escrow:" | ForEach-Object { $_.Line.Split(':')[1].Trim() })
Write-Host "Program ID: $programId" -ForegroundColor Cyan

Write-Host ""

# Step 4: Configure Solana
Write-Host "Step 4: Configuring Solana for devnet..." -ForegroundColor Yellow

$currentCluster = solana config get | Select-String "RPC URL:" | ForEach-Object { $_.Line }
Write-Host "Current config: $currentCluster" -ForegroundColor Gray

Write-Host "Setting cluster to devnet..." -ForegroundColor Gray
solana config set --url devnet

Write-Host ""

# Step 5: Check SOL balance
Write-Host "Step 5: Checking SOL balance..." -ForegroundColor Yellow
$address = solana address
Write-Host "Wallet address: $address" -ForegroundColor Cyan

$balance = solana balance --lamports | ForEach-Object { [decimal]$_ / 1000000000 }
Write-Host "Current balance: $balance SOL" -ForegroundColor Cyan

if ($balance -lt 5) {
    Write-Host "Insufficient SOL for deployment (need ~5 SOL)" -ForegroundColor Yellow
    Write-Host "Requesting airdrops..." -ForegroundColor Yellow
    
    $airdropsNeeded = [Math]::Ceiling((5 - $balance) / 2)
    for ($i = 0; $i -lt $airdropsNeeded; $i++) {
        Write-Host "Airdrop $($i+1)/$airdropsNeeded..." -ForegroundColor Gray
        solana airdrop 2
        Start-Sleep -Seconds 2
    }
    
    $newBalance = solana balance --lamports | ForEach-Object { [decimal]$_ / 1000000000 }
    Write-Host "New balance: $newBalance SOL" -ForegroundColor Green
}

Write-Host ""

# Step 6: Deploy
Write-Host "Step 6: Deploying to devnet..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

try {
    anchor deploy
    if ($LASTEXITCODE -ne 0) {
        throw "Deployment failed with exit code $LASTEXITCODE"
    }
    Write-Host ""
    Write-Host "✓ Deployment successful!" -ForegroundColor Green
} catch {
    Write-Host "✗ Deployment failed: $_" -ForegroundColor Red
    Write-Host "Check the error messages above for details." -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 7: Verify deployment
Write-Host "Step 7: Verifying deployment..." -ForegroundColor Yellow
Write-Host "Running: solana program show $programId" -ForegroundColor Gray
Write-Host ""

solana program show $programId

Write-Host ""

# Success message
Write-Host "==================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host ""
Write-Host "Program ID: $programId" -ForegroundColor Cyan
Write-Host "Network: Devnet" -ForegroundColor Cyan
Write-Host "Explorer: https://explorer.solana.com/address/$programId?cluster=devnet" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. View your program on Solana Explorer (link above)" -ForegroundColor White
Write-Host "2. Update environment variables with the program ID" -ForegroundColor White
Write-Host "3. Run integration tests on devnet" -ForegroundColor White
Write-Host "4. Test all program instructions" -ForegroundColor White
Write-Host ""
Write-Host "See DEVNET_DEPLOYMENT_STATUS.md for more details." -ForegroundColor Gray
Write-Host ""

# Save deployment info
$deploymentInfo = @"
Deployment Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Network: Devnet
Program ID: $programId
Deployer: $address
Status: Success
Explorer: https://explorer.solana.com/address/$programId?cluster=devnet
"@

$deploymentInfo | Out-File -FilePath "deployment-info.txt" -Encoding UTF8
Write-Host "Deployment info saved to deployment-info.txt" -ForegroundColor Gray

