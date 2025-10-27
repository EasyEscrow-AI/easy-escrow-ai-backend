# Production Mainnet Build Script (PowerShell)
# Builds the escrow program for mainnet deployment with pinned toolchains
#
# Usage: .\scripts\solana\build-mainnet.ps1

$ErrorActionPreference = "Stop"

# Configuration
# These versions match the actual working staging deployment
$REQUIRED_SOLANA_VERSION = "2.1"  # Anchor 0.32.1 is compatible with Solana 2.x
$REQUIRED_RUST_VERSION = "1.82.0"  # From rust-toolchain.toml
$REQUIRED_ANCHOR_VERSION = "0.32.1"  # From Cargo.toml
$CONFIG_FILE = "Anchor.mainnet.toml"

Write-Host "========================================" -ForegroundColor Blue
Write-Host "  Production Mainnet Build Script" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Step 1: Verify Solana CLI
Write-Host "Step 1: Verifying Solana CLI version..." -ForegroundColor Blue
try {
    $solanaVersion = (solana --version) -replace 'solana-cli ', ''
    if ($solanaVersion -like "$REQUIRED_SOLANA_VERSION*") {
        Write-Host "✓ Solana CLI: $solanaVersion" -ForegroundColor Green
    } else {
        Write-Host "⚠ Solana version is $solanaVersion, recommended: $REQUIRED_SOLANA_VERSION.x" -ForegroundColor Yellow
        $response = Read-Host "Continue anyway? (y/n)"
        if ($response -ne 'y') { exit 1 }
    }
} catch {
    Write-Host "✗ Solana CLI not found!" -ForegroundColor Red
    Write-Host "Install from: https://docs.solana.com/cli/install-solana-cli-tools"
    exit 1
}

# Step 2: Verify Rust
Write-Host "Step 2: Verifying Rust version..." -ForegroundColor Blue
try {
    $rustVersion = (rustc --version) -replace 'rustc ', '' -replace ' \(.*\)', ''
    if ($rustVersion -like "$REQUIRED_RUST_VERSION*") {
        Write-Host "✓ Rust: $rustVersion" -ForegroundColor Green
    } else {
        Write-Host "⚠ Rust version is $rustVersion, recommended: $REQUIRED_RUST_VERSION" -ForegroundColor Yellow
        $response = Read-Host "Continue anyway? (y/n)"
        if ($response -ne 'y') { exit 1 }
    }
} catch {
    Write-Host "✗ Rust not found!" -ForegroundColor Red
    Write-Host "Install from: https://rustup.rs/"
    exit 1
}

# Step 3: Verify Anchor CLI
Write-Host "Step 3: Verifying Anchor CLI version..." -ForegroundColor Blue
try {
    $anchorVersion = (anchor --version) -replace 'anchor-cli ', ''
    if ($anchorVersion -like "$REQUIRED_ANCHOR_VERSION*") {
        Write-Host "✓ Anchor CLI: $anchorVersion" -ForegroundColor Green
    } else {
        Write-Host "⚠ Anchor version is $anchorVersion, recommended: $REQUIRED_ANCHOR_VERSION" -ForegroundColor Yellow
        $response = Read-Host "Continue anyway? (y/n)"
        if ($response -ne 'y') { exit 1 }
    }
} catch {
    Write-Host "✗ Anchor CLI not found!" -ForegroundColor Red
    Write-Host "Install from: https://www.anchor-lang.com/docs/installation"
    exit 1
}

# Step 4: Verify config file
Write-Host "Step 4: Verifying configuration file..." -ForegroundColor Blue
if (Test-Path $CONFIG_FILE) {
    Write-Host "✓ Configuration file: $CONFIG_FILE" -ForegroundColor Green
} else {
    Write-Host "✗ Configuration file not found: $CONFIG_FILE" -ForegroundColor Red
    exit 1
}

# Step 5: Clean previous builds
Write-Host "Step 5: Cleaning previous builds..." -ForegroundColor Blue
anchor clean
if (Test-Path "target") {
    Remove-Item -Recurse -Force target
}
Write-Host "✓ Build artifacts cleaned" -ForegroundColor Green

# Step 6: Build program
Write-Host "Step 6: Building program for mainnet..." -ForegroundColor Blue
Write-Host "This may take several minutes..." -ForegroundColor Yellow
try {
    anchor build --config $CONFIG_FILE
    Write-Host "✓ Program built successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Build failed!" -ForegroundColor Red
    exit 1
}

# Step 7: Verify artifacts
Write-Host "Step 7: Verifying build artifacts..." -ForegroundColor Blue

if (Test-Path "target\deploy\escrow.so") {
    $programSize = (Get-Item "target\deploy\escrow.so").Length / 1KB
    Write-Host "✓ Program binary: target\deploy\escrow.so ($([math]::Round($programSize, 2)) KB)" -ForegroundColor Green
} else {
    Write-Host "✗ Program binary not found!" -ForegroundColor Red
    exit 1
}

if (Test-Path "target\idl\escrow.json") {
    $idlSize = (Get-Item "target\idl\escrow.json").Length / 1KB
    Write-Host "✓ IDL file: target\idl\escrow.json ($([math]::Round($idlSize, 2)) KB)" -ForegroundColor Green
} else {
    Write-Host "✗ IDL file not found!" -ForegroundColor Red
    exit 1
}

if (Test-Path "target\deploy\escrow-mainnet-keypair.json") {
    Write-Host "✓ Mainnet keypair exists" -ForegroundColor Green
} else {
    Write-Host "⚠ Mainnet keypair not found - generate before deployment" -ForegroundColor Yellow
    Write-Host "  Generate with: solana-keygen new -o target/deploy/escrow-mainnet-keypair.json"
}

# Step 8: Generate checksums
Write-Host "Step 8: Generating checksums..." -ForegroundColor Blue
$programHash = (Get-FileHash "target\deploy\escrow.so" -Algorithm SHA256).Hash
$idlHash = (Get-FileHash "target\idl\escrow.json" -Algorithm SHA256).Hash

$programHash | Out-File "target\deploy\escrow.so.sha256" -Encoding ASCII
$idlHash | Out-File "target\idl\escrow.json.sha256" -Encoding ASCII

Write-Host "Program SHA256:" -ForegroundColor Green
Write-Host $programHash
Write-Host "IDL SHA256:" -ForegroundColor Green
Write-Host $idlHash

# Step 9: Build summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "  Build Summary" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Build Environment:" -ForegroundColor Green
Write-Host "  Solana:  $solanaVersion"
Write-Host "  Rust:    $rustVersion"
Write-Host "  Anchor:  $anchorVersion"
Write-Host ""
Write-Host "Build Artifacts:" -ForegroundColor Green
Write-Host "  Program: target\deploy\escrow.so ($([math]::Round($programSize, 2)) KB)"
Write-Host "  IDL:     target\idl\escrow.json ($([math]::Round($idlSize, 2)) KB)"
Write-Host ""

# Step 10: Deployment cost estimate
$programSizeBytes = (Get-Item "target\deploy\escrow.so").Length
$programCost = [math]::Round($programSizeBytes * 0.00001, 2)
$totalCost = [math]::Round($programCost + 2.20, 2)

Write-Host "Estimated Deployment Cost:" -ForegroundColor Blue
Write-Host "  Program rent:     ~$programCost SOL (for $programSizeBytes bytes)"
Write-Host "  Transaction fees: ~0.05 SOL"
Write-Host "  IDL upload:       ~0.15 SOL"
Write-Host "  Buffer:           ~2.00 SOL"
Write-Host "  ----------------------------"
Write-Host "  Total (approx):   ~$totalCost SOL"
Write-Host ""
Write-Host "⚠ Recommended deployer balance: 5-10 SOL" -ForegroundColor Yellow

# Next steps
Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "  Next Steps" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""
Write-Host "1. Generate mainnet program keypair:"
Write-Host "   solana-keygen new -o target/deploy/escrow-mainnet-keypair.json"
Write-Host ""
Write-Host "2. Update program ID in:"
Write-Host "   - Anchor.mainnet.toml"
Write-Host "   - programs/escrow/src/lib.rs (declare_id!)"
Write-Host ""
Write-Host "3. Rebuild with updated program ID"
Write-Host ""
Write-Host "4. Fund deployer wallet with 5-10 SOL"
Write-Host ""
Write-Host "5. Run verification:"
Write-Host "   .\scripts\solana\verify-mainnet-deployment.ps1"
Write-Host ""
Write-Host "✓ Build completed successfully!" -ForegroundColor Green

