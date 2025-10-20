#!/bin/bash
# Setup script for E2E Devnet Testing (Task 37)
# This script prepares the environment for running comprehensive devnet E2E tests

set -e

echo "=================================="
echo "Devnet E2E Testing Setup"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Solana CLI is installed
echo "Checking Solana CLI..."
if ! command -v solana &> /dev/null; then
    echo -e "${RED}❌ Solana CLI not found${NC}"
    echo "Please install Solana CLI:"
    echo "  sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
    exit 1
fi

SOLANA_VERSION=$(solana --version)
echo -e "${GREEN}✅ Solana CLI installed: $SOLANA_VERSION${NC}"
echo ""

# Check if we're configured for devnet
echo "Checking Solana configuration..."
CURRENT_CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')
echo "Current RPC: $CURRENT_CLUSTER"

if [[ $CURRENT_CLUSTER != *"devnet"* ]]; then
    echo -e "${YELLOW}⚠️  Not configured for devnet${NC}"
    read -p "Configure for devnet now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        solana config set --url devnet
        echo -e "${GREEN}✅ Configured for devnet${NC}"
    else
        echo -e "${RED}❌ Devnet configuration required${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Already configured for devnet${NC}"
fi
echo ""

# Check if program is deployed
echo "Checking program deployment..."
PROGRAM_ID="4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd"

if solana account $PROGRAM_ID --url devnet &> /dev/null; then
    echo -e "${GREEN}✅ Program deployed: $PROGRAM_ID${NC}"
    solana account $PROGRAM_ID --url devnet | head -n 5
else
    echo -e "${RED}❌ Program not found on devnet${NC}"
    echo "Please deploy the program first:"
    echo "  anchor deploy --provider.cluster devnet"
    exit 1
fi
echo ""

# Check wallet balance
echo "Checking wallet balance..."
WALLET_ADDRESS=$(solana address)
BALANCE=$(solana balance --url devnet 2>/dev/null || echo "0")

echo "Wallet: $WALLET_ADDRESS"
echo "Balance: $BALANCE"

BALANCE_FLOAT=$(echo $BALANCE | sed 's/ SOL//')
if (( $(echo "$BALANCE_FLOAT < 1" | bc -l) )); then
    echo -e "${YELLOW}⚠️  Low balance. Requesting airdrop...${NC}"
    if solana airdrop 2 --url devnet; then
        echo -e "${GREEN}✅ Airdrop successful${NC}"
    else
        echo -e "${YELLOW}⚠️  Airdrop failed (rate limit?). You may need to manually fund test wallets.${NC}"
    fi
else
    echo -e "${GREEN}✅ Sufficient balance${NC}"
fi
echo ""

# Check for USDC devnet mint
echo "Checking devnet USDC..."
DEVNET_USDC="Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"

if solana account $DEVNET_USDC --url devnet &> /dev/null; then
    echo -e "${GREEN}✅ Devnet USDC verified: $DEVNET_USDC${NC}"
else
    echo -e "${YELLOW}⚠️  Cannot verify USDC mint${NC}"
fi
echo ""

# Check Node.js and dependencies
echo "Checking Node.js dependencies..."
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Dependencies not installed${NC}"
    echo "Installing..."
    npm install
fi
echo -e "${GREEN}✅ Dependencies ready${NC}"
echo ""

# Check if Anchor is installed
echo "Checking Anchor..."
if ! command -v anchor &> /dev/null; then
    echo -e "${YELLOW}⚠️  Anchor CLI not found${NC}"
    echo "Please install Anchor:"
    echo "  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
else
    ANCHOR_VERSION=$(anchor --version)
    echo -e "${GREEN}✅ Anchor installed: $ANCHOR_VERSION${NC}"
fi
echo ""

# Create directories for test output
echo "Creating output directories..."
mkdir -p receipts
mkdir -p test-reports
echo -e "${GREEN}✅ Directories created${NC}"
echo ""

# Environment setup
echo "Setting up environment..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found${NC}"
    echo "Creating .env with devnet defaults..."
    cat > .env << EOF
# Devnet E2E Testing Configuration
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=4FQ5JoxsS5jjuTR1ScuEpk66eX5B71L7ysJEysmsTwhd

# Database (if needed for integration)
DATABASE_URL=postgresql://localhost:5432/easyescrow_test

# API Configuration
PORT=3000
NODE_ENV=test
EOF
    echo -e "${GREEN}✅ .env file created${NC}"
else
    echo -e "${GREEN}✅ .env file exists${NC}"
    
    # Check if devnet config is set
    if ! grep -q "SOLANA_NETWORK=devnet" .env; then
        echo -e "${YELLOW}⚠️  Adding devnet configuration to .env${NC}"
        echo "" >> .env
        echo "# Devnet Configuration" >> .env
        echo "SOLANA_NETWORK=devnet" >> .env
        echo "SOLANA_RPC_URL=https://api.devnet.solana.com" >> .env
    fi
fi
echo ""

# Summary
echo "=================================="
echo "Setup Complete! ✅"
echo "=================================="
echo ""
echo "You can now run E2E tests:"
echo "  ${GREEN}npm run test:e2e:devnet${NC}"
echo ""
echo "Or run specific scenarios:"
echo "  npm run test:e2e:devnet -- --grep \"Happy Path\""
echo "  npm run test:e2e:devnet -- --grep \"Expiry Path\""
echo "  npm run test:e2e:devnet -- --grep \"Race Condition\""
echo ""
echo "Resources:"
echo "  - Program Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
echo "  - Wallet Explorer: https://explorer.solana.com/address/$WALLET_ADDRESS?cluster=devnet"
echo "  - USDC Faucet: https://spl-token-faucet.com/?token-name=USDC-Dev"
echo "  - Solana Status: https://status.solana.com/"
echo ""
echo "Documentation:"
echo "  - tests/e2e/README.md"
echo ""

