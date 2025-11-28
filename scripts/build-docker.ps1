# Docker Build Script for Solana Programs (PowerShell)
# Purpose: Build Solana program using Docker to avoid Windows build script issues
# Usage: .\scripts\build-docker.ps1

param(
    [string]$RustVersion = "1.79",
    [string]$SolanaVersion = "v1.18.26",
    [string]$AnchorVersion = "0.29.0"
)

# Stop on errors
$ErrorActionPreference = "Stop"

Write-Host "🐳 Docker Build for Solana Program" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$ImageName = "easyescrow-builder"
$RepoRoot = git rev-parse --show-toplevel
$OutputDir = Join-Path $RepoRoot "target\docker-deploy"

Write-Host "📋 Configuration:" -ForegroundColor Yellow
Write-Host "   Rust: $RustVersion"
Write-Host "   Solana CLI: $SolanaVersion"
Write-Host "   Anchor: $AnchorVersion"
Write-Host "   Output: $OutputDir"
Write-Host ""

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Write-Host "✅ Created output directory" -ForegroundColor Green
}

# Build Docker image
Write-Host "🔨 Building Docker image..." -ForegroundColor Cyan
Write-Host "   (This takes ~10-15 minutes on first run, cached afterward)" -ForegroundColor Gray
Write-Host ""

try {
    docker build `
        --build-arg RUST_VERSION=$RustVersion `
        --build-arg SOLANA_CLI=$SolanaVersion `
        --build-arg ANCHOR_VERSION=$AnchorVersion `
        -t $ImageName `
        -f Dockerfile.solana-build `
        .
    
    if ($LASTEXITCODE -ne 0) {
        throw "Docker build failed"
    }
    
    Write-Host ""
    Write-Host "✅ Docker image built successfully" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host ""
    Write-Host "❌ Docker build failed: $_" -ForegroundColor Red
    exit 1
}

# Build Solana program in Docker
Write-Host "🚀 Building Solana program..." -ForegroundColor Cyan
Write-Host "   (This takes ~5-10 minutes)" -ForegroundColor Gray
Write-Host ""

try {
    docker run --rm `
        --name "build-$ImageName" `
        -v "${OutputDir}:/workspace/target/deploy" `
        $ImageName
    
    if ($LASTEXITCODE -ne 0) {
        throw "Program build failed"
    }
    
    Write-Host ""
    Write-Host "✅ Program built successfully!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host ""
    Write-Host "❌ Program build failed: $_" -ForegroundColor Red
    exit 1
}

# Verify output
Write-Host "📦 Build Artifacts:" -ForegroundColor Yellow
if (Test-Path "$OutputDir\easyescrow.so") {
    $fileSize = (Get-Item "$OutputDir\easyescrow.so").Length
    $fileSizeKB = [math]::Round($fileSize / 1KB, 2)
    Write-Host "   ✅ easyescrow.so ($fileSizeKB KB)" -ForegroundColor Green
} else {
    Write-Host "   ❌ easyescrow.so NOT FOUND" -ForegroundColor Red
    exit 1
}

if (Test-Path "$OutputDir\easyescrow-keypair.json") {
    Write-Host "   ✅ easyescrow-keypair.json" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  easyescrow-keypair.json NOT FOUND" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Build Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Copy .so file to deploy directory:"
Write-Host "      Copy-Item target\docker-deploy\easyescrow.so target\deploy\"
Write-Host ""
Write-Host "   2. Deploy to staging:"
Write-Host "      solana config set --url devnet"
Write-Host "      anchor deploy"
Write-Host ""

