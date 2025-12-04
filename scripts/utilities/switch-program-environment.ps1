#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Switch between program environments (dev, staging, production)

.DESCRIPTION
    This script switches the program environment by:
    1. Copying the correct program keypair to target/deploy/
    2. Updating the declare_id! in the program source
    3. Optionally building the program with the new ID

.PARAMETER Environment
    The target environment: dev, staging, or production

.PARAMETER Build
    If specified, builds the program after switching

.PARAMETER Deploy
    If specified, deploys the program after building

.EXAMPLE
    .\scripts\utilities\switch-program-environment.ps1 -Environment dev
    Switches to dev environment without building

.EXAMPLE
    .\scripts\utilities\switch-program-environment.ps1 -Environment staging -Build
    Switches to staging and builds the program

.EXAMPLE
    .\scripts\utilities\switch-program-environment.ps1 -Environment staging -Build -Deploy
    Switches to staging, builds, and deploys the program
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('dev', 'staging', 'production')]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [switch]$Build,
    
    [Parameter(Mandatory=$false)]
    [switch]$Deploy
)

# Environment configuration
$envConfig = @{
    dev = @{
        ProgramId = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
        KeypairPath = "wallets/dev/escrow-program-keypair.json"
        AnchorConfig = "Anchor.dev.toml"
        Network = "devnet"
        Description = "Development environment"
    }
    staging = @{
        ProgramId = "AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei"
        KeypairPath = "wallets/staging/escrow-program-keypair.json"
        AnchorConfig = "Anchor.staging.toml"
        Network = "devnet"
        Description = "Staging environment (production-like on devnet)"
    }
    production = @{
        ProgramId = "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx"
        KeypairPath = "wallets/production/escrow-program-keypair.json"
        AnchorConfig = "Anchor.mainnet.toml"
        Network = "mainnet"
        Description = "Production environment (mainnet)"
    }
}

$config = $envConfig[$Environment]
$programSourcePath = "programs/escrow/src/lib.rs"
$targetKeypairPath = "target/deploy/escrow-keypair.json"

Write-Host "`n🔄 Switching to $($Environment.ToUpper()) environment..." -ForegroundColor Cyan
Write-Host "   $($config.Description)" -ForegroundColor Gray
Write-Host ""

# Validate keypair exists
if (-not (Test-Path $config.KeypairPath)) {
    Write-Host "❌ Error: Keypair not found at $($config.KeypairPath)" -ForegroundColor Red
    
    if ($Environment -eq "production") {
        Write-Host "   Production keypair needs to be generated first." -ForegroundColor Yellow
        Write-Host "   Run: solana-keygen new --outfile $($config.KeypairPath)" -ForegroundColor Cyan
    }
    
    exit 1
}

# 1. Copy program keypair
Write-Host "📋 Copying program keypair..." -ForegroundColor Yellow
try {
    Copy-Item $config.KeypairPath $targetKeypairPath -Force
    Write-Host "   ✅ Keypair copied to target/deploy/" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed to copy keypair: $_" -ForegroundColor Red
    exit 1
}

# Verify the keypair matches expected program ID
$actualProgramId = solana-keygen pubkey $targetKeypairPath
if ($actualProgramId -ne $config.ProgramId) {
    Write-Host "   ⚠️  Warning: Keypair public key mismatch!" -ForegroundColor Yellow
    Write-Host "   Expected: $($config.ProgramId)" -ForegroundColor Gray
    Write-Host "   Actual:   $actualProgramId" -ForegroundColor Gray
}

# 2. Update program source declare_id!
Write-Host "`n📝 Updating program source code..." -ForegroundColor Yellow
try {
    $content = Get-Content $programSourcePath -Raw
    
    # Find and replace declare_id! line
    if ($content -match 'declare_id!\("([^"]+)"\);') {
        $oldId = $Matches[1]
        $newContent = $content -replace 'declare_id!\("[^"]+"\);', "declare_id!(`"$($config.ProgramId)`");"
        Set-Content $programSourcePath $newContent -NoNewline
        
        Write-Host "   ✅ Updated declare_id!" -ForegroundColor Green
        Write-Host "   Old: $oldId" -ForegroundColor Gray
        Write-Host "   New: $($config.ProgramId)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Could not find declare_id! in source" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Failed to update source: $_" -ForegroundColor Red
    exit 1
}

# 3. Display environment details
Write-Host "`n📊 Environment Details:" -ForegroundColor Cyan
Write-Host "   Program ID:    $($config.ProgramId)" -ForegroundColor White
Write-Host "   Network:       $($config.Network)" -ForegroundColor White
Write-Host "   Anchor Config: $($config.AnchorConfig)" -ForegroundColor White
Write-Host "   Keypair:       $($config.KeypairPath)" -ForegroundColor White

# 4. Build if requested
if ($Build) {
    Write-Host "`n🔨 Building program..." -ForegroundColor Yellow
    
    # Set HOME for Windows
    $env:HOME = $env:USERPROFILE
    
    try {
        anchor build
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Build successful" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "   ❌ Build failed: $_" -ForegroundColor Red
        exit 1
    }
}

# 5. Deploy if requested
if ($Deploy) {
    if (-not $Build) {
        Write-Host "`n⚠️  Warning: -Deploy specified without -Build" -ForegroundColor Yellow
        Write-Host "   The program should be built before deployment." -ForegroundColor Gray
        $response = Read-Host "   Continue with deployment? (y/n)"
        if ($response -ne 'y') {
            Write-Host "   Deployment cancelled" -ForegroundColor Yellow
            exit 0
        }
    }
    
    Write-Host "`n🚀 Deploying program to $($config.Network)..." -ForegroundColor Yellow
    
    $clusterUrl = if ($config.Network -eq "devnet") { "devnet" } else { "mainnet-beta" }
    
    try {
        # Set HOME for Windows
        $env:HOME = $env:USERPROFILE
        
        anchor deploy --provider.cluster $clusterUrl
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Deployment successful" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Deployment failed with exit code $LASTEXITCODE" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "   ❌ Deployment failed: $_" -ForegroundColor Red
        exit 1
    }
}

# Success summary
Write-Host "`n✅ Successfully switched to $($Environment.ToUpper()) environment!" -ForegroundColor Green

if (-not $Build) {
    Write-Host "`n💡 Next steps:" -ForegroundColor Magenta
    Write-Host "   To build:  .\scripts\utilities\switch-program-environment.ps1 -Environment $Environment -Build" -ForegroundColor Cyan
    Write-Host "   To deploy: .\scripts\utilities\switch-program-environment.ps1 -Environment $Environment -Build -Deploy" -ForegroundColor Cyan
}

Write-Host ""

