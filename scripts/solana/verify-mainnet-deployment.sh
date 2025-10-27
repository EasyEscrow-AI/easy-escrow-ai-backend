#!/bin/bash
#
# Mainnet Deployment Verification Script
# Verifies all prerequisites before deploying to mainnet
#
# Usage: ./scripts/solana/verify-mainnet-deployment.sh
#
# This script checks:
# - Toolchain versions
# - Configuration files
# - Keypairs and balances
# - Program IDs consistency
# - Build artifacts
# - Security configurations
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
CONFIG_FILE="Anchor.mainnet.toml"
PROGRAM_SOURCE="programs/escrow/src/lib.rs"
PROGRAM_KEYPAIR="target/deploy/escrow-mainnet-keypair.json"
DEPLOYER_KEYPAIR="wallets/production/mainnet-deployer.json"
MIN_BALANCE=5.0  # Minimum SOL balance required

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Mainnet Deployment Verification${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Helper functions
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# Check 1: Configuration file
echo -e "${BLUE}[1/10] Checking configuration file...${NC}"
if [ -f "$CONFIG_FILE" ]; then
    check_pass "Configuration file exists: $CONFIG_FILE"
    
    # Verify it's set to mainnet
    if grep -q 'cluster = "mainnet-beta"' "$CONFIG_FILE"; then
        check_pass "Cluster set to mainnet-beta"
    else
        check_fail "Cluster NOT set to mainnet-beta"
    fi
    
    # Check if program ID is still placeholder
    if grep -q 'PLACEHOLDER_MAINNET_PROGRAM_ID' "$CONFIG_FILE"; then
        check_fail "Program ID is still placeholder - needs to be set"
    else
        check_pass "Program ID has been configured"
    fi
else
    check_fail "Configuration file not found: $CONFIG_FILE"
fi

# Check 2: Program keypair
echo -e "${BLUE}[2/10] Checking program keypair...${NC}"
if [ -f "$PROGRAM_KEYPAIR" ]; then
    check_pass "Program keypair exists: $PROGRAM_KEYPAIR"
    
    # Get program ID from keypair
    PROGRAM_ID=$(solana address -k "$PROGRAM_KEYPAIR" 2>/dev/null || echo "ERROR")
    if [ "$PROGRAM_ID" != "ERROR" ]; then
        check_pass "Program ID from keypair: $PROGRAM_ID"
        
        # Check file permissions (Unix/Mac only)
        if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "win32" ]]; then
            PERMS=$(stat -f "%OLp" "$PROGRAM_KEYPAIR" 2>/dev/null || stat -c "%a" "$PROGRAM_KEYPAIR" 2>/dev/null)
            if [ "$PERMS" = "600" ]; then
                check_pass "Keypair permissions are secure (600)"
            else
                check_warn "Keypair permissions are $PERMS, should be 600"
            fi
        fi
    else
        check_fail "Cannot read program ID from keypair"
    fi
else
    check_fail "Program keypair not found: $PROGRAM_KEYPAIR"
fi

# Check 3: Program source code
echo -e "${BLUE}[3/10] Checking program source code...${NC}"
if [ -f "$PROGRAM_SOURCE" ]; then
    check_pass "Program source exists: $PROGRAM_SOURCE"
    
    # Extract program ID from declare_id!
    SOURCE_ID=$(grep 'declare_id!' "$PROGRAM_SOURCE" | sed 's/.*declare_id!("\(.*\)").*/\1/')
    
    if [ -n "$SOURCE_ID" ] && [ "$SOURCE_ID" != "PLACEHOLDER_MAINNET_PROGRAM_ID" ]; then
        check_pass "Program ID in source: $SOURCE_ID"
        
        # Verify IDs match
        if [ "$SOURCE_ID" = "$PROGRAM_ID" ]; then
            check_pass "Program IDs match across all files"
        else
            check_fail "Program ID mismatch! Keypair: $PROGRAM_ID, Source: $SOURCE_ID"
        fi
    else
        check_fail "Program ID in source is still placeholder or missing"
    fi
else
    check_fail "Program source not found: $PROGRAM_SOURCE"
fi

# Check 4: Deployer keypair and balance
echo -e "${BLUE}[4/10] Checking deployer keypair and balance...${NC}"
if [ -f "$DEPLOYER_KEYPAIR" ]; then
    check_pass "Deployer keypair exists: $DEPLOYER_KEYPAIR"
    
    # Get deployer address
    DEPLOYER_ADDRESS=$(solana address -k "$DEPLOYER_KEYPAIR" 2>/dev/null || echo "ERROR")
    if [ "$DEPLOYER_ADDRESS" != "ERROR" ]; then
        check_pass "Deployer address: $DEPLOYER_ADDRESS"
        
        # Check balance on mainnet
        BALANCE=$(solana balance -k "$DEPLOYER_KEYPAIR" --url mainnet-beta 2>/dev/null | cut -d' ' -f1 || echo "0")
        
        if (( $(echo "$BALANCE >= $MIN_BALANCE" | bc -l) )); then
            check_pass "Deployer balance: $BALANCE SOL (sufficient)"
        elif (( $(echo "$BALANCE > 0" | bc -l) )); then
            check_warn "Deployer balance: $BALANCE SOL (recommended: $MIN_BALANCE+ SOL)"
        else
            check_fail "Deployer balance: $BALANCE SOL (insufficient, need $MIN_BALANCE+ SOL)"
        fi
    else
        check_fail "Cannot read deployer address from keypair"
    fi
else
    check_fail "Deployer keypair not found: $DEPLOYER_KEYPAIR"
fi

# Check 5: Build artifacts
echo -e "${BLUE}[5/10] Checking build artifacts...${NC}"
if [ -f "target/deploy/escrow.so" ]; then
    PROGRAM_SIZE=$(stat -f%z target/deploy/escrow.so 2>/dev/null || stat -c%s target/deploy/escrow.so)
    PROGRAM_SIZE_KB=$(echo "scale=2; $PROGRAM_SIZE / 1024" | bc)
    check_pass "Program binary exists ($PROGRAM_SIZE_KB KB)"
    
    # Check if checksums exist
    if [ -f "target/deploy/escrow.so.sha256" ]; then
        check_pass "Program checksum exists"
    else
        check_warn "Program checksum not found - run build script to generate"
    fi
else
    check_fail "Program binary not found - run build script first"
fi

if [ -f "target/idl/escrow.json" ]; then
    check_pass "IDL file exists"
    
    if [ -f "target/idl/escrow.json.sha256" ]; then
        check_pass "IDL checksum exists"
    else
        check_warn "IDL checksum not found - run build script to generate"
    fi
else
    check_fail "IDL file not found - run build script first"
fi

# Check 6: RPC endpoint
echo -e "${BLUE}[6/10] Checking RPC endpoint...${NC}"
RPC_URL="${ANCHOR_PROVIDER_URL:-https://api.mainnet-beta.solana.com}"

if curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q "ok"; then
    check_pass "RPC endpoint is responsive: $RPC_URL"
else
    check_warn "RPC endpoint may be slow or unresponsive: $RPC_URL"
fi

# Check if using public RPC
if [[ "$RPC_URL" == *"api.mainnet-beta.solana.com"* ]]; then
    check_warn "Using public RPC - may hit rate limits during deployment"
    echo "  Consider using premium RPC (Helius, QuickNode, Triton)"
fi

# Check 7: Program does not exist on mainnet
echo -e "${BLUE}[7/10] Checking if program already exists on mainnet...${NC}"
if [ -n "$PROGRAM_ID" ] && [ "$PROGRAM_ID" != "ERROR" ]; then
    if solana program show "$PROGRAM_ID" --url mainnet-beta &>/dev/null; then
        check_warn "Program already exists on mainnet - this will be an upgrade"
    else
        check_pass "Program does not exist on mainnet (new deployment)"
    fi
fi

# Check 8: Git status
echo -e "${BLUE}[8/10] Checking git status...${NC}"
if git rev-parse --git-dir > /dev/null 2>&1; then
    # Check if we're on master branch
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$BRANCH" = "master" ]; then
        check_pass "On master branch"
    else
        check_warn "Not on master branch (current: $BRANCH)"
    fi
    
    # Check for uncommitted changes
    if [ -z "$(git status --porcelain)" ]; then
        check_pass "No uncommitted changes"
    else
        check_warn "Uncommitted changes detected"
    fi
    
    # Get commit hash
    COMMIT=$(git rev-parse HEAD)
    check_pass "Git commit: ${COMMIT:0:8}"
else
    check_warn "Not a git repository"
fi

# Check 9: Backup verification
echo -e "${BLUE}[9/10] Checking backups...${NC}"
check_warn "Verify you have secure backups of:"
echo "  - Program keypair seed phrase"
echo "  - Deployer keypair seed phrase"
echo "  - Encrypted keypair files"
echo "  - Paper backups in secure location"

# Check 10: Security checklist
echo -e "${BLUE}[10/10] Security checklist...${NC}"
check_warn "Manual verification required:"
echo "  - [ ] Keypairs backed up securely"
echo "  - [ ] Seed phrases written down and stored safely"
echo "  - [ ] File permissions set correctly"
echo "  - [ ] Team notified of deployment"
echo "  - [ ] Monitoring configured"
echo "  - [ ] Rollback plan documented"

# Summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Verification Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Ready to deploy to mainnet."
    echo ""
    echo "Deploy command:"
    echo "  ./scripts/solana/deploy-mainnet.sh"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo ""
    echo "Warnings should be reviewed but deployment can proceed."
    echo ""
    echo "Deploy command:"
    echo "  ./scripts/solana/deploy-mainnet.sh"
    echo ""
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) found${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    fi
    echo ""
    echo -e "${RED}Cannot deploy until errors are fixed!${NC}"
    echo ""
    exit 1
fi

