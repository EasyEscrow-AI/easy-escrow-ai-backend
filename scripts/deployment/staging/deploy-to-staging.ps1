# Deploy Escrow Program to STAGING (Devnet)
# Uses Anchor.staging.toml and promotes verified build artifacts

param(
    [switch]$SkipChecksumVerification = $false,
    [switch]$SkipIDLUpload = $false,
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Deploy Escrow Program to STAGING" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$anchorConfig = "Anchor.staging.toml"
$programId = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
$deployerKeypair = "keys/staging-deployer.json"
$programSo = "target/deploy/escrow.so"
$programIdl = "target/idl/escrow.json"

# Pre-flight checks
Write-Host "🔍 Pre-flight checks..." -ForegroundColor Yellow
Write-Host ""

# Check Anchor config exists
if (-not (Test-Path $anchorConfig)) {
    Write-Host "❌ Anchor config not found: $anchorConfig" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Anchor config found: $anchorConfig" -ForegroundColor Green

# Check deployer keypair exists
if (-not (Test-Path $deployerKeypair)) {
    Write-Host "❌ Deployer keypair not found: $deployerKeypair" -ForegroundColor Red
    Write-Host "   Run: solana-keygen new -o $deployerKeypair" -ForegroundColor Yellow
    exit 1
}
Write-Host "  ✅ Deployer keypair found: $deployerKeypair" -ForegroundColor Green

# Check program artifacts exist
if (-not (Test-Path $programSo)) {
    Write-Host "❌ Program binary not found: $programSo" -ForegroundColor Red
    Write-Host "   Run: .\scripts\deployment\staging\build-with-checksums.ps1" -ForegroundColor Yellow
    exit 1
}
Write-Host "  ✅ Program binary found: $programSo" -ForegroundColor Green

if (-not (Test-Path $programIdl)) {
    Write-Host "❌ IDL file not found: $programIdl" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ IDL file found: $programIdl" -ForegroundColor Green

Write-Host ""

# Verify checksums
if (-not $SkipChecksumVerification) {
    Write-Host "🔐 Verifying artifact checksums..." -ForegroundColor Yellow
    
    $soHashFile = "$programSo.sha256"
    $idlHashFile = "$programIdl.sha256"
    
    if (-not (Test-Path $soHashFile)) {
        Write-Host "⚠️  Checksum file not found: $soHashFile" -ForegroundColor Yellow
        Write-Host "   Skipping checksum verification" -ForegroundColor Yellow
    } else {
        $expectedSoHash = Get-Content $soHashFile
        $actualSoHash = (Get-FileHash -Path $programSo -Algorithm SHA256).Hash.ToLower()
        
        if ($expectedSoHash -eq $actualSoHash) {
            Write-Host "  ✅ escrow.so checksum verified" -ForegroundColor Green
        } else {
            Write-Host "  ❌ escrow.so checksum mismatch!" -ForegroundColor Red
            Write-Host "     Expected: $expectedSoHash" -ForegroundColor Red
            Write-Host "     Got:      $actualSoHash" -ForegroundColor Red
            exit 1
        }
    }
    
    if (-not (Test-Path $idlHashFile)) {
        Write-Host "⚠️  Checksum file not found: $idlHashFile" -ForegroundColor Yellow
        Write-Host "   Skipping checksum verification" -ForegroundColor Yellow
    } else {
        $expectedIdlHash = Get-Content $idlHashFile
        $actualIdlHash = (Get-FileHash -Path $programIdl -Algorithm SHA256).Hash.ToLower()
        
        if ($expectedIdlHash -eq $actualIdlHash) {
            Write-Host "  ✅ escrow.json checksum verified" -ForegroundColor Green
        } else {
            Write-Host "  ❌ escrow.json checksum mismatch!" -ForegroundColor Red
            Write-Host "     Expected: $expectedIdlHash" -ForegroundColor Red
            Write-Host "     Got:      $actualIdlHash" -ForegroundColor Red
            exit 1
        }
    }
    
    Write-Host ""
}

# Get deployer info
Write-Host "📋 Deployment Configuration:" -ForegroundColor Yellow
$deployerPubkey = solana-keygen pubkey $deployerKeypair
Write-Host "  Deployer:     $deployerPubkey" -ForegroundColor White
Write-Host "  Program ID:   $programId" -ForegroundColor White
Write-Host "  Network:      Devnet" -ForegroundColor White
Write-Host "  Config:       $anchorConfig" -ForegroundColor White
Write-Host ""

# Check deployer balance
Write-Host "💰 Checking deployer balance..." -ForegroundColor Yellow
$balance = solana balance $deployerPubkey --url devnet 2>&1
Write-Host "  Balance: $balance" -ForegroundColor White

# Extract numeric value
$balanceValue = [double]($balance -replace '[^\d.]', '')
if ($balanceValue -lt 5.0) {
    Write-Host "  ⚠️  Low balance! Minimum 5 SOL recommended for deployment" -ForegroundColor Yellow
    Write-Host "     Run: solana airdrop 5 $deployerPubkey --url devnet" -ForegroundColor Yellow
    Write-Host ""
    
    if (-not $DryRun) {
        $continue = Read-Host "Continue anyway? (yes/no)"
        if ($continue -ne "yes") {
            Write-Host "Deployment cancelled" -ForegroundColor Yellow
            exit 0
        }
    }
}
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No deployment will occur" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Would execute:" -ForegroundColor Cyan
    Write-Host "  anchor deploy -C $anchorConfig --provider.cluster devnet --provider.wallet $deployerKeypair" -ForegroundColor White
    Write-Host ""
    Write-Host "Run without -DryRun to deploy" -ForegroundColor Yellow
    exit 0
}

# Deploy program
Write-Host "🚀 Deploying program to STAGING..." -ForegroundColor Yellow
Write-Host "   This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

$deployStart = Get-Date

try {
    # Set environment to use devnet
    $env:ANCHOR_PROVIDER_URL = "https://api.devnet.solana.com"
    
    # Deploy using Anchor
    Write-Host "Executing: anchor deploy -C $anchorConfig --provider.cluster devnet --provider.wallet $deployerKeypair" -ForegroundColor Gray
    anchor deploy -C $anchorConfig --provider.cluster devnet --provider.wallet $deployerKeypair
    
    if ($LASTEXITCODE -ne 0) {
        throw "Deployment failed with exit code $LASTEXITCODE"
    }
    
    $deployEnd = Get-Date
    $deployDuration = ($deployEnd - $deployStart).TotalSeconds
    
    Write-Host ""
    Write-Host "✅ Program deployed successfully in $([math]::Round($deployDuration, 2)) seconds!" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
    exit 1
}

# Verify deployment
Write-Host "🔍 Verifying deployment..." -ForegroundColor Yellow

try {
    $programInfo = solana program show $programId --url devnet 2>&1
    Write-Host $programInfo
    Write-Host ""
    Write-Host "✅ Program verification successful" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "⚠️  Could not verify program: $_" -ForegroundColor Yellow
    Write-Host ""
}

# Upload/Update IDL
if (-not $SkipIDLUpload) {
    Write-Host "📤 Uploading IDL to Devnet..." -ForegroundColor Yellow
    
    try {
        # Check if IDL exists first
        $idlCheck = anchor idl fetch $programId --provider.cluster devnet 2>&1
        
        if ($idlCheck -match "IDL not found") {
            Write-Host "  First-time IDL initialization..." -ForegroundColor Gray
            anchor idl init $programId $programIdl -C $anchorConfig --provider.cluster devnet --provider.wallet $deployerKeypair
        } else {
            Write-Host "  Upgrading existing IDL..." -ForegroundColor Gray
            anchor idl upgrade $programId $programIdl -C $anchorConfig --provider.cluster devnet --provider.wallet $deployerKeypair
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ IDL uploaded successfully" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  IDL upload failed" -ForegroundColor Yellow
        }
        Write-Host ""
        
    } catch {
        Write-Host "  ⚠️  IDL upload error: $_" -ForegroundColor Yellow
        Write-Host ""
    }
}

# Log deployment details
Write-Host "📝 Logging deployment details..." -ForegroundColor Yellow

$gitCommit = git rev-parse HEAD 2>&1
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$deploymentRecord = @{
    timestamp = $timestamp
    environment = "STAGING"
    network = "devnet"
    programId = $programId
    deployer = $deployerPubkey
    gitCommit = $gitCommit
    duration = [math]::Round($deployDuration, 2)
    artifacts = @{
        programHash = (Get-FileHash -Path $programSo -Algorithm SHA256).Hash.ToLower()
        idlHash = (Get-FileHash -Path $programIdl -Algorithm SHA256).Hash.ToLower()
    }
}

$deploymentJson = $deploymentRecord | ConvertTo-Json -Depth 10
$deploymentFile = "target/deploy/deployment-staging-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
Set-Content -Path $deploymentFile -Value $deploymentJson

Write-Host "✅ Deployment record saved: $deploymentFile" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ STAGING Deployment Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Deployment Summary:" -ForegroundColor Yellow
Write-Host "  Environment:  STAGING (Devnet)" -ForegroundColor White
Write-Host "  Program ID:   $programId" -ForegroundColor White
Write-Host "  Deployer:     $deployerPubkey" -ForegroundColor White
Write-Host "  Git Commit:   $gitCommit" -ForegroundColor White
Write-Host "  Timestamp:    $timestamp" -ForegroundColor White
Write-Host "  Duration:     $([math]::Round($deployDuration, 2))s" -ForegroundColor White
Write-Host ""

Write-Host "Explorer:" -ForegroundColor Yellow
Write-Host "  https://explorer.solana.com/address/$programId`?cluster=devnet" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Run post-deploy migration: npm run staging:migrate" -ForegroundColor White
Write-Host "  2. Fund test wallets: .\scripts\deployment\staging\fund-staging-wallets.ps1" -ForegroundColor White
Write-Host "  3. Run smoke tests: npm run test:staging:smoke" -ForegroundColor White
Write-Host ""

