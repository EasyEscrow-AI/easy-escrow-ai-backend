#!/bin/bash
#
# Production Mainnet Build Script
# Builds the escrow program for mainnet deployment with pinned toolchains
#
# Usage: ./scripts/solana/build-mainnet.sh
#
# This script:
# - Verifies toolchain versions
# - Cleans previous builds
# - Builds program with production configuration
# - Generates checksums for verification
# - Validates build artifacts
#

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
# These versions match the actual working staging deployment
REQUIRED_SOLANA_VERSION="2.1"  # Anchor 0.32.1 is compatible with Solana 2.x
REQUIRED_RUST_VERSION="1.82.0"  # From rust-toolchain.toml
REQUIRED_ANCHOR_VERSION="0.32.1"  # From Cargo.toml
CONFIG_FILE="Anchor.mainnet.toml"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Production Mainnet Build Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Step 1: Verify Solana CLI version
echo -e "${BLUE}Step 1: Verifying Solana CLI version...${NC}"
if command -v solana &> /dev/null; then
    SOLANA_VERSION=$(solana --version | cut -d' ' -f2)
    if [[ "$SOLANA_VERSION" == $REQUIRED_SOLANA_VERSION* ]]; then
        print_status "Solana CLI: $SOLANA_VERSION"
    else
        print_warning "Solana version is $SOLANA_VERSION, recommended: $REQUIRED_SOLANA_VERSION.x"
        echo "Install with: solana-install init $REQUIRED_SOLANA_VERSION"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    print_error "Solana CLI not found!"
    echo "Install from: https://docs.solana.com/cli/install-solana-cli-tools"
    exit 1
fi

# Step 2: Verify Rust version
echo -e "${BLUE}Step 2: Verifying Rust version...${NC}"
if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version | cut -d' ' -f2)
    if [[ "$RUST_VERSION" == "$REQUIRED_RUST_VERSION"* ]]; then
        print_status "Rust: $RUST_VERSION"
    else
        print_warning "Rust version is $RUST_VERSION, recommended: $REQUIRED_RUST_VERSION"
        echo "Install with: rustup install $REQUIRED_RUST_VERSION && rustup default $REQUIRED_RUST_VERSION"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    print_error "Rust not found!"
    echo "Install from: https://rustup.rs/"
    exit 1
fi

# Step 3: Verify Anchor CLI version
echo -e "${BLUE}Step 3: Verifying Anchor CLI version...${NC}"
if command -v anchor &> /dev/null; then
    ANCHOR_VERSION=$(anchor --version | cut -d' ' -f2)
    if [[ "$ANCHOR_VERSION" == "$REQUIRED_ANCHOR_VERSION"* ]]; then
        print_status "Anchor CLI: $ANCHOR_VERSION"
    else
        print_warning "Anchor version is $ANCHOR_VERSION, recommended: $REQUIRED_ANCHOR_VERSION"
        echo "Install with: cargo install --git https://github.com/coral-xyz/anchor --tag v$REQUIRED_ANCHOR_VERSION anchor-cli --locked"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    print_error "Anchor CLI not found!"
    echo "Install from: https://www.anchor-lang.com/docs/installation"
    exit 1
fi

# Step 4: Verify configuration file exists
echo -e "${BLUE}Step 4: Verifying configuration file...${NC}"
if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi
print_status "Configuration file: $CONFIG_FILE"

# Step 5: Clean previous builds
echo -e "${BLUE}Step 5: Cleaning previous builds...${NC}"
anchor clean
rm -rf target/
print_status "Build artifacts cleaned"

# Step 6: Build program
echo -e "${BLUE}Step 6: Building program for mainnet...${NC}"
echo "This may take several minutes..."
if anchor build --config $CONFIG_FILE; then
    print_status "Program built successfully"
else
    print_error "Build failed!"
    exit 1
fi

# Step 7: Verify build artifacts
echo -e "${BLUE}Step 7: Verifying build artifacts...${NC}"

# Check program binary
if [ -f "target/deploy/escrow.so" ]; then
    PROGRAM_SIZE=$(du -h target/deploy/escrow.so | cut -f1)
    print_status "Program binary: target/deploy/escrow.so ($PROGRAM_SIZE)"
else
    print_error "Program binary not found!"
    exit 1
fi

# Check IDL
if [ -f "target/idl/escrow.json" ]; then
    IDL_SIZE=$(du -h target/idl/escrow.json | cut -f1)
    print_status "IDL file: target/idl/escrow.json ($IDL_SIZE)"
else
    print_error "IDL file not found!"
    exit 1
fi

# Check program keypair (should NOT exist yet for mainnet)
if [ -f "target/deploy/escrow-mainnet-keypair.json" ]; then
    print_status "Mainnet keypair exists: target/deploy/escrow-mainnet-keypair.json"
else
    print_warning "Mainnet keypair not found - generate before deployment"
    echo "Generate with: solana-keygen new -o target/deploy/escrow-mainnet-keypair.json"
fi

# Step 8: Generate checksums
echo -e "${BLUE}Step 8: Generating checksums...${NC}"
shasum -a 256 target/deploy/escrow.so > target/deploy/escrow.so.sha256
shasum -a 256 target/idl/escrow.json > target/idl/escrow.json.sha256

echo -e "${GREEN}Program SHA256:${NC}"
cat target/deploy/escrow.so.sha256

echo -e "${GREEN}IDL SHA256:${NC}"
cat target/idl/escrow.json.sha256

print_status "Checksums generated"

# Step 9: Build summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Build Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}Build Environment:${NC}"
echo "  Solana:  $SOLANA_VERSION"
echo "  Rust:    $RUST_VERSION"
echo "  Anchor:  $ANCHOR_VERSION"
echo ""
echo -e "${GREEN}Build Artifacts:${NC}"
echo "  Program: target/deploy/escrow.so ($PROGRAM_SIZE)"
echo "  IDL:     target/idl/escrow.json ($IDL_SIZE)"
echo ""
echo -e "${GREEN}Checksums:${NC}"
cat target/deploy/escrow.so.sha256
cat target/idl/escrow.json.sha256
echo ""

# Step 10: Estimated deployment cost
echo -e "${BLUE}Estimated Deployment Cost:${NC}"
PROGRAM_SIZE_BYTES=$(stat -f%z target/deploy/escrow.so 2>/dev/null || stat -c%s target/deploy/escrow.so)
PROGRAM_COST=$(echo "scale=2; $PROGRAM_SIZE_BYTES * 0.00001" | bc)
echo "  Program rent:     ~$PROGRAM_COST SOL (for $PROGRAM_SIZE_BYTES bytes)"
echo "  Transaction fees: ~0.05 SOL"
echo "  IDL upload:       ~0.15 SOL"
echo "  Buffer:           ~2.00 SOL"
echo "  ----------------------------"
TOTAL_COST=$(echo "scale=2; $PROGRAM_COST + 2.20" | bc)
echo "  Total (approx):   ~$TOTAL_COST SOL"
echo ""
print_warning "Recommended deployer balance: 5-10 SOL"

# Step 11: Next steps
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Next Steps${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "1. Generate mainnet program keypair:"
echo "   solana-keygen new -o target/deploy/escrow-mainnet-keypair.json"
echo ""
echo "2. Update program ID in:"
echo "   - Anchor.mainnet.toml"
echo "   - programs/escrow/src/lib.rs (declare_id!)"
echo ""
echo "3. Rebuild with updated program ID"
echo ""
echo "4. Fund deployer wallet with 5-10 SOL"
echo ""
echo "5. Deploy to mainnet:"
echo "   ./scripts/solana/deploy-mainnet.sh"
echo ""
echo -e "${GREEN}✓ Build completed successfully!${NC}"

