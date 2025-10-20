#!/bin/bash
# Fund Devnet Test Wallets - Bash Script
# Automates funding of E2E test wallets on Solana devnet

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default amount
AMOUNT=2

# Parse arguments
BUYER=""
SELLER=""
ADMIN=""
FROM_TEST_OUTPUT=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --buyer)
      BUYER="$2"
      shift 2
      ;;
    --seller)
      SELLER="$2"
      shift 2
      ;;
    --admin)
      ADMIN="$2"
      shift 2
      ;;
    --amount)
      AMOUNT="$2"
      shift 2
      ;;
    --from-test-output)
      FROM_TEST_OUTPUT=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${CYAN}==================================${NC}"
echo -e "${CYAN}Devnet Test Wallet Funding${NC}"
echo -e "${CYAN}==================================${NC}"
echo ""

# Extract wallet addresses from test output
if [ "$FROM_TEST_OUTPUT" = true ]; then
  echo -e "${YELLOW}Extracting wallet addresses from test output...${NC}"
  
  if [ ! -f "test-output.txt" ]; then
    echo -e "${RED}❌ test-output.txt not found${NC}"
    echo "Run the test first with: npm run test:e2e:devnet 2>&1 | tee test-output.txt"
    exit 1
  fi
  
  BUYER=$(grep -oP 'Buyer:\s+\K[A-Za-z0-9]{32,44}' test-output.txt | head -1)
  SELLER=$(grep -oP 'Seller:\s+\K[A-Za-z0-9]{32,44}' test-output.txt | head -1)
  ADMIN=$(grep -oP 'Admin:\s+\K[A-Za-z0-9]{32,44}' test-output.txt | head -1)
  
  if [ -z "$BUYER" ] || [ -z "$SELLER" ] || [ -z "$ADMIN" ]; then
    echo -e "${RED}❌ Failed to extract wallet addresses${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✅ Extracted wallet addresses${NC}"
fi

# Validate inputs
if [ -z "$BUYER" ] || [ -z "$SELLER" ] || [ -z "$ADMIN" ]; then
  echo -e "${RED}❌ Missing wallet addresses${NC}"
  echo ""
  echo "Usage:"
  echo "  ./fund-devnet-wallets.sh --buyer <ADDR> --seller <ADDR> --admin <ADDR>"
  echo "  ./fund-devnet-wallets.sh --from-test-output"
  echo ""
  echo "Or run test first to get addresses:"
  echo "  npm run test:e2e:devnet 2>&1 | tee test-output.txt"
  exit 1
fi

echo -e "${YELLOW}Wallet Addresses:${NC}"
echo "  Buyer:  $BUYER"
echo "  Seller: $SELLER"
echo "  Admin:  $ADMIN"
echo ""

# Check current balances
echo -e "${YELLOW}Checking current balances...${NC}"
BUYER_BALANCE=$(solana balance $BUYER --url devnet 2>&1 || echo "0 SOL")
SELLER_BALANCE=$(solana balance $SELLER --url devnet 2>&1 || echo "0 SOL")
ADMIN_BALANCE=$(solana balance $ADMIN --url devnet 2>&1 || echo "0 SOL")

echo "  Buyer:  $BUYER_BALANCE"
echo "  Seller: $SELLER_BALANCE"
echo "  Admin:  $ADMIN_BALANCE"
echo ""

# Confirm funding
TOTAL_AMOUNT=$(echo "$AMOUNT * 2 + 1" | bc)
echo -e "${YELLOW}This will transfer:${NC}"
echo "  $AMOUNT SOL to Buyer"
echo "  $AMOUNT SOL to Seller"
echo "  1 SOL to Admin"
echo -e "${CYAN}  Total: $TOTAL_AMOUNT SOL${NC}"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}❌ Cancelled${NC}"
  exit 0
fi

echo ""
echo -e "${YELLOW}Funding wallets...${NC}"
echo ""

# Fund Buyer
echo -e "${CYAN}1/3 Funding Buyer ($AMOUNT SOL)...${NC}"
if solana transfer $BUYER $AMOUNT --url devnet; then
  echo -e "${GREEN}  ✅ Buyer funded successfully${NC}"
else
  echo -e "${RED}  ❌ Buyer funding failed${NC}"
fi

sleep 2

# Fund Seller
echo -e "${CYAN}2/3 Funding Seller ($AMOUNT SOL)...${NC}"
if solana transfer $SELLER $AMOUNT --url devnet; then
  echo -e "${GREEN}  ✅ Seller funded successfully${NC}"
else
  echo -e "${RED}  ❌ Seller funding failed${NC}"
fi

sleep 2

# Fund Admin
echo -e "${CYAN}3/3 Funding Admin (1 SOL)...${NC}"
if solana transfer $ADMIN 1 --url devnet; then
  echo -e "${GREEN}  ✅ Admin funded successfully${NC}"
else
  echo -e "${RED}  ❌ Admin funding failed${NC}"
fi

echo ""
echo -e "${YELLOW}Waiting for confirmations...${NC}"
sleep 10

# Verify final balances
echo ""
echo -e "${YELLOW}Final balances:${NC}"
BUYER_FINAL=$(solana balance $BUYER --url devnet 2>&1 || echo "0 SOL")
SELLER_FINAL=$(solana balance $SELLER --url devnet 2>&1 || echo "0 SOL")
ADMIN_FINAL=$(solana balance $ADMIN --url devnet 2>&1 || echo "0 SOL")

echo "  Buyer:  $BUYER_FINAL"
echo "  Seller: $SELLER_FINAL"
echo "  Admin:  $ADMIN_FINAL"
echo ""

echo -e "${CYAN}==================================${NC}"
echo -e "${GREEN}✅ Funding Complete!${NC}"
echo -e "${CYAN}==================================${NC}"
echo ""
echo "You can now run the E2E tests:"
echo -e "${GREEN}  npm run test:e2e:devnet${NC}"
echo ""
echo "Or the simple test:"
echo -e "${GREEN}  npx mocha --require ts-node/register tests/e2e/simple-devnet.test.ts --timeout 180000${NC}"
echo ""

