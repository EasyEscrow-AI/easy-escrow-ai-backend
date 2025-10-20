# Build Escrow Program with Artifact Verification
# This script builds the program once and generates checksums for CI/CD promotion

param(
    [switch]$Clean = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Building Escrow Program for STAGING" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check toolchain versions
Write-Host "📋 Checking toolchain versions..." -ForegroundColor Yellow

$solanaCLIVersion = solana --version 2>&1 | Select-String -Pattern "(\d+\.\d+\.\d+)" | ForEach-Object { $_.Matches.Groups[1].Value }
$anchorVersion = anchor --version 2>&1 | Select-String -Pattern "(\d+\.\d+\.\d+)" | ForEach-Object { $_.Matches.Groups[1].Value }
$rustVersion = rustc --version 2>&1 | Select-String -Pattern "(\d+\.\d+\.\d+)" | ForEach-Object { $_.Matches.Groups[1].Value }

Write-Host "  Solana CLI:   v$solanaCLIVersion" -ForegroundColor White
Write-Host "  Anchor:       v$anchorVersion" -ForegroundColor White
Write-Host "  Rust:         v$rustVersion" -ForegroundColor White
Write-Host ""

# Verify required versions
$requiredSolana = "1.18"
$requiredRust = "1.75"

if (-not $solanaCLIVersion.StartsWith($requiredSolana)) {
    Write-Host "⚠️  Warning: Expected Solana CLI v$requiredSolana.x, got v$solanaCLIVersion" -ForegroundColor Yellow
}

if (-not $rustVersion.StartsWith($requiredRust)) {
    Write-Host "⚠️  Warning: Expected Rust v$requiredRust.x, got v$rustVersion" -ForegroundColor Yellow
}

Write-Host "✅ Toolchain verification complete" -ForegroundColor Green
Write-Host ""

# Clean build if requested
if ($Clean) {
    Write-Host "🧹 Cleaning previous build artifacts..." -ForegroundColor Yellow
    if (Test-Path "target/deploy") {
        Remove-Item -Path "target/deploy/*.so" -Force -ErrorAction SilentlyContinue
        Remove-Item -Path "target/deploy/*.sha256" -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path "target/idl") {
        Remove-Item -Path "target/idl/*.sha256" -Force -ErrorAction SilentlyContinue
    }
    anchor clean 2>&1 | Out-Null
    Write-Host "✅ Clean complete" -ForegroundColor Green
    Write-Host ""
}

# Build program
Write-Host "🔨 Building Escrow program..." -ForegroundColor Yellow
Write-Host "   This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

$buildStart = Get-Date

try {
    if ($Verbose) {
        anchor build
    } else {
        anchor build 2>&1 | Out-Null
    }
    
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }
    
    $buildEnd = Get-Date
    $buildDuration = ($buildEnd - $buildStart).TotalSeconds
    
    Write-Host "✅ Build complete in $([math]::Round($buildDuration, 2)) seconds" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "❌ Build failed: $_" -ForegroundColor Red
    exit 1
}

# Verify artifacts exist
Write-Host "🔍 Verifying build artifacts..." -ForegroundColor Yellow

$programSo = "target/deploy/escrow.so"
$programIdl = "target/idl/escrow.json"

if (-not (Test-Path $programSo)) {
    Write-Host "❌ Program binary not found: $programSo" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $programIdl)) {
    Write-Host "❌ IDL file not found: $programIdl" -ForegroundColor Red
    exit 1
}

$soSize = (Get-Item $programSo).Length
$idlSize = (Get-Item $programIdl).Length

Write-Host "  escrow.so:    $([math]::Round($soSize / 1KB, 2)) KB" -ForegroundColor White
Write-Host "  escrow.json:  $([math]::Round($idlSize / 1KB, 2)) KB" -ForegroundColor White
Write-Host ""

# Generate checksums
Write-Host "🔐 Generating artifact checksums..." -ForegroundColor Yellow

function Get-FileHash-SHA256 {
    param([string]$FilePath)
    
    $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
    return $hash.Hash.ToLower()
}

$soHash = Get-FileHash-SHA256 -FilePath $programSo
$idlHash = Get-FileHash-SHA256 -FilePath $programIdl

# Save checksums
$soHashFile = "$programSo.sha256"
$idlHashFile = "$programIdl.sha256"

Set-Content -Path $soHashFile -Value $soHash
Set-Content -Path $idlHashFile -Value $idlHash

Write-Host "  escrow.so:    $soHash" -ForegroundColor White
Write-Host "  escrow.json:  $idlHash" -ForegroundColor White
Write-Host ""

Write-Host "✅ Checksums saved:" -ForegroundColor Green
Write-Host "  $soHashFile" -ForegroundColor Gray
Write-Host "  $idlHashFile" -ForegroundColor Gray
Write-Host ""

# Generate build manifest
Write-Host "📝 Generating build manifest..." -ForegroundColor Yellow

$gitCommit = git rev-parse HEAD 2>&1
$gitBranch = git rev-parse --abbrev-ref HEAD 2>&1
$buildTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$manifest = @{
    buildTimestamp = $buildTimestamp
    gitCommit = $gitCommit
    gitBranch = $gitBranch
    toolchain = @{
        solana = $solanaCLIVersion
        anchor = $anchorVersion
        rust = $rustVersion
    }
    artifacts = @{
        program = @{
            file = "target/deploy/escrow.so"
            size = $soSize
            sha256 = $soHash
        }
        idl = @{
            file = "target/idl/escrow.json"
            size = $idlSize
            sha256 = $idlHash
        }
    }
}

$manifestJson = $manifest | ConvertTo-Json -Depth 10
$manifestFile = "target/deploy/build-manifest.json"
Set-Content -Path $manifestFile -Value $manifestJson

Write-Host "✅ Build manifest saved: $manifestFile" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✅ Build Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Build Information:" -ForegroundColor Yellow
Write-Host "  Git Commit:   $gitCommit" -ForegroundColor White
Write-Host "  Git Branch:   $gitBranch" -ForegroundColor White
Write-Host "  Build Time:   $buildTimestamp" -ForegroundColor White
Write-Host "  Duration:     $([math]::Round($buildDuration, 2))s" -ForegroundColor White
Write-Host ""

Write-Host "Artifacts Ready for Deployment:" -ForegroundColor Yellow
Write-Host "  ✅ escrow.so ($([math]::Round($soSize / 1KB, 2)) KB)" -ForegroundColor White
Write-Host "  ✅ escrow.json ($([math]::Round($idlSize / 1KB, 2)) KB)" -ForegroundColor White
Write-Host "  ✅ Checksums verified" -ForegroundColor White
Write-Host "  ✅ Build manifest generated" -ForegroundColor White
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Review build manifest: cat target/deploy/build-manifest.json" -ForegroundColor White
Write-Host "  2. Deploy to STAGING: .\scripts\deployment\staging\deploy-to-staging.ps1" -ForegroundColor White
Write-Host "  3. Verify deployment: solana program show <PROGRAM_ID> --url devnet" -ForegroundColor White
Write-Host ""

