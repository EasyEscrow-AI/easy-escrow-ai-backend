#!/bin/bash
#
# Mainnet Deployment Cost Calculator
# Calculates exact SOL requirements for mainnet deployment
#
# Usage: ./scripts/solana/calculate-deployment-cost.sh
#

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Mainnet Deployment Cost Calculator${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if program binary exists
if [ ! -f "target/deploy/escrow.so" ]; then
    echo -e "${YELLOW}⚠ Program binary not found${NC}"
    echo "Run build script first: ./scripts/solana/build-mainnet.sh"
    echo ""
    echo "Using estimated program size: 250 KB"
    PROGRAM_SIZE=256000
else
    PROGRAM_SIZE=$(stat -f%z target/deploy/escrow.so 2>/dev/null || stat -c%s target/deploy/escrow.so)
    PROGRAM_SIZE_KB=$(echo "scale=2; $PROGRAM_SIZE / 1024" | bc)
    echo -e "${GREEN}✓ Program binary found: $PROGRAM_SIZE_KB KB${NC}"
fi

# IDL size
if [ ! -f "target/idl/escrow.json" ]; then
    echo -e "${YELLOW}⚠ IDL file not found${NC}"
    echo "Using estimated IDL size: 15 KB"
    IDL_SIZE=15360
else
    IDL_SIZE=$(stat -f%z target/idl/escrow.json 2>/dev/null || stat -c%s target/idl/escrow.json)
    IDL_SIZE_KB=$(echo "scale=2; $IDL_SIZE / 1024" | bc)
    echo -e "${GREEN}✓ IDL file found: $IDL_SIZE_KB KB${NC}"
fi

echo ""
echo -e "${BLUE}Cost Breakdown:${NC}"
echo ""

# Program account rent
# Formula: (program_size + 128 bytes header) * 6,960 lamports (2-year rent exemption)
# Rate: 6,960 lamports per byte for rent exemption
LAMPORTS_PER_BYTE=6960
PROGRAM_RENT=$(echo "scale=4; ($PROGRAM_SIZE + 128) * $LAMPORTS_PER_BYTE / 1000000000" | bc)

echo "1. Program Account Rent (PERMANENT):"
echo "   Size:              $PROGRAM_SIZE bytes"
echo "   Rent rate:         $LAMPORTS_PER_BYTE lamports/byte"
echo "   Formula:           (size + 128) * 6,960 lamports"
echo "   Cost:              ~$PROGRAM_RENT SOL"
echo ""

# Buffer account (for upgradeable programs)
# Buffer is 2x program size during deployment
BUFFER_SIZE=$(echo "$PROGRAM_SIZE * 2" | bc | cut -d. -f1)
BUFFER_RENT=$(echo "scale=4; ($BUFFER_SIZE + 128) * $LAMPORTS_PER_BYTE / 1000000000" | bc)

echo "2. Buffer Account Rent (REFUNDED after deployment):"
echo "   Size:              $BUFFER_SIZE bytes (2x program size)"
echo "   Cost:              ~$BUFFER_RENT SOL"
echo "   Note:              ⚠️  REFUNDED when deployment completes"
echo ""

# IDL account rent
IDL_RENT=$(echo "scale=4; ($IDL_SIZE + 128) * $LAMPORTS_PER_BYTE / 1000000000" | bc)

echo "3. IDL Account Rent (PERMANENT):"
echo "   Size:              $IDL_SIZE bytes"
echo "   Cost:              ~$IDL_RENT SOL"
echo ""

# Transaction fees
# Deployment involves multiple transactions due to 1,232-byte tx size limit
# For 250KB program: ~203 transactions needed
TX_FEE_PER_SIG=0.000005
NUM_CHUNKS=$(echo "scale=0; $PROGRAM_SIZE / 1232 + 5" | bc)  # +5 for overhead txs
TOTAL_TX_FEES=$(echo "scale=6; $TX_FEE_PER_SIG * $NUM_CHUNKS" | bc)

echo "4. Transaction Fees:"
echo "   Fee per tx:        $TX_FEE_PER_SIG SOL (fixed)"
echo "   Transactions:      ~$NUM_CHUNKS (due to 1,232-byte limit)"
echo "   Total fees:        ~$TOTAL_TX_FEES SOL"
echo ""

# Safety buffer for errors/retries
SAFETY_BUFFER=1.50

echo "5. Safety Buffer (errors/retries):"
echo "   Recommended:       $SAFETY_BUFFER SOL"
echo "   Covers:            Failed txs, RPC issues, retries"
echo ""

# Calculate permanent costs (excluding buffer account which is refunded)
PERMANENT_COST=$(echo "scale=4; $PROGRAM_RENT + $IDL_RENT + $TOTAL_TX_FEES + $SAFETY_BUFFER" | bc)

# Calculate total upfront needed (including refundable buffer)
TOTAL_UPFRONT=$(echo "scale=4; $PERMANENT_COST + $BUFFER_RENT" | bc)

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Cost Summary:${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Permanent Costs:      ~$PERMANENT_COST SOL"
echo "  ├─ Program rent:     $PROGRAM_RENT SOL"
echo "  ├─ IDL rent:         $IDL_RENT SOL"
echo "  ├─ Transaction fees: $TOTAL_TX_FEES SOL"
echo "  └─ Safety buffer:    $SAFETY_BUFFER SOL"
echo ""
echo "Buffer Account:       ~$BUFFER_RENT SOL (REFUNDED)"
echo ""
TOTAL=$TOTAL_UPFRONT

echo -e "${GREEN}TOTAL UPFRONT NEEDED:  ~$TOTAL_UPFRONT SOL${NC}"
echo -e "${GREEN}REFUNDED AFTER:        ~$BUFFER_RENT SOL${NC}"
echo -e "${GREEN}PERMANENT COST:        ~$PERMANENT_COST SOL${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Recommendations based on totals
RECOMMENDED_MIN=$(echo "scale=0; $TOTAL_UPFRONT" | bc | cut -d. -f1)
RECOMMENDED_SAFE=$(echo "scale=0; $TOTAL_UPFRONT + 1" | bc | cut -d. -f1)

echo -e "${BLUE}Funding Recommendations:${NC}"
echo ""
echo "Minimum (calculated):  $RECOMMENDED_MIN SOL"
echo "  Just enough for calculated costs"
echo ""
echo "Recommended:           $RECOMMENDED_SAFE SOL"  
echo "  Adds margin for variations"
echo ""
echo "Conservative:          10 SOL"
echo "  Maximum safety for first deployment"
echo ""

# Real-world examples
echo -e "${BLUE}Real-World Examples:${NC}"
echo ""
echo "Program Size → Upfront → Permanent Cost"
echo "─────────────────────────────────────────"
echo "• 50KB:    ~3 SOL  → ~1 SOL permanent"
echo "• 150KB:   ~5 SOL  → ~2 SOL permanent"
echo "• 250KB:   ~7 SOL  → ~3.5 SOL permanent"  
echo "• 500KB:   ~13 SOL → ~7 SOL permanent"
echo ""
PROGRAM_SIZE_KB=$(echo "scale=0; $PROGRAM_SIZE / 1024" | bc)
echo "Your program: ~$PROGRAM_SIZE_KB KB"
echo "  Upfront:   ~$TOTAL_UPFRONT SOL"
echo "  Refunded:  ~$BUFFER_RENT SOL"
echo "  Permanent: ~$PERMANENT_COST SOL"
echo ""

# Additional notes
echo -e "${BLUE}Important Notes:${NC}"
echo ""
echo "1. 💰 Buffer account (~$BUFFER_RENT SOL) is REFUNDED after deployment"
echo "2. 📦 Rent costs are for PERMANENT storage (rent-exempt)"
echo "3. 🔄 Transaction fees are fixed at 0.000005 SOL/tx"
echo "4. 🛡️  Safety buffer covers failed txs and retries"
echo "5. 📊 Actual costs may vary ±5% from estimates"
echo "6. 🎯 This calculator uses accurate Solana rent formulas"
echo ""

# Check current deployer balance if keypair exists
DEPLOYER_KEYPAIR="wallets/production/mainnet-deployer.json"
if [ -f "$DEPLOYER_KEYPAIR" ]; then
    echo -e "${BLUE}Current Deployer Balance:${NC}"
    CURRENT_BALANCE=$(solana balance -k "$DEPLOYER_KEYPAIR" --url mainnet-beta 2>/dev/null | cut -d' ' -f1 || echo "0")
    
    if (( $(echo "$CURRENT_BALANCE >= $TOTAL_UPFRONT" | bc -l) )); then
        echo -e "${GREEN}✓ Balance: $CURRENT_BALANCE SOL (sufficient)${NC}"
        LEFTOVER=$(echo "scale=2; $CURRENT_BALANCE - $PERMANENT_COST" | bc)
        echo "  After deployment: ~$LEFTOVER SOL remaining"
    elif (( $(echo "$CURRENT_BALANCE >= $PERMANENT_COST" | bc -l) )); then
        echo -e "${YELLOW}⚠ Balance: $CURRENT_BALANCE SOL (minimal)${NC}"
        NEEDED=$(echo "scale=2; $TOTAL_UPFRONT - $CURRENT_BALANCE" | bc)
        echo "  Add $NEEDED SOL for recommended upfront amount"
    else
        echo -e "${YELLOW}⚠ Balance: $CURRENT_BALANCE SOL (insufficient)${NC}"
        NEEDED=$(echo "scale=2; $TOTAL_UPFRONT - $CURRENT_BALANCE" | bc)
        echo "  Add $NEEDED SOL to reach upfront requirement"
    fi
    echo ""
fi

echo -e "${GREEN}✓ Cost calculation complete!${NC}"

