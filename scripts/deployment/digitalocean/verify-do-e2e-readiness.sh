#!/bin/bash
# Verification script for DigitalOcean E2E Test Readiness
# Run this on the DO dev server to check if everything is configured correctly
#
# Portable: Uses sed and awk instead of GNU-specific grep -oP for compatibility
# with both GNU/Linux and BSD/macOS systems

set -e

echo "=========================================="
echo "DO Server E2E Test Readiness Check"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Expected values
EXPECTED_ANCHOR_VERSION="0.32.1"
EXPECTED_PROGRAM_ID="4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"
EXPECTED_NETWORK="devnet"
MIN_SOL_BALANCE=0.05

SENDER_ADDRESS="FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71"
RECEIVER_ADDRESS="Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk"
ADMIN_ADDRESS="7CKr8FDnPKuJoc5DwJRFcymQ6bL3xERQhmMi9XkGXU9u"
FEE_COLLECTOR_ADDRESS="C5ji4ZVC2HwWqLD7TGwoZ2mJVSvcC22D8hXLSJ6TRJ1E"

# Helper functions
pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASS_COUNT++))
}

fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAIL_COUNT++))
}

warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    ((WARN_COUNT++))
}

info() {
    echo -e "${BLUE}ℹ️  INFO${NC}: $1"
}

section() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
    echo ""
}

# 1. Check Node.js and npm
section "1. Node.js Environment"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    pass "Node.js installed: $NODE_VERSION"
else
    fail "Node.js not installed"
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    pass "npm installed: $NPM_VERSION"
else
    fail "npm not installed"
fi

# 2. Check Solana CLI
section "2. Solana CLI"

if command -v solana &> /dev/null; then
    SOLANA_VERSION=$(solana --version 2>&1 | head -n1)
    pass "Solana CLI installed: $SOLANA_VERSION"
    
    # Check Solana configuration
    CONFIG_OUTPUT=$(solana config get 2>&1)
    CURRENT_RPC=$(echo "$CONFIG_OUTPUT" | grep "RPC URL" | awk '{print $NF}')
    
    if [[ $CURRENT_RPC == *"devnet"* ]]; then
        pass "Solana configured for devnet: $CURRENT_RPC"
    else
        fail "Solana NOT configured for devnet (current: $CURRENT_RPC)"
        info "Run: solana config set --url devnet"
    fi
else
    fail "Solana CLI not installed"
    info "Install: sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
fi

# 3. Check Anchor CLI
section "3. Anchor Framework"

if command -v anchor &> /dev/null; then
    # Use sed for portability (works on both GNU and BSD)
    ANCHOR_VERSION=$(anchor --version 2>&1 | sed -n 's/.*anchor-cli \([0-9.]*\).*/\1/p')
    
    if [[ "$ANCHOR_VERSION" == "$EXPECTED_ANCHOR_VERSION" ]]; then
        pass "Anchor CLI version correct: $ANCHOR_VERSION"
    else
        fail "Anchor CLI version mismatch: expected $EXPECTED_ANCHOR_VERSION, got $ANCHOR_VERSION"
        info "Install correct version:"
        info "  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
        info "  avm install $EXPECTED_ANCHOR_VERSION"
        info "  avm use $EXPECTED_ANCHOR_VERSION"
    fi
else
    fail "Anchor CLI not installed"
    info "Install:"
    info "  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
    info "  avm install $EXPECTED_ANCHOR_VERSION"
    info "  avm use $EXPECTED_ANCHOR_VERSION"
fi

# 4. Check Environment Variables
section "4. Environment Variables"

check_env() {
    local var_name=$1
    local expected_value=$2
    local is_secret=$3
    
    if [ -n "${!var_name}" ]; then
        if [ "$is_secret" = true ]; then
            pass "$var_name is set (value masked for security)"
        else
            if [ -n "$expected_value" ] && [ "${!var_name}" != "$expected_value" ]; then
                warn "$var_name is set but value differs: expected '$expected_value', got '${!var_name}'"
            else
                pass "$var_name is set: ${!var_name}"
            fi
        fi
    else
        fail "$var_name is NOT set"
    fi
}

# Core environment variables
check_env "NODE_ENV" "" false
check_env "SOLANA_NETWORK" "$EXPECTED_NETWORK" false
check_env "SOLANA_RPC_URL" "https://api.devnet.solana.com" false
check_env "ESCROW_PROGRAM_ID" "$EXPECTED_PROGRAM_ID" false
check_env "USDC_MINT_ADDRESS" "" false

# Wallet private keys (secrets)
check_env "DEVNET_SENDER_PRIVATE_KEY" "" true
check_env "DEVNET_RECEIVER_PRIVATE_KEY" "" true
check_env "DEVNET_ADMIN_PRIVATE_KEY" "" true
check_env "DEVNET_FEE_COLLECTOR_PRIVATE_KEY" "" true

# 5. Check Program Deployment
section "5. Program Deployment"

if command -v solana &> /dev/null; then
    info "Checking program: $EXPECTED_PROGRAM_ID"
    
    if solana account $EXPECTED_PROGRAM_ID --url devnet &> /dev/null; then
        pass "Program deployed on devnet: $EXPECTED_PROGRAM_ID"
        
        # Get program details (use awk for portability)
        PROGRAM_INFO=$(solana account $EXPECTED_PROGRAM_ID --url devnet 2>&1)
        PROGRAM_LAMPORTS=$(echo "$PROGRAM_INFO" | sed -n 's/.*lamports: \([0-9]*\).*/\1/p' | head -1)
        
        if [ -n "$PROGRAM_LAMPORTS" ]; then
            # Use awk for floating point division (more portable than bc)
            PROGRAM_SOL=$(awk "BEGIN {printf \"%.4f\", $PROGRAM_LAMPORTS / 1000000000}")
            info "  Program balance: $PROGRAM_SOL SOL"
        fi
        info "  Explorer: https://explorer.solana.com/address/$EXPECTED_PROGRAM_ID?cluster=devnet"
    else
        fail "Program NOT found on devnet: $EXPECTED_PROGRAM_ID"
        info "Deploy with: anchor deploy --provider.cluster devnet"
    fi
else
    warn "Cannot check program (Solana CLI not available)"
fi

# 6. Check Wallet Balances
section "6. Devnet Wallet Balances"

check_wallet_balance() {
    local name=$1
    local address=$2
    local min_balance=$3
    
    info "Checking $name: $address"
    
    if command -v solana &> /dev/null; then
        BALANCE_OUTPUT=$(solana balance $address --url devnet 2>&1)
        
        # Use sed for portability instead of grep -oP
        if [[ $BALANCE_OUTPUT =~ [0-9]+\.?[0-9]* ]]; then
            BALANCE=$(echo "$BALANCE_OUTPUT" | sed -n 's/.*\([0-9]*\.[0-9]*\).*/\1/p' | head -1)
            
            # Use awk for floating point comparison (more portable than bc)
            if awk "BEGIN {exit !($BALANCE >= $min_balance)}"; then
                pass "$name balance sufficient: $BALANCE SOL (min: $min_balance SOL)"
            else
                warn "$name balance LOW: $BALANCE SOL (min: $min_balance SOL)"
                info "  Fund with: solana transfer $address 2 --url devnet"
            fi
            info "  Explorer: https://explorer.solana.com/address/$address?cluster=devnet"
        else
            fail "$name account not found or error: $BALANCE_OUTPUT"
            info "  Fund to activate: solana transfer $address 0.5 --url devnet"
        fi
    else
        warn "Cannot check balance (Solana CLI not available)"
    fi
    echo ""
}

check_wallet_balance "Sender (Seller)" "$SENDER_ADDRESS" 0.5
check_wallet_balance "Receiver (Buyer)" "$RECEIVER_ADDRESS" 0.5
check_wallet_balance "Admin" "$ADMIN_ADDRESS" 0.5
check_wallet_balance "FeeCollector" "$FEE_COLLECTOR_ADDRESS" 0.1

# 7. Check Node Dependencies
section "7. Node.js Dependencies"

if [ -f "package.json" ]; then
    pass "package.json exists"
    
    if [ -d "node_modules" ]; then
        pass "node_modules directory exists"
        
        # Check critical dependencies
        check_dep() {
            local dep=$1
            if [ -d "node_modules/$dep" ]; then
                VERSION=$(node -p "require('./node_modules/$dep/package.json').version" 2>/dev/null || echo "unknown")
                pass "$dep installed: $VERSION"
            else
                fail "$dep NOT installed"
            fi
        }
        
        check_dep "@coral-xyz/anchor"
        check_dep "@solana/web3.js"
        check_dep "@solana/spl-token"
        check_dep "@metaplex-foundation/js"
        check_dep "bs58"
        check_dep "mocha"
        check_dep "chai"
    else
        warn "node_modules not found"
        info "Run: npm ci"
    fi
else
    fail "package.json not found (wrong directory?)"
fi

# 8. Check Test Files
section "8. Test Files"

check_file() {
    local file=$1
    if [ -f "$file" ]; then
        pass "File exists: $file"
    else
        fail "File missing: $file"
    fi
}

check_file "tests/e2e/devnet-nft-usdc-swap.test.ts"
check_file "tests/integration-test-devnet.ts"
check_file "tests/helpers/devnet-wallet-manager.ts"
check_file "tests/helpers/devnet-token-setup.ts"
check_file "tests/helpers/devnet-nft-setup.ts"
check_file "Anchor.toml"

# 9. Check Database and Redis
section "9. Database & Redis Connections"

check_env "DATABASE_URL" "" false
check_env "REDIS_URL" "" false

# Summary
section "SUMMARY"

TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))

echo "Results:"
echo -e "  ${GREEN}✅ Passed: $PASS_COUNT${NC}"
echo -e "  ${RED}❌ Failed: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}⚠️  Warnings: $WARN_COUNT${NC}"
echo "  ━━━━━━━━━━━━━━━━━━"
echo "  Total: $TOTAL checks"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    if [ $WARN_COUNT -eq 0 ]; then
        echo -e "${GREEN}🎉 ALL CHECKS PASSED!${NC}"
        echo "Server is ready for E2E tests."
    else
        echo -e "${YELLOW}⚠️  PASSED WITH WARNINGS${NC}"
        echo "Server is mostly ready, but some issues need attention."
    fi
    echo ""
    echo "Run E2E tests with:"
    echo "  npm run test:e2e"
    EXIT_CODE=0
else
    echo -e "${RED}❌ CHECKS FAILED${NC}"
    echo "Server is NOT ready for E2E tests."
    echo "Please fix the issues above before running tests."
    EXIT_CODE=1
fi

echo ""
echo "=========================================="

exit $EXIT_CODE

